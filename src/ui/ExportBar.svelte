<script lang="ts">
  import type { ExportProgress } from '../export/types';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
    exploring: boolean;
    /** Collapsed panel: only shuffle and download. */
    compact: boolean;
    nudgeShuffle: boolean;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    onexport: () => void;
    oncancel: () => void;
  }

  let {
    editor,
    exploring = $bindable(),
    compact,
    nudgeShuffle,
    exporting,
    progress,
    error,
    onexport,
    oncancel,
  }: Props = $props();

  const percent = $derived(progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0);
</script>

<footer class:compact>
  <div class="row actions">
    <button
      class="primary box"
      class:nudge={nudgeShuffle && !compact}
      aria-label="Shuffle"
      disabled={!editor.canShuffle}
      title={editor.canShuffle ? 'Shuffle (Space)' : 'Unlock colors, pattern or adjust to shuffle'}
      onclick={() => editor.shuffle()}>shuffle</button
    >
    {#if !compact}
      <button
        class="secondary box"
        aria-label="More like this"
        aria-pressed={exploring}
        title="More like this: variations of this design (M)"
        onclick={() => (exploring = !exploring)}>more like this</button
      >
    {/if}
  </div>
  <div class="row actions">
    {#if exporting}
      <progress max="100" value={percent} aria-label="Export progress"></progress>
      <button class="box" onclick={oncancel}>cancel</button>
    {:else}
      <button class="strong box" aria-label="Download" title="Download (⌘S)" onclick={onexport}>download</button>
    {/if}
  </div>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</footer>

<style>
  /* The fill drains out of shuffle and back, until it has been tried once. A color change, not movement, so it stays with reduced motion on. */
  .nudge {
    animation: nudge 1.6s ease-out infinite;
  }
  @keyframes nudge {
    50% {
      background: transparent;
      color: var(--ink);
    }
  }

  /* Pinned to the bottom; the sections scroll above it on short screens. */
  footer {
    position: sticky;
    bottom: 0;
    margin: 0 calc(-1 * var(--pad));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px var(--pad);
    border-top: 1px solid var(--rule);
    background: var(--panel);
  }
  footer.compact {
    position: static;
    flex-direction: row;
    margin: 0;
    padding: 6px 0;
    border: none;
    background: none;
  }
  /* Bordered buttons of one height share the width of the row, so every edge lines up. */
  .box {
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
    border: 1px solid var(--dim);
    text-align: center;
  }
  footer.compact .box {
    flex: none;
  }
  .strong {
    color: var(--ink);
  }
  progress {
    flex: 1;
    min-width: 0;
    accent-color: var(--ink);
  }
  .error {
    margin: 0;
    color: var(--warn);
  }
</style>
