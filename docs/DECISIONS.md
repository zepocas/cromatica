# Design Decisions

Decisions made during the architecture review. Reopen one only if new information changes the reasoning.

---

## D1. WebGL2 + raw GLSL (with twgl.js), not Canvas 2D, PixiJS or WebGPU
- **Why:** per-pixel procedural noise at 4K–6K is impossible on the CPU. PixiJS is a sprite/scene-graph engine and would get in the way. WebGPU gives little benefit for a fragment-only workload.
- **Consequence:** the renderer sits behind an interface, so a WebGPU backend can be added later.

## D2. The image depends only on the design and the pixel position
- **Why:** it guarantees the preview matches the export, that tiled rendering leaves no seams, and that saved designs are reproducible.
- **Consequence:**
  - No multi-pass feedback effects. Curl flow is integrated inside the shader instead.
  - Neighborhood post-effects such as blur or bloom would need overlapping tile margins and are avoided in Phase 1.

## D3. Export runs in a Worker with tiled rendering and a custom streaming PNG encoder
- **Why:**
  - The UI never freezes.
  - Tiling avoids GPU watchdog timeouts and texture-size limits.
  - Canvas area limits and encoder memory usage stop being a problem.
- **Consequence:** JPEG uses the browser's `convertToBlob` for now.

## D4. Composition is independent of resolution; aspect ratio defines the frame
- **Why:** the design is about shape and proportion. Resolution only sets render quality at export.
- **Rule:** image height = 1 unit, origin at the center. Changing aspect ratio reveals more or less on the sides and never distorts.
- **Exception:** grain and dither are defined per output pixel.

## D5. Colors are stored as Oklch floats; blending uses Oklab-family modes, chosen per segment
- **Why:**
  - Straight Oklab blends can still turn gray between complementary colors. Chroma-preserving Oklab and Oklch modes address that.
  - Hex can't represent colors outside sRGB and loses precision.
- **Consequence:**
  - Gradients are precomputed into a lookup texture on the CPU.
  - The color-point mesh blends inside the shader, with a cheap gamut clip.
  - A monotone cubic spline between stops avoids Mach bands.

## D6. sRGB output, not exposed to the user
- **Why:** it's the universal standard, and choosing a gamut is too technical for users.
- **Consequence:** because colors are stored as Oklch, Display P3 can be added later as an internal flag with no UI change.

## D7. Grain and dither are separate
- **Why:** grain is a visible creative effect. Dither is an invisible ±1 LSB blue-noise (TPDF) signal that removes 8-bit banding. It's always on and never shown to the user.

## D8. Static images only
- **Why:** there are no animated or live wallpapers in scope.

## D9. Desktop-first; mobile only as export presets
- **Why:** mobile authoring would require fp16 fallbacks and designing for smaller GPU limits.

## D10. Phase 1 is single monitor only
- **Why:** it keeps the scope tight.
- **Consequence:** multi-monitor will need each display's physical size (from its diagonal) and position, not just its aspect ratio, so shapes line up across screens. The "export = rectangle over the composition" model already supports this.

## D11. Bicubic patch mesh deferred
- **Why:** it's complex. The draggable color-point mesh (a radial-basis-function field) covers most of the look for Phase 1.

## D12. Palette shuffle belongs to M5
- The curated library, the Curated/Remix/Generate modes, and the colors/layout locks are all part of M5.
- No user-saved palettes in Phase 1.

## D13. Browser storage is a best-effort cache
- **Why:** there's no backend or account.
- **Consequence:**
  - Autosave protects against a reload or an accidental tab close.
  - If browser data is cleared, the design is gone.
  - Share links and exported images are the way to keep work.

## D14. Svelte 5 for the UI
- **Why:** it's small and reactive, which suits a floating control panel.
- **Consequence:** the render engine stays a framework-independent TypeScript module.

## D15. Working name "gradient-wallpaper"
- A placeholder until a better name is found.
