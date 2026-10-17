<script lang="ts">
  import SliderRow from '../controls/SliderRow.svelte';
  import { MAX_RADIUS, MIN_RADIUS, type EditorState } from '../state/editor.svelte';

  interface Props {
    editor: EditorState;
    selected: number;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable(), selected }: Props = $props();
</script>

<SliderRow
  label="size"
  ariaLabel="Point size"
  min={MIN_RADIUS}
  max={MAX_RADIUS}
  step={0.005}
  value={editor.pointSize(selected)}
  oninput={(v) => editor.setPointSize(selected, v)}
/>
