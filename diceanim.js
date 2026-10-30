// =====================================================================
//  CELESTIAL DICE
//  Draws the dice from a roll as glowing star-glass shapes that tumble,
//  land on their real numbers, then show the total.
//  play(host, rollEvent) -> Promise that resolves when it's finished.
// =====================================================================

const NS = "http://www.w3.org/2000/svg";
let uid = 0;

// Points around a circle, as "x,y x,y ..." in a 100×100 box.
function ring(n, r, rot = -90, cx = 50, cy = 50) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

// Outline + facet lines for each die, so a d20 reads as a d20 at a glance.
function shape(sides) {
  if (sides === 4) {
    const o = [[50, 7], [93, 86], [7, 86]];
    return { outline: pts(o), facets: [[50, 7, 50, 60], [93, 86, 50, 60], [7, 86, 50, 60]], ty: 64, fs: 26 };
  }
  if (sides === 6) {
    return { outline: "14,14 86,14 86,86 14,86", facets: [[14, 14, 24, 24], [86, 14, 76, 24], [86, 86, 76, 76], [14, 86, 24, 76]], inner: "24,24 76,24 76,76 24,76", ty: 52, fs: 32 };
  }
  if (sides === 8) {
    return { outline: "50,4 93,50 50,96 7,50", facets: [[7, 50, 93, 50]], inner: "50,20 76,62 24,62", ty: 54, fs: 24 };
  }
  if (sides === 10 || sides === 100) {
    return { outline: "50,4 94,43 50,96 6,43", facets: [[6, 43, 50, 58], [94, 43, 50, 58], [50, 58, 50, 96], [50, 4, 50, 22]], inner: "50,22 76,44 50,58 24,44", ty: 45, fs: 20 };
  }
  if (sides === 12) {
    const outer = ring(10, 46, -90);
    const inner = ring(5, 27, -90);
    const facets = inner.map(([x, y], i) => [x, y, outer[i * 2][0], outer[i * 2][1]]);
    return { outline: pts(outer), facets, inner: pts(inner), ty: 52, fs: 22 };
  }
  // d20 (and anything else): hexagon with the classic inner triangle.
  const hex = ring(6, 47, -90);
  const tri = [[50, 22], [74, 64], [26, 64]];
  const facets = [
    [50, 22, hex[0][0], hex[0][1]], [74, 64, hex[2][0], hex[2][1]], [26, 64, hex[4][0], hex[4][1]],
    [50, 22, hex[1][0], hex[1][1]], [50, 22, hex[5][0], hex[5][1]],
    [74, 64, hex[1][0], hex[1][1]], [74, 64, hex[3][0], hex[3][1]],
    [26, 64, hex[3][0], hex[3][1]], [26, 64, hex[5][0], hex[5][1]],
  ];
  return { outline: pts(hex), facets, inner: pts(tri), ty: 53, fs: 21 };
}

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function dieSvg(sides, mood) {
  const id = `d${++uid}`;
  const s = shape(sides);
  const svg = el("svg", { viewBox: "0 0 100 100", class: "cd-svg", "aria-hidden": "true" });
  const defs = el("defs", {}, svg);
  const g = el("radialGradient", { id: `${id}-fill`, cx: "38%", cy: "30%", r: "80%" }, defs);
  const stops = mood === "fumble"
    ? [["0%", "#5a1f2e"], ["55%", "#2a0d18"], ["100%", "#12060c"]]
    : mood === "crit"
      ? [["0%", "#fff1c9"], ["35%", "#d8a84a"], ["100%", "#5a2a7a"]]
      : [["0%", "#8a5cf0"], ["45%", "#3b1f78"], ["100%", "#140a2c"]];
  stops.forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, g));
  const glow = el("filter", { id: `${id}-glow`, x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
  el("feGaussianBlur", { stdDeviation: "2.4", result: "b" }, glow);
  const merge = el("feMerge", {}, glow);
  el("feMergeNode", { in: "b" }, merge);
  el("feMergeNode", { in: "SourceGraphic" }, merge);
  const clip = el("clipPath", { id: `${id}-clip` }, defs);
  el("polygon", { points: s.outline }, clip);

  const edge = mood === "fumble" ? "#ff6b7d" : "#f3cf7a";
  el("polygon", { points: s.outline, fill: `url(#${id}-fill)` }, svg);

  // Tiny stars inside the die.
  const stars = el("g", { "clip-path": `url(#${id}-clip)`, class: "cd-stars" }, svg);
  for (let i = 0; i < 14; i++) {
    el("circle", { cx: 10 + Math.random() * 80, cy: 10 + Math.random() * 80, r: (Math.random() * 0.9 + 0.3).toFixed(2), fill: "#fff", opacity: (Math.random() * 0.6 + 0.3).toFixed(2) }, stars);
  }
  const lines = el("g", { stroke: edge, "stroke-width": "1", opacity: ".45", fill: "none" }, svg);
  s.facets.forEach(([x1, y1, x2, y2]) => el("line", { x1, y1, x2, y2 }, lines));
  if (s.inner) el("polygon", { points: s.inner, fill: "rgba(255,255,255,.05)", stroke: edge, "stroke-width": "1.1", opacity: ".8" }, svg);
  el("polygon", { points: s.outline, fill: "none", stroke: edge, "stroke-width": "2.4", "stroke-linejoin": "round", filter: `url(#${id}-glow)` }, svg);
  if (mood === "fumble") el("polyline", { points: "34,18 46,40 38,52 54,70 48,86", fill: "none", stroke: "#ff6b7d", "stroke-width": "1.6", opacity: ".9", class: "cd-crack" }, svg);

  const label = el("text", { x: 50, y: s.ty, "text-anchor": "middle", "dominant-baseline": "middle", class: "cd-num", "font-size": s.fs, fill: mood === "crit" ? "#2a1238" : "#fff6dc" }, svg);
  label.textContent = "";
  return { svg, label };
}

const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function play(host, r) {
  const dice = (r.dice || []).slice(0, 8);
  if (!dice.length) return;
  const mood = r.crit ? "crit" : r.fumble ? "fumble" : r.outcome === "Success" ? "good" : r.outcome === "Failed" ? "bad" : "";

  const stage = document.createElement("div");
  stage.className = `cd-stage cd-${mood || "plain"} ${dice.length > 3 ? "cd-many" : ""}`;
  stage.innerHTML = `<div class="cd-aura"></div><div class="cd-row"></div><div class="cd-card">
      <div class="cd-who"></div><div class="cd-label"></div><div class="cd-total"></div><div class="cd-tag"></div><div class="cd-detail"></div></div>`;
  host.appendChild(stage);
  stage.querySelector(".cd-who").textContent = [r.hidden ? "🔒" : "", r.character || r.player || ""].filter(Boolean).join(" ");
  stage.querySelector(".cd-label").textContent = r.label || "";
  stage.querySelector(".cd-total").textContent = r.total;
  stage.querySelector(".cd-detail").textContent = r.detail || "";
  stage.querySelector(".cd-tag").textContent = r.crit ? "Critical!" : r.fumble ? "Natural 1" : r.outcome || "";

  const row = stage.querySelector(".cd-row");
  const made = dice.map((d, i) => {
    const dieMood = d.x ? "" : d.s === 20 && d.v === 20 ? "crit" : d.s === 20 && d.v === 1 ? "fumble" : "";
    const { svg, label } = dieSvg(d.s, dieMood);
    const wrap = document.createElement("div");
    wrap.className = `cd-die ${d.x ? "cd-dropped" : ""} ${dieMood ? `cd-${dieMood}` : ""}`;
    wrap.style.setProperty("--i", i);
    // Whole turns only, so the number ends up the right way up.
    wrap.style.setProperty("--spin", `${(Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 720 : 1080)}deg`);
    wrap.appendChild(svg);
    const burst = document.createElement("div");
    burst.className = "cd-burst";
    for (let k = 0; k < 10; k++) {
      const sp = document.createElement("i");
      sp.style.setProperty("--a", `${k * 36 + Math.random() * 20}deg`);
      sp.style.setProperty("--d", `${50 + Math.random() * 50}px`);
      burst.appendChild(sp);
    }
    wrap.appendChild(burst);
    row.appendChild(wrap);
    return { d, label, wrap };
  });

  // Tumble: flicker random faces, then land on the real number.
  const tumble = reduce() ? 0 : 1050;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = performance.now() - t0;
      made.forEach(({ d, label }, i) => {
        if (t < tumble + i * 90) label.textContent = String(1 + Math.floor(Math.random() * d.s));
      });
      if (t < tumble + made.length * 90) setTimeout(tick, 55); else resolve();
    };
    tick();
  });
  made.forEach(({ d, label, wrap }) => { label.textContent = String(d.v); wrap.classList.add("cd-landed"); });
  stage.classList.add("cd-show");
  await wait(reduce() ? 2200 : 2300);
  stage.classList.add("cd-out");
  await wait(450);
  stage.remove();
}

// One roll at a time; later rolls wait their turn (max 3 queued).
const queue = [];
let busy = false;
export function enqueue(host, r) {
  if (!r?.dice?.length) return;
  if (queue.length >= 3) queue.shift();
  queue.push(r);
  if (!busy) drain(host);
}
async function drain(host) {
  busy = true;
  while (queue.length) await play(host, queue.shift());
  busy = false;
  host.dispatchEvent(new CustomEvent("cd-idle"));
}
export const isBusy = () => busy || queue.length > 0;
