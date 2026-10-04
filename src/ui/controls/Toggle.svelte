<script lang="ts">
  interface Props {
    checked: boolean;
    /** Text after the box, e.g. "[x] linked". */
    label?: string;
    ariaLabel: string;
    title?: string;
    onchange: (checked: boolean) => void;
  }

  let { checked, label = '', ariaLabel, title, onchange }: Props = $props();
</script>

<!-- A terminal checkbox: [x] / [ ]. -->
<button aria-label={ariaLabel} aria-pressed={checked} {title} onclick={() => onchange(!checked)}
  >{checked ? '[x]' : '[ ]'}{label ? ` ${label}` : ''}</button
>

<style>
  button[aria-pressed='true'] {
    color: var(--ink);
  }
</style>
