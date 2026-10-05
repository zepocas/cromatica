<script lang="ts">
  import type { Design } from '../design/design';
  import { mutateDesign } from '../design/mutate';
  import { createRng, randomSeed } from '../design/random';
  import Thumbnail from './Thumbnail.svelte';

  interface Props {
    design: Design;
    aspect: number;
    onpick: (design: Design) => void;
    onclose: () => void;
  }

  let { design, aspect, onpick, onclose }: Props = $props();

  // Gentle at the top, bolder further down; the middle cell is the design itself.
  const STRENGTHS = [0.35, 0.45, 0.55, 0.65, null, 0.75, 0.85, 0.95, 1];
  const GAP = 6;
  /** Height kept for the again / close row under the grid. */
  const BAR = 24;

  let seed = $state(randomSeed());
  let width = $state(0);
  let height = $state(0);

  const cells = $derived(STRENGTHS.map((s, i) => (s === null ? null : mutateDesign(design, createRng(seed + i), s))));
  const cellWidth = $derived(Math.max(0, Math.min((width - 4 * GAP) / 3, ((height - 4 * GAP - BAR) / 3) * aspect)));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="more panel"
  role="dialog"
  aria-label="More like this"
  data-testid="more-like-this"
  style:--gap="{GAP}px"
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  <div class="grid">
    {#each cells as cell, i (i)}
      {#if cell}
        <button class="cell" aria-label="Variation {i < 4 ? i + 1 : i}" onclick={() => onpick(cell)}>
          <Thumbnail design={cell} {aspect} width={cellWidth} />
        </button>
      {:else}
        <button class="cell current" aria-label="Keep the current design" title="Keep this one" onclick={onclose}>
          <Thumbnail {design} {aspect} width={cellWidth} />
        </button>
      {/if}
    {/each}
  </div>
  <div class="bar">
    <button aria-label="More variations" onclick={() => (seed = randomSeed())}>[ again ]</button>
    <button aria-label="Close" onclick={onclose}>[ close <kbd>esc</kbd> ]</button>
  </div>
</div>

<style>
  .more {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--gap);
    background: var(--panel);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: var(--gap);
  }
  .cell {
    padding: 0;
    line-height: 0;
    outline: 1px solid var(--rule);
  }
  .cell:hover,
  .cell:focus-visible {
    outline-color: var(--ink);
  }
  .current {
    outline: 1px dashed var(--ink);
  }
  .bar {
    display: flex;
    gap: 8px;
  }
  kbd {
    font: inherit;
    opacity: 0.6;
  }
</style>
