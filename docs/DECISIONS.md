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

## D11. Bicubic patch mesh deferred (superseded by D43)

- **Why:** it's complex. The draggable color-point mesh (a radial-basis-function field) covers most of the look for Phase 1.

## D12. Palette shuffle belongs to M5 (superseded by D22)

- The curated library, the Curated/Remix/Generate modes, and the colors/layout locks are all part of M5.
- No user-saved palettes in Phase 1.

## D13. Browser storage is a best-effort cache

- **Why:** there's no backend or account.
- **Consequence:**
  - Autosave protects against a reload or an accidental tab close.
  - If browser data is cleared, the design is gone.
  - Share links and exported images are the way to keep work. Since M6 (D44) share links are in the backlog, so for now only exported images last.

## D14. Svelte 5 for the UI

- **Why:** it's small and reactive, which suits a floating control panel.
- **Consequence:** the render engine stays a framework-independent TypeScript module.

## D15. Working name "gradient-wallpaper"

- A placeholder until a better name is found. Superseded by D49.

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

## D24. Transforms act on composition coordinates, before the warp

- **Model:** pattern coordinates are `q = S · R(-rotate) · p / zoom`, where `S` holds the flips. The matrix is uploaded as a `mat2` uniform. The identity is exact in fp32, so designs from before M3.5 render bit-identically.
- **Why before the warp:** the whole image turns, scales and mirrors as one piece. Grain and dither stay on the output pixel grid.
- **Flips in pattern space:** the flip buttons also negate the rotation, so a flip always mirrors what is on screen and the rotation always turns counter-clockwise on screen.
- **Linear gradients:** the ramp is refitted to the rotated and flipped frame, so it always spans the frame like the angle does. Zoom is left out of the fit, so it still magnifies the ramp.
- **Mesh points stay in pattern space:** handles, drags, nudges, "add" and the Size slider convert through the transform. Shuffle lays points out on screen and maps them into pattern space, so they land in view under any transform.
- **Ranges:** rotation is in [0, 360). Zoom is in [0.5, 4] on a log slider.

## D25. Palette from image: distinct over dominant, laid out like the image

- **Clustering:** k-means++ in Oklab on the image scaled to 256 px on its long side, 16 clusters, best of 4 restarts by squared error, fixed seed. A single start made busy photos a lottery: which small areas got a cluster of their own changed with the seed. More clusters (24) made it worse.
- **Pick:** up to 6 colors, greedy. The largest cluster comes first; each next pick maximizes `area^0.25 · distance^0.75` to the colors already picked, skipping anything within ΔE_OK 0.08. Pure dominant gave three shades of the background on most photos. Pure distinct found the accents but flipped between runs in the browser. The near-duplicate floor means a monochrome photo gives fewer colors instead of muddy ones.
- **Layout:** each mesh point goes to its color's peak (densest spot on a 12×12 grid), not its centroid, which drifts to the middle for spread-out colors. The image covers the frame, cropped and centered. The radius scales with the square root of the area share, so the dominant color fills the frame the way it fills the photo.
- **Count:** the image decides, up to 6, and it replaces the current number of points or stops. Harmony becomes custom, since no rule made the palette.

## D26. Value key moves the planner's lightness band

- **Bands:** high is L 0.70–0.96, low is L 0.12–0.55, and full keeps the mood's band. Low reaches into the mid-tones so a few colors can glow; with a lower ceiling, natural low-key palettes read as mud.
- **High key caps chroma at 0.13.** Light colors near their gamut cusp turned vivid palettes into neon candy; capped, they read as bright pastels.
- **Anchors follow the key:** high only gets the cream anchor, low only the near-black one.
- **Spread:** the minimum lightness span scales to the band (half its width, at most `MIN_L_SPAN`). Up to 5 colors meet the spacing rules, except a rare 5-color monochrome high-key palette (3 in 19,200 sampled) that lands up to 5% short; at 6 or more the narrow bands miss about 5% of the time. Either way the closest attempt is kept.
- **Like mood, not like base hue:** the select shows the current palette's key and "keep" pins it. Unpinned, a shuffle picks full 70% of the time and high or low 15% each, for variety. Without a key the generator stays on full.

## D27. Temperature and base hue are adjustments over the original colors

- **Update (D52):** temperature was removed on 2026-10-07; the rest holds for base hue.

- **Temperature model:** the painter's rule that the light's temperature sets the shadows' opposite. Warm turns the lightest color up to 30° toward amber (75°) and the darkest up to 30° toward blue-violet (275°); cool swaps the targets. Each color turns by `30° · |t|`, where `t` runs from -1 at the palette's darkest color to +1 at its lightest, never past its target. Mid-tones and near-neutrals keep their hue, so the harmony rule still reads. Lightness never changes; chroma is capped to stay in sRGB. Relative lightness means a low-key palette is lit within its own dark band.
- **Three states, three buttons:** off, warm, cool. A first "[x] warm/cool" checkbox had two states for what reads as three (off, warm, cool), so "on" looked like one of the two was always active. A 0–1 "sunlight" slider was tried and dropped: the choice of light matters more than its strength.
- **Not in the generator:** a first version bent hues inside the palette planner, so it only took effect on the next shuffle and looked broken. The same went for base hue, which only steered the next shuffle.
- **Adjustment layer:** per pattern, the editor keeps the original colors plus a hue turn and a temperature, and renders `temperature(turn(original, hue))` onto the points or stops. Changing either re-renders from the originals, so nothing accumulates and going back is exact. The panel shows "~ hue … · temp …" with a reset, and marks each changed color.
- **Direct edits bake it in:** once the colors differ from the last render (hex, picker, linked edit, remix, ⇄, add or remove), the adjusted colors become the new originals and the controls read zero again. An edit is never silently changed by an adjustment afterwards. Detection compares colors rather than hooking every edit path.
- **Shuffles and imports:** a new palette is a new original. Temperature carries over to it; base hue already built it, so its turn starts at zero. An image import starts with no adjustment, true to the photo.

## D28. Steering a palette regenerates it from the same seed

- **Bug:** picking a mood, key or rule built a palette from a fresh seed, so switching back never returned the colors you had.
- **Fix:** the editor keeps each generated palette's seed, and mood, key and rule changes regenerate from it. The generator draws its random rule, mood and key on every call, used or not (as it already did for the base hue), so fixing one option doesn't shift the rest of the sequence. Switching away and back gives the original colors exactly, and "vivid" gives the same palette in vivid rather than an unrelated one.
- **Fresh seeds** still come from ⟳ and shuffle. An imported palette has no seed; steering it builds a new palette.

## D29. Proportion (60-30-10) was tried and dropped

- **What was built:** the calmest color (lowest `C + 0.1·L`) got 60% of the frame, the most vivid 10%, the rest 30%. Each point's share was measured by averaging its blend weight over a grid on the frame, and the radii fitted to the targets; the fit landed within a percentage point.
- **Why dropped:** on soft meshes with 4–6 colors, resizing points reshapes the blend far less than the shares suggest, and switching between even and 60-30-10 barely showed. Moving points by hand and steering the palette with key and mood have more effect.
- **Instead:** more moods (muted, earthy, pastel, neon), which change the look directly.

## D30. Six moods, each a tuning of the same planner

- **Moods:** natural and vivid, plus muted, earthy, pastel and neon. Each is a `MoodTuning`: relative chroma ranges, a chroma ceiling, the lightness band, anchor odds. Two new knobs: `hueBand` (earthy compresses the whole hue circle into 25–115°, continuously, so hue relationships survive as smaller gaps; a fixed base hue is compressed too) and `darkGround` (neon's anchor is always a near-black ground although its colors sit in a bright 0.55–0.9 band, so they glow).
- **Mood is chroma and hue character; key is lightness.** On high or low key the key's band replaces the mood's, so e.g. pastel + low key gives soft darks.
- **Generalized rules:** the lightness span a palette needs is half its band when the band is narrower than 0.5 (`minLSpan(band)`), and anchors follow the band (cream where it reaches 0.85, near-black where it reaches 0.3). Both reproduce the earlier natural, vivid, high and low behaviour exactly.
- **"any":** natural 45%, vivid 20%, muted 20%, earthy 15%. Pastel mostly repeats natural + high key and neon is too loud to appear at random, so both are explicit picks.
- **Limits:** every mood meets spacing and spread up to 5 colors; pastel's narrow, soft band misses spacing 12–16% of the time at 6–8 colors and keeps the closest attempt.

## D31. M4.5 warp shapes: silk and marble kept, kaleidoscope pruned

- **Silk** (`ridged` in code): a single-channel displacement across a seeded direction by ridged fBm (`(1 - |n|)²` per octave, 2 octaves) sampled 4× slower along the direction than across it. A first isotropic version (two ridged channels) looked like fbm; the anisotropy is what makes folds.
- **Marble:** displacement along the band normal by `sin(2π·f·(d·p) + 4.5·fbm)`, with amplitude ∝ band spacing. At a first, weaker strength it also read as fbm; it needs displacement comparable to the gradient's color features for the veins to show.
- **Kaleidoscope pruned:** a mirror fold (N segments, then a twist instead of a ghosting blend) was correct and seamless, but a wedge of a soft gradient holds one or two colors, so it showed as a single color or a radial smudge on both base patterns.
- **Shared constants** (octaves, stretch, turbulence) are injected into the shaders from warp.ts like the others.

## D32. Linear, radial and conic are one ramp gradient

- **Model:** `RampGradient { kind: 'linear' | 'radial' | 'conic', angle, stops }`. The editor keeps one ramp for all three, so switching shape keeps stops and blends, and palette state (rule, seed, adjustments) is per color owner (mesh or ramp), not per kind.
- **t per shape** (`src/engine/ramp-shape.ts`, mirrored in `ramp-shape.glsl` from the same prepared uniforms): linear as before (spans the rotated frame); radial `|p| / (half frame diagonal)`, so corners reach the last stop; conic `(1 − cos θ)/2`, θ from the angle: the first stop at the angle, the last opposite, smooth everywhere with no seam and no atan.
- **Conic core:** within 0.15 of the center, conic eases toward mid-ramp. Every color meets at the center, and a warp otherwise shreds it into a pinched knot.
- **Palette from image** orders stops by each color's t in the active shape, so they follow the gradient however it runs.
- **Center** is the frame's center; zoom magnifies around it. A movable center would need a pan in the transform (not built).

## D33. Finishes: vignette on the frame, bands on the ramp

- **Order:** base pattern (with bands) → vignette in linear light → sRGB transfer → grain → dither. `Design.finish = { vignette, bands }`, missing = none; shuffles keep it like grain.
- **Vignette:** multiplies linear RGB by `1 − 0.75·amount·smoothstep(0.35, 1, |p| / half diagonal)` in composition coords, before transform and warp, so it frames the image and stays put while the image turns, zooms or warps. Black stays black. "Leaves pure white exact" from the M4.5 done list can't hold for a vignette, which darkens corners by design; what holds is that 0 is bit-identical to off.
- **Bands:** `bandLevel(x) = (k + rise)/(n−1)` with `k = floor(x·n)` and `rise` a smoothstep over the last `edge` of each step (0 = hard): n flat levels from 0 to 1, both ends exact, n from 24 (just above 0) to 3 (at 1). Ramp gradients band their position t. The mesh bands each point's weight relative to the strongest (which is exactly 1 before normalizing, so it stays 1 and a pixel never loses all its color); that gives terraces of each point's reach, subtler than ramp bands because the mix averages the steps. The edge slider softens the step edges for both. A user request moved bands and edge to the main controls for every style.
- **All three** are uniforms, not shader variants, so dragging them never recompiles. The finish chunk comes before the base patterns in the shader, since the mesh calls `bandLevel`.

## D34. Blend reaches near-hard edges at the top

- **Change:** the mesh exponent is `k = 1.5 · 12^s · (1 + 4·s⁶)`. The extra factor is ×1.007 at s = 0.35, ×1.06 at 0.5, ×1.47 at 0.7 and ×5 at 1, so k tops out at 90 instead of 18. Low and mid blends (shuffles stay in 0.1–0.5) look as before; the far end gives near-hard, Voronoi-like edges.
- **Safe:** weights are computed in the log domain normalized by the largest, so k = 90 is fine in fp32; CPU and GPU still match. The continuity test bound scales with k, since steeper (still continuous) transitions change faster per sample.

## D35. Brushed strokes along a seeded direction; smudge dropped

- **Brushed** (`bristle`): in coordinates along and across a seeded stroke direction, simplex noise at 0.15× along and 5× across gives broad, long strokes; it displaces along the stroke by up to 0.7 (gain) times a soft mask (0.4–1, from coarse simplex), so colors drag across the frame in streaks. The first tuning (gain 0.18, a mask that cut strokes off fully) was barely visible: a warp only moves colors, and soft colors smeared into soft colors look the same.
- **Widened (2026-10-05):** 14× across gave hairline streaks that vanished on soft gradients; 3× turned into a generic smear like fbm. Brushed also uses only half the size slider's frequency range (`span: 0.5` in the warp tuning, 4× instead of 16×), so even the smallest size keeps brush-wide strokes. Shuffle weight halved to 0.4. `SHEETS=1 npx playwright test sheets -g brushed` renders the sheet.
- **Smudge dropped:** a smooth one-way drag was invisible on soft gradients; finger-width trails with a hard start (hashed per trail) turned into rectangular blocks with straight cuts, a digital, glitchy look rather than a smear. That look is noted for M5 as a "digital / glitch" item.

## D36. Print texture: litho ink modulation to xerox lightness screen

- **One slider** (`finish.print`), applied per output pixel after the sRGB transfer, before grain and dither; 0 is an exact passthrough. It fades in over 0–0.25.
- **Paper tooth:** smooth value noise over output pixels, mostly a fine tooth (0.9 px⁻¹) plus two faint fiber layers at different angles, stretched toward a uniform distribution.
- **Litho (low end):** the tooth modulates the ink, `ink = 1 − e` scaled by `1 ± 0.35·print`: bare paper stays white and inked areas get an even texture. A first version thresholded every channel against a coarse fibrous noise; it read like distressed concrete with colored specks.
- **Xerox (high end, blended in over 0.7–1):** lightness thresholded to 3 tones against the tooth, the color rescaled to it, so hue holds and the grain is light and dark rather than confetti. Black and white stay exact.
- **Copier marks:** toner specks (0.15% of pixels at 1) and uneven darkening toward the frame edges (up to 20%).
- **Toned down (2026-10-05):** the first tuning (ink 0.6, xerox from 0.5, specks 0.4%, edges 35%) was too strong; shuffle now picks print in 0.15–0.4 (was 0.2–0.7). `SHEETS=1 npx playwright test sheets -g print` renders a comparison sheet.
- **Resolution:** like grain (D4 exception) it is defined per output pixel, so preview and export match at the same size; the export harness runs with every finish on to hold that.

## D37. Planes: seeded torn-paper quads that share the ramp's colors

- **Pattern:** `{ kind: 'planes', colors, count, roughness, seed }`. A seed lays out 4–24 convex quads (count slider), back to front, over a fixed field (x ±1.2, y ±0.6), so a wider frame shows more of the same collage (D4). Angles cluster around a seeded base angle or base + 90°, ±20°, for a cubist feel. Rectangles of aspect 1–3 get their corners jittered into quads. Later planes are smaller, and summed area is about 2× the field.
- **Colors:** the ramp's stop colors in position order (the editor keeps one set of stops for linear, radial, conic and planes). Positions and blends are ignored, so the stop strip and blend menu are hidden. One color is the background, and no plane takes the color of the plane right below it.
- **Per pixel:** the layout is prepared on the CPU and uploaded as uniforms. The shader composites the planes in linear RGB, using each quad's min-edge distance with ~0.75 px antialiasing. Torn edges add value-noise fBm to that distance (up to 0.012 units at roughness 1), and a thin warm paper rim shows inside a torn edge. Noise is only evaluated near an edge.
- **Blend:** a slider adds up to 0.012 units (about 13 px at 1080p) to the edge half width, linear in the slider, so the lines blur slightly while the planes stay sharp. A first version went up to 0.15 and made the whole image look out of focus. The paper rim fades out as 1 − blend.
- **With the rest:** transform and warp bend the planes. Vignette, print and grain apply. Bands are off for planes, since the colors are already flat. Shuffle re-rolls the seed and count (0.15–0.65) and keeps roughness and blend. The CPU reference matches within 1 level unwarped; with a warp, a few antialiased edge pixels differ by up to ~4 (fp32 coordinates against a hard edge).

## D38. Mesh shuffle: less even, more defined

- **Why:** every shuffle laid out an equally even scatter of similar-sized points with soft blends (best-candidate with 10 tries, radius 0.5–0.85 of the spacing, blend 0.1–0.5). The positions changed, but the compositions all looked alike and always vague.
- **Change:** each shuffle draws 3–10 best-candidate tries (looser to more even), radii of 0.4–1.05 of the spacing, and with probability 0.4 one dominant point at 1.6× size. Blend is drawn from 0.1–0.8. The no-clumping test (no two points closer than 0.2 spacings) still holds.

## D39. The main shuffle randomizes the style too

- **Why:** shuffle only re-rolled the active gradient type, so it never showed what else the app can do. The user wants it to be a full randomize and a quick showcase.
- **Change:** `shuffleDesign` takes `style` (used together with `layout`): on its own random stream, it picks the pattern kind (mesh 35%, planes 30%, linear 15%, radial and conic 10% each) and the finishes (vignette 30%, print 25%, bands 15% and never on planes), plus planes roughness and blend. The colors carry over to the new kind (ramps hold up to 8). The main shuffle sets `style` unless layout is locked, so "keep layout" also keeps the kind and finishes. Color-only shuffles and the opening shuffle keep the kind (the app still opens on a mesh). Grain is never shuffled. Rotation is (see D39a).
- **Sizes:** the size menu lists resolutions only, grouped into desktop, mobile (current iPhone and Android natives) and tablet, with no device names. The default is 3840 × 2160.

### D39a. The main shuffle also rotates

- **Why:** shuffles felt stale, since every result sat at the same orientation.
- **Change:** with `layout` and `style`, the Adjust rotation is drawn from 0–359° on its own stream (so other draws keep their values for a seed), for every pattern kind. Turning moves where the colors sit, so it pays off on symmetric patterns (radial, conic, linear, grid) too; a shuffled grid is laid out over the bounding box of the turned (and zoomed) frame, so its edges never clamp into view. Zoom and flips are kept. Mesh points are laid out on screen and mapped through the new transform, so they land in view. Color-only and plain layout shuffles leave the rotation alone.

## D41. Noise and cells: ramp shapes driven by noise

- **Kinds:** `noise` and `cells` are ramp shapes like linear, radial and conic. They share the stops (and so the palette and the stop editor) and add `scale` (0.6–6 features per image height, exponential) and `seed` to the ramp. The angle is unused and hidden.
- **Noise:** two styles (`noiseStyle`). **Contour** (default): t = ½ − ½·cos(2π · 3 · fBm), with 3 octaves at half the frequency, so the ramp repeats in mirrored stripes along the noise's height lines (topographic, psychedelic) with no seams. **Ridged:** t = 0.5 + 0.6 · ridged fBm (3 octaves): veins and creases. A first version, plain cloudy fBm, was judged mid: a soft mesh with a warp already looks like that. Smooth and billow variants were tried on a sheet and dropped. A layout shuffle picks the style 50/50.
- **Cells:** Worley cells using the warp's Voronoi search. Each cell takes a hashed spot on the ramp (0.75 of its length), shaded by the distance to the cell's feature point (0.45 per cell unit). At a border both cells meet at their mean over ~0.75 output px, so edges are crisp but antialiased. Cells with similar spots show a soft crease where they meet.
- **Shader:** the noise library is shared with the warps (`NOISE_LIB`, `NOISE_CELLS`), with the warp's uniforms fenced to warp variants. The CPU reference reuses `noise.ts` and the Voronoi search in `warp.ts`.
- **Shuffle:** a layout shuffle re-rolls seed and scale (0.1–0.6). The style shuffle picks noise 10% and cells 8% of the time.

## D42. Aurora: flowing ribbons over a dark sky

- **Pattern:** `{ kind: 'aurora', colors, count, glow, seed }` with colors from the ramp's stops (like planes). The darkest color, dimmed to 35% in linear RGB, is the sky. The others take turns as 2–6 ribbons.
- **A ribbon:** its center line is a seeded height (spread over ±0.32) plus a tilt plus fBm along x. It glows with a crisp Gaussian lower edge (¼ of the fade) and an exponential upward fade of 0.025–0.13 units (glow slider). Vertical curtain rays come from fBm stretched along y, cutting up to 45%. A coarse mask fades each curtain in and out along its length, leaving dark gaps.
- **Blend:** ribbons are screen-blended in linear RGB, so overlaps glow without passing 1. Bands are off, as for planes.
- **Tuning:** a first version with wider fades (up to 0.22), no mask and finer rays (30) filled the whole sky and read as layered hills with grainy streaks.
- **Shuffle:** a layout shuffle re-rolls seed, ribbon count (0.1–0.8) and glow (0.2–0.8). The style shuffle picks aurora 9% of the time.

## D43. Grid mesh: a bendable grid of colored nodes (revisits D11)

- **Pattern:** `{ kind: 'grid', rows, cols, nodes, rest }`, with 2–5 rows and 2–5 columns, nodes row-major from the bottom, and a rest grid that spans ±rest (the frame at creation). Each node's offset from its rest spot bends the grid.
- **Math:** the forward map is F(q) = q + D(q), where D interpolates the node offsets with Catmull-Rom (tensor product, indices clamped, so D is constant beyond the rest rectangle). A pixel p is pulled back by 8 Newton steps on F(q) = p, starting at q = p. Below a Jacobian determinant of 1e-3 the step is a plain fixed-point one, and steps are capped at 0.25 units. The color is the nodes' Oklab colors interpolated at q (Catmull-Rom), then the mesh's gamut clip. No patch inversion and no patch search: exact wherever the grid doesn't fold, and finite and tile-independent where it does.
- **Folds are prevented in the editor:** edge nodes slide only along their edge (corners stay put, so the grid always spans its frame), and every node stays inside its row and column neighbors with an 8% margin. Shuffle jitters nodes by at most 35% of a cell. A deliberately folded grid renders chaotically (Newton picks among several pull-backs), so tests check it only for tile independence.
- **Curves:** auto-smooth (Catmull-Rom); no tangent handles (user choice).
- **Editing:** node handles plus the bent grid lines (the forward map sampled 12 times per segment) on an overlay; drag or arrow-nudge nodes. Rows and columns are sliders; resizing places the new nodes where their rest spots land on the current grid and gives them the color there, so the picture stays put.
- **Colors:** the grid has its own palette owner (`grid`, next to mesh and ramp), since up to 25 nodes don't fit the 8 stops. A new palette has up to 5 colors, dealt over the nodes so each differs from its left and lower neighbors where it can. A palette from an image gives each node the image color nearest to it on screen.
- **Shuffle:** a layout shuffle picks 3–4 rows and columns and jitters the nodes over the frame. The style shuffle picks grid 14% of the time.

## D44. Saving: a versioned save in localStorage, undo over editor snapshots

- **Storage:** localStorage, one key (`wallpaper.design`, `cromatica.design` since D49). A design is a few KB of JSON, and there is no library of saved designs that would need IndexedDB.
- **Schema:** zod, in `src/design/schema.ts`. The save is `{ version, design }`; each version has a migration to the next, and the current schema requires every field, so the defaults that missing optional fields stood for are pinned in one place. `engineVersion` stays 1 and is checked on load. A save that fails validation is ignored whole (logged), and the app opens on a shuffle.
- **What is saved:** the design only. The other patterns' settings, the palette's rule and adjustments, the size preset and the shuffle locks are not; after a reload the palette counts as custom.
- **Undo:** snapshots of the editor (all five pattern settings, warp, grain, finish, transform and the palette state), not of the design, so undoing a pattern switch or a hue turn is exact. 100 steps, not kept across reloads. Steps are split at every pointer press and key press (not key repeats), with no timer; a change that isn't followed by a press is closed by the next undo.
- **Share links:** dropped from M6 (backlog).

## D45. Keep work: the design lives in the PNG, favourites stay small

- **Why:** D13 says only exported images last, yet the exported PNG doesn't say how it was made. A wallpaper you like should reopen as a design.
- **Design in the PNG:** the export writes the save envelope from D44 (`{ version, design }`) into an iTXt chunk. Dropping such a PNG on the window loads it through the same schema and migrations as autosave. A PNG without the chunk still goes to palette from image. The streaming encoder (D3) makes the extra chunk cheap. JPEG has no equivalent for now.
- **History:** the last ~20 shuffles in memory, for the session only, like undo.
- **Favourites:** a ♥ saves the design JSON to one localStorage key, capped at about 12, listed as palette swatch strips. No IndexedDB and no stored thumbnails: the user wants no database overhead for now.
- **Later:** a fuller library (thumbnails, folders, file import) is in the backlog.

## D46. Relief comes from neighbour sampling, not from a second pass

- **Idea:** evaluate the pattern at a few points around each pixel to get its local slope, treat the pattern as a height map, and light it. Each pixel still depends only on the design and its own position, so D2 and D4 hold and tiling stays exact. The cost is about five pattern evaluations per pixel instead of one.
- **Prototype:** `prototype/relief/` renders one pattern six ways: flat, satin, glass, liquid chrome, iridescent film and impasto.
- **First version:** satin and glass only, gentle, with one strength slider and 0 bit-identical to off. In the prototype the slopes were too strong and read as crumpled foil; chrome and iridescent were the loudest and the riskiest as everyday wallpapers, so they stay out for now.
- **Shared stage:** the same neighbour sampling is what the glitch backlog item needs (act on color boundaries), plus riso overprint and contour lines between near-identical colors. It is built once, for relief.

## D47. Looks are parked; onboarding tips instead

- **Why:** curated bundles would help new users, but the main shuffle already shows what the app can do (D39). Short first-visit tips about shuffling and dropping an image address adoption at lower cost.
- **Consequence:** "Looks" goes to the backlog; M7 gets an onboarding step.

## D48. Context overlays are UI, never part of the image

- **Rule:** platform mockups, crop frames and legibility warnings are drawn over the preview and never reach the renderer or an export, so D2 holds and the exported pixels are unchanged.
- **Zone data:** each platform's icon, clock and bar zones live in one data file, tagged with the OS version they were taken from. They change between OS releases, so they are data to keep up to date, not constants spread through the UI.

## D49. The app is called cromatica

- **Replaces** the working name from D15, for the app, the package and the repository.
- **Storage keys** use the `cromatica.` prefix: the autosave moved from `wallpaper.design` to `cromatica.design` and reads the old key once, so an existing save survives the rename. The design chunk in exported PNGs is `cromatica.design` from the start.

## D50. Aurora blend, and save version 3

- **Blend:** one slider, crisp ↔ soft, sets the ribbons' lower-edge width and how deep the rays cut the glow. New auroras use 0.35, sharper than before; shuffle picks 0.1–0.6.
- **Migration:** save version 3 adds `blend` to auroras. Version 2 auroras load with 0.6, which reproduces the look from before the slider. Saves written as version 3 can't be read by builds from before it.

## D51. M7 choices

- **Arrows:** ← → step the shuffle reel unless a form control or a point, node or stop handle has focus; nudging needs a focused handle.
- **Previews never count:** a picker hover or ↑↓ preview is not an undo step and is never saved; only a click commits.
- **Favourites:** 12, newest first, as swatch strips; adding a 13th drops the oldest and says so.
- **Pickers without thumbnails:** live thumbnails in the dropdowns were built and dropped; the instant preview on the main canvas does the job better.
- **Variations:** more freedom in bold cells (warp shape changes), less in gentle ones (seed changes scale with strength²), judged on a contact sheet.
- **Linked edits:** monochrome edits put every non-gray color on the edited hue; very light or dark near-neutrals keep their chroma, so a louder palette doesn't tint them (all rules).

## D52. Temperature removed; base hue stays

- **Decision (2026-10-07):** the "temp off/warm/cool" setting from M4 step 8 is removed, at the user's call.
- **What stays:** base hue is still an adjustment over the original colors (D27), with the same "~ hue …" status, reset and hand-edit rules; the adjustment layer now holds only the turn.
- **Saves:** temperature was a UI setting, never saved (M4), so no migration. Undo snapshots from before the change don't outlive the session.

## D53. Noise and print overlap: reconsider in polish

- **Observation (2026-10-07):** the noise (grain) and print sliders are very similar in use. Noise is super soft, and print can reach the same look, so noise looks redundant.
- **Naming:** "noise" is the better name overall; "noise (print)" is an option if both stay.
- **Decision:** no change now. Revisit both in M12 (UI decisions), together, and decide whether to merge, drop one or rename.
- **Related fix:** both are per output pixel (D4), so dragging either keeps the preview at full resolution; a half-resolution frame showed a different texture that snapped back on release.

## D54. M8 choices: relief and halftone

- **Height is lightness:** relief reads the pattern's Oklab lightness as height, the same for every pattern. Flat areas stay untouched, so relief shows on edges, bands and slopes; planes only get thin edge shading.
- **Light:** a direction control (degrees, fixed on screen, not turned with the image), at a fixed 40° elevation.
- **Surfaces:** satin and glass only. The user found the first sheet weak, but liked both live with the relief and light sliders, so the effect shipped as built; satin and glass stay the two surfaces.
- **Stipple dropped, halftone kept:** random stipple dots didn't work for the user; halftone ships alone, as one slider with no dot-style choice. Its name joins the noise and print naming review in M11 (D53).
- **Dots in image units:** halftone dots scale with the output, like the rest of the composition (D4), not per output pixel like grain.
- **Order:** pattern → relief → vignette → halftone → print → grain, chosen by the user after seeing it.
- **Shuffle:** relief and halftone come up sometimes and subtly; weights to revisit in M12.

## D55. Favourites at the bottom of the panel, lighter panels

- **Decision (2026-10-07):** favourites stay in the left panel, as a "favourites" section just above the footer, under colors. It starts folded when empty, opens by itself when a favourite is added (removing one never closes it), and grows upward into the spare height of the panel, if there is any.
- **Columns:** each favourite is its palette as a vertical column, first color on top; the columns share the panel's width (as many as fit).
- **Heart:** one bordered ♡/♥ button on the section's title line, so it stays visible when folded; it replaces the small ♡ in the footer. A kept design's ♥ and its border are red, the only color in the panel besides the wallpaper's own, so it stands out.
- **Tried and dropped:** thumbnails in a tall bottom dock, a right-hand rail of stripes (a second column that narrowed the preview), and a tab plus bottom dock under the preview.
- **Bottom of the panel:** colors and favourites sit just above the footer, so they are next to shuffle and download. This holds only while the panel has spare height; on a shorter window the content fills the panel, which scrolls as before. "+ more" expands in place, growing upward into the spare height while there is any, then downward.
- **Panels:** `mid` theme, a step lighter than before (#1b1b1a on a #0b0b0d canvas). A lighter variant (#232322) was too light. The canvas stays as dark as before.
- **Not done:** a flyout for the extra color settings (it covers the point handles).

## D56. M9 scope: four platforms, measured zones, contrast and busyness

- **Platforms:** Windows, macOS, Android and iOS ship together in M9, one current device each.
- **Zones are measured** from official screenshots and design guidelines (Apple HIG, Material, Windows), not drawn by eye, and stored with their OS version (D48).
- **Legibility** flags mid-tones only: zones where neither white nor black text reaches WCAG AA (3:1 for clocks, 4.5:1 for small text) over the zone's worst 10% of pixels. A busyness check (local detail) was built and dropped: the mockup itself shows how busy the area behind the text is, and more checks felt like overkill to the user.
- **Export set** (several sizes as a ZIP) moves to M11; M9 stays overlays only.
- **A "view" section** in the panel holds the "os context" picker and takes over the "show points/nodes" toggle. Every context is always listed; portrait outputs list the phone screens first. Arrowing through the list previews each one.
- **No crop frames:** dropped after building them. How an OS fits a wallpaper is not standard: macOS and Windows "Fill" crop the centre, but iOS lets the user pan and zoom, and Android depends on the launcher and picker. cromatica exports at each device's exact size, so there is nothing for the OS to crop; several devices are served by the M11 export set.

## D57. M10 (light/dark pairs) dropped

- **Decision (2026-10-08):** the feature is not shipped. It was built on `feat/light-dark-pairs` and works: the light palette moved into the low-key band (L 0.12–0.55, D26), each dark color hand-editable, a preview switch, and a two-file export. It was dropped as too niche for what it adds.
- **Why:** a dark version is already a few steps away. The key select regenerates a generated palette in "low" from the same seed (D28), and any palette can be edited by hand and exported again. A pair export only merges two of those exports, and no OS treats two files as one wallpaper.
- **macOS dynamic HEIC:** a macOS light/dark wallpaper is a 2-image HEVC HEIC with `apple_desktop:apr` XMP. Apple publishes no spec; the research rests on community sources. No browser encoder fits: libheif-js only decodes, x265 is GPL with HEVC patent questions, and WebCodecs HEVC encoding depends on the hardware (Safari about 91%, Chrome about 22–48%, Firefox about 0%). See `docs/research/heic-dynamic-wallpaper.md`.
- **Other platforms:** no primary source shows a one-file light/dark pair for Windows. iOS only has Apple's own adaptive wallpapers and a Shortcuts workaround (search snippets only). Android was left out of scope.
- **If it returns:** see the backlog entry in the roadmap.

## D58. M11 (Polish) split into four milestones, mobile becomes M15

- **Decision (2026-10-08):** M11 was too big. It is now M11 effects (backlog review, bold bands, brushed warp, bicubic patch mesh), M12 UI decisions (blend dropdown, relief, noise/print/halftone, then showcase examples), M13 performance and UX (adaptive preview resolution, full-screen preview, context-loss recovery, shader warm-up, keyboard shortcuts), and M14 lean panel (the status bar trial). Mobile layout moves from M12 to M15 (D55).
- **Dropped from M11:** the export set (ZIP), export progress and cancel, device presets and custom pixel sizes (they already exist), and the 1:1 loupe.
- **Showcase examples come last in M12:** they double as golden-image fixtures, so they wait until the finishes are settled.
- **M14 is a trial** that can run in parallel with almost any milestone. The status bar is built only if settings move into it to slim the left panel.
- **Backlog reorder:** bicubic patch mesh (prototype, parallel R&D investigation), share links (investigate; may be its own milestone), digital/glitch as a post-processing stage, the ink-blobs look as an optional panel of 3 to 4 settings, and the planes advanced panel (to be confirmed) now sit at the top.

## D59. M11 backlog review outcome

- **Decision (2026-10-08):** the backlog review that opens M11 is done.
- **Design in the JPEG:** kept as an experiment, next to share links. Not dropped.
- **Favourites, advanced:** dropped. M7's favourites list is enough; a JSON export and import stays under share links.
- **Light/dark pair:** dropped for good (confirms D57). The branch stays, nothing is planned.
- **Looks:** stay parked (D47).
- **Comment density:** wanted, as a one-off cleanup.
- **Technical section** (Display P3, 16-bit PNG, mozjpeg, WebGPU, LIC/Gabor): to be evaluated. Performance is the priority; Display P3 may matter for gamut.
- **Planes advanced panel:** needs a new discussion and brainstorm before any build.

## D60. Mesh bands get three styles (A, B, C)

- **Decision (2026-10-08):** a bold-bands option for the mesh was prototyped as two new styles beside today's. The user liked all three, so the bands row has an `A|B|C` segmented switch to the right of the slider, the active letter lit. Mesh only; ramps band their position, planes, aurora and grid have no bands.
- **Styles** (`Finish.bandStyle`, in code `weights`, `facets`, `layers`): A bands each point's influence in steps (today's look, the default). B bands the share of the two strongest points, so the image is flat polygons with stepped mixes and crisp borders. C blends smoothly, then steps the Oklab lightness at band centers (so the mean lightness holds), giving contour layers while hue and chroma stay smooth.
- **Same sliders:** bands sets the step count (24 down to 3) and edge softens the steps, for all three. On a mesh the readout is the 0.00–1.00 amount, not the step count: the count isn't a visible band count in any style (C steps lightness over 0–1, so an image spanning less shows fewer). Ramps keep the integer.
- **Why letters:** the styles are abstract; names would mean little in the panel. The names live in the code only.
- **Saves:** `bandStyle` defaults to `weights` when missing, so older saves, favourites and PNG-embedded designs render as before. No schema version bump (D44). Shuffles reset it to A.
- **Reference:** the CPU mesh evaluator implements B and C; browser tests compare the GPU with it for each style.
- **Seen on the sheets:** B is the boldest at every slider position but angular (Voronoi-like borders); C is the most organic but subtle at 3 steps; A is soft below about 0.6.

## D61. Brushed warp reworked, not removed

- **Decision (2026-10-08):** the user called brushed one of their least favorite shapes (it looked too perfect and predictable). Instead of removing it (which needed a migration of saved designs, D44), it was reworked and judged by eye on contact sheets of six seeds.
- **Problem:** one straight stroke direction and a single noise layer gave regular sawtooth wedges, all pointing the same way.
- **Change (`bristle`, `src/engine/warp.ts` and `shaders/warp/bristle.glsl`):** the stroke direction drifts up to 0.8 rad across the frame, so strokes curve and fan out; a finer bristle layer (14× across) mixes in; lines wobble across; the strength varies per stroke and along it (mask 0.15–1), so some strokes are bold and some barely show.
- **Compatibility:** saved designs keep the shape name, seed, amount and size, so they open and render, but with the new look. No schema change.
- **Relief:** the strokes are smooth ridges, so relief (D46) lights them well: satin gives silk or brushed-metal grooves, glass thin bright rims. Nothing in relief depends on the warp shape.
- **Not changed:** shuffle weight stays 0.4 (D35); worth revisiting with M12's relief and shuffle review.

## D62. Bicubic patch mesh not built; the grid gets lines

- **Decision (2026-10-08):** the bicubic patch mesh (D11, promoted to a prototype in M11) was evaluated against the grid (D43), which is already a bendable grid of colored nodes. Tangent handles and per-patch corner colors only refine the same family of soft blobs, so no separate pattern was built.
- **Findings on contact sheets:** with the warp off, a shuffled grid looks like a softer mesh. Bending the nodes past about 1.5× the shuffle's jitter tears (Newton pull-back on folds), not silky folds; real folds would need a patch-by-patch renderer.
- **Tried:** cloth shading (lightness by the grid's stretch, the Jacobian determinant): pillowy but not exotic, dropped. Grid lines drawn along the bent grid: liked by the user, kept.
- **Grid lines** (`GridMesh.lines`, [0, 1], missing = 0, no schema version bump): the lines of the rest grid, bent with it. Opacity reaches 1 at 0.5 and the width goes from 0.002 to 0.008 of the frame height, so a preview and an export match. The distance to a line is computed analytically from the inverse Jacobian (no screen derivatives), so the CPU reference has the same math. A line pushes the lightness by up to 0.32 toward the other end of the scale (smoothly, pivoting at 0.58), so it shows on both light and dark colors and doesn't break where the background crosses the pivot.
- **Lines follow half the warp (2026-10-10):** the colors take the whole warp, but the lines are drawn at the point half-way back to the unwarped one (`GRID_LINE_WARP = 0.5`, shader and CPU reference), so at full warp they wobble less than the pattern under them. With the warp off nothing changes. A second pull-back runs per pixel only when lines are on and a warp is moving the point.
- **Shuffle:** a layout shuffle turns lines on 60% of the time at 0.25–0.7, drawn last so the other layout values match earlier shuffles.
- **Still open:** whether the grid now earns its place next to the mesh. The user judges it after trying it.
- **Name:** the panel calls the grid pattern "net" (2026-10-08), since it is a bendable surface of colors with optional lines, not just a grid. Only the label changed; the kind stays `grid` in saves and code, so there is no migration.

## D63. M12 UI decisions: lighting group, shuffle ranges, one noise

- **Lighting (2026-10-08):** relief's three controls sit in one bordered group called "lighting": **amount** (was relief), **direction** (was light) and **surface** (unchanged: satin or glass). The saved fields keep their names (`relief`, `reliefLight`, `reliefStyle`); only the panel labels change, so there is no migration.
- **Shuffle ranges:** relief strength is now 0.1–0.5 (was 0.2–0.5) and halftone 0.1–0.35 (was 0.15–0.35). Chances stay at 15% and 12%.
- **One noise (D53):** print, halftone and grain are merged into one "noise" group: a type (**lithograph**, **xerox**, **halftone**, **grain**) and one **amount**. One type at a time, so halftone no longer combines with print. "Less is more" (user, 2026-10-08).
- **Grain came back (2026-10-08):** the first cut dropped it, then the user wanted an analog, vintage grain with good resolution as a fourth type. It is the old film-grain stage with two layers of smooth noise, a fine one (under 1 px, about white) and a clumpier one (about 1.9 px), a little chroma, strongest in midtones, and no size setting. Per output pixel (D4), like lithograph and xerox.
- **Grain shimmers while you adjust (2026-10-08):** the grain's pattern is seeded by the amount (one pattern per slider notch), so dragging the slider shows fresh grain, like the grain dials in Arc and Zen (the user's memory of them; their implementation was not checked). It is still a pure function of the saved design, so exports match the preview and tiles stay seamless; nothing new is saved. Lithograph and xerox keep one fixed pattern, as one physical sheet of paper would, and halftone is a regular screen.
- **Blend is gone (2026-10-08):** the per-stop blend choice (perceptual, vivid, hue short or long way) is removed from the panel and every ramp blends perceptually; the user found it overkill and not understandable. Saves move to schema version 6 with every stop set to perceptual. The engine's other blend modes stay in the code for now (nothing can select them), so a later cleanup can drop them. The lightness, intensity and hue sliders stay, behind "+ more": the picker and hex field only reach sRGB, and the sliders go beyond it (the "!" marker) and move one perceptual axis at a time. Revisit them in M14 if the panel needs slimming.
- **Halftone maximum:** the ink/paper contrast at amount 1 goes from 0.75 to 0.85 of the way to black and white. Higher (0.9) pushed the paper tone of saturated colors out of gamut.
- **Picking a type while noise is off** turns it on at 0.4, so the choice (and its preview) shows.
- **Previews on arrow keys, everywhere it can show:** a list previews each option on the canvas as the arrow keys or pointer move through it, and Escape puts it back. Already true for gradient, warp shape, mood, harmony and OS context; added for noise type, per-stop blend, value key and size preset (the preview frame takes the preset's shape). The export format list has nothing to show on the canvas.
- **Saved form:** `finish.noise = { type, amount }` replaces `design.grain`, `finish.print` and `finish.halftone` (schema version 5). The film-grain stage is removed from the shader; its CPU parameters and tests go with it.
- **Migration (version 4 to 5):** one noise is picked, in this order. A print below 0.7 becomes a lithograph of `print / 0.7` (the same pixels as before); a print of 0.7 or more becomes a xerox of the same amount (its screen now fades in from the start, so these look a little stronger). Otherwise a halftone keeps its amount. Otherwise the grain keeps its amount as the grain type (its old size setting is gone).
- **Engine mapping:** lithograph runs the print texture at 0 to 0.7 of the old scale with no screen; xerox runs it at the full scale with the thresholded screen blended in over the whole range; halftone keeps its dots; grain uses the film-grain shader.
- **Shuffle:** when the print and halftone rolls both hit, a coin picks one, so the odds of each are a little lower than before.

## D64. Shuffle locks: colors, pattern, adjust

- **Decision (2026-10-08):** the footer's `keep` toggles go from two (colors, layout) to three: **colors**, **pattern** (the pattern kind, layout and warp: the old layout lock) and **adjust** (the finishes: noise, vignette, bands, lighting). Pattern and adjust used to share one lock, so keeping the look of a pattern meant keeping its finishes too; now a shuffle can change the finishes only, or the pattern only.
- **The warp is split along the panel:** the warp shape and its variation seed sit in the pattern section, so they follow the pattern lock; the warp amount and size sit in the adjust section, so they follow the adjust lock (user, 2026-10-08: with the pattern kept, almost nothing was left to shuffle in adjust). The rotation is shuffled with the pattern (D39a); zoom and flips never are, so the transform needs no lock of its own.
- **Wider warp shuffle (user, 2026-10-08):** each shape's amount range now runs about 0.08 to 0.85 (was about 0.2 to 0.55) and its size range about 0.05 to 0.85 (was 0.2 to 0.55), so shuffles reach both near-flat and strongly bent warps. The weights are unchanged.
- **Lighting comes up more often (user, 2026-10-08):** a shuffle turns it on 30% of the time (was 15%); its strength range (0.1–0.5), light direction and surface odds are unchanged.
- **Palette moods on a shuffle (user, 2026-10-08):** mood "any" now resolves to natural 38%, vivid 17%, muted 16%, earthy 12%, pastel 15% and neon 2% (was natural 45, vivid 20, muted 20, earthy 15, never pastel or neon). Palettes for a given seed change with it. Pastel and neon are narrow in lightness and chroma, so a few palettes (monochrome pastel of six or more colors) come slightly short of the spacing and lightness spread the generator aims at; the tests allow for that, and the generator is left alone. Harmony rule odds are unchanged.
- **Noise sits last** in the main adjust settings, below the warp, the pattern-specific sliders and the bands.
- **Same roll either way:** the pattern kind is still drawn when the pattern is kept, so the finishes of a shuffle come out the same whether or not the pattern is locked; with nothing locked the draw order is unchanged, so existing shuffles don't change.
- **Shuffle button** is disabled only when all three are locked. The locks are not saved with the design (D44), as before.
- **"More like this"** is not affected: it already keeps the palette, kind, finishes and transform and only nudges the layout and warp.
- **Fit:** the row takes the label column down to 4ch and the gap to 2 px to fit the 273 px panel; the fallback would be shorter words (`color`, `shape`, `finish`).

## D65. Showcase images, no golden-image fixtures

- **Decision (2026-10-10):** the README shows nine images the user generated and picked in the app (a 3×3 grid, `docs/examples/`, 1200×675 JPEGs cropped from the 4K PNG exports), replacing the old four. Each pattern does not get three reference designs, and there are no golden-image fixtures: pixel-comparison tests would break on every deliberate change to a finish, and the unit and e2e tests already cover behaviour.
- **Originals:** the 4K PNG exports (5–17 MB each, each carrying its design) are not committed.

## D66. Blend modes removed from the code; status bar, per-color settings and shuffle tuning parked

- **Decision (2026-10-10):** the unreachable per-stop blend modes (`oklab-chroma`, `oklch-short`, `oklch-long`) and the stop's `blend` field are gone from the code (D63 had only removed the choice from the UI). Ramps blend in Oklab, as before, so no design changes. Saves still load: the stop schema ignores an old `blend` key and the save version stays 6.
- **Status bar:** the user wants to try moving global and view settings into a bottom status bar (M14). Not built yet.
- **Per-color settings:** still undecided whether the single-color hue, lightness and intensity controls stay (M14).
- **Shuffle tuning:** the user wants a way to make shuffle avoid things they don't like. Parked as M16; the smallest option (exclusion toggles) is the suggested start.

## D67. Full-screen preview is the browser's full screen

- **Decision (2026-10-10):** `F` or the ⛶ button in the panel header (it stays when the panel is collapsed) calls the Fullscreen API on the page. The panel, the handles and the tips are hidden, zoom and pan are off, and the canvas fills the screen at its real pixel density. A × in the top-right corner appears on pointer movement and fades after 2 s. Esc (the browser's own) and `F` leave. The app state only follows `fullscreenchange`, so it can't disagree with the browser.
- **No in-window variant:** collapsing the panel already gives a full-width preview, so a second mode that only hides the panel adds nothing. Where the API is missing (iPhone Safari) the button is not shown.
- **OS context stays:** the chosen OS mockup (D48) is drawn in full screen too, since judging the wallpaper under the real dock, menu bar and clock is much of the point.
- **Later (M14):** if the status bar happens, the full-screen button moves there.

## D68. Keyboard shortcuts, a shortcut card, and a labeled more-like-this button

- **Decision (2026-10-10):** new keys, all ignored in text fields like the existing ones: `K` keeps or releases the current design in favourites (the ♡), `1` `2` `3` toggle keep colors, pattern and adjust, `P` folds or unfolds the panel, `?` opens the shortcut card, and ⌘S or Ctrl+S downloads (even from a text field, since the browser's save-page dialog is no use here).
- **Shortcut card:** a ⌨ button in the panel header (and `?`) opens a card listing every shortcut in three groups (explore, keep, view); Esc or "close" closes it. The ? tips button keeps the short first-visit tips, which now list more like this second and point to `?`. The two cards never show together.
- **More like this:** the small ⊞ icon on the "recent" row became a labeled `[ more like this M ]` button beside shuffle; download and the format list moved to a row below. The collapsed bar stays shuffle and download.
- **Not bound:** export format and size presets (rarely changed mid-flow), and extra arrow-key actions (the panel's controls own them).

## D69. Preview resolution while editing; PNG deflate and shader warm-up dropped

- **Decision (2026-10-10):** the preview no longer pops when a noise is on. Noise is per output pixel, so at half resolution it is twice as coarse and snaps back on sharpening. Before, only edits to the noise itself kept full resolution; dragging the lighting amount with a noise on dropped to half. Now any edit while a noise is on stays at full resolution (e2e: 932 px → 466 px before, 932 px after).
- **Gradual drop:** the editing resolution follows the measured cost instead of a fixed half: `scale = sqrt(16 ms / cost)`, in eighths, between 1/2 and 1, and only above a 20 ms full-frame budget (was 12 ms, then always 1/2). The cost estimate is kept up to date from every frame (divided by the pixel count, smoothed), not only from settled full-resolution ones, and frames that compiled a shader are left out: a compile on the first frame of a new variant used to read as an expensive pattern and drop the next edits to half resolution.
- **Measured on a real GPU** (Apple M4, system Chrome with Metal, headless, driven by Playwright; the bundled test Chromium is SwiftShader and says nothing about GPUs): 60 shuffled designs at 1100×620 take a median 2.1 ms (p90 6, max 9); at 2200×1240 (retina fit) 3.4 ms (p90 20, max 34); at 3840×2160 9.4 ms (p90 58, max 101). Grids and aurora with lighting on are the dear ones. So the 20 ms budget keeps almost everything at full resolution.
- **Dropped:** a faster PNG deflate. A 5K image takes about 1.3 s to compress with the native default level and 0.4 s at level 1 (17% bigger file), and the export feels fine; it would also add a dependency.
- **Shader compiles, measured on the same GPU:** a frame that compiles a new program variant takes a median 158 ms (p90 200, max 291) against 1.6 ms on a known one, and 75 of 80 shuffles needed a new variant (the earlier "3–10 ms" came from SwiftShader). Warm-up was still skipped, by the user's call: the hitch is small, and compiling in the background (`KHR_parallel_shader_compile`) would only stop the freeze, not the ~160 ms wait for the new look. Fewer variants (warp, relief and halftone as runtime branches) would remove most compiles but is an engine refactor; revisit if it starts to bother.

## D70. Zoom stays a CSS stretch until it can be true to the export

- **Decision (2026-10-10):** a zoom that draws the visible part at native screen resolution was built and tried, then dropped before merging. Noise (grain, lithograph, xerox) is per output pixel (D4), and zoomed the preview's output grid changes with every zoom step, so the grain re-rolled and moved. It was also not the grain of the chosen output size: a zoomed preview must look like the export, not like a different resolution.
- **What the user wants:** zoomed in must be true to the chosen output resolution (or to screen resolution), never an invented one. So the zoom stays the CSS stretch (stable, soft) until it can be done that way.
- **What a true zoom needs:** noise looked up on the export's pixel grid (export size / preview size mapped per pixel, so it does not change with zoom, pan, density or the adaptive drop, and the export stays bit-identical); 100% meaning export pixels, so that view shows the real grain; dither left on the screen grid. The grain at fit view would change a little (it would depend on the export size). Not built.
- **What is fake and what is not:** only the pixel-sized finishes (grain, lithograph, xerox, dither) exist at the export's pixel size and nothing finer; the pattern itself (gradients, mesh, bands, cells, halftone dots) is resolution-independent, so showing it sharper is true. A true zoom is native up to one export pixel per screen pixel, then enlarged export pixels beyond that, as when zooming into the file.
- **Preview grain is approximate (2026-10-15):** the preview draws one grain speck per buffer pixel, so it only matches the export at 1:1. A fit view of a large export has coarser grain relative to the image, and below a device pixel ratio of 1 the browser stretches the buffer and softens it further. Not fixed: it needs the true zoom above.
- **Kept:** a patch of the abandoned attempt (canvas outside the zoomed frame, tile rendering of the visible part, 304 lines) is outside the repo at `~/code/zoom-native-res.patch`. Measured with it: the visible part matched the fitted image within about 1 level of 255, and a frame cost about one screen of pixels at any zoom.

## D71. Context icons are generic stand-ins; the menu bar text color is a guess

- **Decision (2026-10-10):** the macOS and Windows context previews draw folders and generic app icons (M17) instead of neutral boxes. Shapes and glyphs are generic, never real app icons or logos. They are overlays only (D48).
- **Folder names:** lowercase lorem ipsum, always white with a shadow. Both OSes draw desktop labels white whatever the wallpaper (from memory, not checked against a source), so the labels are not part of the legibility check.
- **Menu bar text color:** macOS picks it from the wallpaper under the bar, and Apple does not document how. The preview reuses M9's rule (the worst 10% of pixels against black or white text), and the menu text and clock follow the bar's verdict. It can disagree with a real Mac on a bar that is dark at one end and light at the other. Measuring where a real Mac flips (flat grays and splits) would fix it; the user judged the current guess good enough.

## D72. The design travels in exported JPEGs too, as XMP

- **Decision (2026-10-10):** a JPEG export carries the same save envelope as the PNG (D45), and dropping it reopens the design at its exported size. Built as the experiment D59 asked for; whether it survives sharing is still to be judged.
- **Format:** an XMP packet in an APP1 segment, with the envelope in a `cromatica:design` property (XML-escaped) under the namespace `https://github.com/zepocas/cromatica/ns/1.0/`. XMP rather than a COM comment because it is the metadata block editors and viewers are most likely to keep.
- **Size:** measured over 3000 shuffled designs, the envelope is 0.6 to 2 KB (median 0.7 KB), about 30 times under one segment's 64 KB. A design that would not fit is exported without it, like a design that fails validation in the PNG.
- **Splice:** the worker adds the segment after `canvas.convertToBlob`, right after the JFIF header, with `Blob.slice`, so the encoded file is never copied into memory. The reader walks the segment headers up to the image data (`src/export/jpeg.ts`); `readExportedDesign` sniffs PNG, then JPEG.
- **Checked:** Chrome's encoder output reopens through a drop (e2e), and macOS `sips` still decodes it.
- **Not checked:** which services and editors keep the segment. Anything that re-encodes strips it, as D45 expected.

## D73. A bottom status bar for global and view settings; shuffle lock; bordered buttons

- **Decision (2026-10-11):** the M14 trial is kept. A status bar sits under the preview, next to the docked panel (full width when the panel is collapsed) and hidden in full screen. It holds the settings that are about the whole app or the view, not the design: file format, the shuffle lock, recent shuffles, os context, the mesh points / grid nodes toggle, zoom and full screen. Design settings stay in the panel. Groups are divided by full-height rules, not characters.
- **Tried and dropped:** the output size (it is in the panel already) and an autosave readout ("saving… / saved"): it flickered on every edit and the user read it as images being saved.
- **Shuffle lock:** the keep checkboxes are padlocks (shut: shuffling leaves that part alone) under the label "shuffle lock". Locked parts are not dimmed, because they can still be edited by hand. A padlock on each section header is a possible next step.
- **Buttons:** one bordered style for actions (shuffle filled, more like this outlined, download, reset, remix, got it, close, again); brackets stay only on the toggles and choosers, which show state. Key hints are in the tooltips, not on the labels (reverses the labeled keys of D68). The format list is a dropdown in the bar, not a button.
- **Panel:** the custom width and height boxes show only when the size is "custom" (choosing it starts from the size shown). Adding or removing a favourite is an undo step: one history covers the design and the favourites list.
- **Shuffle nudge:** until a first visitor has shuffled once, the shuffle button's fill pulses (a color change, so it stays with reduced motion on). The flag is stored in the browser; `?default` and the collapsed panel never pulse.
- **Open:** the bar is about 1200px wide and does not wrap, so narrow windows overflow (deferred, to be settled with M15); the per-color hue, lightness and intensity controls (M14); whether the first-time experience needs an easy mode.

## D74. Global brightness, contrast and saturation replace the per-color sliders

- **Decision (2026-10-11):** the selected color's lightness, intensity and hue sliders are gone. The picker and hex field edit a single color; the whole palette is graded by **brightness**, **contrast** and **saturation** sliders next to base hue, behind the colors' "+ more" (saturation was added a little later the same day).
- **Model:** they join base hue as adjustments over the original colors (D27): `grade(original)` with a hue turn, brightness and contrast, one reset, a "~ hue … · brightness … · contrast …" status, and a hand edit bakes it in. Not saved in the design or share links, like base hue.
- **Math (`gradePalette`, `src/color/linked.ts`):** contrast scales logit(L) around the palette's mean by 3^contrast (±1 gives a third to triple), so the lightness order never changes; brightness shifts logit(L) by up to ±1.5; saturation scales chroma (-1 gray, +1 triples), capped to the gamut, near-neutral anchors untouched.
- **Hue:** base hue already turns the palette, so no separate hue slider.

## D75. Pins on the image adjust the picked colors

- **Decision (2026-10-11):** after a palette from image (D25), a ◉ button in the colors header opens a small window with the whole image and one pin per color of the active pattern. Dragging a pin gives its color the color found there; pressing on the bare image adds a color and carries on dragging it, or, when the pattern can't grow (a net, or any pattern at its limit of points or stops), replaces the selected color with the one there, so a click always does something; right-clicking a pin removes it (Ctrl+click is a right-click on a Mac, so it never adds); × or Esc closes. The user asked for this to be closer to photogradient, with pins rather than sliders, in a window of its own rather than over the canvas, and on every pattern, not only the mesh.
- **A window, not the canvas:** a first version covered the canvas with the image. The user wanted a pop-up instead, so the design stays visible and changes as pins move, and the canvas keeps its own handles. The window floats top right, can be dragged by its title, and is at most 360 px wide and half the viewport high.
- **Mesh: pins are the points.** A pin's place on the image is its point's place in the frame, read back through the cover mapping (`imageToFrame`, `frameToImage`; `imageLayout` uses the same one), so undo, redo, shuffles and moving the canvas handles keep the pins right, and each drag moves the point too. The part of the image the frame shows is outlined and the rest dimmed; pins stay inside it, so no point lands in a cropped area.
- **Other patterns: pins only pick colors.** Stops (linear, radial, conic, noise, cells, planes, aurora) and grid nodes have no place in the frame, so where a pin sits changes nothing in the pattern. Pin i is color i. After an import a pin starts where its color was found; later it is kept while the image there still matches its color (ΔE_OK under 0.08) and otherwise moved to where the image matches it best (`nearestSample` over a 40 × 40 grid of the sample), spread apart so equal colors do not pile up. That keeps pins sensible after an undo, an edit or a hue shift without a second state. Stops can be added and removed as in the colors list; a net's node count is fixed by its rows and columns, so the window carries − and + steppers for rows and columns (the same resize as the Adjust sliders, which keeps the picture and gives new nodes the color already there), and every new node gets a pin.
- **Color:** the mean of a small Oklab square (about 1.2% of the image's long side) around the pin, so one noisy pixel does not decide. It comes from the same 256 px sample the automatic pick uses; the window shows the original file.
- **Session only:** the file and its sample stay in memory until the next import or reload, never saved, never in the autosave, the design chunk or an export. Dropping an image exported from here reopens its design (D45, D72) and does not count as an import.
- **Opening:** the window opens by itself after an import (a picked or dropped image), so the picked colors can be adjusted at once. The ◉ button in the colors header shows only once an image has been imported, and closes or reopens the window. An earlier version showed it greyed out from the start, after a user with a saved non-mesh design looked for a button that was not there (pins were mesh-only then); with pins on every pattern, hiding it until there is an image is clear enough.
- **Not built:** keeping the window inside the viewport after a drag, resizing it, touch handling (M15).

## D76. Shuffle is tuned towards dark, calm, well-defined designs, with a surprise slot and per-kind profiles

- **Decision (2026-10-12/13, M16):** the shuffle's weights and ranges are retuned to the user's taste: darker palettes with close hues, shapes that read as defined (not blurry, not busy), nothing in the "happy" light range. No new settings; every change is a number in `src/design/shuffle.ts` or `src/color/harmony.ts`. Exclusion toggles (the M16 first idea) were dropped for that reason.
- **Method:** a numbered contact sheet of 60 real shuffles (`SHEETS=1 npx playwright test sheets -g shuffle-sheets`, `SHUFFLE_SHEET_SEED` shifts the seeds, `SHUFFLE_SHEET_KIND` shows one kind), scored by the user 1-5 (5 mine, 4 close, 3 neutral, 2 off, 1 never) with optional reason tags (too light, too blurry, too busy, ...). Six rounds; the mean score went 2.65, 2.80, 2.93, 3.15, 3.13. A throwaway HTML scorer and the analysis scripts lived in /tmp, not in the repo.
- **Palette:** key (low / full / high) 87 / 10 / 3 (was 15 / 77 / 8, the lowest-scored tiles were always full or high key); rules analogous 45, monochrome 10, complementary 14, split 12, triadic 10, tetradic 9; moods natural 38, muted 28, earthy 18, vivid 10, pastel 3, neon 3; `MIN_L_SPAN` 0.25 to 0.22 (0.20 broke the vivid single-accent test).
- **Pattern kind:** planes 22, cells 22, grid 14, mesh 12, aurora 8, conic 8, noise 6, linear 5, radial 3. Cells scored best (about 3.7), radial and mesh worst.
- **Finishes:** bands 40% (clear gain), vignette 55%, grain (print) 30% at 0.10-0.28 (a stronger, likelier grain drew "too strong" tags), lighting (relief) 25% (the scores disliked it, the user likes it; later rounds were neutral to positive, and on mesh clearly positive).
- **Mesh:** a layout shuffle draws a composition: scatter 20, clusters 25, line 15, arc 15, one side 25 (`composePoints`); best-candidate scatter alone made every mesh an even sprinkle. Sharpness 0.45-0.9, tighter blobs, one dominant point 50% of the time, points may sit further off-frame, never two stacked (`minGap`). Colors are still dealt greedily (a dark-to-light sweep was tried and removed: the user said the position of the points was the issue, not the colors).
- **Feature scale:** noise and cells scale 0.18-0.75 (bigger). The transform's zoom is still never shuffled, except for planes (below).
- **Planes (user observations):** most shuffles zoom in 1.5-2.4x (85%) so there are fewer, larger planes; torn edges with the paper rim are rare (15%) and faint (0.1-0.35); a little edge softness (60%, 0.1-0.4). A style shuffle resets a leftover planes zoom to 1 when it lands on another kind; other kinds keep the user's zoom.
- **Per-kind profiles (`KIND_PROFILE`):** a kind scales the warp weights and the finish chances. Only planes has one: smooth warps (curl, waves, circular, oval, marble) x1.5, hard cuts (rows, columns, voronoi, worley) x0.4, ridged x0.5; grain x2, lighting x0.4, vignette x1.25 (pooled over 127 planes tiles: grain 3.5 with vs 2.57 without, lighting 2.35 vs 2.98, vignette 3.0 vs 2.72). Warp weights: curl and waves 1.2, ridged 0.7, fbm 0.8, marble 0.6.
- **Surprise slot (`SURPRISE_CHANCE` = 1/6):** one shuffle in six, picked from the seed on its own stream, draws everything from the old even tables (kept as `*Flat` entries) and skips the kind profiles, so the range of the app stays visible. It makes most of the light palettes; that is intended, and the user does not rate it as a measure of the tuning.
- **Seeds:** the tuning changes what a seed alone produces. Saved designs keep their explicit parameters, so nothing saved changes.
- **Not done / open:** planes read "too contrasty" in the last planes-only sheet (11 tags in 60; cause unknown, a narrower lightness span for planes palettes is the likely lever and needs palette generation to know the kind); a stratified per-kind tuning (each kind on its own sheet, warps balanced and grouped into families, finishes switched on and off in balance) for mesh, grid, linear, radial and aurora; and pattern previews in the select box, to try later.

## D77. Per-kind profiles for mesh, grid, linear, radial and aurora, from stratified sheets

- **Decision (2026-10-13):** `KIND_PROFILE` (D76) gets entries for mesh, grid, linear, radial and aurora, from one stratified sheet per kind. Cells (about 3.7), conic and noise are left out; planes keeps its own.
- **Method:** `SHEETS=1 SHEET_KIND=<kind> SHEETS_DIR=<dir> PORT=<port> npx playwright test sheets -g kind-sheets` makes 60 tiles of one kind, never from the surprise slot. Each of four warp families is shown 15 times (smooth: domain, fbm, simplex, curl, waves; directional: rows, columns, circular, oval, bristle; cellular: worley, voronoi; hard-cut: ridged, marble; `none` is left out). Grain, lighting, vignette and bands are switched on and off in balance (16 combinations, 8 for aurora, which has no bands), so each effect is measured on its own. The user scored the form only, not the colors (the palettes are still random per tile; they are spread evenly over the combinations, so they average out). Reason tags became form tags (edges too hard, lighting/vignette too strong, bands unwanted, ...).
- **Mesh (mean 3.40):** grain 3.03 to 3.77 and vignette 3.03 to 3.77, adding up (neither 2.73, both 4.20); lighting -0.16, bands -0.23 (within noise); voronoi 2.43 (7 tiles). Profile: grain x2, vignette x1.45, voronoi x0.5.
- **Grid (3.25):** grain +0.44, lighting +0.29, vignette -0.64; hard-cut shapes drew "too busy" (5 of 15 against 0 to 1 in the others). Grain x1.5, vignette x0.4, ridged and marble x0.6.
- **Linear (3.07):** grain +1.0, bands +0.53, lighting -0.27; "too plain" 10 and "flat/dull" 7 tags in 60. Grain x2, bands x1.5, lighting x0.7.
- **Radial (3.41):** grain +0.69, the rest neutral; 19 "too busy" tags, mostly hard-cut (7 of 14) and with lighting (13 of 31 against 6 of 29). Grain x2, lighting x0.5, ridged and marble x0.5, voronoi x0.7.
- **Aurora (3.05):** smooth 3.47 against cellular 2.73 and hard-cut 2.80; grain +0.43, lighting -0.44, vignette -0.37; 17 "too busy" (8 of 15 hard-cut) and 6 "lighting too strong". Grain x1.5, lighting x0.4, vignette x0.6, marble x0.5, ridged x0.6, voronoi x0.5, worley x0.7.
- **Evidence is thin:** 60 tiles per kind, 3 per directional or smooth shape, 7 to 8 per cellular or hard-cut shape. Only grain (and the vignette on mesh) has an effect clearly beyond noise; the warp multipliers follow the "too busy" tags and the lowest shapes and are cautious. Finishes of a kept pattern (finish-only shuffle) follow the profile of the kept pattern's kind.
- **Not done:** planes "too contrasty" (needs the palette to know the kind); a mixed random sheet to check the new profiles as a whole; cells, conic and noise profiles.

## D78. Narrower dynamic range in palettes, and larger features in shuffles

- **Decision (2026-10-13):** a wallpaper wants no near-black beside light tones (text and icons need one ground, light and dark modes both have to work). The low key's lightness band now starts at 0.17 (was 0.12) and the random lightness span of a non-monochrome palette is at most 0.5 (was 0.6; `MAX_L_SPAN` in `src/color/harmony.ts`). Monochrome, the full-key mood bands and the near-black anchor chance are unchanged. A measure of the rendered image's lightness range (its 5th to 95th percentile) would also catch finishes pushing a palette to black; not built.
- **Evidence:** a normal shuffle sheet of 60 before the change had 9 "too contrasty" tags (those tiles averaged 2.78) and a mean of 3.23; the same sheet type with the change (new seeds) had 4 tags, none on planes, and a mean of 3.55 (the best round, up from at most 3.15 in M16). That closes the "planes too contrasty" item of D76.
- **Larger features:** over 120 scored tiles "features too small" came on 12 of 27 cells, 5 of 26 planes and 5 of 6 marble tiles, and on noise. Shuffles now draw noise and cells scale 0.28-0.85 (was 0.18-0.75; WRONG DIRECTION, see D80), planes zoom 1.7-2.6 (was 1.5-2.4) and marble size 0-0.2 (was 0-0.4; marble is the densest warp, `density: 2`). Shuffle level only; the sliders and the engine are unchanged.
- **Awkward composition (open):** 28 of 120 tiles (mean 2.79). Rows and columns warps are tagged on 8 of 19 tiles (42%, against 23% overall), circular on 4 of 9, voronoi on 3 of 4, and 4 of 9 with no warp at all, so some of it is the base layout. The suspicion is rows and columns cutting a smooth gradient; a rule (those warps only on other bases, or at a low amount) needs a stratified sheet first.

## D79. Rows and columns warps dropped from aurora, planes, cells and noise

- **Decision (2026-10-13):** in `KIND_PROFILE`, rows and columns get weight 0 on aurora, planes, cells and noise, and x1.5 on radial and conic. Mesh, grid and linear are unchanged. The surprise slot still draws them anywhere.
- **Evidence:** D78 suspected rows and columns cutting a smooth gradient, and the existing sheets could not say where (about 6 tiles per kind). A sheet forced rows or columns on every kind (60 tiles, kinds interleaved, rows and columns alternating, amount 0.2 / 0.5 / 0.85, all finishes off, form scored): aurora mean 2.50 (6 of 6 tiles "awkward composition"), planes 2.83 (5 of 6), cells 3.00 (6 of 6), noise 3.14 (6 of 7); mesh 3.71 (1 of 7), grid 3.71 (3 of 7), linear 4.14 (0 of 7), radial 4.71 (0 of 7), conic 4.86 (0 of 7).
- **Amount does not matter:** awkward tags were 10 of 24 at 0.2, 7 of 18 at 0.5 and 10 of 18 at 0.85, and the four bad kinds were awkward even at 0.2, so a lower cap would not fix it; the shapes are left out instead. Planes already had them at x0.4 (D76).
- **Grid left alone:** 3 of 7 awkward but mean 3.71; the grid profile already lowers hard-cut shapes. Rows and columns suit smooth bases (linear, radial, conic); radial and conic get x1.5.
- **Method:** test `forced-warp-sheets` in `tests/e2e/sheets.spec.ts` (`SHEETS=1 SHEETS_FORCE_WARP=rows,columns SHEET_CELL_W=1280 SHEETS_DIR=<dir> PORT=<port>`).
- **Circular, voronoi, none (second sheet, same method, 60 tiles):** circular mean 3.79 and no warp 3.72, 0 awkward tiles each on all nine kinds, so neither is a problem and the base layouts are not (the 4 no-warp awkward tiles of D78 came from elsewhere, perhaps finishes or palettes). Voronoi mean 3.00, 8 of 18 awkward: all 6 on aurora, planes and cells, and low amount on every kind (mean 2.67 at 0.2 against 3.56 at 0.5; 0.85 was not drawn). Voronoi weight is now 0 on aurora, planes and cells (was 0.5, 0.4 and 1), and its shuffle amount range 0.35-0.85 (was 0.08-0.85). One tile per kind per amount, so the amount floor is a judgment from a consistent direction.
- **Worley, ridged, marble (third sheet, 60 tiles, rotated amounts):** most tiles scored 3, no outright failures. Ridged mean 3.06, 7 of 18 awkward, 4 of them on noise and cells (4 of 4 ridged tiles there; 3 of 14 elsewhere): ridged weight 0 on noise and cells. Worley mean 3.29, 2 of 24 awkward (noise 0.85, cells 0.5): x0.5 on noise and cells, thin evidence. Marble 3.28, none awkward but "features too small" on 7 of 18: 5 of the 6 tiles with size 0.12 or more were tagged, 2 of 12 below: marble shuffle size range 0-0.1 (was 0-0.2, D78). `SHEETS_ROTATE_AMOUNTS=1` spreads the amounts over the shapes.
- **Not done:** profiles for conic beyond this; the 0.85 end of voronoi; ridged 0.2 and marble 0.5 were not drawn.

## D80. Noise and cells scale was going the wrong way; cells profile

- **Decision (2026-10-14):** `RAMP_SHUFFLE.scale` is per kind, cells 0.12-0.42 and noise 0.05-0.32 (was one range, 0.28-0.85). The engine's `noiseFrequency = 0.6 * 10^scale` makes a higher scale **more and smaller** features, so the "larger features" tuning of D76 (0.1-0.6 to 0.18-0.75) and D78 (to 0.28-0.85) made them smaller each time. The surprise slot keeps the flat 0.1-0.6.
- **Evidence:** a validation sheet (val3, 60 whole designs, new seeds, normal shuffle) had "features too small" on 14 tiles, 7 of 11 cells and 6 of 6 noise. In the cells sheet, tiles with scale below 0.4 were rarely tagged (about 1 in 12, all marble or worley) and those above 0.6 mostly were; noise was tagged even at 0.34, hence its lower range. Not yet checked with a sheet at the new ranges.
- **Validation (val3):** mean 3.27 (val2 3.55, val1 3.23; 60 tiles, so differences of about 0.3 are within noise); "awkward composition" 6 tiles (val2 11, val1 17); surprise-slot tiles 2.44 against 3.41 for the tuned ones (9 against 51 tiles), so the tuning shows. "Too light" 8 tiles, 3 of them surprise, the rest in mesh, linear, grid and planes with light keys; cause still open. Circular warp 4.17 (6 tiles, no tags); oval 2.71 (7 tiles, 2 awkward) and bristle 2.0 (2 tiles) are the weak warps and untested alone.
- **Cells finishes (stratified sheet, 60 tiles, mean 4.13, the best kind):** grain on 4.30 against 3.97 off, lighting 3.97 on against 4.31, vignette 4.03 against 4.23, bands 4.03 against 4.24. Profile: grain x1.5, lighting x0.6, vignette x0.8, bands x0.7 (mild; the differences are about 1.5 standard errors each, in the same direction as the other kinds). Marble on cells 3.60 (9 of 15 "features too small", at any size up to 0.1, against 2 of 12 on other kinds), so marble x0.4 on cells. Worley (4.07) and the smooth warps (4.6) are fine.
- **Marble:** `size` 0 is already the largest marble; making it less busy needs the engine's density (`density: 2` in `warp.ts`), an engine setting, left for later.
- **Sidecars:** the sheet JSON now has `warpAmount`, `warpSize`, `scale` and `surprise` per tile.

## D81. D80 scale fix confirmed; marble density halved; bristle x0.7 on mesh, grid and cells

- **Decision (2026-10-14):** the marble warp's `density` in `warp.ts` is 1 (was 2), so its bands are twice as wide at every size. Bristle weight x0.7 on mesh, grid and cells. The noise and cells scale ranges of D80 stay.
- **Evidence (three designed sheets at the D80 code, 60 tiles each, form only):** cells mean 4.68 and noise 4.10. "Features too small" was on 13 of 60 cells tiles (9 marble) and 27 of 60 noise tiles (14 of the 15 marble tiles, marble mean 3.27); the other warps on cells averaged 4.3 to 5.0, and on noise "too small" showed no pattern by scale. So the scale direction is right and the rest is marble. Oval, bristle and circular forced on all nine kinds: oval 4.21, circular 3.89 ("too blurry" on 4 tiles), bristle 3.83 with "awkward composition" on 3 of 18 tiles (mesh, grid, cells; 2 tiles each, thin evidence, hence a mild x0.7).
- **Engine change:** marble renders differently for saved designs (wider bands, displacement still proportional to band spacing). No `engineVersion` bump or migration, since backwards compatibility is not a concern in development.
- **Marble check (forced on all nine kinds, 60 tiles, size 0-0.3, density 1):** mean 4.28 (was 3.28 at density 2), "features too small" on 8 of 60 (was 7 of 18). By size the means are flat (4.3, 4.3, 4.4, 3.9, 4.4 per 0.06 step); tags: none at 0.12-0.18, 4 of 11 at 0.18-0.24. Shuffle marble size range is now 0-0.15 (was 0-0.1). Weakest kinds noise 3.71 and planes 3.83 (6-7 tiles each, "too small" 3 and 2); conic 5.00, radial 4.86. Not acted on.
- **Not checked:** noise and mesh/aurora with oval and bristle (6 to 7 tiles per kind).

## D82. Fewer light palettes in the tuned shuffle

- **Decision (2026-10-14):** `KEY_WEIGHTS` (key 'any', tuned draws) is low 0.935, full 0.05, high 0.015 (was 0.87, 0.1, 0.03). The surprise slot keeps `KEY_WEIGHTS_FLAT`.
- **Evidence:** the three validation sheets (val1 to val3, 180 tiles, whole design scored), tuned tiles only (surprise seeds split out with `isSurpriseSeed`): low key 130 tiles, mean 3.64, "too light" on 1; full key 16 tiles, mean 3.19, "too light" on 10; high key 3 tiles, mean 2.0, "too light" on 3. Surprise tiles (31) are lower on every key (full 2.44, 25 tiles), as the control. So the "too light" tiles of D80 came from the full and high keys, not from one kind.
- **Mild on purpose:** 19 light tiles is thin, and full key scored 3.19, not bad; the weights are halved rather than zeroed. The explicit key setting in the UI is unchanged.
- **Noise finishes (same session, existing data):** the stratified noise sheet of D80 (60 tiles, finishes on and off in balance) gives grain 4.29 on (28 tiles) against 3.94 off, bands 3.93 against 4.25, lighting 4.16 against 4.03, vignette 4.07 against 4.12. Noise profile: grain x1.5, bands x0.7, like cells; lighting and vignette untouched. Conic has only 13 tiles in the validation rounds (nothing readable), so it still needs a stratified sheet.
- **Conic (stratified sheet, 60 tiles, form only):** mean 4.80, no tile at 2 or below, tags only "features too small" 3 and "awkward composition" 2. Finishes on against off: grain 4.86 / 4.74, lighting 4.87 / 4.73, vignette 4.74 / 4.86, bands 4.67 / 4.93; all within noise at the ceiling, so no conic finish profile. Weakest warps: columns 4.33 (3 tiles), marble 4.43 (7 tiles, 2 "too small"); thin.
- **Not done:** a lightness measure on the rendered image; a key and mood sheet. Revisit only if "too light" shows up again in a validation sheet.

## D83. D82 confirmed on a validation sheet; marble x0.6 on noise

- **Decision (2026-10-14):** in `KIND_PROFILE`, noise marble weight x0.6 (mild, like cells x0.4); noise scale cap 0.28 and 65% contour (below).
- **Evidence (val4, 60 whole designs, seeds 10000+, at the D82 code):** mean 3.82 (val1 3.23, val2 3.55, val3 3.27); "too light" 4 tiles against 8 (3 of them surprise slot); non-low keys 7 tiles against 14; tuned tiles 3.91, surprise 2.80 (5 tiles). So D82 did what it was meant to; the difference between rounds is partly noise.
- **Marble, oval, bristle forced on all nine kinds (60 tiles, form only, density 1):** marble 4.50 (24 tiles), bristle 4.28, oval 4.11. Marble on noise 4.00 with "features too small" on 3 of 3 (D81: 3.71, same tag), the only consistent weak cell. Aurora with oval and bristle 3.0 (2 tiles each, almost no tags) and bristle "too smoky" on 4 of 18 (1 tile per kind) are too thin to act on.
- **Noise base sheet (60 tiles, no warp, no finishes, contour and ridged x six scale bins, form only):** mean 4.22. "Features too small" by scale bin (each ±0.04): 0.02 to 0.26 on 2 of 40 tiles (means 4.4 to 4.6), 0.34 on 5 of 10 (4.10), 0.45 on 10 of 10 (3.30); "too big" never. So scale does drive it and the cliff is near 0.30; `RAMP_SHUFFLE.scale.noise` is 0.05-0.28 (was 0.05-0.32). Ridged 3.90 against contour 4.53 (30 tiles each, about 3 standard errors, lower at every scale up to 0.26 too), so shuffled noise is 65% contour (`RAMP_SHUFFLE.contourShare`; the surprise slot keeps 50/50). The "too small" tags in val4 and the marble sheet at low scale therefore come from the warps, not the base (my guess about fine octaves was wrong).
- **Also thin:** grid "too blurry" on 3 of 11 val4 tiles (mean 3.36).

## D84. Multi-monitor layout preview

- **Decision (2026-10-14, 2026-10-15):** an icon button (▭▭) next to "os context" in the status bar lays rectangles, one per monitor, over the wallpaper, to see what each screen would show of a spanned image. A preview only: nothing is exported, saved or part of the design.
- **Monitors are physical, not pixels (user's call):** a first version put one monitor pixel on one wallpaper pixel, which assumes nobody stretches a wallpaper. A monitor is now an aspect ratio (16:9, 16:10, 21:9, 32:9, 3:2, 4:3, 16:18) and a diagonal in inches (5 to 100), turned or not; the layout lives in hundredths of an inch, so a 27" and a 14" screen sit at their true relative size. Two 27" 16:9 monitors to start, up to six.
- **Fit, switchable (user's call):** _span_ covers the block's bounding box with the wallpaper at its own proportions, cropped on one axis (what the OS "fill" or "span" does); _stretch_ bends the wallpaper to exactly the block. The monitors keep their true shape in both: in stretch the preview draws the picture bent (the design is still rendered at its own aspect and the browser stretches it; `setDisplayAspect` in `preview.ts`, screen only), so each rectangle shows what its screen would.
- **The wallpaper stays put in span:** its place is pinned once a monitor is dragged, so rearranging never re-centres the image under the monitors (the first version re-derived it from the block after every move, which did exactly that). It is re-fitted only when the block's size changes (another shape, diagonal or turn, add, remove, reset, fit change) or when the block no longer fits inside it, as when a pair is stacked: then it covers the new block, scaled about where it was and pushed only as far as covering takes (`coverNear`).
- **Joined, like the OS arrangement views:** every monitor touches another along an edge (a corner does not count) and none overlap. A dragged monitor jumps to the nearest slot against a neighbour that keeps the block joined, follows the pointer along the shared edge, and lines up with the neighbour's start, middle or end, or flush with the wallpaper's edge, within 20 screen pixels. A move that would split the block (the middle of three) leaves the layout as it was. Removing a monitor, or a resize that cannot be placed, falls back to a row.
- **Inside the wallpaper, mostly:** in span a monitor can't be dragged off the image (user's call: no point in it). The exception is an arrangement the image can't cover, such as a 32" over a 27", which makes the block taller than the image: that slot is taken only when the pointer is clearly there (a pull of 35% of the monitor's short side), then the wallpaper re-fits.
- **Drag one, Shift-drag the block (user's call):** a plain drag moves one monitor. Shift-drag slides the wallpaper under the block, stopping where it would leave a gap (it keeps covering the block, or stays inside it when smaller), so the block reaches the corners; in stretch there is nothing to slide. Arrow keys move one monitor by 1% of the wallpaper's width, Shift+arrow slides the wallpaper.
- **OS context per monitor (user's call):** the selected OS is drawn inside each monitor, placed for that monitor's own shape. Monitor 1 is the primary and gets every zone; the others get the screen's `secondary` zones (macOS: menu bar, menus, clock and dock, no notch or desktop icons; Windows: taskbar, its apps and the tray clock, no desktop icons). A monitor turned to portrait keeps the OS at its size: the screen's short side is the one it was measured on. The legibility check reads the wallpaper under each monitor.
- **Phones are off limits:** with the monitors on, the phone contexts are greyed out in the OS context list (dropdown options can now be `disabled`: skipped by the arrows, ignored by a click) and a chosen phone context is switched off when the monitors are turned on.
- **UI:** the overlay is HTML over the preview (area outside the monitors dimmed, outline and a label on each), hidden in full screen and while a picker previews or "more like this" is open; the mesh and grid handles are hidden while it is on. Controls open above the button: span or stretch, then per monitor an aspect ratio, a diagonal, turn and remove, then add and reset. The logic is in `src/ui/monitor-layout.ts` (joined layout and slots), `monitor-view.ts` (wallpaper under the block) and `monitors.svelte.ts` (state).
- **Entry point:** a bordered icon button, with its name ("monitors") added where the status bar is at least 1130 px wide. At 1280 px the bar was already full, and a labelled group pushed the zoom controls off screen (`canvas-zoom.spec.ts` caught it); the narrow-window bar is M15.
- **Not done:** bezel gaps, per-monitor OS or fit, saving the layout, a "size the wallpaper to the layout" action.

## D85. Favourites open over the preview; section headers say what they do

- **Decision (2026-10-14):** the favourites list no longer takes height in the panel. The "favourites" title line stays at the bottom of the panel; the list opens as a tray over the preview, flush against the panel and centred on that line, kept inside the window and above the status bar. This replaces the in-panel list of the M7 follow-up ("favourites stay in the left panel").
- **Folded to start, always:** it is folded on every load, even with favourites kept, and adding a favourite no longer opens it (the count and the red ♡ are the feedback), so a row of K presses never covers the image. The title, the line and the arrow toggle it and Esc folds it; removing a favourite leaves it open, and opening one keeps it open, to flick through them.
- **Header:** `favourites ♡ 5 ───── ▸`: the heart follows the title and the arrow at the end points where the list goes (`◂` when open). While open the line is in ink and runs into the tray; the tray's border is ink too. The tray is a screen overlay only, hidden from the preview screenshot the tests compare; the "limit reached" notice stays in the panel.
- **Every header:** the line is now a click target like the title, and lights up (ink) when the title or the line is pointed at, with the arrow. The ▸ / ▾ arrows are bigger and set off from the title. A strikethrough was the other idea; one cue for all headers won.
- **"advanced" replaces "+ more" (adjust and colors):** the extras are a folded group at the end of the section, under all of it, so what it opens appears right under it and the header line is left for the fold. "More" did not say what kind of more. Its accessible name is "Advanced <section> settings". The first version was a centred `──── + advanced ────` divider; as a group like noise and lighting it reads as part of the section instead.
- **Groups (noise, lighting, advanced):** one `Group` component. It echoes the section header: arrow, title, and a line to the right that is the box's top edge, with the box below it (left, right and bottom sides). The little line left of the arrow is gone, the whole group is indented from the section header, the line lights up on hover and a click on it folds, like the section headers. Folded, a group is its title line only. At 1280 x 720 the panel is full, and a looser first version slid the colour stop strip under the footer (`stop-editor.spec.ts` caught it); see Spacing.
- **Colors:** "+ add point/stop" stays at the end of the list, set in under the hex values with a little room above it (3 px). (It was tried at the top of the list, with a blank row left below; the end is where a new color goes.) The groups' titles and the section arrows keep a fixed width, and a group's top is the same open or folded, so nothing moves when one opens.
- **Spacing:** stacked controls in a section are 4 px apart (was 6), and a folded group is a normal row, not tucked into negative margins: the tucked version looked cramped next to the rest and overlapped the row above in colors. The tighter rows give back the height it costs, so at 1280 x 720 the colour stop strip still clears the footer.
- **Panel title:** the "cromatica" row (title, help, undo, redo, fold) is sticky at the top of the panel, so it stays while a full panel scrolls.
- **Numbering:** D84 is the monitor preview.

## D85. Status bar scrolls on narrow windows

- **Decision (2026-10-15, #61):** below the width where the groups fit, the bar scrolls sideways (no visible scrollbar; the mouse wheel scrolls it too) instead of overflowing the page. Folding groups into a menu or wrapping to two lines was left for M15, where the mobile layout will need its own answer.
- **The popover leaves the scroller:** a scrolling box clips its children on both axes, so the monitors popover sits on the fixed bar frame, right-aligned, not under its button. Dropdown lists already render in `<body>`.

## D86. Seeded warp centers stay in a 16:9 box

- **Decision (2026-10-17):** no change. The `circular` and `oval` warps keep their seeded centers in a fixed box of about 16:9 (`seededParams` in `warp.ts`), whatever the frame's aspect. Issue #73 was closed as not planned.
- **Why:** not a problem in practice. The box is a fixed area of the composition (D4), so a wider frame shows more of the same layout. Following the aspect would also move the centers of saved designs whenever the frame changes.
- **Reopen if:** a centered swirl or ring is visibly stuck near the middle of an ultrawide frame, or out of reach of the sides on a square one.

## D87. Glitch as a post stage is parked; the prototypes stay

- **Decision (2026-10-19, #62):** no glitch finish for now. The edge-reactive prototypes in `prototype/glitch/` stay in the repo; nothing in them is loaded by the generator (the build's only entry is the root `index.html`, and `prototype` is in `.prettierignore`).
- **What was tried:** edge strength and direction from the pattern sampled at ±a few pixels (D46), still per pixel and stateless (D4), driving six looks: channel split along the edge, wavy row tears, voronoi shards, color drag, noise-patch echoes, and block "mosh" and "corrupt" passes (pixelation, bit crush, row jitter, scanlines, wrong-color patches).
- **What worked:** the digital looks, split, mosh and corrupt, alone or stacked. Gating everything to a zone around real color boundaries (high edge threshold, small reach) keeps the form readable; without it blocks and scanlines cover the whole image. Wrong colors borrowed from elsewhere in the same pattern stay on palette; inversion and channel swaps read as foreign. `panel.html` shows the finish as one group of four sliders (amount, reach, blocks, color shift) plus a color mode.
- **What did not:** tears, shards, drag and echo felt organic but did not read as glitch, or looked like stained glass or a blur. A soft drag barely shows on soft gradients, the same reason the warp attempt failed.
- **Why parked:** the generator already has a wide range of looks, and the best stack costs about 100 pattern reads per pixel (several edge probes, three jittered channel reads, mosh on top), too much for a finish unless it is cut down.
- **Reopen if:** a single look is found that is clearly better than the rest and cheap enough (a few pattern reads per pixel). Start from split + corrupt in `panel.html`, which was the strongest.

## D88. Planes: move and reorder by hand, kept as edits on the seeded layout

- **Decision (2026-10-19, #64):** a plane can be dragged on the preview, nudged with the arrow keys and moved one step through the stack, from an "arrange" group under the planes sliders in adjust (folded by default). The stipple / ink-blobs settings of the old backlog note are not part of this: that prototype is not in the repo and the note never said which settings.
- **Model:** `PlanesPattern.edits?: { order, shifts }`. `order` is the stack back to front (plane indexes) and `shifts` an offset per plane index in pattern space. The seed still deals every plane in the same sequence, and `preparePlanes` applies the edits afterwards, so moving one plane never changes another. No edits means the layout exactly as before, and a design saves without the field.
- **Torn edges follow the plane:** the shader gets a per-plane id and shift (`u_planeId`, `u_planeShift`). The tear noise is keyed by the plane's layout index and sampled relative to its shift, so a moved or reordered plane keeps its edge. With no edits the ids are 0..n−1 and the shifts 0, which is the old math.
- **Edits belong to one layout:** a new seed ("new layout"), a "more like this" nudge that changes the count or seed, and a different plane _number_ clear them. The count slider moving within one number keeps them. Every plane's size and place depend on the number of planes, so "plane 3" at 14 and at 15 are different shapes and an edit could not mean the same thing. Roughness and blend do not touch the layout and keep edits. Shuffles that deal a new pattern start without edits; a shuffle that only changes colors or finishes keeps them.
- **Under a warp:** the planes bend, so each outline corner is put where the warp shows it (six fixed-point steps; the edges stay straight, so the outline is close, not exact), and a drag moves the pattern point under the pointer, so the grabbed plane follows it. The group says so while a warp is on.
- **Limits:** a plane fully covered by others can't be clicked; the ◂ ▸ buttons step the pick through the stack to reach it. The color rule "no plane takes the color of the one below it" holds for the seeded order only; reordering can put equal colors next to each other.
- **Tests:** CPU unit tests for the offsets, order, ids and bad input; a translated collage equals the original shifted, torn edges included; the GPU matches the CPU reference with edits on; an e2e test drags, undoes, restacks and resets.

## D89. Planes: 1 to 16 planes

- **Decision (2026-10-19, #64):** the planes slider runs from 1 plane to 16 (was 4 to 24, D37). 24 was far too many to read as planes, and one big plane over the background is a valid look.
- **Same layouts, new slider positions:** a layout depends only on the plane _number_, so schema version 7 re-maps the saved count (`round(4 + 20c)` became `round(1 + 15c)`) to keep it: the migration sets `c = (3 + 20c) / 15`, so saves of up to 16 planes look exactly as before and those of 17 to 24 keep 16. Shuffle ranges and the defaults (editor, `withKind`) were re-mapped the same way, so shuffles still deal the same plane numbers, now capped at 16.
- **Shared links:** the link reference stays at version 6 and the prefix at `v1.`. The migration only touches planes, the reference is linear, and an old link carries its own version, so it migrates on load.

## D90. Blobs: grainy lava-lamp bubbles, stacked like planes and lit through a smooth height

- **Decision (2026-10-20, #83, under #82, from the stipple prototype of #63):** a new base pattern kind `blobs`, not a mode of planes (D88's comment on #64). Seeded, lumpy bubbles over the lightest palette color, each with a flat ink (the other palette colors) stippled over a near-black base, thin toward the bubble's edge and full in its middle (`src/engine/blobs.ts`, `shaders/gradient/blobs.glsl`). Four settings: count (1 to 16), size, wobble and grain (0 = off); the seed is the layout. Blobs are moved and restacked exactly like planes (`edits`: stack order plus a shift per blob, cleared by a new seed or count; the same drag overlay, arrows and arrange group, which the editor now runs for whichever of the two is active). A blob is picked by math, not by an outline shape: the pointer goes through the transform and the warp and is tested against the same distance the renderer draws, topmost first. The picked blob's outline is its analytic edge, or, under a warp, the edge of what is drawn, traced from its distance field on a 160-wide grid (`src/ui/state/contour.ts`): inverting a warp point by point, as planes do for their four corners, cannot follow a warp that folds a lumpy outline. The style shuffle deals it about 14% of the time (weight 0.16, 0.16 in the surprise slot), with a size of 0.3 to 0.7, count 0.3 to 0.75, wobble 0.3 to 0.9, grain 0.45 to 0.85 (the dot size follows the slider squared) and a 15% chance of grain 0 (smooth ink), a palette of at least four colors (a background and three inks), and edits kept for a colors-only shuffle and dropped with a new layout. Its kind profile, chosen by eye from 12-shuffle sheets, not measured: no hard-cut warps; liquid and simplex never (they fray the outlines into fur even at a faint amount) and fbm only faint (amount at most 0.15) and coarse (size at least 0.4); the smooth warps (waves, ripples, swirl, flow) favoured; lighting a bit more likely, grain and vignette less.
- **Independent, not merged:** the prototype's smooth union glued every blob into one mass, and its capsules read as pills. Now each blob is its own shape, stacked back to front and opaque like planes (and ready for the planes edit model, D88): an outline of radius `1 + Σ a_k cos(kφ + phase_k)` for k = 2 to 4 around a centre, stretched up to 2.6 along its own axis (long sinuous shapes as well as ovals). Wobble scales the lumps (0 = ovals); the layout does not move as it changes.
- **Ink density follows the reference cover:** a black rim (the first 10% of the radius in), then ink rising gradually to full at the centre, with the light side (up and left) shifted deeper so each bubble fills with ink on one side and stays dark on the other. Mostly black with ink fading in, not solid color with a thin outline.
- **Grain 0 is no stipple (2026-10-20):** the ink is a smooth tone from the black rim to the ink instead of dots, nearly solid (its ramp reaches full ink at 55% of the density ramp, which also keeps the ridge down a blob's middle from showing as a crease), so it stays graded and flat-looking, not a plain fill. Above 0 the dots start under a pixel at 1080 and grow with the slider squared, so the low end is a very fine grain that eases in; they are never blended with the smooth tone (tried and dropped: the user wanted small dots, not a fade) Blobs run from 1, and a blob's mean radius up to 0.42 of the image height (a bigger one than the frame).
- **Base: black or palette (2026-10-20):** the black body was monotone, and the darkest palette color all but vanished on it as an ink. A toggle ("base", saved as `base`, absent = black) gives each blob a body in its own palette color instead, shaded with dots of a deeper shade of it: the ink's hue, its lightness times 0.35 and 90% of its chroma (white dots on dark inks were tried first and dropped: they read as a different color, not as grain). The dots are thickest at the edge, and only start below 70% of the density ramp, so the middle of a blob is clean ink and the edge keeps a dark, tinted rim (a yellow shades to olive, a pink to plum). Grain 0 mirrors it: the smooth tone runs the other way. The layout, lighting height and edits are unchanged. The shuffle gives 40% of blobs a palette body. A dark ink's deep shade sits close to it, so its grain is faint. Chosen by eye from sheets of light and dark inks, not measured.
- **Round, jittered dots, not square cells:** a hard cell threshold read as digital. Each cell holds at most one round dot at a jittered spot with its own radius, present where the density beats the cell's blue noise (the same ranks as the dither, so `dither.glsl` now comes before the base patterns), antialiased and unioned over the 3 × 3 cells around the pixel.
- **Lighting is fed a height:** the lighting (`relief.ts` in the code) reads the Oklab lightness of the pattern at its neighbours (D46), which on dots would be noise. A new `heightColor(comp)` stands in for `patternColor` there: the pattern itself everywhere except blobs, where it is each blob's smooth dome (a gray whose lightness is the height), stacked the same way, so an upper blob's edge reads as a ridge over the one below. The dots keep the color; the lighting shades them from the dome. `applyRelief` takes an optional height source for the CPU reference.
- **Dots follow the frame, not the warp:** the stipple cell comes from composition coordinates, the shapes from the warped ones, so a warp bends the blobs and leaves the grain.
- **Tests:** the GPU is compared to the CPU reference by the share of pixels that differ (under 2%, 3% under a warp, 5% under glass lighting), not the largest difference: a dot is a hard threshold, and the outline's float32 `atan` and `cos` move a blob's depth, and so its dots' density, enough to flip a few dots.
- **Open:** whether the shuffle should deal blobs; white as a fixed ink; the darkest palette color as an ink barely shows on the black base.
- **Depth follows the blob's form (2026-10-21):** the ink density and the lighting height read `R · (1 − L / r(φ))` (`L` the distance from the centre, `r(φ)` the outline radius that way), not `−(L − r(φ))`. The old value was a radial offset, not a distance: at the centre it jumped with the angle, so a lumpy outline printed spokes and a butterfly cusp into the stipple (worst at wobble 1). Now the lines of equal depth are scaled copies of the outline and the glow has the blob's shape. `PEAK` (0.15) rounds the tip of that cone, `SHADE_CLEAR` went from 0.7 to 0.9 (a smaller clean core on a palette base) and `DOME` from 0.45 to 0.8 (the lit height was a flat plateau over the inner ~30% of a blob). Chosen by eye from contact sheets. **Known:** under satin light a thin ridge still shows along the spine of an elongated blob (a cone lights constant along each ray); `DOME` above ~0.9 sharpens it. A separate smooth height for the lighting would remove it.

## D91. A pattern-locked shuffle rearranges planes, aurora and blobs

- **Decision (2026-10-21, user):** with the pattern lock on, the shuffle used to keep these kinds whole, so a locked planes or blobs design never moved. It now keeps the kind and every slider (count, size, wobble, grain, roughness, blend) and deals a new seed: the same look, arranged elsewhere. The seed is the arrangement (D88, D90), so hand edits are dropped with it, as for any new layout.
- **Only with colors unlocked:** colors and pattern both locked is still the finishes-only shuffle of D64. A colors-only shuffle (`shuffleColors`) never rearranges.
- **Code:** `ShuffleOptions.arrange`, set by the editor's shuffle as `patternLocked && !colorsLocked`. The seed is drawn from its own stream, so the other draws of a locked shuffle are unchanged. The pattern lock still keeps mesh and grid points, ramps and the warp shape as before; mesh and grid have no seed to deal.

## D92. UI font: JetBrains Mono, bundled

- **Decision (2026-10-21, #95):** the panel, status bar, monitors, pins and the overlay's warning tag use JetBrains Mono (SIL OFL 1.1), shipped in `src/assets/fonts/` with its license (`OFL.txt`) and declared once as `--font-mono` in `app.css`. The stack was `ui-monospace, 'SF Mono', …`, so macOS drew SF Mono, Windows drew Consolas or whatever JetBrains Mono was installed, and the two never matched. SF Mono and San Francisco cannot be redistributed, so bundling them was never an option.
- **Private family name:** the face is declared as `Cromatica Mono`, not `JetBrains Mono`. An installed copy (the Google variable build, the NL "no ligatures" cut, Nerd Font patches) differs in line height and spacing and would otherwise win a lookup by that name.
- **One build, subset:** the variable woff2 (weights 100 to 800, 71 KB, preloaded in `index.html`) is the official 2.304 release (`fonts/variable/JetBrainsMono[wght].ttf`) cut with `pyftsubset` to Basic Latin, Latin-1, Greek, punctuation and superscripts (U+2000 to 209F), arrows, math, technical, box drawing, blocks and geometric shapes (U+2190 to 25FF), with `--layout-features='*' --flavor=woff2`. The UI uses arrows, triangles and symbols (`← → ▸ ▾ ⌘`), so a Latin-only cut (Fontsource, 40 KB) was not enough. Blocks, not the glyphs in use, so a new symbol in those ranges needs no new file.
- **Known, symbols the font lacks:** `↶ ↷ ↺ ↻ ⇄ ⇋ ⇵ ⌖ ▭ ♡ ♥ ⚄ ⛶ ⟳` (the undo, reset, shuffle, favourite and fit-to-screen icons) are not in JetBrains Mono and still fall back to the OS's own symbol font, so they differ between macOS and Windows. Fixing it means inline SVG icons.
- **Ligatures off** (`font-variant-ligatures: none`): they would merge `->` and `!=` in labels.
- **The mock desktop keeps `system-ui`:** the context overlay imitates macOS (menu bar, dock, widgets) behind the wallpaper, so its font is part of what is previewed, not of the app.
- **Known:** `-webkit-font-smoothing: antialiased` only exists on macOS, and Windows rasterises with its own hinting, so text weight still differs a little with identical glyphs.
