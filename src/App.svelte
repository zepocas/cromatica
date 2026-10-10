<script lang="ts">
  import { readExportedDesign, type ExportedDesign } from './export/design-image';
  import { exportImage } from './export/exporter';
  import type { ExportFormat, ExportProgress } from './export/types';
  import { readAutosave, writeAutosave } from './ui/autosave';
  import ControlPanel from './ui/ControlPanel.svelte';
  import { EditorState, type EditorSnapshot } from './ui/editor.svelte';
  import { Favourites, type Favourite } from './ui/favourites.svelte';
  import { History } from './ui/history.svelte';
  import { isTypingTarget } from './ui/keys';
  import MeshOverlay from './ui/MeshOverlay.svelte';
  import MoreLikeThis from './ui/MoreLikeThis.svelte';
  import GridOverlay from './ui/GridOverlay.svelte';
  import ContextOverlay from './ui/ContextOverlay.svelte';
  import { CONTEXT_SCREENS } from './context/screens';
  import Preview from './ui/Preview.svelte';
  import { dismissTips, markShuffleTried, shuffleTried, tipsDismissed } from './ui/tips';
  import Shortcuts from './ui/Shortcuts.svelte';
  import StatusBar from './ui/StatusBar.svelte';
  import Tips from './ui/Tips.svelte';
  import { CanvasView } from './ui/view.svelte';
  import { CUSTOM_PRESET_ID, DEFAULT_PRESET_ID, SIZE_PRESETS } from './ui/presets';

  // Opens on the autosaved design, or a shuffle on a first visit; `?default`
  // starts from the built-in one and leaves the save alone (tests).
  const builtIn = new URLSearchParams(location.search).has('default');
  const saved = builtIn ? null : readAutosave();
  const initial = new EditorState({ shuffle: !builtIn && !saved });
  if (saved) initial.setDesign(saved);
  const favourites = new Favourites();
  /** One undo step covers the design and the favourites list, so a removed favourite comes back. */
  interface Step {
    editor: EditorSnapshot;
    favourites: Favourite[];
  }
  const step = (): Step => ({ editor: editor.snapshot(), favourites: favourites.items });
  const history = new History<Step>({ editor: initial.snapshot(), favourites: favourites.items });
  // Class instance (not proxied); $state only so it can be bound down the panel tree.
  let editor = $state(initial);
  let presetId = $state(DEFAULT_PRESET_ID);
  /** The size preset being looked at in its open list: only the preview's frame changes. */
  let presetPreview = $state<string | null>(null);
  let customWidth = $state(1920);
  let customHeight = $state(1080);
  let format = $state<ExportFormat>('png');
  let collapsed = $state(false);
  let contextId = $state('');
  let contextPreview = $state<string | null>(null);
  const contextScreen = $derived(CONTEXT_SCREENS.find((s) => s.id === (contextPreview ?? contextId)) ?? null);
  // First visit only; `?default` (tests) never shows them.
  let tips = $state(!builtIn && !tipsDismissed());
  let shortcuts = $state(false);
  // A first-time visitor is nudged toward shuffle until it has been used once (`?default` never nudges).
  let nudgeShuffle = $state(!builtIn && !shuffleTried());
  const reelAtStart = initial.reel.length;
  $effect(() => {
    if (nudgeShuffle && editor.reel.length !== reelAtStart) {
      nudgeShuffle = false;
      markShuffleTried();
    }
  });
  /** The "more like this" grid covers the preview. */
  let exploring = $state(false);
  /** The preview alone, in the browser's full screen; the panel, handles and overlays are hidden. */
  let fullscreen = $state(false);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  let exporting = $state(false);
  let progress = $state<ExportProgress | null>(null);
  let error = $state('');
  let abort: AbortController | null = null;
  const view = new CanvasView();
  let preview: Preview;

  const output = $derived.by(() => {
    const preset = SIZE_PRESETS.find((p) => p.id === presetId);
    return presetId === CUSTOM_PRESET_ID || !preset
      ? { width: customWidth, height: customHeight }
      : { width: preset.width, height: preset.height };
  });

  const renderDesign = $derived(editor.design);
  const aspect = $derived(output.width / output.height);
  const previewPreset = $derived(presetPreview ? SIZE_PRESETS.find((p) => p.id === presetPreview) : undefined);
  const previewAspect = $derived(previewPreset ? previewPreset.width / previewPreset.height : aspect);
  $effect(() => {
    editor.aspect = aspect;
  });

  $effect(() => history.record(step()));

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const design = renderDesign;
    clearTimeout(saveTimer);
    if (!builtIn) saveTimer = setTimeout(() => writeAutosave(design), 300);
  });

  function undo() {
    apply(history.undo());
  }

  function redo() {
    apply(history.redo());
  }

  function apply(s: Step | null) {
    if (!s) return;
    editor.restore(s.editor);
    if (s.favourites !== favourites.items) favourites.restore(s.favourites);
  }

  function enterFullscreen() {
    if (!canFullscreen || fullscreen) return;
    // Refused without a user gesture, and in some embeds; the state only follows the browser's event.
    document.documentElement.requestFullscreen().catch((err: unknown) => console.warn('fullscreen:', err));
  }

  function exitFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
  }

  /** ⌘Z undoes and ⇧⌘Z or Ctrl+Y redoes, except in text fields, which keep their own undo. */
  function onKeyDown(e: KeyboardEvent) {
    if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
      if (fullscreen) exitFullscreen();
      else enterFullscreen();
      return;
    }
    // The browser's own save-page dialog is no use here, so ⌘S downloads, even from a text field.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void startExport();
      return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      e.preventDefault();
      if (key === 'z' && !e.shiftKey) undo();
      else redo();
    }
  }

  /** Each press starts a new undo step, so a drag or a held key is one step. */
  function onPress(e: Event) {
    if (!(e instanceof KeyboardEvent && e.repeat)) history.commit();
  }

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
      download(blob, `cromatica-${size.width}x${size.height}.${fmt === 'png' ? 'png' : 'jpg'}`);
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

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

  /** Reopen the design at the size it was exported at. */
  function openExport({ design, size }: ExportedDesign) {
    const preset = SIZE_PRESETS.find((p) => p.width === size.width && p.height === size.height);
    if (preset) {
      presetId = preset.id;
    } else {
      presetId = CUSTOM_PRESET_ID;
      customWidth = size.width;
      customHeight = size.height;
    }
    editor.setDesign(design);
    view.reset();
  }

  /** A PNG or JPEG exported from here reopens its design; any other image dropped on the window becomes the palette. */
  async function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    // A drop comes without a press, so close the step before it by hand.
    history.commit();
    const exported = await readExportedDesign(file).catch((err: unknown) => {
      console.warn('drop: ignoring the embedded design', err);
      return null;
    });
    if (exported) openExport(exported);
    else void editor.importImage(file);
  }
</script>

<svelte:window
  onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)}
  ondragover={(e) => hasFiles(e) && e.preventDefault()}
  ondrop={onDrop}
  onpointerdowncapture={onPress}
  onkeydowncapture={onPress}
  onkeydown={onKeyDown}
  onpagehide={() => !builtIn && writeAutosave(renderDesign)}
/>

<Preview
  bind:this={preview}
  design={editor.preview ?? renderDesign}
  aspect={previewAspect}
  paused={exporting}
  docked={!collapsed && !fullscreen}
  barred={!fullscreen}
  {view}
  zoomable={!exploring && !fullscreen}
  {fullscreen}
  onexitfullscreen={exitFullscreen}
>
  {#snippet overlay()}
    {#if !exploring && contextScreen && !previewPreset}
      <ContextOverlay design={renderDesign} {aspect} screen={contextScreen} />
    {/if}
    {#if fullscreen}
      <!-- The image and the OS context only: no handles. -->
    {:else if exploring}
      <MoreLikeThis
        design={renderDesign}
        {aspect}
        onpick={(d) => {
          editor.setDesign(d);
          exploring = false;
        }}
        onclose={() => (exploring = false)}
      />
    {:else if editor.preview || previewPreset}
      <!-- A picker preview: the handles belong to the design underneath. -->
    {:else if editor.kind === 'mesh'}
      <MeshOverlay {editor} {aspect} />
    {:else if editor.kind === 'grid'}
      <GridOverlay {editor} {aspect} />
    {/if}
  {/snippet}
</Preview>
{#if !fullscreen}
  <ControlPanel
    bind:editor
    {favourites}
    bind:presetId
    bind:presetPreview
    bind:customWidth
    bind:customHeight
    {output}
    bind:collapsed
    bind:exploring
    bind:tips
    bind:shortcuts
    canUndo={history.canUndo}
    canRedo={history.canRedo}
    onundo={undo}
    onredo={redo}
    {nudgeShuffle}
    {exporting}
    {progress}
    {error}
    onexport={startExport}
    oncancel={cancelExport}
  />
{/if}
{#if !fullscreen}
  <StatusBar
    {editor}
    docked={!collapsed}
    bind:format
    bind:contextId
    bind:contextPreview
    portrait={output.height > output.width}
    {view}
    onzoom={(f) => preview.zoomBy(f)}
    onfullscreen={canFullscreen ? enterFullscreen : undefined}
  />
{/if}
{#if shortcuts && !fullscreen}
  <Shortcuts onclose={() => (shortcuts = false)} />
{:else if tips && !fullscreen}
  <Tips
    onclose={() => {
      tips = false;
      dismissTips();
    }}
  />
{/if}
