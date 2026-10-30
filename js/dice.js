// Dice roller: understands things like "1d20+5", "2d6 + 4", "3d4-1", "d8".
// Options: { advantage: true } or { disadvantage: true } for d20 rolls.

const rollDie = (sides) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
};

export function isDiceExpression(text) {
  return /\d*d\d+/i.test(String(text || ""));
}

export function roll(expression, opts = {}) {
  const clean = String(expression || "0").replace(/\s+/g, "").toLowerCase();
  const terms = clean.match(/[+-]?[^+-]+/g) || ["0"];
  let total = 0;
  const parts = [];
  let natural = null; // the kept d20, for crits

  for (const raw of terms) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const term = raw.replace(/^[+-]/, "");
    const m = term.match(/^(\d*)d(\d+)$/);
    if (m) {
      const count = Math.min(Number(m[1] || 1), 100);
      const sides = Math.max(Number(m[2]), 1);
      if (count === 1 && sides === 20 && (opts.advantage || opts.disadvantage) && !(opts.advantage && opts.disadvantage)) {
        const a = rollDie(20), b = rollDie(20);
        const kept = opts.advantage ? Math.max(a, b) : Math.min(a, b);
        natural = kept;
        total += sign * kept;
        parts.push(`${sign < 0 ? "-" : ""}d20${opts.advantage ? "↑" : "↓"}[${a}, ${b}]`);
      } else {
        const rolls = Array.from({ length: count }, () => rollDie(sides));
        const sum = rolls.reduce((x, y) => x + y, 0);
        if (count === 1 && sides === 20) natural = rolls[0];
        total += sign * sum;
        parts.push(`${sign < 0 ? "-" : ""}${count}d${sides}[${rolls.join(", ")}]`);
      }
    } else {
      const n = Number(term) || 0;
      if (n === 0) continue;
      total += sign * n;
      parts.push(`${sign < 0 ? "-" : "+"}${n}`);
    }
  }

  const detail = parts.join(" ").replace(/^\+/, "").replace(/\s\+(\d)/g, " + $1").replace(/\s-(\d)/g, " - $1");
  return { total, detail, natural, crit: natural === 20, fumble: natural === 1 };
}

// Build "1d20+X" from a bonus number.
export const d20 = (bonus) => (bonus ? `1d20${bonus > 0 ? "+" : ""}${bonus}` : "1d20");

// Add a flat bonus to any dice expression ("2d6" + 4 -> "2d6+4").
export const plus = (expr, bonus) =>
  !bonus ? String(expr || "0") : `${expr || "0"}${bonus > 0 ? "+" : ""}${bonus}`;
