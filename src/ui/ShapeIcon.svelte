<script lang="ts">
  import { ICON_HEIGHT, ICON_WIDTH } from './shapeIcons';

  /** Static SVG markup from `shapeIcons.ts`. */
  let { body }: { body: string } = $props();
</script>

<svg
  class="shape-icon"
  viewBox="0 0 {ICON_WIDTH} {ICON_HEIGHT}"
  width={ICON_WIDTH}
  height={ICON_HEIGHT}
  aria-hidden="true">{@html body}</svg
>
