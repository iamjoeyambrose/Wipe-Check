# Z Axis and Hit-Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every actor and pickup a height above the floor, launch things on impacts, and make every hit felt through hit-stop, squash, camera kick and weighted numbers.

**Architecture:** A tiny `physics.js` integrates a vertical axis (`z`, `vz`) with gravity, one bounce and a landing callback; simulation steps it for enemies, gems, chests, corpses and arrows, and treats `z > AIR` as airborne (untargetable, no contact damage). Rendering draws the shadow at `(x,y)` and the body at `(x, y-z)` with per-actor squash/rotation; `rt.kick` nudges the camera along blows and `impact()` centralises hit-stop.

**Tech Stack:** Canvas 2D, ES modules, the zero-dependency bundler (`node build/bundle.mjs`), Playwright (CJS scripts in the scratchpad) and Node's built-in `node:test` for the physics unit test.

**Spec:** `docs/superpowers/specs/2026-09-13-z-axis-and-hit-feel-design.md`

## Global Constraints

- No new dependencies; `dist/wipe-check.html` must still be produced by `node build/bundle.mjs` with no duplicate top-level names across modules.
- The game must run both bundled (`file://dist/wipe-check.html`) and as ES modules (`npm start`), so every import must be explicit.
- `prefers-reduced-motion` users get no hit-stop and no camera kick (squash and Z stay), matching the existing `reduce` flag.
- Existing tests keep passing: `verify.js`, `bullets.js`, `rez.js`, `relics.js` on both paths.
- Sound levels unchanged (no new cues in this plan).

---

### Task 1: physics.js — the vertical integrator

**Files:**
- Create: `src/physics.js`
- Test: `tests/physics.test.mjs` (Node `node:test`, run with `node --test tests/`)

**Interfaces:**
- Produces: `G=1500`, `AIR=6`, `step(o, dt, onLand)` mutates `o.z, o.vz, o.ax, o.ay` and advances `o.x,o.y` by the horizontal carry while airborne; returns `true` on the frame it lands. `launch(o, vz, dirX, dirY, push)` sets `o.vz=vz`, `o.ax=dirX*push`, `o.ay=dirY*push`. `airborne(o)` → `o.z>AIR`. `ensureZ(o)` gives an object the fields if missing.

- [ ] **Step 1: Write the failing test**

```js
// tests/physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, launch, airborne, ensureZ, AIR } from '../src/physics.js';

test('a launched object rises, falls, bounces once and rests', () => {
  const o = ensureZ({ x: 0, y: 0 });
  launch(o, 420, 1, 0, 90);
  let lands = 0, peak = 0, t = 0;
  while (t < 3) { if (step(o, 1 / 120)) lands++; peak = Math.max(peak, o.z); t += 1 / 120; }
  assert.ok(peak > 40, 'it got some air: ' + peak);
  assert.equal(o.z, 0);
  assert.equal(lands, 2, 'one bounce = two landings');
  assert.ok(o.x > 10, 'it was carried along the blow: ' + o.x);
  assert.equal(o.vz, 0);
});

test('airborne flips at AIR and a resting object never lands again', () => {
  const o = ensureZ({ x: 0, y: 0 });
  assert.equal(airborne(o), false);
  o.z = AIR + 1; assert.equal(airborne(o), true);
  o.z = 0; o.vz = 0;
  assert.equal(step(o, 0.016), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/claude/wipe-check && node --test tests/`
Expected: FAIL — cannot find module `../src/physics.js`

- [ ] **Step 3: Write the implementation**

```js
/**
 * The vertical axis. Everything on the floor has z=0; a launch gives it vz
 * and an optional horizontal carry (ax, ay) that decays while it is in the
 * air. One meaningful bounce, then it rests. Collision keeps using (x, y);
 * `airborne` is what the rest of the game asks before touching something.
 */
const G = 1500;          // px/s^2
const AIR = 6;           // above this, you are off the floor
const BOUNCE = 0.42;     // restitution
const MIN_BOUNCE = 140;  // slower than this on landing: no bounce, just rest

function ensureZ(o) {
  if (o.z == null) o.z = 0;
  if (o.vz == null) o.vz = 0;
  if (o.ax == null) o.ax = 0;
  if (o.ay == null) o.ay = 0;
  return o;
}

function launch(o, vz, dirX, dirY, push) {
  ensureZ(o);
  o.vz = Math.max(o.vz, vz);
  const p = push || 0;
  o.ax = (dirX || 0) * p; o.ay = (dirY || 0) * p;
  if (o.z <= 0) o.z = 0.01;
  return o;
}

function airborne(o) { return o != null && o.z > AIR; }

/* returns true on the frame the object touches the floor */
function step(o, dt, onLand) {
  if (o.z <= 0 && o.vz <= 0) { o.z = 0; o.vz = 0; return false; }
  o.vz -= G * dt;
  o.z += o.vz * dt;
  if (o.ax || o.ay) {
    o.x += o.ax * dt; o.y += o.ay * dt;
    const k = Math.pow(0.35, dt);
    o.ax *= k; o.ay *= k;
  }
  if (o.z <= 0) {
    const speed = -o.vz;
    o.z = 0;
    if (speed > MIN_BOUNCE) o.vz = speed * BOUNCE; else { o.vz = 0; o.ax = 0; o.ay = 0; }
    if (onLand) onLand(o, speed);
    return true;
  }
  return false;
}

export { G, AIR, ensureZ, launch, airborne, step };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: 2 passing.

- [ ] **Step 5: Commit** (on the Mac mirror this happens at delivery; in the cloud workspace there is no git — skip)

---

### Task 2: state and rendering split — shadow on the floor, body lifted

**Files:**
- Modify: `src/state.js` (rt gets `kick`, `zoom`)
- Modify: `src/art/atlas.js` (add `blitSquash`)
- Modify: `src/art/render.js` (shadows use z; bodies drawn at `y-z` with squash/rotation; camera kick + zoom)
- Modify: `src/actors.js` (`spawnEnemy` initialises `z,vz,ax,ay,sq,rot`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `rt.kick={x:0,y:0}`, `rt.zoom=1`; `blitSquash(name, idx, x, y, face, alpha, flash, sx, sy, rot)`; every enemy has `z, vz, ax, ay, sqx, sqy, rot`.

- [ ] **Step 1: state**

In `src/state.js` change `const rt = { shake: 0, freeze: 0, pendingLevels: 0, FLASH: false };` to
`const rt = { shake: 0, freeze: 0, pendingLevels: 0, FLASH: false, kick: { x: 0, y: 0 }, zoom: 1 };`

- [ ] **Step 2: atlas**

Add below `blit` in `src/art/atlas.js`:

```js
/* blit with squash-and-stretch about the feet and a tumble rotation */
function blitSquash(name,idx,x,y,face,alpha,flash,sx,sy,rot){
  var A=ATLAS[name];if(!A)return;
  g.save();g.translate(x,y);
  if(rot)g.rotate(rot);
  g.scale((face<0?-1:1)*(sx||1),sy||1);
  if(alpha!=null&&alpha<1)g.globalAlpha=alpha;
  g.drawImage(flash?A.flash:A.img,idx*A.fw*A.S,0,A.fw*A.S,A.fh*A.S,-A.fw/2,-A.oy,A.fw,A.fh);
  g.restore();
}
```
and export it.

- [ ] **Step 3: render**

In `render()`: camera line becomes
```js
  if(rt.shake>0)g.translate(rr(-rt.shake,rt.shake),rr(-rt.shake,rt.shake));
  g.translate(rt.kick.x,rt.kick.y);
  if(rt.zoom!==1){g.translate(W/2,H/2);g.scale(rt.zoom,rt.zoom);g.translate(-W/2,-H/2)}
  g.translate(-VX,-VY);
```
Shadows: enemies `shadow(e.x,e.y,e.r/(1+(e.z||0)/90))`, corpses likewise, gems get a tiny shadow when `z>2`, chests `shadow(c.x,c.y+2,18/(1+c.z/90))`.
Enemy body: `blitSquash(a.art,Math.floor(a.ph)%8,a.x,a.y+a.r*0.5-(a.z||0),a.face,1,a.flash>0.35,a.sqx||1,a.sqy||1,a.rot||0)`.
Corpse body: same with `a.rot` and `-a.z`.
Gems drawn at `gm.y-(gm.z||0)`; chests `g.translate(c.x,c.y-(c.z||0))`; hero body `drawHeroActor` translates by `-h.z`.
Arrows: if `p.stuck` draw a short angled shaft fading with `p.t`; else draw at `p.y-p.z`. Caster bolts at `q.y-12`.

- [ ] **Step 4: actors**

In `spawnEnemy` add to the object: `z:0,vz:0,ax:0,ay:0,sqx:1,sqy:1,rot:0`. In `spawnBoss` the same.

- [ ] **Step 5: bundle and smoke**

Run: `node build/bundle.mjs && node scratchpad/verify.js file:///home/claude/wipe-check/dist/wipe-check.html`
Expected: OK, kills > 0 (nothing moves yet in Z; the game looks identical).

---

### Task 3: simulation steps Z — airborne rules, gems, chests, corpses, arrows

**Files:**
- Modify: `src/simulation.js`
- Modify: `src/combat.js` (`killEnemy` corpses carry z; gems burst up)
- Test: scratchpad `zaxis.js` (Playwright)

**Interfaces:**
- Consumes: `step, launch, airborne, ensureZ` from `physics.js`.
- Produces: enemies airborne are skipped by contact damage, arrows and melee; `spawnChest` starts at `z=560` and lands; corpses tumble; gems pop.

- [ ] **Step 1: Write the failing Playwright test**

```js
// scratchpad/zaxis.js
const {chromium}=require('playwright');
const assert=(c,m)=>{ if(!c){console.log('FAIL:',m);process.exitCode=1} else console.log('ok  ',m) };
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1240,height:820}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(process.argv[2]+'?dev=1',{waitUntil:'load'}); await p.waitForTimeout(700);
 await p.click('#rolePick button:nth-child(1)'); await p.waitForTimeout(300);
 // a chest drops in from above and lands
 const chest=await p.evaluate(()=>new Promise(res=>{const S=WC.S; const c=WC.spawnChest(S.h.tank.x+300,S.h.tank.y); const z0=c.z;
   const t0=performance.now(); (function t(){ if(c.z<=0&&performance.now()-t0>300) return res({z0,landed:true,ms:Math.round(performance.now()-t0)}); if(performance.now()-t0<4000) requestAnimationFrame(t); else res({z0,landed:false}) })()}));
 assert(chest.z0>200&&chest.landed,'chest dropped in from '+chest.z0+'px and landed');
 // a launched enemy is untouchable while airborne
 const air=await p.evaluate(()=>new Promise(res=>{const S=WC.S; S.enemies.length=0; S.bullets.length=0;
   const e=WC.spawnEnemy('grunt',S.h.tank.x+60,S.h.tank.y,1); e.hp=e.hpMax=1000; WC.launch(e,520,0,0,0);
   const hp0=e.hp; setTimeout(()=>res({zNow:Math.round(e.z), hpLost:hp0-e.hp}),350)}));
 assert(air.zNow>20&&air.hpLost===0,'airborne grunt took no damage ('+JSON.stringify(air)+')');
 // a kill flings the corpse
 const corpse=await p.evaluate(()=>new Promise(res=>{const S=WC.S; S.enemies.length=0; const e=WC.spawnEnemy('grunt',S.h.tank.x+40,S.h.tank.y,1);
   WC.damageEnemy(e,9999,true,S.h.tank); const c=S.corpses[S.corpses.length-1]; setTimeout(()=>res({z:Math.round(c.z),rot:+c.rot.toFixed(2)}),120)}));
 assert(corpse.z>4,'corpse is in the air after the kill ('+JSON.stringify(corpse)+')');
 console.log(errs.length?'JS ERRORS: '+errs.join(' | '):'no js errors'); if(errs.length)process.exitCode=1; await b.close();
})();
```

- [ ] **Step 2: Run to verify it fails** — `WC.launch` undefined.

- [ ] **Step 3: Implement**

`simulation.js`: import `{ step, launch, airborne, ensureZ } from './physics.js'`. `spawnChest` sets `z:560,vz:0` and steps each chest each frame; on land: `fx(c.x,c.y,70,'#E8C46A',.3); sfx('lock',{v:0.5}); rt.shake=Math.max(rt.shake,4)`. Enemies: `step(e,dt,onEnemyLand)` before targeting; if `airborne(e)` skip movement/attack/separation (still clamp). Contact damage guarded by `!airborne(e)`. Arrows: bullets get `z` starting at 14 with `vz` from a low arc (`vz: 60`, gravity via `step`); an arrow that lands becomes `stuck` (`p.stuck=true; p.sp=0; p.life=0.9`) and is removed when `p.t>life`; arrow-enemy collision skips `airborne(en)`. Gems: `step(gm,dt)`. Corpses: `step(c,dt)` and `c.rot+=c.spin*dt` while airborne.
`combat.js`: `killEnemy` corpse gets `z:e.z||0, vz:0, rot:0, spin:0` then `launch(corpse,220+Math.min(300,blow*3),dx,dy,180)`, `spin=(rnd()<.5?-1:1)*rr(4,9)`; gems `launch(gem,rr(180,320),rr(-1,1),rr(-1,1),rr(30,80))`. Expose `launch` and `damageEnemy` on `window.WC`.

- [ ] **Step 4: Run zaxis.js, bullets.js, verify.js** — all pass.

---

### Task 4: launches — crits, knockback, Shockwave, rez hop

**Files:**
- Modify: `src/combat.js`, `src/actors.js`, `src/simulation.js`

- [ ] **Step 1: crit launch** in `damageEnemy(e,amt,crit,by)`: after `e.flash=1`, if `crit&&!e.boss` → `var dx=by?e.x-by.x:0, dy=by?e.y-by.y:0, L=Math.hypot(dx,dy)||1; launch(e,Math.min(560,220+amt*2.2),dx/L,dy/L,120)`. Landing callback `onEnemyLand(e,speed)`: `if(speed>300){fx(e.x,e.y,44,'#C8B79A',.25); S.enemies.forEach(function(o){if(o!==e&&!airborne(o)&&dist(o,e)<40){o.stun=Math.max(o.stun||0,0.35)}})}`; a stunned enemy skips movement (`e.stun-=dt` in the loop).
- [ ] **Step 2: knockback** in `heroAttack` tank branch replace the slide with `launch(e,240,Math.cos(a),Math.sin(a),260)`.
- [ ] **Step 3: Shockwave** in `useAbility` tank: replace the slide with `setTimeout(function(){launch(e,300+220*p,Math.cos(a),Math.sin(a),320)},d*0.9)` — the ripple.
- [ ] **Step 4: rez hop** in `healerLogic` and Second Wind: `launch(d0,260,0,0,0)`.
- [ ] **Step 5: run zaxis.js + verify.js + rez.js.**

---

### Task 5: hit-feel — impact(), squash, kick, numbers

**Files:**
- Modify: `src/combat.js` (`impact`, squash on hit, kick), `src/simulation.js` (decay squash/kick/zoom), `src/art/render.js` (numbers), `src/main.js` (boss-kill zoom)

- [ ] **Step 1: impact()** in combat:
```js
function impact(strength,dx,dy){
  if(reduce)return;
  rt.freeze=Math.max(rt.freeze,strength);
  var k=Math.min(14,strength*90);
  if(dx||dy){var L=Math.hypot(dx,dy)||1; rt.kick.x-=dx/L*k; rt.kick.y-=dy/L*k}
}
```
Calls: normal hit `impact(0.012,dx,dy)` (only if `amt>=8`), crit `impact(0.06,...)`, elite kill `impact(0.09,...)`, boss kill `impact(0.45,...); rt.zoom=1.18`. Replace `rt.freeze=Math.max(...)` in killEnemy and the two `rt.shake` in useAbility/damageHero with impact/shake as appropriate (slams keep shake).
- [ ] **Step 2: squash** in `damageEnemy`: `e.sqx=1.35; e.sqy=0.7` (flatten) and in `simulation` decay `e.sqx+=(1-e.sqx)*Math.min(1,dt*14)` (same for sqy); on landing `e.sqx=1.4;e.sqy=0.62`; while rising `sqy=1.15,sqx=0.9`. Heroes: `h.sqx/h.sqy` on swing start (`1.08/0.94`) and `drawHeroActor` applies them.
- [ ] **Step 3: kick and zoom decay** in simulation end: `rt.kick.x*=Math.pow(0.002,dt); rt.kick.y*=...; rt.zoom+=(1-rt.zoom)*Math.min(1,dt*6)`. Also in `main.js` during freeze so the kick eases even while frozen.
- [ ] **Step 4: numbers**: floats get `pop` (crit or amt≥40): render scales font by `1+0.6*(1-min(1,t/0.18))` with a bounce and uses 22px for crits.
- [ ] **Step 5: run everything; screenshot mid-fight; eyeball.**

---

### Task 6: docs, deliver

- [ ] README: new "Height and hit-feel" section under The room; layout list gets `physics.js`; tests note `node --test tests/`.
- [ ] `package.json`: add `"test": "node --test tests/"`.
- [ ] Bundle, full test pass on dist + ESM, zip, write to Mac, git commit.

## Self-review

- Spec coverage: Z model (T1–3), what goes up (T3–4; caster bolt lift T2; arrows T3), hit-feel (T5; anticipation already exists in rigs via `kf` pull-back — T5 adds swing squash), reduced motion (T5 impact), tests (T1, T3, existing). Gap: none.
- Placeholders: none.
- Names: `step/launch/airborne/ensureZ`, `blitSquash`, `rt.kick/rt.zoom`, `impact`, `sqx/sqy/rot/spin/stun` consistent.
