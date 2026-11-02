<script lang="ts">
  import Glyph from '../../controls/Glyph.svelte';
  import { degrees } from '../../controls/format';
  import SliderRow from '../../controls/SliderRow.svelte';
  import XYPad from '../../controls/XYPad.svelte';
  import type { EditorState } from '../../state/editor.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  /** The pad shows where the view sits on the image, so its dot goes the way the image does not: the pan is its negative. It spans this many frame heights each way; alt-drag can go further (up to MAX_PAN). */
  const PAD_RANGE = 1;
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
<XYPad
  label="move"
  x={0 - (editor.transform.panX ?? 0)}
  y={0 - (editor.transform.panY ?? 0)}
  range={PAD_RANGE}
  step={0.01}
  title="Where you are looking: drag the dot and the image moves the other way (Shift: fine). Double-click centres"
  onchange={(x, y) => editor.setPan(0 - x, 0 - y)}
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
      ><Glyph name="turn-left" /></button
    >
    <button class="icon" aria-label="Rotate right" title="Rotate 90° right" onclick={() => editor.rotateBy(-90)}
      ><Glyph name="turn-right" /></button
    >
  {/snippet}
</SliderRow>
<div class="row">
  <span>flip</span>
  <button class="icon" aria-label="Flip horizontally" title="Mirror left ↔ right" onclick={() => editor.flip('x')}
    ><Glyph name="flip-x" /></button
  >
  <button class="icon" aria-label="Flip vertically" title="Mirror top ↔ bottom" onclick={() => editor.flip('y')}
    ><Glyph name="flip-y" /></button
  >
  <span class="spacer"></span>
  <button
    class="btn"
    aria-label="Reset"
    title="Undo rotate, zoom, position and flips"
    disabled={!editor.isTransformed}
    onclick={() => editor.resetTransform()}>reset</button
  >
</div>
<p class="hint">alt-drag moves the image, alt-scroll zooms it</p>

<style>
  .hint {
    margin: 4px 0 0;
    color: var(--dim);
  }
  .spacer {
    flex: 1;
  }
</style>
