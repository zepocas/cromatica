<script lang="ts">
  import { CONTEXT_SCREENS } from '../context/screens';
  import Dropdown from './controls/Dropdown.svelte';
  import Toggle from './controls/Toggle.svelte';
  import type { EditorState } from './editor.svelte';
  import Section from './Section.svelte';

  interface Props {
    editor: EditorState;
    /** The OS screen drawn over the preview; '' = none. */
    contextId: string;
    crops: boolean;
    /** Portrait outputs list the phone screens first. */
    portrait: boolean;
  }

  let { editor = $bindable(), contextId = $bindable(), crops = $bindable(), portrait }: Props = $props();

  const OFF = 'off';
  const options = $derived.by(() => {
    const first = portrait ? 'mobile' : 'desktop';
    const screens = [...CONTEXT_SCREENS].sort((a, b) => Number(a.group !== first) - Number(b.group !== first));
    return [
      { value: OFF, label: 'off' },
      ...screens.map((s) => ({ value: s.id, label: s.label, group: s.group, title: `${s.device}, ${s.os}` })),
    ];
  });
</script>

<Section title="view">
  <div class="row">
    <span>context</span>
    <Dropdown
      ariaLabel="Context"
      value={contextId || OFF}
      {options}
      onchange={(id) => (contextId = id === OFF ? '' : id)}
      title="Show the OS on top of the image, and warn where its text would be hard to read"
    />
  </div>
  <div class="row">
    <span>show</span>
    <Toggle
      checked={crops}
      label="crops"
      ariaLabel={`${crops ? 'Hide' : 'Show'} crops`}
      title="Outline how narrower screens crop the image"
      onchange={(on) => (crops = on)}
    />
    {#if editor.kind === 'mesh' || editor.kind === 'grid'}
      {@const handles = editor.kind === 'mesh' ? 'points' : 'nodes'}
      <Toggle
        checked={editor.showHandles}
        label={handles}
        ariaLabel={`${editor.showHandles ? 'Hide' : 'Show'} ${handles}`}
        title={`Show or hide the ${handles} on the image (H)`}
        onchange={(on) => (editor.showHandles = on)}
      />
    {/if}
  </div>
</Section>
