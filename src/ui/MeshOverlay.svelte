<script lang="ts">
  import { oklchToHex } from '../color/oklab';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
    /** Frame width / height; the overlay box is exactly the displayed canvas rect. */
    aspect: number;
  }

  let { editor, aspect }: Props = $props();

  const NUDGE = 0.01;
  const NUDGE_LARGE = 0.05;

  let overlay: HTMLDivElement;
  let drag: { index: number; pointerId: number; u0: number; v0: number; x0: number; y0: number } | null = null;
  let dragging = $state(false);

  // Composition coords (height = 1, origin at center, +y up; src/engine/types.ts)
  // ↔ fractions of the overlay box, which matches the canvas's displayed rect.
  const leftPct = (x: number) => (x / aspect + 0.5) * 100;
  const topPct = (y: number) => (0.5 - y) * 100;

  function toComposition(e: MouseEvent): [number, number] {
    const r = overlay.getBoundingClientRect();
    return [(e.clientX - r.left - r.width / 2) / r.height, (r.top + r.height / 2 - e.clientY) / r.height];
  }

  function isOutside(x: number, y: number): boolean {
    return Math.abs(x) > aspect / 2 || Math.abs(y) > 0.5;
  }

  function focusHandle(i: number) {
    queueMicrotask(() => overlay?.querySelector<HTMLElement>(`[data-point="${i}"]`)?.focus());
  }

  function onHandlePointerDown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    editor.selectedPoint = i;
    editor.adding = false;
    const [u0, v0] = toComposition(e);
    const p = editor.mesh.points[i];
    // Move by pointer delta, so clamped edge indicators can be dragged without the point jumping.
    drag = { index: i, pointerId: e.pointerId, u0, v0, x0: p.x, y0: p.y };
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const [u, v] = toComposition(e);
    editor.movePoint(drag.index, drag.x0 + u - drag.u0, drag.y0 + v - drag.v0);
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    dragging = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  function onOverlayPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !editor.adding) return;
    const [x, y] = toComposition(e);
    const i = editor.addPoint(x, y);
    if (i !== null) focusHandle(i);
  }

  function onOverlayDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-point]')) return;
    const [x, y] = toComposition(e);
    const i = editor.addPoint(x, y);
    if (i !== null) focusHandle(i);
  }

  function onWindowKeyDown(e: KeyboardEvent) {
    if (editor.kind !== 'mesh' || e.metaKey || e.ctrlKey || e.altKey) return;
    // Leave typing and slider/select keys alone.
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.key === 'h' || e.key === 'H') {
      editor.showHandles = !editor.showHandles;
      if (!editor.showHandles) editor.adding = false;
      e.preventDefault();
      return;
    }
    if (!editor.showHandles) return;
    const p = editor.point;
    const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
    switch (e.key) {
      case 'Escape':
        editor.adding = false;
        break;
      case 'Delete':
      case 'Backspace':
        editor.removePoint();
        if (overlay.contains(document.activeElement)) focusHandle(editor.selectedPoint);
        break;
      case 'ArrowLeft':
        editor.movePoint(editor.selectedPoint, p.x - step, p.y);
        break;
      case 'ArrowRight':
        editor.movePoint(editor.selectedPoint, p.x + step, p.y);
        break;
      case 'ArrowUp':
        editor.movePoint(editor.selectedPoint, p.x, p.y + step);
        break;
      case 'ArrowDown':
        editor.movePoint(editor.selectedPoint, p.x, p.y - step);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<div
  class="overlay"
  class:hidden={!editor.showHandles}
  class:adding={editor.adding}
  class:dragging
  bind:this={overlay}
  role="group"
  aria-label="Color points"
  data-testid="mesh-overlay"
  onpointerdown={onOverlayPointerDown}
  ondblclick={onOverlayDblClick}
>
  {#if editor.showHandles}
    {@const sel = editor.point}
    <div
      class="radius"
      style:left="{leftPct(sel.x)}%"
      style:top="{topPct(sel.y)}%"
      style:width="{((2 * sel.radius) / aspect) * 100}%"
      style:height="{2 * sel.radius * 100}%"
    ></div>
    {#each editor.mesh.points as p, i (i)}
      {@const outside = isOutside(p.x, p.y)}
      <div
        class="handle"
        class:selected={i === editor.selectedPoint}
        class:outside
        data-point={i}
        data-x={p.x.toFixed(4)}
        data-y={p.y.toFixed(4)}
        role="button"
        tabindex="0"
        aria-label="Point {i + 1}"
        aria-pressed={i === editor.selectedPoint}
        title={outside ? 'Outside the frame — drag to bring it back' : 'Drag to move · Delete to remove'}
        style:left="clamp(14px, {leftPct(p.x)}%, calc(100% - 14px))"
        style:top="clamp(14px, {topPct(p.y)}%, calc(100% - 14px))"
        style:--color={oklchToHex(p.color)}
        style:--angle="{Math.atan2(-p.y, p.x)}rad"
        onfocus={() => (editor.selectedPoint = i)}
        onpointerdown={(e) => onHandlePointerDown(e, i)}
        onpointermove={onHandlePointerMove}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      ></div>
    {/each}
  {/if}
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .overlay.hidden {
    pointer-events: none;
  }
  .overlay.adding {
    cursor: crosshair;
  }
  .radius {
    position: absolute;
    transform: translate(-50%, -50%);
    border: 1px dashed rgba(255, 255, 255, 0.45);
    border-radius: 50%;
    pointer-events: none;
  }
  .handle {
    position: absolute;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%);
    background: var(--color);
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.35),
      0 1px 4px rgba(0, 0, 0, 0.5);
    cursor: grab;
    outline: none;
  }
  .dragging .handle {
    cursor: grabbing;
  }
  .handle.selected {
    width: 18px;
    height: 18px;
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.55),
      0 0 0 4px #fff,
      0 1px 6px rgba(0, 0, 0, 0.5);
    z-index: 1;
  }
  .handle:focus-visible {
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.55),
      0 0 0 4px #7ab8ff;
  }
  .handle.outside {
    border-style: dashed;
    opacity: 0.85;
  }
  /* Arrow pointing toward where the off-frame point really is. */
  .handle.outside::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    border-left: 6px solid #fff;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    transform: rotate(var(--angle)) translate(11px, -50%);
    transform-origin: 0 0;
  }
</style>
