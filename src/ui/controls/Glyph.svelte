<script lang="ts">
  import { GLYPHS, GLYPH_BOX, type GlyphName } from './glyphs';

  interface Props {
    name: GlyphName;
    /** Rendered size in px; the stroke scales with it, so keep it near the 14px grid. */
    size?: number;
  }

  /** Static SVG markup from `glyphs.ts`, never user input. */
  let { name, size = GLYPH_BOX }: Props = $props();
</script>

<svg class="glyph" viewBox="0 0 {GLYPH_BOX} {GLYPH_BOX}" width={size} height={size} aria-hidden="true">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html GLYPHS[name]}
</svg>

<style>
  .glyph {
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
