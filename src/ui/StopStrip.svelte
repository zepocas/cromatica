<script lang="ts">
  import { MAX_STOPS, type ColorStop } from '../design/design';
  import { oklabToOklch, oklchToHex, srgbEncode } from '../color/oklab';
  import { bakeRamp, evaluateRamp } from '../color/ramp';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable only so child bindings into its state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  const STRIP_SAMPLES = 512;
  const KEY_STEP = 0.01;
  const KEY_STEP_LARGE = 0.1;

  let strip: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let dragging = $state<number | null>(null);

  /** Stops in user order (not necessarily sorted). Mutated in place. */
  const stops = $derived(editor.linear.stops);
  // Indices into `stops`, in position order (stable, same as the design's sort).
  const order = $derived(stops.map((_, i) => i).sort((a, b) => stops[a].position - stops[b].position));

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
    editor.selectedStop = index;
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
        editor.removeStop(i);
        queueMicrotask(() => strip.querySelector<HTMLElement>(`[data-stop="${editor.selectedStop}"]`)?.focus());
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

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
      class:selected={i === editor.selectedStop}
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
      onfocus={() => (editor.selectedStop = i)}
      onkeydown={(e) => onHandleKeyDown(e, i)}
    ></div>
  {/each}
</div>

<style>
  .strip {
    position: relative;
    height: 18px;
    margin: 2px 5px 10px;
    cursor: copy;
    touch-action: none;
  }
  .strip canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: auto;
  }
  /* Square markers under the strip, ticked up into it. */
  .handle {
    position: absolute;
    top: 13px;
    width: 9px;
    height: 9px;
    margin-left: -5px;
    border: 1px solid var(--ink);
    cursor: grab;
    outline: none;
  }
  .handle::before {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 100%;
    width: 1px;
    height: 6px;
    background: var(--ink);
  }
  .handle.selected {
    box-shadow:
      0 0 0 2px #111,
      0 0 0 3px var(--ink);
    z-index: 1;
  }
  .handle:focus-visible {
    outline: 1px dashed var(--ink);
    outline-offset: 3px;
  }
</style>
