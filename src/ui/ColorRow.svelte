<script lang="ts">
  import { inSrgbGamut } from '../color/gamut';
  import { hexToOklch, oklchToHex } from '../color/hex';
  import type { Oklch } from '../color/types';

  interface Props {
    /** Index of the point or stop. */
    index: number;
    color: Oklch;
    /** The color before base hue and temperature; undefined when not adjusted. */
    original: Oklch | undefined;
    selected: boolean;
    /** What the row is called: "point 3" or a stop's position, "40%". */
    name: string;
    /** "point" or "stop". */
    noun: string;
    canRemove: boolean;
    onselect: () => void;
    onchange: (color: Oklch) => void;
    onremove: () => void;
  }

  let { index, color, original, selected, name, noun, canRemove, onselect, onchange, onremove }: Props = $props();

  const hexOf = (c: Oklch) => oklchToHex(c).toUpperCase();
  const hex = $derived(hexOf(color));
  const adjusted = $derived(
    !!original && (original[0] !== color[0] || original[1] !== color[1] || original[2] !== color[2]),
  );

  function onHexChange(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    try {
      onchange(hexToOklch(input.value));
    } catch {
      // Not a hex color: show the current one again.
    }
    input.value = hex;
  }
</script>

<li class:selected>
  <input
    type="color"
    aria-label="Color {index + 1}"
    value={hex}
    style:--swatch={hex}
    onfocus={onselect}
    oninput={(e) => onchange(hexToOklch(e.currentTarget.value))}
  />
  <input
    class="hex"
    type="text"
    spellcheck="false"
    autocomplete="off"
    maxlength="7"
    aria-label="Hex of color {index + 1}"
    value={hex}
    onfocus={onselect}
    onchange={onHexChange}
  />
  {#if adjusted && original}
    <span class="mod" title="Adjusted from {hexOf(original)}">~</span>
  {/if}
  {#if !inSrgbGamut(color)}
    <span class="gamut" title="This color can't be shown exactly; the closest displayable color is used.">!</span>
  {/if}
  <button class="select" aria-label="Edit color {index + 1}" aria-pressed={selected} onclick={onselect}>{name}</button>
  <button
    class="icon"
    aria-label="Remove color {index + 1}"
    title="Remove this {noun}"
    disabled={!canRemove}
    onclick={onremove}>×</button
  >
</li>

<style>
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
  .mod {
    color: var(--ink);
    cursor: help;
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
</style>
