# Roadmap

> **Status: WIP.** This is a skeleton to fill in as we go. Scope, criteria and open questions will change as milestones are worked through. Decisions that get made should move into [DECISIONS.md](DECISIONS.md).

Each milestone uses the same structure:
- **Goal:** why the milestone exists
- **Scope:** what gets built
- **Done when:** exit criteria
- **Open questions:** things to decide before or during the milestone

---

## Phase 1 — Single-monitor generator

### M0 — Export pipeline spike
- **Goal:** prove the riskiest part first. A render must look the same in preview and export, tile without seams, and export at 5K+ without freezing the UI.
- **Scope:**
  - Vite + TypeScript + Svelte 5 project setup
  - Minimal WebGL2 renderer drawing a single linear gradient
  - `render(design, target, tile)` entry point
  - Export Worker using OffscreenCanvas
  - Tiled rendering with a GPU sync after each tile
  - Custom streaming PNG encoder built on `CompressionStream`
- **Done when:**
  - A 5120×2880 PNG exports while the UI keeps responding
  - A tiled render is pixel-identical to a single-pass render
  - The preview matches the export at 1:1
  - The PNG opens correctly in macOS Preview, Chrome and Photoshop/GIMP
- **Open questions:**
  - Tile size: 1024 or 2048?
  - Does JPEG need tiling at all at 6K on desktop browsers?
  - How much memory does a 6K export use at its peak?

### M1 — Color system
- **Goal:** blend colors perceptually, with no gray midpoints and no banding.
- **Scope:**
  - Oklab/Oklch conversion
  - Stop model (Oklch floats)
  - Blend modes chosen per segment
  - Monotone cubic spline between stops
  - Gamut mapping into sRGB
  - RGBA16F lookup texture
  - Transfer curve in the shader, then blue-noise dither
  - Basic UI for editing stops
- **Done when:**
  - Math tests match culori
  - Complementary blends stay saturated in chroma-preserving mode
  - A dark, shallow gradient shows no visible banding in an 8-bit export
- **Open questions:**
  - Lookup texture size
  - Default blend mode
  - How many stops at most?
  - Should the stop editor show a lightness curve?

### M2 — Color-point mesh
- **Goal:** the headline feature, a mesh gradient you edit by dragging colored points.
- **Scope:**
  - Radial-basis-function point field blended in Oklab
  - Radius and falloff per point
  - Sharpness control (soft haze to blobby)
  - In-shader gamut clip
  - Drag handles on the canvas to add, remove and move points
- **Done when:**
  - Dragging a point stays at 60 fps on an integrated GPU
  - Blends never show clipping artifacts
- **Open questions:**
  - Maximum number of points (a uniform array limit)
  - Can points sit outside the visible frame?
  - Handle design and how to hide handles

### M3 — Distortion
- **Goal:** the biggest jump in visual quality, turning flat blends into organic, liquid shapes.
- **Scope:**
  - Domain warp (0–3 levels deep)
  - Curl flow integrated in a single shader pass
  - Transform controls (rotation, scale, offset, frequency, octaves)
  - Shader variant builder and cache
- **Done when:**
  - Every distortion works with every base pattern
  - Switching variants doesn't visibly stall the UI
  - Integrated GPUs stay within the preview frame budget, with adaptive resolution helping
- **Open questions:**
  - Number of curl-flow steps versus cost
  - Which parameters to show versus hide as presets
  - Octave limits

### M4 — Pattern variety
- **Goal:** widen the aesthetic range beyond gradients and meshes.
- **Scope:** fBm noise (plain, ridged, billow), Worley cells (F1, F2, F2−F1, smooth), aurora ribbons (additive, blended in linear light).
- **Done when:** each pattern has golden-image tests and at least 3 good-looking reference designs.
- **Open questions:**
  - Should aurora have its own ribbon-count and palette controls?
  - How far should Worley go toward caustics?

### M5 — Finish, harmony and shuffle
- **Goal:** the creative loop: shuffle, adjust, export.
- **Scope:**
  - Film grain: strength, size, stronger in midtones
  - Harmony generator
  - Curated palette library (50–100 palettes, tagged)
  - Shuffle modes: Curated, Remix and Generate
  - Lock toggles: colors only or layout only
  - Seeded random generator
- **Done when:**
  - 10 shuffles in a row mostly produce results worth keeping
  - Every shuffle can be undone and shared
- **Open questions:**
  - Who curates the palettes, and from what sources (licensing)?
  - Tag vocabulary
  - How strong should Remix variation be?

### M6 — Saving
- **Goal:** never lose work within a session, and make designs shareable.
- **Scope:**
  - Versioned design schema (zod) with migrations
  - `engineVersion` recorded in each design
  - Undo/redo, with a slider drag counted as one step
  - Autosave to browser storage as a best-effort cache
  - Share links: compressed into the URL hash
- **Done when:**
  - A reload restores the design exactly
  - A share link reproduces the design exactly on the same machine
  - An old-schema fixture still loads
- **Open questions:**
  - localStorage or IndexedDB?
  - Undo history depth
  - URL length limits for large meshes

### M7 — Polish
- **Goal:** ready for real use.
- **Scope:**
  - Device preset list
  - Custom pixel sizes
  - 1:1 loupe
  - Adaptive preview resolution tuning
  - Export progress and cancel
  - Context-loss recovery
  - Shader compile warm-up
  - Keyboard shortcuts
- **Done when:**
  - Tested on Chrome, Safari and Firefox on macOS, and Chrome on Windows
  - Exports at every preset resolution succeed
- **Open questions:**
  - Final device preset list (verify native resolutions)
  - Hosting
  - Product name (currently a placeholder)

---

## Phase 2 — Multi-monitor (sketch)
- A canvas for arranging displays. Each display is modelled as aspect ratio + physical size (from its diagonal) + position.
- A single composition spans the whole arrangement. Optional bezel-gap compensation.
- The export produces one aligned wallpaper per display, each at its native resolution.
- **Open questions:**
  - Presets for common setups
  - How to handle rotated (portrait) monitors
  - Download as a ZIP?

## Later — Backlog (unordered)
- Bicubic patch mesh (Figma/SwiftUI-style bendable grid)
- Display P3 output, as an internal flag with no UI
- 16-bit PNG export
- mozjpeg (WASM) for 4:4:4 JPEG
- WebGPU backend
- User-saved palettes
- Mobile authoring
