<script lang="ts">
  import { HARMONY_RULES } from '../color/harmony';
  import { hexToOklch, inSrgbGamut, oklchToHex } from '../color/oklab';
  import type { BlendMode, Oklch } from '../design/design';
  import type { HarmonyRule, ValueKey } from '../design/shuffle.types';
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

  const RULE_LABELS: Record<(typeof HARMONY_RULES)[number], string> = {
    monochrome: 'monochrome',
    analogous: 'analogous',
    complementary: 'complementary',
    'split-complementary': 'split complementary',
    triadic: 'triadic',
    tetradic: 'tetradic',
  };

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

  const setColor = (i: number, color: Oklch) => editor.setColor(i, color);

  const hexOf = (c: Oklch) => oklchToHex(c).toUpperCase();

  /** Anchor the harmony on the selected color's hue. */
  function baseFromSelected() {
    editor.baseHue = Math.round(colors[selected][2]);
  }

  let fileInput: HTMLInputElement;

  function onImagePicked(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (file) editor.importImage(file);
    // Clear, so picking the same file again still fires change.
    e.currentTarget.value = '';
  }

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
      aria-label="Shuffle color order"
      title="Same colors, swapped between {isMesh ? 'points' : 'stops'}"
      onclick={() => editor.shuffleColorOrder()}>⇄</button
    >
    <button
      class="icon"
      aria-label="Colors from image"
      title="Take the colors from an image (or drop one on the window); it never leaves your browser"
      onclick={() => fileInput.click()}>◩</button
    >
    <input bind:this={fileInput} type="file" accept="image/*" hidden aria-label="Image file" onchange={onImagePicked} />
    <button
      class="icon"
      aria-label="Add color"
      title={isMesh ? 'Add a point (or double-click the image)' : 'Add a stop (or click the strip)'}
      disabled={!editor.canAddColor}
      onclick={() => editor.addColor()}>+</button
    >
  {/snippet}

  <div class="row">
    <label for="harmony">harmony</label>
    <select
      id="harmony"
      aria-label="Harmony"
      title="The palette's color rule; pick one for a new palette in that rule"
      value={editor.harmony?.rule ?? ''}
      onchange={(e) => editor.setHarmonyRule(e.currentTarget.value as HarmonyRule)}
    >
      {#if !editor.harmony}<option value="" disabled>custom</option>{/if}
      {#each HARMONY_RULES as r (r)}
        <option value={r}>{RULE_LABELS[r]}</option>
      {/each}
    </select>
    <button
      aria-label="Keep harmony"
      aria-pressed={editor.keepHarmony}
      title="Keep this rule, mood and key when shuffling (off: all random)"
      onclick={() => (editor.keepHarmony = !editor.keepHarmony)}>{editor.keepHarmony ? '[x]' : '[ ]'} keep</button
    >
  </div>

  <div class="row">
    <span>edit</span>
    <button
      aria-label="Link colors"
      aria-pressed={editor.linkColors}
      title="Linked: changing one color moves the whole palette with it, keeping the harmony"
      onclick={() => (editor.linkColors = !editor.linkColors)}>{editor.linkColors ? '[x]' : '[ ]'} linked</button
    >
    <span class="spacer"></span>
    <button
      aria-label="Remix colors"
      title="Shift the whole palette at random, keeping how the colors relate"
      onclick={() => editor.remix()}>[ remix ]</button
    >
  </div>

  {#if editor.imageStatus}
    <p class="status" role="status">{editor.imageStatus}</p>
  {/if}

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
    <label class="row">
      <span>mood</span>
      <select
        aria-label="Mood"
        value={editor.harmony?.mood ?? ''}
        onchange={(e) => editor.setHarmonyMood(e.currentTarget.value as 'natural' | 'vivid')}
      >
        {#if !editor.harmony}<option value="" disabled>custom</option>{/if}
        <option value="natural">natural</option>
        <option value="vivid">vivid</option>
      </select>
    </label>
    <label class="row">
      <span>key</span>
      <select
        aria-label="Value key"
        title="Where the palette sits on the lightness scale"
        value={editor.harmony?.key ?? ''}
        onchange={(e) => editor.setValueKey(e.currentTarget.value as ValueKey)}
      >
        {#if !editor.harmony}<option value="" disabled>custom</option>{/if}
        <option value="high">high (light)</option>
        <option value="full">full range</option>
        <option value="low">low (dark)</option>
      </select>
    </label>
    <div class="row">
      <span>base hue</span>
      <button
        aria-label="Fix base hue"
        aria-pressed={editor.baseHue !== null}
        title="Build the harmony around one hue instead of a random one"
        onclick={() => (editor.baseHue = editor.baseHue === null ? Math.round(colors[selected][2]) : null)}
        >{editor.baseHue === null ? '[ ]' : '[x]'}</button
      >
      <input
        class="hue"
        type="range"
        min="0"
        max="359"
        step="1"
        aria-label="Base hue"
        disabled={editor.baseHue === null}
        value={editor.baseHue ?? 0}
        oninput={(e) => (editor.baseHue = e.currentTarget.valueAsNumber)}
      />
      <button
        class="icon"
        aria-label="Base hue from selected color"
        title="Use the selected color's hue"
        onclick={baseFromSelected}>⌖</button
      >
    </div>
    <hr />
    {#if isMesh}
      <ColorControls color={editor.mesh.points[selected].color} onchange={(c) => setColor(selected, c)} />
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
      <ColorControls color={editor.linear.stops[selected].color} onchange={(c) => setColor(selected, c)} />
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
  .spacer {
    flex: 1;
  }
  .status {
    margin: 0;
    color: var(--dim);
  }
  .row button[aria-pressed='true'] {
    color: var(--ink);
  }
  hr {
    width: 100%;
    margin: 2px 0;
    border: none;
    border-top: 1px dashed var(--rule);
  }
</style>
