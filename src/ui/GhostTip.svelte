<script lang="ts">
  interface Props {
    /** [gesture, what it does], shown as a breadcrumb: the gesture lit, the rest dim. */
    tips: [keys: string, text: string][];
  }

  let { tips }: Props = $props();
</script>

<!-- Not a control: it never takes the pointer, so it can sit over the wallpaper. -->
<p class="panel ghost" role="note">
  {#each tips as [keys, text], i (keys)}
    {#if i > 0}<span class="sep">·</span>{/if}<kbd>{keys}</kbd>
    {text}
  {/each}
</p>

<style>
  .ghost {
    position: fixed;
    right: calc(var(--gap-page) + 4px);
    bottom: calc(var(--gap-page) + var(--statusbar) + 8px);
    z-index: var(--z-tray);
    margin: 0;
    padding: 3px 8px;
    border: 1px solid var(--rule);
    background: var(--panel-float);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: var(--dim);
    opacity: 0.75;
    pointer-events: none;
    user-select: none;
    animation: appear 0.25s ease-out;
  }
  kbd {
    font: inherit;
    color: var(--ink);
  }
  .sep {
    margin: 0 4px;
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
