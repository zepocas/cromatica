# UI map

Where things are in `src/`, for changing the interface by hand. Svelte 5 with TypeScript; a `.svelte` file is markup, script and styles together, a `.svelte.ts` file is plain TypeScript that may use `$state`.

## What is on screen

```text
App.svelte                      owns the state and wires everything together
├── Preview.svelte              the canvas; draws the design (via src/preview → src/engine)
│   └── overlay slot            drawn on top of the image: ui/overlays/*
├── ControlPanel.svelte         the left panel
│   ├── sections/PatternSection      pattern, warp shape, output size
│   ├── sections/AdjustSection       warp, finishes, lighting, transform
│   │   └── adjust/                  PatternAdjust (per pattern kind), FinishGroups (bands, noise, lighting), TransformControls
│   ├── sections/ColorsSection       color rows, shuffle colors, palette from image
│   ├── sections/FavouritesSection   saved designs
│   └── ExportBar.svelte             shuffle, more like this, share link, download
├── StatusBar.svelte            bottom bar: format, locks, OS context, monitors, zoom
└── Shortcuts / Tips            help cards
```

## Folders in `src/ui/`

| Folder       | What goes there                                                                              |
| ------------ | -------------------------------------------------------------------------------------------- |
| `sections/`  | Blocks of the left panel, and the pieces inside them (a color row, the stop strip).           |
| `overlays/`  | Things drawn over the preview image: point and node handles, image pins, OS and monitor mockups, the "more like this" grid. |
| `state/`     | Data and logic, no markup: `editor.svelte.ts` is the design being edited; the rest are undo, favourites, autosave, share links and helpers. |
| `controls/`  | Small reusable parts: `SliderRow`, `Choice`, `Dropdown`, `Toggle`, `LockToggle`, `Section`, `Group`, `ShapeIcon`. |
| (top level)  | The app shell: `ControlPanel`, `Preview`, `StatusBar`, `ExportBar`, `Shortcuts`, `Tips`.      |

## Styles

- `src/app.css` is global: the panel's look under `.panel` (sliders, buttons, dropdowns, inputs), plus the variables.
- Each component's `<style>` block holds its own layout, scoped to it.
- Variables: colors and the hue wheel under `.panel`; `--sidebar`, `--statusbar`, `--gap-page` and the `--z-*` layer order in `:root`. Change a value there, not in the component.
- `.panel` is a theme scope: the sidebar, status bar, tips, shortcuts and an open dropdown list all carry it.

## What happens when a slider moves

```text
<SliderRow bind:value={editor.warp.amount}>      in sections/AdjustSection.svelte
  → editor.warp.amount ($state)                  in state/editor.svelte.ts
  → editor.design (getter: a plain Design)
  → renderDesign ($derived)                      in App.svelte
  → <Preview design={...}>  →  controller.setDesign   src/preview/preview.ts
  → renderer.render(design, ...)                 src/engine/renderer.ts
```

- The same `design` feeds autosave (`state/autosave.ts`) and export (`src/export/`).
- Undo: `App.svelte` records a step on every pointer or key press (`history.commit`), so a drag is one step.
- A few controls use `oninput` instead of `bind:value` because the shown value is not the stored one (zoom is log2, rotate is wrapped, grid rows resize the grid).

## Where do I change...

| I want to change...                            | Look in                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| a slider's label, range or readout              | the section file that shows it (search for its label), e.g. `AdjustSection` |
| what a slider does to the image                 | its field in `state/editor.svelte.ts`, then `src/design/design.ts` and the shader in `src/engine/` |
| a slider's look                                 | `src/app.css` (sliders) and `controls/SliderRow.svelte`                    |
| a color row, hex field or picker                | `sections/ColorRow.svelte`                                                 |
| shuffle, harmony, mood, key                     | `state/palette.svelte.ts`, `src/design/shuffle.ts`, `src/color/`           |
| the drag handles on the image                   | `overlays/MeshOverlay`, `GridOverlay`, `ImagePins`                         |
| the bottom bar                                  | `StatusBar.svelte`                                                         |
| the OS mockups and legibility check             | `overlays/ContextOverlay`, `src/context/`                                  |
| keyboard shortcuts                              | `App.svelte` (`onKeyDown`: undo, full screen, save) and `ControlPanel.svelte` (`onWindowKeyDown`: the rest), listed in `Shortcuts.svelte` |
| export size presets                             | `state/presets.ts`                                                         |

## State classes

| Class             | File                          | Holds                                                         |
| ----------------- | ----------------------------- | ------------------------------------------------------------- |
| `EditorState`     | `state/editor.svelte.ts`      | the design, selection, locks, pins; `snapshot` and `restore` for undo |
| `PaletteEditor`   | `state/palette.svelte.ts`     | harmony, mood, key, base hue, linked edits, grade sliders      |
| `PinsEditor`      | `state/pins.svelte.ts`        | picking colors on the imported image (`editor.pins`); session only |
| `History`         | `state/history.svelte.ts`     | undo and redo steps                                           |
| `Reel`            | `state/reel.svelte.ts`        | the last shuffles, stepped with the arrow keys                |
| `Favourites`      | `state/favourites.svelte.ts`  | saved designs in localStorage                                 |
| `CanvasView`      | `state/view.svelte.ts`        | preview zoom and pan                                          |
| `MonitorsState`   | `state/monitors.svelte.ts`    | the multi-monitor preview layout                              |
| `ExportSettings`  | `state/export-settings.svelte.ts` | output size (preset or custom) and file format          |
| `PanelUi`         | `state/panel-ui.svelte.ts`   | what is open or folded: panel, more like this, tips, shortcuts, OS context |

## Adding a control

1. Put its value on the design (`src/design/design.ts`), with a default, and in the saved schema (`src/design/schema.ts`) with a migration if old saves need one.
2. Add a `SliderRow` (or `Choice`, `Toggle`) to the right section, behind `advanced` unless it is core.
3. If it changes the picture, add it to the shader and its CPU mirror in `src/engine/`, plus a golden test (see CLAUDE.md).
4. Tests find controls by label, so keep the label stable and set `ariaLabel` if it differs.
