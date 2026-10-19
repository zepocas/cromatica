<script lang="ts">
  import { MAX_GRID, MIN_GRID } from '../../../design/design';
  import { ribbonCount } from '../../../engine/aurora';
  import { planeCount } from '../../../engine/planes';
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
  const stack = $derived(editor.planeStack);
  const place = $derived(stack.indexOf(editor.selectedPlane));
  const picked = $derived(place >= 0);

  /** Step the pick through the stack, so a plane hidden behind others can still be chosen. */
  function stepPick(by: -1 | 1) {
    editor.selectedPlane = stack[picked ? Math.max(0, Math.min(stack.length - 1, place + by)) : stack.length - 1];
  }
</script>

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
  />
  <SliderRow
    label="torn"
    title="Clean cut ↔ torn paper edges"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.planes.roughness}
    display={fixed2}
  >
    {#snippet trailing()}
      <button
        class="icon"
        aria-label="New layout"
        title="New arrangement of the planes"
        data-seed={editor.planes.seed}
        onclick={() => editor.newPlanesLayout()}>⚄</button
      >
    {/snippet}
  </SliderRow>
  <SliderRow
    label="blend"
    title="Crisp ↔ slightly blurred edges"
    min={0}
    max={1}
    step={0.01}
    bind:value={editor.planes.blend}
    display={fixed2}
  />
  <Group title="arrange" ariaLabel="Arrange layout" bind:collapsed={arrangeFolded}>
    <div class="row">
      <span>plane</span>
      <button class="icon" aria-label="Plane behind" disabled={picked && place === 0} onclick={() => stepPick(-1)}
        >◂</button
      >
      <output aria-label="Picked plane">{picked ? `${place + 1} / ${stack.length}` : 'none'}</output>
      <button
        class="icon"
        aria-label="Plane in front"
        disabled={picked && place === stack.length - 1}
        onclick={() => stepPick(1)}>▸</button
      >
    </div>
    <div class="row">
      <span>stack</span>
      <button
        class="btn"
        title="Send the plane one step back"
        disabled={!picked || place === 0}
        onclick={() => editor.restack(editor.selectedPlane, 'back')}>back</button
      >
      <button
        class="btn"
        title="Bring the plane one step forward"
        disabled={!picked || place === stack.length - 1}
        onclick={() => editor.restack(editor.selectedPlane, 'forward')}>forward</button
      >
    </div>
    <div class="row">
      <span></span>
      <button
        class="btn"
        title="Put this plane back where the layout had it"
        disabled={!picked}
        onclick={() => editor.resetPlane(editor.selectedPlane)}>reset plane</button
      >
      <button
        class="btn"
        title="Undo every move and reorder"
        disabled={!editor.planes.edits}
        onclick={() => editor.clearPlaneEdits()}>reset all</button
      >
    </div>
    <p class="hint">drag a plane on the image; arrows nudge it</p>
    {#if editor.hasWarp}
      <p class="hint">a warp bends the planes, so the outlines are close, not exact</p>
    {/if}
  </Group>
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
        title="New arrangement of the ribbons"
        data-seed={editor.aurora.seed}
        onclick={() => editor.newAuroraLayout()}>⚄</button
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
        title="New arrangement of the {editor.kind}"
        data-seed={editor.ramp.seed}
        onclick={() => editor.newRampVariation()}>⚄</button
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
