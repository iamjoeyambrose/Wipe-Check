/**
 * Relics: what comes out of a chest. Every relic is a new behaviour, never a
 * number on the sheet -- the stat sheet belongs to gear and talents. Relics are
 * party-wide and last the run.
 *
 * Boons are pure upside. Curses are double-edged: real bite, real hook.
 */

import { rnd } from './config.js';
import { S } from './state.js';
import { rr } from './util.js';

const RELICS = [
  /* --- boons --- */
  { id: 'luck',      kind: 'boon', stack: true, n: "Rabbit's Foot",
    t: '+1 Luck. Chests come sooner, boss loot rolls a tier higher more often, talents turn up more.' },
  { id: 'chain',     kind: 'boon', n: 'Chain Lightning',
    t: 'Kills have a 20% chance to arc 40% of the blow to the two nearest enemies.' },
  { id: 'toll',      kind: 'boon', n: 'Death Toll',
    t: 'Anything with more than 40 max HP explodes on death for 30% of it.' },
  { id: 'wind',      kind: 'boon', n: 'Second Wind',
    t: 'Once per stage, a downed hero gets back up on their own after 8 seconds.' },
  { id: 'alchemy',   kind: 'boon', n: 'Gem Alchemy',
    t: 'Every sixth gem you collect is worth triple.' },
  { id: 'bounty',    kind: 'boon', n: 'Bounty',
    t: 'Bosses drop four items to pick from instead of three.' },
  { id: 'still',     kind: 'boon', n: 'Momentary Stillness',
    t: 'Every 20 seconds, time stops for every enemy for a second and a half.' },
  { id: 'sense',     kind: 'boon', n: 'Treasure Sense',
    t: 'Chests spawn twice as often, and one is waiting at the start of every stage.' },
  /* --- curses --- */
  { id: 'bloodmoon', kind: 'curse', n: 'Blood Moon',
    t: '40% more enemies. Every enemy drops double gems.' },
  { id: 'frenzy',    kind: 'curse', n: 'Frenzy',
    t: 'Enemies move 20% faster. Hits on wounded trash (under 25%) have a 15% chance to kill outright.' },
  { id: 'night',     kind: 'curse', n: 'Long Night',
    t: 'The dark closes in around the party. Heals have a 20% chance to crit for double.' },
  { id: 'greed',     kind: 'curse', n: 'Greed',
    t: 'Chests spawn twice as often. Half of them are mimics.' },
];
const BY_ID = {};
RELICS.forEach(function (r) { BY_ID[r.id] = r; });

const CURSE_ODDS = 0.30;
const CHEST_GAP = 55;

/* how many of this relic the party holds (0 = none) */
function relic(id) {
  if (!S || !S.relics) return 0;
  let n = 0;
  for (let i = 0; i < S.relics.length; i++) if (S.relics[i] === id) n++;
  return n;
}

/* Kind first (70/30), then uniform inside the kind. Nothing repeats until the
   whole table has been seen; stackables are always fair game. */
function pickRelic() {
  const owned = S.relics || [];
  let pool = RELICS.filter(function (r) { return r.stack || owned.indexOf(r.id) < 0; });
  if (!pool.length) pool = RELICS.slice();
  const boons = pool.filter(function (r) { return r.kind === 'boon'; });
  const curses = pool.filter(function (r) { return r.kind === 'curse'; });
  let side = rnd() < CURSE_ODDS ? curses : boons;
  if (!side.length) side = side === boons ? curses : boons;
  return side[Math.floor(rnd() * side.length)];
}

function applyRelic(r) {
  if (!r) return;
  S.relics.push(r.id);
  if (r.id === 'luck') S.luck = (S.luck || 0) + 1;
  if (r.id === 'frenzy') S.enemies.forEach(function (e) { if (!e.boss) e.sp *= 1.2; });
}

/* seconds until the next chest, with luck and the two chest relics folded in */
function chestInterval() {
  let gap = CHEST_GAP / (1 + 0.25 * (S.luck || 0));
  if (relic('sense')) gap /= 2;
  if (relic('greed')) gap /= 2;
  return gap * rr(0.8, 1.2);
}

function relicName(id) { return BY_ID[id] ? BY_ID[id].n : id; }
function relicKind(id) { return BY_ID[id] ? BY_ID[id].kind : 'boon'; }

/* the held set, collapsed: [{id, n, kind, count}] */
function relicSummary() {
  const out = [], seen = {};
  (S.relics || []).forEach(function (id) {
    if (seen[id]) { seen[id].count++; return; }
    seen[id] = { id: id, n: relicName(id), kind: relicKind(id), count: 1 };
    out.push(seen[id]);
  });
  return out;
}

export { RELICS, relic, pickRelic, applyRelic, chestInterval, relicName, relicKind, relicSummary };
