<script lang="ts">
  import type { Design } from '../design/design';
  import { thumbnails } from '../preview/thumbnails';

  interface Props {
    design: Design;
    /** Width / height of the frame. */
    aspect: number;
    /** Displayed width in CSS pixels. */
    width: number;
  }

  let { design, aspect, width }: Props = $props();

  let canvas: HTMLCanvasElement;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const pixels = $derived({
    width: Math.max(1, Math.round(width * dpr)),
    height: Math.max(1, Math.round((width / aspect) * dpr)),
  });

  $effect(() => {
    // Resizing clears the canvas, so only when the size really changed.
    if (canvas.width !== pixels.width) canvas.width = pixels.width;
    if (canvas.height !== pixels.height) canvas.height = pixels.height;
    thumbnails().draw(canvas, design);
    return () => thumbnails().cancel(canvas);
  });
</script>

<canvas bind:this={canvas} style:width="{width}px" style:height="{width / aspect}px"></canvas>

<style>
  canvas {
    display: block;
  }
</style>
