<script lang="ts">
  import { BAND_STYLES, noFinish, type NoiseType } from '../../../design/design';
  import { prepareFinish } from '../../../engine/finish';
  import Choice from '../../controls/Choice.svelte';
  import Dropdown, { type DropdownOption } from '../../controls/Dropdown.svelte';
  import { degrees, fixed2 } from '../../controls/format';
  import Group from '../../controls/Group.svelte';
  import SliderRow from '../../controls/SliderRow.svelte';
  import type { EditorState } from '../../state/editor.svelte';

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
  const bandSteps = (bands: number) => prepareFinish({ ...noFinish, bands }, { width: 1, height: 1 }).bandSteps;
  // Mesh band styles show as A, B and C in the panel (D60).
  const LETTERS = ['A', 'B', 'C'];
  const BAND_TITLES = ['Terraces around each point', 'Flat facets between points', 'Lightness layers'];
  let noiseFolded = $state(false);
  let lightingFolded = $state(false);
</script>

<!-- Bands and edge, then the noise and lighting groups. -->
{#if editor.kind !== 'planes' && editor.kind !== 'aurora' && editor.kind !== 'grid'}
  <!-- Ramps band their position, so the readout is the step count; on a mesh the steps mean something different per style, so it shows the amount. -->
  {#if editor.kind === 'mesh'}
    <SliderRow
      label="bands"
      title="The image in flat steps, like a topographic map"
      min={0}
      max={1}
      step={0.01}
      bind:value={editor.finish.bands}
      display={(v) => (v === 0 ? 'off' : fixed2(v))}
    >
      {#snippet after()}
        <span class="seg" role="group" aria-label="Band style">
          {#each BAND_STYLES as style, i (style)}
            <button
              aria-pressed={editor.finish.bandStyle === style}
              title={BAND_TITLES[i]}
              onclick={() => (editor.finish.bandStyle = style)}>{LETTERS[i]}</button
            >
          {/each}
        </span>
      {/snippet}
    </SliderRow>
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
<Group title="noise" bind:collapsed={noiseFolded}>
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
</Group>

<Group title="lighting" bind:collapsed={lightingFolded}>
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
</Group>
