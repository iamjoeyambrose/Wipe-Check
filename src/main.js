/**
 * Entry point: bake art, wire the loop, boot the game.
 */

import { bake, bakeShadow, seedMotes } from './art/atlas.js';
import { render } from './art/render.js';
import { rigBoss, rigBrute, rigCaster, rigGrunt, rigRunner } from './art/rigs-enemies.js';
import { bakeRoom, buildProps } from './art/room.js';
import { resize } from './canvas.js';
import { update, spawnChest, decayCamera } from './simulation.js';
import { spawnEnemy } from './actors.js';
import { launch } from './physics.js';
import { hordeTier, spawnCap, enemyMul, bossMul } from './objective.js';
import { award, achHas, bestOf, achEarned } from './achievements.js';
import { finish, stageClear } from './flow.js';
import { hostRoom, joinRoom, send, broadcast, toHost, netOn, netLeave, isHost, isGuest, isSolo, netId, roomCode, peers } from './net.js';
import { hostTick, hostIdle, guestFrame, encodeSnapshot, decodeSnapshotStrict } from './snapshot.js';
import { installLobby } from './lobby.js';
import { SEC, freeShade, lightTorch, shadeUnlocked } from './secret.js';
import { guestTick } from './seats.js';
import { hostStart, guestStart, installOnline } from './online.js';
import { WORLD_W, WORLD_H, GATE } from './config.js';
import { damageEnemy } from './combat.js';
import { RELICS, applyRelic, pickRelic, relic, chestInterval } from './relics.js';
import { S, best, mode, rt, setBest, setClass } from './state.js';
import { openLevel, openLoot, openChest, startStage } from './flow.js';
import { rollDrops, rollItem, equip, canEquip } from './items.js';
import { audioRender, sfx, musicStart, musicIntensity, musicBoss, audioInit, musicPrime, TRIM, setVolume, getVolume } from './audio.js';
import { buildFrames, buildRolePick } from './ui.js';
import { $ } from './util.js';

let lastT = 0;
/* dev only: run the sim N times per frame and optionally skip drawing, so a
   headless bot can play whole runs in minutes */
let SPEED = 1, NODRAW = /[?&]nodraw\b/.test(location.search);

function loop(ts){
  requestAnimationFrame(loop);
  var dt=Math.min(0.045,(ts-lastT)/1000||0); lastT=ts;
  /* online, every screen keeps talking whatever it is showing */
  if(isGuest())guestTick(ts); else if(isHost()&&mode!=='play')hostIdle(ts);
  if(rt.freeze>0){ rt.freeze-=dt; if(mode==='play'&&S)S.elapsed+=dt; decayCamera(dt); render(); return }
  if(mode==='play'&&S){
    /* a guest never simulates: it sends its keys and draws what the host said */
    if(isGuest()){ guestFrame(dt,ts); if(!NODRAW)render(); return }
    for(var i=0;i<SPEED;i++)update(dt);
    hostTick(ts);
    if(!NODRAW)render(); return }
  /* nothing is moving behind a menu: paint it once and stop burning the GPU */
  if(rt.redraw>0){ rt.redraw--; render(); }
}

function boot(st){
  try{setBest(+(localStorage.getItem('wipecheck.best')||0))}catch(e){setBest(0)}
  if(st&&st.best>best)setBest(st.best);
  $('sBest').textContent=best||'—';
  bakeShadow();
  bake('grunt', rigGrunt,  44, 50, 44, 1.35);
  bake('runner',rigRunner, 42, 44, 39, 1.35);
  bake('caster',rigCaster, 48, 56, 48, 1.35);
  bake('brute', rigBrute,  82, 80, 72, 1.22);
  bake('boss',  rigBoss,  140,138,124, 1.12);
  bakeRoom(0); buildProps(0); seedMotes();
  buildRolePick(); buildFrames(); resize();
  installOnline(); installLobby();
  $('stagelbl').textContent='';
  /* ?dev=1 exposes the run for poking at from the console: WC.S, WC.openLevel(),
     WC.openLoot(), WC.rollItem(2,{slot:'ring'}) ... */
  if(/[?&]dev\b/.test(location.search)){
    window.WC={get S(){return S},setClass:setClass,secret:function(){return SEC},freeShade:freeShade,lightTorch:lightTorch,shadeUnlocked:shadeUnlocked,canEquip:canEquip,openLevel:openLevel,openLoot:openLoot,openChest:openChest,
      startStage:startStage,spawnEnemy:spawnEnemy,spawnChest:spawnChest,launch:launch,damageEnemy:damageEnemy,
      setSpeed:function(n){SPEED=Math.max(1,n|0)},net:{hostRoom:hostRoom,joinRoom:joinRoom,send:send,broadcast:broadcast,toHost:toHost,on:netOn,leave:netLeave,isHost:isHost,isGuest:isGuest,isSolo:isSolo,netId:netId,roomCode:roomCode,peers:peers,hostStart:hostStart,guestStart:guestStart,encode:encodeSnapshot,decode:decodeSnapshotStrict},award:award,hasAch:achHas,bestOf:bestOf,earned:achEarned,finish:finish,stageClear:stageClear,hordeTier:hordeTier,spawnCap:spawnCap,enemyMul:enemyMul,bossMul:bossMul,WORLD:{w:WORLD_W,h:WORLD_H,gate:GATE},
      RELICS:RELICS,applyRelic:applyRelic,pickRelic:pickRelic,relic:relic,chestInterval:chestInterval,mode:function(){return mode},rollDrops:rollDrops,rollItem:rollItem,equip:equip,
      audioRender:audioRender,sfx:sfx,audioInit:audioInit,
      musicStart:musicStart,musicIntensity:musicIntensity,musicBoss:musicBoss,
      musicPrime:musicPrime,TRIM:TRIM,setVolume:setVolume,getVolume:getVolume};
  }
  requestAnimationFrame(loop);
}
if(window.claude&&window.claude.hot){
  window.claude.hot.snapshot(function(){return{best:best}});
  window.claude.hot.ready?window.claude.hot.ready(boot):boot(window.claude.hot.data||{});
}else boot({});
