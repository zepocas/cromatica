<script lang="ts">
  import { CONTEXT_SCREENS } from '../context/screens';
  import type { ExportProgress } from '../export/types';
  import Dropdown from './controls/Dropdown.svelte';
  import { glow } from './controls/glow';
  import type { EditorState } from './state/editor.svelte';
  import type { ExportSettings } from './state/export-settings.svelte';
  import type { PanelUi } from './state/panel-ui.svelte';
  import type { CanvasView } from './state/view.svelte';
  import MonitorsPanel from './overlays/MonitorsPanel.svelte';
  import type { MonitorsState } from './state/monitors.svelte';

  interface Props {
    editor: EditorState;
    view: CanvasView;
    ui: PanelUi;
    /** Portrait outputs list the phone screens first. */
    portrait: boolean;
    /** Beside the docked panel; otherwise the full width. */
    docked: boolean;
    monitors: MonitorsState;
    exportSettings: ExportSettings;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    /** A status line that isn't an error ("link copied"). */
    notice: string;
    onshare: () => void;
    onexport: () => void;
    oncancel: () => void;
    onzoom: (factor: number) => void;
    /** Absent where the browser can't. */
    onfullscreen?: () => void;
  }

  let {
    editor,
    view,
    docked,
    exportSettings,
    exporting,
    progress,
    error,
    notice,
    onshare,
    onexport,
    oncancel,
    ui,
    monitors,
    portrait,
    onzoom,
    onfullscreen,
  }: Props = $props();

  const percent = $derived(progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0);

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

  /** A mouse wheel only turns vertically; let it scroll the groups when they overflow, from anywhere on the bar. */
  function wheelSideways(e: WheelEvent) {
    const el = (e.currentTarget as HTMLElement).querySelector('.scroll');
    if (!el || e.deltaX || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
  }

  const handles = $derived(
    editor.kind === 'mesh'
      ? { label: 'mesh points', aria: 'Mesh points', key: 'showMeshPoints' as const }
      : editor.kind === 'grid'
        ? { label: 'grid nodes', aria: 'Grid nodes', key: 'showGridNodes' as const }
        : null,
  );
</script>

<footer class="panel statusbar" class:docked aria-label="Status bar" onwheel={wheelSideways}>
  <div class="output">
    {#if exporting}
      <progress max="100" value={percent} aria-label="Export progress"></progress>
      <button class="btn" onclick={oncancel}>cancel</button>
    {:else}
      <span class="format">
        <span class="label">format</span>
        <Dropdown
          ariaLabel="Format"
          title="File type of the download"
          value={exportSettings.format}
          options={[{ value: 'png' }, { value: 'jpeg' }]}
          onchange={(f) => (exportSettings.format = f)}
        />
        <button
          class="btn strong"
          aria-label="Download"
          title="Download (⌘S)"
          onclick={onexport}
          {@attach glow('download')}>download</button
        >
      </span>
      <button
        class="btn"
        aria-label="Copy share link"
        title="Copy a link to this design"
        onclick={onshare}
        {@attach glow('share')}>share link</button
      >
    {/if}
    {#if error}
      <span class="msg error" role="alert" title={error}>{error}</span>
    {:else if notice}
      <span class="msg" role="status" title={notice}>{notice}</span>
    {/if}
  </div>
  <div class="scroll">
    <span class="spacer"></span>
    <span class="group">
      <span>recent</span>
      <button
        class="icon"
        aria-label="Previous shuffle"
        title="Previous shuffle (←)"
        disabled={!editor.reel.canBack}
        {@attach glow('reel-back')}
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
        {@attach glow('reel-forward')}
        onclick={() => editor.stepReel(1)}>→</button
      >
    </span>
    <span class="sep" role="separator" aria-orientation="vertical"></span>
    <span class="group">
      <span>os context</span>
      <Dropdown
        ariaLabel="OS context"
        value={ui.contextId || OFF}
        {options}
        onchange={(id) => {
          ui.contextAuto = false;
          ui.contextId = id === OFF ? '' : id;
        }}
        onactive={(id) => (ui.contextPreview = id === null ? null : id === OFF ? '' : id)}
        title="Show the OS on top of the image, and warn where its text would be hard to read (O)"
      />
      <span class="monitors">
        <button
          class="tool"
          aria-label="Monitors"
          aria-pressed={monitors.on}
          title="Lay monitors over the image to see what each would show"
          onclick={() => monitors.toggle(ui)}>▭▭<span class="name">monitors</span></button
        >
      </span>
    </span>
    {#if handles}
      <span class="sep" role="separator" aria-orientation="vertical"></span>
      <span class="group">
        <span>{handles.label}</span>
        <Dropdown
          ariaLabel={handles.aria}
          value={editor[handles.key] ? 'on' : 'off'}
          options={[{ value: 'on' }, { value: 'off' }]}
          onchange={(v) => (editor[handles.key] = v === 'on')}
          title={`Show or hide the ${handles.label} on the image (N)`}
        />
      </span>
    {/if}
    <span class="zoom">
      <button
        class="icon"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!view.zoomed}
        onclick={() => onzoom(1 / 1.5)}>−</button
      >
      <button
        class="fit"
        aria-label="Fit to window"
        title="Fit to window (0)"
        disabled={!view.zoomed}
        {@attach glow('fit')}
        onclick={() => view.reset()}>{Math.round(view.zoom * 100)}%</button
      >
      <button class="icon" aria-label="Zoom in" title="Zoom in" onclick={() => onzoom(1.5)}>+</button>
    </span>
    {#if onfullscreen}
      <span class="sep" role="separator" aria-orientation="vertical"></span>
      <button
        class="icon"
        aria-label="Full screen"
        title="Full screen (F)"
        onclick={onfullscreen}
        {@attach glow('fullscreen')}>⛶</button
      >
    {/if}
  </div>
  {#if monitors.on}
    <MonitorsPanel {monitors} />
  {/if}
</footer>

<style>
  .statusbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--statusbar);
    box-sizing: border-box;
    background: var(--panel);
    border-top: 1px solid var(--rule);
  }
  .statusbar.docked {
    left: var(--sidebar);
    border-left: 1px solid var(--rule);
  }
  /* Scrolls sideways when the groups don't fit; the frame stays put so the monitors popover isn't clipped. */
  .scroll {
    container: statusbar / inline-size;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 100%;
    box-sizing: border-box;
    padding: 0 12px;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  /* Pinned at the left, outside the scrolling groups, so share and download are always in reach. */
  .output {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-right: 1px solid var(--rule);
    white-space: nowrap;
  }
  .format {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label {
    margin-right: 2px;
  }
  .strong {
    color: var(--ink);
    border-color: var(--ink);
  }
  progress {
    width: 140px;
    accent-color: var(--ink);
  }
  .msg {
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--dim);
  }
  .msg.error {
    color: var(--warn);
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
  /* The width of the scrolling groups at which every tool label fits (the output group is not part of it); measured by hand, so re-measure when adding or renaming items. */
  @container statusbar (min-width: 680px) {
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
  .scroll > * {
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
