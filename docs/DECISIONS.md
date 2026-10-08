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
- **Change:** `shuffleDesign` takes `style` (used together with `layout`): on its own random stream, it picks the pattern kind (mesh 35%, planes 30%, linear 15%, radial and conic 10% each) and the finishes (vignette 30%, print 25%, bands 15% and never on planes), plus planes roughness and blend. The colors carry over to the new kind (ramps hold up to 8). The main shuffle sets `style` unless layout is locked, so "keep layout" also keeps the kind and finishes. Color-only shuffles and the opening shuffle keep the kind (the app still opens on a mesh). Grain and the transform are never shuffled.
- **Sizes:** the size menu lists resolutions only, grouped into desktop, mobile (current iPhone and Android natives) and tablet, with no device names. The default is 3840 × 2160.

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
