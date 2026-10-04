<script lang="ts">
  import { WARP_SHAPES, type WarpShape } from '../design/design';
  import { clamp } from '../math';
  import type { EditorState } from './editor.svelte';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './presets';
  import Section from './Section.svelte';

  interface Props {
    editor: EditorState;
    presetId: string;
    customWidth: number;
    customHeight: number;
    /** Export size in pixels (from the preset or the custom size). */
    output: { width: number; height: number };
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let {
    editor = $bindable(),
    presetId = $bindable(),
    customWidth = $bindable(),
    customHeight = $bindable(),
    output,
  }: Props = $props();

  const MAX_SIZE = 16384;

  const PATTERNS = [
    { kind: 'mesh', label: 'mesh' },
    { kind: 'linear', label: 'linear' },
    { kind: 'radial', label: 'radial' },
    { kind: 'conic', label: 'conic' },
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
    smudge: 'smudge',
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
  <label class="row">
    <span>gradient</span>
    <select aria-label="Gradient" bind:value={editor.kind}>
      {#each PATTERNS as p (p.kind)}
        <option value={p.kind}>{p.label}</option>
      {/each}
    </select>
  </label>
  <div class="row">
    <label for="warp-shape">warp shape</label>
    <select id="warp-shape" aria-label="Warp shape" title="[ and ] to step through" bind:value={editor.warp.shape}>
      {#each WARP_SHAPES as s (s)}
        <option value={s}>{WARP_LABELS[s]}</option>
      {/each}
    </select>
    <button
      class="icon"
      aria-label="New variation"
      title="New variation of this shape"
      disabled={editor.warp.shape === 'none'}
      data-seed={editor.warp.seed}
      onclick={() => editor.newWarpVariation()}>⚄</button
    >
  </div>
  <label class="row">
    <span>size</span>
    <select bind:value={presetId} aria-label="Device preset">
      {#each DEVICE_PRESETS as p (p.id)}
        <option value={p.id}>{p.label}</option>
      {/each}
      <option value={CUSTOM_PRESET_ID}>custom</option>
    </select>
  </label>
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
