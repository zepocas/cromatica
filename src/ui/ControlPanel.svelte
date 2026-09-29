<script lang="ts">
  import type { Design } from '../design/design';
  import type { ExportFormat, ExportProgress } from '../export/types';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './presets';
  import StopEditor from './StopEditor.svelte';

  interface Props {
    design: Design;
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
    design = $bindable(),
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

  const percent = $derived(
    progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0,
  );

  function clampSize(v: number): number {
    return Math.min(16384, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));
  }
</script>

<aside class="panel">
  <h1>Gradient</h1>

  <label class="row">
    <span>Angle</span>
    <input type="range" min="0" max="360" step="1" bind:value={design.base.angle} />
    <output>{Math.round(design.base.angle)}°</output>
  </label>

  <StopEditor bind:stops={design.base.stops} />

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
  }
  h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
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
