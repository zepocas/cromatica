<script lang="ts">
  import Dropdown from '../controls/Dropdown.svelte';
  import { ASPECTS, MAX_DIAGONAL, MIN_DIAGONAL, type Aspect, type MonitorsState } from '../state/monitors.svelte';

  interface Props {
    monitors: MonitorsState;
  }

  let { monitors }: Props = $props();

  const aspects = ASPECTS.map((a) => ({ value: a.value as Aspect }));

  function setDiagonal(id: number, v: number) {
    const inches = Math.min(MAX_DIAGONAL, Math.max(MIN_DIAGONAL, Math.round(Number.isFinite(v) ? v : MIN_DIAGONAL)));
    monitors.change(id, { diagonal: inches });
  }
</script>

<div class="popover panel" role="dialog" aria-label="Monitors" data-testid="monitors-panel">
  <div class="row">
    <span>wallpaper</span>
    <span class="seg" role="group" aria-label="Wallpaper fit">
      <button
        aria-pressed={monitors.fit === 'span'}
        title="Cover all monitors at the image's own proportions, cropped on one side"
        onclick={() => (monitors.fit = 'span')}>span</button
      >
      <button
        aria-pressed={monitors.fit === 'stretch'}
        title="Bend the image to exactly fit all monitors"
        onclick={() => (monitors.fit = 'stretch')}>stretch</button
      >
    </span>
  </div>
  {#each monitors.screens as s (s.id)}
    <div class="row" data-row={s.id}>
      <span class="num">{s.id}</span>
      <Dropdown
        ariaLabel="Monitor {s.id} aspect ratio"
        value={s.aspect}
        options={aspects}
        onchange={(aspect) => monitors.change(s.id, { aspect })}
      />
      <input
        type="number"
        min={MIN_DIAGONAL}
        max={MAX_DIAGONAL}
        aria-label="Monitor {s.id} diagonal in inches"
        value={s.diagonal}
        onchange={(e) => setDiagonal(s.id, e.currentTarget.valueAsNumber)}
      />
      <span class="dim">″</span>
      <button
        class="icon"
        aria-label="Turn monitor {s.id}"
        title={s.portrait ? 'Portrait: turn to landscape' : 'Landscape: turn to portrait'}
        onclick={() => monitors.change(s.id, { portrait: !s.portrait })}>⟳</button
      >
      <button
        class="icon"
        aria-label="Remove monitor {s.id}"
        title="Remove"
        disabled={monitors.screens.length < 2}
        onclick={() => monitors.remove(s.id)}>×</button
      >
    </div>
  {/each}
  <div class="row actions">
    <button class="btn" disabled={!monitors.canAdd} onclick={() => monitors.add()}>add monitor</button>
    <button class="btn" onclick={() => monitors.reset()}>reset</button>
  </div>
  <p class="hint">
    Drag a monitor to move it.
    {monitors.fit === 'span'
      ? 'Shift-drag slides the wallpaper under all of them.'
      : 'Stretch fits the wallpaper to all of them, so there is nothing to slide.'}
    Monitor 1 is the primary screen for the OS context.
  </p>
</div>

<style>
  .popover {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 5;
    box-sizing: border-box;
    width: 340px;
    padding: 8px 10px;
    background: var(--panel);
    border: 1px solid var(--rule);
    white-space: normal;
  }
  .num {
    flex: none;
    width: 2ch;
    color: var(--ink);
  }
  input[type='number'] {
    width: 6ch;
    flex: none;
  }
  .popover :global(.dropdown) {
    flex: 1;
    min-width: 0;
  }
  .actions {
    margin-top: 4px;
  }
  .hint {
    margin: 6px 0 0;
    color: var(--dim);
  }
</style>
