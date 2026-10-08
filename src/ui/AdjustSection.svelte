<script lang="ts">
  import { BAND_STYLES, MAX_GRID, MIN_GRID, noFinish, type NoiseType } from '../design/design';
  import { prepareFinish } from '../engine/finish';
  import { ribbonCount } from '../engine/aurora';
  import { planeCount } from '../engine/planes';
  import Choice from './controls/Choice.svelte';
  import Dropdown, { type DropdownOption } from './controls/Dropdown.svelte';
  import SliderRow from './controls/SliderRow.svelte';
  import type { EditorState } from './editor.svelte';
  import Section from './Section.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  const NOISE_OPTIONS: DropdownOption<NoiseType>[] = [
    { value: 'lithograph', title: 'Paper tooth, toner specks, darker edges' },
    { value: 'xerox', title: 'A photocopy: a thresholded few-tone screen over the lithograph' },
    { value: 'halftone', title: 'A print screen of ink dots on paper: fine texture ↔ newsprint' },
    { value: 'grain', title: 'Analog film grain: fine and a little clumpy, strongest in the midtones' },
  ];
  /** Picking a type while noise is off turns it on, so the choice (and its preview) shows. */
  const noiseOf = (type: NoiseType) => ({ type, amount: editor.finish.noise.amount || NOISE_ON });
  const setNoiseType = (type: NoiseType) => (editor.finish.noise = noiseOf(type));
  const NOISE_ON = 0.4;
  const fixed2 = (v: number) => v.toFixed(2);
  const bandSteps = (bands: number) => prepareFinish({ ...noFinish, bands }, { width: 1, height: 1 }).bandSteps;
  // Mesh band styles show as A, B and C in the panel (D60).
  const LETTERS = ['A', 'B', 'C'];
  const BAND_TITLES = ['Terraces around each point', 'Flat facets between points', 'Lightness layers'];
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
  <fieldset class="group">
    <legend>noise</legend>
    <div class="row">
      <span>type</span>
      <Dropdown
        ariaLabel="Noise type"
        value={editor.finish.noise.type}
        options={NOISE_OPTIONS}
        onchange={(v) => setNoiseType(v)}
        onactive={(v) =>
          editor.previewChange(v && v !== editor.finish.noise.type ? (t) => (t.finish.noise = noiseOf(v)) : null)}
      />
    </div>
    <SliderRow
      label="amount"
      ariaLabel="Noise amount"
      min={0}
      max={1}
      step={0.01}
      bind:value={editor.finish.noise.amount}
      display={(v) => (v === 0 ? 'off' : v.toFixed(2))}
    />
  </fieldset>
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
      bind:value={editor.planes.count}
      display={(v) => String(planeCount(v))}
    />
    <div class="row">
      <label for="planes-torn">torn</label>
      <input
        id="planes-torn"
        type="range"
        min="0"
        max="1"
        step="0.01"
        aria-label="Torn"
        title="Clean cut ↔ torn paper edges"
        bind:value={editor.planes.roughness}
      />
      <button
        class="icon"
        aria-label="New layout"
        title="New arrangement of the planes"
        data-seed={editor.planes.seed}
        onclick={() => editor.newPlanesLayout()}>⚄</button
      >
      <output>{fixed2(editor.planes.roughness)}</output>
    </div>
    <SliderRow
      label="blend"
      title="Crisp ↔ slightly blurred edges"
      min={0}
      max={1}
      step={0.01}
      bind:value={editor.planes.blend}
      display={fixed2}
    />
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
    <div class="row">
      <label for="aurora-glow">glow</label>
      <input
        id="aurora-glow"
        type="range"
        min="0"
        max="1"
        step="0.01"
        aria-label="Glow"
        title="Thin bright lines ↔ wide soft curtains"
        bind:value={editor.aurora.glow}
      />
      <button
        class="icon"
        aria-label="New aurora layout"
        title="New arrangement of the ribbons"
        data-seed={editor.aurora.seed}
        onclick={() => editor.newAuroraLayout()}>⚄</button
      >
      <output>{fixed2(editor.aurora.glow)}</output>
    </div>
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
    <div class="row">
      <label for="ramp-scale">scale</label>
      <input
        id="ramp-scale"
        type="range"
        min="0"
        max="1"
        step="0.01"
        aria-label="Scale"
        title="Large ↔ small features"
        bind:value={editor.ramp.scale}
      />
      <button
        class="icon"
        aria-label="New pattern variation"
        title="New arrangement of the {editor.kind}"
        data-seed={editor.ramp.seed}
        onclick={() => editor.newRampVariation()}>⚄</button
      >
      <output>{fixed2(editor.ramp.scale ?? 0.35)}</output>
    </div>
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
  {#if editor.kind !== 'planes' && editor.kind !== 'aurora' && editor.kind !== 'grid'}
    <!-- Ramps band their position, so the readout is the step count; on a mesh the steps mean something different per style, so it shows the amount. -->
    {#if editor.kind === 'mesh'}
      <div class="row">
        <label for="bands">bands</label>
        <input
          id="bands"
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="Bands"
          title="The image in flat steps, like a topographic map"
          bind:value={editor.finish.bands}
        />
        <output>{editor.finish.bands === 0 ? 'off' : fixed2(editor.finish.bands)}</output>
        <span class="seg" role="group" aria-label="Band style">
          {#each BAND_STYLES as style, i (style)}
            <button
              aria-pressed={editor.finish.bandStyle === style}
              title={BAND_TITLES[i]}
              onclick={() => (editor.finish.bandStyle = style)}>{LETTERS[i]}</button
            >
          {/each}
        </span>
      </div>
    {:else}
      <SliderRow
        label="bands"
        title="The image in flat steps, like a topographic map"
        min={0}
        max={1}
        step={0.01}
        bind:value={editor.finish.bands}
        display={(v) => (v === 0 ? 'off' : String(bandSteps(v)))}
      />
    {/if}
    <SliderRow
      label="edge"
      title="Band edges: crisp lines ↔ soft terraces"
      min={0}
      max={1}
      step={0.01}
      disabled={editor.finish.bands === 0}
      bind:value={editor.finish.bandEdge}
      display={fixed2}
    />
  {/if}

  {#snippet more()}
    <fieldset class="group">
      <legend>lighting</legend>
      <SliderRow
        label="amount"
        title="Light the image as a raised surface: lighter parts stand higher"
        min={0}
        max={1}
        step={0.01}
        bind:value={editor.finish.relief}
        display={(v) => (v === 0 ? 'off' : v.toFixed(2))}
      />
      <SliderRow
        label="direction"
        title="Where the light comes from"
        min={0}
        max={359}
        step={1}
        disabled={editor.finish.relief === 0}
        bind:value={editor.finish.reliefLight}
        display={degrees}
      />
      <Choice
        label="surface"
        ariaLabel="Relief surface"
        options={[
          { value: 'satin', title: 'Soft shading and sheen' },
          { value: 'glass', title: 'The image refracted under glass, bright rims' },
        ]}
        value={editor.finish.reliefStyle}
        onchange={(v) => (editor.finish.reliefStyle = v)}
      />
    </fieldset>
    <SliderRow
      label="vignette"
      title="Darken toward the corners"
      min={0}
      max={1}
      step={0.01}
      bind:value={editor.finish.vignette}
      display={fixed2}
    />
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
  .group {
    min-width: 0;
    margin: 4px 0;
    padding: 2px 8px 4px;
    border: 1px solid var(--rule);
  }

  .group legend {
    padding: 0 4px;
    color: var(--dim);
  }

  .spacer {
    flex: 1;
  }
</style>
