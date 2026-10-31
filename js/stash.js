// =====================================================================
//  PARTY STASH
//  One shared loot list for the whole room (it follows you between
//  scenes). The GM's computer makes every change: players ask by message
//  ("take this", "stash that") and the GM's side moves the items.
// =====================================================================
import { OBR, NS, inOBR, listSheets, saveSheet, getToken } from "./bridge.js?v=1.8.0";
import { normalize } from "./rules.js?v=1.8.0";

export const STASH_KEY = `${NS}/stash`;
export const STASH_CHANNEL = `${NS}/stash-request`;
const COINS = ["cp", "sp", "ep", "gp", "pp"];
const empty = () => ({ items: [], money: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } });
const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v) => Number(v) || 0;

// ---- Storage (room data in Owlbear; this browser in preview) -------------
const PREVIEW_KEY = "myrrodin-preview-stash";
const listeners = new Set();

export async function getStash() {
  if (!inOBR) { try { return JSON.parse(localStorage.getItem(PREVIEW_KEY)) || empty(); } catch { return empty(); } }
  const meta = await OBR.room.getMetadata();
  return { ...empty(), ...(meta[STASH_KEY] || {}) };
}
async function setStash(st) {
  if (!inOBR) {
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(st)); } catch { /* ignore */ }
    listeners.forEach((f) => f(st));
    return;
  }
  await OBR.room.setMetadata({ [STASH_KEY]: st });
}
export function onStashChange(cb) {
  if (!inOBR) {
    listeners.add(cb);
    const h = (e) => { if (e.key === PREVIEW_KEY) cb(JSON.parse(e.newValue || "null") || empty()); };
    window.addEventListener("storage", h);
    return () => { listeners.delete(cb); window.removeEventListener("storage", h); };
  }
  return OBR.room.onMetadataChange((meta) => cb({ ...empty(), ...(meta[STASH_KEY] || {}) }));
}
async function update(fn) {
  const draft = structuredClone(await getStash());
  const next = fn(draft) || draft;
  await setStash(next);
  return next;
}

// ---- Moving things between the stash and a character ----------------------
async function sheetOf(id) {
  const t = await getToken(id);
  return t?.sheet ? normalize(t.sheet) : null;
}

// Equipment added in Owlbear is marked "local" so a Google Sheet sync keeps it.
function addToGear(c, item, qty) {
  const same = c.equipment.find((e) => e.name.trim().toLowerCase() === item.name.trim().toLowerCase());
  if (same) same.qty = num(same.qty || 1) + qty;
  else c.equipment.push({ name: item.name, qty, notes: item.notes || "", local: true });
}

export async function takeItem(itemId, sheetId, qty = 1) {
  const st = await getStash();
  const item = st.items.find((i) => i.id === itemId);
  const c = await sheetOf(sheetId);
  if (!item || !c) return;
  const n = Math.max(1, Math.min(num(item.qty || 1), qty));
  addToGear(c, item, n);
  await saveSheet(sheetId, c);
  await update((s) => {
    const it = s.items.find((i) => i.id === itemId);
    if (!it) return;
    it.qty = num(it.qty || 1) - n;
    if (it.qty <= 0) s.items = s.items.filter((i) => i.id !== itemId);
  });
}

export async function stashFromSheet(sheetId, index, qty, name) {
  const c = await sheetOf(sheetId);
  if (!c) return;
  // The list may have changed since the request was sent: match by name too.
  if (name && c.equipment[index]?.name !== name) index = c.equipment.findIndex((e) => e.name === name);
  const gear = c.equipment[index];
  if (!gear) return;
  const have = num(gear.qty || 1);
  const n = Math.max(1, Math.min(have, qty || have));
  await update((s) => {
    const same = s.items.find((i) => i.name.trim().toLowerCase() === gear.name.trim().toLowerCase());
    if (same) same.qty = num(same.qty || 1) + n;
    else s.items.push({ id: uid(), name: gear.name, qty: n, notes: gear.notes || "", from: c.name });
  });
  if (n >= have) c.equipment.splice(index, 1); else gear.qty = have - n;
  await saveSheet(sheetId, c);
}

// ---- GM-only edits ------------------------------------------------------------
export const addItem = (name, qty = 1, notes = "") => update((s) => { s.items.push({ id: uid(), name, qty: Math.max(1, num(qty)), notes }); });
export const editItem = (id, patch) => update((s) => { const it = s.items.find((i) => i.id === id); if (it) Object.assign(it, patch); });
export const removeItem = (id) => update((s) => { s.items = s.items.filter((i) => i.id !== id); });
export const setCoin = (coin, value) => update((s) => { s.money[coin] = Math.max(0, num(value)); });

// Split the stash's coins evenly between the player characters on the board.
export async function splitCoins() {
  const st = await getStash();
  const party = (await listSheets()).filter((x) => x.sheet?.ownerId);
  if (!party.length) return { count: 0 };
  const left = { ...st.money };
  for (const { id, sheet } of party) {
    const c = normalize(sheet);
    for (const k of COINS) c.money[k] = num(c.money[k]) + Math.floor(num(st.money[k]) / party.length);
    await saveSheet(id, c);
  }
  for (const k of COINS) left[k] = num(st.money[k]) % party.length;
  await update((s) => { s.money = left; });
  return { count: party.length };
}

// ---- Players ask; the GM's computer does it ----------------------------------
export async function request(msg) {
  if (!inOBR) return handle(msg);
  await OBR.broadcast.sendMessage(STASH_CHANNEL, msg, { destination: "ALL" });
}
export async function handle(msg) {
  if (msg?.type === "take") return takeItem(msg.itemId, msg.sheetId, msg.qty);
  if (msg?.type === "stash") return stashFromSheet(msg.sheetId, msg.index, msg.qty, msg.name);
}
