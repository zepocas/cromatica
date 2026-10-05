<script lang="ts">
  import type { ExportFormat, ExportProgress } from '../export/types';
  import AdjustSection from './AdjustSection.svelte';
  import ColorsSection from './ColorsSection.svelte';
  import type { EditorState } from './editor.svelte';
  import ExportBar from './ExportBar.svelte';
  import type { Favourites } from './favourites.svelte';
  import FavouritesSection from './FavouritesSection.svelte';
  import { isFormControl, isHandle, isTypingTarget } from './keys';
  import PatternSection from './PatternSection.svelte';

  interface Props {
    editor: EditorState;
    favourites: Favourites;
    presetId: string;
    customWidth: number;
    customHeight: number;
    /** Export size in pixels (from the preset or the custom size). */
    output: { width: number; height: number };
    format: ExportFormat;
    /** Collapsed to a one-line bar floating over a full-width preview. */
    collapsed: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onundo: () => void;
    onredo: () => void;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    onexport: () => void;
    oncancel: () => void;
  }

  let {
    editor = $bindable(),
    favourites,
    presetId = $bindable(),
    customWidth = $bindable(),
    customHeight = $bindable(),
    output,
    format = $bindable(),
    collapsed = $bindable(),
    canUndo,
    canRedo,
    onundo,
    onredo,
    exporting,
    progress,
    error,
    onexport,
    oncancel,
  }: Props = $props();

  const favourite = $derived(favourites.find(editor.design));

  /** App shortcuts: Space shuffles, ← and → step through recent shuffles, [ and ] through warp shapes. */
  function onWindowKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    if (e.key === ' ') {
      // Also stops a focused button from being clicked by the same key.
      e.preventDefault();
      if (!e.repeat) editor.shuffle();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isFormControl(e.target) && !isHandle(e.target)) {
      e.preventDefault();
      editor.stepReel(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      editor.cycleWarpShape(e.key === ']' ? 1 : -1);
    }
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<aside class="panel" class:collapsed>
  <header>
    <h1>cromatica</h1>
    <span class="spacer"></span>
    <button class="icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onclick={onundo}>↶</button>
    <button class="icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onclick={onredo}>↷</button>
    <button
      class="icon"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      title={collapsed ? 'Expand panel' : 'Collapse panel'}
      onclick={() => (collapsed = !collapsed)}>{collapsed ? '□' : '_'}</button
    >
  </header>

  {#if !collapsed}
    <PatternSection bind:editor bind:presetId bind:customWidth bind:customHeight {output} />
    <AdjustSection bind:editor />
    <ColorsSection bind:editor />
    <FavouritesSection {favourites} current={favourite} onopen={(d) => editor.setDesign(d)} />
  {/if}

  <ExportBar
    {editor}
    {favourites}
    {favourite}
    bind:format
    compact={collapsed}
    {exporting}
    {progress}
    {error}
    {onexport}
    {oncancel}
  />
</aside>

<style>
  /* Docked: a full-height column next to the preview, never over it. */
  .panel {
    --pad: 13px;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar);
    padding: 0 var(--pad);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow-y: auto;
    background: var(--panel);
    border-right: 1px solid var(--rule);
  }
  /* Scroll when too tall instead of squashing the controls. */
  .panel > :global(*) {
    flex-shrink: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
  }
  .spacer {
    flex: 1;
  }
  h1 {
    margin: 0;
    font: inherit;
    color: var(--ink);
  }
  h1::before {
    content: '~/';
    color: var(--dim);
  }
  /* Collapsed: one compact bar, so handles under the panel can be reached. */
  .panel.collapsed {
    top: 16px;
    left: 16px;
    bottom: auto;
    width: auto;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--rule);
    background: var(--panel-float);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
</style>
