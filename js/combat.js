// =====================================================================
//  COMBAT & INITIATIVE
//  The fight lives in the scene's shared data, so everyone in the room
//  sees the same order. The GM's computer makes the changes; players ask
//  to join by sending a message, and the GM's side adds them.
// =====================================================================
import { OBR, NS, inOBR, listSheets, broadcastRoll } from "./bridge.js?v=1.7.1";
import { derive, normalize } from "./rules.js?v=1.7.1";
import { roll, d20 } from "./dice.js?v=1.7.1";

export const COMBAT_KEY = `${NS}/combat`;
export const JOIN_CHANNEL = `${NS}/combat-join`;

// ---- Reading and writing the shared combat state ----------------------
const PREVIEW_KEY = "myrrodin-preview-combat";
const previewListeners = new Set();

export async function getCombat() {
  if (!inOBR) { try { return JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null"); } catch { return null; } }
  const meta = await OBR.scene.getMetadata();
  return meta[COMBAT_KEY] || null;
}

async function setCombat(state) {
  if (!inOBR) {
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    previewListeners.forEach((f) => f(state));
    return;
  }
  await OBR.scene.setMetadata({ [COMBAT_KEY]: state });
}

export function onCombatChange(callback) {
  if (!inOBR) {
    previewListeners.add(callback);
    const h = (e) => { if (e.key === PREVIEW_KEY) callback(JSON.parse(e.newValue || "null")); };
    window.addEventListener("storage", h);
    return () => { previewListeners.delete(callback); window.removeEventListener("storage", h); };
  }
  return OBR.scene.onMetadataChange((meta) => callback(meta[COMBAT_KEY] || null));
}

async function update(fn) {
  const cur = await getCombat();
  if (!cur) return null;
  const draft = structuredClone(cur);
  const next = fn(draft) || draft;
  await setCombat(next);
  return next;
}

// ---- Ordering -------------------------------------------------------
// Highest initiative first; ties go to the higher Dexterity score, then name.
export function ordered(state) {
  return (state?.entries || [])
    .filter((e) => e.init !== null && e.init !== undefined)
    .sort((a, b) => b.init - a.init || (b.dex || 0) - (a.dex || 0) || String(a.name).localeCompare(String(b.name)));
}
export const waiting = (state) => (state?.entries || []).filter((e) => e.init === null || e.init === undefined);

// ---- Who belongs to whom ---------------------------------------------
// A sheet with an owner is a player's character: they roll their own.
// Everything else (monsters, NPCs, sheets owned by "anyone") is rolled by the GM.
const isPlayerSheet = (sheet) => !!sheet?.ownerId;

export function rollInitiative(sheet) {
  const c = normalize(sheet);
  const d = derive(c);
  const r = roll(d20(d.initiative));
  return { init: r.total, dex: Number(c.abilities.dex) || 10, detail: r.detail, natural: r.natural, dice: r.dice, bonus: d.initiative };
}

// ---- GM actions -------------------------------------------------------
export async function startCombat() {
  const sheets = await listSheets();
  const entries = [];
  const npcRolls = [];
  for (const { id, name, sheet } of sheets) {
    const c = normalize(sheet);
    const base = { id, name: c.name || name, hidden: !!c.gmOnly, owner: c.ownerId || "", kind: isPlayerSheet(c) ? "player" : "npc" };
    if (base.kind === "player") entries.push({ ...base, init: null, dex: Number(c.abilities.dex) || 10 });
    else {
      const r = rollInitiative(c);
      entries.push({ ...base, init: r.init, dex: r.dex, detail: r.detail });
      npcRolls.push(`${base.name} ${r.init}`);
    }
  }
  const state = { id: `c${Date.now()}`, active: true, round: 1, currentId: null, started: Date.now(), entries };
  await setCombat(state);
  if (npcRolls.length) {
    broadcastRoll({
      character: "GM", label: `Initiative for ${npcRolls.length} creature${npcRolls.length === 1 ? "" : "s"}`,
      total: "⚔", detail: npcRolls.join(" · "), hidden: true,
    }).catch(() => {});
  }
  return state;
}

// Pick up sheets added to the board after combat started.
export async function addFromBoard() {
  const sheets = await listSheets();
  return update((s) => {
    const have = new Set(s.entries.map((e) => e.id));
    for (const { id, name, sheet } of sheets) {
      if (have.has(id)) continue;
      const c = normalize(sheet);
      const base = { id, name: c.name || name, hidden: !!c.gmOnly, owner: c.ownerId || "", kind: isPlayerSheet(c) ? "player" : "npc" };
      if (base.kind === "player") s.entries.push({ ...base, init: null, dex: Number(c.abilities.dex) || 10 });
      else { const r = rollInitiative(c); s.entries.push({ ...base, init: r.init, dex: r.dex, detail: r.detail }); }
    }
  });
}

export const begin = () => update((s) => { s.currentId = ordered(s)[0]?.id || null; s.round = 1; });

export const nextTurn = () => update((s) => {
  const list = ordered(s);
  if (!list.length) return;
  const i = list.findIndex((e) => e.id === s.currentId);
  if (i === -1) { s.currentId = list[0].id; return; }
  if (i + 1 >= list.length) { s.round += 1; s.currentId = list[0].id; } else s.currentId = list[i + 1].id;
});

export const prevTurn = () => update((s) => {
  const list = ordered(s);
  if (!list.length) return;
  const i = list.findIndex((e) => e.id === s.currentId);
  if (i <= 0) { if (s.round > 1) { s.round -= 1; s.currentId = list[list.length - 1].id; } else s.currentId = list[0].id; }
  else s.currentId = list[i - 1].id;
});

export const setInit = (id, value) => update((s) => {
  const e = s.entries.find((x) => x.id === id);
  if (e) { e.init = Number(value); e.detail = "set by GM"; }
});

export const removeEntry = (id) => update((s) => {
  const list = ordered(s);
  if (s.currentId === id) {
    const i = list.findIndex((e) => e.id === id);
    const after = list.filter((e) => e.id !== id);
    s.currentId = after.length ? after[Math.min(i, after.length - 1)].id : null;
  }
  s.entries = s.entries.filter((e) => e.id !== id);
});

export const endCombat = () => (inOBR ? OBR.scene.setMetadata({ [COMBAT_KEY]: null }) : setCombat(null));

// A player's roll (or a decline) arriving at the GM's computer.
export const applyJoin = (msg) => update((s) => {
  if (!msg?.id) return;
  const e = s.entries.find((x) => x.id === msg.id);
  if (msg.decline) { s.entries = s.entries.filter((x) => x.id !== msg.id || x.init !== null); return; }
  if (e) Object.assign(e, { init: msg.init, dex: msg.dex ?? e.dex, detail: msg.detail, name: msg.name || e.name });
  else s.entries.push({ id: msg.id, name: msg.name, init: msg.init, dex: msg.dex, detail: msg.detail, kind: "player", owner: msg.owner || "" });
});

// ---- Player side ----------------------------------------------------------
// Roll for one of my sheets, show the dice to everyone, and tell the GM.
export async function joinWith(entry, sheet, playerName) {
  const c = normalize(sheet);
  const r = rollInitiative(c);
  broadcastRoll({
    character: c.name, player: playerName || "", label: "Initiative", total: r.init, detail: r.detail,
    crit: r.natural === 20, fumble: r.natural === 1, hidden: false, dice: r.dice,
  }).catch(() => {});
  const msg = { id: entry.id, name: c.name, init: r.init, dex: r.dex, detail: r.detail, owner: c.ownerId || "" };
  if (inOBR) await OBR.broadcast.sendMessage(JOIN_CHANNEL, msg, { destination: "ALL" });
  else await applyJoin(msg);
  return r;
}

export async function decline(entry) {
  const msg = { id: entry.id, decline: true };
  if (inOBR) await OBR.broadcast.sendMessage(JOIN_CHANNEL, msg, { destination: "ALL" });
  else await applyJoin(msg);
}

// GM rolling on a player's behalf (they're away, or asked).
export async function rollFor(entryId) {
  const sheets = await listSheets();
  const found = sheets.find((s) => s.id === entryId);
  if (!found) return;
  const r = rollInitiative(found.sheet);
  await applyJoin({ id: entryId, name: normalize(found.sheet).name, init: r.init, dex: r.dex, detail: `${r.detail} (rolled by GM)` });
}
