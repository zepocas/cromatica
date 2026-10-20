<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Row label, lowercase; also the slider's accessible name, capitalized, unless ariaLabel is set. */
    label: string;
    ariaLabel?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    title?: string;
    /** Readout after the slider; none when omitted. */
    display?: (value: number) => string;
    /** Handle input yourself (e.g. a log scale); otherwise `value` is bound. */
    oninput?: (value: number) => void;
    /** Extra controls between the slider and its readout (a dice button, quarter turns). */
    trailing?: Snippet;
    /** Extra controls after the readout. */
    after?: Snippet;
  }

  let {
    label,
    ariaLabel = label[0].toUpperCase() + label.slice(1),
    value = $bindable(),
    min,
    max,
    step,
    disabled = false,
    title,
    display,
    oninput,
    trailing,
    after,
  }: Props = $props();

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    const v = e.currentTarget.valueAsNumber;
    if (oninput) oninput(v);
    else value = v;
  }
</script>

<label class="row">
  <span>{label}</span>
  <input type="range" {min} {max} {step} aria-label={ariaLabel} {disabled} {title} {value} oninput={onInput} />
  {@render trailing?.()}
  {#if display}<output>{display(value)}</output>{/if}
  {@render after?.()}
</label>
