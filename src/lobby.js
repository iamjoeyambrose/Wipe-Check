/**
 * The online panel: host a room or join one, name yourself, pick a seat, and
 * pull together. The host owns the seating; a guest's click is a request.
 * Empty seats run on party AI, so two people (or one) can still play.
 */

import { audioInit, musicBoss, musicStop, sfx } from './audio.js';
import { ORDER, ROLES } from './config.js';
import { hostRoom, joinRoom, broadcast, toHost, send, netOn, netLeave, isHost, isGuest, isSolo, netId, roomCode, peers } from './net.js';
import { hostStart, startMsg, setSessionHooks, hidePanels } from './online.js';
import { forceSlow } from './snapshot.js';
import { shadeUnlocked } from './secret.js';
import { S, mode, setMode } from './state.js';
import { syncFrames } from './ui.js';
import { $ } from './util.js';

let lob = null;   // {seats, names}: the host's truth, a guest's mirror

function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function copy(o) { return JSON.parse(JSON.stringify(o)); }
function me() { return isGuest() ? netId() : 'host'; }
function myName() { const v = ($('onName').value || '').trim().slice(0, 12); return v || 'Player'; }
function loadName() { try { $('onName').value = localStorage.getItem('wipecheck.name') || ''; } catch (e) { /* private mode */ } }
function saveName() { try { localStorage.setItem('wipecheck.name', myName()); } catch (e) { /* private mode */ } }
function setStatus(t) { $('onStatus').textContent = t; }

/* ------------------------------------------------------------ screens */
function openOnline() { audioInit(); hidePanels(); $('vOnline').hidden = false; setMode('menu'); showEntry(); sfx('click'); }
function showEntry() { $('onEntry').hidden = false; $('onRoom').hidden = true; $('btnOnlinePull').hidden = true; setStatus(''); }
function showRoom() { $('onEntry').hidden = true; $('onRoom').hidden = false; $('onCodeBig').textContent = roomCode() || '----'; $('btnOnlinePull').hidden = !isHost(); renderRoom(); }

function renderRoom() {
  if (!lob) return;
  const wrap = $('onSeats'); wrap.innerHTML = '';
  ORDER.forEach((k) => {
    const R = ROLES[k], o = lob.seats[k], mine = o === me();
    const b = document.createElement('button');
    b.className = 'seat' + (mine ? ' on' : '') + (o !== 'bot' && !mine ? ' held' : '');
    b.style.borderTopColor = R.col;
    const who = o === 'bot' ? 'Party AI' : (mine ? 'You' : (lob.names[o] || 'Player'));
    b.innerHTML = '<div class="nm" style="color:' + R.col + '">' + R.name + '</div><div class="tag">' + R.label + '</div><div class="who">' + esc(who) + '</div>';
    b.disabled = o !== 'bot' && !mine;
    b.onclick = () => { if (o !== 'bot') return; sfx('click'); if (isHost()) hostSeat('host', k); else toHost({ t: 'seat', k }); };
    /* whoever holds the DPS seat picks its class, if they have found the Shade */
    if (k === 'dps' && mine && shadeUnlocked()) {
      const cur = (lob.cls && lob.cls.dps) || 'ranger';
      const row = document.createElement('div'); row.className = 'clsrow';
      [['ranger', 'Ranger'], ['rogue', 'Shade']].forEach((pair) => {
        const t = document.createElement('span'); t.className = 'clsopt' + (cur === pair[0] ? ' on' : ''); t.textContent = pair[1];
        t.onclick = (e) => { e.stopPropagation(); sfx('click'); if (isHost()) hostCls(pair[0]); else toHost({ t: 'cls', cls: pair[0] }); };
        row.appendChild(t);
      });
      b.appendChild(row);
    } else if (k === 'dps' && lob.cls && lob.cls.dps === 'rogue') {
      const tagEl = b.querySelector('.who'); tagEl.textContent += ' \u00b7 Shade';
    }
    wrap.appendChild(b);
  });
  const ids = ['host'].concat(Object.keys(lob.names).filter((x) => x !== 'host'));
  $('onPlayers').innerHTML = ids.map((id) => {
    const seat = ORDER.filter((k) => lob.seats[k] === id)[0];
    return '<span class="pl' + (id === me() ? ' me' : '') + '"><b>' + esc(lob.names[id] || 'Player') + '</b> · ' + (seat ? ROLES[seat].name : 'watching') + (id === 'host' ? ' · host' : '') + '</span>';
  }).join('');
}

/* --------------------------------------------------------------- host */
async function hostClick() {
  audioInit(); saveName(); setStatus('Opening a room…'); $('btnHost').disabled = true;
  try { await hostRoom(); } catch (e) { $('btnHost').disabled = false; setStatus('Could not reach the matchmaker — check your connection'); return; }
  $('btnHost').disabled = false;
  lob = { seats: { tank: 'host', dps: 'bot', heal: 'bot' }, names: { host: myName() }, cls: {} };
  showRoom(); setStatus('Send the code to your friends, then pull');
}
function freeSeat(seats) { for (let i = 0; i < ORDER.length; i++) if (seats[ORDER[i]] === 'bot') return ORDER[i]; return null; }
function hostJoin(m, c) {
  const name = String((m.meta && m.meta.name) || 'Player').slice(0, 12);
  if (S && mode !== 'menu') {
    /* mid-run: take a bot seat and drop straight in */
    const k = freeSeat(S.seats); if (k) S.seats[k] = m.id;
    S.names = S.names || {}; S.names[m.id] = name;
    syncFrames(); forceSlow(); send(c, startMsg());
    return;
  }
  if (!lob) return;
  const k2 = freeSeat(lob.seats); if (k2) lob.seats[k2] = m.id;
  lob.names[m.id] = name;
  pushLobby(); renderRoom(); sfx('click');
}
function hostSeat(owner, k) {
  if (!lob || lob.seats[k] !== 'bot') return;
  const wasDps = lob.seats.dps === owner;
  ORDER.forEach((x) => { if (lob.seats[x] === owner) lob.seats[x] = 'bot'; });
  lob.seats[k] = owner;
  if (wasDps || k === 'dps') lob.cls = { dps: 'ranger' };   // a new hand on the DPS seat starts as the Ranger
  pushLobby(); renderRoom();
}
function hostCls(cls, owner) {
  if (!lob || lob.seats.dps !== (owner || 'host')) return;
  lob.cls = { dps: cls === 'rogue' ? 'rogue' : 'ranger' }; pushLobby(); renderRoom();
}
function hostLeaveOf(id) {
  if (!lob) return;
  ORDER.forEach((x) => { if (lob.seats[x] === id) lob.seats[x] = 'bot'; });
  delete lob.names[id];
  if (mode === 'menu') { pushLobby(); renderRoom(); }
}
function pushLobby() { broadcast({ t: 'lobby', seats: lob.seats, names: lob.names, cls: lob.cls || {} }); }
function pull() { if (!isHost() || !lob) return; sfx('click'); hostStart(copy(lob.seats), copy(lob.names), copy(lob.cls || {})); }

/* -------------------------------------------------------------- guest */
async function joinClick() {
  audioInit(); saveName();
  const code = ($('onCode').value || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { setStatus('Room codes are four letters'); return; }
  setStatus('Joining ' + code + '…'); $('btnJoin').disabled = true;
  /* a placeholder until the host's first 'lobby' lands -- it can beat the handshake's promise */
  lob = { seats: { tank: 'host', dps: 'bot', heal: 'bot' }, names: {} };
  try {
    await joinRoom(code, { name: myName() }, (stage) => {
      if (stage === 'broker') setStatus('Looking for room ' + code + '…');
      if (stage === 'found') setStatus('Found it — connecting to the host…');
    });
  } catch (e) {
    $('btnJoin').disabled = false; netLeave(); lob = null;
    if (e && e.kind === 'route') setStatus('Found the room, but your networks would not connect. Try again, or one of you switch to a phone hotspot.');
    else if (e && e.kind === 'noroom') setStatus('No room called ' + code + ' — check the letters, and that the host is still on the room screen');
    else setStatus('Could not reach the matchmaker — check your connection');
    return;
  }
  $('btnJoin').disabled = false;
  showRoom(); setStatus('Waiting for the host to pull');
}

/* ------------------------------------------------- between runs, leaving */
/* back to the room after a run: the host keeps the seating people still hold */
function toLobby() {
  musicBoss(false); musicStop();
  if (isHost() && S) {
    lob = { seats: copy(S.seats), names: copy(S.names || {}), cls: { dps: S.h.dps.cls } };
    const live = peers();
    ORDER.forEach((k) => { const o = lob.seats[k]; if (o !== 'host' && o !== 'bot' && live.indexOf(o) < 0) lob.seats[k] = 'bot'; });
    Object.keys(lob.names).forEach((id) => { if (id !== 'host' && live.indexOf(id) < 0) delete lob.names[id]; });
  }
  hidePanels(); $('vOnline').hidden = false; setMode('menu');
  showRoom(); setStatus(isHost() ? 'Pull again when everyone is set' : 'Waiting for the host to pull');
  if (isHost()) pushLobby();
}
function leaveRoom() {
  netLeave(); lob = null;
  musicBoss(false); musicStop();
  hidePanels(); $('vMenu').hidden = false; setMode('menu'); sfx('click');
}
/* the over screen's buttons, online */
function onlineAgain() { if (isHost() && S) { hostStart(copy(S.seats), copy(S.names || {}), { dps: S.h.dps.cls }); } }
function onlineSeats() { if (isHost()) toLobby(); else leaveRoom(); }

function installLobby() {
  loadName();
  $('btnOnline').onclick = openOnline;
  $('btnHost').onclick = hostClick;
  $('btnJoin').onclick = joinClick;
  $('onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinClick(); });
  $('btnOnlinePull').onclick = pull;
  $('btnOnlineBack').onclick = () => { if (isSolo()) { hidePanels(); $('vMenu').hidden = false; sfx('click'); } else leaveRoom(); };
  $('btnOverLeave').onclick = leaveRoom;
  netOn('join', (m, c) => { if (isHost()) hostJoin(m, c); });
  netOn('seat', (m, c) => { if (isHost() && mode === 'menu') hostSeat(c.peer, m.k); });
  netOn('cls', (m, c) => { if (isHost() && mode === 'menu') hostCls(m.cls, c.peer); });
  netOn('leave', (m) => { if (isHost()) hostLeaveOf(m.id); });
  netOn('lobby', (m) => { if (!isGuest()) return; lob = { seats: m.seats, names: m.names, cls: m.cls || {} }; if (mode === 'menu' && !$('vOnline').hidden && !$('onRoom').hidden) renderRoom(); });
  setSessionHooks(
    /* the host went back to the room */ () => { if (isGuest()) toLobby(); },
    /* the host is gone */ () => { if (mode === 'menu') { netLeave(); lob = null; showEntry(); setStatus('The host left the room'); } }
  );
}

export { installLobby, openOnline, toLobby, leaveRoom, onlineAgain, onlineSeats };
