<script lang="ts">
  import type { ExportFormat, ExportProgress } from '../export/types';
  import type { EditorState } from './editor.svelte';
  import { isTypingTarget } from './keys';
  import MeshEditor from './MeshEditor.svelte';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './presets';
  import StopEditor from './StopEditor.svelte';
  import WarpControls from './WarpControls.svelte';

  interface Props {
    editor: EditorState;
    presetId: string;
    customWidth: number;
    customHeight: number;
    format: ExportFormat;
    exporting: boolean;
    progress: ExportProgress | null;
    error: string;
    onexport: () => void;
    oncancel: () => void;
  }

  let {
    editor = $bindable(),
    presetId = $bindable(),
    customWidth = $bindable(),
    customHeight = $bindable(),
    format = $bindable(),
    exporting,
    progress,
    error,
    onexport,
    oncancel,
  }: Props = $props();

  const PATTERNS = [
    { kind: 'linear', label: 'Gradient' },
    { kind: 'mesh', label: 'Mesh' },
  ] as const;

  const percent = $derived(
    progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0,
  );

  let collapsed = $state(false);

  function clampSize(v: number): number {
    return Math.min(16384, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));
  }

  function onWindowKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    if (e.key === ' ') {
      // Also stops a focused button from being clicked by the same key.
      e.preventDefault();
      if (!e.repeat) editor.shuffle();
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      editor.cycleWarpShape(e.key === ']' ? 1 : -1);
    }
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<aside class="panel" class:collapsed>
  <header>
    <h1>Wallpaper</h1>
    <button
      class="chevron"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      title={collapsed ? 'Expand panel' : 'Collapse panel'}
      onclick={() => (collapsed = !collapsed)}
    >
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="shuffle">
    <button
      class="shuffle-button"
      disabled={!editor.canShuffle}
      title={editor.canShuffle ? 'Shuffle (Space)' : 'Unlock colors or layout to shuffle'}
      onclick={() => editor.shuffle()}>Shuffle <kbd>Space</kbd></button
    >
    {#if !collapsed}
      <div class="locks" role="group" aria-label="Keep when shuffling">
        <button
          class="lock"
          aria-label="Lock colors"
          aria-pressed={editor.colorsLocked}
          title="Keep the colors when shuffling"
          onclick={() => (editor.colorsLocked = !editor.colorsLocked)}>{@render lockIcon(editor.colorsLocked)}Colors</button
        >
        <button
          class="lock"
          aria-label="Lock layout"
          aria-pressed={editor.layoutLocked}
          title="Keep the layout and warp when shuffling"
          onclick={() => (editor.layoutLocked = !editor.layoutLocked)}>{@render lockIcon(editor.layoutLocked)}Layout</button
        >
      </div>
    {/if}
  </div>

  {#if !collapsed}
    <hr />

    <div class="segmented" role="radiogroup" aria-label="Pattern">
      {#each PATTERNS as p (p.kind)}
        <button
          role="radio"
          aria-checked={editor.kind === p.kind}
          class:active={editor.kind === p.kind}
          onclick={() => (editor.kind = p.kind)}>{p.label}</button
        >
      {/each}
    </div>

    {#if editor.kind === 'mesh'}
      <MeshEditor bind:editor />
    {:else}
      <label class="row">
        <span>Angle</span>
        <input type="range" min="0" max="360" step="1" bind:value={editor.linear.angle} />
        <output>{Math.round(editor.linear.angle)}°</output>
      </label>

      <StopEditor bind:stops={editor.linear.stops} />
    {/if}

    <hr />
    <h2>Warp</h2>
    <WarpControls bind:editor />

    <hr />
    <h2>Grain</h2>
    <label class="row">
      <span>Amount</span>
      <input type="range" min="0" max="1" step="0.01" aria-label="Grain amount" bind:value={editor.grain.amount} />
    </label>
    <label class="row">
      <span>Size</span>
      <input type="range" min="0" max="1" step="0.01" aria-label="Grain size" bind:value={editor.grain.size} />
    </label>

    <hr />

    <label class="row">
      <span>Device</span>
      <select bind:value={presetId} aria-label="Device preset">
        {#each DEVICE_PRESETS as p (p.id)}
          <option value={p.id}>{p.label} — {p.width}×{p.height}</option>
        {/each}
        <option value={CUSTOM_PRESET_ID}>Custom</option>
      </select>
    </label>

    {#if presetId === CUSTOM_PRESET_ID}
      <div class="row">
        <span>Size</span>
        <input
          type="number"
          min="1"
          max="16384"
          aria-label="Custom width"
          value={customWidth}
          onchange={(e) => (customWidth = clampSize(e.currentTarget.valueAsNumber))}
        />
        <span>×</span>
        <input
          type="number"
          min="1"
          max="16384"
          aria-label="Custom height"
          value={customHeight}
          onchange={(e) => (customHeight = clampSize(e.currentTarget.valueAsNumber))}
        />
      </div>
    {/if}

    <label class="row">
      <span>Format</span>
      <select bind:value={format} aria-label="Format">
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
      </select>
    </label>
  {/if}

  {#if exporting}
    <div class="row">
      <progress max="100" value={percent} aria-label="Export progress"></progress>
      <button onclick={oncancel}>Cancel</button>
    </div>
  {:else}
    <button class="primary" onclick={onexport}>Export</button>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</aside>

{#snippet lockIcon(locked: boolean)}
  <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
    <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" />
    <path
      d={locked ? 'M3.8 5.5V4a2.2 2.2 0 0 1 4.4 0v1.5' : 'M3.8 5.5V4a2.2 2.2 0 0 1 4.3-.7'}
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
    />
  </svg>
{/snippet}

<style>
  .panel {
    position: fixed;
    top: 16px;
    left: 16px;
    width: 300px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: rgba(20, 20, 24, 0.72);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    color: #eee;
    font-size: 13px;
    max-height: calc(100vh - 32px);
    box-sizing: border-box;
    overflow-y: auto;
  }
  /* Collapsed: one compact bar, so handles under the panel can be reached. */
  .panel.collapsed {
    width: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: 8px 10px;
  }
  .collapsed header {
    gap: 2px;
  }
  .collapsed .shuffle-button kbd {
    display: none;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #888;
  }
  .chevron {
    display: grid;
    place-items: center;
    padding: 4px;
    border: none;
    background: none;
    color: #aaa;
  }
  .chevron svg {
    transition: transform 0.15s;
  }
  .collapsed .chevron svg {
    transform: rotate(-90deg);
  }
  .shuffle {
    display: flex;
    gap: 6px;
  }
  .shuffle-button {
    flex: 1;
    padding: 7px 10px;
    background: #7ab8ff;
    border-color: transparent;
    color: #111;
    font-weight: 600;
  }
  .shuffle-button kbd {
    font: inherit;
    font-size: 11px;
    font-weight: 400;
    opacity: 0.6;
    margin-left: 4px;
  }
  .locks {
    display: flex;
    gap: 4px;
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 7px;
    color: #aaa;
  }
  .lock[aria-pressed='true'] {
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
  }
  .segmented {
    display: flex;
    padding: 2px;
    gap: 2px;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 8px;
  }
  .segmented button {
    flex: 1;
    border: none;
    background: none;
    padding: 4px 10px;
  }
  .segmented button.active {
    background: rgba(255, 255, 255, 0.16);
    font-weight: 600;
  }
  hr {
    width: 100%;
    margin: 2px 0;
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row > span:first-child {
    width: 60px;
    flex: none;
    color: #aaa;
  }
  .row input[type='range'],
  select,
  progress {
    flex: 1;
    min-width: 0;
  }
  .row input[type='number'] {
    width: 72px;
    flex: 1;
    min-width: 0;
  }
  output {
    width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  button {
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 5px 10px;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.primary {
    background: #fff;
    color: #111;
    font-weight: 600;
  }
  select,
  input[type='number'] {
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px;
    font: inherit;
  }
  .error {
    margin: 0;
    color: #ff8a8a;
  }
</style>
