// Runs invisibly in every player's Owlbear tab.
// 1) Adds "Myr'rodin Sheet" to the right-click menu on character tokens.
// 2) Shows everyone's dice rolls as notifications and keeps a roll log.
import { OBR, KEY, ROLL_CHANNEL, asset, appendLog, openSheet, me } from "./bridge.js";

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
