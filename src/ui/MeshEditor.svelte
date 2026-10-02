<script lang="ts">
  import ColorControls from './ColorControls.svelte';
  import { MAX_RADIUS, MIN_RADIUS, type EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
  }

  // Bindable only so child bindings into its state pass Svelte's ownership checks.
  let { editor = $bindable() }: Props = $props();

  const index = $derived(Math.min(editor.selectedPoint, editor.mesh.points.length - 1));
</script>

<div class="mesh-editor">
  <label class="row">
    <span>Blend</span>
    <small>Soft</small>
    <input type="range" min="0" max="1" step="0.01" aria-label="Blend" bind:value={editor.mesh.sharpness} />
    <small>Defined</small>
  </label>

  <div class="point-header">
    <span>Point {index + 1} of {editor.mesh.points.length}</span>
    <button
      aria-pressed={editor.adding}
      class:armed={editor.adding}
      disabled={!editor.canAddPoint}
      title={editor.adding ? 'Click on the image to place it (Esc to cancel)' : 'Or double-click the image'}
      onclick={() => (editor.adding = !editor.adding)}>{editor.adding ? 'Click image…' : 'Add point'}</button
    >
  </div>

  <ColorControls bind:color={editor.mesh.points[index].color} label="Point color">
    {#snippet actions()}
      <button
        aria-label="Remove point"
        title="Remove point (Delete)"
        disabled={!editor.canRemovePoint}
        onclick={() => editor.removePoint(index)}>Remove</button
      >
    {/snippet}
  </ColorControls>

  <label class="row">
    <span>Size</span>
    <input
      type="range"
      min={MIN_RADIUS}
      max={MAX_RADIUS}
      step="0.005"
      aria-label="Point size"
      bind:value={editor.mesh.points[index].radius}
    />
  </label>

  <button
    class="toggle"
    aria-pressed={!editor.showHandles}
    onclick={() => (editor.showHandles = !editor.showHandles)}
    >{editor.showHandles ? 'Hide points' : 'Show points'} <kbd>H</kbd></button
  >
</div>

<style>
  .mesh-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row > span:first-child {
    width: 60px;
    flex: none;
    color: #aaa;
  }
  .row input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  small {
    font-size: 11px;
    color: #888;
  }
  .point-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #aaa;
    font-size: 12px;
  }
  button {
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 4px 9px;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.armed {
    background: #7ab8ff;
    color: #111;
  }
  .toggle {
    align-self: flex-start;
  }
  kbd {
    font: inherit;
    font-size: 11px;
    opacity: 0.6;
    margin-left: 4px;
  }
</style>
