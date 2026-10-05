# Handover — 2026-10-04

Where things stand at the end of the day, and what to pick up next. The long-lived references are [PLAN.md](PLAN.md), [ROADMAP.md](ROADMAP.md) and [DECISIONS.md](DECISIONS.md) (now up to D36); this file is only the bridge to the next session and can be deleted once it's been read.

## State

- **Branch:** `main`, at `ded2e25` (merge of PR #2). M4 merged earlier as PR #1 (`e5a9d11`). Both feature branches are pushed; nothing is waiting to be committed except this file.
- **Remote:** `github.com/zepocas/wallpaper-gen` (private).
- **Checks at last run:** 207 unit tests, 191 browser tests (5 opt-in skipped), lint, Prettier and the type check all pass.
- **Not ours:** `prototype/stipple/` and `prototype-stipple.html` are untracked work of the R&D agent (a stipple / riso halftone prototype). Leave them alone. They make `npm run lint` report one parse error; `npx eslint src tests` is clean.

## Done today

- **M4 finished and merged (PR #1):** palette from image (D25), value key (D26), warm/cool temperature and live base hue as reversible adjustments with an indicator and reset (D27), the mood/key round-trip fix (palettes regenerate from their seed, D28), and four new moods: muted, earthy, pastel, neon (D30). Proportion (60-30-10) was built and dropped (D29).
- **Code quality pass:** ESLint and Prettier; color, design, engine, export and UI modules restructured (`PaletteEditor`, section components, shared controls); browser specs split by feature with a fail-on-page-error fixture and a deterministic `data-settled` preview signal. Same seed still gives the same palette (verified on 1,200 cases at the time).
- **M4.5 finished and merged (PR #2):**
  - Warp shapes **silk** and **marble** (D31) and **brushed** (D35). Kaleidoscope and smudge were built and pruned.
  - **Radial** and **conic** gradients sharing one ramp with linear (D32); conic has a smooth seam and a soft core.
  - Finishes: **bands** with an **edge** softness slider for every style, in the main controls (D33); **vignette** and **print texture** (litho to xerox, D36) under "+ more".
  - **Warp size** moved to the main controls; **blend** reaches near-hard edges at the top (D34).

## User preferences learned today

- Controls must act on the current image right away, and be reversible. Settings that only affect the next shuffle read as broken (temperature and base hue were reworked for this).
- Prefers judging looks by eye: contact sheets and app screenshots in `~/Pictures/test/` worked well for tuning and pruning.
- Happy to prune what doesn't earn its place (proportion, kaleidoscope, smudge).
- Likes bands as they are; the stronger mesh-band options are parked in the backlog.
- May cut brushed later.

## Open items

- **Check by eye:** the conic seam (smooth for now, D32) and the print texture across palettes.
- **Not built:** Voronoi edges (the optional M4.5 warp).
- **Roadmap header:** M4.5 is complete but its heading isn't marked ✅ yet.
- **Backlog notes added today:** bolder mesh bands (lightness, top-two blend, contour lines); palette from image could weight colorful pixels so small accents survive.

## Next: M5, pattern variety

From ROADMAP: fBm noise fields, Worley cells, aurora ribbons, the grid Bézier mesh, **Planes** (collage of seeded flat-color polygons with torn edges, pairs with print texture) and, added today at the user's request, **Digital / glitch** (hashed block displacement, scanline offsets, RGB channel split; per pixel and stateless, so no true pixel sorting or datamoshing). Start by asking which of these comes first.

## Working notes

- Commands, test selectors and panel style are in the README's Development section. `BENCH=1` adds benchmarks; `SHEETS=1 SHEETS_DIR=… npx playwright test sheets` writes warp contact sheets and shuffle screenshots.
- **The R&D agent edits `docs/ROADMAP.md` while work is in progress.** Before committing docs, check `git diff -- docs` and stage only your own hunks; never `git add docs` blindly. Its M4.5 update once got swept into an unrelated commit (`d3a390c`; the user chose to leave the history as is).
- Running Prettier while the Playwright dev server is up can reload the page mid-test ("execution context was destroyed"); rerun the test.
- New warp shapes and shader constants: define constants once in `warp.ts` and inject them through `WARP_SHADER_CONSTANTS`; shader chunk order matters (the finish chunk must precede the base patterns).
- **Commits:** plan first, commit after an explicit OK; one commit per milestone step. Milestones merge through a PR.
