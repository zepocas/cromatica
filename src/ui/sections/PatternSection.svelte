<script lang="ts">
  import { WARP_SHAPES, type WarpShape } from '../../design/design';
  import Dropdown from '../controls/Dropdown.svelte';
  import { PATTERN_KINDS, type EditorState } from '../state/editor.svelte';
  import { MAX_SIZE, type ExportSettings } from '../state/export-settings.svelte';
  import { CUSTOM_PRESET_ID, PRESET_GROUPS, presetLabel, SIZE_PRESETS } from '../state/presets';
  import Section from '../controls/Section.svelte';
  import ShapeIcon from '../controls/ShapeIcon.svelte';
  import { PATTERN_ICONS, WARP_ICONS } from '../controls/shapeIcons';

  interface Props {
    editor: EditorState;
    exportSettings: ExportSettings;
  }

  // Bindable so child bindings into the editor's state pass Svelte's ownership checks.
  let { editor = $bindable(), exportSettings }: Props = $props();

  const SIZE_OPTIONS = [
    ...PRESET_GROUPS.flatMap((group) =>
      SIZE_PRESETS.filter((p) => p.group === group).map((p) => ({ value: p.id, label: presetLabel(p), group })),
    ),
    { value: CUSTOM_PRESET_ID, label: 'custom' },
  ];

  const PATTERNS = PATTERN_KINDS.map((kind) => ({ kind, label: kind === 'grid' ? 'net' : kind }));

  const WARP_LABELS: Record<WarpShape, string> = {
    none: 'none',
    domain: 'liquid',
    fbm: 'fbm',
    simplex: 'simplex',
    waves: 'waves',
    rows: 'rows',
    columns: 'columns',
    circular: 'ripples',
    oval: 'swirl',
    worley: 'worley',
    voronoi: 'facets',
    curl: 'flow',
    ridged: 'silk',
    marble: 'marble',
    bristle: 'brushed',
  };
</script>

{#snippet patternIcon(kind: string)}<ShapeIcon body={PATTERN_ICONS[kind] ?? ''} />{/snippet}
{#snippet warpIcon(shape: WarpShape)}<ShapeIcon body={WARP_ICONS[shape]} />{/snippet}

<Section title="pattern">
  <div class="row">
    <span>gradient</span>
    <Dropdown
      ariaLabel="Gradient"
      title="Previous and next gradient (L ;)"
      value={editor.kind}
      options={PATTERNS.map((p) => ({ value: p.kind, label: p.label }))}
      onchange={(k) => (editor.kind = k)}
      icon={patternIcon}
      onactive={(k) => editor.previewChange(k && k !== editor.kind ? (t) => (t.kind = k) : null)}
    />
    <span class="slot"></span>
  </div>
  <div class="row">
    <label for="warp-shape">warp shape</label>
    <Dropdown
      id="warp-shape"
      ariaLabel="Warp shape"
      title="Previous and next shape (, .)"
      value={editor.warp.shape}
      options={WARP_SHAPES.map((s) => ({ value: s, label: WARP_LABELS[s] }))}
      onchange={(s) => (editor.warp.shape = s)}
      icon={warpIcon}
      onactive={(s) => editor.previewChange(s && s !== editor.warp.shape ? (t) => (t.warp.shape = s) : null)}
    />
    <button
      class="icon slot"
      aria-label="New variation"
      title="New variation of this shape (V)"
      disabled={editor.warp.shape === 'none'}
      data-seed={editor.warp.seed}
      onclick={() => editor.newWarpVariation()}>⚄</button
    >
  </div>
  <div class="row">
    <span>size</span>
    <Dropdown
      ariaLabel="Size preset"
      value={exportSettings.presetId}
      options={SIZE_OPTIONS}
      onchange={(id) => exportSettings.choosePreset(id)}
      onactive={(id) => (exportSettings.presetPreview = id)}
    />
    <span class="slot"></span>
  </div>
  {#if exportSettings.presetId === CUSTOM_PRESET_ID}
    <div class="row">
      <span></span>
      <input
        type="number"
        min="1"
        max={MAX_SIZE}
        aria-label="Width"
        value={exportSettings.size.width}
        onchange={(e) => exportSettings.setCustom('width', e.currentTarget.valueAsNumber)}
      />
      <span class="dim">×</span>
      <input
        type="number"
        min="1"
        max={MAX_SIZE}
        aria-label="Height"
        value={exportSettings.size.height}
        onchange={(e) => exportSettings.setCustom('height', e.currentTarget.valueAsNumber)}
      />
    </div>
  {/if}
</Section>

<style>
  .dim {
    color: var(--dim);
  }
  /* The variation button's place, kept empty in the other rows so every dropdown here ends at the same x.
     A fixed width: the glyph comes from whichever font has it, and its own width differs by OS. */
  .slot {
    box-sizing: border-box;
    flex: none;
    width: 22px;
    padding: 0;
  }
</style>
