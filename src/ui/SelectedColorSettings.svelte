<script lang="ts">
  import type { BlendMode } from '../design/design';
  import ColorControls from './ColorControls.svelte';
  import SliderRow from './controls/SliderRow.svelte';
  import Toggle from './controls/Toggle.svelte';
  import { MAX_RADIUS, MIN_RADIUS, type EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
    /** Index of the selected point or stop. */
    selected: number;
    /** The selected stop is the last by position (it has no segment to blend into). */
    isLastStop: boolean;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable(), selected, isLastStop }: Props = $props();

  const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
    { value: 'oklab', label: 'perceptual' },
    { value: 'oklab-chroma', label: 'vivid' },
    { value: 'oklch-short', label: 'hue, short way' },
    { value: 'oklch-long', label: 'hue, long way' },
  ];
</script>

{#if editor.kind === 'mesh'}
  <ColorControls color={editor.mesh.points[selected].color} onchange={(c) => editor.palette.setColor(selected, c)} />
  <SliderRow
    label="size"
    ariaLabel="Point size"
    min={MIN_RADIUS}
    max={MAX_RADIUS}
    step={0.005}
    value={editor.pointSize(selected)}
    oninput={(v) => editor.setPointSize(selected, v)}
  />
  <div class="row">
    <span>points</span>
    <Toggle
      checked={editor.showHandles}
      label="show on image"
      ariaLabel={editor.showHandles ? 'Hide points' : 'Show points'}
      title="Show or hide the points on the image (H)"
      onchange={(on) => (editor.showHandles = on)}
    />
  </div>
{:else}
  <ColorControls color={editor.ramp.stops[selected].color} onchange={(c) => editor.palette.setColor(selected, c)} />
  <label class="row">
    <span>blend</span>
    <select aria-label="Blend to next stop" bind:value={editor.ramp.stops[selected].blend} disabled={isLastStop}>
      {#each BLEND_OPTIONS as o (o.value)}
        <option value={o.value}>{o.label}</option>
      {/each}
    </select>
  </label>
{/if}
