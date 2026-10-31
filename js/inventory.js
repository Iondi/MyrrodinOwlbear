// The Inventory tab: a character's gear and coins, and the shared party stash.
// Players see their own characters; the GM can pick anyone's.
import * as B from "./bridge.js?v=1.9.5";
import * as S from "./stash.js?v=1.9.5";
import { normalize } from "./rules.js?v=1.9.5";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => Number(v) || 0;
const COINS = ["pp", "gp", "ep", "sp", "cp"];

let root = null;
let self = null;
let sheets = [];
let stash = { items: [], money: {} };
let pickedId = null;
let saveTimer = null;
let pending = null; // { id, sheet } waiting to save
let splitArmed = false;

const isGM = () => self?.role === "GM";
const mine = () => sheets.filter((s) => (isGM() ? true : s.sheet?.ownerId === self.id));
const picked = () => mine().find((s) => s.id === pickedId) || mine()[0] || null;

function render() {
  if (!root || !self) return;
  const list = mine();
  const cur = picked();
  if (cur) pickedId = cur.id;
  const c = cur ? normalize(pending?.id === cur.id ? pending.sheet : cur.sheet) : null;
  const linked = !!c?.googleSheet?.id;

  const picker = list.length > 1 || isGM()
    ? `<select class="inv-picker" data-inv="pick" aria-label="Character">${list.map((s) => `<option value="${esc(s.id)}" ${s.id === cur?.id ? "selected" : ""}>${esc(normalize(s.sheet).name || s.name)}${s.sheet.gmOnly ? " (GM)" : ""}</option>`).join("")}</select>`
    : "";

  const gear = c ? `
    <section class="inv-block">
      <div class="panel-head bare"><h3>${isGM() ? "Character" : "My gear"}</h3>${picker}</div>
      ${linked ? `<p class="muted small">Linked to a Google Sheet. Items added here stay; items from the sheet update when it syncs.</p>` : ""}
      ${c.equipment.length ? `<ul class="inv-list">${c.equipment.map((e, i) => `<li>
          <input class="inv-qty" type="number" inputmode="numeric" min="0" value="${esc(e.qty ?? 1)}" data-gear="qty" data-i="${i}" aria-label="Quantity" />
          <input class="inv-name" value="${esc(e.name)}" data-gear="name" data-i="${i}" aria-label="Item" placeholder="Item" />
          <button class="x" data-inv="tostash" data-i="${i}" title="Put in the party stash">⇢ Stash</button>
          <button class="x" data-inv="delgear" data-i="${i}" title="Remove">✕</button>
          ${e.notes ? `<span class="inv-note">${esc(e.notes)}</span>` : ""}
        </li>`).join("")}</ul>` : `<p class="empty">Nothing in the pack.</p>`}
      <div class="inv-add"><input data-inv="newgear" placeholder="Add an item…" /><button class="add" data-inv="addgear">+ Add</button></div>
      <div class="inv-coins">${COINS.map((k) => `<label><span>${k.toUpperCase()}</span><input type="number" inputmode="numeric" min="0" value="${num(c.money[k])}" data-coin="${k}" /></label>`).join("")}</div>
    </section>`
    : `<section class="inv-block"><div class="panel-head bare"><h3>My gear</h3></div><p class="empty">${isGM() ? "No sheets in this scene yet." : "You don't have a character sheet on this map yet. Ask the GM to set you as the owner of yours."}</p></section>`;

  const stashCoins = COINS.map((k) => isGM()
    ? `<label><span>${k.toUpperCase()}</span><input type="number" inputmode="numeric" min="0" value="${num(stash.money?.[k])}" data-scoin="${k}" /></label>`
    : `<span class="coin-ro"><span>${k.toUpperCase()}</span><b>${num(stash.money?.[k])}</b></span>`).join("");

  const stashBlock = `
    <section class="inv-block stash">
      <div class="panel-head bare"><h3>Party stash</h3><span class="muted small">${stash.items.length} item${stash.items.length === 1 ? "" : "s"}</span></div>
      ${stash.items.length ? `<ul class="inv-list">${stash.items.map((it) => `<li>
          ${isGM()
            ? `<input class="inv-qty" type="number" inputmode="numeric" min="1" value="${esc(it.qty ?? 1)}" data-sitem="qty" data-id="${esc(it.id)}" aria-label="Quantity" />
               <input class="inv-name" value="${esc(it.name)}" data-sitem="name" data-id="${esc(it.id)}" aria-label="Item" />`
            : `<span class="inv-qty ro">${num(it.qty || 1)}</span><span class="inv-name ro">${esc(it.name)}</span>`}
          ${cur ? `<button class="small" data-inv="take" data-id="${esc(it.id)}" title="Give one to ${esc(c?.name || "")}">Take</button>` : ""}
          ${isGM() ? `<button class="x" data-inv="delstash" data-id="${esc(it.id)}" title="Remove">✕</button>` : ""}
          ${it.notes || it.from ? `<span class="inv-note">${esc([it.notes, it.from ? `from ${it.from}` : ""].filter(Boolean).join(" · "))}</span>` : ""}
        </li>`).join("")}</ul>` : `<p class="empty">The stash is empty.</p>`}
      ${isGM() ? `<div class="inv-add"><input data-inv="newstash" placeholder="Add loot…" /><button class="add" data-inv="addstash">+ Add</button></div>` : ""}
      <div class="inv-coins">${stashCoins}</div>
      ${isGM() ? `<button class="ghost small" data-inv="split">${splitArmed ? "Click again to split" : "Split coins among the party"}</button>` : ""}
    </section>`;

  const keep = document.activeElement && root.contains(document.activeElement) ? { sel: activeSelector(document.activeElement), pos: document.activeElement.selectionStart } : null;
  root.innerHTML = `${gear}${stashBlock}`;
  if (keep?.sel) { const el = root.querySelector(keep.sel); if (el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch { /* number inputs */ } } }
}

function activeSelector(el) {
  for (const a of ["data-gear", "data-coin", "data-scoin", "data-sitem", "data-inv"]) {
    if (el.hasAttribute(a)) {
      const extra = el.dataset.i !== undefined ? `[data-i="${el.dataset.i}"]` : el.dataset.id ? `[data-id="${el.dataset.id}"]` : "";
      return `[${a}="${el.getAttribute(a)}"]${extra}`;
    }
  }
  return null;
}

// ---- Saving a character's gear (debounced while typing) ----------------------
function editSheet(fn) {
  const cur = picked();
  if (!cur) return;
  const c = normalize(pending?.id === cur.id ? pending.sheet : cur.sheet);
  fn(c);
  pending = { id: cur.id, sheet: c };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!pending) return;
  const p = pending;
  try { await B.saveSheet(p.id, p.sheet); } catch { B.notify("Couldn't save that change.", "ERROR"); }
  if (pending === p) pending = null;
}

let stashTimer = null;
function stashEdit(fn) { clearTimeout(stashTimer); stashTimer = setTimeout(fn, 500); }

function wire() {
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.gear) { const i = Number(t.dataset.i); editSheet((c) => { if (c.equipment[i]) c.equipment[i][t.dataset.gear] = t.dataset.gear === "qty" ? num(t.value) : t.value; }); }
    else if (t.dataset.coin) editSheet((c) => { c.money[t.dataset.coin] = Math.max(0, num(t.value)); });
    else if (t.dataset.scoin && isGM()) stashEdit(() => S.setCoin(t.dataset.scoin, t.value));
    else if (t.dataset.sitem && isGM()) { const id = t.dataset.id, field = t.dataset.sitem, v = field === "qty" ? Math.max(1, num(t.value)) : t.value; stashEdit(() => S.editItem(id, { [field]: v })); }
  });
  root.addEventListener("change", async (e) => {
    if (e.target.dataset.inv === "pick") { await flush(); pickedId = e.target.value; render(); }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target.dataset.inv === "newgear") root.querySelector('[data-inv="addgear"]')?.click();
    if (e.target.dataset.inv === "newstash") root.querySelector('[data-inv="addstash"]')?.click();
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-inv]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const what = b.dataset.inv;
    if (what !== "split") splitArmed = false;
    const cur = picked();
    switch (what) {
      case "addgear": {
        const input = root.querySelector('[data-inv="newgear"]');
        const name = input.value.trim();
        if (!name) return;
        editSheet((c) => c.equipment.push({ name, qty: 1, notes: "", local: true }));
        await flush(); render(); root.querySelector('[data-inv="newgear"]')?.focus();
        break;
      }
      case "delgear": editSheet((c) => c.equipment.splice(Number(b.dataset.i), 1)); await flush(); render(); break;
      case "tostash": {
        await flush();
        const c = normalize(cur.sheet);
        const i = Number(b.dataset.i);
        const name = c.equipment[i]?.name;
        if (isGM()) await S.stashFromSheet(cur.id, i, 1, name); else await S.request({ type: "stash", sheetId: cur.id, index: i, qty: 1, name });
        B.notify(`${name} went into the party stash.`, "SUCCESS");
        setTimeout(refresh, 300);
        break;
      }
      case "take": {
        if (!cur) return;
        await flush();
        if (isGM()) await S.takeItem(b.dataset.id, cur.id, 1); else await S.request({ type: "take", itemId: b.dataset.id, sheetId: cur.id, qty: 1 });
        setTimeout(refresh, 300);
        break;
      }
      case "addstash": {
        const input = root.querySelector('[data-inv="newstash"]');
        const name = input.value.trim();
        if (!name) return;
        input.value = "";
        await S.addItem(name, 1);
        root.querySelector('[data-inv="newstash"]')?.focus();
        break;
      }
      case "delstash": await S.removeItem(b.dataset.id); break;
      case "split": {
        if (!splitArmed) { splitArmed = true; render(); return; }
        splitArmed = false;
        const r = await S.splitCoins();
        B.notify(r.count ? `Coins split between ${r.count} characters.` : "No player characters to split between. Set owners on their sheets first.", r.count ? "SUCCESS" : "WARNING");
        render();
        break;
      }
    }
  });
}

async function refresh() {
  try { sheets = await B.listSheets(); } catch { sheets = []; }
  // Don't redraw under someone who's typing in this tab.
  if (root && root.contains(document.activeElement) && document.activeElement.matches("input")) return;
  render();
}

export async function mountInventory(el) {
  root = el;
  wire();
  await B.whenReady();
  self = await B.me();
  stash = await S.getStash().catch(() => stash);
  await refresh();
  S.onStashChange((st) => { stash = st; if (!(root.contains(document.activeElement) && document.activeElement.matches("input"))) render(); });
  try { B.onSheetsChange(refresh); } catch { /* scene not ready */ }
  if (B.inOBR) B.OBR.scene.onReadyChange((ready) => { if (ready) { refresh(); try { B.onSheetsChange(refresh); } catch { /* ignore */ } } });
  root.addEventListener("focusout", () => setTimeout(() => { if (!root.contains(document.activeElement)) render(); }, 30));
}
