<script lang="ts">
  import { PALETTE_MOODS, type ValueKey } from '../color/harmony';
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
