// Talks to Owlbear Rodeo. When a page is opened outside Owlbear (for
// testing in a normal browser tab), it falls back to "preview mode" and
// keeps everything in this browser only.
import OBR, { buildImage } from "../vendor/obr-sdk.js?v=1.9.5";

export const NS = "com.emberbelle.myrrodin";
export const KEY = `${NS}/sheet`;
export const ROLL_CHANNEL = `${NS}/roll`;
export const LOG_KEY = "myrrodin-roll-log";
export const SHEET_MODAL = `${NS}/sheet-modal`;
export const DICE_MODAL = `${NS}/dice-modal`;
export const DICE_CHANNEL = `${NS}/dice-show`;
export const DICE_CONTROL = `${NS}/dice-control`;
// Per-player switches kept in this browser.
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
export const diceAnimOn = () => pref("myrrodin-dice-anim", "on") !== "off";
export const setDiceAnim = (on) => { try { localStorage.setItem("myrrodin-dice-anim", on ? "on" : "off"); } catch { /* ignore */ } };
// The sheet window says "I'm open" every couple of seconds; your own rolls
// then animate inside the sheet instead of over the map.
export const markSheetOpen = () => { try { localStorage.setItem("myrrodin-sheet-open", String(Date.now())); } catch { /* ignore */ } };
export const HUD_MODAL = `${NS}/hud-modal`;
export const hudOn = () => pref("myrrodin-hud", "on") !== "off";
export const setHudOn = (on) => { try { localStorage.setItem("myrrodin-hud", on ? "on" : "off"); } catch { /* ignore */ } };
export const hudCorner = () => pref("myrrodin-hud-corner", "br");
export const setHudCorner = (c) => { try { localStorage.setItem("myrrodin-hud-corner", c); } catch { /* ignore */ } };
export const partyFramesOn = () => pref("myrrodin-party-frames", "on") !== "off";
export const setPartyFramesOn = (on) => { try { localStorage.setItem("myrrodin-party-frames", on ? "on" : "off"); } catch { /* ignore */ } };
export const partyCorner = () => pref("myrrodin-party-corner", "tl");
export const setPartyCorner = (c) => { try { localStorage.setItem("myrrodin-party-corner", c); } catch { /* ignore */ } };
export const menuTab = () => pref("myrrodin-menu-tab", "party");
export const setMenuTab = (t) => { try { localStorage.setItem("myrrodin-menu-tab", t); } catch { /* ignore */ } };
export const sheetRecentlyOpen = () => Date.now() - Number(pref("myrrodin-sheet-open", "0")) < 4000;
export const inOBR = OBR.isAvailable;
export { OBR, buildImage };

// Full URL of a file in this extension (works on GitHub Pages sub-folders).
export const asset = (path) => new URL(`../${path}`, import.meta.url).href;

export function whenReady() {
  if (!inOBR) return Promise.resolve();
  return new Promise((resolve) => OBR.onReady(resolve));
}

// ---- Preview-mode storage --------------------------------------------
const PREVIEW_KEY = "myrrodin-preview-items";
const previewItems = () => {
  try { return JSON.parse(localStorage.getItem(PREVIEW_KEY) || "{}"); } catch { return {}; }
};
const previewSave = (all) => {
  try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(all)); } catch { /* ignore */ }
};

// ---- Who am I -----------------------------------------------------------
export async function me() {
  if (!inOBR) {
    // Preview only: add ?as=player to the address to see the player's view.
    const asPlayer = new URLSearchParams(location.search).get("as") === "player";
    return asPlayer
      ? { id: "preview-player", role: "PLAYER", name: "Player (preview)", connectionId: "local-p" }
      : { id: "preview-gm", role: "GM", name: "You (preview)", connectionId: "local" };
  }
  const [id, role, name, connectionId] = await Promise.all([
    OBR.player.getId(), OBR.player.getRole(), OBR.player.getName(), OBR.player.getConnectionId(),
  ]);
  return { id, role, name, connectionId };
}

export async function partyPlayers() {
  if (!inOBR) return [];
  return OBR.party.getPlayers();
}

// ---- Tokens & sheets --------------------------------------------------
// The name you type under a token in Owlbear is its label (item.text).
// item.name is the image's name ("Beast" for the boar), so it's only a fallback.
export function tokenLabel(item) {
  const t = item?.text;
  let label = "";
  if (t) {
    if (t.type === "RICH" && Array.isArray(t.richText)) {
      const walk = (nodes) => nodes.map((n) => (typeof n.text === "string" ? n.text : Array.isArray(n.children) ? walk(n.children) : "")).join("");
      label = t.richText.map((p) => walk(p.children || [])).join(" ");
    }
    if (!label.trim()) label = t.plainText || "";
  }
  return label.replace(/\s+/g, " ").trim() || item?.name || "";
}

export async function getToken(itemId) {
  if (!inOBR) {
    const p = previewItems()[itemId];
    return p ? { id: itemId, name: p.name, image: null, createdUserId: "preview-gm", sheet: p } : { id: itemId, name: "Preview token", sheet: null };
  }
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return null;
  return {
    id: item.id,
    name: tokenLabel(item),
    imageName: item.name || "",
    image: item.image?.url || null,
    createdUserId: item.createdUserId,
    sheet: item.metadata?.[KEY] || null,
  };
}

export async function saveSheet(itemId, sheet) {
  if (!inOBR) {
    const all = previewItems();
    all[itemId] = sheet;
    previewSave(all);
    return;
  }
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) item.metadata[KEY] = sheet;
  });
}

export async function deleteSheet(itemId) {
  if (!inOBR) {
    const all = previewItems();
    delete all[itemId];
    previewSave(all);
    return;
  }
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) delete item.metadata[KEY];
  });
}

export async function listSheets() {
  if (!inOBR) {
    return Object.entries(previewItems()).map(([id, sheet]) => ({ id, name: sheet.name, image: null, sheet }));
  }
  const items = await OBR.scene.items.getItems((item) => item.metadata?.[KEY] !== undefined);
  return items.map((item) => ({ id: item.id, name: tokenLabel(item), image: item.image?.url || null, sheet: item.metadata[KEY] }));
}

export function onSheetsChange(callback) {
  if (!inOBR) {
    const handler = (e) => { if (e.key === PREVIEW_KEY) callback(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
  return OBR.scene.items.onChange(() => callback());
}

export async function openSheet(itemId, extra = "") {
  const url = asset(`sheet.html?id=${encodeURIComponent(itemId)}${extra}&v=1.3.0`);
  if (!inOBR) { window.open(url, "_blank"); return; }
  await OBR.modal.open({ id: SHEET_MODAL, url, width: 920, height: 780 });
}

export async function closeSheet() {
  if (inOBR) await OBR.modal.close(SHEET_MODAL);
  else window.close();
}

// ---- Rolls ------------------------------------------------------------
export async function broadcastRoll(event) {
  if (!inOBR) {
    appendLog({ ...event, at: Date.now() });
    return;
  }
  await OBR.broadcast.sendMessage(ROLL_CHANNEL, event, { destination: "ALL" });
}

export function readLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
}

export function appendLog(entry) {
  const log = readLog();
  log.unshift(entry);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 40))); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("myrrodin-log"));
}

export function notify(text, variant = "DEFAULT") {
  if (inOBR) return OBR.notification.show(text, variant);
  return null;
}
