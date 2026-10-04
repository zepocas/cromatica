<script lang="ts" generics="T extends string">
  interface Option {
    value: T;
    title?: string;
  }

  interface Props {
    /** Row label, lowercase. */
    label: string;
    /** Accessible name of the group. */
    ariaLabel: string;
    options: readonly Option[];
    value: T;
    onchange: (value: T) => void;
  }

  let { label, ariaLabel, options, value, onchange }: Props = $props();
</script>

<!-- One of a few: the active option is bracketed, e.g. off [warm] cool. -->
<div class="row" role="group" aria-label={ariaLabel}>
  <span>{label}</span>
  {#each options as option (option.value)}
    <button aria-pressed={value === option.value} title={option.title} onclick={() => onchange(option.value)}
      >{value === option.value ? `[${option.value}]` : ` ${option.value} `}</button
    >
  {/each}
</div>

<style>
  button[aria-pressed='true'] {
    color: var(--ink);
  }
</style>
