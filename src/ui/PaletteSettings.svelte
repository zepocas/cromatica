<script lang="ts">
  import { PALETTE_MOODS, type ValueKey } from '../color/harmony';
  import SliderRow from './controls/SliderRow.svelte';
  import Dropdown from './controls/Dropdown.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { EditorState } from './editor.svelte';

  interface Props {
    editor: EditorState;
    /** Hue of the selected color, for anchoring the base hue on it. */
    selectedHue: number;
  }

  let { editor, selectedHue }: Props = $props();

  const palette = $derived(editor.palette);
  const signed = (v: number) => (Math.round(v) > 0 ? '+' : '') + Math.round(v);

  const KEY_OPTIONS: { value: ValueKey; label: string }[] = [
    { value: 'high', label: 'high (light)' },
    { value: 'full', label: 'full range' },
    { value: 'low', label: 'low (dark)' },
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
    onactive={(m) => editor.previewChange(m && m !== palette.info?.mood ? (t) => t.palette.setMood(m) : null)}
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
    onactive={(k) => editor.previewChange(k && k !== palette.info?.key ? (t) => t.palette.setKey(k) : null)}
  />
</div>
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
<SliderRow
  label="brightness"
  title="Lighten or darken the whole palette"
  min={-1}
  max={1}
  step={0.01}
  value={palette.grade.brightness}
  display={(v) => signed(v * 100)}
  oninput={(v) => palette.setBrightness(v)}
/>
<SliderRow
  label="contrast"
  title="Spread the colors' lightness apart, or squeeze it together"
  min={-1}
  max={1}
  step={0.01}
  value={palette.grade.contrast}
  display={(v) => signed(v * 100)}
  oninput={(v) => palette.setContrast(v)}
/>
<SliderRow
  label="saturation"
  title="Mute the colors toward gray, or make them more intense"
  min={-1}
  max={1}
  step={0.01}
  value={palette.grade.saturation}
  display={(v) => signed(v * 100)}
  oninput={(v) => palette.setSaturation(v)}
/>
