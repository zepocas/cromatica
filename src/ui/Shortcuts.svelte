<script lang="ts">
  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';

  const GROUPS: [title: string, keys: [key: string, text: string][]][] = [
    [
      'explore',
      [
        ['space', 'shuffle'],
        ['← →', 'step back and forward through recent shuffles'],
        ['m', 'more like this: variations of the current design'],
        ['[ ]', 'previous and next warp shape'],
        ['1 2 3', 'keep colors, pattern, adjust (toggle)'],
      ],
    ],
    [
      'keep',
      [
        ['k', 'add or remove the current design in favourites (♡)'],
        [`${mod}Z`, 'undo'],
        [`${mod}${mac ? '⇧Z' : 'Y'}`, 'redo'],
        [`${mod}S`, 'download'],
      ],
    ],
    [
      'view',
      [
        ['f', 'full screen (Esc leaves)'],
        ['p', 'collapse or expand the panel'],
        ['h', 'show or hide points and nodes'],
        ['0', 'fit the view after zooming'],
        ['?', 'this list'],
      ],
    ],
  ];

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<aside class="panel shortcuts" aria-label="Shortcuts">
  <h2>shortcuts</h2>
  {#each GROUPS as [title, keys] (title)}
    <dl>
      <dt class="group">{title}</dt>
      <dd class="group"></dd>
      {#each keys as [key, text] (key)}
        <dt><kbd>{key}</kbd></dt>
        <dd>{text}</dd>
      {/each}
    </dl>
  {/each}
  <button class="btn strong" onclick={onclose}>close</button>
</aside>

<style>
  .shortcuts {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 10;
    width: 420px;
    max-width: calc(100vw - 48px);
    box-sizing: border-box;
    padding: 8px 13px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
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
  dt.group {
    grid-column: 1 / -1;
    color: var(--dim);
  }
  dd.group {
    display: none;
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
