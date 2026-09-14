/**
 * The online session above the wire: how the host begins a run for the room,
 * how a guest builds the world the renderer reads, and how the shared moments
 * (a draft, a loot roll, a relic, the ending, a pause) reach every screen.
 *
 * The rule throughout: the host decides, guests mirror, and a guest's click
 * is only ever a request back to the host.
 */

import { seedMotes } from './art/atlas.js';
import { bakeRoom, buildProps } from './art/room.js';
import { audioInit, musicStart, musicStop, musicBoss, musicIntensity } from './audio.js';
import { ORDER } from './config.js';
import { STAGES, UPGRADES } from './content.js';
import { RELICS } from './relics.js';
import { resetSecret } from './secret.js';
import { startStage, showOver, showLevel, applyLevelPick, showLoot, applyLootPick, showRelic, closeRelic, tal } from './flow.js';
import { broadcast, isGuest, isHost, netId, netOn } from './net.js';
import { resetRun } from './achievements.js';
import { installSeatHandlers, seatOf } from './seats.js';
import { applyEvents, applySlow, applySnapshot, drainEv, forceSlow, guestInit, installHostTaps, setStageHook } from './snapshot.js';
import { S, mode, newGame, rt, setMode, setModeHook } from './state.js';
import { buildFrames, syncAbil, syncFrames, syncXp } from './ui.js';
import { $ } from './util.js';

const PANELS = ['vMenu', 'vLevel', 'vLoot', 'vOver', 'vPause', 'vTrophies', 'vRelic', 'vGear', 'vOnline', 'vHold'];
function hidePanels() { PANELS.forEach((id) => { const el = $(id); if (el) el.hidden = true; }); }

/* host: begin a run with this seating and tell the room */
function hostStart(seats, names, cls) {
  const mine = ORDER.filter((k) => seats[k] === 'host')[0] || 'tank';
  audioInit(); musicStart(); drainEv();
  newGame(mine, seats, cls || {}); S.names = names || {}; S.cls = cls || {}; rt.pendingLevels = 0; resetRun();
  hidePanels(); $('sKills').textContent = '0';
  buildFrames(); startStage(0); syncXp(); syncFrames(); syncAbil();
  broadcast(startMsg());
  setMode('play');
  forceSlow();
}
function startMsg() { return { t: 'start', seats: S.seats, names: S.names || {}, stage: S.stage, cls: { dps: S.h.dps.cls } }; }

/* guest: build the structure the renderer reads; the host fills it in */
let mySeatKey = null;   // null: watching from the tank's shoulder until a seat frees up
function guestStart(msg) {
  const me = netId();
  mySeatKey = ORDER.filter((k) => msg.seats[k] === me)[0] || null;
  audioInit(); musicStart();
  newGame(mySeatKey || 'tank', msg.seats, msg.cls || {}); S.names = msg.names || {}; rt.pendingLevels = 0; resetRun();
  hidePanels(); $('sKills').textContent = '0';
  buildFrames(); guestStage(msg.stage || 0); syncXp(); syncFrames(); syncAbil();
  setMode('play');
}
/* a new room, empty until the next snapshot lands */
function guestStage(n) {
  S.stage = n;
  S.enemies = []; S.bullets = []; S.ebullets = []; S.gems = []; S.fx = []; S.floats = []; S.corpses = []; S.chests = []; S.frags = [];
  S.boss = null; S.enraged = false;
  guestInit(mySeatKey);
  bakeRoom(n); buildProps(n); seedMotes(); resetSecret(n);
  $('enrage').classList.remove('hot'); $('bosshp').classList.remove('on');
  $('stagelbl').textContent = (n + 1) + ' — ' + STAGES[n].n;
  $('sStage').textContent = (n + 1) + '/' + STAGES.length;
  $('bossnm').textContent = STAGES[n].boss;
  musicBoss(false); musicIntensity(0);
}

/* ----------------------------------------------------- the host's modes */
function guestMode(m) {
  if (!S && m !== 'menu') return;
  if (m === 'menu') { onHostQuit(); return; }
  setMode(m);
  if (m === 'play') { ['vLevel', 'vLoot', 'vRelic', 'vHold', 'vOver'].forEach((id) => { $(id).hidden = true; }); }
  if (m === 'paused') { $('vHold').hidden = false; $('holdTtl').textContent = 'Host paused'; $('holdSub').textContent = 'Waiting for ' + hostName(); }
  else $('vHold').hidden = true;
}
function hostName() { return (S && S.names && S.names.host) || 'the host'; }
let quitHook = null, hostLeftHook = null;
function onHostQuit() { if (quitHook) quitHook(); }
function setSessionHooks(onQuit, onHostLeft) { quitHook = onQuit; hostLeftHook = onHostLeft; }

/* the room closed under a guest mid-run: an ending from what it knows */
function hostLeftInRun() {
  setMode('over'); musicBoss(false); musicStop();
  ['vLevel', 'vLoot', 'vRelic', 'vHold', 'vPause'].forEach((id) => { $(id).hidden = true; });
  $('overTtl').textContent = 'Host left'; $('overTtl').style.color = '';
  $('overSub').textContent = 'The room closed on ' + STAGES[S.stage].n;
  const mm = Math.floor(S.elapsed / 60), ss = Math.floor(S.elapsed % 60);
  $('overTally').innerHTML = tal('Kills', S.kills) + tal('Party level', S.lvl) + tal('Stage', (S.stage + 1) + '/' + STAGES.length) + tal('Time', mm + ':' + (ss < 10 ? '0' : '') + ss);
  $('overLoot').innerHTML = ''; $('overAch').innerHTML = '';
  $('btnAgain').hidden = true; $('btnRole').hidden = true; $('btnOverLeave').hidden = false;
  $('overWait').textContent = 'The run ends here'; $('overWait').hidden = false;
  $('vOver').hidden = false;
}

function installOnline() {
  installSeatHandlers(); installHostTaps(); setStageHook(guestStage);
  setModeHook((m) => { if (isHost()) broadcast({ t: 'mode', m }); });
  netOn('snap', (m) => { if (isGuest()) applySnapshot(m, performance.now()); });
  netOn('slow', (m) => { if (isGuest()) applySlow(m); });
  netOn('start', (m) => { if (isGuest()) guestStart(m); });
  netOn('mode', (m) => { if (isGuest()) guestMode(m.m); });
  /* the draft */
  netOn('levelup', (m) => { if (!isGuest() || !S) return; S.lvl = m.lvl; S.picker = m.picker; showLevel(m.cards.map((i) => UPGRADES[i])); });
  netOn('pick', (m, c) => { if (isHost() && S && seatOf(c.peer) === S.picker && mode === 'levelup') applyLevelPick(m.i); });
  /* boss loot */
  netOn('loot', (m) => { if (!isGuest() || !S) return; S.stage = m.stage; S.drops = m.drops; S.picker = m.picker; showLoot(m.recips); });
  netOn('lootPick', (m, c) => { if (isHost() && S && seatOf(c.peer) === S.picker && mode === 'loot') applyLootPick(m.uid, m.role); });
  /* relics */
  netOn('relic', (m) => { if (!isGuest() || !S) return; const r = RELICS.filter((x) => x.id === m.id)[0]; if (r) showRelic(r); });
  netOn('relicTake', () => { if (isHost() && mode === 'relic') closeRelic(); });
  /* the ending */
  netOn('over', (m) => { if (!isGuest() || !S) return; if (m.ev) applyEvents(m.ev); showOver(m); });
  netOn('hostLeft', () => { if (S && mode !== 'menu') hostLeftInRun(); if (hostLeftHook) hostLeftHook(); });
}

export { hostStart, guestStart, guestStage, installOnline, startMsg, setSessionHooks, hidePanels };
