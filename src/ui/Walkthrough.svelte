<script lang="ts">
  import type { Walkthrough } from './state/walkthrough.svelte';

  interface Props {
    walkthrough: Walkthrough;
  }

  let { walkthrough }: Props = $props();
  const step = $derived(walkthrough.step);

  // Dragged away from what it covers; the offset stays across steps.
  let dx = $state(0);
  let dy = $state(0);
  let drag: { x: number; y: number } | null = null;

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    drag = { x: e.clientX - dx, y: e.clientY - dy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!drag) return;
    dx = e.clientX - drag.x;
    dy = e.clientY - drag.y;
  }
  function onUp() {
    drag = null;
  }
</script>

{#if step}
  <aside
    class="panel walkthrough"
    aria-label="Walkthrough"
    aria-live="polite"
    style:translate="{dx}px {dy}px"
    title="Drag to move"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
  >
    <h2>{walkthrough.index + 1}/{walkthrough.total} {step.title}</h2>
    <p>{step.text}</p>
    <p class="press">
      {step.verb ?? 'press'} <kbd>{step.keys}</kbd>
      {#if step.need}<span class="count">{walkthrough.progress}/{step.need}</span>{/if}
      <span class="leave">· esc leaves</span>
    </p>
  </aside>
{/if}

<style>
  /* Light on the dark panel and high up, so it is the first thing the eye lands on. */
  .walkthrough {
    position: fixed;
    top: 6vh;
    right: 8vw;
    z-index: var(--z-card);
    width: 440px;
    max-width: calc(100vw - 48px);
    box-sizing: border-box;
    padding: 12px 16px 14px;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--panel);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  h2 {
    margin: 0 0 6px;
    font: inherit;
    font-weight: 600;
  }
  h2::before {
    content: '~/';
    opacity: 0.55;
  }
  p {
    margin: 0;
  }
  .press {
    margin-top: 8px;
    padding: 3px 6px;
    margin-left: -6px;
    outline: 2px solid var(--panel);
  }
  /* The key to press drains of its fill and back, like the shuffle nudge: a color change, so it stays with reduced motion on. */
  kbd {
    font: inherit;
    padding: 0 6px;
    border: 1px solid var(--panel);
    background: var(--panel);
    color: var(--ink);
    animation: pulse 1.6s ease-out infinite;
  }
  @keyframes pulse {
    50% {
      background: transparent;
      color: var(--panel);
    }
  }
  .count {
    margin-left: 4px;
  }
  .leave {
    opacity: 0.55;
  }
</style>
