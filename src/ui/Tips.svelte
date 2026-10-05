<script lang="ts">
  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const TIPS: [key: string, text: string][] = [
    ['space', 'start with shuffles; ♡ keeps the ones you like'],
    ['← →', 'step back through recent shuffles'],
    ['m', 'more like this: variations of the current design'],
    ['↑↓ hover', "preview a list's options on the canvas, click to choose"],
    ['+ more', 'plenty of advanced settings in each section'],
    ['png', 'exports keep the design: drop one back here to keep editing (any other image gives its colors)'],
  ];
</script>

<aside class="panel tips" aria-label="Tips">
  <h2>tips</h2>
  <dl>
    {#each TIPS as [key, text] (key)}
      <dt><kbd>{key}</kbd></dt>
      <dd>{text}</dd>
    {/each}
  </dl>
  <button class="strong" onclick={onclose}>[ got it ]</button>
</aside>

<style>
  .tips {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 10;
    width: 460px;
    max-width: calc(100vw - 48px);
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
  .strong {
    align-self: flex-end;
    color: var(--ink);
  }
</style>
