# Key and door, pressure, the ending, achievements — design

The stage clock no longer ends a stage. Waves ramp until you leave, and the
only way out is a door you have to earn: three key fragments scattered across
the room, each warded, then a key turned at the gate that brings the boss.
The run gets harder, the ending gets earned, and ten achievements give the
whole thing something to chase.

## Goals

- Every stage is a crossing: fragments far apart, arrows to each, wards at
  each, a door at the end. The big room finally has a reason to be big.
- Time is a price, never a rescue: waves tier up forever, the boss scales with
  how long you took, farming is a gamble you choose.
- 5/5 feels earned: champions carry the last keys, the last boss has phases,
  the win screen is a real ending, and the clear is remembered.
- Ten achievements, persisted, with best times.

## Non-goals

- Other puzzle types (braziers, escorts, rituals) — the fragment loop is the
  one pattern this spec ships; variants are a follow-up.
- Meta-progression beyond persisted achievements / best times / the cleared
  mark. The Vault codex and unlocks are their own spec.
- Multiplayer, WebGL.

## The loop

1. `startStage(n)` places three **fragments**. The room is split into three
   vertical thirds; one fragment per third, at least 900px from the room
   centre and 800px from each other, never within 260px of the gate, snapped
   off solid props. Each is drawn as a floating gold key shard over a glyph
   with a vertical beam, glows in the light pass, and has a **key arrow** on
   the screen edge (distinct icon from the chest arrow).
2. A fragment is **warded**: the first time any hero comes within 300px, a
   pack bursts from the floor around it — `2 + stage` brutes-or-casters plus
   `6 + 2*stage` grunts in a ring at ~120px, with a floor-crack fx and a sting.
   The ward fires once per fragment.
3. Any hero touching a fragment (`r 18`) collects it: `S.keys++`, a pulse
   fx, `sfx('key')`, the HUD socket fills. Fragments never despawn.
4. With `S.keys === 3` the gate lights (a standing beam and a pulsing glyph at
   `GATE`), arrows switch to the gate, float text "THE GATE IS OPEN".
5. **Turning the key**: a hero inside the gate zone (`GATE`, radius 70) starts
   a 2.0s channel shown as a ring on the hero (like the rez ring) and a HUD
   line. Leaving the zone decays it (0.6/s). Completing it: `sfx('keyTurn')`,
   the gate pours `8 + 3*stage` enemies, then `spawnBoss()` **at the gate**
   0.8s later. From here the existing boss flow runs: boss dies → loot →
   `startStage(n+1)`.
6. Chests keep spawning throughout (they stop during the boss as today).

State on `S`: `frags:[{x,y,taken,warded}]`, `keys`, `gateOpen`, `keyT`
(channel progress), `stageT0` (elapsed at stage start, for achievements),
`hordeTier`, `seatsUsed` (set of keys driven this stage), `chestsOpened`,
`downs` (count of hero downs this run), `overtimeStages` (count),
`stageClearT[]`.

## Pressure

Wave composition and rate come from a **tier**, `hordeTier(t, stage)`:

| Tier | Reached at (stage 1 → stage 5) | Composition |
| --- | --- | --- |
| 0 | 0s | grunts |
| 1 | 25s → 10s | + runners |
| 2 | 55s → 25s | + casters |
| 3 | 95s → 45s | + brute packs (brute + 3 grunts) |
| 4 "the horde" | 140s → 70s | rate ×2, elites in threes, nothing else changes |

Times interpolate linearly across stages. `S.hordeTier` is what the HUD meter
shows (five segments, the last labelled HORDE, pulsing red when reached).

- Spawn interval: `max(0.08, 0.36 - stage*0.04 - t*0.0025)`, halved at
  tier 4. Cap `120 + 25*stage` (was flat 145).
- Enemy stat multiplier: `1 + stage*0.6 + t*0.014` (was `0.55`, `0.012`).
- Boss multiplier: `(1 + stage*0.9) * (1 + min(0.6, t/240))` — a door opened
  at four minutes meets a boss 60% stronger. Boss enrage timer stays 48s.
- Blood Moon keeps its 1.4× on top.

## Stage 5

- Fragments are carried by three **champions**: `brute` art scaled 1.35,
  `hp 6× brute`, `dmg 1.6×`, `sp 1.15×`, a name (Warden Skell, Warden Moth,
  Warden Vey), their own HUD-less overhead health bar (drawn in world), and a
  gold key shard drawn over their head. They roam within 260px of a home
  point (placed like fragments); killing one drops the fragment where it
  died. No wards on stage 5 — the champions are the ward.
- The final boss has **two phases**: at 50% HP it enrages immediately
  (existing enrage: dmg ×2.6, speed ×1.4), its slam cadence changes to three
  slams 0.5s apart, and every add wave is casters. Float text "ENRAGE
  INCARNATE" and the existing enrage bar turns red.
- Winning: `finish(true)` shows the tally plus the relics held and the gear
  per hero, plays `sfx('win')` and a longer fanfare, and writes
  `wipecheck.cleared = 1` to localStorage; the menu shows a small
  "VAULT CLEARED" mark under the wordmark when set.

## Achievements

Persisted as `wipecheck.ach` (JSON: `{id: {at: epochMs, best?: seconds}}`).

| id | Name | Condition |
| --- | --- | --- |
| clear | Vault Cleared | finish the run |
| speed | Speed Clear | finish the run in under 15:00 (records best) |
| blitz | Blitz | turn a key within 90s of arriving on a stage (records best) |
| overtime | Overtime | clear a stage after `hordeTier` reached 4 |
| marathon | Marathon | Overtime on all five stages in one run |
| nowipe | No Wipe | finish the run with `downs === 0` |
| cursed | Cursed Crown | win holding 3+ curses |
| hoarder | Hoarder | open 10 chests in one run (mimics count) |
| giant | Giant Slayer | kill the final boss before it enrages |
| seats | Seat Hopper | clear a stage having driven all three heroes on it |

- `award(id, value?)` checks, persists, and if new pushes a **toast** (top
  centre, below the stage label, 3.2s, `sfx('ach')`) — never pauses.
- The run-end tally lists achievements earned this run first, highlighted.
- **Trophies** panel from the menu (button next to Fullscreen): ten cards,
  unlocked ones gold with the date and best time, locked ones dim with the
  condition as a hint.

## Where it lives

- `src/objective.js` — fragment placement, wards, pickup, gate state, key
  channel, champions for stage 5, `hordeTier`, per-stage ramp params.
- `src/achievements.js` — table, `award`, persistence, toast, trophies panel
  builder, run counters helpers.
- `src/content.js` — STAGES gain `ramp` (tier times), `cap`; champion names.
- `src/simulation.js` — spawner uses `hordeTier`; calls objective update; boss
  phase two; counters (chests, downs, seats).
- `src/flow.js` — startStage resets objective; spawnBoss at gate after the key
  turn; finish() writes the ending, awards run achievements.
- `src/art/render.js` — fragments, beams, gate glow, key arrows, champion
  bars, key-turn ring.
- `index.html` / `styles/game.css` / `src/ui.js` — key sockets, horde meter,
  toast, trophies panel, cleared mark, ending tally.
- `src/audio.js` — cues `key`, `keyTurn`, `ward`, `ach`, `fanfare`, measured
  like the rest.
- README: a "The door" section, the pressure table, achievements.

## Testing

- Playwright `objective.js`: fragments are three, far apart, off-centre;
  approaching one spawns the ward exactly once; touching all three sets
  `gateOpen`; standing in the gate for 2s spawns the boss at the gate; the
  old `st.dur` no longer spawns a boss.
- Playwright `pressure.js`: `hordeTier` reaches 4 by the table times for
  stage 1 and stage 5; spawn cap rises with stage.
- Playwright `ach.js`: `award` persists and toasts once; Blitz records a best;
  the ending sets the cleared mark.
- A **bot harness** `botrun.js` that plays whole runs (auto-draft, auto-path
  the driven hero toward the nearest fragment / gate / chest, ability on
  cooldown) and reports per-stage clear time and where it wiped, over N runs.
  Tuning target at default: median wipe on stage 3–4, ~1 in 5 full clears,
  ~3 min per stage when it clears.
- Existing suites keep passing on both paths; sound levels re-measured.
