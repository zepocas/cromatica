<script lang="ts">
  import { MAX_STOPS, type Design, type Rgb } from '../design/design';
  import type { ExportFormat, ExportProgress } from '../export/types';
  import { hexToRgb, rgbToHex } from './color';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './presets';

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

  const stops = $derived(design.base.stops);
  const percent = $derived(
    progress && progress.tilesTotal > 0 ? (progress.tilesDone / progress.tilesTotal) * 100 : 0,
  );

  function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // Insert a new stop in the middle of the widest gap, colored to match.
  function addStop() {
    if (stops.length >= MAX_STOPS) return;
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    let best = 0;
    for (let i = 1; i < sorted.length - 1; i++) {
      if (sorted[i + 1].position - sorted[i].position > sorted[best + 1].position - sorted[best].position) best = i;
    }
    const a = sorted[best];
    const b = sorted[best + 1];
    stops.push({ position: (a.position + b.position) / 2, color: lerpRgb(a.color, b.color, 0.5) });
  }

  function removeStop(i: number) {
    if (stops.length <= 2) return;
    stops.splice(i, 1);
  }

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

  <div class="stops">
    {#each design.base.stops as stop, i (i)}
      <div class="stop">
        <input
          type="color"
          aria-label="Stop {i + 1} color"
          value={rgbToHex(stop.color)}
          oninput={(e) => (stop.color = hexToRgb(e.currentTarget.value))}
        />
        <input
          type="range"
          aria-label="Stop {i + 1} position"
          min="0"
          max="1"
          step="0.001"
          bind:value={stop.position}
        />
        <button
          class="icon"
          title="Remove stop"
          aria-label="Remove stop {i + 1}"
          disabled={stops.length <= 2}
          onclick={() => removeStop(i)}>×</button
        >
      </div>
    {/each}
    <button onclick={addStop} disabled={stops.length >= MAX_STOPS}>Add stop</button>
  </div>

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
    width: 280px;
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
  .row,
  .stop {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row > span:first-child {
    width: 48px;
    flex: none;
    color: #aaa;
  }
  .row input[type='range'],
  .stop input[type='range'],
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
  .stops {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  input[type='color'] {
    width: 28px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    flex: none;
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
  button.icon {
    padding: 0 7px;
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
