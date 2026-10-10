<script lang="ts">
  import type { ExportFormat, ExportProgress } from '../export/types';
  import Dropdown from './controls/Dropdown.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
    exploring: boolean;
    format: ExportFormat;
    /** Collapsed panel: only shuffle and download. */
    compact: boolean;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    onexport: () => void;
    oncancel: () => void;
  }

  let {
    editor,
    exploring = $bindable(),
    format = $bindable(),
    compact,
    exporting,
    progress,
    error,
    onexport,
    oncancel,
  }: Props = $props();

  const percent = $derived(progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0);
</script>

<footer class:compact>
  {#if !compact}
    <div class="row keep">
      <span>keep</span>
      <Toggle
        checked={editor.colorsLocked}
        label="colors"
        ariaLabel="Lock colors"
        title="Keep the colors when shuffling"
        onchange={(on) => (editor.colorsLocked = on)}
      />
      <Toggle
        checked={editor.patternLocked}
        label="pattern"
        ariaLabel="Lock pattern"
        title="Keep the pattern kind, layout, warp shape and variation when shuffling"
        onchange={(on) => (editor.patternLocked = on)}
      />
      <Toggle
        checked={editor.adjustLocked}
        label="adjust"
        ariaLabel="Lock adjust"
        title="Keep the warp amount and size, bands, noise, vignette and lighting when shuffling"
        onchange={(on) => (editor.adjustLocked = on)}
      />
    </div>
    <div class="row">
      <span>recent</span>
      <button
        class="icon"
        aria-label="Previous shuffle"
        title="Previous shuffle (←)"
        disabled={!editor.reel.canBack}
        onclick={() => editor.stepReel(-1)}>←</button
      >
      <span class="count" aria-label="Shuffle {editor.reel.position + 1} of {editor.reel.length}"
        >{editor.reel.length ? `${editor.reel.position + 1}/${editor.reel.length}` : '–'}</span
      >
      <button
        class="icon"
        aria-label="Next shuffle"
        title="Next shuffle (→)"
        disabled={!editor.reel.canForward}
        onclick={() => editor.stepReel(1)}>→</button
      >
    </div>
  {/if}
  <div class="row actions">
    <button
      class="primary"
      aria-label="Shuffle"
      disabled={!editor.canShuffle}
      title={editor.canShuffle ? 'Shuffle (Space)' : 'Unlock colors, pattern or adjust to shuffle'}
      onclick={() => editor.shuffle()}>[ shuffle<kbd> ␣</kbd> ]</button
    >
    {#if !compact}
      <button
        aria-label="More like this"
        aria-pressed={exploring}
        title="More like this: variations of this design (M)"
        onclick={() => (exploring = !exploring)}>[ more like this<kbd> M</kbd> ]</button
      >
    {/if}
  </div>
  <div class="row actions">
    {#if exporting}
      <progress max="100" value={percent} aria-label="Export progress"></progress>
      <button onclick={oncancel}>[ cancel ]</button>
    {:else}
      <button class="strong" aria-label="Download" title="Download (⌘S)" onclick={onexport}>[ download ]</button>
      {#if !compact}
        <span class="spacer"></span>
        <Dropdown
          ariaLabel="Format"
          value={format}
          options={[{ value: 'png' }, { value: 'jpeg' }]}
          onchange={(f) => (format = f)}
        />
      {/if}
    {/if}
  </div>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</footer>

<style>
  /* Three toggles share the row with their label: trim the label column and the gaps to fit the panel. */
  footer .row.keep {
    gap: 2px;
  }

  footer .row.keep > span:first-child {
    width: 4ch;
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
  .compact kbd {
    display: none;
  }
  kbd {
    font: inherit;
    opacity: 0.6;
  }
  .count {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1;
  }
  .row.actions :global(.dropdown) {
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
