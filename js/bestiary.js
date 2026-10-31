// =====================================================================
//  BESTIARY
//  The 334 creatures from the 5E System Reference Document (SRD 5.1),
//  converted into Myr'rodin sheets on the fly.
//
//  SRD 5.1 is © Wizards of the Coast, licensed under CC BY 4.0.
//  Data via the 5e-bits/5e-database project (MIT licence).
// =====================================================================
import { ABILITIES, abilityMod, blankCharacter, normalize } from "./rules.js?v=1.7.2";
import { roll } from "./dice.js?v=1.7.2";

let cache = null;
export async function loadBestiary() {
  if (cache) return cache;
  const res = await fetch(new URL("../data/bestiary.json?v=1.7.2", import.meta.url));
  cache = await res.json();
  return cache;
}

export const crText = (cr) => (cr === 0.125 ? "1/8" : cr === 0.25 ? "1/4" : cr === 0.5 ? "1/2" : String(cr));

// ---- Finding a match for a token -----------------------------------------
// Owlbear's built-in tokens often have generic names ("Beast"), so a few
// generic words point at sensible creatures.
const ALIASES = {
  beast: ["boar", "wolf", "black-bear", "brown-bear", "giant-rat", "panther", "dire-wolf", "giant-spider", "giant-boar", "mastiff"],
  animal: ["boar", "wolf", "black-bear", "mastiff", "riding-horse", "cat", "hawk"],
  undead: ["skeleton", "zombie", "ghoul", "ghost", "wight", "specter", "shadow", "mummy", "vampire-spawn"],
  skeleton: ["skeleton", "minotaur-skeleton", "warhorse-skeleton"],
  zombie: ["zombie", "ogre-zombie"],
  human: ["commoner", "bandit", "guard", "thug", "cultist", "acolyte", "noble", "scout", "veteran", "knight", "mage", "priest", "spy"],
  humanoid: ["commoner", "bandit", "guard", "thug", "cultist", "goblin", "orc", "kobold", "hobgoblin"],
  person: ["commoner", "bandit", "guard", "noble", "acolyte"],
  villager: ["commoner"], peasant: ["commoner"], townsfolk: ["commoner"],
  soldier: ["guard", "veteran", "knight", "hobgoblin"], warrior: ["veteran", "guard", "berserker", "gladiator"],
  fighter: ["veteran", "gladiator", "knight"], knight: ["knight"], guard: ["guard", "veteran"],
  rogue: ["bandit", "spy", "assassin", "thug"], thief: ["bandit", "spy", "thug"], assassin: ["assassin"],
  wizard: ["mage", "archmage", "cult-fanatic"], mage: ["mage", "archmage"], sorcerer: ["mage", "cult-fanatic"],
  cleric: ["priest", "acolyte"], priest: ["priest", "acolyte"], monk: ["acolyte", "veteran"],
  pirate: ["bandit", "bandit-captain", "thug"], bandit: ["bandit", "bandit-captain"], cultist: ["cultist", "cult-fanatic"],
  goblin: ["goblin", "hobgoblin", "bugbear"], orc: ["orc"], kobold: ["kobold", "winged-kobold"],
  dragon: ["red-dragon-wyrmling", "black-dragon-wyrmling", "blue-dragon-wyrmling", "green-dragon-wyrmling", "white-dragon-wyrmling", "young-red-dragon", "adult-red-dragon"],
  demon: ["imp", "quasit", "hell-hound", "nightmare"], devil: ["imp", "bearded-devil", "barbed-devil"], fiend: ["imp", "quasit", "hell-hound"],
  slime: ["gray-ooze", "ochre-jelly", "black-pudding", "gelatinous-cube"], ooze: ["gray-ooze", "ochre-jelly", "black-pudding", "gelatinous-cube"],
  elemental: ["fire-elemental", "water-elemental", "earth-elemental", "air-elemental"],
  giant: ["hill-giant", "stone-giant", "frost-giant", "fire-giant", "ogre"],
  snake: ["poisonous-snake", "giant-poisonous-snake", "constrictor-snake", "giant-constrictor-snake"],
  spider: ["giant-spider", "giant-wolf-spider", "spider", "phase-spider"],
  rat: ["rat", "giant-rat", "swarm-of-rats"], bat: ["bat", "giant-bat", "swarm-of-bats"],
  dog: ["mastiff", "jackal", "wolf"], hound: ["mastiff", "hell-hound", "death-dog"],
  horse: ["riding-horse", "draft-horse", "warhorse", "pony"],
  cat: ["cat", "panther", "lion", "tiger"], bird: ["hawk", "eagle", "raven", "owl", "giant-eagle"],
  insect: ["giant-wasp", "giant-centipede", "swarm-of-insects", "giant-fire-beetle"], bug: ["giant-centipede", "giant-fire-beetle", "swarm-of-insects"],
  plant: ["shrieker", "violet-fungus", "awakened-shrub", "awakened-tree"], tree: ["awakened-tree", "treant"],
  ghost: ["ghost", "specter", "poltergeist", "banshee"], vampire: ["vampire-spawn", "vampire"],
  monster: ["owlbear", "ogre", "troll", "minotaur", "manticore", "basilisk"],
  boss: ["ogre", "troll", "young-red-dragon", "mage", "knight"],
};

const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const stem = (w) => w.replace(/(es|s)$/, "");

export function search(list, query, limit = 40) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return list.slice().sort((a, b) => a.cr - b.cr || a.n.localeCompare(b.n)).slice(0, limit);
  const qWords = words(q).map(stem);
  const aliasHits = new Map();
  qWords.forEach((w) => (ALIASES[w] || ALIASES[w + "s"] || []).forEach((id, i) => aliasHits.set(id, Math.max(aliasHits.get(id) || 0, 75 - i))));

  const scored = [];
  for (const m of list) {
    const name = m.n.toLowerCase();
    const nWords = words(name).map(stem);
    let score = 0;
    if (name === q) score = 120;
    else if (name.startsWith(q)) score = 95;
    else if (qWords.length && qWords.every((w) => nWords.includes(w))) score = 85;
    else if (qWords.some((w) => w.length > 2 && nWords.includes(w))) score = 65;
    else if (name.includes(q)) score = 60;
    score = Math.max(score, aliasHits.get(m.i) || 0);
    if (!score && qWords.some((w) => words(m.ty).map(stem).includes(w))) score = 30;
    if (score) scored.push([score, m]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].cr - b[1].cr || a[1].n.localeCompare(b[1].n)).slice(0, limit).map((x) => x[1]);
}

// ---- Converting to a Myr'rodin sheet ------------------------------------
const SKILL_MAP = {
  athletics: "athletics", acrobatics: "acrobatics", "sleight-of-hand": "sleight", stealth: "stealth",
  arcana: "arcana", history: "history", investigation: "investigation", nature: "nature", religion: "religion",
  "animal-handling": "animal", insight: "insight", medicine: "medicine", perception: "perception", survival: "survival",
  deception: "deception", intimidation: "intimidation", performance: "performance", persuasion: "persuasion",
};
const SKILL_ABILITY = {
  athletics: "str", acrobatics: "dex", sleight: "dex", stealth: "dex", arcana: "int", history: "int", investigation: "int",
  nature: "int", religion: "int", animal: "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
  deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
};

const short = (text, max = 380) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
};

export function toCharacter(m, { rollHp = true, vary = true, name = "" } = {}) {
  const keys = ABILITIES.map((a) => a.key);
  const base = Object.fromEntries(keys.map((k, i) => [k, m.ab[i]]));
  const baseMod = Object.fromEntries(keys.map((k) => [k, abilityMod(base[k])]));

  // Small random nudges so no two skeletons are identical.
  const abilities = { ...base };
  if (vary) keys.forEach((k) => { abilities[k] = Math.max(1, base[k] + (Math.floor(Math.random() * 3) - 1)); });

  let hpMax = m.hp;
  let hpNote = `${m.hp} average (${m.hd})`;
  if (rollHp && m.hd) {
    const r = roll(m.hd);
    hpMax = Math.max(1, r.total);
    hpNote = `rolled ${hpMax} on ${m.hd} (average ${m.hp})`;
  }

  const pb = m.pb || 2;
  const saves = Object.fromEntries(keys.map((k) => [k, (m.sv || []).includes(k)]));

  // Skills: work out the tier from how much the bonus exceeds the ability modifier.
  const skills = {};
  for (const [src, value] of Object.entries(m.sk || {})) {
    const key = SKILL_MAP[src];
    if (!key) continue;
    const extra = value - baseMod[SKILL_ABILITY[key]];
    const tier = extra >= pb * 2 ? "expert" : extra >= pb ? "prof" : "none";
    const mult = tier === "expert" ? 2 : tier === "prof" ? 1 : 0;
    const misc = extra - pb * mult;
    skills[key] = misc ? { tier, misc } : { tier };
  }

  const attacks = [];
  const features = [];
  const combat = [];
  let spellNotes = "";

  for (const a of m.act || []) {
    if (/^multiattack$/i.test(a.n)) { combat.unshift(short(a.d.replace(/^The [^.]*? makes /i, "Makes "), 200)); continue; }
    if (a.b !== undefined) {
      const toHitMod = a.b - pb;
      const ranged = /ranged/i.test(a.d) && !/melee or ranged/i.test(a.d);
      let ability = toHitMod === baseMod.str ? "str" : toHitMod === baseMod.dex ? "dex" : ranged ? "dex" : "str";
      if (toHitMod === baseMod.str && toHitMod === baseMod.dex) ability = ranged ? "dex" : "str";
      const [dice = "", type = ""] = (a.dm || [])[0] || [];
      const dm = dice.match(/^(\d*d\d+)\s*([+-]\s*\d+)?$/);
      let damage = dice;
      if (dm) {
        const flat = dm[2] ? Number(dm[2].replace(/\s+/g, "")) : 0;
        const offset = flat - baseMod[ability];
        damage = offset ? `${dm[1]}${offset > 0 ? "+" : ""}${offset}` : dm[1];
      }
      const range = (a.d.match(/reach (\d+ ft)\./i) || a.d.match(/range ([\d/]+ ft)\./i) || [])[1] || "";
      const extra = (a.dm || []).slice(1).map(([d2, t2]) => `+${d2} ${t2}`).join(", ");
      const hit = (a.d.match(/Hit: (.*)$/i) || [])[1] || "";
      attacks.push({
        name: a.n, range, ability, damage, damageType: type, proficient: true, equipped: true, graze: false,
        bonus: a.b - pb - baseMod[ability],
        notes: short([extra, /saving throw|prone|grappled|restrained|poisoned/i.test(hit) ? hit : ""].filter(Boolean).join(" · "), 220),
      });
      combat.push(a.n);
    } else {
      features.push(`${a.n}: ${short(a.d)}`);
    }
  }

  for (const [n, d] of m.tr || []) {
    if (/spellcasting/i.test(n)) { spellNotes += `${n}: ${d.replace(/\s+/g, " ").trim()}\n\n`; features.push(`${n}: see Notes for the spell list.`); }
    else features.push(`${n}: ${short(d)}`);
  }
  for (const [n, d] of m.rea || []) features.push(`Reaction — ${n}: ${short(d)}`);
  for (const [n, d] of m.leg || []) features.push(`Legendary — ${n}: ${short(d, 220)}`);

  const defences = [];
  if (m.res?.length) defences.push(`Resistant: ${m.res.join(", ")}`);
  if (m.imm?.length) defences.push(`Immune: ${m.imm.join(", ")}`);
  if (m.vul?.length) defences.push(`Vulnerable: ${m.vul.join(", ")}`);
  if (m.ci?.length) defences.push(`Condition immunities: ${m.ci.join(", ")}`);
  if (m.se) defences.push(`Senses: ${m.se}`);

  const speeds = String(m.sp || "30 ft.").split(",").map((s) => s.trim());
  const walk = (speeds.find((s) => /^\d/.test(s)) || "0 ft.").replace(/\s*ft\.?/, "");
  const otherSpeeds = speeds.filter((s) => !/^\d/.test(s)).join(", ");

  const c = blankCharacter(name || m.n);
  Object.assign(c, {
    name: name || m.n,
    class: `CR ${crText(m.cr)} · ${m.sz} ${m.ty}`,
    race: m.n,
    lineage: m.al || "",
    background: "",
    level: Math.max(1, Math.floor(m.cr)),
    profBonus: pb,
    abilities,
    saves,
    skills,
    ac: m.ac,
    speed: walk,
    speedNotes: otherSpeeds,
    hp: { current: hpMax, max: hpMax, temp: 0 },
    combat: combat.map((text) => ({ text, done: false })),
    features: [...defences, ...features],
    attacks,
    attackNotes: "",
    languages: m.la || "",
    armorProfs: m.acn ? `AC ${m.ac} (${m.acn})` : "",
    notes: `${m.n} — CR ${crText(m.cr)}, ${m.xp} XP. Hit points ${hpNote}.\n\n${spellNotes}Stats from the 5E SRD 5.1 (CC BY 4.0).`.trim(),
    gmOnly: true,
    monster: { id: m.i, cr: m.cr },
  });
  return normalize(c);
}
