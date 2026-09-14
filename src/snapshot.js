/**
 * What the host sends and how a guest rebuilds its world from it.
 *
 * Twenty times a second the host packs the state the renderer needs into one
 * binary frame (heroes, every enemy, projectiles, gems, chests, corpses, the
 * door, the HUD numbers) and ships it with the cosmetic events created since
 * the last frame (sounds, floats, particles, music). The guest keeps its own
 * `S` purely as the structure the renderer reads: each frame it interpolates
 * every object from the previous snapshot toward the latest, and predicts its
 * own hero from its own input so steering never waits on the wire.
 */

import { musicIntensity, musicBoss, sfx, setAudioTaps } from './audio.js';
import { award } from './achievements.js';
import { ETYPES, propPush } from './actors.js';
import { WARDENS } from './objective.js';
import { COL, H, ORDER, PLAY, W, WORLD_W, WORLD_H, rnd, TAU } from './config.js';
import { inputVec } from './input.js';
import { broadcast, isHost, isGuest, netId } from './net.js';
import { S, mode, setClass } from './state.js';
import { SEC, floorTop, alcoveClamp, applySecret } from './secret.js';
import { syncAbil, syncBars, syncFrames, syncXp } from './ui.js';
import { $, clamp, dist, rr } from './util.js';

const SNAP_MS = 50, SLOW_MS = 1000;
const KIND = ['grunt', 'runner', 'caster', 'brute', 'boss'];

/* ------------------------------------------------------------ events */
let evQueue = [];
function evPush(e) { evQueue.push(e); }
function drainEv() { const q = evQueue; evQueue = []; return q; }

/* ------------------------------------------------------------ writer */
function Writer(cap) { this.buf = new ArrayBuffer(cap); this.dv = new DataView(this.buf); this.o = 0; }
Writer.prototype = {
  u8(v) { this.dv.setUint8(this.o, clamp(Math.round(v), 0, 255)); this.o += 1; },
  i8(v) { this.dv.setInt8(this.o, clamp(Math.round(v), -128, 127)); this.o += 1; },
  u16(v) { this.dv.setUint16(this.o, clamp(Math.round(v), 0, 65535)); this.o += 2; },
  i16(v) { this.dv.setInt16(this.o, clamp(Math.round(v), -32768, 32767)); this.o += 2; },
  f32(v) { this.dv.setFloat32(this.o, v || 0); this.o += 4; },
  done() { return this.buf.slice(0, this.o); },
};
function Reader(buf) { this.dv = new DataView(buf); this.o = 0; }
Reader.prototype = {
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; },
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; },
  u16() { const v = this.dv.getUint16(this.o); this.o += 2; return v; },
  i16() { const v = this.dv.getInt16(this.o); this.o += 2; return v; },
  f32() { const v = this.dv.getFloat32(this.o); this.o += 4; return v; },
};

/* ------------------------------------------------------------ encode */
function encodeSnapshot() {
  const w = new Writer(65536);
  w.u8(1);
  w.f32(S.elapsed); w.f32(S.t); w.u8(S.stage); w.f32(S.kills); w.u16(S.lvl); w.f32(S.xp); w.f32(S.xpNeed);
  w.u8(S.keys); w.u8(S.hordeTier);
  w.u8((S.gateOpen ? 1 : 0) | (S.keyTurned ? 2 : 0) | (S.enraged ? 4 : 0) | (S.boss ? 8 : 0) | (S.frozenT > 0 ? 16 : 0));
  w.f32(S.keyT);
  const kc = S.keyChanneller ? ORDER.indexOf(S.keyChanneller.key) : 255; w.u8(kc);
  const b = S.boss;
  w.f32(b ? b.hp / b.hpMax : 0); w.f32(S.bossT); w.f32(b ? b.slam : 0); w.i16(b ? b.slamX : 0); w.i16(b ? b.slamY : 0);
  w.u8(ORDER.indexOf(S.ctrl));
  /* the secret: lit | freed<<1, open*255 */
  w.u8((SEC.active && SEC.lit ? 1 : 0) | (SEC.active && SEC.freed ? 2 : 0)); w.u8(SEC.active ? SEC.open * 255 : 0);
  /* heroes */
  ORDER.forEach((k) => {
    const h = S.h[k];
    w.f32(h.x); w.f32(h.y); w.f32(h.z || 0); w.f32(h.hp); w.f32(h.hpMax); w.f32(h.mp || 0); w.f32(h.mpMax || 0);
    w.f32(h.vx); w.f32(h.vy); w.f32(h.phase); w.f32(h.swing); w.f32(h.swingDur); w.f32(h.abil); w.f32(h.abilCd);
    w.f32(h.rez); w.f32(h.downT); w.f32(h.sqx || 1); w.f32(h.sqy || 1); w.f32(h.hitFlash); w.f32(h.threat); w.f32(h.speed);
    w.i8(h.face); w.u8(h.down ? 1 : 0);
    const owner = S.seats ? S.seats[k] : 'bot';
    const oi = owner === 'host' ? 1 : owner === 'bot' ? 0 : 2; w.u8(oi);
    w.u8(h.cls === 'rogue' ? 1 : 0);
  });
  /* enemies */
  w.u16(S.enemies.length);
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    w.u16(e.id & 65535);
    let kind = KIND.indexOf(e.type); if (kind < 0) kind = 0;
    w.u8(kind | (e.champion ? 128 : 0) | (e.stun > 0 ? 64 : 0));
    w.i16(e.x); w.i16(e.y); w.u8((e.z || 0) / 2); w.u8(255 * clamp(e.hp / e.hpMax, 0, 1));
    w.i8(e.face); w.u8((e.ph % 8) * 32); w.u8(255 * clamp(e.flash, 0, 1));
    w.u8((e.sqx || 1) * 100); w.u8((e.sqy || 1) * 100); w.i8((e.rot || 0) * 40);
    if (e.champion) w.u8(Math.max(0, WARDENS.indexOf(e.name)));
  }
  /* bullets */
  w.u16(S.bullets.length);
  for (let i = 0; i < S.bullets.length; i++) {
    const p = S.bullets[i];
    w.u16(p.id & 65535); w.i16(p.x); w.i16(p.y); w.f32(p.a); w.u8(p.z || 0);
    w.u8((p.crit ? 1 : 0) | (p.stuck ? 2 : 0) | (p.col === COL.dps ? 4 : 0));
    w.u8(clamp((p.stuck ? (p.t - p.stuckAt) / p.life : 0) * 255, 0, 255));
  }
  w.u16(S.ebullets.length);
  for (let i = 0; i < S.ebullets.length; i++) { const q = S.ebullets[i]; w.u16(q.id & 65535); w.i16(q.x); w.i16(q.y); w.f32(q.a); }
  /* gems */
  const gems = S.gems.length > 400 ? S.gems.slice(0, 400) : S.gems;
  w.u16(gems.length);
  for (let i = 0; i < gems.length; i++) { const g = gems[i]; w.u16(g.id & 65535); w.i16(g.x); w.i16(g.y); w.u8((g.z || 0)); }
  /* chests */
  w.u8(S.chests.length);
  for (let i = 0; i < S.chests.length; i++) { const c = S.chests[i]; w.u16(c.id & 65535); w.i16(c.x); w.i16(c.y); w.u16(c.z || 0); w.u8(c.landed ? 1 : 0); }
  /* corpses */
  w.u8(S.corpses.length);
  for (let i = 0; i < S.corpses.length; i++) {
    const c = S.corpses[i];
    w.u16(c.id & 65535); w.u8(Math.max(0, KIND.indexOf(c.art))); w.i16(c.x); w.i16(c.y); w.u8((c.z || 0) / 2);
    w.i8(c.face); w.f32(c.rot || 0); w.f32(c.t); w.f32(c.dur); w.u8(c.r);
  }
  /* the door */
  const fr = S.frags || [];
  w.u8(fr.length);
  for (let i = 0; i < fr.length; i++) { const f = fr[i]; w.i16(f.x); w.i16(f.y); w.u8((f.taken ? 1 : 0) | (f.carrier ? 2 : 0)); w.u16(f.carrier ? f.carrier.id & 65535 : 0); }
  return w.done();
}

/* ------------------------------------------------------------ decode */
/* mirrors encodeSnapshot field for field */
function decodeSnapshotStrict(buf) {
  const r = new Reader(buf);
  const s = {};
  r.u8();
  s.elapsed = r.f32(); s.t = r.f32(); s.stage = r.u8(); s.kills = r.f32(); s.lvl = r.u16(); s.xp = r.f32(); s.xpNeed = r.f32();
  s.keys = r.u8(); s.tier = r.u8();
  const fl = r.u8(); s.gateOpen = !!(fl & 1); s.keyTurned = !!(fl & 2); s.enraged = !!(fl & 4); s.hasBoss = !!(fl & 8); s.frozen = !!(fl & 16);
  s.keyT = r.f32(); s.kc = r.u8();
  s.bossHp = r.f32(); s.bossT = r.f32(); s.slam = r.f32(); s.slamX = r.i16(); s.slamY = r.i16();
  s.hostCtrl = r.u8();
  const sf = r.u8(); s.secLit = !!(sf & 1); s.secFreed = !!(sf & 2); s.secOpen = r.u8() / 255;
  s.heroes = ORDER.map(() => {
    const h = {};
    h.x = r.f32(); h.y = r.f32(); h.z = r.f32(); h.hp = r.f32(); h.hpMax = r.f32(); h.mp = r.f32(); h.mpMax = r.f32();
    h.vx = r.f32(); h.vy = r.f32(); h.phase = r.f32(); h.swing = r.f32(); h.swingDur = r.f32(); h.abil = r.f32(); h.abilCd = r.f32();
    h.rez = r.f32(); h.downT = r.f32(); h.sqx = r.f32(); h.sqy = r.f32(); h.hitFlash = r.f32(); h.threat = r.f32(); h.speed = r.f32();
    h.face = r.i8(); h.down = !!r.u8(); h.owner = r.u8(); h.cls = r.u8() ? 'rogue' : 'ranger';
    return h;
  });
  let n = r.u16(); s.enemies = [];
  for (let i = 0; i < n; i++) {
    const e = { id: r.u16() };
    const k = r.u8(); e.kind = k & 63; e.champion = !!(k & 128); e.stun = !!(k & 64);
    e.x = r.i16(); e.y = r.i16(); e.z = r.u8() * 2; e.hpf = r.u8() / 255;
    e.face = r.i8(); e.ph = r.u8() / 32; e.flash = r.u8() / 255; e.sqx = r.u8() / 100; e.sqy = r.u8() / 100; e.rot = r.i8() / 40;
    if (e.champion) e.name = WARDENS[r.u8()] || 'Warden';
    s.enemies.push(e);
  }
  n = r.u16(); s.bullets = [];
  for (let i = 0; i < n; i++) {
    const p = { id: r.u16(), x: r.i16(), y: r.i16(), a: r.f32(), z: r.u8() };
    const f = r.u8(); p.crit = !!(f & 1); p.stuck = !!(f & 2); p.dps = !!(f & 4); p.stuckFrac = r.u8() / 255;
    s.bullets.push(p);
  }
  n = r.u16(); s.ebullets = [];
  for (let i = 0; i < n; i++) s.ebullets.push({ id: r.u16(), x: r.i16(), y: r.i16(), a: r.f32() });
  n = r.u16(); s.gems = [];
  for (let i = 0; i < n; i++) s.gems.push({ id: r.u16(), x: r.i16(), y: r.i16(), z: r.u8() });
  n = r.u8(); s.chests = [];
  for (let i = 0; i < n; i++) s.chests.push({ id: r.u16(), x: r.i16(), y: r.i16(), z: r.u16(), landed: !!r.u8() });
  n = r.u8(); s.corpses = [];
  for (let i = 0; i < n; i++) s.corpses.push({ id: r.u16(), art: KIND[r.u8()], x: r.i16(), y: r.i16(), z: r.u8() * 2, face: r.i8(), rot: r.f32(), t: r.f32(), dur: r.f32(), r: r.u8() });
  n = r.u8(); s.frags = [];
  for (let i = 0; i < n; i++) { const f = { x: r.i16(), y: r.i16() }; const fl2 = r.u8(); f.taken = !!(fl2 & 1); f.carried = !!(fl2 & 2); f.carrierId = r.u16(); s.frags.push(f); }
  return s;
}

/* ------------------------------------------------------- host side */
let lastSnap = 0, lastSlow = 0;
const STAT_KEYS = ['dmg', 'atkCd', 'hpMax', 'dr', 'speed', 'threatMul', 'crit', 'critMul', 'thorns', 'lifesteal', 'healPow', 'cost', 'mpRegen', 'shots', 'pierce', 'reach', 'r'];
function slowState() {
  const gear = {}, kits = {}, stats = {};
  ORDER.forEach((k) => {
    const h = S.h[k]; kits[k] = h.kit.slice(-3); gear[k] = {}; stats[k] = {};
    for (const sl in h.gear) gear[k][sl] = h.gear[sl] || null;
    STAT_KEYS.forEach((sk) => { if (h[sk] != null) stats[k][sk] = h[sk]; });
  });
  return { t: 'slow', kits, gear, stats, relics: S.relics.slice(), names: S.names || {}, seats: S.seats, luck: S.luck };
}
/* a host that is not simulating (menu, pause, a draft) still has to be heard */
function hostIdle(now) {
  if (!isHost()) return;
  if (now - lastSlow >= SLOW_MS) { lastSlow = now; broadcast(S ? slowState() : { t: 'ping' }); }
}
function hostTick(now) {
  if (!isHost() || !S) return;
  if (now - lastSnap >= SNAP_MS) {
    lastSnap = now;
    broadcast({ t: 'snap', buf: encodeSnapshot(), ev: drainEv() });
  }
  if (now - lastSlow >= SLOW_MS) { lastSlow = now; broadcast(slowState()); }
}
function installHostTaps() {
  setAudioTaps(
    /* menus play their own sounds on every screen; only the arena's are mirrored */
    (name, opt) => { if (isHost() && mode === 'play') evPush(['s', name, opt && opt.v != null ? opt.v : 1]); },
    (kind, v) => { if (isHost()) evPush(['m', kind, v]); }
  );
}

/* ------------------------------------------------------ guest side */
const byId = { enemies: new Map(), bullets: new Map(), ebullets: new Map(), gems: new Map(), chests: new Map(), corpses: new Map() };
let snapAt = 0, snapGap = SNAP_MS, mySeat = null;

function guestInit(seat) {
  mySeat = seat;
  for (const k in byId) byId[k].clear();
  snapAt = 0;
}

/* keep one object per id, remembering where it was and where it is going */
function syncList(list, incoming, map, make, update) {
  const seen = new Set();
  for (let i = 0; i < incoming.length; i++) {
    const rec = incoming[i];
    let o = map.get(rec.id);
    if (!o) { o = make(rec); o.px = rec.x; o.py = rec.y; o.pz = rec.z || 0; map.set(rec.id, o); list.push(o); }
    else { o.px = o.x; o.py = o.y; o.pz = o.z || 0; }
    o.nx = rec.x; o.ny = rec.y; o.nz = rec.z || 0;
    update(o, rec);
    seen.add(rec.id);
  }
  for (let i = list.length - 1; i >= 0; i--) { const o = list[i]; if (!seen.has(o.id)) { list.splice(i, 1); map.delete(o.id); } }
}

/* the session layer rebuilds the room when the host moves on */
let stageHook = null;
function setStageHook(fn) { stageHook = fn; }
function forceSlow() { lastSlow = 0; }

function applySnapshot(msg, now) {
  if (!S) return;
  const s = decodeSnapshotStrict(msg.buf);
  if (s.stage !== S.stage) { if (stageHook) stageHook(s.stage); else S.stage = s.stage; }
  if (snapAt) snapGap = clamp(now - snapAt, 30, 120);
  snapAt = now;
  S.elapsed = s.elapsed; S.t = s.t; S.kills = s.kills; S.lvl = s.lvl; S.xp = s.xp; S.xpNeed = s.xpNeed;
  S.keys = s.keys; S.hordeTier = s.tier; S.gateOpen = s.gateOpen; S.keyTurned = s.keyTurned; S.enraged = s.enraged;
  S.keyT = s.keyT; S.keyChanneller = s.kc < 3 ? S.h[ORDER[s.kc]] : null; S.frozenT = s.frozen ? 1 : 0; S.bossT = s.bossT;
  /* heroes: my own is predicted; the others interpolate */
  ORDER.forEach((k, i) => {
    const h = S.h[k], r = s.heroes[i];
    const mine = k === mySeat;
    h.px = h.x; h.py = h.y; h.pz = h.z || 0; h.nx = r.x; h.ny = r.y; h.nz = r.z;
    if (mine) { const off = dist(h, { x: r.x, y: r.y }); if (off > 90) { h.x = r.x; h.y = r.y; } else { h.x += (r.x - h.x) * 0.35; h.y += (r.y - h.y) * 0.35; } h.z = r.z; }
    h.hp = r.hp; h.hpMax = r.hpMax; h.mp = r.mp; h.mpMax = r.mpMax; h.vx = r.vx; h.vy = r.vy; h.phase = r.phase; h.swing = r.swing; h.swingDur = r.swingDur;
    h.abil = r.abil; h.abilCd = r.abilCd; h.rez = r.rez; h.downT = r.downT; h.sqx = r.sqx; h.sqy = r.sqy; h.hitFlash = r.hitFlash; h.threat = r.threat; h.speed = r.speed;
    h.face = r.face; h.down = r.down;
    if (k === 'dps' && r.cls !== (h.cls || 'ranger')) { setClass(h, r.cls); syncFrames(); syncAbil(); }
  });
  applySecret(s.secLit, s.secOpen, s.secFreed);
  syncList(S.enemies, s.enemies, byId.enemies,
    (rec) => { const T = ETYPES[KIND[rec.kind]] || ETYPES.grunt; return { id: rec.id, type: KIND[rec.kind], art: KIND[rec.kind], r: rec.kind === 4 ? 34 : (rec.champion ? 26 : T.r), boss: rec.kind === 4 ? 1 : 0, elite: rec.kind >= 3 ? 1 : 0, hpMax: 1, x: rec.x, y: rec.y, z: rec.z, tgt: null }; },
    (o, rec) => { o.hp = rec.hpf; o.face = rec.face; o.ph = rec.ph; o.flash = rec.flash; o.sqx = rec.sqx; o.sqy = rec.sqy; o.rot = rec.rot; o.champion = rec.champion ? 1 : 0; o.name = rec.name; o.scale = rec.champion ? 1.35 : 1; o.stun = rec.stun ? 1 : 0; });
  const hadBoss = !!S.boss;
  S.boss = null;
  for (let i = 0; i < S.enemies.length; i++) if (S.enemies[i].boss) { S.boss = S.enemies[i]; S.boss.hp = s.bossHp; S.boss.hpMax = 1; S.boss.slam = s.slam; S.boss.slamX = s.slamX; S.boss.slamY = s.slamY; }
  if (hadBoss !== !!S.boss) $('bosshp').classList.toggle('on', !!S.boss);
  $('enrage').classList.toggle('hot', S.enraged);
  syncList(S.bullets, s.bullets, byId.bullets,
    (rec) => ({ id: rec.id, x: rec.x, y: rec.y, a: rec.a, z: rec.z, r: 4, t: 0, hit: [], pierce: 0 }),
    (o, rec) => { o.a = rec.a; o.crit = rec.crit; o.col = rec.dps ? COL.dps : '#FFE9F4'; if (rec.stuck) { o.stuck = true; o.stuckAt = 0; o.life = 1; o.t = rec.stuckFrac; } else o.stuck = false; });
  syncList(S.ebullets, s.ebullets, byId.ebullets, (rec) => ({ id: rec.id, x: rec.x, y: rec.y, a: rec.a, r: 6, t: 0 }), (o, rec) => { o.a = rec.a; });
  syncList(S.gems, s.gems, byId.gems, (rec) => ({ id: rec.id, x: rec.x, y: rec.y, z: rec.z, v: 1, t: 0 }), () => {});
  syncList(S.chests, s.chests, byId.chests, (rec) => ({ id: rec.id, x: rec.x, y: rec.y, z: rec.z, r: 16, t: 0, sqx: 1, sqy: 1 }), (o, rec) => { o.landed = rec.landed; });
  syncList(S.corpses, s.corpses, byId.corpses, (rec) => ({ id: rec.id, art: rec.art, x: rec.x, y: rec.y, z: rec.z, r: rec.r, face: rec.face, t: rec.t, dur: rec.dur, rot: rec.rot }), (o, rec) => { o.rot = rec.rot; o.t = rec.t; o.dur = rec.dur; o.face = rec.face; });
  /* the door */
  if (!S.frags || S.frags.length !== s.frags.length) S.frags = s.frags.map((f) => ({ x: f.x, y: f.y, taken: f.taken, warded: true, t: rnd() * 6, carrier: null }));
  s.frags.forEach((f, i) => { const g = S.frags[i]; g.x = f.x; g.y = f.y; g.taken = f.taken; g.carrier = f.carried ? (byId.enemies.get(f.carrierId) || { x: f.x, y: f.y }) : null; });
  if (msg.ev) applyEvents(msg.ev);
}

function applyEvents(list) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    switch (e[0]) {
      case 's': sfx(e[1], { v: e[2], gap: 0 }); break;
      case 'fl': S.floats.push(e[1]); break;
      case 'fx': S.fx.push(e[1]); break;
      case 'sp': { const n = e[3]; for (let j = 0; j < n; j++) { const a = rnd() * TAU, v = rr(0.4, 1) * e[5]; S.fx.push({ p: 1, x: e[1], y: e[2], vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: e[4], t: 0, life: rr(0.22, 0.5) }); } break; }
      case 'm': if (e[1] === 'i') musicIntensity(e[2]); else musicBoss(e[2]); break;
      case 'a': award(e[1], e[2]); break;
      default: break;
    }
  }
}

function applySlow(msg) {
  if (!S) return;
  ORDER.forEach((k) => { const h = S.h[k]; if (msg.kits && msg.kits[k]) h.kit = msg.kits[k].slice();
    if (msg.gear && msg.gear[k]) for (const sl in msg.gear[k]) h.gear[sl] = msg.gear[k][sl] || null;
    if (msg.stats && msg.stats[k]) Object.assign(h, msg.stats[k]); });
  if (msg.relics) S.relics = msg.relics.slice();
  if (msg.luck != null) S.luck = msg.luck;
  if (msg.names) S.names = msg.names;
  if (msg.seats) {
    S.seats = msg.seats;
    const me = netId();
    ORDER.forEach((k) => { if (msg.seats[k] === me && mySeat !== k) { S.ctrl = k; mySeat = k; syncAbil(); } });
  }
  syncFrames();
}

/* every frame on a guest: interpolate, predict, tick cosmetics, follow the camera */
function lerpObj(o, a) { o.x = o.px + (o.nx - o.px) * a; o.y = o.py + (o.ny - o.py) * a; o.z = o.pz + (o.nz - o.pz) * a; }
function guestFrame(dt, now) {
  if (!S || !snapAt) return;
  const a = clamp((now - snapAt) / snapGap, 0, 1.25);
  const lists = [S.enemies, S.bullets, S.ebullets, S.gems, S.chests, S.corpses];
  for (let li = 0; li < lists.length; li++) { const L = lists[li]; for (let i = 0; i < L.length; i++) { const o = L[i]; if (o.px != null) lerpObj(o, a); } }
  ORDER.forEach((k) => {
    const h = S.h[k];
    if (k === mySeat && !h.down) {
      /* prediction: my keys move my hero now; the host's truth pulls it in later */
      const v = inputVec();
      h.vx = v.x * h.speed; h.vy = v.y * h.speed;
      h.x = clamp(h.x + h.vx * dt, PLAY.left + h.r, PLAY.right - h.r);
      h.y = clamp(h.y + h.vy * dt, floorTop(h.x) + h.r, PLAY.bot - h.r);
      alcoveClamp(h, h.r);
      propPush(h, h.r);
      const spd = Math.sqrt(h.vx * h.vx + h.vy * h.vy);
      h.phase += (spd / h.speed) * dt * 2.15;
      if (Math.abs(h.vx) > 8) h.face = h.vx > 0 ? 1 : -1;
    } else if (h.px != null) lerpObj(h, a);
  });
  /* cosmetics age locally */
  for (let f = S.fx.length - 1; f >= 0; f--) { const o2 = S.fx[f]; o2.t += dt; if (o2.p) { o2.x += o2.vx * dt; o2.y += o2.vy * dt; o2.vx *= 0.94; o2.vy *= 0.94; } if (o2.t >= o2.life) S.fx.splice(f, 1); }
  for (let fl = S.floats.length - 1; fl >= 0; fl--) { const ft = S.floats[fl]; ft.t += dt; ft.y -= (ft.big ? 34 : 26) * dt * (1 - ft.t * 0.5); ft.x += (ft.dx || 0) * dt; if (ft.t > 0.85) S.floats.splice(fl, 1); }
  for (let i = 0; i < S.frags.length; i++) S.frags[i].t += dt;
  for (let i = 0; i < S.corpses.length; i++) S.corpses[i].t += dt;
  /* camera follows my seat */
  const lead = S.h[S.ctrl];
  const cx = clamp(lead.x, W / 2, WORLD_W - W / 2), cy = clamp(lead.y, H / 2, WORLD_H - H / 2);
  const f = Math.min(1, dt * 5.5);
  S.cam.x += (cx - S.cam.x) * f; S.cam.y += (cy - S.cam.y) * f;
  syncBars(); syncXp();
  const kEl = $('sKills'); if (kEl.textContent !== String(S.kills)) kEl.textContent = S.kills;
}

export { evPush, drainEv, encodeSnapshot, decodeSnapshotStrict, hostTick, hostIdle, installHostTaps, forceSlow, guestInit, setStageHook, applySnapshot, applySlow, applyEvents, guestFrame, slowState };
