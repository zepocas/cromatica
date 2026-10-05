<script lang="ts">
  import { oklchToHex } from '../color/hex';
  import type { Design } from '../design/design';
  import { FAVOURITES_LIMIT, swatchesOf, type Favourite, type Favourites } from './favourites.svelte';
  import Section from './Section.svelte';

  interface Props {
    favourites: Favourites;
    current: Favourite | undefined;
    onopen: (design: Design) => void;
  }

  let { favourites, current, onopen }: Props = $props();
</script>

<Section title="favourites">
  {#if favourites.items.length === 0}
    <p class="hint">♡ keeps the current design here (up to {FAVOURITES_LIMIT})</p>
  {:else}
    <ul>
      {#each favourites.items as fav, i (fav.id)}
        <li class:current={fav === current}>
          <button
            class="open"
            aria-label="Open favourite {i + 1}"
            aria-current={fav === current}
            title="Open this design"
            onclick={() => onopen(fav.design)}
          >
            <span class="strip" aria-hidden="true">
              {#each swatchesOf(fav.design) as color, j (j)}
                <span style:background={oklchToHex(color)}></span>
              {/each}
            </span>
            <span class="kind">{fav.design.base.kind}</span>
          </button>
          <button
            class="icon"
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
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    text-align: left;
  }
  .strip {
    flex: 1;
    display: flex;
    height: 12px;
    outline: 1px solid var(--rule);
  }
  .strip > span {
    flex: 1;
  }
  .current .strip {
    outline-color: var(--ink);
  }
  .kind {
    width: 6ch;
    color: var(--dim);
  }
  .current .kind {
    color: var(--ink);
  }
  .hint {
    margin: 0;
    color: var(--dim);
  }
</style>
