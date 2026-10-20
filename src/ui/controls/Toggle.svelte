<script lang="ts">
  interface Props {
    checked: boolean;
    label?: string;
    ariaLabel: string;
    title?: string;
    onchange: (checked: boolean) => void;
  }

  let { checked, label = '', ariaLabel, title, onchange }: Props = $props();
</script>

<button aria-label={ariaLabel} aria-pressed={checked} {title} onclick={() => onchange(!checked)}
  >{checked ? '[x]' : '[ ]'}{label ? ` ${label}` : ''}</button
>

<style>
  button[aria-pressed='true'] {
    color: var(--ink);
  }
</style>
