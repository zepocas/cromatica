<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { Design } from '../design/design';
  import { createPreview, type PreviewController } from '../preview/preview';

  interface Props {
    design: Design;
    aspect: number;
    paused?: boolean;
    /** Rendered over the canvas, in a box that matches its displayed rect exactly. */
    overlay?: Snippet;
    /** Leave room for the docked sidebar (--sidebar) on the left. */
    docked?: boolean;
  }

  let { design, aspect, paused = false, overlay, docked = false }: Props = $props();

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

<div class="viewport" class:docked bind:this={container}>
  <!-- The frame hugs the letterboxed canvas, so the overlay shares its rect. -->
  <div class="frame">
    <canvas bind:this={canvas} data-testid="preview-canvas"></canvas>
    {@render overlay?.()}
  </div>
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
  .viewport.docked {
    inset: 24px 24px 24px calc(var(--sidebar) + 24px);
  }
  .frame {
    position: relative;
    flex: none;
    /* Keeps the radius ring of a big point inside the frame. */
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
