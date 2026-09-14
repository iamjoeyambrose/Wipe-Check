# The Shade: a secret unlockable hero behind a hidden door

## What it is

A fourth hero, the **Shade**, a melee assassin that stands in the DPS seat
instead of the Ranger. It is locked until found: on stage 3 one wall torch is
dark; lighting it opens a hidden alcove in the back wall where the Shade is
shackled, and touching them frees them. The unlock is permanent on that
machine. Nothing on the HUD hints at any of it.

## The secret

- **Stage:** 3 (The Slag Foundry). The horde timer never pauses for it.
- **The torch:** the back wall's torch row (`WALLFIRE`) gets one entry with
  `lit:false` on stage 3, the second torch right of the gate. It is drawn as
  a dark sconce, no flame, no light pool.
- **The switch:** a hero standing within 34 px horizontally of the torch and
  within 30 px of the top edge of the floor lights it (`sfx('torch')`, a
  flash, floats nothing). Bots trigger it too if they wander there.
- **The door:** the wall directly right of the torch (x from torch+40 to
  torch+300, y from `WALLY-120` to `WALLY`) grinds open over 0.9 s
  (`sfx('gate')`-style rumble, dust particles). The opening is drawn over the
  baked wall: dark stone interior, floor texture, a single candle. The
  alcove is ordinary floor once open: heroes *and* enemies can walk in
  (`floorTop(x)` returns the alcove top for x inside it while open,
  `PLAY.top` elsewhere; every clamp to `PLAY.top` goes through it, including
  the guest's own-hero prediction). It stays open for the rest of the stage.
- **The prisoner:** the Shade is drawn at the back of the alcove, shackled
  (a chain to the wall, grey-tinted, idle pose). A hero within 30 px frees
  them: chain snaps (spark), smoke swirl, `floatTxt('THE SHADE', violet, big)`.

## What freeing does

1. `localStorage['wipecheck.shade']='1'`; `award('shade')` -- an 11th
   achievement, **The Shade** ("Find what the vault keeps in the dark"),
   shown on the trophies panel as `???` with no description until earned.
2. The hero in the DPS seat becomes a Shade for the rest of the run:
   `setClass(h,'rogue')` swaps `h.role` to the Shade's role table entry,
   rebuilds `h.base` from it, keeps `h.perk` and `h.kit`, drops the weapon
   slot if it holds a bow (floats "Bow dropped"), `recompute`s, refills hp.
   Arrow-specific perks (`shots`, `pierce`, `volleyR`) become inert.
3. From the next run on: the menu's seat pick shows a fourth card, **Shade**
   (DPS); picking it sets `myRole='dps'` and the run's DPS class to rogue. In
   the online lobby, whoever holds the DPS seat sees a Ranger / Shade toggle
   under the seat if *their* browser has the unlock; the choice rides in the
   `seat` message and in `start` as `cls:{dps:'rogue'|'ranger'}`.

Online, the host owns all of it. The class of each hero is one byte in the
snapshot hero block (0 ranger, 1 rogue) so guests draw the right rig; the
door state (torch lit, door open amount, prisoner freed) is three bytes in the
snapshot header. Freeing awards the achievement to every screen through the
existing `'a'` event, and every screen sets its own unlock flag on that event.

## The class layer

`ROLES.dps` stays the Ranger. A new `CLASSES` table holds the DPS
alternatives: `CLASSES.ranger = ROLES.dps`, `CLASSES.rogue = {key:'dps',
cls:'rogue', name:'Shade', label:'DPS', col:'#B48CFF', hp:150, speed:168,
r:12, atkCd:.26, dmg:14, reach:62, crit:.22, threatMul:.6, abil:'Shadowstep',
abilCd:8, blurb:[...]}`. A hero carries `h.cls` (`'ranger'` default). Code
that is Ranger-specific branches on `h.cls`:

- `actors.heroAttack`: rogue strikes the nearest enemy in reach with a short
  slash arc (`pushFx` arc, narrower and quicker than the tank's).
  **Backstab:** if the target's `tgt` is not this hero, the hit is a crit.
- `combat.useAbility`: **Shadowstep** -- dash 220 px along the input vector
  (or toward the nearest enemy when still) over 0.18 s, immune while dashing,
  every enemy within 34 px of the path takes a guaranteed crit, threat set to
  0, smoke trail (`spark`, violet). Uses the physics step's clamp so it never
  leaves the floor.
- `actors.botVec/botAbility`: rogue bot skirmishes the nearest enemy, keeps
  reach distance, Shadowsteps when three or more enemies are within 150 px,
  backs off toward the healer below 30 % hp.
- `rigs-heroes.drawRogue`: hooded, two daggers, violet trim; `HERODRAW`
  keyed by `h.cls||h.key`.
- Upgrades: the six `r:'dps'` upgrades get `cls:'ranger'`; six new ones get
  `cls:'rogue'`: *Quickblades* (attack speed +22 %), *Twin Fangs* (every third
  strike hits twice), *Hemorrhage* (crits bleed 40 % over 3 s), *Lethality*
  (crit +14 %, shared entry kept for both), *Deep Cuts* (damage +28 %),
  talent *Smoke Trail* (Shadowstep leaves smoke that stuns 1.2 s). `openLevel`
  filters the pool by the DPS hero's class.
- Items: bows get `cls:'ranger'`; three daggers `cls:'rogue'` -- *Nightfang*
  (crit build), *Twinstroke* (attack speed, twin-hit chance), *Vein-drinker*
  (lifesteal). `canEquip` and `rollDrops` honour `cls`.
- `preview`, gear sheet, frames: unchanged, they read stats.

## Where it lives

- `src/secret.js` -- the torch, the door, the alcove (`floorTop`), the
  prisoner, `freeShade()`, `shadeUnlocked()`, `setClass()`, snapshot helpers.
- `src/config.js` -- `CLASSES`, violet colour.
- `src/content.js` -- rogue upgrades, `cls` tags.
- `src/items.js` -- daggers, `cls` lock.
- `src/combat.js`, `src/actors.js` -- attack, ability, bot.
- `src/art/rigs-heroes.js` -- `drawRogue`; `src/art/render.js` -- dark torch,
  open wall, prisoner; `src/art/room.js` -- the `lit` flag.
- `src/flow.js` -- class-aware pools, `startStage(2)` seeds the secret.
- `src/ui.js`, `src/lobby.js`, `src/online.js` -- fourth card, toggle, `cls`
  in start/seat/snapshot.
- `src/achievements.js` -- `shade` (hidden) and `century`.
- `src/snapshot.js` -- class byte, door bytes; guest prediction uses
  `floorTop`.

## Testing

Playwright, `?dev=1`:
1. `WC.startStage(2)`; one WALLFIRE has `lit:false`; drive the hero under it
   -> `lit` true, door `open` reaches 1 within 1.2 s.
2. Drive into the alcove: hero y goes above `WALLY`; an enemy spawned at the
   mouth walks in too (its y goes above `WALLY`).
3. Touch the prisoner -> `localStorage['wipecheck.shade']==='1'`, `shade`
   awarded, `S.h.dps.cls==='rogue'`, name on the frame reads Shade, bow gone
   from the weapon slot, hp full.
4. Space -> the Shade moved >= 150 px and an enemy on the path took a crit.
5. `WC.openLevel()` shows no arrow upgrades and at least one rogue one.
6. New run: four role cards; picking the fourth starts with `cls==='rogue'`.
7. Online: host frees the Shade -> guest's `S.h.dps.cls==='rogue'`, guest
   `localStorage` unlock set, guest sees the door open (`secret.open===1`).
8. Solo and multiplayer suites unchanged; `century` awards at kill 100.
