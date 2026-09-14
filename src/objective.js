/**
 * The door. A stage does not end on a clock: three key fragments sit far
 * apart in the room, each warded, and once the party holds all three a hero
 * has to stand in the gate and turn the key. That is what brings the boss.
 *
 * This module also owns the pressure curve -- the horde tier the spawner
 * reads, the spawn cap, and how enemy and boss strength grow with time.
 */

import { GATE, PLAY, WORLD_W, WORLD_H, COL, rnd } from './config.js';
import { S } from './state.js';
import { spawnEnemy, spawnBoss, spawnChampion } from './actors.js';
import { fx, floatTxt, spark, damageEnemy } from './combat.js';
import { launch } from './physics.js';
import { sfx } from './audio.js';
import { award } from './achievements.js';
import { props } from './art/room.js';
import { clamp, dist, rr } from './util.js';

const WARD_R = 300, PICK_R = 18, GATE_R = 70, KEY_TIME = 2.0, SAFE_R = 130;

/* ------------------------------------------------------------ pressure */
/* seconds into the stage at which each tier arrives, stage 1 -> stage 5 */
const TIERS = [[25, 10], [55, 25], [95, 45], [140, 70]];

function tierTime(i, stage) {
  const k = Math.min(1, Math.max(0, stage / 4));
  return TIERS[i][0] + (TIERS[i][1] - TIERS[i][0]) * k;
}
function hordeTier(t, stage) {
  let n = 0;
  for (let i = 0; i < TIERS.length; i++) if (t >= tierTime(i, stage)) n = i + 1;
  return n;
}
/* how big the crowd may get: the tier grows it, the stage grows it */
function spawnCap(stage, tier) { return 60 + 15 * (tier || 0) + 15 * stage; }
function enemyMul(t, stage) { return 1 + stage * 0.55 + t * 0.003; }
/* a door opened late meets a bigger boss: +40% at two minutes, capped */
function bossMul(t, stage) { return (1 + stage * 0.9) * (1 + Math.min(0.4, t / 300)); }

/* ------------------------------------------------------------ placement */
function farEnough(p, others) { return others.every((o) => dist(p, o) >= 800); }
function blocked(p) { return props.some((q) => q.solid && dist(p, q) < q.solid + 40); }

/* one fragment per vertical third, far from the centre (the middle third can
   only manage the top or bottom band), the gate and each other */
function fragmentsFor(stage) {
  const out = [];
  const thirds = [[PLAY.left + 120, WORLD_W / 3 - 60], [WORLD_W / 3 + 60, 2 * WORLD_W / 3 - 60], [2 * WORLD_W / 3 + 60, PLAY.right - 120]];
  const order = [0, 1, 2].sort(() => rnd() - 0.5);
  const centre = { x: WORLD_W / 2, y: WORLD_H / 2 };
  order.forEach((ti) => {
    let placed = null;
    for (let tries = 0; tries < 80 && !placed; tries++) {
      const p = { x: rr(thirds[ti][0], thirds[ti][1]), y: rr(PLAY.top + 140, PLAY.bot - 120) };
      if (dist(p, centre) < 700) continue;
      if (dist(p, GATE) < 260) continue;
      if (!farEnough(p, out)) continue;
      if (blocked(p)) continue;
      placed = p;
    }
    /* a cornered third still gets a fragment: the far corner of that third */
    if (!placed) placed = { x: ti === 1 ? WORLD_W / 2 : thirds[ti][ti === 0 ? 0 : 1], y: PLAY.bot - 90 };
    out.push({ x: placed.x, y: placed.y, taken: false, warded: false, t: rnd() * 6 });
  });
  return out;
}

const WARDENS = ['Warden Skell', 'Warden Moth', 'Warden Vey'];

function resetObjective(stage) {
  S.frags = fragmentsFor(stage);
  S.keys = 0; S.gateOpen = false; S.keyT = 0; S.keyTurned = false; S.hordeTier = 0; S.bossDue = null; S.keyTurnT = 0;
  S.seatsUsed = {}; S.stageT0 = S.elapsed;
  /* the last stage: no fragments on the floor -- three wardens hold them */
  if (stage === 4) {
    const mul = enemyMul(0, stage);
    S.frags.forEach((f, i) => {
      const c = spawnChampion(WARDENS[i], f.x, f.y, mul);
      f.carrier = c; f.warded = true; c.frag = f;
    });
  }
}

/* a warden went down: its fragment lands where it stood */
/* anywhere a hero can actually stand: heroes are clamped inside PLAY by their
   radius, enemies may drift 40px past it, so a drop is pulled well inside */
function reachable(p) {
  return { x: clamp(p.x, PLAY.left + 60, PLAY.right - 60), y: clamp(p.y, PLAY.top + 60, PLAY.bot - 60) };
}
function championDown(c) {
  const f = c.frag; if (!f) return;
  const at = reachable(c);
  f.carrier = null; f.x = at.x; f.y = at.y; f.taken = false;
  floatTxt(c.x, c.y - 40, c.name + ' falls', COL.gold, 1);
  fx(c.x, c.y, 120, COL.gold, 0.5);
}

/* ---------------------------------------------------------------- events */
/* the ward: a pack bursts from the floor around the fragment, once */
function wardBurst(f) {
  f.warded = true;
  const st = S.stage;
  const elites = 1 + Math.floor(st * 0.75), trash = 5 + 2 * st, mul = enemyMul(S.t, st);
  fx(f.x, f.y, 150, COL.hostile, 0.5);
  floatTxt(f.x, f.y - 40, 'WARDED', COL.hostile, 1);
  sfx('ward');
  for (let i = 0; i < elites + trash; i++) {
    const a = (i / (elites + trash)) * Math.PI * 2, r = 110 + rr(-15, 25);
    const e = spawnEnemy(i < elites ? (st >= 2 && rnd() < 0.5 ? 'caster' : 'brute') : 'grunt', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.7, mul);
    e.stun = 0.5;
    spark(e.x, e.y, 5, COL.hostile, 120);
  }
}

function takeFragment(f, h) {
  f.taken = true; S.keys++;
  fx(f.x, f.y, 90, COL.gold, 0.4); spark(f.x, f.y, 18, COL.gold, 170);
  floatTxt(f.x, f.y - 30, S.keys < 3 ? 'KEY FRAGMENT ' + S.keys + '/3' : 'THE GATE IS OPEN', COL.gold, 1);
  sfx('key');
  if (S.keys >= 3) { S.gateOpen = true; fx(GATE.x, GATE.y + 20, 160, COL.gold, 0.6); }
}

function turnKey() {
  S.keyTurned = true; S.keyT = KEY_TIME; S.keyTurnT = S.t;
  if (S.t <= 90) award('blitz', S.t);
  sfx('keyTurn');
  floatTxt(GATE.x, GATE.y + 60, 'THE KEY TURNS', COL.gold, 1);
  /* the door throws its weight around: everything near the gate is hurled
     back and the trash dies, so the party meets the boss with room to move */
  fx(GATE.x, GATE.y + 20, 320, COL.gold, 0.8);
  S.enemies.slice().forEach((e) => {
    const d = dist(e, GATE); if (d > 340 || e.boss) return;
    const a = Math.atan2(e.y - GATE.y, e.x - GATE.x);
    if (e.elite) launch(e, 380, Math.cos(a), Math.sin(a), 420);
    else { e.hp = 0; damageEnemy(e, 1, false, null); }
  });
  const n = 4 + 2 * S.stage, mul = enemyMul(S.t, S.stage);
  for (let i = 0; i < n; i++) { const e = spawnEnemy(rnd() < 0.4 ? 'runner' : 'grunt', GATE.x + rr(-40, 40), GATE.y - rr(0, 20), mul); e.stun = 1.2; }
  /* the boss is due on the sim clock, so a level-up screen cannot swallow it */
  S.bossDue = S.t + 0.8;
}

/* ------------------------------------------------------------- per frame */
function objectiveUpdate(dt) {
  if (!S.frags) return;
  S.hordeTier = hordeTier(S.t, S.stage);
  if (S.keyTurned && !S.boss && S.bossDue != null && S.t >= S.bossDue) { S.bossDue = null; spawnBoss(bossMul(S.keyTurnT, S.stage)); }
  S.seatsUsed[S.ctrl] = 1;
  let channelling = false;
  for (const k in S.h) {
    const h = S.h[k];
    if (h.down) continue;
    for (let i = 0; i < S.frags.length; i++) {
      const f = S.frags[i];
      if (f.carrier) continue;                     // stage 5: a champion has it
      if (!f.warded && dist(h, f) < WARD_R) wardBurst(f);
      if (!f.taken && dist(h, f) < h.r + PICK_R) takeFragment(f, h);
    }
    if (S.gateOpen && !S.keyTurned && dist(h, GATE) < GATE_R) { channelling = true; S.keyChanneller = h; }
  }
  if (S.gateOpen && !S.keyTurned) {
    if (channelling) { S.keyT += dt; if (S.keyT >= KEY_TIME) turnKey(); }
    else S.keyT = Math.max(0, S.keyT - dt * 0.6);
    /* the open gate's light holds the crowd off the threshold: getting there
       is the fight, standing in it is not */
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i]; if (e.boss) continue;
      const d = dist(e, GATE);
      if (d < SAFE_R) { const a = Math.atan2(e.y - GATE.y, e.x - GATE.x); const push = Math.min(SAFE_R - d, 260 * dt);
        e.x += Math.cos(a) * push; e.y += Math.sin(a) * push; }
    }
  }
  for (let i = 0; i < S.frags.length; i++) { const f = S.frags[i]; f.t += dt;
    /* belt and braces: a free fragment is never left where nobody can stand */
    if (!f.taken && !f.carrier) { const at = reachable(f); f.x = at.x; f.y = at.y; } }
}

export { resetObjective, objectiveUpdate, championDown, hordeTier, spawnCap, enemyMul, bossMul, fragmentsFor,
         WARD_R, PICK_R, GATE_R, KEY_TIME, WARDENS };
