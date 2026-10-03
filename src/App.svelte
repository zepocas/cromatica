<script lang="ts">
  import { exportImage } from './export/exporter';
  import type { ExportFormat, ExportProgress } from './export/types';
  import ControlPanel from './ui/ControlPanel.svelte';
  import { EditorState } from './ui/editor.svelte';
  import MeshOverlay from './ui/MeshOverlay.svelte';
  import Preview from './ui/Preview.svelte';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './ui/presets';

  // Class instance (not proxied); $state only so it can be bound down the panel tree.
  // Opens on a shuffled design; `?default` starts from the built-in one (tests).
  let editor = $state(new EditorState({ shuffle: !new URLSearchParams(location.search).has('default') }));
  let presetId = $state('studio');
  let customWidth = $state(1920);
  let customHeight = $state(1080);
  let format = $state<ExportFormat>('png');
  let collapsed = $state(false);
  let exporting = $state(false);
  let progress = $state<ExportProgress | null>(null);
  let error = $state('');
  let abort: AbortController | null = null;

  const output = $derived.by(() => {
    const preset = DEVICE_PRESETS.find((p) => p.id === presetId);
    return presetId === CUSTOM_PRESET_ID || !preset
      ? { width: customWidth, height: customHeight }
      : { width: preset.width, height: preset.height };
  });

  const renderDesign = $derived(editor.design);
  const aspect = $derived(output.width / output.height);
  $effect(() => {
    editor.aspect = aspect;
  });

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function startExport() {
    if (exporting) return;
    const ac = new AbortController();
    abort = ac;
    const size = { ...output };
    const fmt = format;
    exporting = true;
    progress = { tilesDone: 0, tilesTotal: 0 };
    error = '';
    try {
      const blob = await exportImage(
        { design: renderDesign, output: size, format: fmt },
        { signal: ac.signal, onProgress: (p) => (progress = p) },
      );
      download(blob, `gradient-${size.width}x${size.height}.${fmt === 'png' ? 'png' : 'jpg'}`);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      exporting = false;
      progress = null;
      abort = null;
    }
  }

  function cancelExport() {
    abort?.abort();
  }
</script>

<Preview design={renderDesign} {aspect} paused={exporting} docked={!collapsed}>
  {#snippet overlay()}
    {#if editor.kind === 'mesh'}
      <MeshOverlay {editor} {aspect} />
    {/if}
  {/snippet}
</Preview>
<ControlPanel
  bind:editor
  bind:presetId
  bind:customWidth
  bind:customHeight
  {output}
  bind:format
  bind:collapsed
  {exporting}
  {progress}
  {error}
  onexport={startExport}
  oncancel={cancelExport}
/>
