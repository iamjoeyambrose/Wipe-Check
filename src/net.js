/**
 * The wire. PeerJS gives us browser-to-browser data channels; a four-letter
 * room code is the peer id of whoever hosts. Everything above this file talks
 * in small JSON messages with a `t` field, or raw ArrayBuffers for snapshots.
 *
 * The public PeerJS broker only brokers the handshake -- traffic runs direct.
 * `?peer=host:port` points at a local broker (`npm run broker`) for tests.
 */

/* consonants only: a four-letter code can never spell anything */
const ALPHA = 'BCDFGHJKLMNPQRSTVWXZ';

let peer = null, conns = [], hostConn = null, role = 'solo', myId = null, code = null;
const handlers = {};

/* STUN finds a direct route between two browsers; when both sit behind
   strict routers there is none, and the TURN relays carry the traffic
   instead. Without them a join across the internet can simply never open. */
const ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
], sdpSemantics: 'unified-plan' };
const JOIN_TIMEOUT = 20000;

function brokerOpts() {
  const m = /[?&]peer=([^&]+)/.exec(location.search);
  if (!m) return { debug: 0, config: ICE };
  const parts = decodeURIComponent(m[1]).split(':');
  return { host: parts[0], port: +parts[1] || 9000, path: '/', secure: false, debug: 0, config: ICE };
}
function newCode() { let s = ''; for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }

function netOn(t, fn) { (handlers[t] = handlers[t] || []).push(fn); }
function netOff(t, fn) { if (handlers[t]) handlers[t] = handlers[t].filter((f) => f !== fn); }
function emit(t, msg, from) { const hs = handlers[t]; if (hs) for (let i = 0; i < hs.length; i++) hs[i](msg, from); }

function dropConn(c) {
  if (c.__gone) return; c.__gone = true;
  conns = conns.filter((x) => x !== c);
  if (c.__opened) emit('leave', { id: c.peer }, c);
  if (c === hostConn) { hostConn = null; if (c.__opened) emit('hostLeft', {}, c); }
  try { c.close(); } catch (e) {}
}
function wire(c) {
  c.__seen = performance.now();
  c.on('data', (d) => {
    c.__seen = performance.now();
    if (d && d.t === 'bye') { dropConn(c); return; }
    /* a guest announces itself once its side of the channel is open; the host
       only speaks to it after that (a message sent the instant the channel
       opens can be lost in the browser's handshake) */
    if (d && d.t === 'hello') {
      if (!c.__hello) { c.__hello = true; c.__opened = true; if (conns.indexOf(c) < 0) conns.push(c); emit('join', { id: c.peer, meta: d.meta || {} }, c); }
      return;
    }
    emit(d && d.t ? d.t : 'bin', d, c);
  });
  c.on('close', () => dropConn(c));
  c.on('error', () => {});
}
/* a closed tab does not always close its channel promptly: anyone silent
   for three seconds is gone. Guests talk 30x a second, hosts 20x. */
setInterval(() => {
  const now = performance.now();
  conns.slice().forEach((c) => { if (now - c.__seen > 3000) dropConn(c); });
}, 1000);
window.addEventListener('pagehide', () => { broadcast({ t: 'bye' }); if (peer) { try { peer.destroy(); } catch (e) {} } });

function hostRoom() {
  return new Promise((res, rej) => {
    if (typeof Peer === 'undefined') { rej(new Error('PeerJS not loaded')); return; }
    code = newCode();
    peer = new Peer('wc-' + code, brokerOpts());
    role = 'host';
    let settled = false;
    peer.on('open', (id) => { myId = id; settled = true; res(code); });
    peer.on('error', (e) => {
      if (e && e.type === 'unavailable-id' && !settled) { try { peer.destroy(); } catch (x) {} hostRoom().then(res, rej); return; }
      if (!settled) { settled = true; rej(e); }
      emit('error', e);
    });
    peer.on('connection', (c) => {
      wire(c);
      c.on('open', () => { c.__opened = true; if (conns.indexOf(c) < 0) conns.push(c); });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (x) {} });
  });
}

/* `onStage` hears 'broker' (reached the matchmaker) and 'found' (the room
   exists, the browsers are now trying to reach each other) */
function joinRoom(c4, meta, onStage) {
  return new Promise((res, rej) => {
    if (typeof Peer === 'undefined') { rej(new Error('PeerJS not loaded')); return; }
    peer = new Peer(brokerOpts());
    role = 'guest';
    let settled = false, found = false;
    const fail = (e) => { if (!settled) { settled = true; rej(e); } };
    peer.on('open', (id) => {
      myId = id;
      if (onStage) onStage('broker');
      const c = peer.connect('wc-' + String(c4).toUpperCase(), { reliable: true, metadata: meta || {} });
      hostConn = c;
      /* listen before 'open': the host's first message can land ahead of the
         channel's own open event on the side that dialled */
      wire(c);
      c.on('iceStateChanged', (st) => { if (!found && (st === 'checking' || st === 'connected')) { found = true; if (onStage) onStage('found'); } });
      c.on('open', () => { c.__opened = true; conns = [c]; settled = true; code = String(c4).toUpperCase(); send(c, { t: 'hello', meta: meta || {} }); res(code); });
      c.on('error', fail);
      setTimeout(() => fail(Object.assign(new Error(found ? 'Found the room but the connection never opened' : 'No room with that code'), { kind: found ? 'route' : 'noroom' })), JOIN_TIMEOUT);
    });
    peer.on('error', (e) => {
      /* the matchmaker says there is no such id: fail at once, not after the timeout */
      if (e && e.type === 'peer-unavailable') fail(Object.assign(new Error('No room with that code'), { kind: 'noroom' }));
      else fail(e);
      emit('error', e);
    });
  });
}

function send(c, msg) { if (c && c.open) { try { c.send(msg); } catch (e) {} } }
function broadcast(msg) { for (let i = 0; i < conns.length; i++) send(conns[i], msg); }
function toHost(msg) { send(hostConn, msg); }
function netLeave() {
  broadcast({ t: 'bye' });
  /* forget the room before tearing it down so the close events say nothing */
  const p = peer; conns.forEach((c) => { c.__gone = true; });
  peer = null; conns = []; hostConn = null; role = 'solo'; myId = null; code = null;
  if (p) { try { p.destroy(); } catch (e) {} }
}

const isHost = () => role === 'host';
const isGuest = () => role === 'guest';
const isSolo = () => role === 'solo';
const netId = () => myId;
const roomCode = () => code;
const peers = () => conns.map((c) => c.peer);

export { hostRoom, joinRoom, send, broadcast, toHost, netOn, netOff, netLeave, isHost, isGuest, isSolo, netId, roomCode, peers };
