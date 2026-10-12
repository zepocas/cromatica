<script lang="ts">
  import { oklchToHex } from '../color/hex';
  import type { EditorState } from './editor.svelte';
  import { isFormControl } from './keys';

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

  const source = $derived(editor.source);
  const pins = $derived(editor.pins);
  /** On the mesh, the part of the image the frame shows (the rest is dimmed); pins stay inside it. */
  const area = $derived(editor.pinArea);
  const cropped = $derived(editor.kind === 'mesh');
  const url = $derived(source ? URL.createObjectURL(source.file) : '');
  $effect(() => () => URL.revokeObjectURL(url));

  const pct = (t: number) => `${t * 100}%`;

  /** Image position under the pointer, held to the part the frame shows. */
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

  /** On a pin: pick it up. On the bare image: put a new pin there and carry on dragging it. */
  function onPicturePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-pin]');
    if (hit) return startDrag(e, Number(hit.dataset.pin));
    const i = editor.addPin(...imageAt(e));
    if (i !== null) startDrag(e, i);
  }

  function onPicturePointerMove(e: PointerEvent) {
    if (drag && e.pointerId === drag.pointerId) editor.movePin(drag.index, ...imageAt(e));
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
    if (e.metaKey || e.ctrlKey || e.altKey || isFormControl(e.target)) return;
    if (e.key === 'Escape') {
      editor.pinning = false;
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && (editor.kind !== 'mesh' || !editor.showHandles)) {
      // With the handles showing, the mesh overlay deletes the selected point.
      editor.removePin(editor.selectedIndex);
    } else {
      return;
    }
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
    <button aria-label="Done picking" title="Close (Esc)" onclick={() => (editor.pinning = false)}>×</button>
  </div>
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
          title="Drag to pick another color"
          style:left={pct(pin.u)}
          style:top={pct(pin.v)}
          style:--color={oklchToHex(pin.color)}
        ></div>
      {/each}
    </div>
  {/if}
  <p class="hint">
    drag a pin to pick a color{editor.canAddColor ? ' · click the image to add one' : ''}{editor.canRemoveColor
      ? ' · Delete removes'
      : ''}{editor.kind === 'mesh' ? '' : ' · where a pin sits changes nothing in the pattern'}
  </p>
</div>

<style>
  .window {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    background: rgba(27, 27, 26, 0.94);
    box-shadow:
      0 0 0 1px #494842,
      0 8px 28px rgba(0, 0, 0, 0.55);
    font:
      12px ui-monospace,
      'SF Mono',
      Menlo,
      Consolas,
      monospace;
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
  /* The part of the image inside the frame; everything around it is dimmed. */
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
