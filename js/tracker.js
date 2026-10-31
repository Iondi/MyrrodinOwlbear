// The Combat tab of the Myr'rodin menu: initiative order, joining, and the
// GM's turn controls. mountCombat(element) draws it into the menu.
import * as B from "./bridge.js?v=1.9.0";
import * as C from "./combat.js?v=1.9.0";
import { normalize } from "./rules.js?v=1.9.0";

let root = null;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => Number(v) || 0;

let self = null;
let state = null;
let sheets = new Map(); // itemId -> { name, image, sheet }
let editing = null;     // entry id whose initiative the GM is editing
let endArmed = false;
let busy = false;

const isGM = () => self?.role === "GM";

function hpOf(id) {
  const s = sheets.get(id)?.sheet;
  if (!s) return null;
  const c = normalize(s);
  return { cur: num(c.hp.current), max: num(c.hp.max), temp: num(c.hp.temp) };
}

function myPending() {
  if (!state?.active || isGM()) return [];
  // Entries waiting for my roll, plus any sheet I own that isn't in the fight yet.
  const inFight = new Set(state.entries.map((e) => e.id));
  const mine = [...sheets.entries()].filter(([, v]) => v.sheet?.ownerId === self.id).map(([id, v]) => ({ id, name: normalize(v.sheet).name || v.name }));
  const pending = state.entries.filter((e) => e.init == null && (e.owner === self.id || mine.some((m) => m.id === e.id)));
  const missing = mine.filter((m) => !inFight.has(m.id));
  return [...pending, ...missing];
}

function row(e, i, list) {
  const current = state.currentId === e.id;
  const next = state.currentId && list.length > 1 && list[(list.findIndex((x) => x.id === state.currentId) + 1) % list.length]?.id === e.id;
  const hp = hpOf(e.id);
  const showHp = hp && hp.max > 0 && (isGM() || e.kind === "player");
  const down = hp && hp.max > 0 && hp.cur <= 0;
  const mine = sheets.get(e.id)?.sheet?.ownerId === self.id;
  const img = sheets.get(e.id)?.image;
  const pct = showHp ? Math.max(0, Math.min(100, (hp.cur / hp.max) * 100)) : 0;
  const initCell = isGM() && editing === e.id
    ? `<input class="trk-edit" type="number" inputmode="numeric" value="${esc(e.init)}" data-edit="${esc(e.id)}" aria-label="Initiative" />`
    : `<button class="trk-init" ${isGM() ? `data-act="edit" data-id="${esc(e.id)}" title="${esc(e.detail || "")} — click to change"` : `title="${esc(e.detail || "")}" disabled`}>${esc(e.init)}</button>`;
  return `<li class="trk-row ${current ? "is-current" : ""} ${down ? "is-down" : ""} ${mine ? "is-mine" : ""} ${e.kind}">
    ${initCell}
    <span class="trk-avatar">${img ? `<img src="${esc(img)}" alt="" />` : esc((e.name || "?")[0])}</span>
    <span class="trk-name"><span class="trk-n">${esc(e.name)}${e.hidden && isGM() ? ` <span class="trk-tag" title="Hidden from players' sheets">GM</span>` : ""}</span>
      ${current ? `<small class="trk-now">${mine ? "Your turn!" : "Their turn"}</small>` : next ? `<small class="trk-next">Up next</small>` : ""}
      ${showHp ? `<span class="trk-hp"><span style="width:${pct}%"></span></span>` : ""}
    </span>
    ${showHp && (isGM() || mine) ? `<span class="trk-hpnum">${hp.cur}/${hp.max}</span>` : down ? `<span class="trk-hpnum">☠</span>` : ""}
    ${isGM() ? `<button class="x trk-x" data-act="remove" data-id="${esc(e.id)}" title="Remove from combat">✕</button>` : ""}
  </li>`;
}

function render() {
  if (!self) return;
  const head = `<div class="trk-head">
      <span class="trk-sigil" aria-hidden="true"></span>
      <span class="trk-title">${state?.active ? `Round ${state.round}` : "Initiative"}</span>
    </div>`;

  if (!state?.active) {
    root.innerHTML = `<div class="trk">${head}<div class="trk-empty">
      <p>No fight right now.</p>
      ${isGM() ? `<button class="primary" data-act="start">⚔ Start combat</button><p class="muted small">Everyone gets asked to join. Monsters and NPCs on the board roll automatically.</p>` : ""}
    </div></div>${hudSettings()}`;
    return;
  }

  const list = C.ordered(state);
  const waitingList = C.waiting(state);
  const pending = myPending();
  const myTurn = sheets.get(state.currentId)?.sheet?.ownerId === self.id;

  const joinBanner = pending.length ? `<div class="trk-join">
      <div class="trk-join-title">⚔ Combat is starting!</div>
      <p>Would you like to join?</p>
      ${pending.map((e) => `<div class="trk-join-row"><b>${esc(e.name)}</b>
        <span><button class="primary small" data-act="join" data-id="${esc(e.id)}" ${busy ? "disabled" : ""}>Join & roll</button>
        <button class="link small" data-act="decline" data-id="${esc(e.id)}">Not this time</button></span></div>`).join("")}
    </div>` : "";

  const gmWaiting = isGM() && waitingList.length ? `<div class="trk-waiting">
      <div class="trk-sub">Waiting to roll</div>
      ${waitingList.map((e) => `<div class="trk-wait-row"><span>${esc(e.name)}</span><button class="link small" data-act="rollfor" data-id="${esc(e.id)}">Roll for them</button></div>`).join("")}
    </div>` : (!isGM() && waitingList.length ? `<p class="trk-sub center">Waiting on ${waitingList.length} more…</p>` : "");

  const yourTurn = myTurn ? `<div class="trk-yourturn">✦ It's your turn ✦</div>` : "";

  const notBegun = !state.currentId;
  const gmControls = isGM() ? `<div class="trk-controls">
      ${notBegun
        ? `<button class="primary trk-go" data-act="begin" ${list.length ? "" : "disabled"}>Begin round 1 ▶</button>`
        : `<button class="ghost" data-act="prev" title="Back one turn">◀</button><button class="primary trk-go" data-act="next">Done — next ▶</button>`}
      <div class="trk-more">
        <button class="link small" data-act="add" title="Add sheets placed on the board since combat started">+ Add new tokens</button>
        <button class="link small danger-text" data-act="end">${endArmed ? "Click again to end" : "End combat"}</button>
      </div>
    </div>` : "";

  root.innerHTML = `<div class="trk">${head}${joinBanner}${yourTurn}
    ${list.length ? `<ol class="trk-list">${list.map((e, i) => row(e, i, list)).join("")}</ol>` : `<p class="trk-sub center">No one has rolled yet.</p>`}
    ${gmWaiting}${gmControls}</div>${hudSettings()}`;
  const ed = root.querySelector(".trk-edit");
  if (ed) { ed.focus(); ed.select(); }
}

// Each player chooses whether the turn-order strip shows on their screen, and where.
const CORNERS = [["br", "Bottom right"], ["bl", "Bottom left"], ["tr", "Top right"], ["tl", "Top left"]];
function hudSettings() {
  const on = B.hudOn();
  const corner = B.hudCorner();
  return `<div class="hud-settings">
    <label class="chk"><input type="checkbox" data-hud="toggle" ${on ? "checked" : ""}/><span>Show turn order on my screen during combat</span></label>
    <div class="hud-corners" ${on ? "" : "hidden"}>${CORNERS.map(([k, label]) => `<button class="chip-btn ${corner === k ? "on" : ""}" data-hud="${k}">${label}</button>`).join("")}</div>
    <p class="muted small">The strip can't be clicked, so it never gets in the way of the map. Control the fight from this tab.</p>
  </div>`;
}


async function act(name, id) {
  if (name !== "end") endArmed = false;
  switch (name) {
    case "start": await C.startCombat(); break;
    case "begin": await C.begin(); break;
    case "next": await C.nextTurn(); break;
    case "prev": await C.prevTurn(); break;
    case "add": await C.addFromBoard(); break;
    case "end":
      if (!endArmed) { endArmed = true; render(); break; }
      endArmed = false; await C.endCombat(); break;
    case "remove": await C.removeEntry(id); break;
    case "rollfor": await C.rollFor(id); break;
    case "edit": editing = id; render(); break;
    case "join": {
      const s = sheets.get(id);
      if (!s) break;
      busy = true; render();
      await C.joinWith({ id }, s.sheet, self.name);
      busy = false;
      break;
    }
    case "decline": await C.decline({ id }); break;
  }
}

function wire() {
root.addEventListener("click", (e) => {
  const h = e.target.closest("[data-hud]");
  if (h && h.dataset.hud !== "toggle") { B.setHudCorner(h.dataset.hud); render(); return; }
  const b = e.target.closest("[data-act]");
  if (b && !b.disabled) act(b.dataset.act, b.dataset.id);
});
root.addEventListener("change", (e) => {
  if (e.target.matches('[data-hud="toggle"]')) { B.setHudOn(e.target.checked); render(); }
});
root.addEventListener("keydown", async (e) => {
  const ed = e.target.closest?.("[data-edit]");
  if (!ed) return;
  if (e.key === "Enter") { const v = ed.value; const id = ed.dataset.edit; editing = null; if (v !== "") await C.setInit(id, v); else render(); }
  if (e.key === "Escape") { editing = null; render(); }
});
root.addEventListener("focusout", async (e) => {
  const ed = e.target.closest?.("[data-edit]");
  if (!ed || editing !== ed.dataset.edit) return;
  const v = ed.value; const id = ed.dataset.edit; editing = null;
  if (v !== "") await C.setInit(id, v); else render();
});
}

async function refreshSheets() {
  try {
    const list = await B.listSheets();
    sheets = new Map(list.map((s) => [s.id, s]));
  } catch { /* scene not ready */ }
  render();
}

// Returns a function that tells the caller about combat changes (for the tab badge).
export async function mountCombat(el, onState = () => {}) {
  root = el;
  wire();
  await B.whenReady();
  self = await B.me();
  state = await C.getCombat().catch(() => null);
  onState(state, self);
  await refreshSheets();
  C.onCombatChange((s) => { state = s; if (!s) editing = null; onState(s, self); render(); });
  try { B.onSheetsChange(refreshSheets); } catch { /* scene not ready */ }
  if (B.inOBR) B.OBR.scene.onReadyChange((ready) => { if (ready) { C.getCombat().then((s) => { state = s; onState(s, self); refreshSheets(); }).catch(() => {}); try { B.onSheetsChange(refreshSheets); } catch { /* ignore */ } } });
}
export const myTurnIn = (st, me, sheetMap) => !!st?.currentId && sheetMap?.get?.(st.currentId)?.sheet?.ownerId === me?.id;
