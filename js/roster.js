// =====================================================================
//  THE PARTY ROSTER
//  Player characters are saved with the ROOM, not just on a token, so a
//  new or refreshed scene doesn't lose them.
//
//  - Any sheet with an owner joins the party automatically.
//  - The GM's computer keeps the saved copy up to date as you play.
//  - On a new scene, drop a token with the same picture or name and the
//    sheet attaches by itself, or use "Place party on map".
//
//  Owlbear limits how much a room can store, so sheets are compressed,
//  and Google-linked characters only store the link (the sheet reloads
//  from Google).
// =====================================================================
import { OBR, NS, KEY, inOBR, listSheets, saveSheet, tokenLabel, buildImage } from "./bridge.js?v=1.9.1";
import { normalize } from "./rules.js?v=1.9.1";
import { deflateSync, inflateSync, strToU8, strFromU8 } from "../vendor/fflate.js?v=1.9.1";

export const ROSTER_KEY = `${NS}/party`;
const PREVIEW_KEY = "myrrodin-preview-party";
export const ROOM_LIMIT = 16 * 1024; // Owlbear's room storage is small; we warn well before this.
const uid = () => `pc-${Math.random().toString(36).slice(2, 9)}`;
const num = (v) => Number(v) || 0;

// ---- Packing a sheet small ----------------------------------------------------
const toB64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
export const pack = (obj) => toB64(deflateSync(strToU8(JSON.stringify(obj)), { level: 9 }));
export const unpackZ = (z) => JSON.parse(strFromU8(inflateSync(fromB64(z))));

function memberFrom(id, sheet, item, old = {}) {
  const c = normalize(sheet);
  const m = {
    id,
    ownerId: c.ownerId || "",
    name: c.name,
    play: { hp: num(c.hp.current), max: num(c.hp.max), temp: num(c.hp.temp), mana: num(c.mana.current), manaMax: num(c.mana.max), ac: num(c.ac) },
    // Remember the token's look so it can be placed again on a new map.
    token: item?.image ? { image: item.image, grid: item.grid, scale: item.scale, label: (item.text?.plainText || "").trim() || c.name } : old.token || null,
  };
  if (c.googleSheet?.id) m.link = { id: c.googleSheet.id, url: c.googleSheet.url || "" };
  else m.z = pack({ ...c, partyId: undefined });
  return m;
}

// Rebuild a full sheet from what the room saved.
export function sheetFor(m) {
  let c;
  if (m.z) { try { c = unpackZ(m.z); } catch { c = null; } }
  if (!c) c = { name: m.name, googleSheet: m.link ? { id: m.link.id, url: m.link.url, auto: true, lastSync: 0 } : undefined };
  c = normalize(c);
  c.partyId = m.id;
  c.ownerId = m.ownerId;
  const p = m.play || {};
  if (p.max) { c.hp.max = c.hp.max || p.max; c.hp.current = p.hp; c.hp.temp = p.temp || 0; }
  if (p.manaMax) c.mana.current = Math.min(p.mana, c.mana.max || p.manaMax);
  if (!c.ac && p.ac) c.ac = p.ac;
  return c;
}

// ---- Storage --------------------------------------------------------------
const listeners = new Set();
export async function getRoster() {
  if (!inOBR) { try { return JSON.parse(localStorage.getItem(PREVIEW_KEY)) || { members: {} }; } catch { return { members: {} }; } }
  const meta = await OBR.room.getMetadata();
  return meta[ROSTER_KEY] || { members: {} };
}
async function setRoster(r) {
  if (!inOBR) { try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(r)); } catch { /* ignore */ } listeners.forEach((f) => f(r)); return; }
  await OBR.room.setMetadata({ [ROSTER_KEY]: r });
}
export function onRosterChange(cb) {
  if (!inOBR) {
    listeners.add(cb);
    const h = (e) => { if (e.key === PREVIEW_KEY) cb(JSON.parse(e.newValue || "null") || { members: {} }); };
    window.addEventListener("storage", h);
    return () => { listeners.delete(cb); window.removeEventListener("storage", h); };
  }
  return OBR.room.onMetadataChange((meta) => cb(meta[ROSTER_KEY] || { members: {} }));
}
export const rosterSize = (r) => new Blob([JSON.stringify(r || {})]).size;

export async function removeMember(id) {
  const r = await getRoster();
  delete r.members[id];
  await setRoster(r);
}

// ---- GM's computer: keep the saved party in step with the tokens ----------
const isMemberSheet = (s) => !!(s?.ownerId || s?.partyId);

export async function mirrorFromScene() {
  const sheets = await listSheets();
  if (!sheets.length) return;
  const items = inOBR ? await OBR.scene.items.getItems(sheets.map((s) => s.id)) : [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const r = await getRoster();
  let changed = false;
  for (const { id, sheet } of sheets) {
    if (!isMemberSheet(sheet)) continue;
    let pid = sheet.partyId;
    if (!pid || !r.members[pid]) {
      // New party member: give the sheet a party id so it can find its way back.
      pid = pid || uid();
      if (sheet.partyId !== pid) await saveSheet(id, { ...sheet, partyId: pid });
    }
    const next = memberFrom(pid, sheet, itemById.get(id), r.members[pid]);
    const before = r.members[pid];
    if (!before || JSON.stringify({ ...before, updated: 0 }) !== JSON.stringify({ ...next, updated: 0 })) {
      r.members[pid] = { ...next, updated: Date.now() };
      changed = true;
    }
  }
  if (changed) await setRoster(r);
  return r;
}

// Attach saved characters to new tokens that look like them (same picture,
// or the token's name matches the character's name).
export async function autoAttach(syncLinked) {
  if (!inOBR) return;
  const r = await getRoster();
  const members = Object.values(r.members || {});
  if (!members.length) return;
  const all = await OBR.scene.items.getItems((i) => i.layer === "CHARACTER");
  const present = new Set(all.map((i) => i.metadata?.[KEY]?.partyId).filter(Boolean));
  for (const item of all) {
    if (item.metadata?.[KEY]) continue;
    const label = tokenLabel(item).trim().toLowerCase();
    const url = item.image?.url;
    const m = members.find((x) => !present.has(x.id) && ((url && x.token?.image?.url === url) || (label && label === String(x.name).trim().toLowerCase())));
    if (!m) continue;
    present.add(m.id);
    await attach(m, item.id, syncLinked);
  }
}

export async function attach(m, itemId, syncLinked) {
  let c = sheetFor(m);
  if (c.googleSheet?.id && syncLinked) { try { c = normalize(await syncLinked(c)); } catch { /* sheet reloads on the next sync */ } }
  await saveSheet(itemId, c);
}

// Place every party member who isn't on this map yet, near the middle of the view.
export async function placeParty(ids) {
  if (!inOBR) return 0;
  const r = await getRoster();
  const onMap = new Set((await listSheets()).map((s) => s.sheet?.partyId).filter(Boolean));
  const todo = Object.values(r.members).filter((m) => (!ids || ids.includes(m.id)) && !onMap.has(m.id) && m.token?.image?.url);
  if (!todo.length) return 0;
  const [w, h] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  const center = await OBR.viewport.inverseTransformPoint({ x: w / 2, y: h / 2 });
  const dpi = await OBR.scene.grid.getDpi().catch(() => 150);
  const items = todo.map((m, i) => {
    const offset = { x: (i - (todo.length - 1) / 2) * dpi, y: 0 };
    const c = sheetFor(m);
    return buildImage(m.token.image, m.token.grid)
      .scale(m.token.scale || { x: 1, y: 1 })
      .position({ x: center.x + offset.x, y: center.y + offset.y })
      .layer("CHARACTER")
      .name(m.token.label || m.name)
      .plainText(m.token.label || m.name)
      .metadata({ [KEY]: c })
      .build();
  });
  await OBR.scene.items.addItems(items);
  return items.length;
}
