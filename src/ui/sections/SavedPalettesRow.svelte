<script lang="ts">
  import { oklchToHex } from '../../color/hex';
  import type { Oklch } from '../../color/types';
  import type { EditorState } from '../state/editor.svelte';
  import { SAVED_PALETTES_LIMIT, type SavedPalette, type SavedPalettes } from '../state/saved-palettes.svelte';
  import { currentScale } from '../state/ui-scale';

  interface Props {
    editor: EditorState;
    saved: SavedPalettes;
  }

  let { editor, saved }: Props = $props();

  const current = $derived(saved.find(editor.paletteColors));

  // Pixel sizes from the styles below: chip, gap, the strip's padding, and the narrow › when the row overflows.
  const CHIP = 32;
  const GAP = 5;
  const PAD = 4;
  const MORE = 12;
  let stripWidth = $state(0);
  const overflows = $derived(saved.items.length * (CHIP + GAP) - GAP + PAD > stripWidth);
  const shown = $derived(
    overflows ? saved.items.slice(0, Math.max(1, Math.floor((stripWidth - PAD - MORE) / (CHIP + GAP)))) : saved.items,
  );
  // The tray continues the row: only the palettes it had no room for.
  const hidden = $derived(saved.items.slice(shown.length));

  let open = $state(false);
  $effect(() => {
    if (!overflows) open = false;
  });

  // The tray opens from the › itself, so it follows it when the panel scrolls.
  let row: HTMLDivElement;
  let moreButton = $state<HTMLButtonElement>();
  let trayHeight = $state(0);
  let anchor = $state({ x: 0, y: 0 });
  const trayTop = $derived(anchor.y - trayHeight / 2);

  function place() {
    if (!moreButton) return;
    const r = moreButton.getBoundingClientRect();
    const k = currentScale();
    anchor = { x: (r.right + 4) / k, y: (r.top + r.height / 2) / k };
  }

  $effect(() => {
    if (!open) return;
    place();
    const panel = row.closest('aside');
    panel?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      panel?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  });

  // A grid repeats its colors over the nodes; the chip shows each once.
  const chipColors = (colors: Oklch[]) => [...new Set(colors.map(oklchToHex))];

  function preview(colors: Oklch[] | null) {
    editor.previewChange(colors ? (t) => t.applyPalette(colors) : null);
  }

  function pick(colors: Oklch[]) {
    preview(null);
    editor.applyPalette(colors);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open && !e.defaultPrevented) open = false;
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#snippet chip(item: SavedPalette)}
  <li>
    <button
      class="chip"
      class:current={item === current}
      aria-label="Use saved palette {saved.items.indexOf(item) + 1}"
      title="Use these colors (keeps the layout)"
      onpointerenter={() => preview(item.colors)}
      onfocus={() => preview(item.colors)}
      onblur={() => preview(null)}
      onclick={() => pick(item.colors)}
    >
      {#each chipColors(item.colors) as hex, j (j)}
        <span style:background={hex}></span>
      {/each}
    </button>
    <button
      class="remove"
      aria-label="Remove saved palette {saved.items.indexOf(item) + 1}"
      title="Remove from saved palettes"
      onclick={() => {
        preview(null);
        saved.remove(item.id);
      }}>×</button
    >
  </li>
{/snippet}

<div class="row saved" bind:this={row}>
  <button
    class="heart"
    aria-label={current ? 'Remove these colors from saved palettes' : 'Save these colors'}
    aria-pressed={!!current}
    title={current ? 'Remove from saved palettes' : `Save these colors (up to ${SAVED_PALETTES_LIMIT})`}
    onclick={() => saved.toggle(editor.paletteColors)}>{current ? '♥' : '♡'}</button
  >
  <div class="fit" bind:clientWidth={stripWidth}>
    {#if saved.items.length === 0}
      <span class="hint">save these colors</span>
    {:else}
      <ul class="strip" aria-label="Saved palettes" onpointerleave={() => preview(null)}>
        {#each shown as item (item.id)}
          {@render chip(item)}
        {/each}
        {#if overflows}
          <li>
            <button
              bind:this={moreButton}
              class="more"
              aria-expanded={open}
              aria-label={open ? 'Close saved palettes' : 'More saved palettes'}
              title={open ? 'Close' : `${hidden.length} more saved palettes`}
              onclick={() => (open = !open)}>{open ? '‹' : '›'}</button
            >
          </li>
        {/if}
      </ul>
    {/if}
  </div>
</div>
{#if open}
  <div
    class="tray panel"
    style:left="{anchor.x}px"
    style:top="{trayTop}px"
    bind:clientHeight={trayHeight}
    role="region"
    aria-label="More saved palettes"
  >
    <ul class="strip wrap" onpointerleave={() => preview(null)}>
      {#each hidden as item (item.id)}
        {@render chip(item)}
      {/each}
    </ul>
  </div>
{/if}
{#if saved.notice}
  <p class="hint" role="status">{saved.notice}</p>
{/if}

<style>
  .saved {
    gap: 6px;
  }
  /* Heart, chips and › share one height and one centre line. */
  .heart,
  .chip,
  .more {
    height: 16px;
    padding: 0;
  }
  .heart,
  .more {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .heart {
    flex: none;
    width: 22px;
    border: 1px solid var(--rule);
    color: var(--ink);
    font-size: 13px;
    line-height: 1;
  }
  .heart:hover {
    border-color: var(--ink);
  }
  .heart[aria-pressed='true'] {
    border-color: oklch(0.68 0.2 22);
    color: oklch(0.68 0.2 22);
  }
  .fit {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .strip li {
    position: relative;
    display: flex;
  }
  .remove {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    padding: 0 3px;
    font-size: 11px;
    line-height: 1;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    opacity: 0;
  }
  li:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    padding: 2px;
    list-style: none;
    overflow: hidden;
  }
  .strip.wrap {
    flex-wrap: wrap;
  }
  .chip {
    display: flex;
    width: 32px;
    outline: 1px solid var(--rule);
  }
  .chip > span {
    flex: 1;
  }
  .chip:hover,
  .chip:focus-visible {
    outline-color: var(--dim);
  }
  .chip.current {
    outline: 2px solid var(--ink);
  }
  .more {
    width: 12px;
    color: var(--dim);
    line-height: 1;
  }
  .more:hover,
  .more[aria-expanded='true'] {
    color: var(--ink);
  }
  /* Floats over the preview, so it never takes panel height. */
  .tray {
    position: fixed;
    z-index: var(--z-tray);
    box-sizing: border-box;
    max-width: min(420px, calc(100vw / var(--ui-scale) - var(--sidebar) - var(--gap-page)));
    padding: 6px;
    background: var(--panel-float);
    border: 1px solid var(--ink);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .hint {
    margin: 0;
    color: var(--dim);
  }
</style>
