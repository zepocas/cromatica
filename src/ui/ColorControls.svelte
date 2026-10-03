<script lang="ts">
  import type { Oklch } from '../design/design';

  interface Props {
    /** Edited in place. */
    color: Oklch;
  }

  let { color = $bindable() }: Props = $props();
</script>

<label class="row">
  <span>lightness</span>
  <input type="range" min="0" max="1" step="0.001" bind:value={color[0]} />
</label>
<label class="row">
  <span>intensity</span>
  <input type="range" min="0" max="0.37" step="0.001" bind:value={color[1]} />
</label>
<label class="row">
  <span>hue</span>
  <input type="range" min="0" max="360" step="0.5" bind:value={color[2]} />
</label>
