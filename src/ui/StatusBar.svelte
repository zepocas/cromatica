<script lang="ts">
  import type { ExportFormat } from '../export/types';
  import { CONTEXT_SCREENS } from '../context/screens';
  import Dropdown from './controls/Dropdown.svelte';
  import LockToggle from './controls/LockToggle.svelte';
  import type { EditorState } from './editor.svelte';
  import type { CanvasView } from './view.svelte';

  interface Props {
    editor: EditorState;
    view: CanvasView;
    /** The OS screen drawn over the preview; '' = none. */
    contextId: string;
    /** The screen highlighted in the open list, shown until it closes; null = none. */
    contextPreview: string | null;
    /** Portrait outputs list the phone screens first. */
    portrait: boolean;
    /** Beside the docked panel; otherwise the full width. */
    docked: boolean;
    /** The file type of the download. */
    format: ExportFormat;
    onzoom: (factor: number) => void;
    /** Absent where the browser can't. */
    onfullscreen?: () => void;
  }

  let {
    editor,
    view,
    docked,
    format = $bindable(),
    contextId = $bindable(),
    contextPreview = $bindable(),
    portrait,
    onzoom,
    onfullscreen,
  }: Props = $props();

  const OFF = 'off';
  const options = $derived.by(() => {
    const first = portrait ? 'mobile' : 'desktop';
    const screens = [...CONTEXT_SCREENS].sort((a, b) => Number(a.group !== first) - Number(b.group !== first));
    return [
      { value: OFF, label: 'off' },
      ...screens.map((s) => ({ value: s.id, label: s.label, group: s.group, title: `${s.device}, ${s.os}` })),
    ];
  });

  const handles = $derived(
    editor.kind === 'mesh'
      ? { label: 'mesh points', aria: 'Mesh points' }
      : editor.kind === 'grid'
        ? { label: 'grid nodes', aria: 'Grid nodes' }
        : null,
  );
</script>

<footer class="panel statusbar" class:docked aria-label="Status bar">
  <span class="group">
    <span>format</span>
    <Dropdown
      ariaLabel="Format"
      title="File type of the download"
      value={format}
      options={[{ value: 'png' }, { value: 'jpeg' }]}
      onchange={(f) => (format = f)}
    />
  </span>
  <span class="sep" role="separator" aria-orientation="vertical"></span>
  <span class="group locks">
    <span title="Parts that shuffling leaves alone; you can still edit them by hand">shuffle lock</span>
    <LockToggle
      locked={editor.colorsLocked}
      label="colors"
      ariaLabel="Lock colors"
      title="Keep the colors when shuffling (1)"
      onchange={(on) => (editor.colorsLocked = on)}
    />
    <LockToggle
      locked={editor.patternLocked}
      label="pattern"
      ariaLabel="Lock pattern"
      title="Keep the pattern kind, layout, warp shape and variation when shuffling (2)"
      onchange={(on) => (editor.patternLocked = on)}
    />
    <LockToggle
      locked={editor.adjustLocked}
      label="adjust"
      ariaLabel="Lock adjust"
      title="Keep the warp amount and size, bands, noise, vignette and lighting when shuffling (3)"
      onchange={(on) => (editor.adjustLocked = on)}
    />
  </span>
  <span class="sep" role="separator" aria-orientation="vertical"></span>
  <span class="group">
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
  </span>
  <span class="sep" role="separator" aria-orientation="vertical"></span>
  <span class="group">
    <span>os context</span>
    <Dropdown
      ariaLabel="OS context"
      value={contextId || OFF}
      {options}
      onchange={(id) => (contextId = id === OFF ? '' : id)}
      onactive={(id) => (contextPreview = id === null ? null : id === OFF ? '' : id)}
      title="Show the OS on top of the image, and warn where its text would be hard to read"
    />
  </span>
  {#if handles}
    <span class="sep" role="separator" aria-orientation="vertical"></span>
    <span class="group">
      <span>{handles.label}</span>
      <Dropdown
        ariaLabel={handles.aria}
        value={editor.showHandles ? 'on' : 'off'}
        options={[{ value: 'on' }, { value: 'off' }]}
        onchange={(v) => (editor.showHandles = v === 'on')}
        title={`Show or hide the ${handles.label} on the image (H)`}
      />
    </span>
  {/if}
  <span class="spacer"></span>
  <span class="zoom">
    <button class="icon" aria-label="Zoom out" title="Zoom out" disabled={!view.zoomed} onclick={() => onzoom(1 / 1.5)}
      >−</button
    >
    <button
      class="fit"
      aria-label="Fit to window"
      title="Fit to window (0)"
      disabled={!view.zoomed}
      onclick={() => view.reset()}>{Math.round(view.zoom * 100)}%</button
    >
    <button class="icon" aria-label="Zoom in" title="Zoom in" onclick={() => onzoom(1.5)}>+</button>
  </span>
  {#if onfullscreen}
    <span class="sep" role="separator" aria-orientation="vertical"></span>
    <button class="icon" aria-label="Full screen" title="Full screen (F)" onclick={onfullscreen}>⛶</button>
  {/if}
</footer>

<style>
  .statusbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--statusbar);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
    padding: 0 12px;
    background: var(--panel);
    border-top: 1px solid var(--rule);
  }
  .statusbar.docked {
    left: var(--sidebar);
    border-left: 1px solid var(--rule);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* Each lock sits before its own label, so the pairs need more room between them. */
  .locks {
    gap: 12px;
  }
  .count {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  /* A rule the full height of the bar, in the same color as the borders. */
  /* Dropdowns take the width of their value instead of shrinking to an ellipsis. */
  .statusbar :global(.dropdown) {
    flex: none;
    width: auto;
    min-width: 0;
  }
  .statusbar > * {
    flex-shrink: 0;
  }
  .sep {
    align-self: stretch;
    width: 1px;
    background: var(--rule);
  }
  .spacer {
    flex: 1;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .fit {
    min-width: 5ch;
    text-align: center;
  }
</style>
