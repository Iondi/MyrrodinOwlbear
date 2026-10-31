// =====================================================================
//  MYR'RODIN SYSTEM — RULES
//  Everything that is "how the game works" lives in this one file, so
//  you can change a house rule without touching the rest of the code.
// =====================================================================

// ---- House-rule switches ---------------------------------------------
// Change these to match how you actually run the game.
export const HOUSE_RULES = {
  // Proficiency tier bonuses, as a multiple of the proficiency bonus.
  // Your sheet's legend: Inept = Fail, Deficient = 0, Prof = +2,
  // Expert = +4, Master = Adv. With a +2 proficiency bonus these match.
  tierMultiplier: { none: 0, inept: 0, deficient: 0, prof: 1, expert: 2, master: 2 },

  // Master tier rolls with advantage (on top of the Expert bonus).
  masterRollsWithAdvantage: true,

  // Inept tier can't succeed: the roll is shown as an automatic failure.
  ineptAutoFails: true,

  // Spend mana when a cast roll FAILS to beat the DC to Cast?
  manaSpentOnFailedCast: false,

  // Proficient weapons add the proficiency bonus to the attack roll.
  weaponProficiencyAddsBonus: true,
};

// ---- Abilities ---------------------------------------------------------
export const ABILITIES = [
  { key: "str", name: "Strength", short: "STR" },
  { key: "dex", name: "Dexterity", short: "DEX" },
  { key: "con", name: "Constitution", short: "CON" },
  { key: "int", name: "Intelligence", short: "INT" },
  { key: "wis", name: "Wisdom", short: "WIS" },
  { key: "cha", name: "Charisma", short: "CHA" },
];

export const abilityMod = (score) => Math.floor((Number(score || 10) - 10) / 2);

// ---- Skills (30, five per ability, exactly as on your sheet) -----------
export const SKILLS = [
  ["athletics", "Athletics", "str"], ["grappling", "Grappling", "str"],
  ["hoist", "Hoist/Lift", "str"], ["sprinting", "Sprinting", "str"],
  ["swimming", "Swimming", "str"],
  ["acrobatics", "Acrobatics", "dex"], ["mount", "Mount Control", "dex"],
  ["reflex", "Reflex", "dex"], ["sleight", "Sleight of Hand", "dex"],
  ["stealth", "Stealth", "dex"],
  ["carouse", "Carouse", "con"], ["concentration", "Concentration", "con"],
  ["endurance", "Endurance", "con"], ["manaburn", "Mana Burn", "con"],
  ["vitality", "Vitality", "con"],
  ["arcana", "Arcana", "int"], ["history", "History", "int"],
  ["investigation", "Investigation", "int"], ["nature", "Nature", "int"],
  ["religion", "Religion", "int"],
  ["animal", "Animal Handling", "wis"], ["insight", "Insight", "wis"],
  ["medicine", "Medicine", "wis"], ["perception", "Perception", "wis"],
  ["survival", "Survival", "wis"],
  ["deception", "Deception", "cha"], ["diplomacy", "Diplomacy", "cha"],
  ["intimidation", "Intimidation", "cha"], ["performance", "Performance", "cha"],
  ["persuasion", "Persuasion", "cha"],
].map(([key, name, ability]) => ({ key, name, ability }));

export const TIERS = [
  { id: "none", label: "—", short: "" },
  { id: "inept", label: "Inept", short: "I" },
  { id: "deficient", label: "Deficient", short: "D" },
  { id: "prof", label: "Proficient", short: "P" },
  { id: "expert", label: "Expert", short: "E" },
  { id: "master", label: "Master", short: "M" },
];

// ---- Levels (from your FORMULAS tab) -----------------------------------
// XP needed for each level, 1 through 30.
export const XP_TABLE = [
  0, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
  11000, 12000, 13000, 14000, 15000, 20000, 25000, 30000, 35000, 40000,
  45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000,
];
// Mana regen by Intelligence score (the "Ability Point / Mana" table on
// your FORMULAS tab). Int 11 -> 1, Int 20 -> 1d10, and so on.
export const MANA_REGEN_BY_INT = [
  [0, "0"], [10, "1"], [12, "1d4"], [14, "1d6"], [16, "1d8"], [18, "2d4"],
  [20, "1d10"], [22, "1d12"], [24, "2d6"], [26, "3d4"], [28, "2d8"], [30, "4d4"], [32, "1d20"],
  [34, "2d10"], [36, "2d12"], [38, "4d6"], [40, "3d10"],
];
export function manaRegenFor(intScore) {
  const n = Number(intScore) || 0;
  let out = "0";
  MANA_REGEN_BY_INT.forEach(([need, regen]) => { if (n >= need) out = regen; });
  return out;
}

export function levelFromXp(xp) {
  const n = Number(xp) || 0;
  let lvl = 1;
  XP_TABLE.forEach((need, i) => { if (n >= need) lvl = i + 1; });
  return lvl;
}

// ---- Spells (from your SPELL LIST tab) ----------------------------------
// Default mana cost and DC to Cast for each spell level.
export const SPELL_LEVELS = [
  { level: 0, label: "Cantrip", mana: 0, dc: 0 },
  { level: 1, label: "1st", mana: 2, dc: 10 },
  { level: 2, label: "2nd", mana: 5, dc: 15 },
  { level: 3, label: "3rd", mana: 8, dc: 19 },
  { level: 4, label: "4th", mana: 12, dc: 23 },
  { level: 5, label: "5th", mana: 15, dc: 26 },
  { level: 6, label: "6th", mana: 18, dc: 29 },
  { level: 7, label: "7th", mana: 21, dc: 31 },
  { level: 8, label: "8th", mana: 24, dc: 33 },
  { level: 9, label: "9th", mana: 27, dc: 35 },
  { level: 10, label: "10th", mana: 30, dc: 40 },
  { level: 11, label: "11th", mana: 33, dc: 45 },
  { level: 12, label: "12th", mana: 36, dc: 50 },
  { level: 13, label: "13th", mana: 40, dc: 55 },
];
// Spells are learned in play: a spell of level N is learned after N
// successful casts. Cantrips come automatically.
export const castsToLearn = (level) => Math.max(0, Number(level) || 0);

// ---- Derived numbers ----------------------------------------------------
export function derive(c) {
  const pb = Number(c.profBonus) || 0;
  const mods = {};
  ABILITIES.forEach((a) => { mods[a.key] = abilityMod(c.abilities?.[a.key]); });

  const saves = {};
  ABILITIES.forEach((a) => {
    saves[a.key] = mods[a.key] + (c.saves?.[a.key] ? pb : 0);
  });

  const skills = {};
  SKILLS.forEach((s) => {
    const tier = c.skills?.[s.key]?.tier || "none";
    const misc = Number(c.skills?.[s.key]?.misc) || 0;
    const bonus = mods[s.ability] + pb * (HOUSE_RULES.tierMultiplier[tier] ?? 0) + misc;
    skills[s.key] = {
      bonus,
      tier,
      advantage: tier === "master" && HOUSE_RULES.masterRollsWithAdvantage,
      autoFail: tier === "inept" && HOUSE_RULES.ineptAutoFails,
    };
  });

  const castAbility = c.magic?.ability || "cha";
  return {
    pb,
    mods,
    saves,
    skills,
    initiative: mods.dex + (Number(c.initMisc) || 0),
    // Will Check = Intelligence modifier + Wisdom modifier.
    will: mods.int + mods.wis + (Number(c.willMisc) || 0),
    // Will Save = Will Check + full proficiency if proficient in BOTH Int and
    // Wis saves, half proficiency (rounded down) if proficient in only one.
    willSave: mods.int + mods.wis + (Number(c.willMisc) || 0) +
      (c.saves?.int && c.saves?.wis ? pb : c.saves?.int || c.saves?.wis ? Math.floor(pb / 2) : 0),
    castMod: mods[castAbility] + pb,
    // Spell Save DC = 8 + proficiency + spellcasting modifier.
    spellDC: 8 + pb + mods[castAbility] + (Number(c.spellDCMisc) || 0),
    suggestedRegen: manaRegenFor(c.abilities?.int),
    combinedLevel: (Number(c.level) || 0) + (Number(c.level2) || 0),
    xpLevel: levelFromXp(c.xp),
  };
}

// Is this sheet in the campaign party (saved with the room, kept between scenes)?
// Owned sheets join automatically unless the GM unticked "Campaign party".
export const inParty = (s) => !!s && !s.noParty && !!(s.partyId || s.ownerId);

export const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---- A blank character ---------------------------------------------------
export function blankCharacter(name = "New Adventurer") {
  return {
    system: "myrrodin",
    version: 1,
    name,
    player: "",
    class: "",
    race: "",
    lineage: "",
    background: "",
    level: 1,
    level2: 0,
    xp: 0,
    profBonus: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skills: {},
    ac: 10,
    speed: "30",
    speedNotes: "",
    hp: { current: 10, max: 10, temp: 0 },
    initMisc: 0,
    willMisc: 0,
    spellDCMisc: 0,
    mana: { current: 0, max: 0, regen: "0" },
    psi: { current: 0, max: 0 },
    combat: [],
    features: [],
    feats: [],
    attacks: [],
    attackNotes: "",
    magic: { ability: "cha", spells: [] },
    psionics: [],
    equipment: [],
    money: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    languages: "",
    weaponProfs: "",
    armorProfs: "",
    blurb: "",
    goal: "",
    notes: "",
    gmOnly: false,
    ownerId: "",
  };
}

// Fill in anything missing (for older or hand-made files).
export function normalize(c) {
  const base = blankCharacter();
  const out = { ...base, ...(c || {}) };
  for (const k of ["abilities", "saves", "hp", "mana", "psi", "money", "magic"]) {
    out[k] = { ...base[k], ...(c?.[k] || {}) };
  }
  for (const k of ["combat", "features", "feats", "attacks", "psionics", "equipment"]) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  // Combat helper steps can be plain text in a file; store them as {text, done}.
  out.combat = out.combat.map((s) => (typeof s === "string" ? { text: s, done: false } : { text: s?.text || "", done: !!s?.done }));
  // Equipment can be plain text too.
  out.equipment = out.equipment.map((e) => (typeof e === "string" ? { name: e, qty: 1, notes: "" } : e));
  delete out.combatDone;
  if (!Array.isArray(out.magic.spells)) out.magic.spells = [];
  if (!out.skills || typeof out.skills !== "object") out.skills = {};
  return out;
}
