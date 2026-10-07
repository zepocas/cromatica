<script lang="ts">
  import { oklchToHex } from '../color/hex';
  import type { Design } from '../design/design';
  import { FAVOURITES_LIMIT, swatchesOf, type Favourites } from './favourites.svelte';
  import Section from './Section.svelte';

  interface Props {
    favourites: Favourites;
    /** The design on screen, kept by the heart. */
    design: Design;
    onopen: (design: Design) => void;
  }

  let { favourites, design, onopen }: Props = $props();

  const current = $derived(favourites.find(design));
  // Folded while there is nothing in it; adding a favourite opens it, removing never closes it.
  let collapsed = $state(true);
  let seen: number | undefined;
  $effect(() => {
    const count = favourites.items.length;
    if (seen === undefined) collapsed = count === 0;
    else if (count > seen) collapsed = false;
    seen = count;
  });
</script>

<Section title="favourites" bind:collapsed>
  {#snippet tools()}
    <span class="count" title="{favourites.items.length} favourites">{favourites.items.length}</span>
    <button
      class="heart"
      aria-label={current ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={!!current}
      title={current ? 'Remove from favourites' : 'Keep in favourites'}
      onclick={() => (current ? favourites.remove(current.id) : favourites.add(design))}>{current ? '♥' : '♡'}</button
    >
  {/snippet}

  {#if favourites.items.length === 0}
    <p class="hint">♡ keeps the current design here (up to {FAVOURITES_LIMIT})</p>
  {:else}
    <!-- Each palette is a column, first color on top; the columns share the width. -->
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
            {#each swatchesOf(fav.design) as color, j (j)}
              <span style:background={oklchToHex(color)}></span>
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
  {#if favourites.notice}
    <p class="hint" role="status">{favourites.notice}</p>
  {/if}
</Section>

<style>
  .count {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  /* The one big, bordered control: easy to find, red when kept. */
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
  /* The one splash of color in the panel, so a kept design stands out. */
  .heart[aria-pressed='true'] {
    border-color: oklch(0.68 0.2 22);
    color: oklch(0.68 0.2 22);
  }
  ul {
    margin: 0;
    padding: 2px;
    list-style: none;
    display: grid;
    /* As many columns as fit, sharing the width, so the right edge adapts. */
    grid-template-columns: repeat(auto-fill, minmax(16px, 1fr));
    gap: 6px;
  }
  li {
    position: relative;
  }
  .pick {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 56px;
    padding: 0;
    outline: 1px solid var(--rule);
  }
  .pick > span {
    flex: 1;
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
