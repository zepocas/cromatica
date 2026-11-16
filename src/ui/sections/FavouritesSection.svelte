<script lang="ts">
  import { oklchToHex } from '../../color/hex';
  import type { Design } from '../../design/design';
  import { FAVOURITES_LIMIT, swatchesOf, type Favourites } from '../state/favourites.svelte';
  import { glow } from '../controls/glow';
  import Section from '../controls/Section.svelte';
  import ShapeIcon from '../controls/ShapeIcon.svelte';
  import { PATTERN_ICONS, WARP_ICONS } from '../controls/shapeIcons';
  import { currentScale } from '../state/ui-scale';

  interface Props {
    favourites: Favourites;
    design: Design;
    onopen: (design: Design) => void;
  }

  let { favourites, design, onopen }: Props = $props();

  const current = $derived(favourites.find(design));
  // Folded to start with: the list opens over the preview, so it is only there when asked for.
  let collapsed = $state(true);

  // The tray comes out of the panel at the title line, so it follows it (the panel scrolls when it is full).
  let anchor: HTMLDivElement;
  let anchorY = $state(0);
  let trayHeight = $state(0);
  let viewHeight = $state(0);
  const BAR = 28;
  const MARGIN = 8;
  const trayTop = $derived(
    Math.max(MARGIN, Math.min(anchorY - trayHeight / 2, viewHeight - BAR - MARGIN - trayHeight)),
  );

  function place() {
    const r = anchor.getBoundingClientRect();
    const k = currentScale();
    anchorY = (r.top + r.height / 2) / k;
    viewHeight = window.innerHeight / k;
  }

  $effect(() => {
    if (collapsed) return;
    place();
    const panel = anchor.closest('aside');
    const observer = new ResizeObserver(place);
    if (panel) observer.observe(panel);
    panel?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      panel?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !collapsed && !e.defaultPrevented) collapsed = true;
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div bind:this={anchor}>
  <Section title="favourites" detached bind:collapsed>
    {#snippet tools()}
      <button
        class="heart"
        aria-label={current ? 'Remove from favourites' : 'Add to favourites'}
        aria-pressed={!!current}
        title={current ? 'Remove from favourites (K)' : 'Keep in favourites (K)'}
        {@attach glow('favourite')}
        onclick={() => favourites.toggle(design)}>{current ? '♥' : '♡'}</button
      >
      <span class="count" title="{favourites.items.length} favourites">{favourites.items.length}</span>
    {/snippet}
  </Section>
</div>
{#if !collapsed}
  <div
    class="tray panel"
    style:top="{trayTop}px"
    bind:clientHeight={trayHeight}
    role="region"
    aria-label="Favourites"
    data-testid="favourites-tray"
  >
    {#if favourites.items.length === 0}
      <p class="hint">♡ keeps the current design here (up to {FAVOURITES_LIMIT})</p>
    {:else}
      <ul>
        {#each favourites.items as fav, i (fav.id)}
          <li class:current={fav === current}>
            <button
              class="pick"
              aria-label="Open favourite {i + 1}"
              aria-current={fav === current}
              title="Open this {fav.design.base.kind} design"
              onclick={() => onopen(fav.design)}
            >
              <span class="marks">
                <ShapeIcon body={PATTERN_ICONS[fav.design.base.kind] ?? ''} />
                {#if fav.design.warp.shape !== 'none'}
                  <ShapeIcon body={WARP_ICONS[fav.design.warp.shape]} />
                {/if}
              </span>
              {#each swatchesOf(fav.design) as color, j (j)}
                <span class="swatch" style:background={oklchToHex(color)}></span>
              {/each}
            </button>
            <button
              class="remove"
              aria-label="Remove favourite {i + 1}"
              title="Remove from favourites"
              onclick={() => favourites.remove(fav.id)}>×</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
{#if favourites.notice}
  <p class="hint" role="status">{favourites.notice}</p>
{/if}

<style>
  .count {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .heart {
    width: 26px;
    height: 24px;
    /* Room above and below, so a folded section doesn't sit on the footer's rule. */
    margin: 5px 0;
    padding: 0;
    border: 1px solid var(--rule);
    color: var(--ink);
    font-size: 16px;
    line-height: 1;
  }
  .heart:hover:not(:disabled) {
    border-color: var(--ink);
  }
  .heart[aria-pressed='true'] {
    border-color: oklch(0.68 0.2 22);
    color: oklch(0.68 0.2 22);
  }
  /* Over the preview, so it never takes panel height. */
  .tray {
    position: fixed;
    left: var(--sidebar);
    z-index: var(--z-tray);
    box-sizing: border-box;
    max-width: min(640px, calc(100vw / var(--ui-scale) - var(--sidebar) - var(--gap-page)));
    max-height: calc(50vh / var(--ui-scale));
    overflow-y: auto;
    padding: 10px;
    background: var(--panel-float);
    border: 1px solid var(--ink);
    border-left: 0;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  ul {
    margin: 0;
    padding: 2px;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  li {
    position: relative;
  }
  .pick {
    display: flex;
    flex-direction: column;
    width: 30px;
    height: 106px;
    padding: 0;
    outline: 1px solid var(--rule);
  }
  .swatch {
    flex: 1;
  }
  /* Room for both icons even with no warp, so every strip starts at the same height. */
  .marks {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    padding-bottom: 5px;
    height: 42px;
    color: var(--ink);
  }
  .current .pick {
    outline: 2px solid var(--ink);
  }
  .remove {
    position: absolute;
    top: 0;
    right: 0;
    padding: 0 3px;
    line-height: 1.2;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    opacity: 0;
  }
  li:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .hint {
    margin: 0;
    color: var(--dim);
  }
</style>
