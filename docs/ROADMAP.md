# Roadmap

> **Status: WIP.** This is a skeleton to fill in as we go. Scope, criteria and open questions will change as milestones are worked through. Decisions that get made should move into [DECISIONS.md](DECISIONS.md).

Each milestone uses the same structure:

- **Goal:** why the milestone exists
- **Scope:** what gets built
- **Done when:** exit criteria
- **Open questions:** things to decide before or during the milestone

---

## Phase 1 — Single-monitor generator

### M0 — Export pipeline spike ✅

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
- **Outcome:** all criteria met (SwiftShader timings, so real GPUs will be faster).
  - 5K PNG export: about 0.45 s; the output is identical to a single-pass render.
  - Longest UI frame gap during the export: 16.7 ms, with no long tasks.
  - macOS reads the 5K PNG as 5120×2880, 8-bit RGB, sRGB.
- **Resolved:** tile size is 2048 (D16); the PNG filter is Up (D17).
- **Still open:**
  - How much memory does a 6K export use at its peak?
  - JPEG currently assembles the whole image on one 2D canvas. Check this at 6K+ in Safari.
  - Not yet checked in Photoshop/GIMP.

### M1 — Color system ✅

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
- **Outcome:** all criteria met.
  - Color math matches culori (conversions within 1e-9, gamut mapping within ΔE 0.0013). Baking the ramp takes about 1.5 ms.
  - In "Vivid" mode, blue↔yellow keeps at least 90% of its chroma. In "Perceptual" mode it drops below 50%.
  - Dark shallow gradient: the longest flat run falls from 1023 px to 23 px with dither, and the 16×16 block error from 0.28 to 0.008 LSB.
- **Resolved:** the lookup texture has 4096 entries (fewer when the GPU's texture limit is smaller); the default blend is Perceptual; at most 8 stops; no lightness curve for now. See D18 and D19.
- **Still open:**
  - A 5K PNG export now takes about 3.8 s in SwiftShader, because dither noise compresses poorly and `CompressionStream` has no level setting. Consider a faster deflate (for example fflate at a low level) in M13.
  - The ramp size differs slightly on GPUs whose MAX_TEXTURE_SIZE is below 4096.

### M2 — Color-point mesh ✅

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
- **Outcome:** all criteria met (SwiftShader timings).
  - 5K mesh export is byte-identical to a single-pass render. Rendering 16 points takes 235 ms at 3456×2234 and 452 ms at 5120×2880. Out-of-sRGB colors are mapped the same way as in the linear ramp.
  - Handles line up with the rendered blobs to within 1 CSS px at 16:9, ultrawide and 1:1, after a resize and after a drag.
- **Resolved:** up to 16 points; points may sit off-frame, shown as clamped edge indicators (the UI limits positions to the frame plus 0.5 units); H hides the handles. See D20 and D21.
- **Still open (to tune):**
  - **Size is relative:** weights are normalized and there is no background color, so a point's size only matters relative to the other points. If every point is small, you get flat cells instead of separate blobs. Consider an absolute falloff or a background color.
  - The "Defined" end of the Blend slider gives cell-like regions with straight borders rather than round blobs. That may be fine, but review it with real use.
  - **Panel overlap:** the floating panel can cover point handles (the default mesh's first point sits under it). Make the panel collapsible or movable (M14).

> **Re-plan (after M2):** a comparison with photogradient.com showed that most of its look comes from three things: strong film grain, a menu of warp shapes, and shuffled, natural-looking palettes. Those moved forward into M3. Curated palettes and palette-from-image are now M4, and the remaining patterns are M5. See D22.

### M3 — The look: warp, grain, shuffle ✅

- **Goal:** match photogradient's look, then go beyond it.
- **Scope:**
  - **Warp stage** (coordinate distortion before the base pattern, for both gradient and mesh).
    - An _experimental catalogue_ of shapes: domain warp, FBM, simplex, value noise, waves, rows, columns, circular, oval, Worley, Voronoi, gravity, curl flow.
    - Controls: Warp (strength), Warp size (scale), and a seed ("new variation").
    - We expect to prune shapes that don't earn their place.
  - **Film grain** (finish stage): amount and size, stronger in midtones, defined per output pixel, applied before dither.
  - **Basic shuffle:**
    - A seeded random generator.
    - A harmony palette generator: random rule, lightness spread, chroma relative to the maximum in gamut, with a lean toward natural, muted palettes.
    - Randomizes layout: mesh points and radii, gradient angle, and warp shape, amount, size and seed.
    - Locks for colors only and layout only.
- **Done when:**
  - Every warp shape renders tile-identically and works with both base patterns.
  - A contact sheet of all shapes has been reviewed and pruned.
  - Grain looks the same in preview (1:1) and export.
  - 10 shuffles in a row mostly give results worth keeping.
- **Outcome:** all criteria met.
  - Every warp shape tiles byte-identically on both patterns, including 5K exports.
  - The GPU matches the CPU reference within ±1, except curl (±3 on one pixel), whose integration amplifies fp32 error.
  - Grain is unbiased, and pure black and white stay exact.
  - Natural shuffles read like photogradient.
- **Resolved:**
  - `value` and `gravity` were pruned, leaving 12 shapes (D23).
  - Grain has a small chroma component (0.2× luma).
  - Default grain amount is 0.35.
  - Space shuffles everywhere except text, number and color inputs, selects and editable content.
- **Still open:**
  - Vivid palettes with 5–6 colors can look garish (tune in M4).
  - Grain in the preview differs from the export at DPR below 1 (the 1:1 loupe was dropped from M11, 2026-10-08).
  - `warpPoint` ignores aspect (seeded centers sit in a 16:9 box).

### M3.5 — UI refinement (photogradient-style panel) and transforms ✅

- **Goal:** a simpler panel organized like photogradient's, plus the basic whole-image transforms that are missing.
- **Scope:**
  - **Panel order:**
    1. Gradient (pattern)
    2. Warp shape
    3. Size: device preset plus W×H
    4. Warp, Warp size and Noise sliders
    5. Colors list: swatch and hex per row, with shuffle and add icons
    6. Download
  - **Grain:** a single "Noise" fader; size stays fixed.
  - **Transforms:** rotate (90° steps plus a free angle), zoom and flip. They apply to the whole composition, before the warp.
- **Decided:**
  - **Theme:** the panel stays dark.
  - **Blend slider:** the mesh Blend slider stays.
  - **Undo/redo:** waits for M6.
  - **Random design on load:** the app opens on a full shuffle (palette, layout and warp, natural mood). Once M6 adds autosave, it restores the last design and only shuffles on a first visit.
- **Outcome:**
  - Panel order as planned. Blend (mesh) or Angle (linear) sits with the sliders, and Rotate, Zoom, the 90° turns, the flips and Reset come after them.
  - **Colors list:** each row has a swatch (opens the picker), an editable hex value and a remove button. Selecting a row shows the Lightness, Intensity and Hue sliders, plus Size (mesh) or Blend to the next stop (linear). The header has show/hide points (mesh), shuffle colors only, and add. For linear, the stop strip sits above the rows.
  - "Add" places a mesh point in the emptiest spot of the frame and a stop in the widest gap. The armed "Add point, then click the image" mode is gone, but double-clicking the image still adds a point.
  - Typing a width or height switches the preset to Custom. "Export" is now "Download", with the format next to it.
  - Grain size is no longer exposed and stays at 0.2.
  - Transforms tile byte-identically, and the identity transform is bit-identical to no transform. Flips and quarter turns are exact pixel permutations. Free angles and zoom match the CPU reference within ±2.
  - `?default` in the URL skips the opening shuffle (used by tests).
  - **Look:** a monochrome terminal style. The panel uses one monospace face, lowercase labels, `├─ section ───┤` rules, hairline `───●───` sliders with value readouts, and `[ bracketed ]` buttons. The only color in the panel comes from the wallpaper's own swatches.
  - **"More" disclosures:** the main view keeps gradient, warp shape, size, warp, noise, blend (mesh) or angle (linear), and the color rows. Behind "+ more" sit warp size, zoom, rotation (a slider with ↺ ↻ quarter turns on the same row), the flips and reset (adjust), plus lightness, intensity, hue, point size or blend to the next stop, and showing points (colors).
  - **Docked sidebar:** the panel is a full-height column and the preview letterboxes into the space beside it, so it never covers the wallpaper or the mesh handles. This resolves the M2 panel-overlap note. Collapsing turns it into a one-line floating bar and gives the preview the full width. Shuffle and download stay pinned at the bottom.
  - **Grain in the preview:** the preview only drops to half resolution while editing when a full-resolution frame costs more than 12 ms. Otherwise the grain changed size whenever a slider was held. Grain is now crisp, one speck per pixel (default size 0, was 0.2).
- **Still open:**
  - On slow GPUs the grain still coarsens while dragging (the half-resolution fallback).

### M4 — Color: harmony controls, curated palettes, Remix, palette from image ✅

- **Goal:** make the color theory visible and steerable, and get good colors with less effort.
- **Background:** since M3, every shuffle builds its palette from a harmony rule (monochrome, analogous, complementary, split-complementary, triadic or tetradic) in Oklch. Lightness is spread evenly, chroma is set relative to the maximum in-gamut chroma for each hue, and near-duplicates are rejected. `generatePalette` already accepts `rule` and `mood`, but the UI exposes neither.
- **Scope, in build order:**
  1. **Harmony picker** in the colors section: auto (today's weighted random), monochrome, analogous, complementary, split-complementary, triadic, tetradic. It steers ⟳ and the main shuffle. On auto, show which rule the current palette came from, so a result you like can be pinned.
  2. **Mood toggle:** natural or vivid (today: natural-leaning random). Tune vivid with 5–6 colors first: it currently looks garish (open since M3).
  3. **Base hue (optional):** keep the rule but anchor it on a hue you choose, e.g. "triadic around this blue". Could come from the selected color row.
  4. **Remix:** keep how the current colors relate to each other (hue gaps, lightness order, relative chroma) but shift hue, lightness or saturation. Works on hand-edited palettes too, not just generated ones.
  5. ~~**Curated library:**~~ skipped (see Decided).
  6. **Palette from image:**
     - Fully local in the browser: the image is never uploaded.
     - Picks up to 6 colors with k-means in Oklab, leaning distinct over dominant (D25).
     - Places mesh points where those colors appear in the image.
     - Revisit later: weight colorful pixels so small accents (e.g. a face in a busy photo) survive, and give dominant colors more points rather than only larger ones (ties in with step 9).
  7. **Value key** (decided after M4 step 4): high-key (all light, airy), low-key (all dark, for dark-mode desktops) or full range (today). Light and dark structure sets a wallpaper's mood more than hue does. It's a "key" select next to mood that moves the lightness band of the planner, and keep pins it.
  8. **Temperature, or hue shifting:** "warm light, cool shadow". Lighter colors drift toward yellow and darker ones toward blue or violet, as real light does and as illustrators build ramps. The result looks natural rather than synthetic, even when vivid. It's a toggle that applies when palettes are generated.
  9. **Proportion** (Itten's contrast of extension, the 60-30-10 rule): one dominant color, a secondary one and a small accent, expressed through area. On the mesh that means more and larger points for the dominant color and a single small point for the accent. It's an option on the mesh shuffle ("proportion: even or 60-30-10"). Decided: a calm color (muted or dark) dominates and the most vivid one is the accent; mesh only, linear gradients stay as they are for now.
  - **Not doing:** extra hue schemes such as compound or double-split, which differ little from split-complementary and tetradic. Also simultaneous contrast, which is a perception effect rather than a palette rule. Saturation contrast is already covered by mood and the dominant/accent chroma.
- **UI:** stays lean, following the terminal panel. The harmony picker and the ⟳ source are in the main view; mood, base hue and Remix go behind "+ more".
- **Done when:**
  - Every rule produces palettes that visibly read as that rule.
  - Vivid palettes with 5–6 colors are no longer garish.
  - Remix keeps how the current colors relate to each other.
  - Palettes extracted from photos look natural, with no muddy duplicates.
- **Progress:**
  - ✅ Steps 1–3: the harmony picker is in the main view; on auto it shows the rule it picked, e.g. "auto (tetradic)". Mood (auto, natural or vivid) and base hue (a hue-wheel slider, ⌖ to take the selected color's hue) are behind "+ more".
  - ✅ Step 4, Remix, became a link mode: with "edit [x] linked", changing one color moves the whole palette by the same shift. Hue rotates every color by the same angle, keeping the harmony. Lightness shifts logit(L), keeping the order without clipping. Intensity scales by the same ratio. Every part reverses exactly when dragged back, except where a color hits the sRGB edge. "Free" edits one color as before. "[ remix ]" applies a random linked shift. It works on hand-edited palettes too (`src/color/linked.ts`).
  - ✅ Step 6, palette from image: ◩ on the colors rule opens a file picker, or an image can be dropped anywhere on the window. Up to 6 colors, one point or stop each. Mesh points start at the spot where their color is most concentrated in the image, and their size grows with its area, so a mostly dark photo stays mostly dark. Stops follow the image along the gradient's direction. The harmony shows "custom", and ⇄ reshuffles which point gets which color (`src/color/extract.ts`, D25).
  - ✅ Step 7, value key: a "key" select behind "+ more", next to mood: high (light), full range or low (dark). It works like mood: it shows the palette's key, picking one regenerates in it, and keep pins it. Unpinned shuffles pick full most of the time and high or low now and then (D26).
  - ✅ Step 8, temperature (removed 2026-10-07, D52): "temp [off] warm cool" behind "+ more". Warm is warm light with cool shadows: the lightest color turns up to 30° toward amber, the darkest up to 30° toward blue-violet. Cool is the reverse: cool light, warm shadows. Each color turns by its place in the palette's own lightness range; mid-tones keep their hue. Base hue now also turns the current palette. Both are adjustments over the palette's original colors: "~ hue +35° · temp warm [ reset ]" under the colors says so, a "~" marks each changed color, and temp off, base hue off or reset brings the originals back. A hand edit bakes the adjustments in. "+ add point/stop" moved from the section rule to the end of the colors list (`src/color/temperature.ts`, D27).
  - ✅ Fixed (after step 8): changing mood or key and back didn't restore the colors. Steering now regenerates from the palette's seed (D28).
  - ✖ Step 9, proportion: built and dropped (D29). Point radii were fitted until the calmest color covered 60% of the frame, but on soft meshes with 4–6 colors the image changed little; moving points and picking key and mood do more. More moods replace it as the last M4 step.
  - ✅ More moods: muted (dusty, low chroma), earthy (hues compressed into ochre–terracotta–olive), pastel (light and soft) and neon (bright, full chroma on a near-black ground), next to natural and vivid. Shuffles left on "any" pick natural, vivid, muted or earthy; pastel and neon are explicit picks (D30).
  - ✅ Harmony picker reworked after use. The select always shows the current palette's rule (per pattern), and picking a rule gives a new palette in it right away. `[ ] keep` is what pins the rule and mood for ⟳ and shuffle; off means both are random. Before, picking a rule silently pinned it, so ⟳ never left it. Mood works the same way. Remix stays.
  - ✅ **Shuffle color order (⇄):** the same colors, reassigned at random to different points or stops.
  - ✅ Vivid tuning: with 4+ colors and a multi-hue rule, only the base hue's colors and one accent stay vivid; the other hues drop to a supporting chroma (0.3–0.55 of max). Yellow-greens (hue 100–140) are capped at 0.55 of max chroma, so they no longer read as acid. Natural palettes are unchanged.
- **Decided:**
  - Rule, mood, key, base hue and temperature are UI settings, not saved in the design or carried in share links. Rule, mood and key steer generated palettes (and regenerate from the palette's seed, D28); base hue and temperature act on the current palette as adjustments (D27).
  - No curated palette library: the harmony generator with its controls covers it. This also removes the curation and licensing questions.
- **Settled:** palette from image takes up to 6 colors, leaning distinct (D25). Weighting colorful pixels so small accents survive is noted under step 6 for later.

### M4.5 — More shapes, base patterns and finishes ✅

- **Goal:** widen the range of looks cheaply, using the slots the product already has: warp shapes, base patterns and finishing effects. No layers and no new editors.
- **Background:** from the R&D review of other shape and noise algorithms. These items were approved because each one fits the existing model (base pattern, then warp, then grain, then transform) and adds little or no UI. Bigger ideas stay in M5 and the backlog.
- **Scope, in build order:**
  1. **New warp shapes.** They appear in the existing shape select and reuse Warp, Warp size and Seed, so there is no new UI. Each needs a GLSL chunk, its CPU mirror in `warp.ts` and a golden test, and goes through the same contact-sheet review and pruning as M3 (D22).
     - **Ridged / silk:** veined, folded-satin flows (`1 - |n|` fBm).
     - **Marble:** sine bands with noise turbulence.
     - **Kaleidoscope / mirror fold:** polar N-fold symmetry. N comes from the seed. It works on both base patterns.
     - **Flow / brushed** (promoted from optional, for the dry-brush look): anisotropic streaks along a flow direction, an extension of curl, with a bristle variant (elongated noise with broken edges). A smudge variant (a directional smear) is worth trying in the same chunk.
     - _Optional, lowest priority:_ **Voronoi edges** (F2−F1, crackle and cell walls).
  2. **Radial and conic base patterns.** They reuse the existing ramp and stops. The center defaults to the middle of the frame, and the pattern select gains two entries. The stop editor, blend modes and shuffle work as they do for linear.
  3. **Finishes**, one slider each, next to Noise (grain):
     - **Vignette.**
     - **Bands / contours:** quantizes the ramp into steps for a topographic or posterized look.
     - **Print texture** (lithograph and xerox grain, for a zine or print feel): thresholds the image against a fibrous, paper-tooth noise instead of blue noise, with an optional toner speckle and uneven darkening toward the edges. It is defined per output pixel like grain (D4 exception) and applied before dither. Decided while building: one slider, litho at the low end and xerox at the high end (D36).
- **UI:** stays lean, following the terminal panel. New warp shapes are dropdown entries only. Radial and conic are entries in the pattern select. Vignette and Bands are one slider each, behind "+ more" unless they prove central.
- **Done when:**
  - Every new warp shape renders tile-identically on both base patterns and in the export, and the GPU matches the CPU reference within the M3 tolerance.
  - Radial and conic work with shuffle, palette from image (stops follow the gradient direction) and the stop editor.
  - A contact sheet of the new shapes has been reviewed and pruned.
  - Vignette and Bands leave pure black and white exact and are unaffected by tiling.
  - Print texture matches between the preview and the export, and a flat palette plus print texture plus a muted mood reads as a printed zine page.
- **Not doing:**
  - **Figurative marks and linework** (faces, scrawls, expressive drawing): there is no good procedural way to draw them.
  - **Painterly filters** (Kuwahara, oil paint): they sample neighbors, which breaks the rule that a pixel depends only on its own coordinates (D4).
  - **Reaction-diffusion and other iterative or stateful algorithms:** they break the stateless, tile-independent render rule (D4).
  - **Fractals, Truchet and quasi-periodic tilings:** too graphic for gradient wallpapers.
  - **User-facing layers:** the product stays one pattern, one warp and a few finishes.
- **Progress:**
  - ✅ Step 1, warp shapes: **silk** (`ridged`: long draped folds, ridged noise run slowly along a seeded direction and fast across it) and **marble** (turbulent sine bands across a seeded direction: veins that fold the colors into each other). **Kaleidoscope** was built and pruned after the contact-sheet review: mirroring a wedge of a soft gradient repeats one or two colors or smudges (D31). Flow/brushed is now planned (with bristle and smudge variants); Voronoi edges stays optional.
  - ✅ Step 2, radial and conic: two more entries in the gradient select. Linear, radial and conic share one ramp (stops, blends, angle), so switching keeps the colors; the stop editor, shuffle and palette from image work on all three. Radial runs from the center to the frame corners and has no angle; conic sweeps from its angle to the opposite side and back, smooth all the way round, with a soft core so warps can't pinch the center (D32).
  - ✅ Step 3, finishes: **bands** and **edge** in the main adjust controls, for every style (ramps step their position; the mesh steps each point's influence relative to the strongest, a subtler terrace), edge from crisp lines to soft terraces; **vignette** behind "+ more" (darkens toward the frame corners, up to 75%, fixed to the frame while the image turns). All tile-identical, matching the CPU reference, and at 0 bit-identical to off (D33).
  - ✅ Flow / brushed: **brushed** (`bristle`): long bristle streaks along a seeded stroke direction (noise fine across the stroke and long along it, displacing along it), dragging colors across the frame like a dry brush. A first, gentler tuning was barely visible on soft gradients. **Smudge** was built and dropped: as a smooth drag it was invisible, and with stroke-shaped trails it turned into rectangular blocks, a digital look rather than a smear (D35). Brushed stays for now; the user may cut it later.
  - ✅ Print texture: one "print" slider behind "+ more" in adjust, from lithograph (the paper tooth modulates the ink: clean paper, textured ink) to xerox (lightness thresholded to 3 tones against the tooth, hue kept), with toner specks and uneven darkening toward the frame edges. Per output pixel; preview and export match, and tiling is exact (D36).
- **Open questions:**
  - ~~Does conic need a seam control?~~ Smooth seam for now (D32); to be checked by eye.
  - Should Vignette and Bands be in the main view or behind "+ more"? Behind "+ more" for now; promote either if it proves central, as warp size was.

### M5 — Pattern variety ✅

- **Goal:** widen the range of looks beyond gradients and meshes.
- **Scope:**
  - fBm noise fields.
  - Worley cells.
  - Aurora ribbons.
  - A **grid Bézier mesh** style (photogradient's core style; revisits D11).
  - **Planes** (collage, after synthetic cubism and the King Krule sleeve art): N seeded, rotated polygons or Voronoi-style cells, each a flat palette color, with noise-roughened edges (torn paper), overlap order for the layered look and a subtle paper grain. Evaluated per pixel with no state, so it stays tile-independent. Controls: plane count and edge roughness. Pairs with the print texture finish from M4.5 and the muted and earthy moods.
- **Done when:** each pattern has golden-image tests (CPU-reference and tile checks in the browser suite). The reference designs moved to M12's showcase examples (decided 2026-10-05).
- **Progress:**
  - Planes built (D37): count, torn and a new-layout button. It uses the ramp's colors, works with warps and finishes, and has contact sheets in `sheets.spec.ts`. Still to do: tune by eye, and possibly Voronoi-style cells as a second planes layout.
  - fBm noise fields and Worley cells built as the `noise` and `cells` gradient types (D41).
  - Aurora ribbons built as the `aurora` gradient type (D42).
  - Grid Bézier mesh built as the `grid` gradient type (D43): 2–5 × 2–5 draggable nodes, auto-smooth curves, a fold guard in the editor. Reference designs moved to M12.

### M6 — Saving ✅

- **Goal:** never lose work within a session.
- **Scope:**
  - Versioned design schema (zod) with migrations
  - `engineVersion` recorded in each design
  - Undo/redo, with a slider drag counted as one step
  - Autosave to browser storage as a best-effort cache
  - ~~Share links: compressed into the URL hash~~ moved to the backlog (user choice: they matter little, and grid designs make long URLs)
- **Done when:**
  - A reload restores the design exactly
  - An old-schema fixture still loads
- **Outcome (D44):**
  - **Schema:** `src/design/schema.ts`. A save is `{ version: 2, design }` with every field present; version 1 is the bare pre-M6 design, whose missing `transform`, `finish`, ramp `scale`, `seed` and `noiseStyle` are filled with their defaults on load. Anything invalid is rejected whole.
  - **Autosave:** the design goes to localStorage 300 ms after the last change and on leaving the page. The app opens on it and only shuffles on a first visit or when the save can't be read. `?default` neither restores nor overwrites it.
  - **Undo/redo:** ⌘Z and ⇧⌘Z (or Ctrl+Y), plus ↶ ↷ in the panel header; 100 steps, for the session only. A step is everything that changed between two presses (pointer or key), so a drag is one step and a held key is one step. Undo brings back every pattern's settings and the palette state (rule, base hue, temperature), not just the active design. Text fields keep their own undo.
  - Unit tests now compile Svelte modules in client mode. The server build dropped `$state.snapshot` on class fields, so `editor.design` shared (and sorted) the live stops in tests only.

### M7 — Keep and explore ✅

- **Goal:** keep a good result and find new ones without understanding every control. Added after the 2026-10-05 product review.
- **Scope, in build order:**
  1. **Design in the PNG:** the export embeds the design (the save envelope from D44) in an iTXt chunk, and dropping such a PNG on the window reopens it. PNGs without it still go to palette from image. JPEG has no equivalent for now (D45).
  2. **History and favourites, light:** the last ~20 shuffles kept in memory, stepped with ←/→; a ♥ saves the design JSON to one localStorage key, capped at about 12 and listed as palette swatch strips. No IndexedDB and no thumbnails (D45).
  3. **Thumbnail renderer:** one shared offscreen renderer that draws many small renders of a design. Steps 4 and 5 both use it.
  4. **More like this:** a 3×3 grid of small mutations of the current design (seed, layout and warp nudges, same palette). Clicking one takes it.
  5. **Visual pickers:** ~~pattern, warp shape and mood choices shown as live thumbnails of the user's own design~~ the thumbnails were tried and dropped (the main canvas made them redundant). Hover or ↑↓ previews on the main canvas; click commits.
  6. **Onboarding:** a few short tips on first visit (space shuffles, drop an image, ...), dismissible for good. It stands in for "Looks" (backlog, D47).
- **UI:** stays lean, following the terminal panel. Thumbnails appear only in the more-like-this grid.
- **Done when:**
  - Exporting a PNG and dropping it back reproduces the design exactly, for every pattern.
  - A favourite survives a reload; clearing browser data loses it (D13).
  - More like this and the pickers stay responsive on a slow GPU, with the shared renderer never blocking a drag.
- **Outcome (D45, D51):**
  - **Design in the PNG:** exports carry the save envelope in a `cromatica.design` iTXt chunk (`src/export/design-png.ts`). Dropping one reopens the design at its exported size (matching preset, else custom), as one undo step; other images, or a PNG whose design can't be read, still give their colors.
  - **History:** every shuffle (and ⟳) goes into a 20-slot reel, the design before the first shuffle included. ← → and the `← n/m →` buttons step through it; a slot keeps edits made in it, a new shuffle goes at the end, and a step is an undo step. Arrows nudge a point or node only when its handle has focus (`src/ui/reel.svelte.ts`).
  - **Favourites** (the layout moved in D55): ♡/♥ in the bottom bar, a "favourites" section listing up to 12 as swatch strips plus the pattern, newest first; a 13th drops the oldest with a notice. One localStorage key, one full save per entry, so migrations apply (`src/ui/favourites.svelte.ts`).
  - **More like this:** ⊞ or M swaps the preview for a 3×3 grid around the current design, gentle to bold. Variations keep palette, kind, finishes and transform and nudge points, sliders and angles; new seeds and warp shapes get likelier with boldness (strength²), and the planes count changes only as rarely as a seed, since it re-deals the collage (`src/design/mutate.ts`, sheet: `SHEETS=1 npx playwright test sheets -g variations`).
  - **Thumbnail renderer:** one offscreen WebGL context draws one thumbnail per frame into 2D canvases (`src/preview/thumbnails.ts`). Nine cells take about 350 ms on SwiftShader.
  - **Pickers:** gradient, warp shape, harmony and mood preview the option under the pointer or ↑↓ on the main canvas, worked out on a copy of the editor; never an undo step or saved. Custom palettes keep a spare seed so a mood or harmony preview matches the click.
  - **Tips:** a first-visit card (space, ← →, M, hover/↑↓ previews, "+ more", PNGs keep the design), dismissed for good with `[ got it ]`, back from `?` in the panel header.

### M8 — Relief and halftone finishes ✅

- **Goal:** two finishes that change the material of the image, not just its colors.
- **Scope, in build order:**
  1. **Neighbour-sampling stage:** the pattern evaluated at a few nearby points per pixel, giving a local slope or edge. Still per output pixel and stateless (D2, D4). It's the shared groundwork for relief and, later, glitch, riso overprint and contour lines (D46).
  2. **Relief:** the pattern treated as a height map and lit. First version is **satin** (soft cloth-like highlights) and **glass** (refraction, bright rims), gentle by default, with one strength slider where 0 is bit-identical to off. A prototype with chrome and iridescent is in `prototype/relief/`; those two stay out of the product for now.
  3. **Stipple / halftone:** a density-to-dot stage with one amount slider. No blob generator and no layers. Shipped as halftone only (D54).
- **Done when:**
  - Both finishes render tile-identically, match the CPU reference, and at 0 are bit-identical to off.
  - Preview and export match at the same size.
  - Relief preview stays within the frame budget, using the existing half-resolution fallback on slow GPUs.
  - A contact sheet of satin and glass over the existing patterns and warps has been reviewed.
- **Outcome (D46, D54):**
  - **Neighbour sampling:** the pattern (transform → warp → base) is one shader function, `patternColor`, so it can be read at nearby points; `heightSlope` takes the slope of its Oklab lightness by central differences 0.003 image heights apart, compiled in only when something uses it (`src/engine/neighbours.ts`).
  - **Relief:** lighter = higher, lit from a direction fixed on screen. Shading is measured against a flat surface, so flat areas are untouched; steep slopes are eased so detailed patterns don't crumple. Satin adds shading and a tinted sheen; glass refracts the pattern underneath and adds tinted rims and glints. Panel, under "+ more": relief, light, then surface (`src/engine/relief.ts`). Sheets: `relief.png`, `relief-light.png`.
  - **Halftone:** every pixel is ink (darker, richer) or paper (lighter, paler) on a 45° screen, ~4 px at 1080p and in image units. The ink share is calibrated so ink and paper mix back to the color's luminance, and dot edges mix in linear light. One slider under "+ more" (`src/engine/halftone.ts`); dragging it keeps the preview at full resolution, as for grain and print (D53), since a half-resolution frame aliases the screen. Sheets: `halftone.png`, `halftone-1080p-crops.png` (contact sheets can now render 1:1 crops of a full-size image).
  - **Order:** pattern → relief → vignette → halftone → print → grain.
  - **Shuffle:** relief in 15% of style shuffles (0.2–0.5, satin or glass, light 100°–170°), halftone in 12% (0.15–0.35), drawn after the other finishes so earlier shuffles are unchanged.
  - **Saves:** version 4 adds `relief`, `reliefStyle`, `reliefLight` and `halftone`; older designs load with both off.
  - **Checks:** both match the CPU reference within 1 level, tile and worker renders are identical, off is bit-identical. Relief costs about 4.5× the render time on SwiftShader (five pattern reads per pixel); the user tried it live and reported no slowdown; not measured on a real GPU.

### M9 — Context preview and legibility ✅

- **Goal:** show how a wallpaper will look with the operating system on top of it, and warn when icons or the clock would be hard to read.
- **Scope:**
  - **Mockups** for Windows (taskbar, desktop icons), macOS (menu bar, dock, notch), Android (status bar, navigation, home icons, lock-screen clock) and iOS (lock-screen clock and widgets, Dynamic Island, home icon grid).
  - **Legibility:** a contrast check under each platform's text zones (clock, date, status, labels, menu bar), with a warning where the area is mid-tone against both light and dark text, and a dotted guide around the checked zones.
- **UI:** overlays only, never part of an export (D48). Related to the M13 full-screen preview, which could host the same mockups.
- **Done when:**
  - Each platform's zones are drawn at the right proportions for at least one current device.
  - The warning flags a zone no text color reads over and stays quiet on a calm one.
- **Settled (D56):** all four platforms at once, zones measured from official screenshots and guidelines, legibility checks contrast only (busyness dropped), export set moved to M11, then dropped on 2026-10-08. Crop frames dropped: OSes don't fit wallpapers in one standard way.

### M10 — Light/dark pairs ✖ dropped

- **Goal:** one composition exported as a light and a dark variant.
- **Decision (2026-10-08, D57):** dropped. It was built (an automatic dark variant, hand-editable, exported as two files) and works, but it only saves a few clicks: to get a dark version, pick "low" in the key select (D26, D28) or edit the colors, then export again. No OS reads a pair of files as one wallpaper, and the one single-file route, a macOS dynamic HEIC, has no browser encoder worth shipping (`docs/research/heic-dynamic-wallpaper.md`).
- **Kept:** the code is on the unmerged branch `feat/light-dark-pairs`.
- **Backlog:** a macOS script that merges two exported PNGs into a dynamic HEIC; "dark colors from an image".

### M11 — Effects

- **Goal:** settle the visual effects work. Polish was split into four milestones on 2026-10-08 (D58): M11 effects, M12 UI decisions, M13 performance and UX, M14 lean panel.
- **Scope, in this order:**
  - **Backlog review** ✅ (2026-10-08, D59): design in the JPEG stays as a try (with share links), advanced favourites and the light/dark pair are dropped, looks stay parked, the comment cleanup is wanted, the technical section is to be evaluated and the planes panel needs a brainstorm.
  - **Bold bands on the mesh** ✅ (2026-10-08, D60): three styles behind an A|B|C switch in the bands row. A is today's weight terraces (default), B flat facets between the two strongest points, C stepped lightness layers. All three tried by eye on a contact sheet; the user liked all of them, so none was dropped.
  - **Brushed warp** ✅ (2026-10-08, D61): kept and reworked instead of removed. The old version was a predictable zigzag; the new one has bending, varied, feathery strokes and pairs well with relief. No migration needed.
  - **Bicubic patch mesh** ✅ (2026-10-08, D62): evaluated and not built as a separate pattern. The grid (D43) already is a bendable grid, and tangent handles would only refine the same soft blobs. Instead the grid got grid lines drawn along the bent grid, which the user liked; cloth shading was tried and dropped.
- **Done when:** the backlog is reviewed, one bold-bands option is picked or dropped, brushed warp is kept or removed (with a migration if removed), and the bicubic idea is judged by the user: promote it, park it or drop it.

### M12 — UI decisions

- **Goal:** settle what the panel's finishes and color controls are called and which of them stay, before the references are fixed. After M11.
- **Scope, in this order:**
  - ~~**Colors "blend" dropdown**~~ Done (D63): removed; every ramp blends perceptually.
  - ~~**Relief's name**~~ Done (D63): the controls form a bordered "lighting" group: amount, direction, surface.
  - ~~**Relief controls and shuffle weight**~~ Done (D63): relief 0.1–0.5, halftone 0.1–0.35, chances unchanged.
  - ~~**Noise, print and halftone sliders**~~ Done (D63, D53): one "noise" group with a type (lithograph, xerox, halftone, grain) and an amount; old saves migrate. Arrow-key previews now cover every list that can show one.
  - ~~**Keep row split into colors, pattern, adjust**~~ Done (D64): the footer's keep row is `keep [ ] colors [ ] pattern [ ] adjust`. Pattern holds the kind, layout, warp shape and its variation (the old "layout" lock); adjust holds the warp amount and size and the finishes (bands, noise, vignette, lighting); the transform is never shuffled. The finishes get the same roll whether or not the pattern is locked, "more like this" is unaffected (it already keeps palette, kind, finishes and transform), and the locks are not saved with the design (D44).
  - **Showcase examples / reference designs** (moved from M5; last, after the finish cleanup above, 2026-10-08): for each pattern, render candidates from shuffles and contact sheets, let the user pick about 3 by eye, and save them as fixed design files. They serve as showcase examples and as test fixtures.
- **Done when:** each decision is recorded in DECISIONS, and each pattern has about 3 saved reference designs used as showcase and golden-image fixtures. The showcase examples come last because merging or renaming the finishes would change the designs.

### M13 — Performance and UX

- **Goal:** ready for real use. Independent of how designs look, so it can overlap with M12.
- **Scope:**
  - Adaptive preview resolution tuning
  - **Sharp preview when zoomed in** (user, 2026-10-08): the preview zooms by scaling a canvas drawn for the fitted view, so fine textures such as grain go soft. Redraw at the zoomed scale (only the visible part), within the frame budget.
  - **Full-screen preview:** shows the wallpaper edge to edge with no panel, to make up for the smaller preview next to the docked sidebar. Esc or a small × in a corner exits. Use the Fullscreen API where available; the render stays at screen resolution so the grain reads true. Handles stay hidden.
  - Context-loss recovery
  - Shader compile warm-up
  - Keyboard shortcuts
  - A faster deflate for 5K PNG export (see M5's note), if the export still feels slow.
- **Done when:**
  - Tested on Chrome, Safari and Firefox on macOS, and Chrome on Windows
  - Exports at every preset resolution succeed
- **Open questions:**
  - Hosting
  - Product name (currently a placeholder)

### M14 — Lean panel (trial and error)

- **Goal:** try to make the left panel leaner. Added 2026-10-08. A trial-and-error session that can run in parallel with almost any other milestone.
- **Scope:**
  - **Status bar under the preview** (only if it earns its place, 2026-10-08): IDE-style, for global and view settings. Not needed on its own; worth building only if settings move into it from the left panel to declutter it (show points, preview zoom, output size, autosave state and others to be picked).
- **Done when:** the user either keeps a leaner panel with a bottom status bar or drops the idea. It is worth building only if settings move into the bar.
- **Open questions:**
  - Which settings move (show points, preview zoom, output size, autosave state, others).
  - What it means for the mobile panel (M15).

### M15 — Mobile layout

- **Goal:** the editor is usable on a phone and a tablet, not only on a desktop window. Added 2026-10-07; after M14 on purpose, so the desktop layout is settled first (D55, D58).
- **Scope:**
  - **Layout:** the docked left panel (about 300px, monospace, small targets) does not fit a narrow screen. Find a layout for it: a bottom sheet, tabs, or a full-screen panel over the preview. The colors and favourites sections at the bottom of the panel (12 favourite columns across the panel width) need a mobile counterpart.
  - **Touch:** touch-sized controls, drag handles for mesh points, grid nodes and stops with a finger, no hover-only affordances (the favourite ×, picker previews on hover).
  - **Shortcuts:** the Space, arrow and M shortcuts need on-screen buttons.
  - **Performance:** check the preview and the thumbnails on a phone GPU, and export limits at 4K and 5K on mobile memory (D4 tiling).
- **Done when:** the whole flow (shuffle, adjust colors, keep a favourite, export) works on a current iPhone Safari and Android Chrome, and the desktop layout is unchanged.
- **Open questions:**
  - Whether the panel becomes a sheet or a separate screen.
  - Whether a smaller set of controls makes sense on mobile, or the same ones in a different frame.

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

- **Bicubic patch mesh** (promoted to prototype, 2026-10-08): Figma/SwiftUI-style bendable grid. Also in M11's scope (effects); an investigation runs in parallel with the R&D agent.
- ~~Reevaluate the grid pattern~~ Done in M11 (D62): the grid stays (shown as "net" in the panel), with a "lines" option that gives it its own look. Revisit if it still feels too close to the mesh.
- **Share links** (investigate; may become its own milestone, 2026-10-08): the save envelope compressed into the URL hash. Grid designs (25 nodes) make long URLs. A JSON file export and import would be the cheaper way to keep a design outside the browser.
- **Digital / glitch as a post-processing stage** (wanted as a novelty feature, to give a real try, 2026-10-08): the glitch should act on the boundaries between colors and shapes in the rendered image (tearing, offsets and channel splits that follow edges), not move coordinates. A first try as a warp shape (hashed blocks shifted sideways plus scanline jitter) and an RGB split finish was built and reverted. It was underwhelming: on soft gradients a shifted block of similar color barely shows. The earlier attempt shows it likely needs an image-space stage, for example edge detection on the pattern evaluated at neighboring points, with displacement applied where colors change. That stays per pixel and stateless (D4), but costs extra pattern evaluations.
- **Liquid-jazz "ink blobs" look, as an optional niche panel** (2026-10-08): get close to the reference with an advanced, optional panel of 3, at most 4, settings, not the full prototype depth. seeded smin-capsule blobs rendered as stipple in flat inks (reference: stippled vinyl cover). A prototype exists in `prototype-stipple.html` and `prototype/stipple/` (untracked, not part of the app). Open findings: union all blobs into one silhouette and use per-ink fields only for the color inside it; use a black base with white as an ink; fill more of the frame. Decide later whether it is a style of this product or a separate one.
- **Planes advanced panel** (needs a new discussion and brainstorm before any build, 2026-10-08, D59): the user wants to remember what it was for. Requested 2026-10-04: controls to move planes (drag, nudge, or reorder the stack), and settings brought over from the stipple / ink-blobs prototype.
- **Mobile layout / authoring:** tracked as milestone M15, not here (promoted 2026-10-07, D55; renumbered D58).
- ~~Blend: sharper at the top of the slider.~~ Done in M4.5: the far end now reaches near-hard edges (D34).
- **Light/dark pair** (dropped for good, 2026-10-08, D57, D59): the code stays on the branch `feat/light-dark-pairs`; not planned. The earlier notes on a macOS HEIC script and a "dark colors from an image" drop target are dropped with it.
- **Technical section** (to evaluate, 2026-10-08, D59): Display P3 output, 16-bit PNG, mozjpeg (WASM) for 4:4:4 JPEG, WebGPU backend, flow-field advection (LIC) and Gabor noise. Performance comes first. Display P3 may matter for gamut, so it needs a real look; the rest wait for a reason.
- User-saved palettes
- ~~Mobile authoring~~ Promoted to M15 (2026-10-07; was M12).
- **Stipple / halftone finish:** moved to M8 (2026-10-05). The ink-blobs look below stays here.
- **Looks (curated bundles)** (parked 2026-10-05, D47): named presets such as Zine, Dusk or Riso that set pattern, mood, key and finish together, so shuffle could stay inside a look. It would help adoption, but M7's onboarding tips cover most of that for now.
- ~~Favourites, advanced~~ Dropped (2026-10-08, D59): the favourites list from M7 is enough. A JSON file export and import stays under share links.
- **Design in the JPEG** (2026-10-05, follows D45): embed the save envelope in an exported JPEG and reopen it on drop, as the PNG does. A COM or APP1 (XMP) segment can carry it, spliced in after `canvas.convertToBlob` because the browser encoder has no metadata hook, with a segment reader for drop. Each segment holds about 64 KB, so measure a typical `saveDesign` JSON first. Weaker than PNG: JPEGs are re-encoded and stripped more often when shared. **Wanted as a try, alongside share links (2026-10-08, D59):** not dropped; build it as an experiment and judge by what survives sharing.
- **Comment density:** go through the code and cut comments that restate the code or narrate history; keep the ones that explain why (conventions, math, invariants). The user finds the current amount excessive (2026-10-04).
