<script lang="ts">
  interface Props {
    /** Row label, lowercase; also the pad's accessible name, capitalized. */
    label: string;
    /** Position in [-range, range]; +y is up. A value past the range sits on the pad's edge. */
    x: number;
    y: number;
    range: number;
    /** Arrow key step; Shift takes a tenth of it. */
    step: number;
    onchange: (x: number, y: number) => void;
    title?: string;
  }

  let { label, x, y, range, step, onchange, title }: Props = $props();

  /** Shift slows a drag down this much more, for fine placement. */
  const FINE = 0.1;
  /**
   * Heaviness: a drag moves the dot by the pointer times a gain that grows with the pointer's speed, so a slow
   * hand places it finely and a flick still crosses the pad. At rest the gain is GAIN_MIN; it approaches 1 as
   * the speed passes SPEED_REF (px per ms).
   */
  const GAIN_MIN = 0.2;
  const SPEED_REF = 0.8;
  /** The speed is smoothed over a few moves so one jittery event does not jump the gain. */
  const SPEED_SMOOTH = 0.6;
  /** A press this close to the dot (screen px) grabs it; elsewhere it jumps to the pointer first. */
  const GRAB_PX = 14;

  let pad: HTMLButtonElement;
  let drag: { pointerId: number; x: number; y: number; t: number; speed: number } | null = null;
  let dragging = $state(false);

  const clamp = (v: number) => Math.min(range, Math.max(-range, v));
  const pct = (v: number) => `${((clamp(v) / range + 1) * 50).toFixed(3)}%`;
  const signed = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = pad.getBoundingClientRect();
    const dot = [r.left + ((clamp(x) / range + 1) / 2) * r.width, r.top + ((1 - clamp(y) / range) / 2) * r.height];
    if (Math.hypot(e.clientX - dot[0], e.clientY - dot[1]) > GRAB_PX) {
      onchange(
        clamp(((e.clientX - r.left) / r.width) * 2 * range - range),
        clamp(range - ((e.clientY - r.top) / r.height) * 2 * range),
      );
    }
    drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, speed: 0 };
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    pad.focus();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    // Screen px per ms; a floor on the interval keeps two events in the same frame from reading as a flick.
    const now = Math.hypot(dx, dy) / Math.max(e.timeStamp - drag.t, 4);
    drag.speed = drag.speed * SPEED_SMOOTH + now * (1 - SPEED_SMOOTH);
    const gain = GAIN_MIN + (1 - GAIN_MIN) * (1 - Math.exp(-drag.speed / SPEED_REF));
    const k = (e.shiftKey ? FINE : 1) * gain * 2 * range;
    // Ratios of screen values, so the page's UI scale needs no correction (D111).
    onchange(clamp(x + (dx / r.width) * k), clamp(y - (dy / r.height) * k));
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = e.timeStamp;
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    dragging = false;
    if (pad.hasPointerCapture(e.pointerId)) pad.releasePointerCapture(e.pointerId);
  }

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Home' || e.key === '0') {
      e.preventDefault();
      e.stopPropagation();
      onchange(0, 0);
      return;
    }
    const dir = ARROWS[e.key];
    if (!dir) return;
    // The arrows also step through shuffles and nudge handles; here they belong to the pad.
    e.preventDefault();
    e.stopPropagation();
    const s = e.shiftKey ? step * FINE : step;
    onchange(clamp(x + dir[0] * s), clamp(y + dir[1] * s));
  }
</script>

<div class="row xy">
  <span>{label}</span>
  <!-- A button, so it is focusable and announced; it has no click of its own, the pointer and the arrows drive it. -->
  <button
    type="button"
    class="pad"
    class:dragging
    bind:this={pad}
    aria-label="{label[0].toUpperCase() + label.slice(1)}, x {signed(x)}, y {signed(y)}"
    {title}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    ondblclick={() => onchange(0, 0)}
    onkeydown={onKeyDown}
  >
    <span class="axis h"></span>
    <span class="axis v"></span>
    <span class="origin"></span>
    <span class="dot" style:left={pct(x)} style:top={pct(-y)}></span>
  </button>
  <div class="read">
    <output>x {signed(x)}</output>
    <output>y {signed(y)}</output>
    <button class="btn" aria-label="Centre the image" disabled={x === 0 && y === 0} onclick={() => onchange(0, 0)}
      >centre</button
    >
  </div>
</div>

<style>
  .xy {
    align-items: flex-start;
  }
  .pad,
  :global(.panel) .pad {
    position: relative;
    padding: 0;
    flex: none;
    width: 96px;
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 1px solid var(--rule);
    background-color: var(--panel-raised);
    /* An 8 × 8 dot grid, like a plotting pad: the eye finds the middle and the distance from it. */
    background-image: radial-gradient(circle, var(--rule) 1px, transparent 1.4px);
    background-size: 12.5% 12.5%;
    background-position: 6.25% 6.25%;
    touch-action: none;
    cursor: crosshair;
    outline: none;
  }
  .pad:focus-visible {
    border-color: var(--dim);
  }
  .pad.dragging {
    cursor: grabbing;
  }
  /* The cross through the middle, with a dot where the image is centred. */
  .axis {
    position: absolute;
    background: var(--rule);
    pointer-events: none;
  }
  .axis.h {
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
  }
  .axis.v {
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
  }
  .origin {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: var(--dim);
    pointer-events: none;
  }
  .dot {
    position: absolute;
    width: 12px;
    height: 12px;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    border: 2px solid var(--ink);
    border-radius: 50%;
    background: var(--panel);
    pointer-events: none;
  }
  .read {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }
  .read output {
    min-width: 0;
    text-align: left;
    white-space: nowrap;
  }
</style>
