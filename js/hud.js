// The turn-order strip shown on screen during combat. It sits in a
// full-screen layer that clicks pass straight through, so it never blocks
// the map or Owlbear's own buttons. Each player picks the corner.
import * as B from "./bridge.js?v=1.7.0";
import * as C from "./combat.js?v=1.7.0";
import { normalize } from "./rules.js?v=1.7.0";

const el = document.getElementById("hud");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => Number(v) || 0;

let self = null;
let state = null;
let sheets = new Map();

function render() {
  el.className = `hud hud-${B.hudCorner()}`;
  if (!state?.active || !self) { el.innerHTML = ""; return; }
  const list = C.ordered(state);
  const waiting = C.waiting(state).length;
  const curIdx = list.findIndex((e) => e.id === state.currentId);
  // Show the active creature first, then who's coming up.
  const rotated = curIdx > 0 ? [...list.slice(curIdx), ...list.slice(0, curIdx)] : list;
  const shown = rotated.slice(0, 8);
  const isGM = self.role === "GM";
  el.innerHTML = `<div class="hud-card">
    <div class="hud-head"><span class="hud-sigil"></span><b>Round ${state.round}</b><span class="hud-sub">${state.currentId ? "" : "Rolling initiative…"}${waiting ? ` · ${waiting} to roll` : ""}</span></div>
    <ol>${shown.map((e, i) => {
      const s = sheets.get(e.id)?.sheet;
      const c = s ? normalize(s) : null;
      const mine = s?.ownerId === self.id;
      const showHp = c && num(c.hp.max) > 0 && (isGM || e.kind === "player");
      const pct = showHp ? Math.max(0, Math.min(100, (num(c.hp.current) / num(c.hp.max)) * 100)) : 0;
      const down = c && num(c.hp.max) > 0 && num(c.hp.current) <= 0;
      const now = state.currentId && i === 0;
      return `<li class="${now ? "now" : ""} ${mine ? "mine" : ""} ${down ? "down" : ""} ${e.kind}">
        <span class="hud-init">${esc(e.init)}</span>
        <span class="hud-name">${esc(e.name)}${now ? `<em>${mine ? "Your turn!" : "Now"}</em>` : i === 1 && state.currentId ? "<em class='next'>Next</em>" : ""}
          ${showHp ? `<i class="hud-hp"><i style="width:${pct}%"></i></i>` : ""}</span>
      </li>`;
    }).join("")}</ol>
    ${rotated.length > shown.length ? `<div class="hud-more">+${rotated.length - shown.length} more</div>` : ""}
  </div>`;
}

async function refreshSheets() {
  try { sheets = new Map((await B.listSheets()).map((s) => [s.id, s])); } catch { /* ignore */ }
  render();
}

window.addEventListener("storage", (e) => { if (e.key?.startsWith("myrrodin-hud")) render(); });

(async () => {
  await B.whenReady();
  self = await B.me();
  state = await C.getCombat().catch(() => null);
  await refreshSheets();
  C.onCombatChange((s) => { state = s; render(); });
  try { B.onSheetsChange(refreshSheets); } catch { /* ignore */ }
})();
