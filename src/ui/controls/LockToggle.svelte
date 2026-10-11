<script lang="ts">
  interface Props {
    /** Locked: shuffling leaves it alone. */
    locked: boolean;
    label: string;
    ariaLabel: string;
    title?: string;
    onchange: (locked: boolean) => void;
  }

  let { locked, label, ariaLabel, title, onchange }: Props = $props();
</script>

<!-- A padlock, shut when shuffling leaves the part alone and open when it doesn't. -->
<button class="lock" aria-label={ariaLabel} aria-pressed={locked} {title} onclick={() => onchange(!locked)}>
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1" fill={locked ? 'currentColor' : 'none'} />
    <path d={locked ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 5.6-1.5'} fill="none" />
  </svg>
  {label}
</button>

<style>
  .lock {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .lock[aria-pressed='true'] {
    color: var(--ink);
  }
</style>
