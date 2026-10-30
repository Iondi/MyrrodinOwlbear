// Runs invisibly in every player's Owlbear tab.
// 1) Adds "Myr'rodin Sheet" to the right-click menu on character tokens.
// 2) Shows everyone's dice rolls as notifications and keeps a roll log.
import { OBR, KEY, ROLL_CHANNEL, asset, appendLog, openSheet, me, listSheets, saveSheet } from "./bridge.js";
import { syncFromGoogle } from "./gsheet.js";
import { normalize } from "./rules.js";

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
  if (self.role === "GM") startGoogleSync();

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
  });
});
