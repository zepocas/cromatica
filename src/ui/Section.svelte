<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Glyph buttons on the section rule, before "more". */
    tools?: Snippet;
    /** Less-used controls, hidden until "more" is opened. */
    more?: Snippet;
    children: Snippet;
  }

  let { title, tools, more, children }: Props = $props();

  let open = $state(false);
</script>

<section>
  <div class="rule">
    <span class="title">{title}</span>
    <span class="line" aria-hidden="true"></span>
    {#if tools}{@render tools()}{/if}
    {#if more}
      <button
        class="more"
        aria-expanded={open}
        aria-label="More {title} settings"
        title={open ? 'Fewer settings' : 'More settings'}
        onclick={() => (open = !open)}>{open ? '−' : '+'} more</button
      >
    {/if}
  </div>
  <div class="body">
    {@render children()}
    {#if more && open}
      <div class="advanced">{@render more()}</div>
    {/if}
  </div>
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
  }
  .line {
    flex: 1;
    border-top: 1px solid var(--rule);
  }
  .more {
    color: var(--dim);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0 10px;
  }
  .advanced {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 10px;
    border-left: 1px dashed var(--rule);
  }
</style>
