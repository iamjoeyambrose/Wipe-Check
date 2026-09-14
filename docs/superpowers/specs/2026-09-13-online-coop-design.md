# Online co-op — design

Two or three people, each in their own browser, one party. One browser hosts
and runs the real simulation; guests send inputs and draw what the host tells
them. Solo play is untouched: online is a mode, not a rewrite.

## Goals

- Join a friend with a four-letter code from the hosted link, no server to run.
- Steering feels instant on every screen; everything else is a few dozen ms
  behind and smooth.
- The shared moments (level-up, loot, relic, key turn, wipe, clear) happen on
  every screen at once, with a clear owner for each pick.
- A guest dropping hands its seat to a bot; a host dropping ends the run for
  guests gracefully.

## Non-goals

- Lockstep / deterministic sim, host migration, more than three players,
  voice, matchmaking, relay (TURN) servers, cheating protection.

## Topology and transport

- **Host-authoritative.** The host runs `update()` exactly as solo. Guests run
  no simulation.
- **WebRTC data channels via PeerJS** (`vendor/peerjs.min.js`, 1.5.x, MIT).
  The public PeerJS broker does the handshake; `?peer=host:port` (dev) points
  at a local broker for tests. Room id = `wc-` + four letters from
  `ABCDEFGHJKMNPQRSTUVWXYZ`.
- One reliable ordered channel per guest. Snapshots are `ArrayBuffer`
  (binary), everything else is a small JSON object with a `t` field.

## Seats

`S.seats = { tank: owner, dps: owner, heal: owner }` where owner is `'host'`,
`'bot'`, or a guest's peer id. On every machine `S.ctrl` is *my* seat (camera
and HUD highlight). In the sim, a hero's input comes from its seat:
`heroInput(k)` → `inputVec()` for the host's own seat, the latest remote
packet for a guest seat, `botVec(h)` for a bot. Ability presses and swap
requests arrive in the packet. A guest may swap only into a bot seat.

## Traffic

Guest → host, 30 Hz: `Float32Array [dx, dy, flags]` — flags bit0 ability,
bit1 swap-to-tank, bit2 swap-to-dps, bit3 swap-to-heal (host ignores swaps
into held seats).

Host → guests, 20 Hz, one message `{t:'snap', buf, ev}`:
- `buf` binary: header (elapsed, stage, t, kills, lvl, xp, xpNeed, keys,
  tier, gateOpen, keyT, keyTurned, boss hp%, bossT, enraged, frozenT, cam
  x/y of host is *not* sent), heroes ×3 (x, y, z, hp, hpMax, mp, mpMax,
  face, phase, swing, swingDur, down, rez, downT, abil, abilCd, sqx, sqy,
  vx, vy, hitFlash), enemies (id u16, kind u8 + flags, x i16, y i16, z u8,
  hp% u8, face, ph u8, flash bit, sq u8, rot i8), bullets, ebullets, gems
  (x, y, z), chests (x, y, z, landed), corpses (art, x, y, z, rot, face, t,
  dur), fragments (x, y, taken, carried), champion names by id.
- `ev` array of events created since the last snapshot: `['sfx', name, v]`,
  `['float', x, y, txt, col, big]`, `['fx', ...]` particles/rings/beams/arcs,
  `['music', intensity, boss]`, and the big ones below.

Every 1 s the host also sends `{t:'slow', kits, gear (names per slot per
hero), relics, statRows}` for frames, the gear sheet and the relic row.

## Guest rendering

The guest keeps its own `S` (from `newGame(seat)`) purely as a structure the
renderer reads. Each snapshot is decoded into `prev`/`next` targets; every
frame the guest interpolates objects from prev to next (rendering ~50 ms
behind) by id for enemies, corpses, gems, chests and bullets (new ids appear
at `next`, missing ids are dropped). **Its own hero is predicted**: the guest
integrates `inputVec()` into `h.x/h.y` each frame (clamped to `PLAY`,
`propPush`), and on each snapshot blends 35% toward the host's position, or
snaps if more than 90 px off. Other heroes interpolate like enemies.

Floats, fx and sfx are created locally from events. Music follows `music`
events. The HUD (`syncBars/syncXp/syncFrames/syncObjective`) reads the
patched `S` as usual.

## Shared moments

Host emits, guests mirror; only the owner's click matters and is sent back.

| Moment | Event | Owner | Guest → host |
| --- | --- | --- | --- |
| level-up | `{t:'levelup', cards:[idx×3], picker:seat, lvl}` | rotates by party level across held seats | `{t:'pick', i}` |
| boss loot | `{t:'loot', drops:[{id,q,affix ids,uid}], picker}` | rotates like level-up | `{t:'lootPick', uid, role}` |
| relic chest | `{t:'relic', id, held}` | anyone | `{t:'relicTake'}` |
| key turn / stage / boss | in `ev` as floats + sfx; `{t:'stage', n}` restarts guest structure | — | — |
| pause | `{t:'mode', m}` for every host mode change | host | guest Esc opens local settings only |
| over | `{t:'over', won, tally, ach}` | — | — |

Non-owners see the reels spin and land with "<Role>'s pick" and no buttons.

## Lobby

Menu gains **Play online** → a panel with **Host** (creates the room, shows
the code big, a seat picker, the player list) and **Join** (code field →
connect → seat picker, "waiting for host"). Names default to Player 2/3 and
can be edited (saved in localStorage). Unheld seats are bots. Host presses
Pull; `{t:'start', seats, names}` starts every screen together.

Guest disconnect → its seat becomes a bot, float text "X left". Host
disconnect → guests get an over screen "Host left" with the tally so far.

## Where it lives

- `src/net.js` — PeerJS wrapper: `hostRoom()`, `joinRoom(code)`, `send`,
  `broadcast`, `on(type, fn)`, `players`, `myId`, `isHost/isGuest/isSolo`,
  disconnect handling, `?peer=` override.
- `src/snapshot.js` — `encodeSnapshot(S)` / `applySnapshot(S, buf)` +
  interpolation buffers, event queue (`ev()` used by sfx/floatTxt/fx wrappers
  when hosting), `slowState`.
- `src/lobby.js` — the online panel, seat picking, start.
- `src/seats.js` — `heroInput(k)`, remote input store, swap handling.
- Threaded: `main.js` (host/guest/solo loop), `simulation.js` (input source),
  `flow.js` (menus emit/consume), `audio.js` (`sfx` mirrors to `ev` on host),
  `combat.js` (`floatTxt/fx/spark` mirror), `ui.js` (buttons, guest pause),
  `input.js` (swap keys go through seats), `index.html`/`css`, `bundle.mjs`
  (inline vendor script), README.

## Testing

Local PeerServer (`peer` npm package, dev only) on :9000; Playwright opens
two pages with `?dev=1&peer=localhost:9000`:
1. A hosts, code appears; B joins with it; both list two players.
2. B picks Ranger; A presses Pull; both reach mode play; B's `S.ctrl==='dps'`.
3. B drives right for 1 s → on A, the Ranger moved right ≥ 60 px; on B the
   predicted hero and A's truth agree within 40 px.
4. Enemy counts on A and B match within 3 after 2 s; a kill on A produces a
   float on B.
5. A forces a level-up → both show the panel; the non-picker's click changes
   nothing; the picker's click closes it on both and the upgrade applied on A.
6. B closes → A's `S.seats.dps==='bot'` within 3 s and the run continues.
7. Solo suites unchanged; single-file build contains PeerJS inline and works
   from `file://`.
