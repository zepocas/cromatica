<script lang="ts">
  import { PALETTE_MOODS, type ValueKey } from '../color/harmony';
  import type { Temperature } from '../color/temperature';
  import Choice from './controls/Choice.svelte';
  import Dropdown from './controls/Dropdown.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { PaletteEditor } from './palette.svelte';

  interface Props {
    palette: PaletteEditor;
    /** Hue of the selected color, for anchoring the base hue on it. */
    selectedHue: number;
  }

  let { palette, selectedHue }: Props = $props();

  const KEY_OPTIONS: { value: ValueKey; label: string }[] = [
    { value: 'high', label: 'high (light)' },
    { value: 'full', label: 'full range' },
    { value: 'low', label: 'low (dark)' },
  ];

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

<div class="row">
  <span>mood</span>
  <Dropdown
    ariaLabel="Mood"
    value={palette.info?.mood ?? ''}
    placeholder="custom"
    options={PALETTE_MOODS.map((m) => ({ value: m }))}
    onchange={(m) => palette.setMood(m)}
  />
</div>
<div class="row">
  <span>key</span>
  <Dropdown
    ariaLabel="Value key"
    title="Where the palette sits on the lightness scale"
    value={palette.info?.key ?? ''}
    placeholder="custom"
    options={KEY_OPTIONS}
    onchange={(k) => palette.setKey(k)}
  />
</div>
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
