<script lang="ts">
  import { WARP_SHAPES, type WarpShape } from '../design/design';
  import type { ExportFormat, ExportProgress } from '../export/types';
  import ColorList from './ColorList.svelte';
  import type { EditorState } from './editor.svelte';
  import { isTypingTarget } from './keys';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './presets';
  import Section from './Section.svelte';

  interface Props {
    editor: EditorState;
    presetId: string;
    customWidth: number;
    customHeight: number;
    /** Export size in pixels (from the preset or the custom size). */
    output: { width: number; height: number };
    format: ExportFormat;
    /** Collapsed to a one-line bar floating over a full-width preview. */
    collapsed: boolean;
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
    output,
    format = $bindable(),
    collapsed = $bindable(),
    exporting,
    progress,
    error,
    onexport,
    oncancel,
  }: Props = $props();

  const PATTERNS = [
    { kind: 'mesh', label: 'mesh' },
    { kind: 'linear', label: 'linear' },
  ] as const;

  const WARP_LABELS: Record<WarpShape, string> = {
    none: 'none',
    domain: 'liquid',
    fbm: 'fbm',
    simplex: 'simplex',
    waves: 'waves',
    rows: 'rows',
    columns: 'columns',
    circular: 'ripples',
    oval: 'swirl',
    worley: 'worley',
    voronoi: 'facets',
    curl: 'flow',
  };

  const percent = $derived(
    progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0,
  );
  const warpOff = $derived(editor.warp.shape === 'none');

  function clampSize(v: number): number {
    return Math.min(16384, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));
  }

  /** Typing a size switches to Custom, starting from the current size. */
  function setSize(axis: 'width' | 'height', v: number) {
    customWidth = axis === 'width' ? clampSize(v) : output.width;
    customHeight = axis === 'height' ? clampSize(v) : output.height;
    presetId = CUSTOM_PRESET_ID;
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
    <h1>wallpaper</h1>
    <button
      class="icon"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      title={collapsed ? 'Expand panel' : 'Collapse panel'}
      onclick={() => (collapsed = !collapsed)}>{collapsed ? '□' : '_'}</button
    >
  </header>

  {#if !collapsed}
    <Section title="pattern">
      <label class="row">
        <span>gradient</span>
        <select aria-label="Gradient" bind:value={editor.kind}>
          {#each PATTERNS as p (p.kind)}
            <option value={p.kind}>{p.label}</option>
          {/each}
        </select>
      </label>
      <div class="row">
        <label for="warp-shape">warp shape</label>
        <select id="warp-shape" aria-label="Warp shape" title="[ and ] to step through" bind:value={editor.warp.shape}>
          {#each WARP_SHAPES as s (s)}
            <option value={s}>{WARP_LABELS[s]}</option>
          {/each}
        </select>
        <button
          class="icon"
          aria-label="New variation"
          title="New variation of this shape"
          disabled={warpOff}
          data-seed={editor.warp.seed}
          onclick={() => editor.newWarpVariation()}>⚄</button
        >
      </div>
      <label class="row">
        <span>size</span>
        <select bind:value={presetId} aria-label="Device preset">
          {#each DEVICE_PRESETS as p (p.id)}
            <option value={p.id}>{p.label}</option>
          {/each}
          <option value={CUSTOM_PRESET_ID}>custom</option>
        </select>
      </label>
      <div class="row">
        <span></span>
        <input
          type="number"
          min="1"
          max="16384"
          aria-label="Width"
          value={output.width}
          onchange={(e) => setSize('width', e.currentTarget.valueAsNumber)}
        />
        <span class="dim">×</span>
        <input
          type="number"
          min="1"
          max="16384"
          aria-label="Height"
          value={output.height}
          onchange={(e) => setSize('height', e.currentTarget.valueAsNumber)}
        />
      </div>
    </Section>

    <Section title="adjust">
      <label class="row">
        <span>warp</span>
        <input type="range" min="0" max="1" step="0.01" aria-label="Warp" disabled={warpOff} bind:value={editor.warp.amount} />
        <output>{editor.warp.amount.toFixed(2)}</output>
      </label>
      <label class="row">
        <span>noise</span>
        <input type="range" min="0" max="1" step="0.01" aria-label="Noise" bind:value={editor.grain.amount} />
        <output>{editor.grain.amount.toFixed(2)}</output>
      </label>
      {#if editor.kind === 'mesh'}
        <label class="row">
          <span>blend</span>
          <input type="range" min="0" max="1" step="0.01" aria-label="Blend" title="Soft ↔ defined" bind:value={editor.mesh.sharpness} />
          <output>{editor.mesh.sharpness.toFixed(2)}</output>
        </label>
      {:else}
        <label class="row">
          <span>angle</span>
          <input type="range" min="0" max="360" step="1" aria-label="Angle" bind:value={editor.linear.angle} />
          <output>{Math.round(editor.linear.angle)}°</output>
        </label>
      {/if}

      {#snippet more()}
        <label class="row">
          <span>warp size</span>
          <input type="range" min="0" max="1" step="0.01" aria-label="Warp size" disabled={warpOff} bind:value={editor.warp.size} />
          <output>{editor.warp.size.toFixed(2)}</output>
        </label>
        <label class="row">
          <span>zoom</span>
          <input
            type="range"
            min="-1"
            max="2"
            step="0.01"
            aria-label="Zoom"
            value={Math.log2(editor.transform.zoom)}
            oninput={(e) => editor.setZoom(2 ** e.currentTarget.valueAsNumber)}
          />
          <output>{editor.transform.zoom.toFixed(1)}×</output>
        </label>
        <div class="row">
          <label for="rotate">rotate</label>
          <input
            id="rotate"
            type="range"
            min="0"
            max="359"
            step="1"
            aria-label="Rotate"
            value={editor.transform.rotate}
            oninput={(e) => editor.setRotate(e.currentTarget.valueAsNumber)}
          />
          <button class="icon" aria-label="Rotate left" title="Rotate 90° left" onclick={() => editor.rotateBy(90)}>↺</button>
          <button class="icon" aria-label="Rotate right" title="Rotate 90° right" onclick={() => editor.rotateBy(-90)}>↻</button>
          <output>{Math.round(editor.transform.rotate)}°</output>
        </div>
        <div class="row">
          <span>flip</span>
          <button class="icon" aria-label="Flip horizontally" title="Mirror left ↔ right" onclick={() => editor.flip('x')}>⇋</button>
          <button class="icon" aria-label="Flip vertically" title="Mirror top ↔ bottom" onclick={() => editor.flip('y')}>⇵</button>
          <span class="spacer"></span>
          <button aria-label="Reset" title="Undo rotate, zoom and flips" disabled={!editor.isTransformed} onclick={() => editor.resetTransform()}>[ reset ]</button>
        </div>
      {/snippet}
    </Section>

    <ColorList bind:editor />
  {/if}

  <footer>
    {#if !collapsed}
      <div class="row">
        <span>keep</span>
        <button
          aria-label="Lock colors"
          aria-pressed={editor.colorsLocked}
          title="Keep the colors when shuffling"
          onclick={() => (editor.colorsLocked = !editor.colorsLocked)}>{editor.colorsLocked ? '[x]' : '[ ]'} colors</button
        >
        <button
          aria-label="Lock layout"
          aria-pressed={editor.layoutLocked}
          title="Keep the layout and warp when shuffling"
          onclick={() => (editor.layoutLocked = !editor.layoutLocked)}>{editor.layoutLocked ? '[x]' : '[ ]'} layout</button
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
        {#if !collapsed}
          <span class="spacer"></span>
          <select bind:value={format} aria-label="Format">
            <option value="png">png</option>
            <option value="jpeg">jpeg</option>
          </select>
        {/if}
      {/if}
    </div>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </footer>
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
    justify-content: space-between;
    padding: 6px 0;
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
  .collapsed footer {
    position: static;
    flex-direction: row;
    margin: 0;
    padding: 6px 0;
    border: none;
    background: none;
  }
  .collapsed kbd {
    display: none;
  }
  kbd {
    font: inherit;
    opacity: 0.6;
  }
  .spacer {
    flex: 1;
  }
  .dim {
    color: var(--dim);
  }
  .panel .actions select {
    flex: none;
  }
  footer button[aria-pressed='true'],
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
