<script lang="ts">
  import Glyph from '../../controls/Glyph.svelte';
  import { DICE_SIZE } from '../../controls/glyphs';
  import { MAX_GRID, MIN_GRID, PLANE_SCALE } from '../../../design/design';
  import { ribbonCount } from '../../../engine/aurora';
  import { blobCount } from '../../../engine/blobs';
  import { planeCount } from '../../../engine/planes';
  import { glow } from '../../controls/glow';
  import Choice from '../../controls/Choice.svelte';
  import { degrees, fixed2 } from '../../controls/format';
  import Group from '../../controls/Group.svelte';
  import SliderRow from '../../controls/SliderRow.svelte';
  import type { EditorState } from '../../state/editor.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  let arrangeFolded = $state(true);
  // Picking a plane or blob on the canvas (by click or drag) opens the group that edits it.
  $effect(() => {
    if (editor.selectedPlane >= 0) arrangeFolded = false;
  });
  const stack = $derived(editor.planeStack);
  const place = $derived(stack.indexOf(editor.selectedPlane));
  const picked = $derived(place >= 0);

  /** Step the pick through the stack, so a plane hidden behind others can still be chosen. */
  function stepPick(by: -1 | 1) {
    editor.selectedPlane = stack[picked ? Math.max(0, Math.min(stack.length - 1, place + by)) : stack.length - 1];
  }
</script>

{#snippet arrange(noun: 'plane' | 'blob')}
  {@const Noun = noun === 'blob' ? 'Blob' : 'Plane'}
  <Group title="arrange each {noun}" ariaLabel="Arrange each {noun}" bind:collapsed={arrangeFolded}>
    <div class="row">
      <span>{noun}</span>
      <button class="icon" aria-label="{Noun} behind" disabled={picked && place === 0} onclick={() => stepPick(-1)}
        >◂</button
      >
      <output aria-label="Picked {noun}">{picked ? `${place + 1} / ${stack.length}` : 'none'}</output>
      <button
        class="icon"
        aria-label="{Noun} in front"
        disabled={picked && place === stack.length - 1}
        onclick={() => stepPick(1)}>▸</button
      >
    </div>
    <div class="row">
      <span>stack</span>
      <button
        class="btn"
        title="Send the {noun} one step back"
        disabled={!picked || place === 0}
        onclick={() => editor.restack(editor.selectedPlane, 'back')}>back</button
      >
      <button
        class="btn"
        title="Bring the {noun} one step forward"
        disabled={!picked || place === stack.length - 1}
        onclick={() => editor.restack(editor.selectedPlane, 'forward')}>forward</button
      >
    </div>
    <SliderRow
      label="size"
      ariaLabel="{Noun} size"
      title={noun === 'blob' ? "This blob's own size, relative to the size slider" : "This plane's own size"}
      min={PLANE_SCALE[0]}
      max={PLANE_SCALE[1]}
      step={0.01}
      value={picked ? editor.planeScale(editor.selectedPlane) : 1}
      disabled={!picked}
      oninput={(v) => editor.setPlaneScale(editor.selectedPlane, v)}
      display={(v) => `×${v.toFixed(2)}`}
    />
    <div class="row">
      <span>reset</span>
      <button
        class="btn"
        aria-label="Reset {noun}"
        title="Put this {noun} back where the layout had it"
        disabled={!picked}
        onclick={() => editor.resetPlane(editor.selectedPlane)}>{noun}</button
      >
      <button
        class="btn"
        aria-label="Reset all"
        title="Undo every move and reorder"
        disabled={!editor.hasShapeEdits}
        onclick={() => editor.clearPlaneEdits()}>all</button
      >
    </div>
    <p class="hint">drag on the image; arrows nudge</p>
    {#if editor.hasWarp && noun === 'plane'}
      <p class="hint">a warp bends the {noun}s, so the outlines are close, not exact</p>
    {/if}
  </Group>
{/snippet}

<!-- The controls that belong to the active pattern kind. -->
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
{:else if editor.kind === 'planes'}
  <SliderRow
    label="planes"
    title="A few large planes ↔ many smaller ones"
    min={0}
    max={1}
    step={0.01}
    value={editor.planes.count}
    oninput={(v) => editor.setPlanesCount(v)}
    display={(v) => String(planeCount(v))}
  >
    {#snippet trailing()}
      <button
        class="icon"
        aria-label="New layout"
        title="New arrangement of the planes (D)"
        data-seed={editor.planes.seed}
        {@attach glow('pattern-dice')}
        onclick={() => editor.newPlanesLayout()}><Glyph name="dice" size={DICE_SIZE} /></button
      >
    {/snippet}
  </SliderRow>
  <SliderRow
    label="torn"
    title="Clean cut ↔ torn paper edges"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.planes.roughness}
    display={fixed2}
  />
  <SliderRow
    label="blend"
    title="Crisp ↔ slightly blurred edges"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.planes.blend}
    display={fixed2}
  />
  {@render arrange('plane')}
{:else if editor.kind === 'grid'}
  <SliderRow
    label="rows"
    min={MIN_GRID}
    max={MAX_GRID}
    step={1}
    value={editor.grid.rows}
    oninput={(v) => editor.setGridSize(v, editor.grid.cols)}
    display={String}
  />
  <SliderRow
    label="columns"
    min={MIN_GRID}
    max={MAX_GRID}
    step={1}
    value={editor.grid.cols}
    oninput={(v) => editor.setGridSize(editor.grid.rows, v)}
    display={String}
  />
  <SliderRow
    label="lines"
    title="Draw the net's own lines over the colors"
    min={0}
    max={1}
    step={0.01}
    value={editor.grid.lines ?? 0}
    oninput={(v) => (editor.grid.lines = v)}
    display={(v) => (v === 0 ? 'off' : fixed2(v))}
  />
{:else if editor.kind === 'aurora'}
  <SliderRow
    label="ribbons"
    title="How many ribbons"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.aurora.count}
    display={(v) => String(ribbonCount(v))}
  />
  <SliderRow
    label="glow"
    title="Thin bright lines ↔ wide soft curtains"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.aurora.glow}
    display={fixed2}
  >
    {#snippet trailing()}
      <button
        class="icon"
        aria-label="New aurora layout"
        title="New arrangement of the ribbons (D)"
        data-seed={editor.aurora.seed}
        {@attach glow('pattern-dice')}
        onclick={() => editor.newAuroraLayout()}><Glyph name="dice" size={DICE_SIZE} /></button
      >
    {/snippet}
  </SliderRow>
  <SliderRow
    label="blend"
    title="Crisp edges and rays ↔ soft ones"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.aurora.blend}
    display={fixed2}
  />
{:else if editor.kind === 'blobs'}
  <SliderRow
    label="blobs"
    title="How many blobs"
    min={0}
    max={1}
    step={0.01}
    value={editor.blobs.count}
    oninput={(v) => editor.setBlobsCount(v)}
    display={(v) => String(blobCount(v))}
  >
    {#snippet trailing()}
      <button
        class="icon"
        aria-label="New blobs layout"
        title="New arrangement of the blobs (D)"
        data-seed={editor.blobs.seed}
        {@attach glow('pattern-dice')}
        onclick={() => editor.newBlobsLayout()}><Glyph name="dice" size={DICE_SIZE} /></button
      >
    {/snippet}
  </SliderRow>
  <SliderRow
    label="size"
    title="Small ↔ large blobs"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.blobs.size}
    display={fixed2}
  />
  <SliderRow
    label="wobble"
    title="Smooth ovals ↔ irregular bubbles"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.blobs.wobble}
    display={fixed2}
  />
  <SliderRow
    label="grain"
    title="Off (smooth ink) ↔ fine stipple ↔ coarse stipple"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.blobs.grain}
    display={(v) => (v === 0 ? 'off' : fixed2(v))}
  />
  <Choice
    label="base"
    ariaLabel="Blob base"
    options={[
      { value: 'black', title: 'Ink dots over a black body' },
      { value: 'palette', title: 'A body in its palette color, with black or white dots' },
    ]}
    value={editor.blobs.base ?? 'black'}
    onchange={(v) => (editor.blobs.base = v)}
  />
  {@render arrange('blob')}
{:else if editor.kind === 'noise' || editor.kind === 'cells'}
  {#if editor.kind === 'noise'}
    <Choice
      label="style"
      ariaLabel="Noise style"
      options={[
        { value: 'contour', title: 'Topographic stripes' },
        { value: 'ridged', title: 'Veins and creases' },
      ]}
      value={editor.ramp.noiseStyle ?? 'contour'}
      onchange={(v) => (editor.ramp.noiseStyle = v)}
    />
  {/if}
  <SliderRow
    label="scale"
    title="Large ↔ small features"
    min={0}
    max={1}
    step={0.01}
    value={editor.ramp.scale ?? 0.35}
    oninput={(v) => (editor.ramp.scale = v)}
    display={fixed2}
  >
    {#snippet trailing()}
      <button
        class="icon"
        aria-label="New pattern variation"
        title="New arrangement of the {editor.kind} (D)"
        data-seed={editor.ramp.seed}
        {@attach glow('pattern-dice')}
        onclick={() => editor.newRampVariation()}><Glyph name="dice" size={DICE_SIZE} /></button
      >
    {/snippet}
  </SliderRow>
{:else if editor.kind !== 'radial'}
  <SliderRow
    label="angle"
    title={editor.kind === 'conic' ? 'Where the sweep starts' : 'Direction of the gradient'}
    min={0}
    max={360}
    step={1}
    bind:value={editor.ramp.angle}
    display={degrees}
  />
{/if}

<style>
  .hint {
    margin: 4px 0 0;
    color: var(--dim);
  }
</style>
