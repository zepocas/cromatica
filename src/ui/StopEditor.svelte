<script lang="ts">
  import { MAX_STOPS, type BlendMode, type ColorStop } from '../design/design';
  import { hexToOklch, inSrgbGamut, oklabToOklch, oklchToHex, srgbEncode } from '../color/oklab';
  import { bakeRamp, evaluateRamp } from '../color/ramp';

  interface Props {
    /** Stops in user order (not necessarily sorted). Mutated in place. */
    stops: ColorStop[];
  }

  let { stops = $bindable() }: Props = $props();

  const STRIP_SAMPLES = 512;
  const KEY_STEP = 0.01;
  const KEY_STEP_LARGE = 0.1;

  const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
    { value: 'oklab', label: 'Perceptual' },
    { value: 'oklab-chroma', label: 'Vivid' },
    { value: 'oklch-short', label: 'Hue (short)' },
    { value: 'oklch-long', label: 'Hue (long)' },
  ];

  let selected = $state(0);
  let strip: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let dragging = $state<number | null>(null);

  const sel = $derived(stops[Math.min(selected, stops.length - 1)]);
  // Indices into `stops`, in position order (stable, same as App's sort).
  const order = $derived(stops.map((_, i) => i).sort((a, b) => stops[a].position - stops[b].position));
  const selIsLast = $derived(order[order.length - 1] === selected);
  const outOfGamut = $derived(sel ? !inSrgbGamut(sel.color) : false);

  function sortedPlain(): ColorStop[] {
    return order.map((i) => $state.snapshot(stops[i]) as ColorStop);
  }

  // Draw the exact ramp the renderer bakes, sRGB-encoded for a 2D canvas.
  $effect(() => {
    const ramp = bakeRamp(sortedPlain(), STRIP_SAMPLES);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(STRIP_SAMPLES, 1);
    for (let i = 0; i < STRIP_SAMPLES; i++) {
      for (let c = 0; c < 3; c++) {
        img.data[i * 4 + c] = Math.round(Math.min(1, Math.max(0, srgbEncode(ramp[i * 4 + c]))) * 255);
      }
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

  function positionAt(clientX: number): number {
    const r = strip.getBoundingClientRect();
    return clamp01((clientX - r.left) / r.width);
  }

  function addStopAt(t: number): number | null {
    if (stops.length >= MAX_STOPS) return null;
    const sorted = sortedPlain();
    // Inherit the blend of the segment the new stop splits.
    let left = sorted[0];
    for (const s of sorted) if (s.position <= t) left = s;
    stops.push({ position: t, color: oklabToOklch(evaluateRamp(sorted, t)), blend: left.blend });
    return stops.length - 1;
  }

  function removeStop(i: number) {
    if (stops.length <= 2) return;
    stops.splice(i, 1);
    selected = Math.min(selected >= i && selected > 0 ? selected - 1 : selected, stops.length - 1);
  }

  function onStripPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]');
    let index: number | null;
    if (handle) {
      index = Number(handle.dataset.stop);
    } else {
      index = addStopAt(positionAt(e.clientX));
      if (index === null) return;
    }
    e.preventDefault();
    selected = index;
    dragging = index;
    strip.setPointerCapture(e.pointerId);
    // Keep keyboard focus on the handle so arrows/Delete work right after.
    queueMicrotask(() => strip.querySelector<HTMLElement>(`[data-stop="${index}"]`)?.focus());
  }

  function onStripPointerMove(e: PointerEvent) {
    if (dragging === null) return;
    stops[dragging].position = positionAt(e.clientX);
  }

  function endDrag(e: PointerEvent) {
    if (dragging === null) return;
    dragging = null;
    if (strip.hasPointerCapture(e.pointerId)) strip.releasePointerCapture(e.pointerId);
  }

  function onHandleKeyDown(e: KeyboardEvent, i: number) {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const stop = stops[i];
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        stop.position = clamp01(stop.position - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        stop.position = clamp01(stop.position + step);
        break;
      case 'Home':
        stop.position = 0;
        break;
      case 'End':
        stop.position = 1;
        break;
      case 'Delete':
      case 'Backspace':
        removeStop(i);
        queueMicrotask(() => strip.querySelector<HTMLElement>(`[data-stop="${selected}"]`)?.focus());
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<div class="editor">
  <div
    class="strip"
    bind:this={strip}
    role="group"
    aria-label="Gradient stops"
    data-testid="stop-strip"
    title="Click to add a color"
    onpointerdown={onStripPointerDown}
    onpointermove={onStripPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
    <canvas bind:this={canvas} width={STRIP_SAMPLES} height="1"></canvas>
    {#each stops as stop, i (i)}
      <div
        class="handle"
        class:selected={i === selected}
        data-stop={i}
        role="slider"
        tabindex="0"
        aria-label="Stop {i + 1}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(stop.position * 100)}
        aria-valuetext="{Math.round(stop.position * 100)}%"
        style:left="{stop.position * 100}%"
        style:background={oklchToHex(stop.color)}
        onfocus={() => (selected = i)}
        onkeydown={(e) => onHandleKeyDown(e, i)}
      ></div>
    {/each}
  </div>

  {#if sel}
    <div class="selected-stop">
      <div class="row">
        <input
          type="color"
          aria-label="Stop color"
          value={oklchToHex(sel.color)}
          oninput={(e) => (sel.color = hexToOklch(e.currentTarget.value))}
        />
        {#if outOfGamut}
          <span class="gamut" title="This color can't be shown exactly; the closest displayable color is used.">
            Out of sRGB — will be mapped
          </span>
        {/if}
        <button
          class="remove"
          aria-label="Remove stop"
          title="Remove stop (Delete)"
          disabled={stops.length <= 2}
          onclick={() => removeStop(selected)}>Remove</button
        >
      </div>
      <label class="row">
        <span>Lightness</span>
        <input type="range" min="0" max="1" step="0.001" bind:value={sel.color[0]} />
      </label>
      <label class="row">
        <span>Intensity</span>
        <input type="range" min="0" max="0.37" step="0.001" bind:value={sel.color[1]} />
      </label>
      <label class="row">
        <span>Hue</span>
        <input class="hue" type="range" min="0" max="360" step="0.5" bind:value={sel.color[2]} />
      </label>
      <label class="row">
        <span>Blend</span>
        <select aria-label="Blend to next stop" bind:value={sel.blend} disabled={selIsLast}>
          {#each BLEND_OPTIONS as o (o.value)}
            <option value={o.value}>{o.label}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .strip {
    position: relative;
    height: 28px;
    margin: 0 8px 8px;
    cursor: copy;
    touch-action: none;
  }
  .strip canvas {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 5px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    image-rendering: auto;
  }
  .handle {
    position: absolute;
    top: 18px;
    width: 14px;
    height: 14px;
    margin-left: -9px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    cursor: grab;
    outline: none;
  }
  .handle::before {
    /* tick connecting the handle to the strip */
    content: '';
    position: absolute;
    left: 50%;
    bottom: 100%;
    width: 2px;
    height: 8px;
    margin-left: -1px;
    background: #fff;
  }
  .handle.selected {
    box-shadow:
      0 0 0 2px #111,
      0 0 0 4px #fff;
    z-index: 1;
  }
  .handle:focus-visible {
    box-shadow:
      0 0 0 2px #111,
      0 0 0 4px #7ab8ff;
  }
  .selected-stop {
    display: flex;
    flex-direction: column;
    gap: 6px;
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
  select {
    flex: 1;
    min-width: 0;
  }
  input[type='color'] {
    width: 32px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    flex: none;
  }
  .gamut {
    font-size: 11px;
    color: #f0c674;
  }
  .remove {
    margin-left: auto;
  }
  button {
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px 9px;
    font: inherit;
    cursor: pointer;
  }
  button:disabled,
  select:disabled {
    opacity: 0.4;
    cursor: default;
  }
  select {
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px;
    font: inherit;
  }
</style>
