<script lang="ts">
  import ColorControls from './ColorControls.svelte';
  import SliderRow from './controls/SliderRow.svelte';
  import { MAX_RADIUS, MIN_RADIUS, type EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
    /** Index of the selected point or stop. */
    selected: number;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable(), selected }: Props = $props();
</script>

{#if editor.kind === 'grid'}
  <ColorControls color={editor.grid.nodes[selected].color} onchange={(c) => editor.palette.setColor(selected, c)} />
{:else if editor.kind === 'mesh'}
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
{:else}
  <ColorControls color={editor.ramp.stops[selected].color} onchange={(c) => editor.palette.setColor(selected, c)} />
{/if}
