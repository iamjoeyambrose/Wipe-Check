/**
 * Seats. Each hero's input comes from whoever holds its seat: the host's own
 * keyboard, a guest's latest packet, or the party AI. The sim only ever asks
 * `heroInput(k)`; it never learns who is on the other end.
 *
 * Guest packet: Float32Array [dx, dy, flags]  flags bit0 ability,
 * bit1/2/3 swap to tank/dps/heal. Sent 30x a second whether or not anything
 * changed -- the host also uses it as a heartbeat.
 */

import { ORDER } from './config.js';
import { botVec, botAbility } from './actors.js';
import { useAbility, floatTxt } from './combat.js';
import { inputVec } from './input.js';
import { isGuest, isHost, toHost, netOn, peers } from './net.js';
import { forceSlow } from './snapshot.js';
import { S } from './state.js';
import { syncFrames, syncAbil } from './ui.js';

const ZERO = { x: 0, y: 0 };
const remote = {};          // peerId -> {x, y, flags, prevFlags}
let pressed = 0;            // guest: flags accumulated since the last packet
let sendTimer = 0;

/* ------------------------------------------------------------- the host */
function heroInput(k) {
  const owner = S.seats ? S.seats[k] : (k === S.ctrl ? 'host' : 'bot');
  if (owner === 'host') return inputVec();
  if (owner === 'bot') return botVec(S.h[k]);
  const r = remote[owner];
  return r ? { x: r.x, y: r.y } : ZERO;
}
function seatIsBot(k) { return !S.seats || S.seats[k] === 'bot'; }

/* abilities and swaps requested in packets, once per press */
function pumpRemoteActions() {
  if (!S.seats) return;
  for (const id in remote) {
    const r = remote[id];
    const p = r.pending; r.pending = 0;
    if (!p) continue;
    const seat = seatOf(id);
    if (seat && (p & 1)) useAbility(S.h[seat]);
    for (let i = 0; i < 3; i++) if (p & (2 << i)) trySwap(id, ORDER[i]);
  }
  ORDER.forEach((k) => { if (S.seats[k] === 'bot') botAbility(S.h[k]); });
}
function seatOf(owner) { for (let i = 0; i < ORDER.length; i++) if (S.seats[ORDER[i]] === owner) return ORDER[i]; return null; }
function trySwap(owner, to) {
  if (!S.seats || S.seats[to] !== 'bot' || S.h[to].down) return false;
  const from = seatOf(owner);
  if (from) S.seats[from] = 'bot';
  S.seats[to] = owner;
  if (owner === 'host') S.ctrl = to;
  syncFrames(); syncAbil();
  if (isHost()) forceSlow();   // guests learn the new seating with the next tick
  return true;
}
function onRemoteInput(buf, c) {
  const f = buf instanceof ArrayBuffer ? new Float32Array(buf) : (buf && buf.buffer ? new Float32Array(buf.buffer, buf.byteOffset, 3) : null);
  if (!f || f.length < 3) return;
  const r = remote[c.peer] || (remote[c.peer] = { x: 0, y: 0, pending: 0 });
  r.x = f[0]; r.y = f[1]; r.pending |= f[2] | 0;   // presses latch until pumped
}
function seatToBot(owner) {
  if (!S || !S.seats) { delete remote[owner]; return; }
  const k = seatOf(owner);
  if (k) { S.seats[k] = 'bot'; floatTxt(S.h[k].x, S.h[k].y - 30, (S.names && S.names[owner] || 'A player') + ' left', '#98A0B5', 1); syncFrames(); forceSlow(); }
  delete remote[owner];
}

/* ------------------------------------------------------------ the guest */
function press(bit) { pressed |= bit; }
function guestTick(now) {
  if (!isGuest()) return;
  if (now - sendTimer < 33) return;
  sendTimer = now;
  const v = inputVec();
  const pkt = new Float32Array([v.x, v.y, pressed]);
  pressed = 0;
  toHost(pkt.buffer);
}

function installSeatHandlers() {
  netOn('bin', (d, c) => { if (isHost()) onRemoteInput(d, c); });
  netOn('leave', (m) => { if (isHost()) seatToBot(m.id); });
}

export { heroInput, seatIsBot, pumpRemoteActions, trySwap, seatOf, seatToBot, press, guestTick, installSeatHandlers, remote };
