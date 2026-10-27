<script lang="ts">
  import type { ExportProgress } from '../export/types';
  import AdjustSection from './sections/AdjustSection.svelte';
  import ColorsSection from './sections/ColorsSection.svelte';
  import type { EditorState } from './state/editor.svelte';
  import ExportBar from './ExportBar.svelte';
  import type { ExportSettings } from './state/export-settings.svelte';
  import type { Favourites } from './state/favourites.svelte';
  import type { PanelUi } from './state/panel-ui.svelte';
  import FavouritesSection from './sections/FavouritesSection.svelte';
  import { isFormControl, isHandle, isTypingTarget } from './state/keys';
  import PatternSection from './sections/PatternSection.svelte';

  interface Props {
    editor: EditorState;
    favourites: Favourites;
    exportSettings: ExportSettings;
    ui: PanelUi;
    canUndo: boolean;
    canRedo: boolean;
    onundo: () => void;
    onredo: () => void;
    /** Pulse the shuffle button: the visitor hasn't used it yet. */
    nudgeShuffle: boolean;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    /** A status line that isn't an error ("link copied"). */
    notice: string;
    onshare: () => void;
    onexport: () => void;
    oncancel: () => void;
  }

  let {
    editor = $bindable(),
    favourites,
    exportSettings,
    ui,
    canUndo,
    canRedo,
    onundo,
    onredo,
    nudgeShuffle,
    exporting,
    progress,
    error,
    notice,
    onshare,
    onexport,
    oncancel,
  }: Props = $props();

  /** App shortcuts: Space shuffles, ← and → step through recent shuffles, L and ; through patterns, comma and period through warp shapes, Q shuffles pattern and adjust, W the colors, R swaps their order, D rolls the pattern's own dice, V a new warp variation, M opens more like this, K keeps a favourite, P folds the panel, ? lists them all. */
  function onWindowKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    if (e.key === ' ') {
      // Also stops a focused button from being clicked by the same key.
      e.preventDefault();
      if (!e.repeat) editor.shuffle();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isFormControl(e.target) && !isHandle(e.target)) {
      e.preventDefault();
      editor.stepReel(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      if (!e.repeat) editor.shuffleLook();
    } else if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (!e.repeat) editor.shuffleColors();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (!e.repeat) editor.palette.shuffleOrder();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      ui.exploring = !ui.exploring;
    } else if (e.key === 'l' || e.key === 'L' || e.key === ';' || e.key === ':') {
      e.preventDefault();
      editor.cycleKind(e.key === ';' || e.key === ':' ? 1 : -1);
    } else if (e.key === ',' || e.key === '.' || e.key === '<' || e.key === '>') {
      e.preventDefault();
      editor.cycleWarpShape(e.key === '.' || e.key === '>' ? 1 : -1);
    } else if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      if (!e.repeat) editor.rollPattern();
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      if (!e.repeat && editor.warp.shape !== 'none') editor.newWarpVariation();
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      if (!e.repeat) favourites.toggle(editor.design);
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      ui.collapsed = !ui.collapsed;
    } else if (e.key === '?') {
      e.preventDefault();
      ui.shortcuts = !ui.shortcuts;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<aside class="panel" class:collapsed={ui.collapsed}>
  <header>
    <h1>cromatica</h1>
    <span class="spacer"></span>
    <button
      class="icon"
      aria-label="Tips"
      aria-pressed={ui.tips}
      title="Tips"
      onclick={() => {
        ui.tips = !ui.tips;
        if (ui.tips) ui.shortcuts = false;
      }}>?</button
    >
    <button
      class="icon"
      aria-label="Shortcuts"
      aria-pressed={ui.shortcuts}
      title="Keyboard shortcuts (?)"
      onclick={() => {
        ui.shortcuts = !ui.shortcuts;
        if (ui.shortcuts) ui.tips = false;
      }}>⌨</button
    >
    <button class="icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onclick={onundo}>↶</button>
    <button class="icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onclick={onredo}>↷</button>
    <button
      class="icon"
      aria-expanded={!ui.collapsed}
      aria-label={ui.collapsed ? 'Expand panel' : 'Collapse panel'}
      title={ui.collapsed ? 'Expand panel (P)' : 'Collapse panel (P)'}
      onclick={() => (ui.collapsed = !ui.collapsed)}>{ui.collapsed ? '□' : '_'}</button
    >
  </header>

  {#if !ui.collapsed}
    <PatternSection bind:editor {exportSettings} />
    <AdjustSection bind:editor />
    <!-- With spare height these sit at the bottom, above the footer; a full panel scrolls as before. -->
    <div class="bottom">
      <ColorsSection bind:editor />
      <FavouritesSection {favourites} design={editor.design} onopen={(d) => editor.setDesign(d)} />
    </div>
  {/if}

  <ExportBar
    {editor}
    {ui}
    compact={ui.collapsed}
    {nudgeShuffle}
    {exporting}
    {progress}
    {error}
    {notice}
    {onshare}
    {onexport}
    {oncancel}
  />
</aside>

<style>
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
    position: sticky;
    top: 0;
    z-index: var(--z-panel);
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 calc(-1 * var(--pad));
    padding: 6px var(--pad);
    background: var(--panel);
  }
  .panel.collapsed header {
    position: static;
    margin: 0;
    padding: 6px 0;
    background: none;
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
