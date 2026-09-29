<script lang="ts">
  import { untrack } from 'svelte';
  import type { Design } from '../design/design';
  import { createPreview, type PreviewController } from '../preview/preview';

  interface Props {
    design: Design;
    aspect: number;
    paused?: boolean;
  }

  let { design, aspect, paused = false }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let controller: PreviewController | null = null;
  let error = $state('');

  $effect(() => {
    try {
      controller = createPreview(canvas, untrack(() => design), {
        container,
        aspect: untrack(() => aspect),
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return () => {
      controller?.dispose();
      controller = null;
    };
  });

  $effect(() => controller?.setDesign(design));
  $effect(() => controller?.setAspect(aspect));
  $effect(() => controller?.setPaused(paused));
</script>

<div class="viewport" bind:this={container}>
  <canvas bind:this={canvas} data-testid="preview-canvas"></canvas>
  {#if error}
    <p class="error">Preview unavailable: {error}</p>
  {/if}
</div>

<style>
  .viewport {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  canvas {
    display: block;
  }
  .error {
    position: absolute;
    color: #f88;
  }
</style>
