# Wipe Check

A three-role party roguelite in a single canvas. You drive one of a tank, a DPS
and a healer against waves that never stop; the other two run on party AI and
you can jump between them mid-fight. Enemies pick targets off a real threat
table, so holding aggro is the actual game -- and the only way out of a stage
is a door you have to earn: three key fragments across the room, then a key
turned at the gate while the horde closes in.

Everything you see is generated in code at load — the character rigs, the sprite
atlases, the stone textures, the dungeon room. **There are no image, audio or
font files in this project**, which is why `assets/` holds only a favicon.

---

## Running it

**Just play it** — open `dist/wipe-check.html`. One self-contained file, no
server, works offline. Rebuild it with `npm run build` after changing anything
in `src/`.

**Work on it** — `npm start`, then open http://localhost:5173. This serves the
unbundled modules straight from `src/`, so a reload picks up your edit with no
build step. It needs a server because browsers refuse ES module imports over
`file://`.

No runtime dependencies, no install step. Node 18+ for the build scripts; the
game itself is plain browser JavaScript. The one library it uses, PeerJS for
online play, is vendored in `vendor/` and inlined into the single file.

```
npm start          # dev server on :5173, live modules
npm run build      # bundle src/ -> dist/wipe-check.html
npm test           # unit tests (node --test)
npm run broker     # a local PeerJS server on :9000 for offline multiplayer testing
```

## Online co-op

**Play online** on the menu. One person presses **Host a room** and gets a
four-letter code; the others type it in and **Join**. Everyone picks a seat
(a seat someone else holds is greyed out), the host presses **Pull**, and the
run starts on every screen at once. Seats nobody holds run on party AI, so two
people can play with a bot healer, and one person can host alone to try it.
Names are remembered between sessions.

Everything is keyboard, same controls as solo. `1` `2` `3` still swaps you into
any seat a bot holds. `Esc` on a guest opens a settings sheet (sound, sliders,
fullscreen, gear, leave) without stopping anyone; `Esc` on the host pauses the
room and guests see *Host paused*.

Shared moments rotate. Level-up drafts go round the held seats by party level,
boss loot by stage; everyone watches the reels spin but only the picker's
click counts, and the panel says whose pick it is. Relic chests can be taken by
anyone. The ending shows the same tally on every screen, with each player's own
trophies. After a run the host can **Pull again** or go back to the room to
reseat; a guest who drops mid-run becomes a bot and the run keeps going. If the
host leaves, guests get an ending screen with the run so far.

How it works: the host's browser runs the whole simulation and is the only
truth. Guests send their stick and button presses thirty times a second and
receive a compact binary snapshot of the world twenty times a second, which
they interpolate between; a guest's own hero is predicted locally from its own
input so steering feels immediate, and pulled toward the host's position as
snapshots arrive. Sounds, floats and particles are mirrored as small events.
The public PeerJS broker only introduces the browsers to each other; the game
traffic runs directly between them over WebRTC. That means it works from the
single file with no server of your own, but a very strict NAT on both ends can
stop a direct connection from forming, in which case joining times out after
eight seconds -- try from a different network, or have the other person host.

For working on it offline, `npm run broker` starts a local PeerJS server and
`?peer=127.0.0.1:9000` on the game URL points the game at it; the Playwright
scripts in the plan use exactly that.

---

## Layout

```
index.html            dev entry: loads src/main.js as a module
styles/game.css       all page chrome (HUD, party frames, overlay screens)
assets/favicon.svg    the only real asset in the project
vendor/peerjs.min.js  PeerJS 1.5.4 (MIT), the WebRTC handshake for online play
build/bundle.mjs      zero-dependency bundler -> dist/
build/serve.mjs       zero-dependency static server
dist/wipe-check.html  the built single file (git-ignored; run the build)

src/
  config.js           arena size, class colours, roles, stage palettes
  util.js             rr/clamp/dist/kf/hexA and friends
  content.js          the 24 upgrades, 15 gear pieces, 5 stages
  state.js            what a hero and a run are; the live singletons
  canvas.js           sizing, device-pixel scale, world transform
  input.js            keyboard, pointer, on-screen pads
  combat.js           damage, healing, the threat table, role abilities
  actors.js           enemy types and spawning, auto-attacks, party bot AI
  physics.js          the vertical axis: gravity, one bounce, launches, airborne
  objective.js        the door: key fragments, wards, the gate, the horde tiers, the wardens
  achievements.js     ten achievements, persisted, with best times and the toast
  relics.js           the relic table: what chests roll, and how the game asks about it
  simulation.js       the fixed update step, chest spawning
  flow.js             stage lifecycle, level-up draft, relic reel, loot rolls (shared online)
  ui.js               party frames, HUD, menu / draft / loot / result screens
  net.js              the wire: rooms, codes, send/broadcast, who left
  seats.js            whose input drives each hero: keyboard, a guest's packet, or the bot
  snapshot.js         the host's binary world snapshot; guest interpolation and prediction
  online.js           the session: start on every screen, mirrored modes and moments
  lobby.js            the Play online panel: host, join, seats, names, pull
  main.js             entry: bake art, wire the loop (solo / host / guest), boot

  art/
    materials.js      material table + the shaded primitives every rig uses
    textures.js       procedural noise, blotch and stipple passes
    rigs-enemies.js   the five enemy skeletons
    rigs-heroes.js    the three party skeletons, drawn live
    atlas.js          bakes enemy rigs into sprite sheets; glows, shadows
    room.js           walls, flagstones, arches, pillars, scatter props
    render.js         one frame, back to front
```

---

## Where to change things

| You want to change | Open |
| --- | --- |
| How hard it is: the horde tiers, crowd cap, stat and boss scaling | `src/objective.js` (`TIERS`, `spawnCap`, `enemyMul`, `bossMul`) |
| Wave composition per tier, enemy stats | `src/simulation.js`, `src/actors.js` (`ETYPES`) |
| The door: fragment placement, wards, the key channel, the wardens | `src/objective.js` |
| Achievements | `src/achievements.js` (`ACH`) |
| Role numbers — health, damage, cooldowns | `src/config.js` (`ROLES`) |
| Draft upgrades | `src/content.js` |
| Gear, stats, tradeoffs | `src/items.js` (`ITEMS`) |
| Any sound, or the beat | `src/audio.js` |
| How a character looks | `src/art/rigs-heroes.js`, `src/art/rigs-enemies.js` |
| Colours of armour, bone, stone | `src/art/materials.js` (`MAT`) |
| A stage's palette | `src/config.js` (`STAGEART`) |
| The room itself | `src/art/room.js` |
| HUD and screens | `styles/game.css`, `src/ui.js` |

Adding a stage means one entry in `STAGES` (`src/content.js`) and one matching
palette in `STAGEART` (`src/config.js`) — the room bakes itself from the palette
and the door places its own fragments.

---

## How the build works

The bundler is 100 lines and has no dependencies. It walks the import graph from
`src/main.js`, drops every `import` and `export` line, and concatenates the
modules into one function scope, then inlines the CSS and favicon.

Two consequences worth knowing:

- **Top-level names must be unique across all modules.** The build fails with
  the offending name and both files if they ever collide.
- **Two modules may import each other.** `combat`, `flow` and `actors` do. They
  only call each other's functions at runtime, and function declarations hoist
  within the shared scope, so the cycle is harmless. The build prints them.

If a module forgets an import, `npm start` throws it in the console on the first
load — the bundled build would silently work, because everything shares a scope
there. So develop against `npm start`, ship `npm run build`.

---

## Controls

The game fills the window; the party frames, run stats, XP strip and ability
box sit on top of it as a HUD. The ability box catches fire when your ability
is ready. `F` (or the button on the menu) goes truly fullscreen.

| | |
| --- | --- |
| `W` `A` `S` `D` / arrows | move |
| `Space` | your role ability |
| `1` `2` `3` | take over that party member (or click their frame) |
| `Esc` / `P` | menu: resume, sound on/off, music and SFX sliders, fullscreen, gear, quit (online: host pauses the room, a guest's menu is local) |
| `G` | party gear sheet |
| `M` | mute |
| `F` | fullscreen on / off |
| drag on the arena | move, on touch (turn the phone sideways for the full view) |

## The door

A stage has no clock. Waves ramp from the moment you arrive and keep ramping
until you leave, and the only way out is the gate at the top wall -- which
opens for three **key fragments** scattered across the room.

Fragments spawn one per third of the room, far from the centre, the gate and
each other, so every stage is a crossing. Each is marked with a gold shard, a
floor glyph, a beam, and a key arrow on the screen edge. Each is **warded**:
the first hero within 300px triggers a pack that bursts from the floor around
it. Touch a fragment to take it; the three sockets under the stage name fill.

With all three the gate lights up. A hero standing in it **turns the key** over
two seconds -- the light of the open gate holds the crowd off the threshold, so
getting there is the fight, standing in it is not. When the key turns, the door
hurls everything nearby back and kills the trash, a handful pour out, and the
boss walks through 0.8s later. Kill it, loot, next stage. Chests keep spawning
all the way through.

### Pressure

The **Horde meter** in the HUD steps through tiers with time on the stage:

| Tier | Arrives at (stage 1 → 5) | Adds |
| --- | --- | --- |
| 1 | 25s → 10s | runners |
| 2 | 55s → 25s | casters |
| 3 | 95s → 45s | brute packs |
| 4 HORDE | 140s → 70s | spawn rate doubles, brutes in threes |

The crowd cap is `60 + 15*tier + 15*stage`; enemy stats scale as
`1 + 0.55*stage + 0.003*t`; the boss you summon scales with how long you took
to open the door, up to +40% at two minutes. Farming is a gamble you choose.

### Stage 5

No fragments on the floor: three **wardens** carry them -- named brutes at 4.5x
health with their own bars and a shard over their heads, who roam near where
they stand and drop the fragment when they fall. The final boss has a second
phase at half health: it enrages on the spot, its slams come in threes, and
every add is a caster. Winning plays a fanfare, shows what the party carried
out, and marks the menu **Vault cleared** for good.

### Tuning

`scratchpad/botrun.js` plays whole runs headless (auto-draft, auto-path,
ability in crowds) at 10x. At the shipped numbers the bot's median death is
stage 3, it reaches stage 5 about one run in four, and it does not clear --
a player who steps out of boss slams and equips gear should do better. That is
the intended shape: stage 1 forgiving, stage 3 where average runs die, 5/5
earned.

## Achievements

Twelve, persisted in `localStorage` (`wipecheck.ach`), unlocked with a toast
that never pauses the game, listed on the run-end tally, and browsable from the
**Trophies** panel on the menu. Speed Clear and Blitz record best times. One is
hidden: it shows as `???` until it is earned.

| | |
| --- | --- |
| Century | kill 100 enemies in one run |
| Vault Cleared | finish the run |
| Speed Clear | finish the run in under 15:00 |
| Blitz | turn a key within 90s of arriving on a stage |
| Overtime | clear a stage after the Horde meter has filled |
| Marathon | Overtime on all five stages in one run |
| No Wipe | finish the run with no hero ever downed |
| Cursed Crown | win holding three or more curses |
| Hoarder | open ten chests in one run |
| Giant Slayer | kill the final boss before it enrages |
| Seat Hopper | clear a stage having driven all three heroes on it |
| ??? | a secret. The vault keeps one. |

## The Shade

There is a fourth hero. The DPS seat has two classes: the Ranger everyone
starts with, and the **Shade**, a melee assassin that is locked until found.
Somewhere in the vault one of the wall torches is dark. Stand under it. What
opens is ordinary floor -- enemies follow you in and the horde timer does not
care -- and what is chained at the back of it is yours once you touch them:
your Ranger takes the cloak on the spot for the rest of the run (same level,
same draft, the bow dropped since a Shade cannot hold one, health refilled),
the hidden trophy pops, and from the next run on the menu shows a fourth seat
card. Online, whoever holds the DPS seat gets a Ranger / Shade toggle in the
room if their own browser has the unlock; freeing the Shade in a shared run
unlocks it on every screen in the room.

The kit: 150 hp, the fastest hero, very quick short-reach dagger strikes for
less per hit than the Ranger but a 22% base crit, and **backstab** -- a hit on
an enemy that is not targeting you always crits (dagger crits do not launch
enemies the way arrow crits do). It sheds threat (×0.6). **Shadowstep** (8 s):
a 220 px dash along your stick, or at the nearest enemy when you are still;
you are untouchable during it, everything you cross takes a guaranteed crit,
and your threat drops to zero. Its six draft upgrades replace the six arrow
ones in the level-up pool while a Shade holds the seat (*Quickblades*, *Twin
Fangs*, *Hemorrhage*, *Deep Cuts*, *Lethality* is shared, talent *Smoke
Trail*), and three daggers sit in the boss loot pool class-locked to it the
way bows are to the Ranger. The bot version skirmishes at dagger reach,
Shadowsteps into groups of three, and backs off toward the healer under 30%.

In code it is a class layer on the DPS seat: `h.cls` is `'ranger'` or
`'rogue'`, `CLASSES` in `config.js` holds the Shade's role entry,
`setClass(h,cls)` in `state.js` does the mid-run swap, and `src/secret.js`
owns the torch, the door, the alcove floor rule and the freeing. The secret
rides in the snapshot as three bytes plus one class byte per hero.

## Gear

Five slots per hero: **weapon, chest, gloves, boots, ring**. Weapons are
role-locked -- sword and shield for the Bulwark, a bow for the Ranger, daggers
for the Shade, a staff for the Mender. Bosses drop three pieces; you take one and choose who wears it,
with the stat deltas shown per hero before you commit.

The pool is built on one rule: **no item is a pure upgrade.** Every piece costs
you something or is narrow enough that it only pays inside one build. Each slot
also owns a question about the character, so you know what you're shopping for:

| Slot | The question it answers |
| --- | --- |
| Weapon | How do you attack? |
| Chest | How do you survive? |
| Gloves | Fast and light, or slow and heavy? |
| Boots | Do you kite, or hold ground? |
| Ring | The wildcard, with the sharpest trade in the game |

Because threat is the core mechanic, threat is a *stat*. `Hunter's Whisper`
(threat ×0.45) lets a Ranger go full glass cannon; `Loop of Spite` (reflect
+45%, threat ×1.5) makes the room come to you on purpose. Stacking a threat-up
weapon with a threat-down chest is a real decision, not a wash.

Rarity never changes an item's identity -- it adds 0, 1 or 2 minor affixes on
top. An Epic `Reaper's Grip` is still a crit-damage glove.

### The stat model

A hero's numbers are rebuilt from three layers whenever anything changes:

```
base  ->  perks (draft picks, permanent)  ->  gear (swappable)
```

Nothing is ever destructively multiplied onto a hero, so swapping a ring
recomputes cleanly instead of stacking. Items are `mul`/`add` maps over stat
keys plus `flags` for behaviour that isn't a number -- `execute`,
`firstStrike`, `rooted`, `momentum`, `lifesteal`, `knockback`, `guardian` --
which resolve in `attackDamage()` against the real target at the moment of impact.

Press `G` mid-run to see all three builds with live derived stats.

## Relic chests

About once a minute a chest lands just outside your view, on the same ring the
enemies come in on, and waits there glowing. A gold arrow on the screen edge
points at it. Any hero who touches it opens it -- the bots included.

Opening one runs **a single wide reel, no draft.** Whatever lands is yours.
That is what makes curses land as real risk instead of a card you'd never
pick. Roughly 70/30 boon to curse, and nothing repeats until you've seen the
whole table. Relics are party-wide and last the run; the gear sheet (`G`) shows
them in a row under the three columns.

Every relic is **behaviour, never a stat.** The stat sheet belongs to gear and
talents. Curses are double-edged: real bite, real hook.

| Relic | Kind | What it does |
| --- | --- | --- |
| Rabbit's Foot | boon, stacks | +1 Luck: chests come ~25% sooner, boss loot rolls a tier higher more often, talents turn up in level-up reels more |
| Chain Lightning | boon | kills have a 20% chance to arc 40% of the blow to the two nearest enemies |
| Death Toll | boon | anything over 40 max HP explodes on death for 30% of it |
| Second Wind | boon | once per stage, a downed hero gets back up on their own after 8 s |
| Gem Alchemy | boon | every sixth gem is worth triple |
| Bounty | boon | bosses drop four items instead of three |
| Momentary Stillness | boon | every 20 s, every enemy stops for 1.5 s |
| Treasure Sense | boon | chests twice as often, one waiting at every stage start |
| Blood Moon | curse | +40% enemy spawns; every enemy drops double gems |
| Frenzy | curse | enemies 20% faster; hits on trash under 25% have a 15% chance to kill outright |
| Long Night | curse | the vignette closes in; heals crit for double 20% of the time |
| Greed | curse | chests twice as often; half of them are mimics (a brute) |

The table lives in `src/relics.js`; the effects are read wherever they apply
through `relic(id)`, the same way gear flags are read.

## Sound

Modern synthwave in the vein of The Midnight, synthesised at runtime. There are
no audio files.

The chain is deliberately clean -- there is no waveshaper anywhere, and the only
non-linearity is a limiter at the very end that should almost never engage:

```
voices ─┬──────────────────────────► mix ─► limiter ─► master ─► out
        ├─► plate  (1.9s hall)  ───►
        ├─► gate   (0.34s, cut) ───►     the big gated snare
        └─► echo   (dotted 8th) ───►     arps and stabs bounce, darker each pass
```

Pads, bass, stabs and arps sit behind `duck`, a gain node pulled hard down on
every kick -- four on the floor plus that pump is the whole feel. 122 BPM over
Am–F–C–G.

The track is an **8-bar phrase**. Bars 0–3 are the verse; bars 4–7 are the
chorus, which lifts one intensity layer above whatever the room is doing, so
even a quiet stage breathes. Bar 3 gets a small snare fill, bar 7 a riser and
a snare roll, and bar 0 opens on a crash. Underneath it all is an octave
gallop bass on every 16th; over it, when the layer allows, offbeat chord stabs,
a 16th-note arp into the echo, and a lead with late vibrato and portamento.

| Layer | When | What |
| --- | --- | --- |
| 0 | quiet | kick, gated snare, offbeat hats, gallop bass, supersaw pad |
| 1 | ~12 enemies (or any chorus) | + claps, offbeat stabs, 16th arp |
| 2 | ~30 enemies (or L1 chorus) | + the lead hook, ghost snare |
| boss | boss alive | half-time, A–G–F–E descent, stabs in the chorus, no hook |

### Sound levels

Levels are **measured, not guessed.** `audioRender()` renders any cue into an
`OfflineAudioContext` so its true peak and RMS can be read, and every cue has a
solved trim in `TRIM` (in `src/audio.js`) that puts it on target.

Open **`build/levels.html`** through the dev server to re-measure everything.
The shape to preserve:

| Tier | Peak dBFS | Examples |
| --- | --- | --- |
| Music bed | −11 … −8 | the track at every layer |
| Frequent SFX | −24 … −16 | click, reel tick, hit, swing, bow |
| Mid SFX | −15 … −10 | cleave, crit, heal, loot |
| Impacts | −7 … −2.5 | reel lock, shockwave, boss, wipe, win, relic land, mimic |

The music sits **below** the impacts on purpose: that headroom is what lets a
slam cut through the track instead of fighting the kick. If you raise the bed,
raise the impacts with it or the punch goes away.

Music and effects run on **separate buses**, each with its own reverb returns,
so the two sliders in the pause menu are real -- pulling music to zero silences the
bed *and* its tails without touching a single effect. Both volumes and the mute
state are remembered between runs.

`M` mutes everything.

## Height and hit-feel

The camera angle never changed, but the world stopped being flat. Every actor
and pickup carries a height (`z`) and a vertical speed, integrated by
`src/physics.js`: gravity, one visible bounce, a landing callback. Drawing
splits in two -- the **shadow stays on the floor** at `(x, y)` and shrinks as
the thing rises, the **body is drawn at `(x, y - z)`** -- and that offset is the
whole illusion. Depth sorting still uses `y`, so height never breaks layering.

An enemy above the floor is **airborne**: arrows pass under it, the Bulwark's
cleave ignores it, and it can't bite. That gives crits a crowd-control role.

What goes up:

| Trigger | Effect |
| --- | --- |
| Crit | target launched along the blow; a hard landing staggers neighbours |
| Knockback (talent) | popped off the floor and carried, instead of slid |
| Shockwave | every enemy in the ring heaved up, later the further out -- it ripples |
| Kill | the corpse tumbles along the killing blow with spin, bounces once |
| Gems | burst upward out of the corpse and rain down |
| Chest | drops in from above and lands with a thud, dust and a camera bump |
| Rez / Second Wind | the hero hops up onto their feet |
| Arrows | fly at a slight lift; a miss plants itself in the flagstones |

Hit-feel lives in the bodies, never in the camera: struck enemies flatten and
spring (`sqx/sqy`), heroes stretch into their swings, launched things tumble,
and big damage numbers overshoot and settle. The view itself never shakes,
kicks, zooms or stutters on a hit -- the only hit-stop left is the boss going
down (`impact()` in `combat.js`), and reduced-motion users lose that too.

### Performance notes

Fill rate is the whole cost of this renderer, so three rules keep it smooth:
no `backdrop-filter` anywhere (a blurred HUD forces the browser to re-blur the
canvas behind it every frame -- it was most of the frame time), the canvas
backing store is capped at ~2.6M pixels (`MAX_PIXELS` in `src/canvas.js`, so
a fullscreen Retina display renders near 1.4x instead of 2x), and the canvas is
not repainted while a menu is up. `?dev=1&off=light,shadow,vig,scene` skips
render passes for profiling.

`npm test` runs the physics unit tests.

## The room

The dungeon is one hand-laid room, **three screens wide and three tall**, and
the camera follows whoever you're driving. It is baked once per stage like
before -- flagstones, back wall with its gate and alcoves, colonnades of
pillars (solid, with cast shadows), braziers, scatter -- from a seeded layout
so every stage is the same room dressed in its own palette.

A few things keep it playing like Vampire Survivors rather than a big empty box:

- Enemies spawn on a **ring just past the edge of the screen**, so running
  never outruns them. The gate still pours when it is near.
- An enemy you leave far behind is **brought back around** to the ring.
- The two bots are **leashed** to your seat -- they pull toward you past ~250
  units and rejoin at your side if they fall more than ~760 behind. A small
  arrow on the screen edge points at anyone out of frame.
- Gems you abandon are dropped once they are well off screen.

`WORLD_W` / `WORLD_H` in `src/config.js` set the size; the bake, spawn ring,
camera clamp and prop layout all read from them.

## The threat table

Every enemy scores its targets by threat over distance and re-picks a few times
a second. The tank's aura massively out-threats everyone inside it, damage
builds threat, and **healing builds the most threat of all** — so an over-eager
healer pulls the room. Faint red lines mark enemies that have peeled onto a
squishy. All three party members down is a wipe; the healer can rez by standing
on a downed ally for ~2.4s.
