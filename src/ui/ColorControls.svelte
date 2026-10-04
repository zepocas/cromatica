<script lang="ts">
  import type { Oklch } from '../color/types';

  interface Props {
    color: Oklch;
    /** Called with the whole new color (the editor may move others along with it). */
    onchange: (color: Oklch) => void;
  }

  let { color, onchange }: Props = $props();

  function set(k: 0 | 1 | 2, v: number) {
    const next: Oklch = [color[0], color[1], color[2]];
    next[k] = v;
    onchange(next);
  }
</script>

<label class="row">
  <span>lightness</span>
  <input
    type="range"
    aria-label="Lightness"
    min="0"
    max="1"
    step="0.001"
    value={color[0]}
    oninput={(e) => set(0, e.currentTarget.valueAsNumber)}
  />
</label>
<label class="row">
  <span>intensity</span>
  <input
    type="range"
    aria-label="Intensity"
    min="0"
    max="0.37"
    step="0.001"
    value={color[1]}
    oninput={(e) => set(1, e.currentTarget.valueAsNumber)}
  />
</label>
<label class="row">
  <span>hue</span>
  <input
    class="hue"
    type="range"
    aria-label="Hue"
    min="0"
    max="360"
    step="0.5"
    value={color[2]}
    oninput={(e) => set(2, e.currentTarget.valueAsNumber)}
  />
</label>
