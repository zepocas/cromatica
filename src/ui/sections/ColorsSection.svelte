<script lang="ts">
  import { HARMONY_RULES, type HarmonyRule } from '../../color/harmony';
  import type { Oklch } from '../../color/types';
  import { shortestTurn } from '../../math';
  import ColorRow from './ColorRow.svelte';
  import Dropdown from '../controls/Dropdown.svelte';
  import Lock from '../controls/Lock.svelte';
  import type { EditorState } from '../state/editor.svelte';
  import PaletteSettings from './PaletteSettings.svelte';
  import { glow } from '../controls/glow';
  import Section from '../controls/Section.svelte';
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
  const isGrid = $derived(editor.kind === 'grid');
  // Planes and aurora use the stops' colors only, not their positions.
  const isPlanes = $derived(editor.kind === 'planes' || editor.kind === 'aurora' || editor.kind === 'blobs');
  const noun = $derived(isMesh ? 'point' : isGrid ? 'node' : isPlanes ? 'color' : 'stop');
  const colors = $derived<Oklch[]>(
    isMesh
      ? editor.mesh.points.map((p) => p.color)
      : isGrid
        ? editor.grid.nodes.map((n) => n.color)
        : editor.ramp.stops.map((s) => s.color),
  );
  // Mesh points in index order (matches the handles); grid nodes top row first; stops in position order.
  const order = $derived(
    isMesh
      ? colors.map((_, i) => i)
      : isGrid
        ? colors.map((_, i) => i).sort((a, b) => gridRank(a) - gridRank(b))
        : colors.map((_, i) => i).sort((a, b) => editor.ramp.stops[a].position - editor.ramp.stops[b].position),
  );
  const selected = $derived(
    Math.min(isMesh ? editor.selectedPoint : isGrid ? editor.selectedNode : editor.selectedStop, colors.length - 1),
  );

  function gridRank(i: number): number {
    const [r, c] = editor.nodeCell(i);
    return (editor.grid.rows - 1 - r) * editor.grid.cols + c;
  }

  function rowName(i: number): string {
    if (isMesh) return `point ${i + 1}`;
    if (isGrid) {
      const [r, c] = editor.nodeCell(i);
      return `node ${editor.grid.rows - r}·${c + 1}`;
    }
    if (isPlanes) return `color ${order.indexOf(i) + 1}`;
    return `${Math.round(editor.ramp.stops[i].position * 100)}%`;
  }
  const original = $derived(palette.originalColors);
  const adjustedSummary = $derived.by(() => {
    const parts: string[] = [];
    const turn = Math.round(shortestTurn(0, palette.hueOffset));
    if (turn !== 0) parts.push(`hue ${turn > 0 ? '+' : ''}${turn}°`);
    const { brightness, contrast, saturation } = palette.grade;
    const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
    if (brightness !== 0) parts.push(`bri ${pct(brightness)}`);
    if (contrast !== 0) parts.push(`con ${pct(contrast)}`);
    if (saturation !== 0) parts.push(`sat ${pct(saturation)}`);
    return parts.join(' ');
  });

  let fileInput: HTMLInputElement;

  function select(i: number) {
    if (isMesh) editor.selectedPoint = i;
    else if (isGrid) editor.selectedNode = i;
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
      title="New colors, same layout (W)"
      {@attach glow('colors-new')}
      onclick={() => editor.shuffleColors()}>⟳</button
    >
    <button
      class="icon"
      aria-label="Shuffle color order"
      title="Same colors, in a different order (R)"
      {@attach glow('colors-order')}
      onclick={() => palette.shuffleOrder()}>⇄</button
    >
    <button
      class="icon"
      aria-label="Colors from image"
      title="Take the colors from an image (or drop one on the window); it never leaves your browser"
      onclick={() => fileInput.click()}>◩</button
    >
    {#if editor.pins.canPin}
      <button
        class="icon"
        aria-label="Pick colors on the image"
        title="Drag pins over the image to choose each color"
        aria-pressed={editor.pins.pinning}
        onclick={() => (editor.pins.pinning = !editor.pins.pinning)}>◉</button
      >
    {/if}
    <input bind:this={fileInput} type="file" accept="image/*" hidden aria-label="Image file" onchange={onImagePicked} />
  {/snippet}

  <div class="row">
    <label for="harmony">harmony</label>
    <Dropdown
      id="harmony"
      ariaLabel="Harmony"
      title="The palette's color rule; pick one for a new palette in that rule"
      value={palette.info?.rule ?? ''}
      placeholder="custom"
      options={HARMONY_RULES.map((r) => ({ value: r, label: RULE_LABELS[r] }))}
      onchange={(r) => palette.setRule(r)}
      onactive={(r) => editor.previewChange(r && r !== palette.info?.rule ? (t) => t.palette.setRule(r) : null)}
    />
    <Lock
      checked={palette.keepRule}
      ariaLabel="Keep harmony"
      title="Keep this harmony rule when shuffling colors (off: any rule) (H; ⇧H also mood and key)"
      glowId="keep-harmony"
      onchange={(on) => (palette.keepRule = on)}
    />
  </div>

  {#if editor.imageStatus}
    <p class="status" role="status">{editor.imageStatus}</p>
  {/if}

  {#if !isMesh && !isPlanes && !isGrid}
    <StopStrip bind:editor />
  {/if}

  <ul class="list" aria-label="Colors">
    {#each order as i (i)}
      <ColorRow
        index={i}
        color={colors[i]}
        original={original?.[i]}
        selected={i === selected}
        name={rowName(i)}
        {noun}
        canRemove={editor.canRemoveColor}
        onselect={() => select(i)}
        onchange={(c) => palette.setColor(i, c)}
        onremove={() => editor.removeColor(i)}
      />
    {/each}
    {#if !isGrid}
      <li class="add">
        <button
          aria-label="Add color"
          title={isMesh
            ? 'Add a point (or double-click the image)'
            : isPlanes
              ? 'Add a color'
              : 'Add a stop (or click the strip)'}
          disabled={!editor.canAddColor}
          onclick={() => editor.addColor()}>+ add {noun}</button
        >
      </li>
    {/if}
  </ul>

  {#if original}
    <div
      class="row summary"
      role="status"
      title="Adjusted from the original colors (hue, brightness, contrast, saturation)"
    >
      <em class="adjusted">~ {adjustedSummary}</em>
      <button
        class="btn"
        aria-label="Reset adjustments"
        title="Back to the original colors"
        onclick={() => palette.resetAdjustments()}>reset</button
      >
    </div>
  {/if}

  {#snippet more()}
    <PaletteSettings {editor} selectedHue={colors[selected][2]} />
    {#if isMesh}
      <hr />
      <SelectedColorSettings bind:editor {selected} />
    {/if}
  {/snippet}
</Section>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li.add {
    margin-top: 3px;
  }
  li.add button {
    color: var(--dim);
    padding-left: 40px;
  }
  li.add button:hover:not(:disabled) {
    color: var(--ink);
  }
  .status {
    margin: 0;
    color: var(--dim);
  }
  .adjusted {
    flex: 1;
    min-width: 0;
    font-style: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink);
  }
  .summary button {
    flex: none;
  }
  hr {
    width: 100%;
    margin: 2px 0;
    border: none;
    border-top: 1px dashed var(--rule);
  }
</style>
