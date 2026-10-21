<script lang="ts">
  import { oklchToHex } from '../../color/hex';
  import { MAX_GRID, MIN_GRID } from '../../design/design';
  import type { EditorState } from '../state/editor.svelte';
  import { isFormControl } from '../state/keys';

  interface Props {
    editor: EditorState;
  }

  let { editor }: Props = $props();

  let picture = $state<HTMLDivElement | null>(null);
  let drag: { index: number; pointerId: number } | null = null;
  let dragging = $state(false);
  /** Where the window was dragged to, from its home in the top right corner. */
  let moved = $state({ x: 0, y: 0 });
  let move: { pointerId: number; x: number; y: number; x0: number; y0: number } | null = null;

  const source = $derived(editor.pins.source);
  const pins = $derived(editor.pins.items);
  /** On the mesh, the part of the image the frame shows (the rest is dimmed); pins stay inside it. */
  const area = $derived(editor.pins.area);
  const cropped = $derived(editor.kind === 'mesh');
  const url = $derived(source ? URL.createObjectURL(source.file) : '');
  $effect(() => () => URL.revokeObjectURL(url));

  const pct = (t: number) => `${t * 100}%`;

  function imageAt(e: MouseEvent): [number, number] {
    const r = picture!.getBoundingClientRect();
    const clamp = (t: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, t));
    return [
      clamp((e.clientX - r.left) / r.width, area.u0, area.u1),
      clamp((e.clientY - r.top) / r.height, area.v0, area.v1),
    ];
  }

  function startDrag(e: PointerEvent, index: number) {
    e.preventDefault();
    editor.selectedIndex = index;
    drag = { index, pointerId: e.pointerId };
    dragging = true;
    picture!.setPointerCapture(e.pointerId);
  }

  function onPicturePointerDown(e: PointerEvent) {
    // Ctrl+click is a right-click on a Mac: it removes, it must not also add.
    if (e.button !== 0 || e.ctrlKey) return;
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-pin]');
    if (hit) return startDrag(e, Number(hit.dataset.pin));
    const i = editor.pins.add(...imageAt(e));
    if (i !== null) startDrag(e, i);
  }

  function onPictureContextMenu(e: MouseEvent) {
    e.preventDefault();
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-pin]');
    if (hit) editor.pins.remove(Number(hit.dataset.pin));
  }

  function onPicturePointerMove(e: PointerEvent) {
    if (drag && e.pointerId === drag.pointerId) editor.pins.move(drag.index, ...imageAt(e));
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    dragging = false;
    if (picture?.hasPointerCapture(e.pointerId)) picture.releasePointerCapture(e.pointerId);
  }

  function onTitlePointerDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    move = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, x0: moved.x, y0: moved.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onTitlePointerMove(e: PointerEvent) {
    if (move && e.pointerId === move.pointerId) {
      moved = { x: move.x0 + e.clientX - move.x, y: move.y0 + e.clientY - move.y };
    }
  }

  function onTitlePointerUp(e: PointerEvent) {
    if (move?.pointerId === e.pointerId) move = null;
  }

  function onWindowKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey || isFormControl(e.target)) return;
    editor.pins.pinning = false;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<div
  class="window"
  role="dialog"
  aria-label="Pick colors on the image"
  data-testid="image-pins"
  style:transform="translate({moved.x}px, {moved.y}px)"
>
  <div
    class="title"
    role="presentation"
    onpointerdown={onTitlePointerDown}
    onpointermove={onTitlePointerMove}
    onpointerup={onTitlePointerUp}
    onpointercancel={onTitlePointerUp}
  >
    <span>pins</span>
    <button aria-label="Done picking" title="Close (Esc)" onclick={() => (editor.pins.pinning = false)}>×</button>
  </div>
  {#if editor.kind === 'grid'}
    <!-- A net has a fixed grid of nodes, so colors are added by growing it. -->
    <div class="net" role="group" aria-label="Net size">
      {#each [['rows', editor.grid.rows], ['columns', editor.grid.cols]] as const as [name, count] (name)}
        {@const setSize = (n: number) =>
          name === 'rows' ? editor.setGridSize(n, editor.grid.cols) : editor.setGridSize(editor.grid.rows, n)}
        <span class="stepper">
          {name}
          <button aria-label="Fewer {name}" disabled={count <= MIN_GRID} onclick={() => setSize(count - 1)}>−</button>
          <b>{count}</b>
          <button aria-label="More {name}" disabled={count >= MAX_GRID} onclick={() => setSize(count + 1)}>+</button>
        </span>
      {/each}
    </div>
  {/if}
  {#if source}
    <div
      class="picture"
      class:dragging
      bind:this={picture}
      role="group"
      aria-label="Pins on the image"
      style:aspect-ratio={source.aspect}
      style:--max-width="min(360px, calc(50vh * {source.aspect}))"
      onpointerdown={onPicturePointerDown}
      oncontextmenu={onPictureContextMenu}
      onpointermove={onPicturePointerMove}
      onpointerup={endDrag}
      onpointercancel={endDrag}
    >
      <img src={url} alt="" draggable="false" />
      {#if cropped}
        <div
          class="frame"
          style:left={pct(area.u0)}
          style:top={pct(area.v0)}
          style:width={pct(area.u1 - area.u0)}
          style:height={pct(area.v1 - area.v0)}
        ></div>
      {/if}
      {#each pins as pin, i (i)}
        <div
          class="pin"
          class:selected={i === editor.selectedIndex}
          data-pin={i}
          data-u={pin.u.toFixed(4)}
          data-v={pin.v.toFixed(4)}
          role="button"
          tabindex="-1"
          aria-label="Pin {i + 1}"
          aria-pressed={i === editor.selectedIndex}
          title="Drag to pick another color · right-click to remove"
          style:left={pct(pin.u)}
          style:top={pct(pin.v)}
          style:--color={oklchToHex(pin.color)}
        ></div>
      {/each}
    </div>
  {/if}
  <p class="hint">
    drag a pin to pick a color{editor.canAddColor
      ? ' · click the image to add one'
      : ' · click the image to replace the selected color'}{editor.canRemoveColor
      ? ' · right-click a pin to remove it'
      : ''}{editor.kind === 'grid' ? ' · add colors with more rows or columns' : ''}{editor.kind === 'mesh'
      ? ''
      : ' · where a pin sits changes nothing in the pattern'}
  </p>
</div>

<style>
  .window {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: var(--z-pins);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: rgba(27, 27, 26, 0.94);
    box-shadow:
      0 0 0 1px #494842,
      0 8px 28px rgba(0, 0, 0, 0.55);
    font: 12px var(--font-mono);
    color: #96938b;
  }
  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
    color: #e6e3dc;
    cursor: move;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .title button {
    font: inherit;
    font-size: 16px;
    line-height: 1;
    color: inherit;
    background: none;
    border: 0;
    padding: 0 2px;
    cursor: pointer;
  }
  .net {
    display: flex;
    gap: 14px;
    padding: 0 2px;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .stepper b {
    min-width: 1ch;
    text-align: center;
    font-weight: normal;
    color: #e6e3dc;
  }
  .stepper button {
    font: inherit;
    line-height: 1;
    color: #e6e3dc;
    background: none;
    border: 1px solid #494842;
    padding: 0 5px;
    cursor: pointer;
  }
  .stepper button:disabled {
    color: #6b6963;
    cursor: default;
  }
  .picture {
    position: relative;
    width: var(--max-width);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: crosshair;
    overflow: hidden;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .frame {
    position: absolute;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.55);
    outline: 1px dashed rgba(255, 255, 255, 0.6);
    pointer-events: none;
  }
  .pin {
    position: absolute;
    width: 16px;
    height: 16px;
    transform: translate(-50%, -50%);
    background: var(--color);
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.45),
      0 1px 4px rgba(0, 0, 0, 0.55);
    cursor: grab;
  }
  .dragging .pin {
    cursor: grabbing;
  }
  .pin.selected {
    width: 20px;
    height: 20px;
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.6),
      0 0 0 4px #fff,
      0 1px 6px rgba(0, 0, 0, 0.55);
    z-index: 1;
  }
  .hint {
    /* Wraps to the picture's width instead of widening the window. */
    margin: 0;
    width: 0;
    min-width: 100%;
    padding: 0 2px;
  }
</style>
