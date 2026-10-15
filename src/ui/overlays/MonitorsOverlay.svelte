<script lang="ts">
  import type { ContextScreen } from '../../context/zones';
  import type { Design } from '../../design/design';
  import ContextOverlay from './ContextOverlay.svelte';
  import { type Size } from '../state/monitor-layout';
  import { onWallpaper, slid, type WallpaperRect } from '../state/monitor-view';
  import type { MonitorsState, Screen } from '../state/monitors.svelte';

  interface Props {
    monitors: MonitorsState;
    /** The wallpaper's size in pixels; the overlay box is exactly the displayed canvas rect. */
    wallpaper: Size;
    design: Design;
    /** The OS drawn inside the monitors: all of it on the primary, a secondary's share on the rest. */
    context: ContextScreen | null;
  }

  let { monitors, wallpaper, design, context }: Props = $props();

  /** A pointer this close to a neighbour's start, middle or end snaps to it. */
  const SNAP_SCREEN_PX = 20;
  /** An arrow key moves a monitor or the wallpaper by this share of the wallpaper's width. */
  const KEY_STEP = 0.01;

  let box: HTMLDivElement;
  let drag: {
    id: number;
    pointerId: number;
    scrub: boolean;
    u0: number;
    v0: number;
    rect: WallpaperRect;
    start: Screen[];
    x0: number;
    y0: number;
  } | null = null;
  let dragging = $state<number | null>(null);

  const rect = $derived(monitors.rect(wallpaper));
  const placed = $derived(monitors.screens.map((s) => ({ s, f: onWallpaper(s, rect) })));
  const wallpaperAspect = $derived(wallpaper.w / wallpaper.h);

  /** The pointer as fractions of the wallpaper. */
  function fractions(e: MouseEvent): [number, number] {
    const r = box.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  /** Scrubbing slides the wallpaper under the block; stretch has nothing to slide. */
  const canScrub = $derived(monitors.fit === 'span');

  function move(d: NonNullable<typeof drag>, du: number, dv: number, scrub: boolean, snap: number) {
    const dx = du * d.rect.w;
    const dy = dv * d.rect.h;
    if (scrub) {
      if (canScrub) monitors.placement = slid(d.start, d.rect, dx, dy);
    } else {
      monitors.screens = d.start;
      // In span the image is the edge of the world: a monitor can't be dragged off it (stretch is the block itself).
      monitors.place(d.id, d.x0 + dx, d.y0 + dy, snap, canScrub ? d.rect : undefined);
    }
  }

  const begin = (s: Screen, pointerId: number, scrub: boolean, u0: number, v0: number) => ({
    id: s.id,
    pointerId,
    scrub,
    u0,
    v0,
    rect,
    start: monitors.screens,
    x0: s.x,
    y0: s.y,
  });

  function onPointerDown(e: PointerEvent, s: Screen) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const [u0, v0] = fractions(e);
    drag = begin(s, e.pointerId, e.shiftKey, u0, v0);
    pin();
    dragging = s.id;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const [u, v] = fractions(e);
    const snap = (SNAP_SCREEN_PX / box.getBoundingClientRect().width) * drag.rect.w;
    move(drag, u - drag.u0, v - drag.v0, drag.scrub, snap);
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    dragging = null;
    monitors.settle(wallpaper);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  /** From here on the wallpaper keeps its place when monitors move (span only; stretch follows the block). */
  function pin() {
    if (canScrub) monitors.placement = rect;
  }

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  function onKeyDown(e: KeyboardEvent, s: Screen) {
    const dir = ARROWS[e.key];
    if (!dir || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const d = begin(s, 0, e.shiftKey, 0, 0);
    pin();
    move(d, dir[0] * KEY_STEP, dir[1] * KEY_STEP, e.shiftKey, 0);
    monitors.settle(wallpaper);
  }

  /** What a monitor draws of the OS: the primary all of it, the others a secondary's share (nothing for phones). */
  const contextFor = (s: Screen): ContextScreen | null => {
    if (!context) return null;
    const zones = monitors.isPrimary(s.id)
      ? context.zones
      : context.zones.filter((z) => context.secondary?.includes(z.label));
    if (!zones.length) return null;
    // Turned to portrait, the OS keeps its size and the screen's short side is the one it was measured on.
    const height = s.w < s.h ? context.height * (s.h / s.w) : context.height;
    return { ...context, zones, height };
  };

  const dim = $derived('M-9 -9h19v19h-19Z' + placed.map(({ f }) => `M${f.x} ${f.y}h${f.w}v${f.h}h${-f.w}Z`).join(''));
  const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
</script>

<div bind:this={box} class="monitors" data-testid="monitors-overlay" role="group" aria-label="Monitor layout">
  <svg class="dim" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
    <path d={dim} fill-rule="evenodd" />
  </svg>
  {#each placed as { s, f } (s.id)}
    {@const shown = contextFor(s)}
    <div
      class="monitor"
      class:dragging={dragging === s.id}
      data-monitor={s.id}
      data-x={s.x}
      data-y={s.y}
      data-w={s.w}
      data-h={s.h}
      role="button"
      tabindex="0"
      aria-label="Monitor {s.id}, {s.diagonal} inch {s.aspect}"
      style:left={pct(f.x)}
      style:top={pct(f.y)}
      style:width={pct(f.w)}
      style:height={pct(f.h)}
      onpointerdown={(e) => onPointerDown(e, s)}
      onpointermove={onPointerMove}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onkeydown={(e) => onKeyDown(e, s)}
    >
      {#if shown}
        <ContextOverlay {design} screen={shown} region={f} {wallpaperAspect} aspect={s.w / s.h} />
      {/if}
      <span class="label"
        ><b>{s.id}</b>
        {s.diagonal}″ {s.portrait ? 'portrait' : s.aspect}</span
      >
    </div>
  {/each}
</div>

<style>
  .monitors {
    position: absolute;
    inset: 0;
    /* Only the monitors take the pointer; everything else falls through to pan and zoom. */
    pointer-events: none;
    overflow: hidden;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  }
  .dim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    fill: rgb(0 0 0 / 0.55);
  }
  .monitor {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid #e6e3dc;
    pointer-events: all;
    cursor: grab;
    outline: none;
    container-type: size;
  }
  .monitor.dragging {
    cursor: grabbing;
  }
  .monitor:focus-visible,
  .monitor.dragging {
    border-width: 4px;
  }
  .label {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 0.1em 0.5em;
    white-space: nowrap;
    font-size: clamp(9px, 4cqmin, 22px);
    color: #e6e3dc;
    background: rgb(0 0 0 / 0.55);
    pointer-events: none;
    user-select: none;
  }
</style>
