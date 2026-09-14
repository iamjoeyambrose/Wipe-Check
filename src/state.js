/**
 * The run state: what a hero and a run are made of, and the live singletons.
 */

import { CLASSES, H, ORDER, ROLES, W, WORLD_W, WORLD_H, rnd } from './config.js';
import { SLOTS, baseStats, newPerks, recompute } from './items.js';

let S = null;
let mode = 'menu';
document.body.classList.add('inmenu');
let best = 0;
let idCounter = 0;
/* every world object the network has to track gets one of these */
function nextId() { return ++idCounter; }

/* Values written from more than one module live here so every module sees the
   same object rather than a stale copy of a primitive. */
/* `redraw` asks the loop for one more frame when the sim is not running (a
   menu opened, the window resized) -- otherwise a static screen is not repainted. */
const rt = { shake: 0, freeze: 0, pendingLevels: 0, FLASH: false, kick: { x: 0, y: 0 }, zoom: 1, redraw: 2 };

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* the session layer hears every mode change so a host can tell its guests */
let modeHook = null;
function setModeHook(fn) { modeHook = fn; }
function setMode(m) { mode = m; rt.redraw = 2; document.body.classList.toggle('inmenu', m === 'menu'); if (modeHook) modeHook(m); }
function setBest(v) { best = v; }
function newGame(role, seats, cls) {
  S = newRun(cls); S.ctrl = role;
  S.seats = seats || { tank: 'bot', dps: 'bot', heal: 'bot' };
  if (!seats) S.seats[role] = 'host';
  return S;
}

function roleFor(key,cls){ return key==='dps'?(CLASSES[cls||'ranger']||ROLES.dps):ROLES[key] }
function newHero(key,cls){
  cls=key==='dps'?(cls||'ranger'):null;
  var R=roleFor(key,cls);
  var h={key:key,cls:cls,role:R,x:WORLD_W/2+(key==='tank'?0:key==='dps'?-70:70),y:WORLD_H/2+(key==='tank'?-30:40),
    vx:0,vy:0,atk:0,abil:0,down:false,downT:0,rez:0,hitFlash:0,r:R.r,
    phase:rnd(),face:1,swing:0,swingDur:key==='tank'?0.30:key==='dps'?(cls==='rogue'?0.16:0.20):0.34,
    threat:0,guardUsed:false,stillT:0,momentum:0,kit:[],
    z:0,vz:0,ax:0,ay:0,bounces:0,sqx:1,sqy:1,
    base:baseStats(key,cls), perk:newPerks(), gear:{}, flags:{}};
  SLOTS.forEach(function(s){h.gear[s]=null});
  recompute(h);
  h.hp=h.hpMax; h.mp=h.mpMax;
  return h;
}
/* Swap the class of a hero mid-run: the draft and the other gear stay, a
   weapon the new class cannot hold is dropped, health comes back full. */
function setClass(h,cls){
  if(h.key!=='dps'||h.cls===cls)return false;
  h.cls=cls; h.role=roleFor(h.key,cls); h.base=baseStats(h.key,cls);
  h.r=h.role.r; h.swingDur=cls==='rogue'?0.16:0.20;
  var w=h.gear.weapon; if(w&&w.cls&&w.cls!==cls)h.gear.weapon=null;
  h.dash=null; h.abil=0;
  recompute(h); h.hp=h.hpMax;
  return true;
}
function newRun(cls){
  cls=cls||{};
  var h={};ORDER.forEach(function(k){h[k]=newHero(k,cls[k])});
  return {h:h,enemies:[],bullets:[],ebullets:[],gems:[],floats:[],fx:[],corpses:[],
    lvl:1,xp:0,xpNeed:8,kills:0,stage:0,t:0,spawnT:0,boss:null,bossT:0,enraged:false,
    vac:78,regen:0,elapsed:0,ctrl:'tank',dmgDone:0,drops:null,lootPick:null,musIntensity:-1,
    cam:{x:WORLD_W/2,y:WORLD_H/2},
    /* relic chests */
    relics:[],luck:0,chests:[],chestT:40,gemCount:0,stillT:0,frozenT:0,windUsed:false,
    /* the door */
    frags:[],keys:0,gateOpen:false,keyT:0,keyTurned:false,hordeTier:0,seatsUsed:{},stageT0:0,
    /* run counters for achievements */
    chestsOpened:0,downs:0,overtimeStages:0,stageTimes:[]};
}

export { S, mode, best, rt, reduce, setMode, setModeHook, setBest, newGame, newHero, newRun, nextId, setClass, roleFor };
