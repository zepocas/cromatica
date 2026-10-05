<script lang="ts" module>
  export interface DropdownOption<T extends string> {
    value: T;
    /** Shown text; the value when omitted. */
    label?: string;
    /** Options with the same group sit under one heading. */
    group?: string;
    title?: string;
  }

  /** Renders the list at the end of <body>, so the panel's scroll and backdrop don't clip or offset it. */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<script lang="ts" generics="T extends string">
  // An in-page replacement for <select>: native popups can't be sized, and
  // Firefox-based browsers scroll lists that would fit.

  interface Props {
    ariaLabel: string;
    value: T | '';
    options: readonly DropdownOption<T>[];
    onchange: (value: T) => void;
    /** Shown when the value matches no option (e.g. a custom palette). */
    placeholder?: string;
    disabled?: boolean;
    title?: string;
    id?: string;
  }

  let { ariaLabel, value, options, onchange, placeholder = '', disabled = false, title, id }: Props = $props();

  const uid = $props.id();
  let button: HTMLButtonElement;
  let list = $state<HTMLUListElement>();
  let open = $state(false);
  let active = $state(-1);
  let place = $state({ left: 0, top: 0, minWidth: 0, maxHeight: 0, above: false });

  const current = $derived(options.find((o) => o.value === value));
  const labelOf = (o: DropdownOption<T>) => o.label ?? o.value;

  /** Place the list under the button, or above it when there is more room there. */
  function placeList() {
    const r = button.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - r.bottom - margin;
    const aboveSpace = r.top - margin;
    // Open downward unless the list wouldn't fit there and there is more room above.
    const above = below < options.length * 20 && aboveSpace > below;
    place = {
      left: r.left,
      top: above ? r.top : r.bottom,
      minWidth: r.width,
      maxHeight: above ? aboveSpace : below,
      above,
    };
  }

  function show() {
    placeList();
    active = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    open = true;
  }

  function hide() {
    open = false;
  }

  function pick(i: number) {
    const o = options[i];
    hide();
    if (o && o.value !== value) onchange(o.value);
  }

  /** Jump to the next option whose label starts with `ch`, after the active one. */
  function typeAhead(ch: string) {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (active + k) % n;
      if (labelOf(options[i]).toLowerCase().startsWith(ch)) {
        active = i;
        return;
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) show();
      else return;
    } else if (e.key === 'ArrowDown') active = Math.min(active + 1, last);
    else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
    else if (e.key === 'Home') active = 0;
    else if (e.key === 'End') active = last;
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape') hide();
    else if (e.key === 'Tab') return hide();
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) typeAhead(e.key.toLowerCase());
    else return;
    // Handled here: keep app shortcuts (Space shuffles, arrows nudge points) out of it.
    e.preventDefault();
    e.stopPropagation();
  }

  function onWindowPointerDown(e: PointerEvent) {
    const t = e.target as Node;
    if (open && !button.contains(t) && !list?.contains(t)) hide();
  }

  // Scrolls only the list: scrollIntoView could scroll the panel, which closes the list.
  $effect(() => {
    const el = list?.querySelector<HTMLElement>(`[id="${uid}-${active}"]`);
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
  });
</script>

<svelte:window onpointerdown={onWindowPointerDown} onresize={hide} onblur={hide} />
<svelte:document onscrollcapture={(e) => open && !list?.contains(e.target as Node) && placeList()} />

<button
  bind:this={button}
  type="button"
  class="dropdown"
  role="combobox"
  aria-label={ariaLabel}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-controls={`${uid}-list`}
  aria-activedescendant={open ? `${uid}-${active}` : undefined}
  data-value={value}
  {id}
  {title}
  {disabled}
  onclick={() => (open ? hide() : show())}
  onkeydown={onKeyDown}
  onkeyup={(e) => e.key === ' ' && e.preventDefault()}>{current ? labelOf(current) : placeholder}</button
>

{#if open}
  <ul
    use:portal
    bind:this={list}
    id={`${uid}-list`}
    class="panel dropdown-list"
    class:above={place.above}
    role="listbox"
    style:left="{place.left}px"
    style:top="{place.top}px"
    style:min-width="{place.minWidth}px"
    style:max-height="{place.maxHeight}px"
  >
    {#each options as o, i (o.value)}
      {#if o.group && o.group !== options[i - 1]?.group}
        <li class="group" role="presentation">{o.group}</li>
      {/if}
      <!-- svelte-ignore a11y_click_events_have_key_events (keys are handled on the combobox) -->
      <li
        id={`${uid}-${i}`}
        role="option"
        aria-selected={o.value === value}
        data-value={o.value}
        class:active={i === active}
        title={o.title}
        onpointerdown={(e) => e.preventDefault()}
        onpointermove={() => (active = i)}
        onclick={() => pick(i)}
      >
        {o.value === value ? '› ' : '  '}{labelOf(o)}
      </li>
    {/each}
  </ul>
{/if}
