<script lang="ts">
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
  {#if display}<output>{display(value)}</output>{/if}
</label>
