<script lang="ts">
  import { WARP_SHAPES, type WarpShape } from '../design/design';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
  }

  let { editor = $bindable() }: Props = $props();

  const LABELS: Record<WarpShape, string> = {
    none: 'None',
    domain: 'Liquid (domain)',
    fbm: 'FBM',
    simplex: 'Simplex',
    waves: 'Waves',
    rows: 'Rows',
    columns: 'Columns',
    circular: 'Ripples (circular)',
    oval: 'Swirl (oval)',
    worley: 'Worley',
    voronoi: 'Facets (voronoi)',
    curl: 'Flow (curl)',
  };

  const off = $derived(editor.warp.shape === 'none');
</script>

<label class="row">
  <span>Shape</span>
  <select aria-label="Warp shape" title="[ and ] to step through" bind:value={editor.warp.shape}>
    {#each WARP_SHAPES as s (s)}
      <option value={s}>{LABELS[s]}</option>
    {/each}
  </select>
</label>
<label class="row">
  <span>Warp</span>
  <input type="range" min="0" max="1" step="0.01" aria-label="Warp" disabled={off} bind:value={editor.warp.amount} />
</label>
<label class="row">
  <span>Size</span>
  <input type="range" min="0" max="1" step="0.01" aria-label="Warp size" disabled={off} bind:value={editor.warp.size} />
</label>
<div class="row end">
  <button disabled={off} data-seed={editor.warp.seed} onclick={() => editor.newWarpVariation()}>New variation</button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row > span:first-child {
    width: 60px;
    flex: none;
    color: #aaa;
  }
  .row input[type='range'],
  select {
    flex: 1;
    min-width: 0;
  }
  .end {
    justify-content: flex-end;
  }
  select {
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px;
    font: inherit;
  }
  button {
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px 9px;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
