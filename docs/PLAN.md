# Phase 1 Implementation Plan

> Name: **cromatica** (D49).

A client-side web app that generates abstract gradient wallpapers, inspired by photogradient.com but with richer algorithms, perceptual color math and crisp device-targeted exports. Phase 1 covers a single monitor only.

See [DECISIONS.md](DECISIONS.md) for the reasoning behind each choice and [ROADMAP.md](ROADMAP.md) for the detailed milestone skeleton and later phases.

---

## Core rules

1. **The image depends only on the design and the pixel position.** The same design and pixel always give the same output. This is what makes the preview match the export, keeps tiled exports free of seams, and makes a saved design reproducible.
2. **Composition coordinates:** the image height is always 1 unit and the origin is at the center. Width is set by the aspect ratio. Changing the aspect ratio reveals more (or less) on the sides and never distorts.
3. **Resolution only matters at export ("render quality").** The only pixel-level effects are grain and dither.
4. **One pipeline with swappable steps:** _reposition_ (transform, warp, flow) → _pattern_ → _color_ → _finish_ (grain, dither, encode).

Internally, an export is "a rectangle over the composition", so multi-monitor support can be added later without a rewrite.

## Stack

| Concern          | Choice                                                          |
| ---------------- | --------------------------------------------------------------- |
| Build            | Vite + TypeScript                                               |
| UI               | Svelte 5                                                        |
| Rendering        | WebGL2 + raw GLSL + twgl.js                                     |
| Color math (CPU) | culori (Oklch, gamut mapping)                                   |
| State validation | zod                                                             |
| Compression      | Native `CompressionStream` (PNG encoder, share URLs)            |
| Tests            | Vitest (math); Playwright + headless Chrome (image comparisons) |
| Hosting          | Static host, no backend                                         |

## Modules

### `design`

- The saved design, validated by a versioned schema: seed, color stops (Oklch floats), pipeline steps and their parameters, aspect ratio, export settings, `engineVersion`.
- Undo/redo, with a slider drag counted as one step.
- Autosave to browser storage as a **best-effort cache only**, with no sync or backup. If browser data is cleared, the design is gone.
- Share links: design JSON compressed and base64url-encoded into the URL hash.

### `color`

- Oklab/Oklch conversion.
- Blend modes for each segment between stops:
  - Oklab (default)
  - Chroma-preserving Oklab, which keeps saturation through the middle of complementary blends
  - Oklch with short or long hue path
- Monotone cubic spline between stops, which avoids Mach bands at stop points.
- Gamut mapping into sRGB by reducing chroma at constant L and h.
- Gradient precomputed into an RGBA16F lookup texture (~4096 entries, linear RGB).
- Harmony generator (analogous, complementary, split-complementary, triadic, tetradic) with even lightness steps and chroma set relative to the maximum in-gamut chroma for each hue.
- Curated palette library and palette from image (see M4).

### `engine`

- GLSL library: integer hashes (PCG), simplex noise, fBm, Worley, curl, Oklab conversion, cheap in-shader gamut clip, grain, blue-noise dither.
- Each combination of pipeline steps compiles to its own cached shader variant via `#define`s. Continuous parameters are uniforms, so slider moves never trigger a recompile. Use `KHR_parallel_shader_compile` where available.
- `render(design, target, tile)`: the single entry point shared by preview and export.
- Output order: linear RGB → sRGB transfer curve in the shader → dither → quantize.

### `preview`

- Main-thread canvas that redraws only when something changes (at most one draw per `requestAnimationFrame`).
- Adaptive resolution: about 0.5× while dragging, full device pixel ratio after roughly 150 ms idle.
- 1:1 loupe that renders a small tile at export resolution, so grain can be judged accurately.
- Dither is applied in the preview as well.

### `export`

- Runs in a Worker on an OffscreenCanvas with its own WebGL2 context. The UI never freezes, and the user gets progress and a cancel button.
- Tiled rendering at about 2048 px per tile, with a GPU sync after each tile.
- **PNG:** custom streaming encoder that sends filtered scanlines through `CompressionStream('deflate')` to produce the IDAT chunk.
- **JPEG:** tiles assembled on an OffscreenCanvas, then encoded with `convertToBlob`.
- The live preview pauses while an export is running.

### `ui`

- Floating control panel over the canvas.
- Drag handles on the canvas for the color-point mesh.
- Device/aspect-ratio picker, shuffle controls, preset gallery.

## Phase 1 algorithms

- **Base pattern:** linear, radial, color-point mesh (radial-basis-function point field: draggable points blended in Oklab), fBm noise, Worley cells, aurora ribbons.
- **Distortion:** none, domain warp (0–3 levels deep), curl flow (integrated inside the shader in a single pass).
- **Finish:** film grain (strength, size, stronger in midtones), blue-noise dither (always on, not shown to the user).
- **Transform:** rotation, scale, offset, frequency, octaves.

## Milestones

| #      | Milestone                                                                                               | Notes                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | **Export pipeline spike:** one linear gradient → tiled 5K export in a Worker → custom PNG encoder       | The riskiest part, so it comes first. Tests: a tiled render is pixel-identical to a single-pass render, and the preview matches the export at 1:1. |
| M1     | Color system: stops, lookup texture, blend modes, spline, dither                                        | Everything else builds on it                                                                                                                       |
| M2     | Color-point mesh + on-canvas drag handles                                                               | Headline feature                                                                                                                                   |
| M3     | **The look:** warp stage (catalogue of shapes), film grain, basic shuffle                               | Re-planned after M2 (D22)                                                                                                                          |
| M4     | Palettes: curated library, Remix, **palette from image**                                                | See ROADMAP                                                                                                                                        |
| M5     | Patterns: fBm, Worley, aurora, grid Bézier mesh                                                         | Visual variety                                                                                                                                     |
| M6     | Saving: undo/redo, autosave cache, share links                                                          |                                                                                                                                                    |
| M7     | Keep and explore: design in the PNG, history and favourites, More like this, visual pickers, onboarding | Added 2026-10-05; see ROADMAP                                                                                                                      |
| M8     | Relief and stipple finishes                                                                             | Added 2026-10-05                                                                                                                                   |
| M9     | Context preview and legibility (Windows, macOS, Android, iOS)                                           | Added 2026-10-05                                                                                                                                   |
| M10    | Light/dark pairs                                                                                        | Added 2026-10-05                                                                                                                                   |
| M11    | Effects: bold bands, brushed warp, bicubic patch mesh                                                   | Split from Polish 2026-10-08 (D58)                                                                                                                 |
| M12    | UI decisions: blend, relief, noise/print/halftone, showcase examples                                    | Split from Polish (D58)                                                                                                                            |
| M13    | Performance and UX: preview resolution, full-screen, context loss, warm-up, shortcuts                   | Split from Polish (D58)                                                                                                                            |
| M14    | Lean panel: status bar trial                                                                            | Parallelizable (D58)                                                                                                                               |
| M15    | Mobile layout: the editor usable on phones and tablets                                                  | Added 2026-10-07 as M12; after M14 (D55, D58)                                                                                                      |

### M3/M4 — Palette shuffle (split: basic shuffle in M3, curated, Remix and from-image in M4)

- **Curated library:** 50–100 hand-picked palettes stored as Oklch, each with a name and tags (warm, pastel, dark, neon, earthy…), bundled as a static file.
- **One shuffle button with three modes:**
  - **Curated** (default): picks a random palette from the library.
  - **Remix:** keeps how the current palette's colors relate to each other but shifts hue, lightness or saturation.
  - **Generate:** builds a new palette from the harmony rules.
- **Lock toggles:** shuffle colors only, or layout only (point positions, warp, seed).
- Each shuffle uses a seed, is a single undo step, and can be shared by link.
- No user-saved palettes in Phase 1.

## Device presets

Verify exact values during implementation.

- **Mac:** MacBook Air 13" 2560×1664 · MacBook Air 15" 2880×1864 · MacBook Pro 14" 3024×1964 · MacBook Pro 16" 3456×2234 · Studio Display 5120×2880 · Pro Display XDR 6016×3384
- **Monitors:** 1920×1080 · 2560×1440 · 3840×2160 · 3440×1440 · 5120×2160
- **Mobile:** current iPhone and iPad Pro native resolutions
- **Custom:** width × height in pixels

Picking a preset sets both the aspect ratio and the default export resolution. Presets always use the native panel resolution, never the scaled "looks like" resolution.

## Automated checks

- Color math matches culori's reference values within a small tolerance.
- Tiled renders are exactly identical to single-pass renders.
- Golden-image tests for each algorithm, with a tolerance for GPU differences.
- Designs saved with an older schema version still load after migration.

## Deferred to later phases

- Multi-monitor arrangement (displays modelled as aspect ratio + physical size + position)
- Bicubic patch mesh gradient (Figma/SwiftUI-style bendable grid)
- Display P3 output
- 16-bit PNG
- mozjpeg (WASM) for 4:4:4 JPEG
- WebGPU backend
- User-saved palettes
