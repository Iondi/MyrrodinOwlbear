// =====================================================================
//  GOOGLE SHEETS LINK
//  Downloads a player's Google Sheet (it must be shared as "Anyone with
//  the link can view") and reads it into a Myr'rodin character.
//
//  It finds things by their LABELS ("Max HP", "Armor Class", skill
//  names...) rather than fixed cells, so small layout differences
//  between players' copies still work. Anything it can't find is listed
//  on the sheet so you know what didn't sync.
// =====================================================================
import { unzipSync, strFromU8 } from "../vendor/fflate.js?v=1.3.0";
import { ABILITIES, SKILLS, SPELL_LEVELS, derive } from "./rules.js?v=1.3.0";

// ---------------------------------------------------------------------
// Links and downloading
// ---------------------------------------------------------------------
export function sheetIdFromUrl(url) {
  const m = String(url || "").match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  const raw = String(url || "").trim();
  return /^[a-zA-Z0-9_-]{30,}$/.test(raw) ? raw : null;
}

export class SheetError extends Error {}

export async function downloadWorkbook(id) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  let res;
  try {
    res = await fetch(url, { cache: "no-store", credentials: "omit" });
  } catch {
    throw new SheetError("Google wouldn't hand over the sheet. Check that sharing is set to \"Anyone with the link can view\".");
  }
  if (res.status === 404) throw new SheetError("Google says that sheet doesn't exist. Check the link.");
  if (!res.ok) throw new SheetError(`Google returned an error (${res.status}). Check that sharing is set to "Anyone with the link can view".`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A private sheet comes back as a Google sign-in page, not a workbook.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new SheetError("That sheet is private. In Google Sheets, click Share and set General access to \"Anyone with the link\" (Viewer).");
  }
  return bytes;
}

// ---------------------------------------------------------------------
// Reading the .xlsx file
// ---------------------------------------------------------------------
const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

const colNumber = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

class Grid {
  constructor(name) { this.name = name; this.cells = new Map(); this.list = []; }
  set(r, c, v) { this.cells.set(`${r},${c}`, v); this.list.push({ r, c, v }); }
  get(r, c) { return this.cells.get(`${r},${c}`); }
  // All cells whose normalized text matches.
  find(test) { return this.list.filter((x) => typeof x.v === "string" && test(norm(x.v), x)); }
}

export function parseWorkbook(bytes) {
  const files = unzipSync(bytes);
  const text = (path) => (files[path] ? strFromU8(files[path]) : "");

  const shared = [];
  for (const si of text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(decode([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }

  const rels = {};
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2];

  const tabs = [];
  for (const m of text("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const grid = new Grid(decode(m[1]));
    const target = rels[m[2]] || "";
    const xml = text(`xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}`);
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, row, attrs, inner = ""] = c;
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      const vRaw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let v;
      if (type === "s") v = shared[Number(vRaw)];
      else if (type === "b") v = vRaw === "1";
      else if (type === "str" || type === "e") v = vRaw === undefined ? undefined : decode(vRaw);
      else if (type === "inlineStr") v = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else v = vRaw === undefined ? undefined : Number(vRaw);
      if (v === undefined || v === "") continue;
      if (typeof v === "string" && !v.trim()) continue;
      grid.set(Number(row), colNumber(col), v);
    }
    tabs.push(grid);
  }
  return tabs;
}

// ---------------------------------------------------------------------
// Helpers for finding things by label
// ---------------------------------------------------------------------
const norm = (s) => String(s).toLowerCase().replace(/\[\d+\]/g, "").replace(/[:*?]/g, "").replace(/\s+/g, " ").trim();
const isNum = (v) => typeof v === "number" || (typeof v === "string" && /^[+-]?\d+(\.\d+)?$/.test(v.trim()));
const toNum = (v) => (typeof v === "number" ? v : Number(String(v).trim()));
const isText = (v) => typeof v === "string" && !/^(-|—|---|\.|□|#value!|#ref!|#n\/a|false|true)$/i.test(v.trim());
const clean = (v) => String(v).replace(/\s+/g, " ").trim();

function pickTab(tabs, ...hints) {
  return tabs.find((t) => hints.some((h) => norm(t.name).includes(h))) || null;
}

// First cell (reading order) with this exact label.
function label(grid, ...names) {
  if (!grid) return null;
  const hits = grid.find((n) => names.includes(n)).sort((a, b) => a.r - b.r || a.c - b.c);
  return hits[0] || null;
}

// The value sitting under a label (checks the next two rows).
function below(grid, cell, want = "any") {
  if (!cell) return undefined;
  for (let dr = 1; dr <= 2; dr++) {
    const v = grid.get(cell.r + dr, cell.c);
    if (v === undefined) continue;
    if (want === "num" && !isNum(v)) continue;
    return v;
  }
  return undefined;
}

// A list of entries under a heading, in the same column.
function listBelow(grid, cell, max = 30) {
  const out = [];
  if (!cell) return out;
  let gaps = 0;
  for (let r = cell.r + 1; r <= cell.r + max && gaps < 3; r++) {
    const v = grid.get(r, cell.c);
    if (v === undefined || !isText(v)) { gaps++; continue; }
    gaps = 0;
    out.push(clean(v));
  }
  return out;
}

// Text cells to the right of a label on the same row.
function listRight(grid, cell, max = 8) {
  const out = [];
  if (!cell) return out;
  for (let c = cell.c + 1; c <= cell.c + max; c++) {
    const v = grid.get(cell.r, c);
    if (v !== undefined && isText(v)) out.push(clean(v));
  }
  return out;
}

const ABILITY_BY_SHORT = { str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha" };
const abilityKey = (v) => ABILITY_BY_SHORT[String(v || "").toLowerCase().slice(0, 3)] || null;
const yes = (v) => v === true || /^(true|yes|y|x|✓|✔)$/i.test(String(v ?? "").trim());

// Read a table whose header row contains these labels.
function readTables(grid, mustHave) {
  if (!grid) return [];
  const tables = [];
  const headerRows = new Set(grid.find((n) => n === mustHave[0]).map((x) => x.r));
  for (const r of [...headerRows].sort((a, b) => a - b)) {
    const header = grid.list.filter((x) => x.r === r && typeof x.v === "string").sort((a, b) => a.c - b.c);
    const names = header.map((h) => norm(h.v));
    if (!mustHave.every((m) => names.some((n) => n === m || n.startsWith(m)))) continue;
    const cols = {};
    header.forEach((h) => {
      let key = norm(h.v);
      while (cols[key] !== undefined) key += "#2";
      cols[key] = h.c;
    });
    const col = (...keys) => { for (const k of keys) { const hit = Object.keys(cols).find((x) => x === k || x.startsWith(k)); if (hit) return cols[hit]; } return undefined; };
    // Rows run until the next header row or 30 rows.
    const rows = [];
    for (let rr = r + 1; rr <= r + 30; rr++) {
      if (headerRows.has(rr)) break;
      rows.push(rr);
    }
    tables.push({ r, col, rows, cols });
  }
  return tables;
}

// Section title above a spell table ("Cantrips", "1st Level", "3rd Level"...)
function spellLevelAbove(grid, headerRow) {
  for (let r = headerRow - 1; r >= headerRow - 4; r--) {
    const cells = grid.list.filter((x) => x.r === r && typeof x.v === "string");
    for (const x of cells) {
      const n = norm(x.v);
      if (n.startsWith("cantrip")) return 0;
      const m = n.match(/^(\d)(st|nd|rd|th) level/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------
export function readCharacter(tabs) {
  const out = {};
  const missing = [];
  const need = (name, ok) => { if (!ok) missing.push(name); return ok; };

  const basic = pickTab(tabs, "basic") || tabs[0];
  const scores = pickTab(tabs, "ability");
  const spellTab = pickTab(tabs, "spell");
  const attackTab = pickTab(tabs, "attack");
  const invTab = pickTab(tabs, "inventory");
  const psiTab = pickTab(tabs, "physical", "psi");

  // ---- Name & class ----
  const nameCell = basic?.find((n) => n.startsWith("name"))[0];
  if (need("Name", nameCell)) out.name = clean(String(nameCell.v).replace(/^\s*name\s*:?\s*/i, "")) || undefined;
  const classCell = basic?.find((n) => n.startsWith("class"))[0];
  if (need("Class", classCell)) out.class = clean(String(classCell.v).replace(/^\s*class\s*:?\s*/i, ""));

  // Race: a text cell just under the name line (where Lyrith's "Ruby Thunder Dragon" sits).
  if (nameCell) {
    const raceCell = basic.list.find((x) => x.r > nameCell.r && x.r <= nameCell.r + 3 && x.c > nameCell.c && x.c <= nameCell.c + 6 && isText(x.v));
    if (raceCell) out.race = clean(raceCell.v);
  }

  // ---- Numbers under labels on Basic INFO ----
  const num = (names, label_, path) => {
    const v = below(basic, label(basic, ...names), "num");
    if (need(label_, v !== undefined)) path(toNum(v));
  };
  num(["armor class", "ac"], "Armor Class", (v) => { out.ac = v; });
  num(["max hp", "maximum hp", "hp max"], "Max HP", (v) => { out.hpMax = v; });
  num(["current hp"], "Current HP", (v) => { out.hpCurrent = v; });
  num(["experience", "xp"], "Experience", (v) => { out.xp = v; });
  num(["mana"], "Mana", (v) => { out.manaMax = v; });

  const manaUsed = below(basic, label(basic, "mana used"), "num");
  if (manaUsed !== undefined) out.manaUsed = toNum(manaUsed);

  const regen = below(basic, label(basic, "mana regen"));
  if (need("Mana Regen", regen !== undefined)) out.manaRegen = clean(regen);

  const speedLabel = label(basic, "speed");
  const speed = below(basic, speedLabel);
  if (need("Speed", speed !== undefined)) {
    out.speed = clean(speed);
    const note = basic.get(speedLabel.r + 2, speedLabel.c);
    if (note !== undefined && isText(note) && !isNum(note)) out.speedNotes = clean(note);
  }

  const sheetInit = below(basic, label(basic, "initiative"), "num");
  const sheetWill = below(basic, label(basic, "will check"), "num");
  const sheetDC = below(basic, label(basic, "spell save dc"), "num");

  // Levels: the first "Level" label is the main level, a second one is the 2nd level.
  const levelLabels = basic ? basic.find((n) => n === "level").sort((a, b) => a.r - b.r || a.c - b.c) : [];
  const lv1 = below(basic, levelLabels[0], "num");
  if (need("Level", lv1 !== undefined)) out.level = toNum(lv1);
  const lv2 = below(basic, levelLabels[1], "num");
  if (lv2 !== undefined) out.level2 = toNum(lv2);

  // Lineage & background: the text on the row under the Level label.
  if (levelLabels[0]) {
    const valueRow = levelLabels[0].r + 1;
    const texts = basic.list
      .filter((x) => x.r === valueRow && isText(x.v) && !isNum(x.v))
      .sort((a, b) => a.c - b.c)
      .map((x) => clean(x.v));
    const strip = (s) => s.replace(/^background\s*[-–:]\s*/i, "").replace(/\s*background$/i, "").trim();
    if (texts.length >= 2) { out.lineage = strip(texts[0]); out.background = strip(texts[1]); }
    else if (texts.length === 1) {
      if (/background/i.test(texts[0])) out.background = strip(texts[0]); else out.lineage = texts[0];
    }
  }

  // Money on Basic INFO (used if the Inventory tab has no coins).
  const basicMoney = below(basic, label(basic, "money"), "num");

  // Combat helper: "1st", "2nd"... with the step to the right.
  if (basic) {
    const steps = basic.find((n) => /^\d+(st|nd|rd|th)$/.test(n)).sort((a, b) => a.r - b.r);
    out.combat = steps.map((s) => basic.get(s.r, s.c + 1)).filter((v) => v !== undefined && isText(v)).map(clean);
  }

  // Skills/Abilities, Notes and Details lists become features.
  out.features = [
    ...listBelow(basic, label(basic, "skills/abilities", "skills / abilities", "abilities")),
    ...listBelow(basic, label(basic, "notes")),
    ...listBelow(basic, label(basic, "details")),
  ];

  // ---- Ability scores ----
  out.abilities = {};
  for (const a of ABILITIES) {
    const want = a.name.toLowerCase();
    let v = scores ? below(scores, label(scores, want), "num") : undefined;
    if (v === undefined && basic) {
      const cell = label(basic, want);
      if (cell) for (let dc = 1; dc <= 3 && v === undefined; dc++) { const x = basic.get(cell.r, cell.c + dc); if (isNum(x)) v = x; }
    }
    if (need(a.name, v !== undefined)) out.abilities[a.key] = toNum(v);
  }

  // ---- Proficiency bonus ----
  let pb = scores ? below(scores, label(scores, "proficiency", "proficency"), "num") : undefined;
  if (pb === undefined && basic) {
    const cell = label(basic, "proficiency", "proficency");
    if (cell) { const left = basic.get(cell.r, cell.c - 1); if (isNum(left)) pb = left; }
  }
  if (need("Proficiency", pb !== undefined)) out.profBonus = toNum(pb);

  // ---- Saving throws: "STR" with a checkbox to its left ----
  if (scores) {
    out.saves = {};
    for (const a of ABILITIES) {
      const cell = label(scores, a.key);
      if (cell) out.saves[a.key] = yes(scores.get(cell.r, cell.c - 1));
    }
    if (!Object.keys(out.saves).length) { delete out.saves; missing.push("Saving throws"); }
  }

  // ---- Skills: five tier boxes to the left, sheet's total two columns right ----
  const tierOrder = ["inept", "deficient", "prof", "expert", "master"];
  out.skills = {};
  out.skillTotals = {};
  let foundSkills = 0;
  for (const s of SKILLS) {
    const cell = label(scores, s.name.toLowerCase(), s.name.toLowerCase().replace("/", " / "));
    if (!cell) continue;
    foundSkills++;
    let tier = "none";
    tierOrder.forEach((t, i) => { if (yes(scores.get(cell.r, cell.c - 5 + i))) tier = t; });
    out.skills[s.key] = { tier };
    // The sheet's own total sits after the ability name and "+" sign.
    for (let dc = 1; dc <= 8; dc++) {
      const v = scores.get(cell.r, cell.c + dc);
      if (v === "+" || v === "-") {
        const total = scores.get(cell.r, cell.c + dc + 1);
        if (isNum(total)) out.skillTotals[s.key] = toNum(total);
        break;
      }
    }
  }
  need("Skills", foundSkills > 0);

  // ---- Feats, languages, proficiencies, blurb ----
  out.feats = listBelow(scores, label(scores, "feats"));
  const langs = listRight(scores, label(scores, "languages"));
  if (langs.length) out.languages = langs.join(", ");
  const weap = listRight(scores, label(scores, "weapons"));
  if (weap.length) out.weaponProfs = weap.join(", ");
  const armor = listRight(scores, label(scores, "armor"));
  if (armor.length) out.armorProfs = armor.join(", ");
  const blurbCell = scores?.find((n) => n.startsWith("short character background"))[0];
  if (blurbCell) {
    const rest = clean(String(blurbCell.v).replace(/^.*?here\s*:?\s*/i, ""));
    const more = listRight(scores, blurbCell).join(" ");
    const text = [rest, more].filter(Boolean).join(" ");
    if (text) out.blurb = text;
  }

  // ---- Weapons ----
  out.attacks = [];
  const notesCell = attackTab?.find((n) => n.startsWith("additional attack"))[0];
  for (const t of readTables(attackTab, ["name", "die modifier"])) {
    for (const r of t.rows) {
      if (notesCell && r >= notesCell.r) break;
      const name = attackTab.get(r, t.col("name"));
      if (name === undefined || !isText(name)) continue;
      out.attacks.push({
        name: clean(name),
        range: clean(attackTab.get(r, t.col("range")) ?? ""),
        ability: abilityKey(attackTab.get(r, t.col("type"))) || "str",
        damage: clean(attackTab.get(r, t.col("die modifier")) ?? ""),
        damageType: titleCase(clean(attackTab.get(r, t.col("damage")) ?? "")),
        proficient: yes(attackTab.get(r, t.col("prof"))),
        equipped: yes(attackTab.get(r, t.col("equipped"))),
      });
    }
  }
  if (notesCell) {
    const lines = [];
    for (let r = notesCell.r + 1; r <= notesCell.r + 12; r++) {
      const v = attackTab.get(r, notesCell.c);
      if (v !== undefined && isText(v)) lines.push(clean(v));
    }
    out.attackNotes = lines.join("\n");
  }
  if (out.attackNotes && /graze/i.test(out.attackNotes)) out.attacks.forEach((a) => { a.graze = true; });

  // ---- Spells (Spell List tab, plus any mana tables on the psionics tab) ----
  out.spells = [];
  for (const grid of [spellTab, psiTab].filter(Boolean)) {
    for (const t of readTables(grid, ["learn", "name", "mana cost"])) {
      const level = spellLevelAbove(grid, t.r);
      for (const r of t.rows) {
        const name = grid.get(r, t.col("name"));
        if (name === undefined || !isText(name)) continue;
        const mana = grid.get(r, t.col("mana cost"));
        const lvl = level ?? (SPELL_LEVELS.find((l) => l.mana === toNum(mana))?.level ?? 1);
        const get = (k) => { const c = t.col(k); const v = c ? grid.get(r, c) : undefined; return v === undefined || !isText(v) ? "" : clean(v); };
        out.spells.push({
          level: lvl,
          name: clean(name),
          type: get("type"),
          castTime: get("casting time"),
          range: get("range"),
          damage: get("damage"),
          damageType: (() => { const c = t.cols["type#2"]; const v = c ? grid.get(r, c) : undefined; return v && isText(v) ? clean(v) : ""; })(),
          save: get("saving throw"),
          mana: isNum(mana) ? toNum(mana) : SPELL_LEVELS[lvl]?.mana ?? 0,
          dc: isNum(grid.get(r, t.col("dc to cast"))) ? toNum(grid.get(r, t.col("dc to cast"))) : SPELL_LEVELS[lvl]?.dc ?? 0,
          duration: get("duration"),
          condition: get("condition"),
          amplifiable: yes(grid.get(r, t.col("amplifiable"))),
          concentration: yes(grid.get(r, t.col("concentration"))),
          learned: t.col("learn") ? yes(grid.get(r, t.col("learn"))) : true,
        });
      }
    }
  }

  // ---- Psionics ----
  out.psionics = [];
  if (psiTab) {
    for (const t of readTables(psiTab, ["name", "psi cost"])) {
      for (const r of t.rows) {
        const name = psiTab.get(r, t.col("name"));
        const learned = t.col("learn") ? yes(psiTab.get(r, t.col("learn"))) : false;
        if (!(name !== undefined && isText(name)) && !learned) continue;
        const get = (k) => { const c = t.col(k); const v = c ? psiTab.get(r, c) : undefined; return v === undefined || !isText(v) ? "" : clean(v); };
        const cost = psiTab.get(r, t.col("psi cost"));
        out.psionics.push({
          name: name !== undefined && isText(name) ? clean(name) : "",
          type: get("type"),
          castTime: get("casting time"),
          range: get("range"),
          cost: isNum(cost) ? toNum(cost) : 0,
          damage: get("die damage"),
          duration: get("duration"),
          save: get("target saving throw"),
          learned: true,
        });
      }
    }
  }

  // ---- Inventory ----
  if (invTab) {
    out.equipment = listBelow(invTab, label(invTab, "equipment"), 60).map((n) => ({ name: n, qty: 1, notes: "" }));
    const coins = {};
    for (const k of ["cp", "sp", "ep", "gp", "pp"]) {
      const cell = label(invTab, k);
      if (!cell) continue;
      const v = invTab.get(cell.r, cell.c - 1);
      coins[k] = isNum(v) ? toNum(v) : 0;
    }
    if (Object.keys(coins).length) out.money = coins;
  }
  if (basicMoney !== undefined) {
    out.money = out.money || {};
    const coinTotal = Object.values(out.money).reduce((a, b) => a + (Number(b) || 0), 0);
    if (!coinTotal) out.money.gp = toNum(basicMoney);
  }

  // Keep the sheet's own Initiative, Will Check and Spell DC exact.
  out.sheetInit = sheetInit !== undefined ? toNum(sheetInit) : undefined;
  out.sheetWill = sheetWill !== undefined ? toNum(sheetWill) : undefined;
  out.sheetDC = sheetDC !== undefined ? toNum(sheetDC) : undefined;

  return { data: out, missing };
}

function titleCase(s) {
  return s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

// ---------------------------------------------------------------------
// Merging into an Owlbear sheet
// ---------------------------------------------------------------------
// What's tracked in play (current HP, spent mana, psi, ticks on the combat
// helper) stays in Owlbear, unless the Google Sheet itself changes it.
export function mergeIntoSheet(current, imported, missing) {
  const c = structuredClone(current);
  const d = imported;
  const link = c.googleSheet || {};
  const prev = link.snap || null;

  for (const k of ["name", "class", "race", "lineage", "background", "level", "level2", "xp", "profBonus", "ac", "speed", "speedNotes", "manaMax", "languages", "weaponProfs", "armorProfs", "blurb", "attackNotes"]) {
    if (d[k] === undefined) continue;
    if (k === "manaMax") continue;
    if (k === "race" && c.race && prev) continue; // race only fills in on first link
    c[k] = d[k];
  }
  if (d.abilities) c.abilities = { ...c.abilities, ...d.abilities };
  if (d.saves) c.saves = { ...c.saves, ...d.saves };

  // Skills: tier from the sheet, and the extra bonus set so totals match the sheet exactly.
  if (d.skills && Object.keys(d.skills).length) {
    const next = {};
    for (const [key, s] of Object.entries(d.skills)) next[key] = { tier: s.tier, misc: 0 };
    c.skills = next;
    const dv = derive(c);
    for (const [key, total] of Object.entries(d.skillTotals || {})) {
      const sk = dv.skills[key];
      if (!sk || sk.autoFail) continue;
      const diff = total - sk.bonus;
      if (diff) c.skills[key].misc = diff;
    }
  }

  // Initiative / Will / Spell DC: match the sheet's numbers.
  const dv = derive(c);
  if (d.sheetInit !== undefined) c.initMisc = (Number(c.initMisc) || 0) + d.sheetInit - dv.initiative;
  if (d.sheetWill !== undefined) c.willMisc = (Number(c.willMisc) || 0) + d.sheetWill - dv.will;
  if (d.sheetDC !== undefined) c.spellDCMisc = (Number(c.spellDCMisc) || 0) + d.sheetDC - dv.spellDC;

  // HP: max always follows the sheet. Current only changes when the sheet's
  // Current HP changes (or on the first link), so damage in Owlbear sticks.
  if (d.hpMax !== undefined) c.hp.max = d.hpMax;
  if (d.hpCurrent !== undefined && (!prev || prev.hpCurrent !== d.hpCurrent)) c.hp.current = d.hpCurrent;
  c.hp.current = Math.min(Number(c.hp.current) || 0, Number(c.hp.max) || 0);

  // Mana works the same way, using "Mana Used" when the sheet has it.
  if (d.manaMax !== undefined) c.mana.max = d.manaMax;
  if (d.manaRegen !== undefined) c.mana.regen = d.manaRegen;
  if (d.manaUsed !== undefined) {
    if (!prev || prev.manaUsed !== d.manaUsed) c.mana.current = Math.max(0, (Number(c.mana.max) || 0) - d.manaUsed);
  } else if (!prev && d.manaMax !== undefined) c.mana.current = d.manaMax;
  c.mana.current = Math.min(Number(c.mana.current) || 0, Number(c.mana.max) || 0);

  // Lists. Keep ticks on combat steps and Owlbear-only weapon extras.
  if (d.combat) {
    const done = new Set((c.combat || []).filter((s) => s.done).map((s) => s.text));
    c.combat = d.combat.map((text) => ({ text, done: done.has(text) }));
  }
  if (d.features) c.features = d.features;
  if (d.feats) c.feats = d.feats;
  if (d.attacks) {
    const old = new Map((c.attacks || []).map((a) => [a.name, a]));
    c.attacks = d.attacks.map((a) => {
      const o = old.get(a.name) || {};
      return { bonus: o.bonus || 0, notes: o.notes || "", ...a, graze: a.graze ?? o.graze ?? false };
    });
  }
  if (d.spells) c.magic = { ...c.magic, spells: d.spells };
  if (d.psionics) c.psionics = d.psionics;
  if (d.equipment) c.equipment = d.equipment;
  if (d.money) c.money = { ...c.money, ...d.money };

  c.googleSheet = {
    ...link,
    lastSync: Date.now(),
    lastError: "",
    missing,
    snap: { hpCurrent: d.hpCurrent, manaUsed: d.manaUsed },
  };
  return c;
}

// One call: download, read, merge.
export async function syncFromGoogle(sheet) {
  const id = sheet?.googleSheet?.id;
  if (!id) throw new SheetError("No Google Sheet linked.");
  const tabs = parseWorkbook(await downloadWorkbook(id));
  const { data, missing } = readCharacter(tabs);
  if (!data.abilities || Object.keys(data.abilities).length < 3) {
    throw new SheetError("That doesn't look like a Myr'rodin character sheet. I couldn't find the ability scores.");
  }
  return mergeIntoSheet(sheet, data, missing);
}
