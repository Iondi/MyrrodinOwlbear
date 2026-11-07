// The Handouts tab of the Myr'rodin menu.
import * as B from "./bridge.js?v=1.10.7";
import * as H from "./handouts.js?v=1.10.7";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let root = null, self = null, list = [], armed = null, editing = false, testing = "";

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
}
function status() {
  try { return JSON.parse(localStorage.getItem("myrrodin-relay-status")) || null; } catch { return null; }
}

function settings() {
  const r = H.relay();
  const st = status();
  const connected = r.url && r.key;
  if (connected && !editing) {
    const bad = st && !st.ok;
    return `<div class="ho-conn ${bad ? "bad" : "ok"}">
      <span class="gs-dot"></span>
      <span>${bad ? `Relay problem: ${esc(st.error)}` : `Connected to Discord relay${st ? ` · checked ${ago(st.at)}` : ""}`}</span>
      <button class="link small" data-ho="edit">Change</button>
    </div>`;
  }
  return `<div class="panel ho-setup">
    <div class="panel-head"><h3>Connect Discord</h3></div>
    <p class="muted small">Paste your relay's address and FEED_KEY. They're saved in this browser only, so players never see the key.</p>
    <label class="field"><span class="field-label">Relay address</span><input id="ho-url" placeholder="https://your-relay.your-name.workers.dev" value="${esc(r.url)}" /></label>
    <label class="field"><span class="field-label">FEED_KEY</span><input id="ho-key" type="password" placeholder="your FEED_KEY" value="${esc(r.key)}" /></label>
    <div class="roll-row"><button class="primary small" data-ho="save">Connect</button>${connected ? `<button class="link small" data-ho="cancel">Cancel</button>` : ""}<span class="muted small">${esc(testing)}</span></div>
  </div>`;
}

function card(h) {
  const isGM = self?.role === "GM";
  return `<li class="ho-item">
    <button class="ho-thumb" data-ho="view" data-id="${esc(h.id)}" title="View"><img src="${esc(h.url)}" alt="" loading="lazy" /></button>
    <div class="ho-body">
      <b>${esc(h.title)}</b>
      <small>${esc([h.by && `from ${h.by}`, ago(h.at)].filter(Boolean).join(" · "))}</small>
      <div class="ho-actions">
        ${isGM ? `<button class="primary small" data-ho="show" data-id="${esc(h.id)}">Show everyone</button>
          <button class="small" data-ho="map" data-id="${esc(h.id)}">Put on map</button>
          <button class="link small danger-text" data-ho="del" data-id="${esc(h.id)}">${armed === h.id ? "Click again to delete" : "Delete"}</button>`
        : `<button class="small" data-ho="view" data-id="${esc(h.id)}">View</button>`}
      </div>
    </div>
  </li>`;
}

function render() {
  if (!root || !self) return;
  const isGM = self.role === "GM";
  const items = list.map(H.expand);
  root.innerHTML = `
    ${isGM ? settings() : ""}
    ${items.length ? `<ul class="ho-list">${items.map(card).join("")}</ul>`
      : `<div class="empty-state"><p><b>No handouts yet.</b></p>
         <p class="muted small">${isGM ? "In Discord, type <b>/show</b> and attach a picture. It appears here and pops up for everyone." : "Pictures the GM shares show up here."}</p></div>`}`;
}

async function onClick(e) {
  const b = e.target.closest("[data-ho]");
  if (!b) return;
  const act = b.dataset.ho, id = b.dataset.id;
  const h = id ? list.map(H.expand).find((x) => x.id === id) : null;
  if (act !== "del") armed = null;
  switch (act) {
    case "edit": editing = true; render(); break;
    case "cancel": editing = false; render(); break;
    case "save": {
      const url = root.querySelector("#ho-url").value, key = root.querySelector("#ho-key").value;
      if (!url.trim() || !key.trim()) { testing = !url.trim() ? "Type the relay address first." : "Type your FEED_KEY first."; editing = true; render(); break; }
      H.setRelay(url, key);
      editing = true; testing = "Checking…"; render();
      try { const n = await H.testRelay(); testing = ""; editing = false; B.notify(`Connected to the Discord relay (${n} handout${n === 1 ? "" : "s"} there).`, "SUCCESS"); }
      catch (err) { testing = err?.message === "Failed to fetch" ? "Couldn't reach that address. Check it's right." : (err?.message || "Couldn't connect."); }
      render(); break;
    }
    case "view": if (h) await H.viewHandout(h); break;
    case "show": if (h) { await H.showToEveryone(h); B.notify(`Showing "${h.title}" to everyone.`, "SUCCESS"); } break;
    case "map":
      if (h) { b.disabled = true; try { await H.placeOnMap(h); B.notify(`Placed "${h.title}" on the map.`, "SUCCESS"); } catch (err) { B.notify(err?.message || "Couldn't place it.", "ERROR"); } b.disabled = false; }
      break;
    case "del":
      if (armed !== id) { armed = id; render(); break; }
      armed = null; await H.removeHandout(id); break;
  }
}

export async function mountHandouts(el) {
  root = el;
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".ho-setup")) root.querySelector('[data-ho="save"]')?.click(); });
  await B.whenReady();
  self = await B.me();
  list = await H.getHandouts().catch(() => []);
  render();
  H.onHandoutsChange((l) => { list = l; render(); });
  window.addEventListener("storage", (e) => { if (e.key === "myrrodin-relay-status" && !editing) render(); });
  setInterval(() => { if (!editing && !root.closest("[hidden]")) render(); }, 30000);
}
