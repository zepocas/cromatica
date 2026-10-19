<script lang="ts">
  import type { EditorState } from '../state/editor.svelte';
  import { isFormControl } from '../state/keys';

  interface Props {
    editor: EditorState;
    /** Frame width / height; the overlay box is exactly the displayed canvas rect. */
    aspect: number;
  }

  let { editor, aspect }: Props = $props();

  const NUDGE = 0.01;
  const NUDGE_LARGE = 0.05;

  let overlay: SVGSVGElement;
  let drag: { id: number; pointerId: number; p0: [number, number]; shift: [number, number] } | null = null;
  let dragging = $state(false);

  const active = $derived(editor.showHandles);
  // Read the design here so the outlines follow every edit; planeShapes() is plain math on a copy.
  const shapes = $derived(active ? editor.planeShapes() : []);

  // Composition coords (height = 1, origin at center, +y up) with y flipped for SVG.
  const points = (corners: [number, number][]) => corners.map(([x, y]) => `${x},${-y}`).join(' ');

  function toComposition(e: MouseEvent): [number, number] {
    const r = overlay.getBoundingClientRect();
    return [(e.clientX - r.left - r.width / 2) / r.height, (r.top + r.height / 2 - e.clientY) / r.height];
  }

  function onPlanePointerDown(e: PointerEvent, id: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    editor.selectedPlane = id;
    drag = { id, pointerId: e.pointerId, p0: editor.patternAt(...toComposition(e)), shift: editor.planeShift(id) };
    dragging = true;
    overlay.setPointerCapture(e.pointerId);
    overlay.focus();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const [x, y] = editor.patternAt(...toComposition(e));
    editor.setPlaneShift(drag.id, drag.shift[0] + x - drag.p0[0], drag.shift[1] + y - drag.p0[1]);
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    dragging = false;
    if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
  }

  // A press on the picture between planes lets go of the selection.
  function onBackgroundPointerDown(e: PointerEvent) {
    if (e.button !== 0 || drag) return;
    editor.selectedPlane = -1;
    overlay.focus();
  }

  function nudge(dx: number, dy: number) {
    const id = editor.selectedPlane;
    const [px, py] = editor.patternDelta(dx, dy);
    const [x, y] = editor.planeShift(id);
    editor.setPlaneShift(id, x + px, y + py);
  }

  function onWindowKeyDown(e: KeyboardEvent) {
    if (editor.kind !== 'planes' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isFormControl(e.target)) return;
    if (e.key === 'h' || e.key === 'H') {
      editor.showHandles = !editor.showHandles;
      e.preventDefault();
      return;
    }
    // Arrows belong to the shuffle history unless the overlay has focus.
    if (!active || editor.selectedPlane < 0 || !overlay?.contains(e.target as Node)) return;
    const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
    switch (e.key) {
      case 'ArrowLeft':
        nudge(-step, 0);
        break;
      case 'ArrowRight':
        nudge(step, 0);
        break;
      case 'ArrowUp':
        nudge(0, step);
        break;
      case 'ArrowDown':
        nudge(0, -step);
        break;
      case 'Delete':
      case 'Backspace':
        editor.resetPlane(editor.selectedPlane);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<svg
  class="overlay"
  class:hidden={!active}
  class:dragging
  bind:this={overlay}
  viewBox="{-aspect / 2} -0.5 {aspect} 1"
  preserveAspectRatio="none"
  role="group"
  aria-label="Plane layout"
  tabindex="-1"
  data-plane-overlay
  data-testid="planes-overlay"
  onpointerdown={onBackgroundPointerDown}
  onpointermove={onPointerMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  {#each shapes as s (s.id)}
    <polygon
      class="plane"
      class:selected={s.id === editor.selectedPlane}
      data-plane={s.id}
      data-selected={s.id === editor.selectedPlane}
      role="button"
      tabindex="-1"
      aria-label="Plane {s.id + 1}"
      aria-pressed={s.id === editor.selectedPlane}
      points={points(s.corners)}
      onpointerdown={(e) => onPlanePointerDown(e, s.id)}
    />
  {/each}
  <!-- The picked plane's outline is drawn last, so the planes in front of it do not hide it. -->
  {#each shapes.filter((s) => s.id === editor.selectedPlane) as s (s.id)}
    <polygon class="outline" points={points(s.corners)} />
  {/each}
</svg>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    outline: none;
  }
  .overlay.hidden {
    pointer-events: none;
  }
  .plane {
    fill: transparent;
    stroke: transparent;
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
    cursor: grab;
    pointer-events: all;
  }
  .plane:hover {
    stroke: rgba(255, 255, 255, 0.45);
  }
  .dragging .plane {
    cursor: grabbing;
  }
  .outline {
    fill: none;
    stroke: #fff;
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.7));
  }
</style>
