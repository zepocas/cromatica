<script lang="ts">
  import { defaultDesign, type Design } from './design/design';
  import { exportImage } from './export/exporter';
  import type { ExportFormat, ExportProgress } from './export/types';
  import ControlPanel from './ui/ControlPanel.svelte';
  import Preview from './ui/Preview.svelte';
  import { CUSTOM_PRESET_ID, DEVICE_PRESETS } from './ui/presets';

  let design = $state<Design>(structuredClone(defaultDesign));
  let presetId = $state('studio');
  let customWidth = $state(1920);
  let customHeight = $state(1080);
  let format = $state<ExportFormat>('png');
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

  // Plain (non-proxy) copy with stops sorted, as the renderer and worker expect.
  const renderDesign = $derived.by(() => {
    const d = $state.snapshot(design) as Design;
    d.base.stops.sort((a, b) => a.position - b.position);
    return d;
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

<Preview design={renderDesign} aspect={output.width / output.height} paused={exporting} />
<ControlPanel
  bind:design
  bind:presetId
  bind:customWidth
  bind:customHeight
  bind:format
  {exporting}
  {progress}
  {error}
  onexport={startExport}
  oncancel={cancelExport}
/>
