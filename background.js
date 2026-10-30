// Runs invisibly in every player's Owlbear tab.
// 1) Adds "Myr'rodin Sheet" to the right-click menu on character tokens.
// 2) Shows everyone's dice rolls as notifications and keeps a roll log.
import { OBR, NS, KEY, ROLL_CHANNEL, asset, appendLog, openSheet, me, listSheets, saveSheet, tokenLabel, DICE_MODAL, DICE_CHANNEL, DICE_CONTROL, diceAnimOn, sheetRecentlyOpen } from "./bridge.js?v=1.5.0";
import { syncFromGoogle } from "./gsheet.js?v=1.5.0";
import * as Combat from "./combat.js?v=1.5.0";
import { normalize } from "./rules.js?v=1.5.0";

const SYNC_EVERY_MS = 60 * 1000;
const STAMP_EVERY_MS = 5 * 60 * 1000;

// Everything except the sync timestamp, to tell whether anything really changed.
const body = (s) => JSON.stringify({ ...s, googleSheet: { ...(s.googleSheet || {}), lastSync: 0 } });

async function syncAllOnce() {
  if (!(await OBR.scene.isReady())) return;
  const sheets = await listSheets();
  for (const { id, sheet } of sheets) {
    const g = sheet?.googleSheet;
    if (!g?.id || g.auto === false) continue;
    try {
      const next = await syncFromGoogle(normalize(sheet));
      const changed = body(next) !== body(normalize(sheet));
      const stale = Date.now() - (g.lastSync || 0) > STAMP_EVERY_MS;
      if (changed || stale || g.lastError) await saveSheet(id, next);
    } catch (err) {
      const message = err?.message || "Sync failed.";
      if (g.lastError !== message) await saveSheet(id, { ...sheet, googleSheet: { ...g, lastError: message } });
    }
  }
}

// Rename a sheet when its token is renamed (only if the sheet still had the
// token's old name). Runs on the GM's computer, who can edit every token.
function startNameFollow() {
  const check = async (items) => {
    const updates = [];
    for (const item of items) {
      const sheet = item.metadata?.[KEY];
      if (!sheet || sheet.googleSheet?.id) continue;
      const label = tokenLabel(item);
      if (!label || label === sheet.name) continue;
      const old = sheet.tokenName || item.name || "";
      if ((old && sheet.name === old) || (sheet.monster && sheet.name === sheet.race)) updates.push([item.id, label]);
    }
    if (!updates.length) return;
    const names = new Map(updates);
    await OBR.scene.items.updateItems(updates.map(([id]) => id), (drafts) => {
      for (const d of drafts) {
        const label = names.get(d.id);
        d.metadata[KEY] = { ...d.metadata[KEY], name: label, tokenName: label };
      }
    });
  };
  const run = async () => { try { if (await OBR.scene.isReady()) await check(await OBR.scene.items.getItems((i) => i.metadata?.[KEY] !== undefined)); } catch { /* scene not ready */ } };
  OBR.scene.onReadyChange((ready) => { if (ready) run(); });
  run();
  OBR.scene.items.onChange((items) => { check(items.filter((i) => i.metadata?.[KEY] !== undefined)).catch(() => {}); });
}

// ---- Celestial dice over the map ----
const dice = { open: false, ready: false, pending: [], openedAt: 0 };
function flushDice() {
  while (dice.pending.length) OBR.broadcast.sendMessage(DICE_CHANNEL, dice.pending.shift(), { destination: "LOCAL" });
}
async function showDice(r) {
  dice.pending.push(r);
  if (dice.pending.length > 3) dice.pending.shift();
  // If the layer never reported back, start over.
  if (dice.open && !dice.ready && Date.now() - dice.openedAt > 8000) dice.open = false;
  if (dice.open) { if (dice.ready) flushDice(); return; }
  dice.open = true; dice.ready = false; dice.openedAt = Date.now();
  await OBR.modal.open({
    id: DICE_MODAL, url: asset("dice.html?v=1.5.0"),
    fullScreen: true, hideBackdrop: true, hidePaper: true, disablePointerEvents: true,
  });
}
function listenDiceControl() {
  OBR.broadcast.onMessage(DICE_CONTROL, (e) => {
    if (e.data === "ready") { dice.ready = true; flushDice(); }
    if (e.data === "closed") {
      dice.open = false; dice.ready = false;
      if (dice.pending.length) { const next = dice.pending.splice(0); next.forEach(showDice); }
    }
  });
}

// ---- Combat: pop the tracker open for everyone, announce turns ----
function watchCombat(self) {
  let lastId = null;
  let lastTurn = null;
  const closedFor = () => { try { return sessionStorage.getItem("myrrodin-tracker-closed") || ""; } catch { return ""; } };

  const onState = async (st) => {
    if (!st?.active) {
      if (lastId) { lastId = null; lastTurn = null; OBR.popover.close(Combat.TRACKER_POPOVER).catch(() => {}); }
      return;
    }
    if (st.id !== lastId) {
      lastId = st.id;
      lastTurn = st.currentId;
      if (closedFor() !== st.id) Combat.openTracker().catch(() => {});
      OBR.notification.show(self.role === "GM" ? "⚔ Combat started. Players are being asked to join." : "⚔ Combat is starting! Join from the Initiative window on the right.", "INFO");
    }
    if (st.currentId && st.currentId !== lastTurn) {
      lastTurn = st.currentId;
      const e = (st.entries || []).find((x) => x.id === st.currentId);
      if (!e) return;
      const mine = e.owner && e.owner === self.id;
      OBR.notification.show(mine ? `✦ Round ${st.round}: your turn, ${e.name}!` : `⚔ Round ${st.round}: ${e.name}'s turn`, mine ? "SUCCESS" : "DEFAULT");
    }
  };
  Combat.getCombat().then(onState).catch(() => {});
  Combat.onCombatChange(onState);
  OBR.scene.onReadyChange((ready) => { if (ready) Combat.getCombat().then(onState).catch(() => {}); });

  // Remember when someone hides the tracker so it doesn't keep popping back.
  OBR.broadcast.onMessage(`${NS}/sheet-tracker-closed`, (e) => { try { sessionStorage.setItem("myrrodin-tracker-closed", e.data); } catch { /* ignore */ } });

  // Only the GM's computer writes the fight; players' rolls arrive here.
  if (self.role === "GM") OBR.broadcast.onMessage(Combat.JOIN_CHANNEL, (e) => { Combat.applyJoin(e.data).catch(() => {}); });
}

function startGoogleSync() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await syncAllOnce(); } catch (err) { console.warn("[Myr'rodin] Google sync", err); }
    running = false;
  };
  setTimeout(tick, 5000);
  setInterval(tick, SYNC_EVERY_MS);
}

OBR.onReady(async () => {
  const icon = asset("icon.svg");

  await OBR.contextMenu.create({
    id: "com.emberbelle.myrrodin/context",
    icons: [
      {
        icon,
        label: "Open Myr'rodin Sheet",
        filter: {
          max: 1,
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: ["metadata", KEY], value: undefined, operator: "!=" },
          ],
        },
      },
      {
        icon,
        label: "Create Myr'rodin Sheet",
        filter: {
          max: 1,
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: ["metadata", KEY], value: undefined },
          ],
        },
      },
    ],
    onClick(context) {
      const item = context.items[0];
      if (!item) return;
      const isNew = item.metadata?.[KEY] === undefined;
      openSheet(item.id, isNew ? "&new=1" : "");
    },
  });

  const self = await me();

  // ---- Google Sheets auto-sync (runs only on the GM's computer) ----
  if (self.role === "GM") { startGoogleSync(); startNameFollow(); }

  OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
    const r = event.data || {};
    const mine = event.connectionId === self.connectionId;
    // Private rolls are only seen by the GM and the person who rolled.
    if (r.hidden && !mine && self.role !== "GM") return;

    appendLog({ ...r, at: Date.now(), mine });

    const who = r.character || r.player || "Someone";
    const lock = r.hidden ? "🔒 " : "";
    const tag = r.crit ? " — CRITICAL!" : r.fumble ? " — natural 1" : r.outcome ? ` — ${r.outcome}` : "";
    const text = `${lock}${who} · ${r.label}: ${r.total}${tag}   (${r.detail})`;
    const variant = r.crit || r.outcome === "Success" ? "SUCCESS" : r.fumble || r.outcome === "Failed" ? "WARNING" : "DEFAULT";
    OBR.notification.show(text, variant);

    // The dice animation: everyone sees it over the map. Your own rolls play
    // inside the sheet instead when the sheet is open.
    if (diceAnimOn() && r.dice?.length && !(mine && sheetRecentlyOpen())) showDice(r).catch(() => {});
  });
  listenDiceControl();
  watchCombat(self);
});
