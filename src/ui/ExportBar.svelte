<script lang="ts">
  import { glow } from './controls/glow';
  import type { EditorState } from './state/editor.svelte';
  import type { PanelUi } from './state/panel-ui.svelte';

  interface Props {
    editor: EditorState;
    ui: PanelUi;
    /** Collapsed panel: only shuffle and download. */
    compact: boolean;
    nudgeShuffle: boolean;
  }

  let { editor, ui, compact, nudgeShuffle }: Props = $props();
</script>

<footer class:compact>
  <div class="row actions">
    <button
      class="primary box"
      class:nudge={nudgeShuffle}
      aria-label="Shuffle"
      title="Shuffle (Space)"
      {@attach glow('shuffle')}
      onclick={() => editor.shuffle()}>shuffle</button
    >
    <button
      class="secondary box"
      aria-label="More like this"
      aria-pressed={ui.exploring}
      title="More like this: variations of this design (M)"
      onclick={() => (ui.exploring = !ui.exploring)}>more like this</button
    >
  </div>
</footer>

<style>
  /* The fill drains out of shuffle and back, until it has been tried once. A color change, not movement, so it stays with reduced motion on. */
  .nudge {
    animation: nudge 1.6s ease-out infinite;
  }
  @keyframes nudge {
    50% {
      background: transparent;
      color: var(--ink);
    }
  }

  /* Pinned to the bottom; the sections scroll above it on short screens. */
  footer {
    position: sticky;
    bottom: 0;
    margin: 0 calc(-1 * var(--pad));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px var(--pad);
    border-top: 1px solid var(--rule);
    background: var(--panel);
  }
  footer.compact {
    position: static;
    flex-direction: row;
    margin: 0;
    padding: 6px 0;
    border: none;
    background: none;
  }
  .box {
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
    border: 1px solid var(--dim);
    text-align: center;
  }
  footer.compact .box {
    flex: none;
  }
</style>
