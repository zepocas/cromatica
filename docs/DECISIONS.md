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

## D12. Palette shuffle belongs to M5 (superseded by D22)
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

## D16. Export tile size 2048 px
- **Why:** a 5K image renders in 6 tiles, which keeps each draw call short.
- **Consequence:** the worker lowers the tile size when the device's `MAX_VIEWPORT_DIMS` or `MAX_RENDERBUFFER_SIZE` is smaller.

## D17. PNG rows use a fixed Up filter
- **Why:** in a 5K benchmark, Up tied for the smallest file on clean gradients and came within 2% on dithered ones. It is much cheaper than Paeth or the min-sum heuristic.
- **Consequence:** the deflate step dominates encoding time. Expect about 1.5–2 s and 7–8 MB for a 5K export once dither or grain is added in M1/M5.

## D18. Dither fades out at pure black and white
- **Why:** exact 0 and 255 channels stay exact, with no ±1 specks after clamping.
- **Consequence:** the dither amplitude scales down within 1 LSB of either end, which adds a bias of less than 1 LSB there only.

## D19. Blue-noise texture is 64×64 and generated in the repo
- **Why:** 4096 ranks are far more than 8-bit output needs, and a 64 px repeat isn't visible at ±1 LSB.
- **How:**
  - `scripts/generate-blue-noise.ts` produces it with a seeded void-and-cluster algorithm, and `src/engine/blue-noise.generated.ts` is the committed output.
  - The noise is uploaded as an R16UI texture and indexed by output pixel, so it doesn't depend on tiling.
  - Each channel uses a different offset into the texture, so the three channels are decorrelated.

## D20. Mesh weights use a rational-quadratic kernel computed in the log domain
- **Formula:** `w_i = (1 + d²/r_i²)^(-k)` with `k = 1.5·12^sharpness`, normalized and blended in Oklab.
- **Why:** it is smooth everywhere and NaN-free far from all points. Seams widen with distance instead of sharpening.
- **Rejected after comparison renders:**
  - Gaussian: hard seams far from points.
  - Softened Shepard: bullseyes, and never gets blobby.
  - Rational-quadratic with k from 1 to 16: muddy at the soft end.
- **Shared code:** inputs are sanitized in one place, which the shader and the CPU reference (`src/color/mesh.ts`) both use. Positions are clamped to ±1e6 and radii to [1e-4, 1e4].

## D21. The mesh shader uses the CSS Color 4 gamut-mapping algorithm
- **How:** a fixed 16-step bisection, so results are deterministic and don't depend on tiling.
- **Why:** pure constant-L/h chroma reduction gave up to ΔE 0.06 less chroma near the blue cusp than CSS mapping. Using the same algorithm keeps meshes and linear ramps consistent and blues vivid.

## D22. Re-plan after M2: the look comes first
- **Why:** comparing with photogradient.com showed that most of its look comes from film grain, a menu of warp shapes ("Warp Shape", "Warp", "Warp Size"), and shuffled, natural palettes. Its base is a grid Bézier mesh.
- **Consequence:**
  - M3 becomes warp, grain and basic shuffle.
  - M4 becomes curated palettes, Remix and palette from image.
  - M5 becomes the remaining patterns plus a grid Bézier mesh style.
  - We don't copy photogradient's warps one for one. We build a broad experimental catalogue, then prune whatever doesn't add a distinct look.

## D23. Warp catalogue pruned to 12 shapes
- **Removed:**
  - `value`: barely distinguishable from `simplex`.
  - `gravity`: read as a dark blot and was too subtle on smooth meshes.
- **Kept:** domain, fbm, simplex, waves, rows, columns, circular, oval, worley, voronoi and curl, plus none.
- **Next pruning candidates:** `worley` (flat polygon patches) and `fbm` (overlaps with domain).
