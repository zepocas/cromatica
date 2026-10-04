<script lang="ts">
  import type { PaletteMood, ValueKey } from '../color/harmony';
  import type { Temperature } from '../color/temperature';
  import Choice from './controls/Choice.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { PaletteEditor } from './palette.svelte';

  interface Props {
    palette: PaletteEditor;
    /** Hue of the selected color, for anchoring the base hue on it. */
    selectedHue: number;
  }

  let { palette, selectedHue }: Props = $props();

  const TEMPERATURES: { value: Temperature; title: string }[] = [
    { value: 'off', title: 'Colors as they are' },
    {
      value: 'warm',
      title: 'Warm light, cool shadows: light colors turn toward amber, dark ones toward blue (sunset, lamplight)',
    },
    {
      value: 'cool',
      title: 'Cool light, warm shadows: light colors turn toward blue, dark ones toward amber (overcast, moonlight)',
    },
  ];
</script>

<label class="row">
  <span>mood</span>
  <select
    aria-label="Mood"
    value={palette.info?.mood ?? ''}
    onchange={(e) => palette.setMood(e.currentTarget.value as PaletteMood)}
  >
    {#if !palette.info}<option value="" disabled>custom</option>{/if}
    <option value="natural">natural</option>
    <option value="vivid">vivid</option>
  </select>
</label>
<label class="row">
  <span>key</span>
  <select
    aria-label="Value key"
    title="Where the palette sits on the lightness scale"
    value={palette.info?.key ?? ''}
    onchange={(e) => palette.setKey(e.currentTarget.value as ValueKey)}
  >
    {#if !palette.info}<option value="" disabled>custom</option>{/if}
    <option value="high">high (light)</option>
    <option value="full">full range</option>
    <option value="low">low (dark)</option>
  </select>
</label>
<Choice
  label="temp"
  ariaLabel="Temperature"
  options={TEMPERATURES}
  value={palette.temperature}
  onchange={(t) => palette.setTemperature(t)}
/>
<div class="row">
  <span>base hue</span>
  <Toggle
    checked={palette.baseHue !== null}
    ariaLabel="Fix base hue"
    title="Fix a base hue: new palettes are built around it, and moving it turns the current palette"
    onchange={(on) => palette.setBaseHueEnabled(on, selectedHue)}
  />
  <input
    class="hue"
    type="range"
    min="0"
    max="359"
    step="1"
    aria-label="Base hue"
    disabled={palette.baseHue === null}
    value={palette.baseHue ?? 0}
    oninput={(e) => palette.setBaseHue(e.currentTarget.valueAsNumber)}
  />
  <button
    class="icon"
    aria-label="Base hue from selected color"
    title="Use the selected color's hue"
    onclick={() => palette.setBaseHueEnabled(true, selectedHue)}>⌖</button
  >
</div>
