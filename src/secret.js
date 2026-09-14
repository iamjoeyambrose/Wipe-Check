/**
 * The secret. On stage 3 one torch on the back wall is dark. Stand under it
 * and it lights; the wall beside it grinds open onto an alcove where the
 * Shade is shackled. Touch them and they are yours -- for good, and for the
 * rest of this run in the Ranger's place.
 *
 * Nothing on the HUD points at any of this. The only tell is the dark torch.
 */

import { WALLFIRE } from './art/room.js';
import { award } from './achievements.js';
import { floatTxt, spark } from './combat.js';
import { COL, ORDER, PLAY, WALLY } from './config.js';
import { sfx } from './audio.js';
import { S, setClass } from './state.js';
import { syncAbil, syncFrames } from './ui.js';
import { dist } from './util.js';

const SECRET_STAGE = 2;
const ALCOVE_DEPTH = 96, ALCOVE_W = 260, DOOR_TIME = 0.9;

/* one object every module reads; the host writes it, guests copy it */
const SEC = { active: false, torch: null, lit: false, open: 0, freed: false, box: null, prisoner: null, t: 0 };

function shadeUnlocked() { try { return localStorage.getItem('wipecheck.shade') === '1'; } catch (e) { return false; } }

/* the second torch right of the gate, marked dark by room.js on stage 3 */
function resetSecret(stage) {
  SEC.active = stage === SECRET_STAGE; SEC.lit = false; SEC.open = 0; SEC.freed = false; SEC.t = 0;
  SEC.torch = null; SEC.box = null; SEC.prisoner = null;
  if (!SEC.active) return;
  for (let i = 0; i < WALLFIRE.length; i++) if (WALLFIRE[i].lit === false) { SEC.torch = WALLFIRE[i]; break; }
  if (!SEC.torch) { SEC.active = false; return; }
  const x0 = SEC.torch.x + 40;
  SEC.box = { x0, x1: x0 + ALCOVE_W, top: WALLY - ALCOVE_DEPTH };
  SEC.prisoner = { x: (x0 + SEC.box.x1) / 2, y: SEC.box.top + 46 };
}

/* where the floor starts at this x: the alcove is floor once its door is open */
function floorTop(x) {
  if (SEC.active && SEC.open >= 1 && SEC.box && x > SEC.box.x0 + 12 && x < SEC.box.x1 - 12) return SEC.box.top;
  return PLAY.top;
}
/* inside the alcove you slide along its side walls instead of dropping out */
function alcoveClamp(o, r) {
  if (!SEC.active || SEC.open < 1 || !SEC.box || o.y >= WALLY + r) return;
  if (o.x < SEC.box.x0 + 12 + r) o.x = SEC.box.x0 + 12 + r;
  else if (o.x > SEC.box.x1 - 12 - r) o.x = SEC.box.x1 - 12 - r;
}
function inAlcove(o) { return SEC.active && SEC.open >= 1 && SEC.box && o.x > SEC.box.x0 && o.x < SEC.box.x1 && o.y < WALLY; }

function secretUpdate(dt) {
  if (!SEC.active) return;
  SEC.t += dt;
  const heroes = ORDER.map((k) => S.h[k]).filter((h) => !h.down);
  if (!SEC.lit) {
    const t = SEC.torch;
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (Math.abs(h.x - t.x) < 34 && h.y - h.r < PLAY.top + 30) { lightTorch(); break; }
    }
    return;
  }
  if (SEC.open < 1) {
    const was = SEC.open;
    SEC.open = Math.min(1, SEC.open + dt / DOOR_TIME);
    /* dust off the seam as the slab moves */
    const seam = SEC.box.x0 + SEC.open * ALCOVE_W;
    if (Math.floor(was * 12) !== Math.floor(SEC.open * 12)) spark(seam, WALLY - 4, 4, '#8A7F6E', 90);
    if (SEC.open >= 1) spark(SEC.box.x1, WALLY, 12, '#8A7F6E', 140);
    return;
  }
  if (SEC.freed) return;
  for (let i = 0; i < heroes.length; i++) if (dist(heroes[i], SEC.prisoner) < 30) { freeShade(); break; }
}

function lightTorch() {
  SEC.lit = true; SEC.torch.lit = true;
  sfx('torch'); spark(SEC.torch.x, SEC.torch.y, 18, '#FFB25E', 150);
  setTimeout(() => { sfx('grind'); }, 120);
}

function freeShade() {
  if (SEC.freed) return;
  SEC.freed = true;
  try { localStorage.setItem('wipecheck.shade', '1'); } catch (e) { /* private mode */ }
  const p = SEC.prisoner;
  sfx('unchain'); spark(p.x, p.y - 20, 26, COL.rogue, 200); spark(p.x, p.y - 30, 10, '#C8C0B0', 120);
  floatTxt(p.x, p.y - 44, 'THE SHADE', COL.rogue, 1);
  award('shade');
  /* the Ranger takes the Shade's cloak for the rest of the run */
  const h = S.h.dps;
  const hadBow = h.gear.weapon && h.gear.weapon.cls === 'ranger';
  if (setClass(h, 'rogue')) {
    if (hadBow) floatTxt(h.x, h.y - 30, 'Bow dropped', '#98A0B5');
    spark(h.x, h.y - 10, 22, COL.rogue, 180);
    syncFrames(); syncAbil();
  }
}

/* the wire: three small numbers */
function secretState() { return SEC.active ? { lit: SEC.lit, open: SEC.open, freed: SEC.freed } : null; }
function applySecret(lit, open, freed) {
  if (!SEC.active) return;
  if (lit && !SEC.lit) { SEC.lit = true; if (SEC.torch) SEC.torch.lit = true; }
  SEC.open = open;
  if (freed && !SEC.freed) { SEC.freed = true; try { localStorage.setItem('wipecheck.shade', '1'); } catch (e) { /* private */ } }
}

export { SEC, shadeUnlocked, resetSecret, floorTop, alcoveClamp, inAlcove, secretUpdate, freeShade, lightTorch, secretState, applySecret };
