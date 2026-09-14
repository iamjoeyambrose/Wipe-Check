# Key and Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stage timer with a key-and-door objective under ever-ramping waves, make stage 5 and the ending earned, and add ten persisted achievements.

**Architecture:** `objective.js` owns fragments, wards, the gate and the key channel, plus the `hordeTier` ramp that the spawner reads; `achievements.js` owns the table, persistence and toasts. Simulation calls `objectiveUpdate(dt)` each frame and asks `hordeTier()` when spawning; `flow.js` resets the objective per stage and spawns the boss at the gate when the key turns. Rendering and HUD read state off `S`.

**Tech Stack:** Canvas 2D, ES modules, the zero-dependency bundler, Playwright scratchpad scripts, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-13-key-and-door-design.md`

## Global Constraints

- No new dependencies; bundle must build with no duplicate top-level names; every import explicit (ESM path must work).
- `prefers-reduced-motion` unaffected (no camera motion anywhere).
- Existing suites (`verify`, `bullets`, `rez`, `relics`, `zaxis`, `steady`, `npm test`) keep passing on dist and ESM.
- New sound cues measured into the existing tiers (`levels.js`).

---

### Task 1: objective.js — fragments, wards, gate, key channel, hordeTier (test first)

**Files:** Create `src/objective.js`; modify `src/state.js` (fields), `src/content.js` (ramp/cap per stage), `src/flow.js` (startStage resets, boss at gate), `src/simulation.js` (spawner + update hook, remove `st.dur` boss trigger), `src/main.js` (dev hooks). Test: scratchpad `objective.js`.

**Interfaces produced:** `resetObjective(stage)`, `objectiveUpdate(dt)`, `hordeTier(t, stage)`, `spawnCap(stage)`, `enemyMul(t, stage)`, `bossMul(t, stage)`, `fragmentsFor(stage)`; `S.frags, S.keys, S.gateOpen, S.keyT, S.hordeTier`.

- [ ] Write scratchpad `objective.js` asserting: after a fresh run `S.frags.length===3`, pairwise distance ≥ 800, each ≥ 900 from centre; moving the tank within 300px of a fragment raises `S.enemies.length` by ≥ 8 once and not again; setting all three taken → `S.gateOpen`; teleporting the tank to `GATE` and waiting 2.3s → `S.boss` non-null and `S.boss.y < 200`; with `S.t = 999` and no keys, no boss appears within 3s.
- [ ] Run it: fails (no `S.frags`).
- [ ] Implement `objective.js`:

```js
import { GATE, PLAY, WORLD_W, WORLD_H, rnd } from './config.js';
import { STAGES } from './content.js';
import { S } from './state.js';
import { spawnEnemy, spawnBoss, edgeSpawn } from './actors.js';
import { fx, floatTxt, spark } from './combat.js';
import { sfx, musicBoss } from './audio.js';
import { props } from './art/room.js';
import { dist, rr, clamp } from './util.js';

const WARD_R = 300, PICK_R = 18, GATE_R = 70, KEY_TIME = 2.0;

function farEnough(p, others){ return others.every(o => dist(p,o) >= 800); }
function fragmentsFor(stage){
  const out=[]; const thirds=[[PLAY.left+120, WORLD_W/3-60],[WORLD_W/3+60, 2*WORLD_W/3-60],[2*WORLD_W/3+60, PLAY.right-120]];
  const order=[0,1,2].sort(()=>rnd()-0.5);
  order.forEach(function(ti){
    for(let tries=0;tries<60;tries++){
      const p={x:rr(thirds[ti][0],thirds[ti][1]), y:rr(PLAY.top+140, PLAY.bot-120)};
      if(dist(p,{x:WORLD_W/2,y:WORLD_H/2})<900) continue;
      if(dist(p,GATE)<260) continue;
      if(!farEnough(p,out)) continue;
      if(props.some(q=>q.solid&&dist(p,q)<q.solid+40)) continue;
      out.push({x:p.x,y:p.y,taken:false,warded:false,t:rnd()*6}); break;
    }
  });
  return out;
}
```
`resetObjective(stage)` sets `S.frags=fragmentsFor(stage); S.keys=0; S.gateOpen=false; S.keyT=0; S.hordeTier=0; S.seatsUsed={}; S.stageT0=S.elapsed;`.
`objectiveUpdate(dt)`: for each hero not down: ward check (`!f.warded && dist(h,f)<WARD_R` → `wardBurst(f)`), pickup (`!f.taken && dist(h,f)<h.r+PICK_R` → take), gate channel (`S.gateOpen && !S.boss && dist(h,GATE)<GATE_R` → `S.keyT+=dt`, else decay), on `S.keyT>=KEY_TIME` → `turnKey()`. Also `S.hordeTier=hordeTier(S.t,S.stage)`; `S.seatsUsed[S.ctrl]=1`.
`hordeTier(t,stage)`: table `T1=[25,10],T2=[55,25],T3=[95,45],T4=[140,70]`, interpolate by `stage/4`; return count of thresholds passed.
`spawnCap(stage)=120+25*stage`; `enemyMul(t,stage)=1+stage*0.6+t*0.014`; `bossMul(t,stage)=(1+stage*0.9)*(1+Math.min(0.6,t/240))`.
`turnKey()`: `sfx('keyTurn'); floatTxt(GATE.x,GATE.y+40,'THE KEY TURNS',gold,1)`; spawn `8+3*stage` enemies at the gate; `setTimeout(spawnBoss, 800)` guarded by `mode==='play'`.
- [ ] Simulation: replace the `S.t>=st.dur` line; spawner uses tier: `type` from tier (0 grunt; 1 30% runner; 2 +25% caster; 3 brute packs 12%; 4 rate/2, elite triples); cap `spawnCap`; `mul=enemyMul`. Call `objectiveUpdate(dt)` after heroes (before the `mode!=='play'` return). `spawnBoss` uses `bossMul`.
- [ ] Flow: `startStage` calls `resetObjective(n)`; keep openers.
- [ ] Bundle, run the objective test and `verify.js` on dist + ESM.

### Task 2: HUD, rendering, arrows, sounds

**Files:** `index.html`, `styles/game.css`, `src/ui.js` (`syncKeys`, `syncHorde`), `src/art/render.js` (fragments, beams, gate glow, key arrows, key ring), `src/audio.js` (`key`, `keyTurn`, `ward`).

- [ ] HUD: `<div class="objective"><div class="keys"><i></i><i></i><i></i></div><div class="horde"><b></b><b></b><b></b><b></b><b class="last"></b></div></div>` under the stage label; `.keys i.on` gold; `.horde b.on` filled, `.horde.max` pulses red. `syncBars` calls `syncKeys()`/`syncHorde()` (cheap: compare with last value).
- [ ] Render: fragments (shard: two rotated gold rects + glyph ring on floor + vertical gradient beam 0→−160px, alpha pulsing), taken ones skipped; gate glow when `S.gateOpen` (beam at GATE + pulsing ring); key channel ring on the channelling hero (`S.keyT/KEY_TIME`); champion bars later. Arrows: key icon (gold shard) for untaken fragments; when `gateOpen`, a single arrow to the gate.
- [ ] Sounds: `key` (bright ascending triad + shimmer), `keyTurn` (heavy iron clunk = slam 0.7 + low tone + rising choir chord), `ward` (rumble sweep + stinger). Measure with `newcues.js` and bake TRIM.
- [ ] Screenshot desk/phone; run suites.

### Task 3: Stage 5 champions, boss phase two, the ending, cleared mark

**Files:** `src/objective.js` (champions), `src/actors.js` (`spawnChampion`), `src/simulation.js` (champion roam + phase two), `src/flow.js` (`finish` ending), `src/art/render.js` (champion bar + shard), `index.html`/`ui.js` (cleared mark, ending tally), `src/audio.js` (`fanfare`).

- [ ] `spawnChampion(name, x, y)`: brute base ×6 hp, ×1.6 dmg, ×1.15 sp, `champion:1, name, home:{x,y}, scale:1.35`. On stage 5 `resetObjective` spawns three champions at fragment points instead of fragments (`S.frags` entries get `carrier`). `killEnemy`: if `e.champion` → drop fragment at `e.x,e.y` (`f.carrier=null`, becomes a normal fragment).
- [ ] Roam: champion targets nearest hero within 420 else drifts back toward home.
- [ ] Phase two: in boss update, `if(S.stage===4 && !e.phase2 && e.hp<e.hpMax*0.5)` → enrage now, `e.tripleSlam=true`, adds become casters; slam handler fires three when `tripleSlam`.
- [ ] `finish(true)`: tally + relics + gear summary; `localStorage.setItem('wipecheck.cleared','1')`; menu `.cleared` mark shown when set. `sfx('fanfare')`.
- [ ] Playwright: forcing stage 4 with `WC.startStage(4)` yields 3 champions carrying keys; killing one drops a fragment; boss at 49% has `phase2`.

### Task 4: achievements.js — table, award, persistence, toast, trophies panel, counters

**Files:** Create `src/achievements.js`; modify `src/simulation.js`/`combat.js`/`flow.js` (counters + award calls), `index.html`/`styles`/`ui.js` (toast, Trophies panel + button), test scratchpad `ach.js`.

- [ ] Table as in spec. `award(id, val)`: load/save `wipecheck.ach`; if new → toast + `sfx('ach')`; if `val` and (no best or lower) → update best. `earnedThisRun` set for the tally.
- [ ] Counters: `S.downs++` in `damageHero` on down; `S.chestsOpened++` in `openChest` (mimics too); `S.seatsUsed` in objectiveUpdate; `S.overtimeStages++` at stage clear if `hordeTier===4`; stage clear time `S.elapsed-S.stageT0`.
- [ ] Award sites: `turnKey` → blitz if `S.t<=90` (val `S.t`); `stageClear` → overtime, seats; `finish(true)` → clear, speed (val elapsed), nowipe, cursed, marathon; `openChest` → hoarder at 10; boss kill on stage 4 before `enraged` → giant.
- [ ] Trophies panel `#vTrophies` with ten `.trophy` cards; button on menu; `T` key optional (skip). Run-end tally: earned-this-run rows first with `.new`.
- [ ] Test: `award('blitz',40)` twice → one toast, best 40; `award('blitz',30)` → best 30; reload → persisted; `finish(true)` path sets cleared mark.

### Task 5: bot harness + tuning

**Files:** scratchpad `botrun.js`; numbers in `objective.js`/`content.js`.

- [ ] Bot: each frame set input toward nearest untaken fragment (or gate when open, or nearest chest if within 350 and no fragment within 500), fire ability when `h.abil===0` and ≥4 enemies within 200, auto-draft, auto-take relics, click loot → first drop → first recipient. Report per stage: clear time, hordeTier at door, wipes. Run 6 runs at 3× speed via `dt` multiplier hook (`WC.speed=3` scaling `dt` in the loop, dev only).
- [ ] Tune to targets (median death stage 3–4, ~1/5 clears, ~3 min/stage). Record the table in README.

### Task 6: docs, deliver

- [ ] README: "The door" section, pressure table, stage 5, achievements table; layout list gets `objective.js`, `achievements.js`.
- [ ] Bundle; full suites; levels; zip; Mac; commit.

## Self-review

Spec coverage: loop (T1,T2), pressure (T1), stage 5 + ending (T3), achievements (T4), harness (T5), docs (T6). Names consistent: `resetObjective/objectiveUpdate/hordeTier/spawnCap/enemyMul/bossMul`, `S.frags/keys/gateOpen/keyT/hordeTier/seatsUsed/stageT0/chestsOpened/downs/overtimeStages`, `award`. No placeholders.
