<script lang="ts">
  import { WARP_SHAPES, type WarpShape } from '../design/design';
  import { clamp } from '../math';
  import Dropdown from './controls/Dropdown.svelte';
  import type { EditorState } from './editor.svelte';
  import { CUSTOM_PRESET_ID, PRESET_GROUPS, presetLabel, SIZE_PRESETS } from './presets';
  import Section from './Section.svelte';

  interface Props {
    editor: EditorState;
    presetId: string;
    /** The size preset under the arrow keys or pointer while the list is open; null otherwise. */
    presetPreview: string | null;
    customWidth: number;
    customHeight: number;
    /** Export size in pixels (from the preset or the custom size). */
    output: { width: number; height: number };
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let {
    editor = $bindable(),
    presetId = $bindable(),
    presetPreview = $bindable(),
    customWidth = $bindable(),
    customHeight = $bindable(),
    output,
  }: Props = $props();

  const MAX_SIZE = 16384;

  const SIZE_OPTIONS = [
    ...PRESET_GROUPS.flatMap((group) =>
      SIZE_PRESETS.filter((p) => p.group === group).map((p) => ({ value: p.id, label: presetLabel(p), group })),
    ),
    { value: CUSTOM_PRESET_ID, label: 'custom' },
  ];

  const PATTERNS = [
    { kind: 'mesh', label: 'mesh' },
    { kind: 'grid', label: 'grid' },
    { kind: 'linear', label: 'linear' },
    { kind: 'radial', label: 'radial' },
    { kind: 'conic', label: 'conic' },
    { kind: 'noise', label: 'noise' },
    { kind: 'cells', label: 'cells' },
    { kind: 'planes', label: 'planes' },
    { kind: 'aurora', label: 'aurora' },
  ] as const;

  const WARP_LABELS: Record<WarpShape, string> = {
    none: 'none',
    domain: 'liquid',
    fbm: 'fbm',
    simplex: 'simplex',
    waves: 'waves',
    rows: 'rows',
    columns: 'columns',
    circular: 'ripples',
    oval: 'swirl',
    worley: 'worley',
    voronoi: 'facets',
    curl: 'flow',
    ridged: 'silk',
    marble: 'marble',
    bristle: 'brushed',
  };

  /** Typing a size switches to custom, starting from the current size. */
  function setSize(axis: 'width' | 'height', v: number) {
    const size = clamp(Math.round(Number.isFinite(v) ? v : 1), 1, MAX_SIZE);
    customWidth = axis === 'width' ? size : output.width;
    customHeight = axis === 'height' ? size : output.height;
    presetId = CUSTOM_PRESET_ID;
  }
</script>

<Section title="pattern">
  <div class="row">
    <span>gradient</span>
    <Dropdown
      ariaLabel="Gradient"
      value={editor.kind}
      options={PATTERNS.map((p) => ({ value: p.kind, label: p.label }))}
      onchange={(k) => (editor.kind = k)}
      onactive={(k) => editor.previewChange(k && k !== editor.kind ? (t) => (t.kind = k) : null)}
    />
  </div>
  <div class="row">
    <label for="warp-shape">warp shape</label>
    <Dropdown
      id="warp-shape"
      ariaLabel="Warp shape"
      title="[ and ] to step through"
      value={editor.warp.shape}
      options={WARP_SHAPES.map((s) => ({ value: s, label: WARP_LABELS[s] }))}
      onchange={(s) => (editor.warp.shape = s)}
      onactive={(s) => editor.previewChange(s && s !== editor.warp.shape ? (t) => (t.warp.shape = s) : null)}
    />
    <button
      class="icon"
      aria-label="New variation"
      title="New variation of this shape"
      disabled={editor.warp.shape === 'none'}
      data-seed={editor.warp.seed}
      onclick={() => editor.newWarpVariation()}>⚄</button
    >
  </div>
  <div class="row">
    <span>size</span>
    <Dropdown
      ariaLabel="Size preset"
      value={presetId}
      options={SIZE_OPTIONS}
      onchange={(id) => (presetId = id)}
      onactive={(id) => (presetPreview = id)}
    />
  </div>
  <div class="row">
    <span></span>
    <input
      type="number"
      min="1"
      max={MAX_SIZE}
      aria-label="Width"
      value={output.width}
      onchange={(e) => setSize('width', e.currentTarget.valueAsNumber)}
    />
    <span class="dim">×</span>
    <input
      type="number"
      min="1"
      max={MAX_SIZE}
      aria-label="Height"
      value={output.height}
      onchange={(e) => setSize('height', e.currentTarget.valueAsNumber)}
    />
  </div>
</Section>

<style>
  .dim {
    color: var(--dim);
  }
</style>
