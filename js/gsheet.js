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
import { unzipSync, strFromU8 } from "../vendor/fflate.js?v=1.8.0";
import { ABILITIES, SKILLS, SPELL_LEVELS, derive } from "./rules.js?v=1.8.0";

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
const isNone = (v) => /^(none|n\/a|no|-)$/i.test(String(v ?? "").trim());
// "Weapons: Simple weapons…" — a label and its value in the same cell.
function inline(grid, word) {
  const cell = grid?.find((n, x) => n.startsWith(`${word}`) && /:/.test(String(x.v)))[0];
  if (!cell) return null;
  const rest = clean(String(cell.v).replace(/^[^:]*:\s*/, ""));
  return { cell, rest };
}

// Split "Resistance - Wisdom" into the spell's name and its note.
export function splitNote(text) {
  const t = clean(text);
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/) || t.match(/^(.+?)\s*\(([^)]+)\)$/);
  return m ? { name: m[1].trim(), note: m[2].trim() } : { name: t, note: "" };
}

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
    const notes = [];
    const note = basic.get(speedLabel.r + 2, speedLabel.c);
    if (note !== undefined && isText(note) && !isNum(note)) notes.push(clean(note));
    for (const x of basic.list.filter((x) => x.r === speedLabel.r && x.c > speedLabel.c && typeof x.v === "string" && /^(fly|swim|climb|burrow|hover)/i.test(x.v.trim()))) {
      const v = basic.get(x.r + 1, x.c);
      if (v !== undefined) notes.push(`${clean(x.v)} ${clean(v)}`);
    }
    if (notes.length) out.speedNotes = notes.join(", ");
  }

  const sheetInit = below(basic, label(basic, "initiative"), "num");
  const sheetWill = below(basic, label(basic, "will check"), "num");
  const sheetDC = below(basic, label(basic, "spell save dc"), "num");

  // Levels: the first "Level" label is the main level, a second one is the 2nd level.
  const levelLabels = basic ? basic.find((n) => n === "level").sort((a, b) => a.r - b.r || a.c - b.c) : [];
  const extras = [];
  const lv1 = below(basic, levelLabels[0], "num");
  const lv2 = below(basic, levelLabels[1], "num");
  const combinedCell = label(basic, "combined level");
  if (lv1 !== undefined) {
    out.level = toNum(lv1);
    if (lv2 !== undefined) out.level2 = toNum(lv2);
  } else if (combinedCell && below(basic, combinedCell, "num") !== undefined) {
    // Multiclass sheets: one column per class, then "Combined Level".
    out.level = toNum(below(basic, combinedCell, "num"));
    out.level2 = 0;
    const parts = basic.list
      .filter((x) => x.r === combinedCell.r && x.c < combinedCell.c && typeof x.v === "string" && isNum(basic.get(x.r + 1, x.c)))
      .sort((a, b) => a.c - b.c)
      .map((x) => `${clean(x.v)} ${toNum(basic.get(x.r + 1, x.c))}`);
    if (parts.length) extras.push(`Levels: ${parts.join(", ")}`);
  } else missing.push("Level");
  if (out.xp === undefined) {
    missing.splice(missing.indexOf("Experience"), missing.includes("Experience") ? 1 : 0);
    // Per-class experience: class names over big numbers on a label row.
    const classNames = String(out.class || "").toLowerCase();
    const xpCells = basic ? basic.list.filter((x) => typeof x.v === "string" && classNames.includes(norm(x.v)) && norm(x.v).length > 2 && toNum(basic.get(x.r + 1, x.c)) >= 1000) : [];
    if (xpCells.length) extras.push(`Experience: ${xpCells.sort((a, b) => a.c - b.c).map((x) => `${clean(x.v)} ${toNum(basic.get(x.r + 1, x.c)).toLocaleString()}`).join(", ")}`);
  }

  // Lineage & background: the text on the row under the Level label.
  const levelRowCell = levelLabels[0] || combinedCell;
  if (levelRowCell) {
    const valueRow = levelRowCell.r + 1;
    const texts = basic.list
      .filter((x) => x.r === valueRow && isText(x.v) && !isNum(x.v) && !/^\s*\d*d\d+/i.test(x.v) && !/^[\d,.\s]+$/.test(x.v))
      .sort((a, b) => a.c - b.c)
      .map((x) => clean(x.v));
    const strip = (s) => s.replace(/^background\s*[-–:]\s*/i, "").replace(/\s*background$/i, "").trim();
    // "Race: Avariel" and "Background: Fey Touched" say what they are.
    const rest = [];
    for (const t of texts) {
      if (/^race\s*:/i.test(t)) out.race = t.replace(/^race\s*:\s*/i, "");
      else if (/^background\s*:/i.test(t)) out.background = strip(t);
      else rest.push(t);
    }
    if (rest.length >= 2) { out.lineage = strip(rest[0]); out.background = strip(rest[1]); }
    else if (rest.length === 1) {
      if (/background/i.test(rest[0]) && !out.background) out.background = strip(rest[0]); else out.lineage = strip(rest[0]);
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
  // Other labelled numbers on the main tab (Wild Shape, Damage Dice, a soul
  // counter…) become info lines so nothing on the sheet is lost.
  if (basic) {
    const known = new Set(["initiative", "armor class", "ac", "speed", "max hp", "current hp", "experience", "xp", "spell save dc", "will check", "will save",
      "level", "combined level", "mana", "mana used", "mana regen", "money", "fly", "swim", "climb", "burrow", "hover"]);
    const classNames = String(out.class || "").toLowerCase();
    const labelRows = new Set(["initiative", "max hp", "spell save dc", "mana"].map((n) => label(basic, n)?.r).filter(Boolean));
    if (combinedCell) labelRows.add(combinedCell.r);
    const seen = new Set();
    for (const x of basic.list.filter((x) => labelRows.has(x.r) && typeof x.v === "string")) {
      const n = norm(x.v);
      if (known.has(n) || (n.length > 2 && classNames.includes(n)) || seen.has(n)) continue;
      const v = basic.get(x.r + 1, x.c);
      if (v === undefined || (typeof v === "string" && !isText(v))) continue;
      seen.add(n);
      extras.push(`${clean(x.v)}: ${clean(v)}`);
    }
  }

  out.features = [
    ...extras,
    ...listBelow(basic, label(basic, "skills/abilities", "skills / abilities", "abilities")),
    ...listBelow(basic, label(basic, "invocations")),
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
    if (v === undefined) {
      // A homebrew score like "Int+Wis": take the sheet's modifier and pick a
      // score that gives the same modifier.
      const sc = label(scores, want);
      const text = sc ? scores.get(sc.r + 1, sc.c) : undefined;
      const mod = sc ? scores.get(sc.r + 1, sc.c + 1) : undefined;
      if (isNum(mod)) {
        v = 10 + 2 * toNum(mod);
        out.warnings = out.warnings || [];
        out.warnings.push(`${a.name} is "${clean(text ?? "?")}" on the sheet (modifier ${toNum(mod) >= 0 ? "+" : ""}${toNum(mod)}), shown here as ${v} so the modifier matches.`);
      }
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
  const featsCell = label(scores, "feats");
  out.feats = [];
  if (featsCell) {
    for (let r = featsCell.r + 1; r <= featsCell.r + 12; r++) {
      const row = scores.list.filter((x) => x.r === r && x.c >= featsCell.c && x.c <= featsCell.c + 30).sort((a, b) => a.c - b.c);
      const texts = row.filter((x) => isText(x.v) && !isNum(x.v)).map((x) => clean(x.v));
      if (!row.length) break;
      out.feats.push(...texts);
    }
    out.feats = [...new Set(out.feats)];
  }
  // Labels with their values to the right, sometimes carrying on to the next row.
  const rightOf = (word) => {
    const cell = label(scores, word);
    if (cell) {
      const vals = listRight(scores, cell);
      // The list may carry on along the next row (starting under the label).
      const under = scores.get(cell.r + 1, cell.c);
      if (under === undefined || (isText(under) && !/:/.test(String(under)))) {
        if (under !== undefined && isText(under)) vals.push(clean(under));
        vals.push(...listRight(scores, { r: cell.r + 1, c: cell.c }));
      }
      return vals;
    }
    const inl = inline(scores, word);
    if (!inl) return [];
    const vals = inl.rest ? [inl.rest] : [];
    const nextCell = scores.get(inl.cell.r + 1, inl.cell.c);
    if (nextCell !== undefined && isText(nextCell) && !/:/.test(nextCell)) vals.push(clean(nextCell));
    return vals;
  };
  const langs = rightOf("languages");
  if (langs.length) out.languages = langs.join(", ");
  const weap = rightOf("weapons");
  if (weap.length) out.weaponProfs = weap.join(", ");
  const armor = rightOf("armor");
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
        damage: isNone(attackTab.get(r, t.col("die modifier"))) ? "" : clean(attackTab.get(r, t.col("die modifier")) ?? ""),
        damageType: isNone(attackTab.get(r, t.col("damage"))) ? "" : titleCase(clean(attackTab.get(r, t.col("damage")) ?? "")),
        sheetToHit: t.col("attack") && isNum(attackTab.get(r, t.col("attack"))) ? toNum(attackTab.get(r, t.col("attack"))) : undefined,
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
        // "Name" is two merged cells; some names were typed into the second half.
        let name = grid.get(r, t.col("name"));
        if (name === undefined || !isText(name)) name = grid.get(r, t.col("name") + 1);
        if (name === undefined || !isText(name) || isNum(name)) continue;
        const split = splitNote(name);
        const mana = grid.get(r, t.col("mana cost"));
        const lvl = level ?? (SPELL_LEVELS.find((l) => l.mana === toNum(mana))?.level ?? 1);
        const get = (k) => { const c = t.col(k); const v = c ? grid.get(r, c) : undefined; return v === undefined || !isText(v) || isNone(v) ? "" : clean(v); };
        // Damage: "Damage" on older sheets, "Die Modifier" (+ a flat "Modifier") on newer ones.
        let damage = get("damage") || get("die modifier");
        const flat = t.cols.modifier !== undefined ? grid.get(r, t.cols.modifier) : undefined;
        if (damage && isNum(flat) && toNum(flat)) damage = `${damage}+${toNum(flat)}`;
        else if (!damage && isNum(flat) && toNum(flat)) damage = String(toNum(flat));
        out.spells.push({
          level: lvl,
          name: split.name,
          note: split.note,
          type: get("type"),
          castTime: get("casting time"),
          range: get("range"),
          damage,
          damageType: (() => { const c = t.cols["type#2"]; const v = c ? grid.get(r, c) : undefined; return v && isText(v) && !isNone(v) ? clean(v) : ""; })(),
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
    const dv0 = derive(c);
    d.attacks.forEach((a) => {
      if (a.sheetToHit === undefined) return;
      a.bonus = a.sheetToHit - (dv0.mods[a.ability] + (a.proficient ? dv0.pb : 0));
      delete a.sheetToHit;
    });
    const old = new Map((c.attacks || []).map((a) => [a.name, a]));
    c.attacks = d.attacks.map((a) => {
      const o = old.get(a.name) || {};
      return { bonus: o.bonus || 0, notes: o.notes || "", ...a, graze: a.graze ?? o.graze ?? false };
    });
  }
  if (d.spells) c.magic = { ...c.magic, spells: d.spells };
  if (d.psionics) c.psionics = d.psionics;
  // Gear: the sheet's list, plus anything added in Owlbear (stash loot etc.).
  if (d.equipment) {
    const local = (c.equipment || []).filter((e) => e.local);
    const names = new Set(d.equipment.map((e) => e.name.toLowerCase()));
    c.equipment = [...d.equipment, ...local.filter((e) => !names.has(String(e.name).toLowerCase()))];
  }
  // Coins: only take the sheet's if it actually has some.
  if (d.money && Object.values(d.money).some((v) => Number(v))) c.money = { ...c.money, ...d.money };

  c.googleSheet = {
    ...link,
    lastSync: Date.now(),
    lastError: "",
    missing,
    warnings: d.warnings || [],
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
