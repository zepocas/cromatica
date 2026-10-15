<script lang="ts">
  import type { Snippet } from 'svelte';
  import Group from './Group.svelte';

  interface Props {
    title: string;
    /** Glyph buttons on the section rule, before "more". */
    tools?: Snippet;
    /** Less-used controls, hidden until "advanced" at the end of the section is opened. */
    more?: Snippet;
    children?: Snippet;
    /** The body is drawn elsewhere (the parent reads `collapsed`): only the title line stays here. */
    detached?: boolean;
    /** Folded to its title line; bindable so a parent can open it. */
    collapsed?: boolean;
  }

  let { title, tools, more, children, detached = false, collapsed = $bindable(false) }: Props = $props();

  let advancedFolded = $state(true);
</script>

<section class:detached class:open={detached && !collapsed}>
  <div class="rule">
    <button
      class="title"
      aria-expanded={!collapsed}
      aria-label="{collapsed ? 'Expand' : 'Collapse'} {title}"
      title={collapsed ? 'Expand' : 'Collapse'}
      onclick={() => (collapsed = !collapsed)}
    >
      {#if !detached}<span class="arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>{/if}{title}</button
    >
    <!-- The list of a detached section opens outside the panel: the heart follows the title, and the arrow at the end points where it goes. -->
    {#if detached && tools}{@render tools()}{/if}
    <button
      class="line"
      aria-hidden="true"
      tabindex="-1"
      title={collapsed ? 'Expand' : 'Collapse'}
      onclick={() => (collapsed = !collapsed)}
    ></button>
    {#if detached}
      <button
        class="flap arrow"
        aria-hidden="true"
        tabindex="-1"
        title={collapsed ? 'Expand' : 'Collapse'}
        onclick={() => (collapsed = !collapsed)}>{collapsed ? '▸' : '◂'}</button
      >
    {:else if tools}
      {@render tools()}
    {/if}
  </div>
  {#if !collapsed && !detached}
    <div class="body">
      {@render children?.()}
      {#if more}
        <Group title="advanced" ariaLabel="Advanced {title} settings" bind:collapsed={advancedFolded}>
          {@render more()}
        </Group>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Lines run into the panel's frame, so the joints read as ├─ title ───┤. */
  .rule {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 calc(-1 * var(--pad));
  }
  .rule::before,
  .rule::after {
    content: '';
    width: 8px;
    border-top: 1px solid var(--rule);
  }
  .title {
    color: var(--ink);
    cursor: pointer;
  }
  .arrow {
    display: inline-block;
    font-size: 17px;
    line-height: 1;
    vertical-align: -2px;
  }
  .title .arrow {
    /* A fixed width: ▸ and ▾ differ in width, and the title would shift as it folds. */
    width: 1.1em;
    text-align: center;
    margin-right: 0.4ch;
  }
  .flap {
    font-size: 24px;
    padding: 0 2px 0 4px;
    color: var(--dim);
    cursor: pointer;
  }
  .line {
    flex: 1;
    align-self: stretch;
    padding: 0;
    cursor: pointer;
    border: 0;
    background: linear-gradient(var(--rule), var(--rule)) center / 100% 1px no-repeat;
  }
  /* Pointing at the title or the line lights the line up, and an open detached section keeps it lit. */
  .rule:has(.title:hover) .line,
  .line:hover,
  .open .line {
    background-image: linear-gradient(var(--ink), var(--ink));
  }
  .rule:has(.title:hover, .line:hover, .flap:hover) .flap,
  .open .flap {
    color: var(--ink);
  }
  /* The flap takes the place of the right-hand joint, which open would only point back at the panel. */
  .detached .rule::after {
    display: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0 10px;
  }
</style>
