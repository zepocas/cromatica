<script lang="ts">
  import { degrees } from '../../controls/format';
  import SliderRow from '../../controls/SliderRow.svelte';
  import type { EditorState } from '../../state/editor.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();
</script>

<!-- Log scale: the slider moves by doublings. -->
<SliderRow
  label="zoom"
  min={-1}
  max={2}
  step={0.01}
  value={Math.log2(editor.transform.zoom)}
  oninput={(v) => editor.setZoom(2 ** v)}
  display={() => `${editor.transform.zoom.toFixed(1)}×`}
/>
<SliderRow
  label="rotate"
  min={0}
  max={359}
  step={1}
  value={editor.transform.rotate}
  oninput={(v) => editor.setRotate(v)}
  display={degrees}
>
  {#snippet trailing()}
    <button class="icon" aria-label="Rotate left" title="Rotate 90° left" onclick={() => editor.rotateBy(90)}
      >↺</button
    >
    <button class="icon" aria-label="Rotate right" title="Rotate 90° right" onclick={() => editor.rotateBy(-90)}
      >↻</button
    >
  {/snippet}
</SliderRow>
<div class="row">
  <span>flip</span>
  <button class="icon" aria-label="Flip horizontally" title="Mirror left ↔ right" onclick={() => editor.flip('x')}
    >⇋</button
  >
  <button class="icon" aria-label="Flip vertically" title="Mirror top ↔ bottom" onclick={() => editor.flip('y')}
    >⇵</button
  >
  <span class="spacer"></span>
  <button
    class="btn"
    aria-label="Reset"
    title="Undo rotate, zoom and flips"
    disabled={!editor.isTransformed}
    onclick={() => editor.resetTransform()}>reset</button
  >
</div>

<style>
  .spacer {
    flex: 1;
  }
</style>
