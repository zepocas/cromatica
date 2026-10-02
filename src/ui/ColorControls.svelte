<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Oklch } from '../design/design';
  import { hexToOklch, inSrgbGamut, oklchToHex } from '../color/oklab';

  interface Props {
    /** Edited in place (sliders) or replaced (picker). */
    color: Oklch;
    /** Accessible name of the color picker, e.g. "Stop color". */
    label: string;
    /** Extra controls on the picker row (e.g. a Remove button). */
    actions?: Snippet;
  }

  let { color = $bindable(), label, actions }: Props = $props();

  const outOfGamut = $derived(!inSrgbGamut(color));
</script>

<div class="color-controls">
  <div class="row">
    <input
      type="color"
      aria-label={label}
      value={oklchToHex(color)}
      oninput={(e) => (color = hexToOklch(e.currentTarget.value))}
    />
    {#if outOfGamut}
      <span class="gamut" title="This color can't be shown exactly; the closest displayable color is used.">
        Out of sRGB — will be mapped
      </span>
    {/if}
    {#if actions}
      <span class="actions">{@render actions()}</span>
    {/if}
  </div>
  <label class="row">
    <span>Lightness</span>
    <input type="range" min="0" max="1" step="0.001" bind:value={color[0]} />
  </label>
  <label class="row">
    <span>Intensity</span>
    <input type="range" min="0" max="0.37" step="0.001" bind:value={color[1]} />
  </label>
  <label class="row">
    <span>Hue</span>
    <input type="range" min="0" max="360" step="0.5" bind:value={color[2]} />
  </label>
</div>

<style>
  .color-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
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
  input[type='color'] {
    width: 32px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    flex: none;
  }
  .gamut {
    font-size: 11px;
    color: #f0c674;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 6px;
  }
</style>
