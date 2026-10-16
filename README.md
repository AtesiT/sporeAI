# THALASSA — a cell-stage evolution game

A single-file browser game in the spirit of Spore's Cell Stage: you start as
LUCA, the last universal common ancestor, and eat your way up 20 stages of
real biological history until you are a great white shark, a blue whale, an
orca, a whale shark or a megamouth.

**Play it:** open [`index.html`](index.html) in any modern browser. No server,
no build step, no network access, nothing to install.

- 265 KB, one file, zero dependencies
- every pixel drawn procedurally with the Canvas 2D API
- every sound synthesised at runtime with the Web Audio API
- vanilla ES6+, no libraries, no image or audio assets

---

## Controls

| Input | Action |
| --- | --- |
| Mouse / touch | Swim — the body steers toward the cursor, inside a small dead zone |
| `Space` or right mouse | Burst swim (burns stamina, refills when you glide) |
| `E` | Open the evolution panel once you can afford it |
| `1` `2` `3` / click | Pick an evolution card |
| `R` | Respawn after dying |
| `P` / `Esc` | Pause |
| `M` | Mute |

Everything else is automatic: you eat whatever fits inside your gape
(`0.82 ×` your body radius), and anything that reaches `1.22 ×` yours eats
*you*. Predators only ever spawn up to `0.74–0.88 ×` your top speed and prey
up to `0.82 ×`, so nothing is uncatchable and nothing is inescapable.

## The loop

1. **Eat.** Drifting particles, algae, copepods, jelly, squid — whatever your
   size class allows. Each mouthful pays DNA.
2. **Grow.** DNA buys an evolution at the current stage's price.
3. **Choose.** Every evolution is a fork with two or three real biological
   options — flagella or chemosynthesis, chitin armour or a notochord,
   endothermy or a lateral line. Each one grants traits, not just a bigger
   number, and each one changes what the next fork offers.
4. **Descend.** Your body plan limits how deep you can go
   (`clamp(r × 108, 2400, 25960)`), so growing is what unlocks the twilight,
   midnight and abyssal zones — and the food and the threats in them.
5. **Die, or win.** Death returns you to your last evolution checkpoint with
   40% of your DNA. Reaching a final form ends the game with a lineage screen.

## Evolution tree

36 nodes: a 20-stage spine, 11 detours and 5 final forms, all reachable.

```
LUCA ─ fermenter ─ eukaryote ─ ciliate ─ colony ─ placozoa ─ cnidarian
       └ vent      └ amoeba    └ volvox   └ sponge  └ bilateral ─ annelid
         photo       osmo                            └ arthropod
                                                          │
     chordate ─ jawless ─ placoderm ─ shark ─ giantshark ─┤
        └ rayfin      └ ostracoderm    └ predator ─ raptorial
          lobe                            └ school
                                              │
                    archaeocete ─┬─ great white shark
                                 ├─ baleen whale
                                 ├─ orca
                                 ├─ whale shark
                                 └─ megamouth
```

Ranges across the spine: radius 6 → 232, HP 12 → 2100, speed 36 → 114,
sense 250 → 1300, bite 1.4 → 340, evolution cost 12 → ~920.

## How the code is organised

`index.html` is **generated**. Edit the parts, then rebuild:

```sh
cd build && node build.js      # writes ../index.html
```

| File | Contents |
| --- | --- |
| `00_head.html` / `99_tail.html` | document shell, CSS, HUD markup |
| `01_core.js` | `CFG` (every tunable constant), math utils, `mulberry32`, `hash2`, `pickWeighted`, object pool |
| `02_stages.js` | `STAGES` — the 36 evolution nodes and their choices; `TRAIT_INFO` |
| `03_specs.js` | `EDIBLES` — 53 creature and particle species; `ZONES` — the four depth biomes and their spawn tables |
| `04_sound.js` | Web Audio synthesis: ambient beds, eating, damage, evolution, pressure |
| `05_vis_a.js` / `06_vis_b.js` | procedural pixel-art bodies (archetype + additive layers) and the sprite cache |
| `07_world_entities.js` | chunk streaming, spawn tables, the DNA economy, `Food` / `Creature` AI |
| `08_player.js` | the player body, trait recomputation, `dnaFor()`, camera, particles |
| `09_render.js` | the two-canvas pixel pipeline: water, light, fog, rays, entities, HUD sprites |
| `10_ui.js` | HUD, evolution panel, death and victory screens, toasts |
| `11_game.js` | input, the state machine, collisions, the depth gate |

Nothing is hardcoded per stage. A stage is a row of numbers plus a list of
choices; a species is a row of numbers plus a visual descriptor; a trait is a
key that `Player.recompute()` and the renderer both understand. Adding a stage,
a species or a trait is a data edit, not a code change.

### The DNA economy

The one number everything hangs off is `CFG.DNA_MEALS_PER_STAGE`. A stage costs

```
unit  = cost(stage) / meals(r)          meals(r) = 30 × (r / 6)^0.35
meal  = unit × richness^0.55 × bodyFactor × (particle ? foodMul(r) : 1)
```

`unit` is derived from the stage's own price, so the curve cannot drift as
stages get more expensive. `bodyFactor` is shared between the spawner and the
scorer and is normalised so an *average* mouthful is worth exactly one unit —
computed from the same reweighted spawn table the world actually uses, not from
an idealised one. Encounter rate grows with body radius (reach × speed), so the
mouthful count grows as `r^0.35`: a bacterium needs a couple of dozen cells, a
whale about eighty mouthfuls of krill, and either takes about half a minute.

Particles are worth a full meal at r = 6 and almost nothing by r ≈ 200, so the
diet shifts from grazing to hunting as you grow — and a whale cannot vacuum the
ocean into an evolution.

## Verification

There is no browser binary in CI, so `build/_harness.js` fabricates a DOM, a
Canvas2D recording proxy and a Web Audio stub, then **runs the real game code**
and drives it with a requestAnimationFrame pump:

```sh
node build/_harness.js
```

It checks: boot and title flow; a 900-frame hunt from a fresh game; a per-stage
economy table (31 nodes); **PACE** — a complete playthrough that has to *earn*
every point of DNA and must reach a final form; a mechanical 12-evolution
playthrough; death and respawn (checkpoint stage and 40% DNA retained); a depth
sweep of all four zones; the pressure gate; pause and mute; two resizes; a walk
of all 36 nodes rendering every choice preview; 1272 bestiary render passes;
and frame-time percentiles. Any exception, `NaN`, or failed assertion is
collected and printed at the end:

```
=== PROBLEMS (0) ===
  none
```

Current results: PACE reaches `VICTORY` with 0 deaths; the mechanical
playthrough reaches `d_greatwhite`; frame time median 1.6 ms, p95 2.2 ms;
~455 entities and ~65 chunks resident; every zone stocked.
