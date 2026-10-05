<script lang="ts">
  import type { ExportFormat, ExportProgress } from '../export/types';
  import Dropdown from './controls/Dropdown.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { EditorState } from './editor.svelte';
  import type { Favourite, Favourites } from './favourites.svelte';

  interface Props {
    editor: EditorState;
    favourites: Favourites;
    /** The favourite the current design matches. */
    favourite: Favourite | undefined;
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
    favourites,
    favourite,
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
    <div class="row">
      <span>keep</span>
      <Toggle
        checked={editor.colorsLocked}
        label="colors"
        ariaLabel="Lock colors"
        title="Keep the colors when shuffling"
        onchange={(on) => (editor.colorsLocked = on)}
      />
      <Toggle
        checked={editor.layoutLocked}
        label="layout"
        ariaLabel="Lock layout"
        title="Keep the layout and warp when shuffling"
        onchange={(on) => (editor.layoutLocked = on)}
      />
    </div>
    {#if editor.kind === 'mesh' || editor.kind === 'grid'}
      {@const handles = editor.kind === 'mesh' ? 'points' : 'nodes'}
      <div class="row">
        <span>show</span>
        <Toggle
          checked={editor.showHandles}
          label={handles}
          ariaLabel={`${editor.showHandles ? 'Hide' : 'Show'} ${handles}`}
          title={`Show or hide the ${handles} on the image (H)`}
          onchange={(on) => (editor.showHandles = on)}
        />
      </div>
    {/if}
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
      <span class="spacer"></span>
      <button
        class="icon"
        aria-label={favourite ? 'Remove from favourites' : 'Add to favourites'}
        aria-pressed={!!favourite}
        title={favourite ? 'Remove from favourites' : 'Keep in favourites'}
        onclick={() => (favourite ? favourites.remove(favourite.id) : favourites.add(editor.design))}
        >{favourite ? '♥' : '♡'}</button
      >
    </div>
  {/if}
  <div class="row actions">
    <button
      class="primary"
      aria-label="Shuffle"
      disabled={!editor.canShuffle}
      title={editor.canShuffle ? 'Shuffle (Space)' : 'Unlock colors or layout to shuffle'}
      onclick={() => editor.shuffle()}>[ shuffle<kbd> ␣</kbd> ]</button
    >
    {#if exporting}
      <progress max="100" value={percent} aria-label="Export progress"></progress>
      <button onclick={oncancel}>[ cancel ]</button>
    {:else}
      <button class="strong" aria-label="Download" onclick={onexport}>[ download ]</button>
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
  /* Pinned to the bottom; the sections scroll above it on short screens. */
  footer {
    position: sticky;
    bottom: 0;
    margin: auto calc(-1 * var(--pad)) 0;
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
