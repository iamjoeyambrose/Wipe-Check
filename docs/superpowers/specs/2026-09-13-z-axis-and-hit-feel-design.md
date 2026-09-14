# Z axis and hit-feel — design

Phase 1 of the "more depth, bigger animation" push. Camera angle stays as it
is; the world gains height and weight.

## Goals

- Everything that can leave the floor does: launched enemies, flung corpses,
  bouncing gems, dropped chests, arcing arrows.
- Every impact is felt: hit-stop scaled to the blow, squash-and-stretch on the
  struck body, a directional camera kick, weighted damage numbers.
- No rewrite. Depth sorting, collision, atlases, bots and tests all keep
  working; the Z axis is additive.

## Non-goals

- Camera rotation, true 3D, WebGL.
- Room volume (occluding pillars, parallax, long shadows) — Phase 2.
- Ability cinematics (Shockwave floor cracks, Volley rain, Benediction pillar,
  boss entrance) — Phase 3. Shockwave's *launch* is in scope; its VFX is not.

## The model

Every actor and pickup gets `z` (height above the floor, px) and `vz` (px/s).

- `physics.js` integrates: `vz -= G*dt; z += vz*dt`; on crossing `z<=0` the
  object lands: `z=0`, and if `|vz|` was above a bounce threshold it bounces
  with `vz = -vz*restitution` (one meaningful bounce, then rest). Landing
  fires a callback so callers can dust, thud, stagger.
- `launch(o, vz, dirX, dirY, push)` sets `vz` and an optional horizontal
  carry (`ax, ay`) that decays while airborne — the thing flies *along* the
  blow, not only up.
- Collision and targeting keep using `(x, y)` on the floor. An object with
  `z > AIR` (a few px) is **airborne**: arrows pass under it, melee ignores
  it, it deals no contact damage. This is what makes launches read as real
  and gives crits a crowd-control role.
- Drawing splits: shadow at `(x, y)` scaled by `1/(1+z/90)` and faded with
  height; body at `(x, y - z)`. Sort key stays `y`.

## What goes up

| Trigger | Effect |
| --- | --- |
| Crit | target launched, `vz` scales with damage (clamped); lands with a dust ring and a short stagger to enemies within 40px |
| Knockback (Bulwark talent) | target popped up and carried along the blow instead of slid |
| Shockwave | every enemy in the ring launched, delay proportional to distance so it ripples outward |
| Kill | corpse tumbles along the killing blow with rotation, bounces once |
| Gems | burst upward out of the corpse, rain down, settle with a tiny bounce |
| Chest spawn | drops from above the screen, lands hard: thud, dust, camera kick |
| Rez / Second Wind | the hero hops up onto their feet |
| Arrows | low arc; on a miss they stick in the floor at an angle and fade |
| Caster bolts | float at chest height (draw offset only) |

## Hit-feel

- **Hit-stop** through one helper `impact(strength)` in combat: normal hit
  ≈ 0.02s, crit 0.06s, elite kill 0.09s, boss kill 0.45s with a slow zoom.
  All existing ad-hoc `rt.freeze` writes route through it.
- **Squash-and-stretch**: every actor carries `sq` (scale x/y, decays to 1)
  and `rot`. A struck enemy flattens along the blow and springs back; the
  attacking hero stretches into the swing. Atlas gets `blitSquash`.
- **Camera kick**: `rt.kick = {x, y}` nudges the camera along the blow and
  eases back (spring). `rt.shake` stays for slams and boss stomps.
- **Damage numbers**: crits render larger and drop with a bounce; numbers
  above a threshold scale with magnitude.
- **Anticipation**: hero rigs pull back for a few frames before a swing.
- Reduced-motion: no hit-stop, no camera kick; squash and Z stay.

## Where it lives

- `src/physics.js` — `G`, `AIR`, `step(o, dt, onLand)`, `launch(...)`,
  `airborne(o)`.
- `src/simulation.js` — steps enemies, gems, chests, corpses, bullets;
  airborne checks in collision.
- `src/combat.js` — `impact()`, launches from crit/knockback/kill/Shockwave,
  squash on hit, kick on hit.
- `src/art/atlas.js` — `blitSquash`; `src/art/render.js` — shadow/body split,
  squash and rotation, kick applied to the camera, stuck arrows, bolt lift.
- `src/art/rigs-heroes.js` — anticipation from `h.swing` timing.
- `src/state.js` — `rt.kick`, `rt.zoom`; actors get `z, vz, ax, ay, sq, rot`.
- `src/flow.js` — chest drop-in on spawn (via `spawnChest`).

## Testing

- Node unit test for `physics.js`: launched object returns to `z=0`, bounces
  once, then rests; `airborne` flips at `AIR`.
- Playwright: a forced crit on a grunt yields `z>0`; an arrow fired at an
  airborne grunt does not damage it; a spawned chest starts at `z>0` and
  lands; kills still accrue in the smoke test.
- Existing suite: arrows, rez, relics, smoke on dist and ESM; sound levels
  unchanged.

## Out of scope for this spec, noted for Phase 2/3

Occluding tall props, parallax foreground/background, directional shadows,
corner fog; Shockwave floor cracks, Volley rain with ground shadows,
Benediction pillar, boss entrance letterbox and pan, level-up zoom punch,
kill-streak text.
