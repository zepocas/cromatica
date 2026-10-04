<script lang="ts">
  import SliderRow from './controls/SliderRow.svelte';
  import type { EditorState } from './editor.svelte';
  import Section from './Section.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  const fixed2 = (v: number) => v.toFixed(2);
  const degrees = (v: number) => `${Math.round(v)}°`;
  const warpOff = $derived(editor.warp.shape === 'none');
</script>

<Section title="adjust">
  <SliderRow
    label="warp"
    min={0}
    max={1}
    step={0.01}
    disabled={warpOff}
    bind:value={editor.warp.amount}
    display={fixed2}
  />
  <SliderRow
    label="warp size"
    min={0}
    max={1}
    step={0.01}
    disabled={warpOff}
    bind:value={editor.warp.size}
    display={fixed2}
  />
  <SliderRow label="noise" min={0} max={1} step={0.01} bind:value={editor.grain.amount} display={fixed2} />
  {#if editor.kind === 'mesh'}
    <SliderRow
      label="blend"
      title="Soft ↔ defined"
      min={0}
      max={1}
      step={0.01}
      bind:value={editor.mesh.sharpness}
      display={fixed2}
    />
  {:else}
    <SliderRow label="angle" min={0} max={360} step={1} bind:value={editor.linear.angle} display={degrees} />
  {/if}

  {#snippet more()}
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
    <div class="row">
      <label for="rotate">rotate</label>
      <input
        id="rotate"
        type="range"
        min="0"
        max="359"
        step="1"
        aria-label="Rotate"
        value={editor.transform.rotate}
        oninput={(e) => editor.setRotate(e.currentTarget.valueAsNumber)}
      />
      <button class="icon" aria-label="Rotate left" title="Rotate 90° left" onclick={() => editor.rotateBy(90)}
        >↺</button
      >
      <button class="icon" aria-label="Rotate right" title="Rotate 90° right" onclick={() => editor.rotateBy(-90)}
        >↻</button
      >
      <output>{degrees(editor.transform.rotate)}</output>
    </div>
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
        aria-label="Reset"
        title="Undo rotate, zoom and flips"
        disabled={!editor.isTransformed}
        onclick={() => editor.resetTransform()}>[ reset ]</button
      >
    </div>
  {/snippet}
</Section>

<style>
  .spacer {
    flex: 1;
  }
</style>
