<script lang="ts">
  import { HARMONY_RULES, type HarmonyRule } from '../color/harmony';
  import type { Oklch } from '../color/types';
  import { shortestTurn } from '../math';
  import ColorRow from './ColorRow.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { EditorState } from './editor.svelte';
  import PaletteSettings from './PaletteSettings.svelte';
  import Section from './Section.svelte';
  import SelectedColorSettings from './SelectedColorSettings.svelte';
  import StopStrip from './StopStrip.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  const RULE_LABELS: Record<HarmonyRule, string> = {
    monochrome: 'monochrome',
    analogous: 'analogous',
    complementary: 'complementary',
    'split-complementary': 'split complementary',
    triadic: 'triadic',
    tetradic: 'tetradic',
  };

  const palette = $derived(editor.palette);
  const isMesh = $derived(editor.kind === 'mesh');
  const noun = $derived(isMesh ? 'point' : 'stop');
  const colors = $derived<Oklch[]>(
    isMesh ? editor.mesh.points.map((p) => p.color) : editor.ramp.stops.map((s) => s.color),
  );
  // Mesh points in index order (matches the handles); stops in position order.
  const order = $derived(
    isMesh
      ? colors.map((_, i) => i)
      : colors.map((_, i) => i).sort((a, b) => editor.ramp.stops[a].position - editor.ramp.stops[b].position),
  );
  const selected = $derived(Math.min(isMesh ? editor.selectedPoint : editor.selectedStop, colors.length - 1));
  /** Colors before base hue and temperature; null when nothing is adjusted. */
  const original = $derived(palette.originalColors);
  const adjustedSummary = $derived.by(() => {
    const parts: string[] = [];
    const turn = Math.round(shortestTurn(0, palette.hueOffset));
    if (turn !== 0) parts.push(`hue ${turn > 0 ? '+' : ''}${turn}°`);
    if (palette.temperature !== 'off') parts.push(`temp ${palette.temperature}`);
    return parts.join(' · ');
  });

  let fileInput: HTMLInputElement;

  function select(i: number) {
    if (isMesh) editor.selectedPoint = i;
    else editor.selectedStop = i;
  }

  function onImagePicked(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (file) void editor.importImage(file);
    // Clear, so picking the same file again still fires change.
    e.currentTarget.value = '';
  }
</script>

<Section title="colors">
  {#snippet tools()}
    <button
      class="icon"
      aria-label="Shuffle colors"
      title="New colors, same layout"
      onclick={() => editor.shuffleColors()}>⟳</button
    >
    <button
      class="icon"
      aria-label="Shuffle color order"
      title="Same colors, swapped between {noun}s"
      onclick={() => palette.shuffleOrder()}>⇄</button
    >
    <button
      class="icon"
      aria-label="Colors from image"
      title="Take the colors from an image (or drop one on the window); it never leaves your browser"
      onclick={() => fileInput.click()}>◩</button
    >
    <input bind:this={fileInput} type="file" accept="image/*" hidden aria-label="Image file" onchange={onImagePicked} />
  {/snippet}

  <div class="row">
    <label for="harmony">harmony</label>
    <select
      id="harmony"
      aria-label="Harmony"
      title="The palette's color rule; pick one for a new palette in that rule"
      value={palette.info?.rule ?? ''}
      onchange={(e) => palette.setRule(e.currentTarget.value as HarmonyRule)}
    >
      {#if !palette.info}<option value="" disabled>custom</option>{/if}
      {#each HARMONY_RULES as r (r)}
        <option value={r}>{RULE_LABELS[r]}</option>
      {/each}
    </select>
    <Toggle
      checked={palette.keep}
      label="keep"
      ariaLabel="Keep harmony"
      title="Keep this rule, mood and key when shuffling (off: all random)"
      onchange={(on) => (palette.keep = on)}
    />
  </div>

  <div class="row">
    <span>edit</span>
    <Toggle
      checked={palette.linked}
      label="linked"
      ariaLabel="Link colors"
      title="Linked: changing one color moves the whole palette with it, keeping the harmony"
      onchange={(on) => (palette.linked = on)}
    />
    <span class="spacer"></span>
    <button
      aria-label="Remix colors"
      title="Shift the whole palette at random, keeping how the colors relate"
      onclick={() => palette.remix()}>[ remix ]</button
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
      <ColorRow
        index={i}
        color={colors[i]}
        original={original?.[i]}
        selected={i === selected}
        name={isMesh ? `point ${i + 1}` : `${Math.round(editor.ramp.stops[i].position * 100)}%`}
        {noun}
        canRemove={editor.canRemoveColor}
        onselect={() => select(i)}
        onchange={(c) => palette.setColor(i, c)}
        onremove={() => editor.removeColor(i)}
      />
    {/each}
    <li class="add">
      <button
        aria-label="Add color"
        title={isMesh ? 'Add a point (or double-click the image)' : 'Add a stop (or click the strip)'}
        disabled={!editor.canAddColor}
        onclick={() => editor.addColor()}>+ add {noun}</button
      >
    </li>
  </ul>

  {#if original}
    <div class="row" role="status" title="Adjusted from the original colors">
      <em class="adjusted">~ {adjustedSummary}</em>
      <button
        aria-label="Reset adjustments"
        title="Back to the original colors"
        onclick={() => palette.resetAdjustments()}>[ reset ]</button
      >
    </div>
  {/if}

  {#snippet more()}
    <PaletteSettings {palette} selectedHue={colors[selected][2]} />
    <hr />
    <SelectedColorSettings bind:editor {selected} isLastStop={!isMesh && order[order.length - 1] === selected} />
  {/snippet}
</Section>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li.add button {
    color: var(--dim);
    padding-left: 26px;
  }
  li.add button:hover:not(:disabled) {
    color: var(--ink);
  }
  .spacer {
    flex: 1;
  }
  .status {
    margin: 0;
    color: var(--dim);
  }
  .adjusted {
    flex: 1;
    font-style: normal;
    white-space: nowrap;
    color: var(--ink);
  }
  hr {
    width: 100%;
    margin: 2px 0;
    border: none;
    border-top: 1px dashed var(--rule);
  }
</style>
