// The full-screen, click-through layer Owlbear shows over the map while dice roll.
import { OBR, DICE_CHANNEL, DICE_CONTROL, DICE_MODAL } from "./bridge.js?v=1.7.0";
import { enqueue, isBusy } from "./diceanim.js?v=1.7.0";

const host = document.getElementById("host");

// Preview outside Owlbear: roll a d20 so you can see it.
if (!OBR.isAvailable) {
  const { roll } = await import("./dice.js?v=1.7.0");
  const show = () => { const r = roll("1d20+5"); enqueue(host, { character: "Preview", label: "Test roll", ...r }); };
  show();
  document.addEventListener("click", show);
} else {
  OBR.onReady(() => {
    OBR.broadcast.onMessage(DICE_CHANNEL, (e) => enqueue(host, e.data));
    host.addEventListener("cd-idle", () => {
      setTimeout(() => {
        if (isBusy()) return;
        OBR.broadcast.sendMessage(DICE_CONTROL, "closed", { destination: "LOCAL" });
        OBR.modal.close(DICE_MODAL);
      }, 150);
    });
    OBR.broadcast.sendMessage(DICE_CONTROL, "ready", { destination: "LOCAL" });
  });
}
