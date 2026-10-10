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
  import ViewSection from './ViewSection.svelte';

  interface Props {
    editor: EditorState;
    favourites: Favourites;
    presetId: string;
    presetPreview: string | null;
    customWidth: number;
    customHeight: number;
    /** Export size in pixels (from the preset or the custom size). */
    output: { width: number; height: number };
    format: ExportFormat;
    contextId: string;
    contextPreview: string | null;
    /** Collapsed to a one-line bar floating over a full-width preview. */
    collapsed: boolean;
    exploring: boolean;
    /** The tips card is showing. */
    tips: boolean;
    /** The shortcut list is showing. */
    shortcuts: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onundo: () => void;
    onredo: () => void;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    onexport: () => void;
    oncancel: () => void;
    /** Show the preview alone, filling the screen. Absent where the browser can't. */
    onfullscreen?: () => void;
  }

  let {
    editor = $bindable(),
    favourites,
    presetId = $bindable(),
    presetPreview = $bindable(),
    customWidth = $bindable(),
    customHeight = $bindable(),
    output,
    format = $bindable(),
    contextId = $bindable(),
    contextPreview = $bindable(),
    collapsed = $bindable(),
    exploring = $bindable(),
    tips = $bindable(),
    shortcuts = $bindable(),
    canUndo,
    canRedo,
    onundo,
    onredo,
    exporting,
    progress,
    error,
    onexport,
    oncancel,
    onfullscreen,
  }: Props = $props();

  /** App shortcuts: Space shuffles, ← and → step through recent shuffles, [ and ] through warp shapes, M opens more like this, K keeps a favourite, 1 2 3 lock, P folds the panel, ? lists them all. */
  function onWindowKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    if (e.key === ' ') {
      // Also stops a focused button from being clicked by the same key.
      e.preventDefault();
      if (!e.repeat) editor.shuffle();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isFormControl(e.target) && !isHandle(e.target)) {
      e.preventDefault();
      editor.stepReel(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      exploring = !exploring;
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      editor.cycleWarpShape(e.key === ']' ? 1 : -1);
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      if (!e.repeat) favourites.toggle(editor.design);
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      collapsed = !collapsed;
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      if (e.key === '1') editor.colorsLocked = !editor.colorsLocked;
      else if (e.key === '2') editor.patternLocked = !editor.patternLocked;
      else editor.adjustLocked = !editor.adjustLocked;
    } else if (e.key === '?') {
      e.preventDefault();
      shortcuts = !shortcuts;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<aside class="panel" class:collapsed>
  <header>
    <h1>cromatica</h1>
    <span class="spacer"></span>
    <button
      class="icon"
      aria-label="Tips"
      aria-pressed={tips}
      title="Tips"
      onclick={() => {
        tips = !tips;
        if (tips) shortcuts = false;
      }}>?</button
    >
    <button
      class="icon"
      aria-label="Shortcuts"
      aria-pressed={shortcuts}
      title="Keyboard shortcuts (?)"
      onclick={() => {
        shortcuts = !shortcuts;
        if (shortcuts) tips = false;
      }}>⌨</button
    >
    {#if onfullscreen}
      <button class="icon" aria-label="Full screen" title="Full screen (F)" onclick={onfullscreen}>⛶</button>
    {/if}
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
    <PatternSection bind:editor bind:presetId bind:presetPreview bind:customWidth bind:customHeight {output} />
    <AdjustSection bind:editor />
    <!-- With spare height these sit at the bottom, above the footer; a full panel scrolls as before. -->
    <div class="bottom">
      <ColorsSection bind:editor />
      <ViewSection bind:editor bind:contextId bind:contextPreview portrait={output.height > output.width} />
      <FavouritesSection {favourites} design={editor.design} onopen={(d) => editor.setDesign(d)} />
    </div>
  {/if}

  <ExportBar
    {editor}
    bind:exploring
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
  .bottom {
    margin-top: auto;
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
    font-size: 1.5em;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--ink);
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
