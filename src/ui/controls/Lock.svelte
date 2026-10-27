<script lang="ts">
  import { glow } from './glow';

  interface Props {
    checked: boolean;
    ariaLabel: string;
    title?: string;
    /** Registers the button for `glowKey` when it has a shortcut (glow.ts). */
    glowId?: string;
    onchange: (checked: boolean) => void;
  }

  let { checked, ariaLabel, title, glowId, onchange }: Props = $props();
</script>

<!-- A padlock: the shackle swings shut when on, so the state reads at a glance and the change has some motion. -->
<button
  class="lock"
  aria-label={ariaLabel}
  aria-pressed={checked}
  {title}
  onclick={() => onchange(!checked)}
  {@attach glowId ? glow(glowId) : undefined}
>
  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
    <path class="shackle" d="M4 7V4.75a3 3 0 0 1 6 0V7" />
    <rect class="body" x="2" y="7" width="10" height="6" />
  </svg>
</button>

<style>
  .lock {
    display: inline-flex;
    align-items: center;
    flex: none;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linejoin: round;
  }
  .shackle {
    transform-origin: 10px 7px;
    transform: translateY(-1.5px) rotate(-32deg);
    transition: transform 0.18s ease-out;
  }
  .body {
    transition: fill 0.18s ease-out;
  }
  .lock[aria-pressed='true'] {
    color: var(--ink);
  }
  .lock[aria-pressed='true'] .shackle {
    transform: none;
  }
  .lock[aria-pressed='true'] .body {
    fill: currentColor;
  }
</style>
