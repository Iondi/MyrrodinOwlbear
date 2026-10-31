// On-screen frames: the party frames (always on, if wanted) and the
// turn-order strip (during combat). They sit in a full-screen layer that
// clicks pass straight through, so they never block the map or Owlbear's
// own buttons. Each player picks the corner for each.
import * as B from "./bridge.js?v=1.9.1";
import * as C from "./combat.js?v=1.9.1";
import { normalize } from "./rules.js?v=1.9.1";
import * as Roster from "./roster.js?v=1.9.1";

const el = document.getElementById("hud");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => Number(v) || 0;

let self = null;
let state = null;
let sheets = new Map();
let roster = { members: {} };
let menuOpen = false; // the Myr'rodin menu already shows the party, so the frames step aside while it's open

function turnOrder() {
  if (!state?.active || !self || !B.hudOn()) return "";
  const list = C.ordered(state);
  const waiting = C.waiting(state).length;
  const curIdx = list.findIndex((e) => e.id === state.currentId);
  // Show the active creature first, then who's coming up.
  const rotated = curIdx > 0 ? [...list.slice(curIdx), ...list.slice(0, curIdx)] : list;
  const shown = rotated.slice(0, 8);
  const isGM = self.role === "GM";
  return `<div class="hud-card">
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

// Party frames: every player character (sheets with an owner), always visible.
function bar(cls, cur, max) {
  if (!max) return "";
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return `<span class="pf-bar ${cls}"><i style="width:${pct}%"></i><b>${cur}/${max}</b></span>`;
}
function partyFrames() {
  if (!self || !B.partyFramesOn() || menuOpen) return "";
  // The saved party (works on any scene), using the live token sheet when it's on the map.
  const live = new Map([...sheets.values()].filter((s) => s.sheet?.partyId).map((s) => [s.sheet.partyId, s]));
  const fromRoster = Object.values(roster.members || {}).map((m) => {
    const l = live.get(m.id);
    return l ? { ...l, c: normalize(l.sheet) } : { id: null, image: m.token?.image?.url, c: Roster.sheetFor(m) };
  });
  const ids = new Set(Object.keys(roster.members || {}));
  const unsaved = [...sheets.values()].filter((s) => s.sheet?.ownerId && !ids.has(s.sheet.partyId)).map((s) => ({ ...s, c: normalize(s.sheet) }));
  const party = [...fromRoster, ...unsaved]
    .filter((p) => !p.c.gmOnly)
    .sort((a, b) => (a.c.ownerId === self.id ? -1 : b.c.ownerId === self.id ? 1 : a.c.name.localeCompare(b.c.name)));
  if (!party.length) return "";
  const turnId = state?.active ? state.currentId : null;
  return `<div class="hud-card pf">
    <div class="hud-head"><span class="hud-sigil"></span><b>Party</b></div>
    <ul>${party.map(({ id, image, c }) => {
      const hp = num(c.hp.current), max = num(c.hp.max);
      const down = max > 0 && hp <= 0;
      return `<li class="${c.ownerId === self.id ? "mine" : ""} ${down ? "down" : ""} ${hp > 0 && hp <= max / 4 ? "low" : ""} ${turnId === id ? "now" : ""}">
        <span class="pf-ava">${image ? `<img src="${esc(image)}" alt="" />` : esc((c.name || "?")[0])}</span>
        <span class="pf-body">
          <span class="pf-name">${esc(c.name)}${c.hp.temp ? `<small>+${num(c.hp.temp)}</small>` : ""}${down ? "<small class='ko'>down</small>" : ""}</span>
          ${bar("hp", hp, max)}
          ${bar("mana", num(c.mana.current), num(c.mana.max))}
        </span>
        <span class="pf-ac">${num(c.ac)}<small>AC</small></span>
      </li>`;
    }).join("")}</ul>
  </div>`;
}

// Put each frame in its corner; two frames in the same corner stack.
function render() {
  const slots = { tl: [], tr: [], bl: [], br: [] };
  const pf = partyFrames();
  const to = turnOrder();
  if (pf) slots[B.partyCorner()]?.push(pf);
  if (to) slots[B.hudCorner()]?.push(to);
  el.className = "hud-layer";
  el.innerHTML = Object.entries(slots).filter(([, v]) => v.length)
    .map(([corner, v]) => `<div class="hud hud-${corner}">${(corner.startsWith("b") ? v.slice().reverse() : v).join("")}</div>`).join("");
}

async function refreshSheets() {
  try { sheets = new Map((await B.listSheets()).map((s) => [s.id, s])); } catch { /* ignore */ }
  render();
}

window.addEventListener("storage", (e) => { if (e.key?.startsWith("myrrodin-hud") || e.key?.startsWith("myrrodin-party")) render(); });

(async () => {
  await B.whenReady();
  self = await B.me();
  state = await C.getCombat().catch(() => null);
  roster = await Roster.getRoster().catch(() => roster);
  Roster.onRosterChange((r) => { roster = r; render(); });
  if (B.inOBR) {
    B.OBR.action.isOpen().then((open) => { menuOpen = open; render(); }).catch(() => {});
    B.OBR.action.onOpenChange((open) => { menuOpen = open; render(); });
  }
  await refreshSheets();
  C.onCombatChange((s) => { state = s; render(); });
  try { B.onSheetsChange(refreshSheets); } catch { /* ignore */ }
  if (B.inOBR) B.OBR.scene.onReadyChange((ready) => { if (ready) { refreshSheets(); try { B.onSheetsChange(refreshSheets); } catch { /* ignore */ } } else { sheets = new Map(); render(); } });
})();
