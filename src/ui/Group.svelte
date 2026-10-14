<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Folded to its title line; bindable. */
    collapsed?: boolean;
    /** The button's accessible name, when "Expand x" and "Collapse x" are not it. */
    ariaLabel?: string;
    children: Snippet;
  }

  let { title, collapsed = $bindable(false), ariaLabel, children }: Props = $props();

  const verb = $derived(collapsed ? 'Expand' : 'Collapse');
</script>

<!-- A titled box inside a section: indented from the section's own header, which it echoes (arrow, title, line). -->
<div class="group" class:folded={collapsed}>
  <div class="head">
    <button
      class="title"
      aria-expanded={!collapsed}
      aria-label={ariaLabel ?? `${verb} ${title}`}
      title={verb}
      onclick={() => (collapsed = !collapsed)}
    >
      <span class="arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>{title}</button
    >
    <button class="line" aria-hidden="true" tabindex="-1" title={verb} onclick={() => (collapsed = !collapsed)}
    ></button>
  </div>
  {#if !collapsed}
    <div class="box">{@render children()}</div>
  {/if}
</div>

<style>
  .group {
    min-width: 0;
    /* The indent: the title starts further in than the section's own. */
    margin: 2px 0 0 12px;
  }
  .head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 20px;
  }
  /* Opaque, so it also hides where the box's left side would start. */
  .title {
    color: var(--dim);
    cursor: pointer;
    background: var(--panel);
    padding: 0 2px 0 0;
  }
  /* A fixed width: ▸ and ▾ differ in width, and the title would shift as it folds. */
  .arrow {
    display: inline-block;
    width: 1.1em;
    text-align: center;
    margin-right: 0.4ch;
    font-size: 15px;
    line-height: 1;
    vertical-align: -2px;
  }
  .line {
    flex: 1;
    align-self: stretch;
    padding: 0;
    border: 0;
    cursor: pointer;
    background: linear-gradient(var(--rule), var(--rule)) center / 100% 1px no-repeat;
  }
  .head:has(.title:hover) .line,
  .line:hover {
    background-image: linear-gradient(var(--ink), var(--ink));
  }
  .head:has(.line:hover) .title,
  .title:hover {
    color: var(--ink);
  }
  /* Starts level with the line, which is its top edge. */
  .box {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: -10px;
    padding: 14px 8px 6px;
    border: 1px solid var(--rule);
    border-top: 0;
  }
</style>
