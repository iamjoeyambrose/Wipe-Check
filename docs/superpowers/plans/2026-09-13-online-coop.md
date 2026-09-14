# Online Co-op Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host-authoritative online co-op for 2–3 players over WebRTC with room codes, guests predicting their own hero and mirroring everything else.

**Architecture:** `net.js` wraps PeerJS; `seats.js` decides where each hero's input comes from; `snapshot.js` packs the host's world into a binary frame 20×/s plus an event list, and unpacks it on guests into interpolation targets; `lobby.js` is the screens. The sim never learns about the network beyond `heroInput(k)`.

**Tech Stack:** PeerJS 1.5.4 (vendored), Canvas 2D, ES modules, the zero-dependency bundler (vendor script inlined into dist), Playwright + a local PeerServer (`peer`, devDependency) for tests.

**Spec:** `docs/superpowers/specs/2026-09-13-online-coop-design.md`

## Global Constraints

- Solo play byte-for-byte unchanged in behaviour: every existing suite passes.
- PeerJS is the only runtime dependency; it is vendored, not fetched from a CDN at runtime.
- No duplicate top-level names across modules; every import explicit.
- Guests never run `update()`.

---

### Task 1: vendor PeerJS, `net.js`, local broker, connection test
**Files:** Create `vendor/peerjs.min.js`, `src/net.js`; modify `index.html` (script tag), `build/bundle.mjs` (inline vendor, strip tag), `package.json` (devDependency `peer`, script `broker`). Test: scratchpad `net.js`.
- [ ] Copy `peerjs.min.js` (1.5.4) to `vendor/`. `<script src="vendor/peerjs.min.js"></script>` before the module script.
- [ ] bundler: strip the vendor tag from `markup`; emit `<script>${vendor}</script>` before the game script.
- [ ] `net.js`:
```js
const ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ';
let peer=null, conns=[], hostConn=null, role='solo', myId=null, handlers={}, code=null;
function brokerOpts(){ const m=/[?&]peer=([^&]+)/.exec(location.search); if(!m) return {debug:0};
  const [host,port]=decodeURIComponent(m[1]).split(':'); return {host, port:+port||9000, path:'/', secure:false, debug:0}; }
function newCode(){ let s=''; for(let i=0;i<4;i++) s+=ALPHA[Math.floor(Math.random()*ALPHA.length)]; return s; }
function on(t,fn){ (handlers[t]=handlers[t]||[]).push(fn); }
function emit(t,msg,from){ (handlers[t]||[]).forEach(fn=>fn(msg,from)); }
function wire(c){ c.on('data',d=>{ const t=d&&d.t; emit(t||'bin',d,c); }); c.on('close',()=>{ conns=conns.filter(x=>x!==c); emit('leave',{id:c.peer},c); if(c===hostConn) emit('hostLeft',{}); }); c.on('error',()=>{}); }
function hostRoom(){ return new Promise((res,rej)=>{ code=newCode(); peer=new Peer('wc-'+code, brokerOpts()); role='host';
  peer.on('open',id=>{ myId=id; res(code); }); peer.on('error',e=>{ if(e.type==='unavailable-id'){ peer.destroy(); hostRoom().then(res,rej); } else rej(e); });
  peer.on('connection',c=>{ c.on('open',()=>{ conns.push(c); wire(c); emit('join',{id:c.peer},c); }); }); }); }
function joinRoom(c4){ return new Promise((res,rej)=>{ peer=new Peer(brokerOpts()); role='guest';
  peer.on('open',id=>{ myId=id; const c=peer.connect('wc-'+c4.toUpperCase(),{reliable:true}); hostConn=c;
    c.on('open',()=>{ conns=[c]; wire(c); res(c4); }); c.on('error',rej); });
  peer.on('error',e=>rej(e)); }); }
function send(c,msg){ if(c&&c.open) c.send(msg); }
function broadcast(msg){ conns.forEach(c=>send(c,msg)); }
function toHost(msg){ send(hostConn,msg); }
function leave(){ if(peer){ peer.destroy(); } peer=null; conns=[]; hostConn=null; role='solo'; }
const isHost=()=>role==='host', isGuest=()=>role==='guest', isSolo=()=>role==='solo';
export { hostRoom, joinRoom, send, broadcast, toHost, on, leave, isHost, isGuest, isSolo, conns, myIdOf:()=>myId, codeOf:()=>code };
```
(export `myId`/`code` through getters since bundled modules share scope.)
- [ ] Test: start `npx peerjs --port 9000` in the background; two pages; A `WC.net.hostRoom()` → code; B `joinRoom(code)`; A receives `join`; B sends `{t:'ping'}`; A's handler fires.

### Task 2: seats + heroInput + remote input packets
**Files:** Create `src/seats.js`; modify `src/state.js` (`seats`), `src/simulation.js` (use `heroInput`), `src/input.js` (guest sends packets; swap keys via seats), `src/combat.js`/`ui.js` (ability from remote flag).
- [ ] `seats.js`: `remote={}` (peerId → {dx,dy,flags,seq}); `heroInput(k)`: owner = `S.seats[k]`; `'host'`/local → `inputVec()`; `'bot'` → `botVec`; peer → remote vector; `pumpRemoteActions()` each host frame: ability flag → `useAbility(S.h[k])`, swap bits → `trySwap(peer, seat)`. Guest side: `sendInput()` at 30 Hz from `inputVec()` + pressed flags (edge-triggered).
- [ ] `simulation.js`: `var v = heroInput(k)`; `if(S.seats[k]==='bot') botAbility(h)`.
- [ ] Solo: `S.seats` = ctrl→'host', others 'bot'; `1/2/3` keeps working by reassigning seats locally (host) — guests request via flags.

### Task 3: snapshot encode/decode, host broadcast, guest interpolation + prediction
**Files:** Create `src/snapshot.js`; modify `src/main.js` (loops), `src/audio.js` (`sfx` → `ev` on host), `src/combat.js` (`floatTxt/fx/spark` → `ev`), `src/actors.js` (enemy `id` counter).
- [x] Enemies get `id` (`S.nextId++`) in `spawnEnemy/spawnBoss`.
- [x] `encodeSnapshot(S)` → `ArrayBuffer` via a `DataView` writer; `decodeSnapshot(buf)` → plain object; `applySnapshot(S, snap, now)`: sets prev/next per id and header fields directly.
- [x] `guestFrame(dt)`: interpolate; predict own hero; decay flashes/squash locally; run `objective` visuals only (frag `t`).
- [x] Host loop: after `update`, `if(isHost() && now-lastSnap>=50) broadcast({t:'snap', buf, ev:drain()})`. Slow state every 1 s.
- [x] Events on guest: `sfx`, floats (push into `S.floats`), fx (push into `S.fx`), music.
- [x] Test: steps 3 and 4 of the spec.

### Task 4: lobby + start + modes + shared menus + disconnects
**Files:** Create `src/lobby.js`; modify `index.html`/`styles/game.css` (`#vOnline`), `src/ui.js`, `src/flow.js` (levelup/loot/relic/over emit + guest mirrors, `pickerSeat()` rotation), `src/state.js` (`setMode` broadcast hook).
- [x] Panel, host/join flows, seat picker (radio per seat, disabled when held), names, Pull (host only) → `{t:'start', seats, names}`; guests `newGame(mySeat)` + `startStage(0)` structure and `setMode('play')`.
- [x] `setMode` on host broadcasts `{t:'mode', m}`; guests set their mode and show/hide the matching veil (paused → "Host paused").
- [x] `openLevel(cards, picker)`: host picks cards, emits; guests build the same reels; non-pickers get no buttons and a "<Role>'s pick" subtitle; picker click → host applies and emits mode.
- [x] `openLoot(drops, picker)` / `showRecipients` similarly (items serialised by `id,q,affix names,uid`, rebuilt via `ITEMS`/`AFFIXES` lookup).
- [x] `openChest` result `{t:'relic', id}` → guests spin to that id; `relicTake` from anyone.
- [x] `finish` → `{t:'over', ...}`; guests render the same tally.
- [x] `leave` events: host → seat to bot + float; guest gets `hostLeft` → over screen.
- [x] Test: steps 1, 2, 5, 6.

### Task 5: docs, build, deliver
- [ ] README "Online co-op" section (how to host/join, what the host owns, the caveat about strict NATs, `npm run broker` for local testing).
- [ ] Full suites, bundle (vendor inlined), zip, Mac, commit.

## Self-review
Spec coverage: transport (T1), seats (T2), traffic/rendering (T3), shared moments/lobby/disconnects (T4), tests across T1–T4, docs (T5). Names: `hostRoom/joinRoom/send/broadcast/toHost/on/leave/isHost/isGuest/isSolo`, `heroInput/pumpRemoteActions/sendInput/trySwap`, `encodeSnapshot/decodeSnapshot/applySnapshot/guestFrame`, `S.seats`, event types `snap/slow/mode/levelup/pick/loot/lootPick/relic/relicTake/start/over/ping`.
