<script lang="ts">
  interface Props {
    onclose: () => void;
    /** Swap this card for the list of every key. */
    onkeys: () => void;
  }

  let { onclose, onkeys }: Props = $props();

  const TIPS: [key: string, text: string][] = [
    ['space', 'start with shuffles; k keeps the ones you like'],
    ['q w r', 'q: new pattern and adjust, same colors. w: only the colors. r: swap the colors around'],
    ['m', 'more like this: variations of the current design'],
    ['← →', 'step back through recent shuffles'],
    ['?', 'every keyboard shortcut'],
    ['↑↓ hover', "preview a list's options on the canvas, click to choose"],
    ['+ advanced', 'plenty more settings at the end of each section'],
    [
      'harmony',
      'shuffled palettes follow a rule: analogous (calm neighbours on the color wheel), complementary (punchy opposites), triadic and tetradic (evenly spread). Pick it in the colors section; linked keeps it as you change a color',
    ],
    ['o', 'preview with your OS on top, and a warning where the clock or icons would be hard to read'],
    ['share', 'the share link button copies a link to the design, not the image; whoever opens it can edit it'],
    ['e', 'export the image'],
    [
      'png jpg',
      'exports keep the design: drop a PNG or JPEG back here to keep editing (any other image gives its colors). A service that re-encodes the file strips it',
    ],
  ];
</script>

<aside class="panel tips" aria-label="Tips">
  <h2>tips and tricks</h2>
  <dl>
    {#each TIPS as [key, text] (key)}
      <dt><kbd>{key}</kbd></dt>
      <dd>{text}</dd>
    {/each}
  </dl>
  <div class="foot">
    <button class="btn" onclick={onkeys}>all keys</button>
    <button class="btn strong" onclick={onclose}>got it</button>
  </div>
</aside>

<style>
  .tips {
    position: fixed;
    right: var(--gap-page);
    bottom: var(--gap-page);
    z-index: var(--z-card);
    width: 460px;
    max-width: calc(100vw / var(--ui-scale) - 48px);
    box-sizing: border-box;
    padding: 8px 13px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--rule);
    background: var(--panel-float);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  h2 {
    margin: 0;
    font: inherit;
    color: var(--ink);
  }
  h2::before {
    content: '~/';
    color: var(--dim);
  }
  dl {
    display: grid;
    grid-template-columns: 9ch 1fr;
    gap: 2px 8px;
    margin: 0;
  }
  dt,
  dd {
    margin: 0;
  }
  kbd {
    font: inherit;
    color: var(--ink);
  }
  .foot {
    display: flex;
    justify-content: space-between;
  }
  .strong {
    color: var(--ink);
  }
</style>
