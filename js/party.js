// The toolbar panel: party at a glance, quick HP changes for the GM, and the roll log.
import * as B from "./bridge.js?v=1.9.0";
import { normalize } from "./rules.js?v=1.9.0";
import { roll } from "./dice.js?v=1.9.0";
import * as Combat from "./combat.js?v=1.9.0";
import { mountCombat } from "./tracker.js?v=1.9.0";
import { mountInventory } from "./inventory.js?v=1.9.0";
import * as Roster from "./roster.js?v=1.9.0";

const partyEl = document.getElementById("party");
const logEl = document.getElementById("log");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => Number(v) || 0;
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

let self = null;
let sheets = [];
let roster = { members: {} };
let removeArmed = null;

function bar(cls, cur, max, label) {
  if (!max) return "";
  return `<div class="mini"><span class="mini-label">${label}</span><div class="bar ${cls}"><div style="width:${pct(cur, max)}%"></div></div><span class="mini-num">${cur}/${max}</span></div>`;
}

function memberCard({ id, image, c, onMap, memberId }) {
  const hp = num(c.hp.current), max = num(c.hp.max);
  const state = hp <= 0 && max ? "down" : hp <= max / 4 ? "low" : "";
  const isGM = self.role === "GM";
  return `<article class="member ${state} ${c.gmOnly ? "secret" : ""} ${onMap ? "" : "offmap"}" data-id="${esc(id || "")}">
    <button class="member-open" ${onMap ? `data-open="${esc(id)}" title="Open sheet"` : `disabled title="Not on this map"`}>
      <span class="avatar">${image ? `<img src="${esc(image)}" alt="" />` : esc((c.name || "?")[0])}</span>
      <span class="member-name">${esc(c.name)}${c.gmOnly ? ` <span class="badge">GM</span>` : ""}<small>${esc([c.class, c.race].filter(Boolean).join(" · ")) || "&nbsp;"}</small></span>
      <span class="ac" title="Armor Class">${num(c.ac)}<small>AC</small></span>
    </button>
    ${bar("hp", hp, max, "HP")}${c.hp.temp ? `<span class="temp">+${num(c.hp.temp)} temp</span>` : ""}
    ${bar("mana", num(c.mana.current), num(c.mana.max), "Mana")}
    ${!onMap ? `<div class="offmap-row"><span class="chip-off">Not on this map</span>
        ${isGM && memberId ? `<span><button class="small" data-place="${esc(memberId)}">Place on map</button>
        <button class="link small danger-text" data-unparty="${esc(memberId)}">${removeArmed === memberId ? "Click again to remove" : "Remove from party"}</button></span>` : ""}</div>` : ""}
    ${onMap && isGM ? `<div class="gm-hp">
      <input type="number" inputmode="numeric" placeholder="0" aria-label="HP amount for ${esc(c.name)}" />
      <button class="danger small" data-hp="-" data-id="${esc(id)}">Damage</button>
      <button class="good small" data-hp="+" data-id="${esc(id)}">Heal</button>
    </div>` : ""}
  </article>`;
}

function renderParty() {
  const isGM = self.role === "GM";
  const byParty = new Map(sheets.filter((s) => s.sheet?.partyId).map((s) => [s.sheet.partyId, s]));
  const members = Object.values(roster.members || {}).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const memberIds = new Set(members.map((m) => m.id));

  // The party: saved with the room, shown whether or not they're on this map.
  const partyCards = members.map((m) => {
    const live = byParty.get(m.id);
    if (live) return memberCard({ id: live.id, image: live.image, c: normalize(live.sheet), onMap: true });
    return memberCard({ id: "", image: m.token?.image?.url, c: Roster.sheetFor(m), onMap: false, memberId: m.id });
  });
  // Player sheets on the map that the GM's computer hasn't saved yet.
  const unsaved = sheets.filter((s) => s.sheet?.ownerId && !memberIds.has(s.sheet.partyId));
  unsaved.forEach((s) => partyCards.push(memberCard({ id: s.id, image: s.image, c: normalize(s.sheet), onMap: true })));

  // Everyone else on this map (monsters, NPCs).
  const others = sheets.filter((s) => !s.sheet?.ownerId && !s.sheet?.partyId && (isGM || !s.sheet.gmOnly));
  const missing = members.filter((m) => !byParty.has(m.id) && m.token?.image?.url).length;

  document.getElementById("party-sub").textContent = members.length || unsaved.length
    ? `${members.length + unsaved.length} in the party`
    : "Party";

  const size = Roster.rosterSize(roster);
  partyEl.innerHTML = `
    ${isGM && missing ? `<button class="primary place-all" data-place-all>Place party on map (${missing})</button>` : ""}
    ${partyCards.length ? `<div class="party-list">${partyCards.join("")}</div>` : `<div class="empty-state">
      <p><b>No party yet.</b></p>
      <p class="muted small">Give a character sheet an owner (Sheet tab → Owner) and it joins the party. The party is saved with the room, so it's still here on the next scene.</p>
      ${B.inOBR ? "" : `<button class="primary" id="preview-open">Open the example sheet</button>`}
    </div>`}
    ${others.length ? `<h3 class="section-h">On this map</h3><div class="party-list">${others.map((s) => memberCard({ id: s.id, image: s.image, c: normalize(s.sheet), onMap: true })).join("")}</div>` : ""}
    ${isGM && members.length ? `<p class="muted small storage-note">Party saved with the room · ${(size / 1024).toFixed(1)} KB${size > Roster.ROOM_LIMIT * 0.75 ? ` <b class="warn-text">— nearly full. Linking characters to Google Sheets saves space.</b>` : ""}</p>` : ""}`;
  document.getElementById("preview-open")?.addEventListener("click", () => B.openSheet("preview-lyrith"));
}

function renderLog() {
  const log = B.readLog();
  logEl.innerHTML = log.length
    ? log.map((r) => `<li class="${r.crit || r.outcome === "Success" ? "good" : r.fumble || r.outcome === "Failed" ? "bad" : ""}">
        <div class="log-top"><b>${esc(r.character || r.player || "Someone")}</b>${r.hidden ? ` <span class="badge">private</span>` : ""}<span class="muted">${new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
        <div class="log-mid"><span>${esc(r.label)}</span><span class="log-total">${esc(r.total)}</span></div>
        <div class="log-detail">${esc(r.detail)}${r.crit ? " · <b>Critical!</b>" : ""}${r.fumble ? " · natural 1" : ""}${r.outcome ? ` · <b>${esc(r.outcome)}</b>` : ""}</div>
      </li>`).join("")
    : `<li class="empty">Rolls from every sheet show up here.</li>`;
}

async function refresh() {
  sheets = await B.listSheets();
  renderParty();
}


partyEl.addEventListener("click", async (e) => {
  const open = e.target.closest("[data-open]");
  if (open) { B.openSheet(open.dataset.open); return; }
  const placeAll = e.target.closest("[data-place-all]");
  if (placeAll) { placeAll.disabled = true; const n = await Roster.placeParty(); B.notify(n ? `Placed ${n} party member${n === 1 ? "" : "s"} on the map.` : "Nothing to place.", n ? "SUCCESS" : "INFO"); return; }
  const place = e.target.closest("[data-place]");
  if (place) { place.disabled = true; await Roster.placeParty([place.dataset.place]); return; }
  const un = e.target.closest("[data-unparty]");
  if (un) {
    if (removeArmed !== un.dataset.unparty) { removeArmed = un.dataset.unparty; renderParty(); return; }
    removeArmed = null; await Roster.removeMember(un.dataset.unparty); return;
  }
  const hpBtn = e.target.closest("[data-hp]");
  if (!hpBtn) return;
  const card = hpBtn.closest(".member");
  const amt = Math.abs(num(card.querySelector("input").value));
  if (!amt) return;
  const entry = sheets.find((s) => s.id === hpBtn.dataset.id);
  if (!entry) return;
  const c = normalize(entry.sheet);
  if (hpBtn.dataset.hp === "-") {
    const fromTemp = Math.min(num(c.hp.temp), amt);
    c.hp.temp = num(c.hp.temp) - fromTemp;
    c.hp.current = Math.max(0, num(c.hp.current) - (amt - fromTemp));
  } else {
    c.hp.current = Math.min(num(c.hp.max), num(c.hp.current) + amt);
  }
  await B.saveSheet(entry.id, c);
  await refresh();
});

const animBox = document.getElementById("dice-anim");
if (animBox) {
  animBox.checked = B.diceAnimOn();
  animBox.addEventListener("change", () => B.setDiceAnim(animBox.checked));
}

document.getElementById("clear-log").addEventListener("click", () => {
  try { localStorage.setItem(B.LOG_KEY, "[]"); } catch { /* ignore */ }
  renderLog();
});

function freeRoll() {
  const input = document.getElementById("free-dice");
  const expr = input.value.trim();
  if (!expr) return;
  const r = roll(expr);
  B.broadcastRoll({ character: self.name, player: self.name, label: expr, total: r.total, detail: r.detail, crit: r.crit, fumble: r.fumble, hidden: false, dice: r.dice });
  input.select();
  if (!B.inOBR) renderLog();
}
document.getElementById("free-roll").addEventListener("click", freeRoll);
document.getElementById("free-dice").addEventListener("keydown", (e) => { if (e.key === "Enter") freeRoll(); });

window.addEventListener("storage", (e) => { if (e.key === B.LOG_KEY) renderLog(); });
window.addEventListener("myrrodin-log", renderLog);

function showNoScene() {
  sheets = [];
  if (Object.keys(roster.members || {}).length) { renderParty(); document.getElementById("party-sub").textContent = "No scene open"; return; }
  document.getElementById("party-sub").textContent = "No scene open";
  partyEl.innerHTML = `<div class="empty-state">
    <p><b>Open a scene to see the party.</b></p>
    <p class="muted small">Sheets live on tokens, so they show up here once a scene with character tokens is open.</p>
  </div>`;
}

async function safeRefresh() {
  try {
    if (B.inOBR && !(await B.OBR.scene.isReady())) { showNoScene(); return; }
    await refresh();
  } catch (err) {
    console.error("[Myr'rodin] couldn't load the party", err);
    showNoScene();
  }
}

const combatBar = document.getElementById("combat-bar");
let combatState = null;
function renderCombatBar() {
  if (!self) return;
  const active = combatState?.active;
  if (!active && self.role !== "GM") { combatBar.innerHTML = ""; return; }
  combatBar.innerHTML = active
    ? `<div class="combat-on"><span>⚔ Combat · round ${combatState.round}</span><button class="small" data-goto="combat">Open</button></div>`
    : `<button class="primary combat-start" id="start-combat">⚔ Start combat</button>`;
  document.getElementById("start-combat")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    await Combat.startCombat();
    showTab("combat");
  });
}
combatBar.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) showTab(g.dataset.goto); });

// ---- Tabs -------------------------------------------------------------------
const TABS = ["party", "combat", "inventory", "dice"];
function showTab(name) {
  if (!TABS.includes(name)) name = "party";
  B.setMenuTab(name);
  document.querySelectorAll(".menu-tabs [data-tab]").forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });
  document.querySelectorAll(".menu-page").forEach((p) => { p.hidden = p.dataset.page !== name; });
  window.scrollTo(0, 0);
}
document.querySelector(".menu-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
// The background switches us to Combat when a fight starts.
window.addEventListener("storage", (e) => { if (e.key === "myrrodin-menu-tab" && e.newValue) showTab(e.newValue); });
showTab(B.menuTab());

document.querySelector(".quick-dice").addEventListener("click", (e) => {
  const b = e.target.closest("[data-q]");
  if (!b) return;
  document.getElementById("free-dice").value = b.dataset.q;
  freeRoll();
});

// Party frames settings (bottom of the Party tab).
const PF_CORNERS = [["tl", "Top left"], ["bl", "Bottom left"], ["tr", "Top right"], ["br", "Bottom right"]];
function renderPfSettings() {
  let box = document.getElementById("pf-settings");
  if (!box) { box = document.createElement("div"); box.id = "pf-settings"; box.className = "hud-settings pf-settings"; document.querySelector('[data-page="party"]').appendChild(box); }
  const on = B.partyFramesOn(), corner = B.partyCorner();
  box.innerHTML = `<label class="chk"><input type="checkbox" id="pf-toggle" ${on ? "checked" : ""}/><span>Show party frames on my screen</span></label>
    <div class="hud-corners" ${on ? "" : "hidden"}>${PF_CORNERS.map(([k, l]) => `<button class="chip-btn ${corner === k ? "on" : ""}" data-pf="${k}">${l}</button>`).join("")}</div>
    <p class="muted small">Everyone's HP, mana and AC, always on screen. Clicks pass through it to the map. Characters show up once their sheet has an owner.</p>`;
  box.querySelector("#pf-toggle").addEventListener("change", (e) => { B.setPartyFramesOn(e.target.checked); renderPfSettings(); });
  box.querySelectorAll("[data-pf]").forEach((b) => b.addEventListener("click", () => { B.setPartyCorner(b.dataset.pf); renderPfSettings(); }));
}
renderPfSettings();

function setCombatDot(st, me) {
  const dot = document.getElementById("combat-dot");
  if (!dot) return;
  dot.className = `tab-dot ${st?.active ? "on" : ""}`;
}

(async () => {
  renderLog();
  await B.whenReady();
  self = await B.me();
  partyEl.innerHTML = `<p class="muted small" style="text-align:center">Gathering the party…</p>`;
  roster = await Roster.getRoster().catch(() => roster);
  Roster.onRosterChange((r) => { roster = r; if (self) renderParty(); });
  await safeRefresh();
  combatState = await Combat.getCombat().catch(() => null);
  renderCombatBar();
  Combat.onCombatChange((st) => { combatState = st; renderCombatBar(); });
  mountCombat(document.getElementById("combat-root"), (st, me) => setCombatDot(st, me)).catch((err) => console.error(err));
  mountInventory(document.getElementById("inv-root")).catch((err) => console.error(err));
  let unsubscribe = null;
  const watch = () => { try { unsubscribe?.(); unsubscribe = B.onSheetsChange(safeRefresh); } catch { /* scene not ready yet */ } };
  watch();
  if (B.inOBR) B.OBR.scene.onReadyChange((ready) => { if (ready) watch(); safeRefresh(); });
})();
