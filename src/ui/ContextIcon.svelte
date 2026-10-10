<script lang="ts">
  import type { IconSpec } from '../context/icons';

  let { spec }: { spec: IconSpec } = $props();
</script>

{#if spec.shape === 'folder'}
  <svg class="folder {spec.platform}" viewBox="4 2 56 56" data-icon="folder" aria-hidden="true">
    <path class="back" d="M6 14a4 4 0 0 1 4-4h14l6 6h24a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" />
    <rect class="front" x="4" y="22" width="56" height="34" rx="4" />
  </svg>
{:else}
  <span
    class="app {spec.platform}"
    class:dark={spec.dark}
    data-icon="app"
    style:--c={spec.color}
    style:color={spec.color === '#f2f2f7' ? '#555' : '#fff'}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if spec.glyph === 'circle'}
        <circle cx="12" cy="12" r="6" fill="currentColor" />
      {:else if spec.glyph === 'square'}
        <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
      {:else if spec.glyph === 'triangle'}
        <path d="M12 5.5 19 18H5z" fill="currentColor" />
      {:else if spec.glyph === 'bars'}
        <path d="M6 7h12M6 12h12M6 17h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      {:else}
        <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2.6" />
      {/if}
    </svg>
  </span>
{/if}

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .folder.mac .back {
    fill: #2f86d8;
  }
  .folder.mac .front {
    fill: #5bb6f5;
  }
  .folder.win .back {
    fill: #e0a82e;
  }
  .folder.win .front {
    fill: #fdd562;
  }
  .app {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    background: var(--c);
  }
  .app svg {
    position: relative;
    padding: 18%;
    box-sizing: border-box;
  }
  /* macOS: a squircle with a soft top-lit gloss and a drop shadow. */
  .app.mac {
    border-radius: 23%;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--c) 82%, #fff),
      var(--c) 55%,
      color-mix(in srgb, var(--c) 82%, #000)
    );
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.35),
      inset 0 0 0 0.5px rgb(255 255 255 / 0.25);
  }
  .app.mac::after {
    content: '';
    position: absolute;
    inset: 0 0 50%;
    border-radius: 23% 23% 40% 40% / 23% 23% 20% 20%;
    background: linear-gradient(to bottom, rgb(255 255 255 / 0.4), rgb(255 255 255 / 0.05));
  }
  /* Windows 11: flat, slightly rounded, no gloss. */
  .app.win {
    border-radius: 18%;
  }
  .app.dark {
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.28);
  }
</style>
