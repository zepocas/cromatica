<script lang="ts">
  import { hexToOklch, inSrgbGamut, oklchToHex } from '../color/oklab';
  import type { BlendMode, Oklch } from '../design/design';
  import ColorControls from './ColorControls.svelte';
  import { MAX_RADIUS, MIN_RADIUS, type EditorState } from './editor.svelte';
  import Section from './Section.svelte';
  import StopStrip from './StopStrip.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable only so child bindings into its state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
    { value: 'oklab', label: 'perceptual' },
    { value: 'oklab-chroma', label: 'vivid' },
    { value: 'oklch-short', label: 'hue, short way' },
    { value: 'oklch-long', label: 'hue, long way' },
  ];

  const isMesh = $derived(editor.kind === 'mesh');
  const noun = $derived(isMesh ? 'point' : 'stop');
  const colors = $derived<Oklch[]>(
    isMesh ? editor.mesh.points.map((p) => p.color) : editor.linear.stops.map((s) => s.color),
  );
  // Mesh points in index order (matches the handles); stops in position order.
  const order = $derived(
    isMesh
      ? colors.map((_, i) => i)
      : colors.map((_, i) => i).sort((a, b) => editor.linear.stops[a].position - editor.linear.stops[b].position),
  );
  const selected = $derived(Math.min(isMesh ? editor.selectedPoint : editor.selectedStop, colors.length - 1));
  const selIsLastStop = $derived(!isMesh && order[order.length - 1] === selected);

  function select(i: number) {
    if (isMesh) editor.selectedPoint = i;
    else editor.selectedStop = i;
  }

  function setColor(i: number, color: Oklch) {
    if (isMesh) editor.mesh.points[i].color = color;
    else editor.linear.stops[i].color = color;
  }

  const hexOf = (c: Oklch) => oklchToHex(c).toUpperCase();

  function onHexChange(e: Event & { currentTarget: HTMLInputElement }, i: number) {
    const input = e.currentTarget;
    try {
      setColor(i, hexToOklch(input.value));
    } catch {
      // Not a hex color: show the current one again.
    }
    input.value = hexOf(colors[i]);
  }
</script>

<Section title="colors">
  {#snippet tools()}
    <button class="icon" aria-label="Shuffle colors" title="New colors, same layout" onclick={() => editor.shuffleColors()}
      >⟳</button
    >
    <button
      class="icon"
      aria-label="Add color"
      title={isMesh ? 'Add a point (or double-click the image)' : 'Add a stop (or click the strip)'}
      disabled={!editor.canAddColor}
      onclick={() => editor.addColor()}>+</button
    >
  {/snippet}

  {#if !isMesh}
    <StopStrip bind:editor />
  {/if}

  <ul class="list" aria-label="Colors">
    {#each order as i (i)}
      {@const color = colors[i]}
      {@const hex = hexOf(color)}
      <li class:selected={i === selected}>
        <input
          type="color"
          aria-label="Color {i + 1}"
          value={hex}
          style:--swatch={hex}
          onfocus={() => select(i)}
          oninput={(e) => setColor(i, hexToOklch(e.currentTarget.value))}
        />
        <input
          class="hex"
          type="text"
          spellcheck="false"
          autocomplete="off"
          maxlength="7"
          aria-label="Hex of color {i + 1}"
          value={hex}
          onfocus={() => select(i)}
          onchange={(e) => onHexChange(e, i)}
        />
        {#if !inSrgbGamut(color)}
          <span class="gamut" title="This color can't be shown exactly; the closest displayable color is used.">!</span>
        {/if}
        <button class="select" aria-label="Edit color {i + 1}" aria-pressed={i === selected} onclick={() => select(i)}
          >{isMesh ? `point ${i + 1}` : `${Math.round(editor.linear.stops[i].position * 100)}%`}</button
        >
        <button
          class="icon"
          aria-label="Remove color {i + 1}"
          title="Remove this {noun}"
          disabled={!editor.canRemoveColor}
          onclick={() => editor.removeColor(i)}>×</button
        >
      </li>
    {/each}
  </ul>

  {#snippet more()}
    {#if isMesh}
      <ColorControls bind:color={editor.mesh.points[selected].color} />
      <label class="row">
        <span>size</span>
        <input
          type="range"
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step="0.005"
          aria-label="Point size"
          value={editor.pointSize(selected)}
          oninput={(e) => editor.setPointSize(selected, e.currentTarget.valueAsNumber)}
        />
      </label>
      <div class="row">
        <span>points</span>
        <button
          class="toggle"
          aria-label={editor.showHandles ? 'Hide points' : 'Show points'}
          aria-pressed={!editor.showHandles}
          title="Show or hide the points on the image (H)"
          onclick={() => (editor.showHandles = !editor.showHandles)}
          >{editor.showHandles ? '[x]' : '[ ]'} show on image</button
        >
      </div>
    {:else}
      <ColorControls bind:color={editor.linear.stops[selected].color} />
      <label class="row">
        <span>blend</span>
        <select aria-label="Blend to next stop" bind:value={editor.linear.stops[selected].blend} disabled={selIsLastStop}>
          {#each BLEND_OPTIONS as o (o.value)}
            <option value={o.value}>{o.label}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/snippet}
</Section>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 1px 0;
  }
  /* A terminal cursor marks the row the "more" sliders edit. */
  li::before {
    content: ' ';
    width: 1ch;
    flex: none;
    margin-right: -4px;
    white-space: pre;
  }
  li.selected::before {
    content: '›';
  }
  /* The swatch is a ██ block: the only real color in the panel. */
  input[type='color'] {
    width: 18px;
    height: 14px;
    padding: 0;
    border: none;
    background: var(--swatch);
    flex: none;
    cursor: pointer;
    appearance: none;
  }
  input[type='color']::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  input[type='color']::-webkit-color-swatch {
    border: none;
  }
  input[type='color']::-moz-color-swatch {
    border: none;
  }
  li input.hex {
    width: 8ch;
    flex: none;
    padding: 0 2px;
    border-color: transparent;
  }
  li input.hex:hover,
  li input.hex:focus {
    border-color: var(--rule);
  }
  .gamut {
    color: var(--warn);
    cursor: help;
  }
  .select {
    flex: 1;
    min-width: 0;
    text-align: left;
    color: var(--dim);
  }
  li.selected .select {
    color: var(--ink);
  }
  .toggle {
    color: var(--ink);
  }
</style>
