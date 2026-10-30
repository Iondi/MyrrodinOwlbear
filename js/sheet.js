// The character sheet window.
import {
  ABILITIES, SKILLS, TIERS, SPELL_LEVELS, HOUSE_RULES,
  derive, fmt, blankCharacter, normalize, abilityMod,
} from "./rules.js?v=1.4.0";
import { roll, d20, plus, isDiceExpression } from "./dice.js?v=1.4.0";
import * as B from "./bridge.js?v=1.4.0";
import { sheetIdFromUrl, syncFromGoogle } from "./gsheet.js?v=1.4.0";
import { loadBestiary, search as searchBestiary, toCharacter, crText } from "./bestiary.js?v=1.4.0";
import { enqueue as playDice } from "./diceanim.js?v=1.4.0";

const params = new URLSearchParams(location.search);
const itemId = params.get("id") || "preview-lyrith";
const app = document.getElementById("app");

let state = null;        // the character being shown
let token = null;        // the Owlbear token it lives on
let self = null;         // who is looking at it
let canEdit = false;
let lastSaved = "";
let pendingRemote = null;
let saveTimer = null;
let privateRolls = false;
let tab = sessionStorage.getItem("myrrodin-tab") || "character";
let deleteArmed = false;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}
const num = (v) => Number(v) || 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function inp(path, { type = "text", cls = "", ph = "", label = "" } = {}) {
  const v = getPath(state, path);
  return `<input class="${cls}" data-path="${path}" data-type="${type}" type="${type === "number" ? "number" : "text"}"
    ${type === "number" ? 'inputmode="numeric"' : ""} value="${esc(v ?? "")}" placeholder="${esc(ph)}" ${label ? `aria-label="${esc(label)}"` : ""} />`;
}
const area = (path, rows = 3, ph = "") =>
  `<textarea data-path="${path}" rows="${rows}" placeholder="${esc(ph)}">${esc(getPath(state, path) ?? "")}</textarea>`;
const chk = (path, label = "", title = "") =>
  `<label class="chk" ${title ? `title="${esc(title)}"` : ""}><input type="checkbox" data-path="${path}" ${getPath(state, path) ? "checked" : ""}/><span>${esc(label)}</span></label>`;
function sel(path, options, cls = "") {
  const v = getPath(state, path);
  return `<select class="${cls}" data-path="${path}">${options.map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
}
const field = (label, html, cls = "") => `<label class="field ${cls}"><span class="field-label">${label}</span>${html}</label>`;
const abilityOptions = ABILITIES.map((a) => [a.key, a.short]);

// ---------------------------------------------------------------------------
// Toasts and rolling
// ---------------------------------------------------------------------------
let diceHostEl = null;
function diceHost() {
  if (!diceHostEl) { diceHostEl = document.createElement("div"); diceHostEl.className = "cd-host"; document.body.appendChild(diceHostEl); }
  return diceHostEl;
}

function toast(html, kind = "") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  box.prepend(el);
  setTimeout(() => el.classList.add("out"), 4200);
  setTimeout(() => el.remove(), 4700);
  while (box.children.length > 4) box.lastChild.remove();
}

function send(label, result, extra = {}) {
  const event = {
    character: state.name, player: self?.name || "", label,
    total: result.total, detail: result.detail,
    crit: !!result.crit, fumble: !!result.fumble, hidden: privateRolls, ...extra,
  };
  if (result.dice?.length) event.dice = result.dice;
  B.broadcastRoll(event).catch(() => {});
  if (event.dice && B.diceAnimOn()) { B.markSheetOpen(); playDice(diceHost(), event); return; }
  const tag = event.crit ? `<b class="crit">Critical!</b>` : event.fumble ? `<b class="fumble">Natural 1</b>` : event.outcome ? `<b class="${event.outcome === "Success" ? "crit" : "fumble"}">${event.outcome}</b>` : "";
  toast(`<div class="toast-top"><span>${esc(label)}</span>${tag}</div><div class="toast-total">${esc(result.total)}</div><div class="toast-detail">${esc(result.detail)}</div>`,
    event.crit || event.outcome === "Success" ? "good" : event.fumble || event.outcome === "Failed" ? "bad" : "");
}

function rollCheck(label, bonus, { advantage = false, autoFail = false } = {}) {
  if (autoFail) {
    send(label, { total: "Fail", detail: "Inept: automatic failure" }, { outcome: "Failed" });
    return;
  }
  send(label + (advantage ? " (adv)" : ""), roll(d20(bonus), { advantage }));
}

// ---------------------------------------------------------------------------
// Derived numbers shown on the page
// ---------------------------------------------------------------------------
function attackBonus(a, d) {
  return d.mods[a.ability || "str"] + (a.proficient && HOUSE_RULES.weaponProficiencyAddsBonus ? d.pb : 0) + num(a.bonus);
}

function calcMap() {
  const d = derive(state);
  const m = { init: fmt(d.initiative), will: fmt(d.will), willsave: fmt(d.willSave), dc: d.spellDC, regenhint: `Int ${num(state.abilities.int)} → ${d.suggestedRegen}`, cast: fmt(d.castMod), pb: fmt(d.pb), combined: d.combinedLevel, xplevel: d.xpLevel };
  ABILITIES.forEach((a) => { m[`mod.${a.key}`] = fmt(d.mods[a.key]); m[`save.${a.key}`] = fmt(d.saves[a.key]); });
  SKILLS.forEach((s) => {
    const sk = d.skills[s.key];
    m[`skill.${s.key}`] = sk.autoFail ? "Fail" : fmt(sk.bonus) + (sk.advantage ? " ⇈" : "");
  });
  state.attacks.forEach((a, i) => {
    const mod = d.mods[a.ability || "str"];
    m[`atk.${i}`] = fmt(attackBonus(a, d));
    m[`dmg.${i}`] = plus(a.damage || "0", mod);
    m[`graze.${i}`] = Math.max(mod, 0);
  });
  m.xphint = d.xpLevel > num(state.level) ? `Enough XP for level ${d.xpLevel}` : `XP level ${d.xpLevel}`;
  return m;
}

function updateCalcs() {
  const m = calcMap();
  app.querySelectorAll("[data-calc]").forEach((el) => {
    const v = m[el.dataset.calc];
    if (v !== undefined) el.textContent = v;
  });
  const bar = (name, cur, max) => {
    const el = app.querySelector(`[data-bar="${name}"]`);
    if (el) el.style.width = `${max > 0 ? clamp((cur / max) * 100, 0, 100) : 0}%`;
  };
  bar("hp", num(state.hp.current), num(state.hp.max));
  bar("mana", num(state.mana.current), num(state.mana.max));
  bar("psi", num(state.psi.current), num(state.psi.max));
  const hpCard = app.querySelector(".vital.hp");
  if (hpCard) hpCard.classList.toggle("low", num(state.hp.current) <= num(state.hp.max) / 4);
}

// ---------------------------------------------------------------------------
// Page sections
// ---------------------------------------------------------------------------
function header() {
  const initials = (state.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `
  <header class="hero">
    <div class="portrait">${token?.image ? `<img src="${esc(token.image)}" alt="" />` : `<span>${esc(initials)}</span>`}</div>
    <div class="identity">
      ${inp("name", { cls: "name-input", ph: "Character name", label: "Character name" })}
      <div class="subline">
        <span class="pill">Lv <b data-calc="combined"></b></span>
        <span>${esc([state.race, state.class].filter(Boolean).join(" · ") || "Set race and class in Character")}</span>
      </div>
    </div>
    <div class="hero-actions">
      <span class="save-state" id="save-state">${canEdit ? "Saved" : "View only"}</span>
      ${state.googleSheet?.id ? `<button class="ghost gs-badge ${state.googleSheet.lastError ? "bad" : ""}" data-action="gsync" ${canEdit ? "" : "disabled"} title="${esc(state.googleSheet.lastError || `Linked to Google Sheets. Last synced ${ago(state.googleSheet.lastSync)}.`)}"><span class="gs-dot"></span>${syncing ? "Syncing…" : "Google Sheet"}</button>` : ""}
      <label class="chk private" title="Only you and the GM see your rolls"><input type="checkbox" data-local="private" ${privateRolls ? "checked" : ""}/><span>Private rolls</span></label>
      ${canEdit ? `<button class="ghost" data-action="longrest" title="Restore HP, mana and psi">Long rest</button>` : ""}
      ${B.inOBR ? `<button class="ghost icon" data-action="close" title="Close">✕</button>` : ""}
    </div>
  </header>`;
}

function vitals() {
  return `
  <section class="vitals">
    <div class="vital hp">
      <div class="vital-head"><span>Hit Points</span><span class="muted">temp ${inp("hp.temp", { type: "number", cls: "tiny", label: "Temporary HP" })}</span></div>
      <div class="pool">${inp("hp.current", { type: "number", cls: "big", label: "Current HP" })}<span class="of">/</span>${inp("hp.max", { type: "number", cls: "mid", label: "Max HP" })}</div>
      <div class="bar"><div data-bar="hp"></div></div>
      ${canEdit ? `<div class="hp-tools"><input id="hp-amount" type="number" inputmode="numeric" placeholder="0" aria-label="Amount" />
        <button class="danger" data-action="damage">Damage</button><button class="good" data-action="heal">Heal</button></div>` : ""}
    </div>
    <div class="vital mana">
      <div class="vital-head"><span>Mana</span><span class="muted">regen ${inp("mana.regen", { cls: "tiny", label: "Mana regen" })}</span></div>
      <div class="pool">${inp("mana.current", { type: "number", cls: "big", label: "Current mana" })}<span class="of">/</span>${inp("mana.max", { type: "number", cls: "mid", label: "Max mana" })}</div>
      <div class="bar"><div data-bar="mana"></div></div>
      ${canEdit ? `<div class="hp-tools"><button class="ghost" data-action="regen">Regenerate mana</button></div>` : ""}
    </div>
    <div class="vital psi">
      <div class="vital-head"><span>Psi Points</span></div>
      <div class="pool">${inp("psi.current", { type: "number", cls: "big", label: "Current psi" })}<span class="of">/</span>${inp("psi.max", { type: "number", cls: "mid", label: "Max psi" })}</div>
      <div class="bar"><div data-bar="psi"></div></div>
    </div>
    <div class="stat-grid">
      <div class="stat">${inp("ac", { type: "number", cls: "stat-input", label: "Armor Class" })}<span>Armor Class</span></div>
      <button class="stat roll" data-roll="init"><b data-calc="init"></b><span>Initiative</span></button>
      <button class="stat roll" data-roll="will"><b data-calc="will"></b><span>Will Check</span></button>
      <div class="stat"><b data-calc="dc"></b><span>Spell Save DC</span></div>
      <div class="stat">${inp("speed", { cls: "stat-input", label: "Speed" })}<span>Speed</span></div>
      <div class="stat"><b data-calc="pb"></b><span>Proficiency</span></div>
    </div>
  </section>`;
}

const TABS = [
  ["character", "Character"], ["skills", "Skills"], ["combat", "Combat"],
  ["magic", "Magic & Psionics"], ["gear", "Gear & Story"], ["settings", "Sheet"],
];
const tabsNav = () => `<nav class="tabs" role="tablist">${TABS.map(([id, label]) =>
  `<button role="tab" class="${tab === id ? "active" : ""}" aria-selected="${tab === id}" data-action="tab:${id}">${label}</button>`).join("")}</nav>`;

function stringList(path, title, ph) {
  const list = getPath(state, path) || [];
  return `<div class="panel"><div class="panel-head"><h3>${title}</h3>${canEdit ? `<button class="add" data-action="addstr:${path}">+ Add</button>` : ""}</div>
    ${list.length ? `<ul class="plain-list">${list.map((_, i) => `<li>${inp(`${path}.${i}`, { ph })}${canEdit ? `<button class="x" data-action="del:${path}.${i}" title="Remove">✕</button>` : ""}</li>`).join("")}</ul>` : `<p class="empty">Nothing yet.</p>`}
  </div>`;
}

function tabCharacter() {
  const abilities = ABILITIES.map((a) => `
    <div class="ability">
      <div class="ability-name">${a.short}</div>
      <button class="ability-mod roll" data-roll="ability:${a.key}" title="Roll ${a.name} check"><b data-calc="mod.${a.key}"></b></button>
      ${inp(`abilities.${a.key}`, { type: "number", cls: "score", label: `${a.name} score` })}
      <div class="save-row">
        <label class="chk" title="Proficient in ${a.name} saves"><input type="checkbox" data-path="saves.${a.key}" ${state.saves[a.key] ? "checked" : ""}/><span></span></label>
        <button class="link roll" data-roll="save:${a.key}">Save <b data-calc="save.${a.key}"></b></button>
      </div>
    </div>`).join("");

  const combat = state.combat.map((step, i) => `
    <li class="${step.done ? "done" : ""}">
      <span class="step-n">${i + 1}</span>
      <label class="chk"><input type="checkbox" data-path="combat.${i}.done" data-rerender="1" ${step.done ? "checked" : ""}/><span></span></label>
      ${inp(`combat.${i}.text`, { ph: "e.g. Rage, then attack with advantage" })}
      ${canEdit ? `<span class="row-tools"><button class="x" data-action="up:${i}" title="Move up">↑</button><button class="x" data-action="down:${i}" title="Move down">↓</button><button class="x" data-action="del:combat.${i}" title="Remove">✕</button></span>` : ""}
    </li>`).join("");

  return `
    <div class="grid-2">
      <div class="panel span-2">
        <div class="panel-head"><h3>Identity</h3></div>
        <div class="fields">
          ${field("Player", inp("player"))}
          ${field("Class", inp("class"))}
          ${field("Race", inp("race"))}
          ${field("Lineage", inp("lineage"))}
          ${field("Background", inp("background"))}
          ${field("Level", inp("level", { type: "number" }), "narrow")}
          ${field("2nd Level", inp("level2", { type: "number" }), "narrow")}
          ${field("Proficiency", inp("profBonus", { type: "number" }), "narrow")}
          ${field(`Experience <em class="hint" data-calc="xphint"></em>`, inp("xp", { type: "number" }))}
          ${field("Speed notes", inp("speedNotes", { ph: "e.g. Levitation" }))}
        </div>
      </div>
      <div class="panel span-2">
        <div class="panel-head"><h3>Abilities</h3><span class="head-tools"><span class="muted small">Click a modifier to roll a check, or Save to roll a saving throw.</span><button class="roll small" data-roll="willsave" title="Int + Wis, plus proficiency if proficient in both Int and Wis saves (half if only one)">Will save <b data-calc="willsave"></b></button></span></div>
        <div class="abilities">${abilities}</div>
      </div>
      <div class="panel span-2 combat-helper">
        <div class="panel-head"><h3>Super Awesome Fast Combat Helper</h3>
          <span class="head-tools">${canEdit ? `<button class="ghost" data-action="resetturn">New turn</button><button class="add" data-action="addcombat">+ Add step</button>` : ""}</span></div>
        <p class="muted small">Put your skills and feats in the order you use them in a fight. Tick them off as you go.</p>
        ${state.combat.length ? `<ol class="steps">${combat}</ol>` : `<p class="empty">No steps yet.</p>`}
      </div>
      ${stringList("features", "Skills & Abilities", "e.g. Darkvision")}
      ${stringList("feats", "Feats", "e.g. Tough")}
    </div>`;
}

function tabSkills() {
  const tierOpts = TIERS.map((t) => [t.id, t.label]);
  const groups = ABILITIES.map((a) => {
    const rows = SKILLS.filter((s) => s.ability === a.key).map((s) => {
      const tier = state.skills[s.key]?.tier || "none";
      return `<div class="skill tier-${tier}">
        ${sel(`skills.${s.key}.tier`, tierOpts, "tier-select")}
        <span class="skill-name">${s.name}</span>
        <span class="misc" title="Extra bonus">${inp(`skills.${s.key}.misc`, { type: "number", cls: "tiny", ph: "0", label: `${s.name} extra bonus` })}</span>
        <button class="skill-roll roll" data-roll="skill:${s.key}"><b data-calc="skill.${s.key}"></b></button>
      </div>`;
    }).join("");
    return `<div class="panel skill-group"><div class="panel-head"><h3>${a.name}</h3><span class="pill" data-calc="mod.${a.key}"></span></div>${rows}</div>`;
  }).join("");
  const legend = TIERS.slice(1).map((t) => {
    const mult = HOUSE_RULES.tierMultiplier[t.id];
    const desc = t.id === "inept" ? "automatic fail" : t.id === "master" ? `+${mult * num(state.profBonus)}, advantage` : `+${mult * num(state.profBonus)}`;
    return `<span class="tier-chip tier-${t.id}">${t.label}: ${desc}</span>`;
  }).join("");
  return `<div class="legend">${legend}<span class="muted small">Small box = extra bonus from items or feats.</span></div><div class="skill-grid">${groups}</div>`;
}

function tabCombat() {
  const cards = state.attacks.map((a, i) => `
    <div class="card attack ${a.equipped ? "" : "unequipped"}">
      <div class="card-head">
        ${inp(`attacks.${i}.name`, { cls: "card-title", ph: "Weapon name", label: "Weapon name" })}
        ${chk(`attacks.${i}.equipped`, "Equipped")}
        ${canEdit ? `<button class="x" data-action="del:attacks.${i}" title="Remove">✕</button>` : ""}
      </div>
      <div class="fields compact">
        ${field("Range", inp(`attacks.${i}.range`, { ph: "5 ft" }), "narrow")}
        ${field("Uses", sel(`attacks.${i}.ability`, abilityOptions), "narrow")}
        ${field("Damage dice", inp(`attacks.${i}.damage`, { ph: "1d8" }), "narrow")}
        ${field("Damage type", inp(`attacks.${i}.damageType`, { ph: "Slashing" }), "narrow")}
        ${field("Extra to-hit", inp(`attacks.${i}.bonus`, { type: "number", ph: "0" }), "narrow")}
      </div>
      <div class="card-flags">${chk(`attacks.${i}.proficient`, "Proficient")}${chk(`attacks.${i}.graze`, "Graze on miss", "If the attack misses, the ability modifier still hits")}</div>
      ${field("Notes", inp(`attacks.${i}.notes`, { ph: "Cursed, two-handed…" }))}
      <div class="roll-row">
        <button class="primary roll" data-roll="atk:${i}">Attack <b data-calc="atk.${i}"></b></button>
        <button class="roll" data-roll="dmg:${i}">Damage <b data-calc="dmg.${i}"></b></button>
        ${a.graze ? `<button class="roll" data-roll="graze:${i}">Graze <b data-calc="graze.${i}"></b></button>` : ""}
      </div>
    </div>`).join("");
  return `
    <div class="panel-head bare"><h3>Weapons & Attacks</h3>${canEdit ? `<button class="add" data-action="addattack">+ Add weapon</button>` : ""}</div>
    ${cards ? `<div class="cards">${cards}</div>` : `<p class="empty">No weapons yet.</p>`}
    <div class="panel"><div class="panel-head"><h3>Attack bonuses & notes</h3></div>${area("attackNotes", 4, "Breath weapon, special attacks, reminders…")}</div>`;
}

function tabMagic() {
  const spells = state.magic.spells.map((s, i) => ({ s, i })).sort((a, b) => num(a.s.level) - num(b.s.level) || a.i - b.i);
  let lastLevel = null;
  const spellHtml = spells.map(({ s, i }) => {
    const lvl = SPELL_LEVELS[num(s.level)] || SPELL_LEVELS[0];
    const heading = lastLevel !== lvl.level ? `<h4 class="level-head">${lvl.level === 0 ? "Cantrips" : `${lvl.label} level`}</h4>` : "";
    lastLevel = lvl.level;
    return `${heading}
    <div class="card spell ${s.learned ? "" : "unlearned"}">
      <div class="card-head">
        ${inp(`magic.spells.${i}.name`, { cls: "card-title", ph: "Spell name", label: "Spell name" })}
        <span class="badge">${lvl.label}</span>
        ${chk(`magic.spells.${i}.learned`, "Learned")}
        ${canEdit ? `<button class="x" data-action="del:magic.spells.${i}" title="Remove">✕</button>` : ""}
      </div>
      <div class="fields compact">
        ${field("Type / school", inp(`magic.spells.${i}.type`, { ph: "Evocation" }), "narrow")}
        ${field("Casting time", inp(`magic.spells.${i}.castTime`, { ph: "1 Action" }), "narrow")}
        ${field("Range", inp(`magic.spells.${i}.range`, { ph: "60 ft" }), "narrow")}
        ${field("Damage", inp(`magic.spells.${i}.damage`, { ph: "2d6" }), "narrow")}
        ${field("Damage type", inp(`magic.spells.${i}.damageType`, { ph: "Fire" }), "narrow")}
        ${field("Saving throw", inp(`magic.spells.${i}.save`, { ph: "Dex" }), "narrow")}
        ${field("Mana cost", inp(`magic.spells.${i}.mana`, { type: "number" }), "narrow")}
        ${field("DC to cast", inp(`magic.spells.${i}.dc`, { type: "number" }), "narrow")}
        ${field("Duration", inp(`magic.spells.${i}.duration`, { ph: "Instantaneous" }), "narrow")}
        ${field("Condition", inp(`magic.spells.${i}.condition`, { ph: "Burning" }), "narrow")}
      </div>
      <div class="card-flags">${chk(`magic.spells.${i}.amplifiable`, "Amplifiable")}${chk(`magic.spells.${i}.concentration`, "Concentration")}</div>
      <div class="roll-row">
        <button class="primary roll" data-roll="cast:${i}">Cast <b>${num(s.mana)} mana</b></button>
        ${isDiceExpression(s.damage) ? `<button class="roll" data-roll="spelldmg:${i}">Damage <b>${esc(s.damage)}</b></button>` : ""}
      </div>
    </div>`;
  }).join("");

  const powers = state.psionics.map((p, i) => `
    <div class="card power ${p.learned ? "" : "unlearned"}">
      <div class="card-head">
        ${inp(`psionics.${i}.name`, { cls: "card-title", ph: p.type || "Power name", label: "Power name" })}
        ${chk(`psionics.${i}.learned`, "Learned")}
        ${canEdit ? `<button class="x" data-action="del:psionics.${i}" title="Remove">✕</button>` : ""}
      </div>
      <div class="fields compact">
        ${field("Type", inp(`psionics.${i}.type`, { ph: "Telekinetic" }), "narrow")}
        ${field("Casting time", inp(`psionics.${i}.castTime`, { ph: "1 Action" }), "narrow")}
        ${field("Range", inp(`psionics.${i}.range`, { ph: "60 ft" }), "narrow")}
        ${field("Psi cost", inp(`psionics.${i}.cost`, { type: "number" }), "narrow")}
        ${field("Damage", inp(`psionics.${i}.damage`, { ph: "1d10" }), "narrow")}
        ${field("Duration", inp(`psionics.${i}.duration`, { ph: "Instantaneous" }), "narrow")}
        ${field("Target save", inp(`psionics.${i}.save`, { ph: "Strength" }), "narrow")}
      </div>
      <div class="roll-row"><button class="primary roll" data-roll="psi:${i}">Use <b>${num(p.cost)} psi</b>${isDiceExpression(p.damage) ? ` · ${esc(p.damage)}` : ""}</button></div>
    </div>`).join("");

  return `
    <div class="panel">
      <div class="panel-head"><h3>Spellcasting</h3></div>
      <div class="fields">
        ${field("Casting ability", sel("magic.ability", abilityOptions), "narrow")}
        <div class="field narrow"><span class="field-label">Cast roll</span><span class="readout">d20 <b data-calc="cast"></b></span></div>
        <div class="field narrow"><span class="field-label">Spell save DC</span><span class="readout"><b data-calc="dc"></b></span></div>
        ${field("Extra DC bonus", inp("spellDCMisc", { type: "number", ph: "0" }), "narrow")}
        <div class="field narrow"><span class="field-label">Suggested regen</span><span class="readout" data-calc="regenhint"></span></div>
      </div>
      <p class="muted small">Spell save DC = 8 + proficiency + casting modifier. Casting a spell = 1d20 + casting modifier + proficiency, against the spell's DC to cast. Mana is spent ${HOUSE_RULES.manaSpentOnFailedCast ? "whether or not the cast succeeds" : "only when the cast succeeds"}.</p>
      ${canEdit ? `<div class="add-row"><span class="muted small">Add a spell:</span>${SPELL_LEVELS.map((l) => `<button class="add chip" data-action="addspell:${l.level}">${l.label}</button>`).join("")}</div>` : ""}
    </div>
    ${spellHtml ? `<div class="cards">${spellHtml}</div>` : `<p class="empty">No spells yet.</p>`}
    <div class="panel-head bare"><h3>Psionics</h3>${canEdit ? `<button class="add" data-action="addpower">+ Add power</button>` : ""}</div>
    ${powers ? `<div class="cards">${powers}</div>` : `<p class="empty">No psionic powers yet.</p>`}`;
}

function tabGear() {
  const coins = ["cp", "sp", "ep", "gp", "pp"].map((c) => field(c.toUpperCase(), inp(`money.${c}`, { type: "number" }), "coin")).join("");
  const items = state.equipment.map((e, i) => `<li>
      ${inp(`equipment.${i}.name`, { ph: "Item" })}
      ${inp(`equipment.${i}.qty`, { type: "number", cls: "qty", label: "Quantity" })}
      ${inp(`equipment.${i}.notes`, { ph: "Notes" })}
      ${canEdit ? `<button class="x" data-action="del:equipment.${i}" title="Remove">✕</button>` : ""}
    </li>`).join("");
  return `
    <div class="grid-2">
      <div class="panel span-2"><div class="panel-head"><h3>Money</h3></div><div class="fields coins">${coins}</div></div>
      <div class="panel span-2">
        <div class="panel-head"><h3>Equipment</h3>${canEdit ? `<button class="add" data-action="additem">+ Add item</button>` : ""}</div>
        ${items ? `<ul class="plain-list gear-list">${items}</ul>` : `<p class="empty">Nothing in the pack yet.</p>`}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Proficiencies</h3></div>
        ${field("Languages", inp("languages", { ph: "Common, Dwarvish…" }))}
        ${field("Weapons", inp("weaponProfs"))}
        ${field("Armor", inp("armorProfs"))}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Story</h3></div>
        ${field("Background blurb", area("blurb", 3))}
        ${field("Goal", area("goal", 2))}
      </div>
      <div class="panel span-2"><div class="panel-head"><h3>Notes</h3></div>${area("notes", 6, "Anything else worth remembering…")}</div>
    </div>`;
}

function tabSettings() {
  const isGM = self.role === "GM";
  const size = new Blob([JSON.stringify(state)]).size;
  const ownerOpts = [["", "Anyone in the room"], ...(window.__players || []).map((p) => [p.id, p.name])];
  if (state.ownerId && !ownerOpts.some(([id]) => id === state.ownerId)) ownerOpts.push([state.ownerId, "A player who isn't here right now"]);
  return `
    <div class="grid-2">
      ${googlePanel()}
      ${isGM ? `<div class="panel">
        <div class="panel-head"><h3>Who can edit</h3></div>
        ${field("Owner", sel("ownerId", ownerOpts))}
        <p class="muted small">Only the owner and the GM can change this sheet. Everyone else can view it and roll from it.</p>
        ${chk("gmOnly", "Hide this sheet from players (for NPCs and monsters)")}
      </div>` : ""}
      <div class="panel">
        <div class="panel-head"><h3>Backup & sharing</h3></div>
        <p class="muted small">Save your character as a file-friendly text block, or load one in. Sheets live on the token, so back up before deleting a token or a scene.</p>
        <div class="roll-row">
          <button data-action="export">Export character</button>
          ${canEdit ? `<button data-action="import">Import character</button>` : ""}
        </div>
        <p class="muted small">Sheet size: ${(size / 1024).toFixed(1)} KB${size > 12000 ? ` <b class="warn-text">— getting large; trim long notes if saves start failing.</b>` : ""}</p>
      </div>
      ${canEdit ? `<div class="panel">
        <div class="panel-head"><h3>Remove sheet</h3></div>
        <p class="muted small">Takes the sheet off this token. Export first if you want to keep it.</p>
        <button class="danger" data-action="deletesheet">${deleteArmed ? "Click again to delete" : "Delete sheet"}</button>
      </div>` : ""}
    </div>`;
}

function ago(t) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(t).toLocaleDateString();
}

function googlePanel() {
  const g = state.googleSheet || {};
  if (!g.id) {
    return `<div class="panel span-2 gs-panel">
      <div class="panel-head"><h3>Google Sheet</h3></div>
      <p class="muted small">Link this character's Google Sheet and Owlbear keeps it up to date. Stats, skills, spells, weapons and gear come from the sheet. In Google Sheets, click <b>Share</b> and set General access to <b>Anyone with the link</b> (Viewer) first.</p>
      ${canEdit ? `<div class="gs-link"><input id="gs-url" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheet link" /><button class="primary" data-action="glink">Link & sync</button></div>` : `<p class="empty">Not linked.</p>`}
    </div>`;
  }
  const missing = (g.missing || []).length
    ? `<p class="small warn-text">Couldn't find on the sheet: ${esc(g.missing.join(", "))}. Those stay as they are here.</p>` : "";
  return `<div class="panel span-2 gs-panel">
    <div class="panel-head"><h3>Google Sheet</h3>${canEdit ? `<span class="head-tools"><button data-action="gsync">${syncing ? "Syncing…" : "Sync now"}</button><button class="link" data-action="gunlink">Unlink</button></span>` : ""}</div>
    <p class="small"><a href="${esc(g.url || `https://docs.google.com/spreadsheets/d/${g.id}`)}" target="_blank" rel="noopener">Open the Google Sheet ↗</a> <span class="muted">· last synced ${ago(g.lastSync)}</span></p>
    ${g.lastError ? `<p class="small warn-text">${esc(g.lastError)}</p>` : ""}
    ${missing}
    ${chk("googleSheet.auto", "Keep syncing automatically (about once a minute while the GM is in the room)")}
    <p class="muted small">Edit stats in the Google Sheet; changes made here to synced fields get replaced on the next sync. Current HP, mana and psi used in play stay here, unless the Google Sheet's own Current HP or Mana Used changes.</p>
  </div>`;
}

let syncing = false;
async function syncNow(quiet = false) {
  if (!state?.googleSheet?.id || syncing || !canEdit) return;
  syncing = true;
  render();
  try {
    const next = await syncFromGoogle(normalize(state));
    state = normalize(next);
    if (!quiet) toast(`Synced from Google Sheets.${state.googleSheet.missing?.length ? ` ${state.googleSheet.missing.length} field(s) not found.` : ""}`, "good");
  } catch (err) {
    console.error("[Myr'rodin] sync failed", err);
    state.googleSheet = { ...state.googleSheet, lastError: err.message || "Sync failed." };
    if (!quiet) toast(esc(state.googleSheet.lastError), "bad");
  }
  syncing = false;
  render();
  await saveNow();
}

const TAB_RENDER = { character: tabCharacter, skills: tabSkills, combat: tabCombat, magic: tabMagic, gear: tabGear, settings: tabSettings };

function render() {
  const body = app.querySelector(".tab-body");
  const scroll = body ? body.scrollTop : 0;
  app.innerHTML = `${header()}${vitals()}${tabsNav()}<main class="tab-body">${(TAB_RENDER[tab] || tabCharacter)()}</main>`;
  updateCalcs();
  if (!canEdit) app.querySelectorAll("[data-path]").forEach((el) => { el.disabled = true; });
  const nb = app.querySelector(".tab-body");
  if (nb) nb.scrollTop = scroll;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
function setSaveState(text, cls = "") {
  const el = document.getElementById("save-state");
  if (el) { el.textContent = text; el.className = `save-state ${cls}`; }
}

function scheduleSave() {
  if (!canEdit) return;
  setSaveState("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 450);
}

async function saveNow() {
  clearTimeout(saveTimer);
  const json = JSON.stringify(state);
  if (json === lastSaved) { setSaveState("Saved"); return; }
  try {
    await B.saveSheet(itemId, JSON.parse(json));
    lastSaved = json;
    setSaveState("Saved");
  } catch (err) {
    console.error(err);
    setSaveState("Not saved", "bad");
    toast("Couldn't save. Owlbear may not let players edit this token. The GM can check the room's player permissions for characters.", "bad");
  }
}

function commit() { render(); scheduleSave(); }

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
function onEdit(e) {
  const el = e.target;
  if (el.dataset?.local === "private") { privateRolls = el.checked; return; }
  if (!el.dataset?.path || !canEdit) return;
  let v;
  if (el.type === "checkbox") v = el.checked;
  else if (el.dataset.type === "number") v = el.value === "" ? 0 : Number(el.value);
  else v = el.value;
  setPath(state, el.dataset.path, v);
  if (el.dataset.path.endsWith(".tier")) el.closest(".skill").className = `skill tier-${v}`;
  if (el.dataset.rerender) render();
  else updateCalcs();
  scheduleSave();
}
app.addEventListener("input", onEdit);
app.addEventListener("change", onEdit);

app.addEventListener("focusout", () => {
  setTimeout(() => {
    if (pendingRemote && !app.contains(document.activeElement)) applyRemote(pendingRemote);
  }, 50);
});

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
app.addEventListener("click", async (e) => {
  const rollBtn = e.target.closest("[data-roll]");
  if (rollBtn) { doRoll(rollBtn.dataset.roll); return; }
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const [action, arg] = btn.dataset.action.split(/:(.+)/);
  if (action !== "deletesheet") deleteArmed = false;

  switch (action) {
    case "tab": tab = arg; sessionStorage.setItem("myrrodin-tab", tab); render(); app.querySelector(".tab-body").scrollTop = 0; break;
    case "close": await saveNow(); B.closeSheet(); break;
    case "addstr": getPath(state, arg).push(""); commit(); focusLast(`[data-path^="${arg}."]`); break;
    case "addcombat": state.combat.push({ text: "", done: false }); commit(); focusLast('[data-path$=".text"]'); break;
    case "addattack": state.attacks.push({ name: "", range: "5 ft", ability: "str", damage: "1d8", damageType: "", proficient: true, equipped: true, graze: false, bonus: 0, notes: "" }); commit(); break;
    case "addspell": {
      const lvl = SPELL_LEVELS[num(arg)];
      state.magic.spells.push({ level: lvl.level, name: "", type: "", castTime: "1 Action", range: "", damage: "", damageType: "", save: "", mana: lvl.mana, dc: lvl.dc, duration: "", condition: "", amplifiable: false, concentration: false, learned: true });
      commit(); break;
    }
    case "addpower": state.psionics.push({ name: "", type: "", castTime: "1 Action", range: "", cost: 1, damage: "", duration: "Instantaneous", save: "", learned: true }); commit(); break;
    case "additem": state.equipment.push({ name: "", qty: 1, notes: "" }); commit(); focusLast('[data-path^="equipment."][data-path$=".name"]'); break;
    case "del": {
      const parts = arg.split(".");
      const index = Number(parts.pop());
      getPath(state, parts.join(".")).splice(index, 1);
      commit(); break;
    }
    case "up": case "down": {
      const i = Number(arg), j = action === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= state.combat.length) break;
      [state.combat[i], state.combat[j]] = [state.combat[j], state.combat[i]];
      commit(); break;
    }
    case "resetturn": state.combat.forEach((s) => { s.done = false; }); commit(); break;
    case "damage": case "heal": {
      const amt = Math.abs(num(document.getElementById("hp-amount")?.value));
      if (!amt) { toast("Type an amount first."); break; }
      if (action === "damage") {
        let left = amt;
        const fromTemp = Math.min(num(state.hp.temp), left);
        state.hp.temp = num(state.hp.temp) - fromTemp; left -= fromTemp;
        state.hp.current = Math.max(0, num(state.hp.current) - left);
        toast(`Took <b>${amt}</b> damage${fromTemp ? ` (${fromTemp} from temp HP)` : ""}.`, "bad");
      } else {
        state.hp.current = Math.min(num(state.hp.max), num(state.hp.current) + amt);
        toast(`Healed <b>${amt}</b>.`, "good");
      }
      commit(); break;
    }
    case "regen": {
      const r = roll(state.mana.regen || "0");
      const before = num(state.mana.current);
      state.mana.current = Math.min(num(state.mana.max), before + r.total);
      send("Mana regen", r);
      commit(); break;
    }
    case "longrest":
      state.hp.current = num(state.hp.max); state.hp.temp = 0;
      state.mana.current = num(state.mana.max); state.psi.current = num(state.psi.max);
      state.combat.forEach((s) => { s.done = false; });
      toast("Long rest taken: HP, mana and psi restored.", "good");
      commit(); break;
    case "export": showExport(); break;
    case "gsync": syncNow(false); break;
    case "glink": {
      const url = document.getElementById("gs-url")?.value.trim();
      const id = sheetIdFromUrl(url);
      if (!id) { toast("That doesn't look like a Google Sheets link.", "bad"); break; }
      state.googleSheet = { id, url, auto: true, lastSync: 0 };
      await syncNow(false);
      break;
    }
    case "gunlink":
      delete state.googleSheet;
      toast("Unlinked. The sheet keeps its current numbers.");
      commit(); break;
    case "import": showImport(false); break;
    case "deletesheet":
      if (!deleteArmed) { deleteArmed = true; render(); break; }
      deleteArmed = false;
      await B.deleteSheet(itemId);
      lastSaved = "";
      if (B.inOBR) B.closeSheet(); else location.reload();
      break;
  }
});

function focusLast(selector) {
  const all = app.querySelectorAll(selector);
  all[all.length - 1]?.focus();
}

function doRoll(what) {
  const d = derive(state);
  const [kind, key] = what.split(":");
  const idx = Number(key);
  switch (kind) {
    case "init": rollCheck("Initiative", d.initiative); break;
    case "will": rollCheck("Will Check", d.will); break;
    case "willsave": rollCheck("Will save", d.willSave); break;
    case "ability": rollCheck(`${ABILITIES.find((a) => a.key === key).name} check`, d.mods[key]); break;
    case "save": rollCheck(`${ABILITIES.find((a) => a.key === key).name} save`, d.saves[key]); break;
    case "skill": {
      const s = SKILLS.find((x) => x.key === key), sk = d.skills[key];
      rollCheck(s.name, sk.bonus, { advantage: sk.advantage, autoFail: sk.autoFail });
      break;
    }
    case "atk": {
      const a = state.attacks[idx];
      send(`${a.name || "Attack"} — to hit`, roll(d20(attackBonus(a, d))));
      break;
    }
    case "dmg": {
      const a = state.attacks[idx];
      send(`${a.name || "Attack"} — damage${a.damageType ? ` (${a.damageType})` : ""}`, roll(plus(a.damage || "0", d.mods[a.ability || "str"])));
      break;
    }
    case "graze": {
      const a = state.attacks[idx];
      const n = Math.max(d.mods[a.ability || "str"], 0);
      send(`${a.name || "Attack"} — graze`, { total: n, detail: `${(a.ability || "str").toUpperCase()} modifier on a miss` });
      break;
    }
    case "cast": castSpell(idx, d); break;
    case "spelldmg": {
      const s = state.magic.spells[idx];
      send(`${s.name || "Spell"} — damage${s.damageType ? ` (${s.damageType})` : ""}`, roll(s.damage));
      break;
    }
    case "psi": usePower(idx); break;
  }
}

function castSpell(i, d) {
  const s = state.magic.spells[i];
  const cost = num(s.mana), dc = num(s.dc), name = s.name || "a spell";
  if (cost > num(state.mana.current)) {
    toast(`Not enough mana for ${esc(name)}: needs ${cost}, you have ${num(state.mana.current)}.`, "bad");
    return;
  }
  if (num(s.level) === 0 || dc === 0) {
    state.mana.current = num(state.mana.current) - cost;
    if (isDiceExpression(s.damage)) send(`${name} — damage`, roll(s.damage));
    else send(`Cast ${name}`, { total: "✓", detail: "No roll needed" });
    commit();
    return;
  }
  const r = roll(d20(d.castMod));
  const ok = r.total >= dc;
  send(`Cast ${name} (DC ${dc})`, r, { outcome: ok ? "Success" : "Failed" });
  if (ok || HOUSE_RULES.manaSpentOnFailedCast) state.mana.current = num(state.mana.current) - cost;
  if (ok && isDiceExpression(s.damage)) setTimeout(() => send(`${name} — damage${s.damageType ? ` (${s.damageType})` : ""}`, roll(s.damage)), 350);
  commit();
}

function usePower(i) {
  const p = state.psionics[i];
  const cost = num(p.cost), name = p.name || p.type || "a psionic power";
  if (cost > num(state.psi.current)) {
    toast(`Not enough psi for ${esc(name)}: needs ${cost}, you have ${num(state.psi.current)}.`, "bad");
    return;
  }
  state.psi.current = num(state.psi.current) - cost;
  if (isDiceExpression(p.damage)) send(`${name}${p.save ? ` (${p.save} save)` : ""}`, roll(p.damage));
  else send(`Uses ${name}`, { total: `−${cost} psi`, detail: p.save ? `Target makes a ${p.save} save` : "No dice" });
  commit();
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------
function overlay(html) {
  const el = document.createElement("div");
  el.className = "overlay";
  el.innerHTML = `<div class="dialog">${html}</div>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-close]")) el.remove(); });
  return el;
}

function showExport() {
  const json = JSON.stringify({ ...state, ownerId: "" }, null, 2);
  const fileName = `${(state.name || "character").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
  const href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const el = overlay(`
    <h3>Export ${esc(state.name)}</h3>
    <p class="muted small">Copy this text and keep it somewhere safe (a note, a Discord message, a .json file). Import it on any token to bring the character back.</p>
    <textarea class="code" rows="14" readonly>${esc(json)}</textarea>
    <div class="roll-row"><button class="primary" data-copy>Copy</button><a class="button" href="${href}" download="${esc(fileName)}">Download file</a><button data-close>Close</button></div>`);
  const ta = el.querySelector("textarea");
  el.querySelector("[data-copy]").addEventListener("click", async () => {
    ta.select();
    try { await navigator.clipboard.writeText(json); toast("Copied.", "good"); }
    catch { document.execCommand?.("copy"); toast("Selected. Press Ctrl+C (Cmd+C on Mac) to copy."); }
  });
}

function showImport(creating) {
  const el = overlay(`
    <h3>${creating ? "Load a character" : "Import character"}</h3>
    <p class="muted small">Paste a Myr'rodin character (from Export), or choose a .json file.${creating ? "" : " This replaces what's on this sheet."}</p>
    <textarea class="code" rows="12" placeholder='{ "system": "myrrodin", ... }'></textarea>
    <input type="file" accept=".json,application/json" />
    <div class="roll-row"><button class="primary" data-load>Load</button><button data-close>Cancel</button></div>`);
  const ta = el.querySelector("textarea");
  el.querySelector('input[type="file"]').addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (f) ta.value = await f.text();
  });
  el.querySelector("[data-load]").addEventListener("click", async () => {
    let data;
    try { data = JSON.parse(ta.value); } catch { toast("That doesn't look like a character file. Check that you copied all of it.", "bad"); return; }
    if (data.system && data.system !== "myrrodin") { toast("That file is from a different system.", "bad"); return; }
    const keepOwner = state?.ownerId ?? (self.role === "GM" ? "" : self.id);
    state = normalize({ ...data, ownerId: keepOwner, gmOnly: state?.gmOnly ?? false });
    el.remove();
    canEdit = computeCanEdit();
    render();
    await saveNow();
    toast(`Loaded ${esc(state.name)}.`, "good");
  });
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
function computeCanEdit() {
  if (!B.inOBR || self.role === "GM") return true;
  return !state.ownerId || state.ownerId === self.id;
}

// If the token gets renamed in Owlbear, rename the sheet too, as long as
// the sheet's name still matches the token's old name (so a name you typed
// on the sheet yourself is never overwritten). Google-linked sheets keep
// the Google Sheet's name.
function followTokenName() {
  if (!state || !canEdit || !token?.name || state.googleSheet?.id) return false;
  const label = token.name;
  if (label === state.name) { if (state.tokenName !== label) { state.tokenName = label; return true; } return false; }
  const old = state.tokenName || token.imageName || "";
  if ((old && state.name === old) || (state.monster && state.name === state.race)) {
    state.name = label;
    state.tokenName = label;
    return true;
  }
  return false;
}

function applyRemote(sheet) {
  pendingRemote = null;
  const json = JSON.stringify(sheet);
  if (json === lastSaved) return;
  lastSaved = json;
  state = normalize(sheet);
  canEdit = computeCanEdit();
  if (state.gmOnly && self.role !== "GM") { showMessage("This sheet is private to the GM."); return; }
  render();
}

function showMessage(text) {
  app.innerHTML = `<div class="message"><h2>${esc(text)}</h2>${B.inOBR ? `<button data-action="close">Close</button>` : ""}</div>`;
}

function showCreate() {
  app.innerHTML = `
    <div class="create">
      <div class="sigil" aria-hidden="true"></div>
      <h1>New Myr'rodin sheet</h1>
      <p class="muted">For <b>${esc(token?.name || "this token")}</b>. Start blank, or load a character you exported before.</p>
      <div class="roll-row center">
        <button class="primary" id="new-blank">Start a blank sheet</button>
        <button id="new-import">Load a character</button>
        <button id="new-monster">Monster from the 5E bestiary</button>
        <button id="new-google">Link a Google Sheet</button>
        <button id="new-example">Use the example (Lyrith)</button>
      </div>
      ${B.inOBR ? `<button class="link" data-action="close">Cancel</button>` : ""}
    </div>`;
  const begin = async (data, keepName = false) => {
    state = normalize({ ...data, ownerId: self.role === "GM" ? "" : self.id });
    if (!keepName && token?.name) state.name = token.name;
    state.tokenName = state.name === token?.name ? token.name : "";
    canEdit = true;
    render();
    await saveNow();
  };
  document.getElementById("new-blank").onclick = () => begin(blankCharacter(token?.name || "New Adventurer"));
  document.getElementById("new-import").onclick = () => { state = null; showImport(true); };
  document.getElementById("new-monster").onclick = () => showBestiary(begin);
  document.getElementById("new-google").onclick = () => {
    const el = overlay(`
      <h3>Link a Google Sheet</h3>
      <p class="muted small">In Google Sheets, click <b>Share</b> and set General access to <b>Anyone with the link</b> (Viewer). Then copy the link from your browser's address bar and paste it here.</p>
      <input id="gs-new-url" placeholder="https://docs.google.com/spreadsheets/d/…" />
      <div class="roll-row"><button class="primary" data-go>Link & sync</button><button data-close>Cancel</button></div>`);
    el.querySelector("[data-go]").addEventListener("click", async () => {
      const url = el.querySelector("#gs-new-url").value.trim();
      const id = sheetIdFromUrl(url);
      if (!id) { toast("That doesn't look like a Google Sheets link.", "bad"); return; }
      const btn = el.querySelector("[data-go]");
      btn.disabled = true; btn.textContent = "Reading the sheet…";
      try {
        const base = normalize({ ...blankCharacter(token?.name || "New Adventurer"), googleSheet: { id, url, auto: true, lastSync: 0 } });
        const synced = await syncFromGoogle(base);
        el.remove();
        await begin(synced, true);
        toast(`Linked ${esc(state.name)}.${state.googleSheet.missing?.length ? ` ${state.googleSheet.missing.length} field(s) not found; see the Sheet tab.` : ""}`, "good");
      } catch (err) {
        btn.disabled = false; btn.textContent = "Link & sync";
        toast(esc(err.message || "Couldn't read that sheet."), "bad");
      }
    });
  };
  document.getElementById("new-example").onclick = async () => begin(await (await fetch(B.asset("characters/lyrith-taewen.json"))).json());
}

async function showBestiary(begin) {
  const el = overlay(`
    <h3>Monster from the 5E bestiary</h3>
    <input id="bst-q" placeholder="Search: skeleton, boar, goblin, undead, CR…" aria-label="Search monsters" />
    <ul class="bst-list" id="bst-list"><li class="muted small">Loading the bestiary…</li></ul>
    <div class="bst-opts">
      <label class="chk"><input type="checkbox" id="bst-roll" checked /><span>Roll hit points</span></label>
      <label class="chk"><input type="checkbox" id="bst-vary" checked /><span>Vary ability scores a little (±1)</span></label>
      <label class="chk"><input type="checkbox" id="bst-hide" checked /><span>Hide from players</span></label>
    </div>
    <div class="roll-row"><button class="primary" id="bst-go" disabled>Create</button><button data-close>Cancel</button>
      <span class="muted small bst-credit">Stats from the 5E SRD 5.1, CC BY 4.0</span></div>`);
  el.querySelector(".dialog").classList.add("wide");
  let list = [];
  let picked = null;
  try { list = await loadBestiary(); }
  catch { el.querySelector("#bst-list").innerHTML = `<li class="warn-text small">Couldn't load the bestiary. Check that the data folder was uploaded to GitHub.</li>`; return; }

  const q = el.querySelector("#bst-q");
  const ul = el.querySelector("#bst-list");
  const go = el.querySelector("#bst-go");
  const draw = (results) => {
    ul.innerHTML = results.length ? results.map((m) => `<li><button class="bst-row ${picked?.i === m.i ? "picked" : ""}" data-id="${esc(m.i)}">
        <span class="bst-name">${esc(m.n)}</span>
        <span class="bst-meta">CR ${crText(m.cr)} · ${esc(m.sz)} ${esc(m.ty)} · AC ${m.ac} · HP ${m.hp} (${esc(m.hd)})</span>
      </button></li>`).join("") : `<li class="muted small">No match. Try a creature type like beast, undead or humanoid.</li>`;
  };
  const run = () => draw(searchBestiary(list, q.value, 40));

  // Start with the token's name, falling back to its picture's name ("Beast").
  const guesses = [token?.name, token?.imageName].filter(Boolean);
  let first = guesses.find((g) => searchBestiary(list, g, 1).length) || "";
  q.value = first;
  run();
  const top = searchBestiary(list, first, 1)[0];
  if (top && first) { picked = top; go.disabled = false; run(); }
  q.focus(); q.select();

  q.addEventListener("input", run);
  ul.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    picked = list.find((m) => m.i === row.dataset.id);
    go.disabled = !picked;
    ul.querySelectorAll(".bst-row").forEach((b) => b.classList.toggle("picked", b.dataset.id === picked?.i));
  });
  ul.addEventListener("dblclick", (e) => { if (e.target.closest("[data-id]")) go.click(); });
  go.addEventListener("click", async () => {
    if (!picked) return;
    // Use the token's own label if it has one, otherwise the creature's name.
    const label = token?.name && token.name !== token.imageName ? token.name : "";
    const c = toCharacter(picked, {
      rollHp: el.querySelector("#bst-roll").checked,
      vary: el.querySelector("#bst-vary").checked,
      name: label,
    });
    c.gmOnly = el.querySelector("#bst-hide").checked;
    el.remove();
    await begin(c, true);
    toast(`${esc(c.name)} is ready: ${c.hp.max} HP.`, "good");
  });
}

async function start() {
  await B.whenReady();
  self = await B.me();
  if (B.inOBR) {
    B.partyPlayers().then((p) => { window.__players = p; if (tab === "settings" && state) render(); });
    if (self.role === "GM") {
      // GMs always see the party list for the owner picker.
      B.OBR.party.onChange((p) => { window.__players = p; });
    }
  }
  token = await B.getToken(itemId);

  // Preview mode: seed the example character so there's something to look at.
  if (!B.inOBR && !token?.sheet && !params.get("new")) {
    const example = await (await fetch(B.asset("characters/lyrith-taewen.json"))).json();
    await B.saveSheet(itemId, example);
    token = await B.getToken(itemId);
  }

  if (!token) { showMessage("That token isn't in this scene any more."); return; }
  if (!token.sheet) { showCreate(); }
  else {
    state = normalize(token.sheet);
    lastSaved = JSON.stringify(token.sheet);
    canEdit = computeCanEdit();
    if (state.gmOnly && self.role !== "GM") { showMessage("This sheet is private to the GM."); }
    else {
      if (followTokenName()) scheduleSave();
      render();
      // Pull the latest from Google when the sheet opens.
      const g = state.googleSheet;
      if (g?.id && canEdit && Date.now() - (g.lastSync || 0) > 20000) syncNow(true);
    }
  }

  B.onSheetsChange(async () => {
    const t = await B.getToken(itemId);
    if (!t) return;
    token = t;
    if (state && followTokenName()) { render(); scheduleSave(); }
    if (!t.sheet) { if (state) { state = null; showMessage("This sheet was removed."); } return; }
    if (JSON.stringify(t.sheet) === lastSaved) return;
    const typing = app.contains(document.activeElement) && document.activeElement.matches("input, textarea, select");
    if (typing) pendingRemote = t.sheet;
    else applyRemote(t.sheet);
  });

  // Tell the background page this sheet is open, so your own rolls animate here.
  B.markSheetOpen();
  setInterval(() => { if (document.visibilityState === "visible") B.markSheetOpen(); }, 1500);

  // Save before the window goes away.
  window.addEventListener("pagehide", () => { if (state && canEdit) saveNow(); });
}

start().catch((err) => {
  console.error(err);
  showMessage("Something went wrong opening this sheet. Try closing and reopening it.");
});
