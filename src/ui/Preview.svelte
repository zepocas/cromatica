<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { Design } from '../design/design';
  import { createPreview, type PreviewController } from '../preview/preview';
  import { isTypingTarget } from './keys';
  import type { CanvasView } from './view.svelte';

  interface Props {
    design: Design;
    aspect: number;
    paused?: boolean;
    /** Rendered over the canvas, in a box that matches its displayed rect exactly. */
    overlay?: Snippet;
    /** Leave room for the docked sidebar (--sidebar) on the left. */
    docked?: boolean;
    /** Pinch/zoom and pan of the frame. Screen only: never reaches the design or the export. */
    view: CanvasView;
    /** False while something else (the "more like this" grid) covers the frame; it shows fitted. */
    zoomable?: boolean;
  }

  let { design, aspect, paused = false, overlay, docked = false, view, zoomable = true }: Props = $props();

  /** Wheel pixels per e-fold of zoom; a trackpad pinch arrives as ctrl + wheel. */
  const PINCH_SENSITIVITY = 100;

  let container: HTMLDivElement;
  let frame: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let controller: PreviewController | null = null;
  let error = $state('');

  $effect(() => {
    try {
      controller = createPreview(
        canvas,
        untrack(() => design),
        {
          container,
          aspect: untrack(() => aspect),
        },
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return () => {
      controller?.dispose();
      controller = null;
    };
  });

  $effect(() => controller?.setDesign(design));
  $effect(() => controller?.setAspect(aspect));
  $effect(() => controller?.setPaused(paused));

  // A new shape is a new composition: start fitted.
  $effect(() => {
    void aspect;
    view.reset();
  });

  /** A pointer position from the frame's centre, which is the viewport's centre. */
  function fromCentre(e: { clientX: number; clientY: number }): [number, number] {
    const r = container.getBoundingClientRect();
    return [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)];
  }

  // Safari sends a pinch as gesture events, not ctrl + wheel.
  interface GestureLike extends Event {
    scale: number;
    clientX: number;
    clientY: number;
  }

  $effect(() => {
    let startZoom = 1;
    const onWheel = (e: WheelEvent) => {
      if (!zoomable) return;
      // Also keeps the browser from zooming the whole page.
      e.preventDefault();
      if (e.ctrlKey) {
        const [cx, cy] = fromCentre(e);
        view.zoomAt(Math.exp(-e.deltaY / PINCH_SENSITIVITY), cx, cy, frame.offsetWidth, frame.offsetHeight);
      } else {
        view.panBy(-e.deltaX, -e.deltaY, frame.offsetWidth, frame.offsetHeight);
      }
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      startZoom = view.zoom;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (!zoomable) return;
      const g = e as GestureLike;
      const [cx, cy] = fromCentre(g);
      view.zoomAt((startZoom * g.scale) / view.zoom, cx, cy, frame.offsetWidth, frame.offsetHeight);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('gesturestart', onGestureStart);
    container.addEventListener('gesturechange', onGestureChange);
    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('gesturestart', onGestureStart);
      container.removeEventListener('gesturechange', onGestureChange);
    };
  });

  let pan: { pointerId: number; x: number; y: number } | null = null;
  let panning = $state(false);

  /** Dragging anywhere but a handle or a button pans, once zoomed in. */
  function onPointerDown(e: PointerEvent) {
    if (!zoomable || !view.zoomed || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-point], [data-node], button')) return;
    pan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    panning = true;
    container.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    view.panBy(e.clientX - pan.x, e.clientY - pan.y, frame.offsetWidth, frame.offsetHeight);
    pan.x = e.clientX;
    pan.y = e.clientY;
  }

  function endPan(e: PointerEvent) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    pan = null;
    panning = false;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== '0' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    view.reset();
  }

  const shown = $derived(zoomable && view.zoomed);
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="viewport"
  class:docked
  class:zoomed={shown}
  class:panning
  bind:this={container}
  role="presentation"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={endPan}
  onpointercancel={endPan}
>
  <!-- The frame hugs the letterboxed canvas, so the overlay shares its rect. -->
  <div
    class="frame"
    bind:this={frame}
    style:--zoom={shown ? view.zoom : 1}
    style:transform={shown ? `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` : undefined}
  >
    <canvas bind:this={canvas} data-testid="preview-canvas"></canvas>
    {@render overlay?.()}
  </div>
  {#if shown}
    <button class="fit" title="Fit to window (0)" onclick={() => view.reset()}>
      [ {Math.round(view.zoom * 100)}% · fit ]
    </button>
  {/if}
  {#if error}
    <p class="error">Preview unavailable: {error}</p>
  {/if}
</div>

<style>
  .viewport {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .viewport.docked {
    inset: 24px 24px 24px calc(var(--sidebar) + 24px);
  }
  .viewport.zoomed {
    cursor: grab;
    touch-action: none;
  }
  .viewport.panning {
    cursor: grabbing;
  }
  .fit {
    position: absolute;
    right: 12px;
    bottom: 12px;
    padding: 2px 6px;
    font:
      12px ui-monospace,
      'SF Mono',
      'JetBrains Mono',
      Menlo,
      Consolas,
      monospace;
    color: #dcd9d2;
    background: rgba(21, 21, 20, 0.88);
    border: 0;
    cursor: pointer;
  }
  .frame {
    position: relative;
    flex: none;
    /* Keeps the radius ring of a big point inside the frame. */
    overflow: hidden;
  }
  canvas {
    display: block;
  }
  .error {
    position: absolute;
    color: #f88;
  }
</style>
