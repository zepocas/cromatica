<script lang="ts">
  import { oklchToHex } from '../color/hex';
  import type { GridMesh } from '../design/design';
  import { forwardMap, prepareGrid, restPoint } from '../engine/grid';
  import type { EditorState } from './editor.svelte';
  import { isFormControl, isHandle } from './keys';

  interface Props {
    editor: EditorState;
    /** Frame width / height; the overlay box is exactly the displayed canvas rect. */
    aspect: number;
  }

  let { editor, aspect }: Props = $props();

  const NUDGE = 0.01;
  const NUDGE_LARGE = 0.05;
  /** Samples per grid line segment between two nodes. */
  const LINE_SAMPLES = 12;

  let overlay: HTMLDivElement;
  let drag: { index: number; pointerId: number; u0: number; v0: number; x0: number; y0: number } | null = null;
  let dragging = $state(false);

  const leftPct = (x: number) => (x / aspect + 0.5) * 100;
  const topPct = (y: number) => (0.5 - y) * 100;

  function toComposition(e: MouseEvent): [number, number] {
    const r = overlay.getBoundingClientRect();
    return [(e.clientX - r.left - r.width / 2) / r.height, (r.top + r.height / 2 - e.clientY) / r.height];
  }

  /** The bent grid's row and column lines, as SVG points in percent of the box. */
  const lines = $derived.by(() => {
    const g = $state.snapshot(editor.grid) as GridMesh;
    const prepared = prepareGrid(g);
    const toSvg = (qx: number, qy: number) => {
      const [x, y] = editor.toScreen(...forwardMap(prepared, qx, qy));
      return `${leftPct(x).toFixed(2)},${topPct(y).toFixed(2)}`;
    };
    const out: string[] = [];
    for (let r = 0; r < g.rows; r++) {
      const pts: string[] = [];
      for (let k = 0; k <= (g.cols - 1) * LINE_SAMPLES; k++) {
        const [, y] = restPoint(g, r, 0);
        pts.push(toSvg(-g.rest[0] + (2 * g.rest[0] * k) / ((g.cols - 1) * LINE_SAMPLES), y));
      }
      out.push(pts.join(' '));
    }
    for (let c = 0; c < g.cols; c++) {
      const pts: string[] = [];
      for (let k = 0; k <= (g.rows - 1) * LINE_SAMPLES; k++) {
        const [x] = restPoint(g, 0, c);
        pts.push(toSvg(x, -g.rest[1] + (2 * g.rest[1] * k) / ((g.rows - 1) * LINE_SAMPLES)));
      }
      out.push(pts.join(' '));
    }
    return out;
  });

  function onHandlePointerDown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    editor.selectedNode = i;
    const [u0, v0] = toComposition(e);
    const n = editor.grid.nodes[i];
    const [x0, y0] = editor.toScreen(n.x, n.y);
    drag = { index: i, pointerId: e.pointerId, u0, v0, x0, y0 };
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const [u, v] = toComposition(e);
    editor.moveNode(drag.index, drag.x0 + u - drag.u0, drag.y0 + v - drag.v0);
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    dragging = false;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  function onWindowKeyDown(e: KeyboardEvent) {
    if (editor.kind !== 'grid' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isFormControl(e.target)) return;
    if (e.key === 'h' || e.key === 'H') {
      editor.showHandles = !editor.showHandles;
      e.preventDefault();
      return;
    }
    if (!editor.showHandles) return;
    // Arrows belong to the shuffle history unless a handle has focus.
    if (e.key.startsWith('Arrow') && !isHandle(e.target)) return;
    const n = editor.grid.nodes[editor.selectedNode];
    if (!n) return;
    const [x, y] = editor.toScreen(n.x, n.y);
    const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (!m) return;
    editor.moveNode(editor.selectedNode, x + m[0], y + m[1]);
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<div
  class="overlay"
  class:hidden={!editor.showHandles}
  class:dragging
  bind:this={overlay}
  role="group"
  aria-label="Grid nodes"
  data-testid="grid-overlay"
>
  {#if editor.showHandles}
    <svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {#each lines as pts, i (i)}
        <polyline points={pts} />
      {/each}
    </svg>
    {#each editor.grid.nodes as n, i (i)}
      {@const [x, y] = editor.toScreen(n.x, n.y)}
      {@const [r, c] = editor.nodeCell(i)}
      <div
        class="handle"
        class:selected={i === editor.selectedNode}
        data-node={i}
        data-x={n.x.toFixed(4)}
        data-y={n.y.toFixed(4)}
        role="button"
        tabindex="0"
        aria-label="Node {r + 1}, {c + 1}"
        aria-pressed={i === editor.selectedNode}
        title="Drag to bend the grid"
        style:left="clamp(var(--inset), {leftPct(x)}%, calc(100% - var(--inset)))"
        style:top="clamp(var(--inset), {topPct(y)}%, calc(100% - var(--inset)))"
        style:--color={oklchToHex(n.color)}
        onfocus={() => (editor.selectedNode = i)}
        onpointerdown={(e) => onHandlePointerDown(e, i)}
        onpointermove={onHandlePointerMove}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      ></div>
    {/each}
  {/if}
</div>

<style>
  /* The frame scales with the view; handles keep their on-screen size. */
  .overlay {
    --inset: calc(7px / var(--zoom, 1));
    position: absolute;
    inset: 0;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .overlay.hidden {
    pointer-events: none;
  }
  .lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .lines polyline {
    fill: none;
    stroke: rgba(255, 255, 255, 0.45);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  .handle {
    position: absolute;
    width: 12px;
    height: 12px;
    transform: translate(-50%, -50%) scale(calc(1 / var(--zoom, 1)));
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
    width: 16px;
    height: 16px;
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
</style>
