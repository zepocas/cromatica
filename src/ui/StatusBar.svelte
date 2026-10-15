<script lang="ts">
  import type { ExportFormat } from '../export/types';
  import { CONTEXT_SCREENS } from '../context/screens';
  import Dropdown from './controls/Dropdown.svelte';
  import LockToggle from './controls/LockToggle.svelte';
  import type { EditorState } from './state/editor.svelte';
  import type { CanvasView } from './state/view.svelte';
  import MonitorsPanel from './overlays/MonitorsPanel.svelte';
  import type { MonitorsState } from './state/monitors.svelte';

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
    monitors: MonitorsState;
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
    // Write-only bindable: assigning it is how the value reaches the parent.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    contextPreview = $bindable(),
    monitors,
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
      ...screens.map((s) => {
        // Phones have no second screen to lay beside: off limits while the monitors are on.
        const phone = monitors.on && s.group === 'mobile';
        return {
          value: s.id,
          label: s.label,
          group: s.group,
          title: phone ? 'Not available with monitors on' : `${s.device}, ${s.os}`,
          disabled: phone,
        };
      }),
    ];
  });

  function toggleMonitors() {
    monitors.on = !monitors.on;
    if (monitors.on && CONTEXT_SCREENS.find((s) => s.id === contextId)?.group === 'mobile') contextId = '';
  }

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
    <span class="monitors">
      <button
        class="tool"
        aria-label="Monitors"
        aria-pressed={monitors.on}
        title="Lay monitors over the image to see what each would show"
        onclick={toggleMonitors}>▭▭<span class="name">monitors</span></button
      >
      {#if monitors.on}
        <MonitorsPanel {monitors} />
      {/if}
    </span>
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
    container: statusbar / inline-size;
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
  .monitors {
    position: relative;
  }
  /* A bordered button, so it reads as something to press; the name shows where the bar has the room. */
  .tool {
    padding: 0 3px;
    color: var(--ink);
    border: 1px solid var(--dim);
  }
  .tool:hover,
  .tool[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--rule);
  }
  .tool .name {
    display: none;
  }
  /* The bar's width at which every tool label fits; measured by hand, so re-measure when adding or renaming items. */
  @container statusbar (min-width: 1130px) {
    .tool {
      padding: 1px 8px;
    }
    .tool .name {
      display: inline;
      margin-left: 0.7ch;
    }
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .locks {
    gap: 12px;
  }
  .count {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
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
