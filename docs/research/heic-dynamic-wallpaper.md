# Research: one dynamic light/dark HEIC wallpaper from the browser

Date: 2026-10-08. Status of sources: Apple publishes NO spec for the wallpaper metadata; everything in section 1 is community reverse engineering (several independent sources agree). Items marked UNVERIFIED were not confirmed in a primary source.

## 1. What makes a HEIC a macOS light/dark wallpaper

- A multi-image HEIF/HEVC file (two images, same pixel dimensions) with one XMP packet on image 0 (the primary item). Image 0 = light, image 1 = dark. [wallwell], [harshil]
- XMP packet (namespace `http://ns.apple.com/namespace/1.0/`, prefix `apple_desktop`, `apr` is an element, not an attribute): [harshil]
  ```xml
  <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 5.4.0">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:apple_desktop="http://ns.apple.com/namespace/1.0/">
     <apple_desktop:apr>BASE64</apple_desktop:apr>
  ```
- BASE64 = base64 of a binary plist (`bplist00`) holding `{"l": 0, "d": 1}` (indices of the light and dark image). [harshil], [wallwell]
- Since Catalina `apr` replaced the Mojave `apple_desktop:solar` tag (solar/time wallpapers still use `solar`, with 16-ish frames and a `si` array). [nshipster], [harshil]
- Apple's own writer is ImageIO `CGImageDestination` (HEIC, 2 images, XMP attached to the first only). [harshil], [nshipster]
- Gotchas: default 4:2:0 loses chroma detail (wallwell offers 4:4:4 lossless); on Sonoma+ overwriting a file at a path already used as wallpaper does not redraw, so use a fresh filename. [wallwell]
- Minimal byte-level need: `ftyp` (heic/mif1), `meta` with `pitm` = item 0, two `hvc1` image items (each `ispe`, `hvcC`), one `mime` item typed `application/rdf+xml` (the XMP) linked to item 0 by a `cdsc` iref, `iloc` offsets into `mdat`. (Structure per ISO/IEC 23008-12; the exact box set Apple tolerates is UNVERIFIED, but wallwell's output via libheif works.)
- The bplist is 2 tiny keys; a hand-written 40-byte binary plist is feasible, but generate and decode-check it (wallwell notes corrupted copies circulate). [wallwell]

## 2. Browser-capable encoders

| Option | Licence | Size | Multi-image + XMP | Maturity |
|---|---|---|---|---|
| libheif-js (catdad) | LGPL-3.0 | 8.4 MB npm package | DECODE ONLY, no encode API | maintained, but not usable for writing [npm] |
| libheif built by us with Emscripten | LGPL-3.0 core; x265 plugin is GPL, kvazaar is BSD-style per libheif README [libheif] | UNVERIFIED (not published) | libheif C API supports multiple images and metadata [libheif]; JS bindings would be ours to write | libheif has an official emscripten build script [libheif]; HEVC encoder in WASM = real build effort |
| elheif (libheif + libde265 + kvazaar) | repo says MIT, wrapped libs keep their own licences | not documented | only `jsEncodeImage(rgba,w,h)`; no metadata or multi-image API documented [elheif] | 1 star, 2 commits: prototype |
| @saschazar/wasm-heif | n/a | n/a | decode; its author reports not compiling x265 for Emscripten [npm search result, UNVERIFIED] | old |
| Own HEIF muxer + WebCodecs HEVC (section 3) | ours | ~0 (a few hundred lines) | yes, we write the boxes | only works where HEVC encode exists |

HEVC patents: x265 is GPL and any hosted use also raises HEVC patent-pool questions (not a licence conclusion, needs legal review). UNVERIFIED for kvazaar licence: libheif README calls it a BSD alternative; the third-party summary said GPL. Check kvazaar's repo before relying on it.

## 3. Native browser encoding

- `canvas.toBlob("image/heic")`: not specified; MDN guarantees only PNG and says unsupported types fall back to PNG; HEIC not listed. [mdn-toblob] Effectively unsupported.
- WebCodecs `VideoEncoder` with `hvc1`: Chrome 130+ on Windows/macOS/Android via hardware encoders only; measured pass rates: Safari ~91% macOS, Chrome ~48% macOS / ~40% Windows / ~22% Linux, Firefox ~0%. [webcodecsfundamentals], [mdn-codecs]. Safari 26+ has full WebCodecs; 16.4 to 18.7 video only. Feature-detect with `VideoEncoder.isConfigSupported`.
- WebCodecs returns raw HEVC chunks plus an `hvcC` description, not a HEIF file; we would mux the HEIF boxes ourselves. Intra-only still-image encoding via a video encoder (one keyframe per image) is plausible but UNVERIFIED for colour fidelity (limited-range YUV 4:2:0 only, no 4:4:4 on most hardware encoders, so gradient banding risk for a gradient wallpaper app).

## 4. AVIF or other containers

- No source found saying macOS reads `apple_desktop:apr` from AVIF or any non-HEIC container. All tools and docs found produce HEIC. [search results, wallwell, nshipster] Treat as NOT supported unless tested on a Mac. AVIF is the same ISOBMFF family, so a manual test is cheap but unconfirmed.
- Apple Support documents wallpaper selection UI and the Automatic (light/dark) option, not the file format. [apple-support]

## 5. Windows and Android

- Windows: `.deskthemepack` is a zip-like theme package (theme file plus wallpapers), widely distributed with separate light and dark packs (e.g. a Windows-11 pack and a Windows-11-dark pack). [winthemepack]. I found no primary Microsoft source showing one theme carrying both a light and a dark wallpaper that switch with app mode: UNVERIFIED. Realistic: two files, or two separate theme packs.
- Android: no primary-source API found for a developer-supplied light/dark wallpaper pair. Android 13+ offers a user "dim wallpaper in dark mode" toggle (Samsung "Apply dark mode to wallpaper", Pixel via Bedtime mode); a live wallpaper app can swap images on theme change. [howtogeek], [fdroid]. Android API reference excerpt retrieved did not show a pair setter. [android-ref] Realistic: two files; user applies manually.
- A web app cannot set wallpapers on any OS; it can only download files.

## 6. Recommendation

1. Default: keep exporting a PAIR of same-size files (PNG, light and dark), clearly named. Works on all three OSes, zero licence risk, zero size cost.
2. For macOS users add a small CLI/script path (ship in repo, not in the web bundle): Python with pillow-heif or `heif-enc` plus `exiv2`, or a Swift `CGImageDestination` snippet, following wallwell/harshil. Effort: small (about 50 lines). Licence risk stays on the user's machine.
3. Browser HEIC only as an opt-in experiment later: hand-written HEIF muxer plus WebCodecs `hvc1` encode, feature-detected, so no WASM, no GPL, no bundle growth. Cost: medium effort, works mainly on Safari/Chrome-with-hardware, banding risk from 4:2:0, and macOS behaviour must be verified on a real Mac.
4. Do not ship an x265/libheif WASM encoder: GPL and HEVC patent exposure for a hosted app, multi-MB payload, custom bindings needed for multi-image + XMP.

## Sources

- [harshil] https://harshil.net/blog/dynamic-wallpapers-in-macos-catalina/
- [wallwell] https://github.com/brucepucci/wallwell
- [nshipster] https://nshipster.com/macos-dynamic-desktop/
- [wallpapper] https://github.com/mczachurski/wallpapper (MIT, Swift, appearance/solar/time wallpapers)
- [libheif] https://github.com/strukturag/libheif
- [npm] https://www.npmjs.com/package/libheif-js
- [elheif] https://github.com/hpp2334/elheif
- [mdn-toblob] https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- [mdn-codecs] https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection
- [webcodecsfundamentals] https://webcodecsfundamentals.org/codecs/hevc.html (third-party test data, not primary)
- [apple-support] https://support.apple.com/en-al/guide/mac-help/mchlp3013/mac
- [winthemepack] https://windowsthemepack.com/advert/windows-11/ (third party)
- [howtogeek] https://www.howtogeek.com/828066/how-to-dim-your-wallpaper-at-night-on-android/
- [fdroid] https://f-droid.org/packages/com.github.cvzi.darkmodewallpaper/
- [android-ref] https://developer.android.com/reference/android/app/WallpaperManager

Not consulted directly: ISO/IEC 23008-12 text (paywalled), caniuse. Several sources are community or third-party; verify the apr file on a real Mac before building anything.
