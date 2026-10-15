<script lang="ts">
  import { fixed2 } from '../controls/format';
  import Section from '../controls/Section.svelte';
  import SliderRow from '../controls/SliderRow.svelte';
  import type { EditorState } from '../state/editor.svelte';
  import FinishGroups from './adjust/FinishGroups.svelte';
  import PatternAdjust from './adjust/PatternAdjust.svelte';
  import TransformControls from './adjust/TransformControls.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

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
  <PatternAdjust bind:editor />
  <FinishGroups bind:editor />

  {#snippet more()}
    <SliderRow
      label="vignette"
      title="Darken toward the corners"
      min={0}
      max={1}
      step={0.01}
      bind:value={editor.finish.vignette}
      display={fixed2}
    />
    <TransformControls bind:editor />
  {/snippet}
</Section>
