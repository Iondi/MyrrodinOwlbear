// =====================================================================
//  HANDOUTS
//  Pictures sent from Discord with /show (through the Owlbear relay bot)
//  show up here. The GM's computer checks the relay every few seconds,
//  saves new handouts with the room, and pops them up for everyone.
//
//  Self-contained on purpose, so it could become its own extension later.
// =====================================================================
import { OBR, NS, inOBR, buildImage, asset } from "./bridge.js?v=1.10.7";

export const HANDOUTS_KEY = `${NS}/handouts`;
export const SHOW_CHANNEL = `${NS}/handout-show`;
export const HANDOUT_MODAL = `${NS}/handout-modal`;
const RELAY_PREF = "myrrodin-relay";        // { url, key } — GM's browser only (the key stays private)
const SEEN_PREF = "myrrodin-relay-seen";    // newest handout already popped up
const KEEP = 20;                             // handouts saved with the room
const POLL_MS = 6000;

// ---- Relay settings (GM only, saved in this browser) -----------------------
export function relay() {
  try { return JSON.parse(localStorage.getItem(RELAY_PREF)) || { url: "", key: "" }; } catch { return { url: "", key: "" }; }
}
export function setRelay(url, key) {
  const clean = String(url || "").trim().replace(/\/+$/, "");
  const full = clean && !/^https?:\/\//i.test(clean) ? `https://${clean}` : clean;
  try { localStorage.setItem(RELAY_PREF, JSON.stringify({ url: full, key: String(key || "").trim() })); } catch { /* ignore */ }
  // Don't pop up everything that was already there when you connect.
  try { localStorage.setItem(SEEN_PREF, String(Date.now())); } catch { /* ignore */ }
  return relay();
}
const seen = () => Number(localStorage.getItem(SEEN_PREF)) || 0;
const setSeen = (t) => { try { localStorage.setItem(SEEN_PREF, String(t)); } catch { /* ignore */ } };

async function relayFetch(path, init) {
  const { url, key } = relay();
  if (!url || !key) throw new Error("Not connected to the relay yet.");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${path}${sep}key=${encodeURIComponent(key)}`, { cache: "no-store", ...init });
  if (res.status === 403) throw new Error("Wrong FEED_KEY.");
  if (!res.ok) throw new Error(`The relay answered ${res.status}.`);
  return res.json();
}
export async function testRelay() {
  const r = await relayFetch("/feed");
  return (r.handouts || []).length;
}

// ---- Saved with the room ---------------------------------------------------
// Kept small: { i: id, t: title, u: url, b: by, a: time }
const listeners = new Set();
const PREVIEW = "myrrodin-preview-handouts";
export async function getHandouts() {
  if (!inOBR) { try { return JSON.parse(localStorage.getItem(PREVIEW)) || []; } catch { return []; } }
  const meta = await OBR.room.getMetadata();
  return meta[HANDOUTS_KEY] || [];
}
async function setHandouts(list) {
  list = list.slice(0, KEEP);
  if (!inOBR) { try { localStorage.setItem(PREVIEW, JSON.stringify(list)); } catch { /* ignore */ } listeners.forEach((f) => f(list)); return; }
  await OBR.room.setMetadata({ [HANDOUTS_KEY]: list });
}
export function onHandoutsChange(cb) {
  if (!inOBR) { listeners.add(cb); return () => listeners.delete(cb); }
  return OBR.room.onMetadataChange((meta) => cb(meta[HANDOUTS_KEY] || []));
}
export const expand = (h) => ({ id: h.i, title: h.t, url: h.u, by: h.b, at: h.a });

// ---- GM's computer: check the relay ------------------------------------------
export function startRelayPolling(onStatus = () => {}) {
  let timer = null;
  const tick = async () => {
    clearTimeout(timer);
    const { url, key } = relay();
    if (url && key) {
      try {
        const { handouts = [] } = await relayFetch("/feed");
        const room = await getHandouts();
        const have = new Set(room.map((h) => h.i));
        const fresh = handouts.filter((h) => !have.has(h.id)).sort((a, b) => b.at - a.at);
        if (fresh.length) {
          const next = [...fresh.map((h) => ({ i: h.id, t: h.title, u: h.url, b: h.by, a: h.at })), ...room].sort((a, b) => b.a - a.a);
          await setHandouts(next);
          // Pop up the newest one that asked to be shown and hasn't been yet.
          const pop = fresh.filter((h) => h.show && h.at > seen()).sort((a, b) => b.at - a.at)[0];
          if (fresh.length) setSeen(Math.max(seen(), ...fresh.map((h) => h.at)));
          if (pop) await showToEveryone({ id: pop.id, title: pop.title, url: pop.url, by: pop.by });
        }
        onStatus({ ok: true, at: Date.now() });
      } catch (err) {
        onStatus({ ok: false, at: Date.now(), error: err?.message || String(err) });
      }
    }
    timer = setTimeout(tick, POLL_MS);
  };
  tick();
  window.addEventListener("storage", (e) => { if (e.key === RELAY_PREF) tick(); });
  return () => clearTimeout(timer);
}

// ---- Showing a handout --------------------------------------------------------
export async function showToEveryone(h) {
  if (!inOBR) return viewHandout(h);
  await OBR.broadcast.sendMessage(SHOW_CHANNEL, h, { destination: "ALL" });
}
export async function viewHandout(h) {
  const url = asset(`handout.html?u=${encodeURIComponent(h.url)}&t=${encodeURIComponent(h.title || "")}&b=${encodeURIComponent(h.by || "")}&v=1.10.7`);
  if (!inOBR) { window.open(url, "_blank"); return; }
  await OBR.modal.close(HANDOUT_MODAL).catch(() => {});
  await OBR.modal.open({ id: HANDOUT_MODAL, url, fullScreen: true, hideBackdrop: true, hidePaper: true });
}

// ---- GM tools ------------------------------------------------------------------
export async function removeHandout(id) {
  try { await relayFetch(`/delete?id=${encodeURIComponent(id)}`, { method: "POST" }); } catch { /* still remove from the room */ }
  await setHandouts((await getHandouts()).filter((h) => h.i !== id));
}

// Drop the picture on the map, about 6 squares wide, in the middle of the view.
export async function placeOnMap(h) {
  if (!inOBR) return;
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't load the picture."));
    el.src = h.url;
  });
  const width = img.naturalWidth, height = img.naturalHeight;
  const type = await fetch(h.url, { method: "HEAD" }).then((r) => (r.ok ? r.headers.get("content-type") || "" : "")).catch(() => "");
  const mime = type.startsWith("image/") ? type.split(";")[0] : "image/png";
  const [w, hgt] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  const center = await OBR.viewport.inverseTransformPoint({ x: w / 2, y: hgt / 2 });
  const dpi = Math.max(1, Math.round(width / 6));
  const item = buildImage({ url: h.url, mime, width, height }, { dpi, offset: { x: width / 2, y: height / 2 } })
    .position(center)
    .layer("PROP")
    .name(h.title || "Handout")
    .build();
  await OBR.scene.items.addItems([item]);
}
