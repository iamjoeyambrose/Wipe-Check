/**
 * Gear: five slots, role-locked weapons, and the layered stat model that makes
 * swapping a piece actually recompute a hero.
 *
 * A hero's numbers are rebuilt from three layers every time anything changes:
 *
 *     base  ->  perks (level-up draft, permanent)  ->  gear (swappable)
 *
 * so nothing is ever destructively multiplied into a hero field. Items are
 * written as `mul` (multiplicative) and `add` (additive) maps over STAT_BASE
 * keys, plus `flags` for behaviour that isn't a number.
 *
 * Design rule for the pool: no item is a pure upgrade. Every piece either
 * carries a real cost or is narrow enough that it only pays off inside one
 * build. You should be able to say why you took the gloves.
 */

import { CLASSES, ROLES, rnd } from './config.js';
import { ri, clamp } from './util.js';

/* ------------------------------------------------------------------ slots */
const SLOTS = ['weapon', 'chest', 'gloves', 'boots', 'ring'];
const SLOT_NAME = { weapon: 'Weapon', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', ring: 'Ring' };
const WEAPON_KIND = { tank: 'Sword & Shield', dps: 'Bow', heal: 'Staff' };

/* Lower is better for dr (incoming damage multiplier), atkCd and cost. */
function baseStats(key, cls) {
  const R = key === 'dps' ? (CLASSES[cls || 'ranger'] || ROLES.dps) : ROLES[key];
  return {
    hpMax: R.hp, dmg: R.dmg, atkCd: R.atkCd, speed: R.speed, reach: R.reach,
    abilCd: R.abilCd, dr: 1, taunt: 190, thorns: 0, crit: R.crit != null ? R.crit : 0.05, critMul: 0,
    shots: 1, pierce: 0, arc: 1, volleyR: 1, lifesteal: 0,
    healPow: 1, cost: 26, bounce: 1, mpRegen: key === 'heal' ? 12 : 0,
    threatMul: R.threatMul != null ? R.threatMul : 1,
    mpMax: key === 'heal' ? 260 : 0,
  };
}

/* ------------------------------------------------------- the layered build */
function newPerks() { return { mul: {}, add: {}, flags: {} }; }

function fold(out, src) {
  if (!src) return;
  if (src.mul) for (const k in src.mul) out[k] = (out[k] || 0) * src.mul[k];
  if (src.add) for (const k in src.add) out[k] = (out[k] || 0) + src.add[k];
}

function recompute(h) {
  const out = {};
  for (const k in h.base) out[k] = h.base[k];

  fold(out, h.perk);
  const flags = {};
  for (const k in h.perk.flags) flags[k] = (flags[k] || 0) + h.perk.flags[k];

  for (const slot of SLOTS) {
    const it = h.gear[slot];
    if (!it) continue;
    fold(out, it);
    for (const a of it.affixes || []) fold(out, a);
    for (const k in it.flags || {}) flags[k] = (flags[k] || 0) + it.flags[k];
  }

  /* keep a hero's current health where it was relative to a changed pool */
  const prevMax = h.hpMax;
  for (const k in out) h[k] = out[k];
  h.flags = flags;
  h.dr = clamp(h.dr, 0.18, 2);
  h.atkCd = Math.max(0.06, h.atkCd);
  h.cost = Math.max(2, h.cost);
  if (prevMax && h.hpMax !== prevMax) h.hp = Math.max(1, h.hp + (h.hpMax - prevMax));
  if (h.hp > h.hpMax) h.hp = h.hpMax;
  if (h.mp > h.mpMax) h.mp = h.mpMax;
  return h;
}

/* Level-up draft writes here instead of onto the hero, so gear can be
   recomputed on top without losing what the draft gave you. */
function perkMul(h, k, v) { h.perk.mul[k] = (h.perk.mul[k] || 1) * v; recompute(h); }
function perkAdd(h, k, v) { h.perk.add[k] = (h.perk.add[k] || 0) + v; recompute(h); }
function perkFlag(h, k, v) { h.perk.flags[k] = (h.perk.flags[k] || 0) + (v == null ? 1 : v); recompute(h); }

/* ------------------------------------------------------------------ pool */
/* role: 'tank' | 'dps' | 'heal' for weapons, null = anyone can wear it.
   build: the archetype the piece pushes you toward, shown in the UI. */
const ITEMS = [
  /* ---- TANK weapons: sword and shield ---- */
  { id: 'oath', slot: 'weapon', role: 'tank', n: "Warden's Oath", build: 'Aggro wall',
    mul: { arc: 1.55, dmg: 0.90, threatMul: 1.6 },
    t: 'Cleave arc +55%, damage −10%, threat generated ×1.6.' },
  { id: 'rivet', slot: 'weapon', role: 'tank', n: 'The Rivet Maul', build: 'Slow bruiser',
    mul: { dmg: 1.45, atkCd: 1.33 }, flags: { knockback: 1 },
    t: 'Damage +45%, attack speed −25%. Every swing knocks back.' },
  { id: 'splitleaf', slot: 'weapon', role: 'tank', n: 'Splitleaf & Buckler', build: 'Sustain tank',
    mul: { atkCd: 0.74, arc: 0.75 }, add: { lifesteal: 0.07 },
    t: 'Attack speed +35%, arc −25%, lifesteal 7%.' },
  { id: 'lastline', slot: 'weapon', role: 'tank', n: 'Tower of the Last Line', build: 'Thorns',
    mul: { dr: 0.80, dmg: 0.80 }, add: { thorns: 0.22 },
    t: 'Armour +20%, reflect +22%, damage −20%.' },

  /* ---- DPS weapons: bow ---- */
  { id: 'widow', slot: 'weapon', role: 'dps', cls: 'ranger', n: 'Widowdraw', build: 'Crit sniper',
    mul: { atkCd: 1.43 }, add: { crit: 0.18, critMul: 0.6 },
    t: 'Crit chance +18%, crit damage +60%, attack speed −30%.' },
  { id: 'storm', slot: 'weapon', role: 'dps', cls: 'ranger', n: 'Stormfeather', build: 'Spray',
    mul: { dmg: 0.65 }, add: { shots: 2 },
    t: '+2 arrows per shot, damage per arrow −35%.' },
  { id: 'ironpoint', slot: 'weapon', role: 'dps', cls: 'ranger', n: 'Ironpoint Recurve', build: 'Line clear',
    mul: { dmg: 1.18, threatMul: 1.4 }, add: { pierce: 2 },
    t: 'Pierce +2, damage +18% — and threat ×1.4. Mind the tank.' },
  { id: 'whisper', slot: 'weapon', role: 'dps', cls: 'ranger', n: "Hunter's Whisper", build: 'Safe DPS',
    mul: { dmg: 1.12, threatMul: 0.45 },
    t: 'Damage +12%, threat generated ×0.45. Nothing looks at you.' },

  /* ---- DPS weapons: daggers (the Shade) ---- */
  { id: 'nightfang', slot: 'weapon', role: 'dps', cls: 'rogue', n: 'Nightfang', build: 'Crit',
    mul: { dmg: 0.90 }, add: { crit: 0.18, critMul: 0.5 },
    t: 'Crit chance +18%, crit damage +50%, damage −10%.' },
  { id: 'twinstroke', slot: 'weapon', role: 'dps', cls: 'rogue', n: 'Twinstroke', build: 'Flurry',
    mul: { atkCd: 0.78, dmg: 0.88 }, flags: { twinfangs: 1 },
    t: 'Attack speed +28%, damage −12%. Every third strike hits twice.' },
  { id: 'veindrinker', slot: 'weapon', role: 'dps', cls: 'rogue', n: 'Vein-drinker', build: 'Sustain',
    mul: { hpMax: 0.90 }, add: { lifesteal: 0.09 },
    t: 'Lifesteal 9%, max health −10%.' },

  /* ---- HEALER weapons: staff ---- */
  { id: 'vigil', slot: 'weapon', role: 'heal', n: 'Staff of the Long Vigil', build: 'Big heals',
    mul: { healPow: 1.5, cost: 1.4 },
    t: 'Healing +50%, mana cost +40%. Fewer, bigger casts.' },
  { id: 'kindling', slot: 'weapon', role: 'heal', n: 'Kindling Rod', build: 'Mana engine',
    mul: { cost: 0.55, healPow: 0.85 }, add: { mpRegen: 6 },
    t: 'Heal cost −45%, mana regen +6/s, healing −15%.' },
  { id: 'censer', slot: 'weapon', role: 'heal', n: 'Censer of Wrath', build: 'Battle priest',
    mul: { dmg: 2.6, healPow: 0.75 },
    t: 'Smite damage ×2.6, healing −25%. Heal by killing faster.' },
  { id: 'chainbind', slot: 'weapon', role: 'heal', n: 'Chainbinder', build: 'Group healer',
    mul: { healPow: 0.8 }, add: { bounce: 2 },
    t: 'Heals bounce to 2 more allies, healing −20%.' },

  /* ---- CHEST: how you survive ---- */
  { id: 'slag', slot: 'chest', n: 'Slagforged Plate', build: 'Immovable',
    mul: { dr: 0.74, speed: 0.82 }, t: 'Armour +26%, movement −18%.' },
  { id: 'secondbreath', slot: 'chest', n: 'Vest of Second Breath', build: 'Attrition',
    mul: { hpMax: 1.12 }, flags: { regen: 0.009 },
    t: 'Max health +12% and you regenerate 0.9% of it per second.' },
  { id: 'martyr', slot: 'chest', n: 'Ribcage of the Martyr', build: 'Thorns',
    mul: { hpMax: 0.88 }, add: { thorns: 0.35 },
    t: 'Reflect +35%, max health −12%.' },
  { id: 'ghostweave', slot: 'chest', n: 'Ghostweave', build: 'Untargeted',
    mul: { threatMul: 0.6, hpMax: 0.82, speed: 1.10 },
    t: 'Threat ×0.6, movement +10%, max health −18%.' },
  { id: 'unbroken', slot: 'chest', n: 'Chest of the Unbroken', build: 'Generalist',
    mul: { dr: 0.87, hpMax: 1.14 }, t: 'Armour +13%, max health +14%. No downside, no identity.' },

  /* ---- GLOVES: cadence ---- */
  { id: 'quickfingers', slot: 'gloves', n: 'Quickfingers', build: 'Fast and light',
    mul: { atkCd: 0.77, dmg: 0.85 }, t: 'Attack speed +30%, damage −15%.' },
  { id: 'reaper', slot: 'gloves', n: "Reaper's Grip", build: 'Crit',
    mul: { atkCd: 1.25 }, add: { critMul: 0.8 },
    t: 'Crit damage +80%, attack speed −20%.' },
  { id: 'longhaul', slot: 'gloves', n: 'Gauntlets of the Long Haul', build: 'Ability spam',
    mul: { abilCd: 0.72 }, t: 'Ability cooldown −28%.' },
  { id: 'bloodgroove', slot: 'gloves', n: 'Bloodgroove Wraps', build: 'Lifesteal',
    mul: { hpMax: 0.90 }, add: { lifesteal: 0.10 },
    t: 'Lifesteal 10%, max health −10%.' },
  { id: 'anvilknuck', slot: 'gloves', n: 'Anvil Knuckles', build: 'Heavy hits',
    mul: { dmg: 1.32, atkCd: 1.28 }, t: 'Damage +32%, attack speed −22%.' },
  { id: 'silk', slot: 'gloves', n: 'Silk Bindings', build: 'Caster',
    mul: { healPow: 1.12 }, add: { mpRegen: 9 },
    t: 'Mana regen +9/s, healing +12%. Dead weight on anyone but the Mender.' },

  /* ---- BOOTS: positioning ---- */
  { id: 'runner', slot: 'boots', n: "Runner's Tread", build: 'Kiting',
    mul: { speed: 1.22 }, t: 'Movement +22%.' },
  { id: 'siege', slot: 'boots', n: 'Siegeboots', build: 'Anchor',
    mul: { speed: 0.75, dr: 0.78, threatMul: 1.3 },
    t: 'Armour +22%, threat ×1.3, movement −25%.' },
  { id: 'vagrant', slot: 'boots', n: "Vagrant's Sandals", build: 'Fast levelling',
    mul: { speed: 1.14 }, flags: { vac: 0.8 },
    t: 'Movement +14%, experience pickup radius +80%.' },
  { id: 'heldline', slot: 'boots', n: 'Boots of the Held Line', build: 'Turret',
    flags: { rooted: 0.35 },
    t: 'Standing still for a second grants +35% damage until you move.' },
  { id: 'coward', slot: 'boots', n: "Coward's Heels", build: 'Untargeted',
    mul: { speed: 1.18, threatMul: 0.55, hpMax: 0.88 },
    t: 'Movement +18%, threat ×0.55, max health −12%.' },

  /* ---- RING: the wildcard, sharpest trade in the game ---- */
  { id: 'excess', slot: 'ring', n: 'Signet of Excess', build: 'Glass cannon',
    mul: { dmg: 1.55, hpMax: 0.70 }, t: 'Damage +55%, max health −30%.' },
  { id: 'quiethand', slot: 'ring', n: 'Band of the Quiet Hand', build: 'Untargeted',
    mul: { threatMul: 0.35, dmg: 0.90 },
    t: 'Threat ×0.35, damage −10%. Effectively invisible.' },
  { id: 'spite', slot: 'ring', n: 'Loop of Spite', build: 'Thorns',
    mul: { threatMul: 1.5 }, add: { thorns: 0.45 },
    t: 'Reflect +45%, threat ×1.5. Make them come to you.' },
  { id: 'ninthlife', slot: 'ring', n: 'Ring of the Ninth Life', build: 'Insurance',
    flags: { guardian: 1 }, t: 'Once per stage, a fatal hit leaves you at 1 health.' },
  { id: 'bloodpact', slot: 'ring', n: 'Bloodpact Band', build: 'Lifesteal',
    mul: { hpMax: 0.92 }, add: { lifesteal: 0.14 },
    t: 'Lifesteal 14%, max health −8%. Your healing is your damage.' },
  { id: 'chamber', slot: 'ring', n: 'Ring of the Full Chamber', build: 'Burst',
    flags: { firstStrike: 1 },
    t: 'Your first hit on an undamaged enemy always crits.' },
  { id: 'ashen', slot: 'ring', n: 'Ashen Coil', build: 'Snowball',
    flags: { momentum: 0.02 },
    t: 'Every kill grants +2% damage. Resets when the stage does.' },
  { id: 'widowknot', slot: 'ring', n: "Widow's Knot", build: 'Execute',
    flags: { execute: 0.45 },
    t: '+45% damage to enemies below a third of their health.' },
];

/* Rarity adds minor affixes on top. The identity never changes -- an Epic
   Reaper's Grip is still a crit-damage glove, just with more on it. */
const AFFIXES = [
  { n: 'of the Bear', mul: { hpMax: 1.10 }, t: '+10% max health' },
  { n: 'of Haste', mul: { atkCd: 0.92 }, t: '+9% attack speed' },
  { n: 'of the Wolf', mul: { speed: 1.08 }, t: '+8% movement' },
  { n: 'of Malice', add: { crit: 0.06 }, t: '+6% crit chance' },
  { n: 'of the Anvil', mul: { dr: 0.93 }, t: '+7% armour' },
  { n: 'of Cruelty', add: { critMul: 0.25 }, t: '+25% crit damage' },
  { n: 'of Mending', mul: { healPow: 1.14 }, t: '+14% healing' },
  { n: 'of Silence', mul: { threatMul: 0.85 }, t: '−15% threat' },
  { n: 'of Fury', mul: { dmg: 1.10 }, t: '+10% damage' },
  { n: 'of the Vein', add: { lifesteal: 0.04 }, t: '+4% lifesteal' },
];

const QUALITY = [
  { n: 'Uncommon', col: '#4ADE55', affixes: 0 },
  { n: 'Rare', col: '#3B8FE0', affixes: 1 },
  { n: 'Epic', col: '#A335EE', affixes: 2 },
];

function rollQuality(stage, luck) {
  const r = rnd() + stage * 0.09 + (luck || 0) * 0.06;
  if (r > 1.02) return 2;
  if (r > 0.55) return 1;
  return 0;
}

let uid = 0;
function rollItem(stage, opts) {
  opts = opts || {};
  let pool = ITEMS;
  if (opts.slot) pool = pool.filter((i) => i.slot === opts.slot);
  if (opts.role) pool = pool.filter((i) => !i.role || i.role === opts.role);
  if (opts.cls) pool = pool.filter((i) => !i.cls || i.cls === opts.cls);
  if (opts.exclude) pool = pool.filter((i) => opts.exclude.indexOf(i.id) < 0);
  if (!pool.length) pool = ITEMS;

  const proto = pool[Math.floor(rnd() * pool.length)];
  const q = opts.quality != null ? opts.quality : rollQuality(stage, opts.luck);
  const picks = [];
  const bag = AFFIXES.slice();
  for (let i = 0; i < QUALITY[q].affixes && bag.length; i++) {
    picks.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
  }
  return Object.assign({}, proto, { q, affixes: picks, uid: ++uid });
}

/* Boss drops: three pieces, never two of the same slot, weapons biased toward
   whoever hasn't found one yet. */
function rollDrops(stage, party, opts) {
  opts = opts || {};
  const count = opts.count || 3, luck = opts.luck || 0;
  const out = [];
  const slots = SLOTS.slice();
  const cls = (party && party.dps && party.dps.cls) || 'ranger';
  const naked = ['tank', 'dps', 'heal'].filter((k) => party && !party[k].gear.weapon);
  if (naked.length && rnd() < 0.7) {
    const role = naked[Math.floor(rnd() * naked.length)];
    out.push(rollItem(stage, { slot: 'weapon', role, cls, luck }));
    slots.splice(slots.indexOf('weapon'), 1);
  }
  while (out.length < count && slots.length) {
    const slot = slots.splice(Math.floor(rnd() * slots.length), 1)[0];
    const role = slot === 'weapon' ? ['tank', 'dps', 'heal'][ri(0, 2)] : null;
    out.push(rollItem(stage, { slot, role, cls, luck, exclude: out.map((i) => i.id) }));
  }
  return out;
}

function canEquip(h, item) { return (!item.role || item.role === h.key) && (!item.cls || item.cls === (h.cls || 'ranger')); }

function equip(h, item) {
  if (!canEquip(h, item)) return null;
  const old = h.gear[item.slot] || null;
  h.gear[item.slot] = item;
  recompute(h);
  return old;
}

/* ------------------------------------------------------------------- text */
function fullName(item) {
  const a = item.affixes && item.affixes.length ? ' ' + item.affixes[0].n : '';
  return item.n + a;
}
function qualityCol(item) { return QUALITY[item.q].col; }
function qualityName(item) { return QUALITY[item.q].n; }
function slotLabel(item) {
  return item.role ? WEAPON_KIND[item.role] : SLOT_NAME[item.slot];
}
function affixLines(item) { return (item.affixes || []).map((a) => a.t); }

/* What changes if this hero equips this item -- the deltas the loot screen
   shows so a pick is a decision rather than a coin flip. */
const COMPARE = [
  ['dmg', 'Damage', 1], ['atkCd', 'Attack speed', -1], ['hpMax', 'Health', 1],
  ['dr', 'Armour', -1], ['speed', 'Movement', 1], ['threatMul', 'Threat', 1],
  ['crit', 'Crit', 1], ['critMul', 'Crit damage', 1], ['healPow', 'Healing', 1],
  ['cost', 'Mana cost', -1], ['thorns', 'Reflect', 1], ['lifesteal', 'Lifesteal', 1],
  ['abilCd', 'Cooldown', -1], ['shots', 'Arrows', 1], ['pierce', 'Pierce', 1],
  ['bounce', 'Bounces', 1], ['arc', 'Cleave', 1], ['mpRegen', 'Mana regen', 1],
];

function preview(h, item) {
  const before = {};
  for (const k in h.base) before[k] = h[k];
  const keep = h.gear[item.slot];
  h.gear[item.slot] = item;
  recompute(h);
  const rows = [];
  for (const [k, label, dir] of COMPARE) {
    const a = before[k], b = h[k];
    if (a === b || a == null) continue;
    const pct = (k === 'shots' || k === 'pierce' || k === 'bounce')
      ? null : Math.round(((b - a) / (a || 1)) * 100);
    const raw = (k === 'shots' || k === 'pierce' || k === 'bounce')
      ? Math.round(b - a) : null;
    const good = dir > 0 ? b > a : b < a;
    rows.push({
      label,
      text: raw != null ? (raw > 0 ? '+' + raw : String(raw))
        : (pct > 0 ? '+' + pct + '%' : pct + '%'),
      good: k === 'threatMul' ? null : good,
    });
  }
  h.gear[item.slot] = keep;
  recompute(h);
  return rows;
}

export {
  SLOTS, SLOT_NAME, WEAPON_KIND, ITEMS, AFFIXES, QUALITY,
  baseStats, newPerks, recompute, perkMul, perkAdd, perkFlag,
  rollItem, rollDrops, equip, canEquip,
  fullName, qualityCol, qualityName, slotLabel, affixLines, preview,
};
