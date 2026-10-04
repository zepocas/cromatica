# gradient-wallpaper

> Working name, a placeholder until we find a better one.

A client-side web app that generates abstract gradient wallpapers at crisp, device-native resolutions. It adds perceptual (Oklab) color blending, domain warping, flow and cellular noise, and blue-noise dithering to remove banding.

Phase 1 is in progress; see the roadmap for where things stand.

- [Phase 1 plan](docs/PLAN.md)
- [Design decisions](docs/DECISIONS.md)
- [Roadmap (WIP)](docs/ROADMAP.md)

## Development

- **Run:** `npm run dev`. `?default` in the URL skips the opening shuffle (the UI tests rely on it).
- **Checks:** `npm test` (vitest), `npm run check` (svelte-check plus tsc), `npx playwright test` (about 2 min, SwiftShader). The 5K warp benchmark can stall under load; rerun it alone before treating a timeout as a regression.
- **Test selectors:**
  - Many controls are behind "+ more", so tests click `More adjust settings` or `More colors settings` first.
  - Use `{ exact: true }` for labels that are substrings of others ("Harmony" and "Keep harmony", "Rotate" and "Rotate left").
- **Panel style** (`src/app.css` under `.panel`): monochrome, monospace, lowercase labels; `[ bracketed ]` buttons and glyph icons; sections via `src/ui/Section.svelte`; new controls go behind "+ more" unless they're core.
- **Commits:** one commit per milestone step, Conventional Commits.
