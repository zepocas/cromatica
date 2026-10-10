<script lang="ts">
  import { iconFor, labelFor } from '../context/icons';
  import { assessZone, luminanceMap, type Legibility } from '../context/legibility';
  import { placeZone, type ContextScreen } from '../context/zones';
  import { noFinish, type Design } from '../design/design';
  import { thumbnails } from '../preview/thumbnails';
  import ContextIcon from './ContextIcon.svelte';

  interface Props {
    design: Design;
    aspect: number;
    screen: ContextScreen;
  }

  let { design, aspect, screen }: Props = $props();

  /** Tall enough for clock-sized detail, small enough to redo on every edit. */
  const ANALYSIS_HEIGHT = 256;
  const ANALYSIS_DELAY = 150;

  let analysis: HTMLCanvasElement;
  /** Per zone, for the screen it was measured on, so another screen's verdicts never show. */
  let legibility = $state<{ screen: string; verdicts: (Legibility | null)[] } | null>(null);

  const placed = $derived(screen.zones.map((z) => ({ zone: z, rect: placeZone(screen, z, aspect) })));
  const verdicts = $derived(legibility?.screen === screen.id ? legibility.verdicts : []);

  $effect(() => {
    const id = screen.id;
    const zones = placed;
    // Pixel-sized textures don't matter at text size, and their dots would count as the worst pixels.
    const calm: Design = {
      ...design,
      finish: { ...noFinish, ...design.finish, noise: noFinish.noise },
    };
    const timer = setTimeout(() => {
      analysis.width = Math.max(2, Math.round(ANALYSIS_HEIGHT * aspect));
      analysis.height = ANALYSIS_HEIGHT;
      const ctx = analysis.getContext('2d', { willReadFrequently: true });
      thumbnails().draw(analysis, calm, () => {
        if (!ctx) return;
        const { data, width, height } = ctx.getImageData(0, 0, analysis.width, analysis.height);
        const map = luminanceMap(data, width, height);
        legibility = {
          screen: id,
          verdicts: zones.map(({ zone, rect }) => (zone.check ? assessZone(map, rect, zone.kind === 'clock') : null)),
        };
      });
    }, ANALYSIS_DELAY);
    return () => {
      clearTimeout(timer);
      thumbnails().cancel(analysis);
    };
  });

  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
</script>

<canvas class="analysis" bind:this={analysis}></canvas>
<div class="context" data-testid="context-overlay">
  {#each placed as { zone, rect }, i (i)}
    {@const verdict = verdicts[i]}
    {@const source = zone.follows ? verdicts[screen.zones.findIndex((z) => z.label === zone.follows)] : verdict}
    <div
      class="zone {zone.kind}"
      class:checked={zone.check}
      class:warn={verdict?.midtone}
      class:dark-text={source?.text === 'black'}
      data-zone={zone.label}
      data-warn={verdict?.midtone ? 'mid-tone' : ''}
      data-contrast={verdict?.contrast.toFixed(2)}
      style:left={pct(rect.x)}
      style:top={pct(rect.y)}
      style:width={pct(rect.w)}
      style:height={pct(rect.h)}
      style:border-radius={zone.radius ? `${pct(zone.radius / zone.w)} / ${pct(zone.radius / zone.h)}` : null}
    >
      {#if zone.grid}
        {@const g = zone.grid}
        <div
          class="grid"
          style:grid-template-columns="repeat({g.cols}, 1fr)"
          style:grid-template-rows="repeat({g.rows}, 1fr)"
        >
          {#each { length: g.cols * g.rows } as _, k (k)}
            {@const label = g.set ? labelFor(g.set, k) : null}
            <span class="cell">
              <span class="icon" class:plain={!g.set} style:height="{(100 * g.icon) / zone.h}cqh">
                {#if g.set}<ContextIcon spec={iconFor(g.set, k)} />{/if}
              </span>
              {#if label}
                <span class="label" style:font-size="{1200 / zone.h}cqh">{label}</span>
              {/if}
            </span>
          {/each}
        </div>
      {:else if zone.text}
        <span
          class="text"
          style:font-size="{100 / zone.text.split('\n').length}cqh"
          style:text-align={zone.align ?? 'center'}>{zone.text}</span
        >
      {/if}
      {#if verdict?.midtone}
        <span class="tag" role="status">{zone.label}: mid-tone</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .analysis {
    display: none;
  }
  .context {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      sans-serif;
  }
  .zone {
    position: absolute;
    box-sizing: border-box;
    container-type: size;
  }
  /* The macOS menu bar since 26: frosted glass, no tint of its own. */
  .area {
    backdrop-filter: blur(12px) saturate(1.3);
    -webkit-backdrop-filter: blur(12px) saturate(1.3);
    background: rgb(255 255 255 / 0.05);
  }
  .bar {
    background: rgb(28 28 28 / 0.82);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .dock,
  .widget {
    background: rgb(255 255 255 / 0.16);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .widget {
    background: rgb(255 255 255 / 0.2);
  }
  .cutout {
    background: #000;
  }
  .indicator {
    background: rgb(255 255 255 / 0.85);
  }
  .text {
    display: block;
    line-height: 1;
    white-space: pre;
    font-weight: 600;
    text-align: center;
    color: #fff;
    text-shadow: 0 0 0.08em rgb(0 0 0 / 0.25);
  }
  .clock .text {
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .dark-text .text {
    color: #111;
    text-shadow: none;
  }
  .grid {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    min-width: 0;
    max-width: 100%;
  }
  .label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
    color: #fff;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
  }
  .icon {
    aspect-ratio: 1;
  }
  .icon.plain {
    border-radius: 22%;
    background: rgb(255 255 255 / 0.4);
  }
  .checked {
    outline: 1px dotted rgb(255 255 255 / 0.35);
    outline-offset: 2px;
  }
  .warn {
    outline: 1.5px dashed #ffb020;
  }
  .tag {
    position: absolute;
    left: 50%;
    top: calc(100% + 4px);
    transform: translateX(-50%);
    padding: 1px 5px;
    white-space: nowrap;
    font:
      calc(11px / var(--zoom, 1)) / 1.4 ui-monospace,
      monospace;
    color: #000;
    background: #ffb020;
  }
</style>
