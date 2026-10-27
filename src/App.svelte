<script lang="ts">
  import { readExportedDesign, type ExportedDesign } from './export/design-image';
  import { exportImage } from './export/exporter';
  import type { ExportProgress } from './export/types';
  import { saveDesign, type SavedDesign } from './design/schema';
  import { readAutosave, writeAutosave } from './ui/state/autosave';
  import ControlPanel from './ui/ControlPanel.svelte';
  import { EditorState, type EditorSnapshot } from './ui/state/editor.svelte';
  import { ExportSettings } from './ui/state/export-settings.svelte';
  import { Favourites, type Favourite } from './ui/state/favourites.svelte';
  import { PanelUi } from './ui/state/panel-ui.svelte';
  import { History } from './ui/state/history.svelte';
  import { isTypingTarget } from './ui/state/keys';
  import { glowKey } from './ui/controls/glow';
  import ImagePins from './ui/overlays/ImagePins.svelte';
  import MeshOverlay from './ui/overlays/MeshOverlay.svelte';
  import MoreLikeThis from './ui/overlays/MoreLikeThis.svelte';
  import GridOverlay from './ui/overlays/GridOverlay.svelte';
  import PlanesOverlay from './ui/overlays/PlanesOverlay.svelte';
  import ContextOverlay from './ui/overlays/ContextOverlay.svelte';
  import MonitorsOverlay from './ui/overlays/MonitorsOverlay.svelte';
  import { MonitorsState } from './ui/state/monitors.svelte';
  import { CONTEXT_SCREENS } from './context/screens';
  import Preview from './ui/Preview.svelte';
  import {
    dismissTips,
    markShuffleTried,
    markWalkthroughDone,
    panelFolded,
    rememberPanelFolded,
    shuffleTried,
    tipsDismissed,
    walkthroughDone,
  } from './ui/tips';
  import { contextForSize, isTouchDevice, startSize } from './ui/state/device';
  import Walkthrough from './ui/Walkthrough.svelte';
  import { Walkthrough as WalkthroughState, type Signals } from './ui/state/walkthrough.svelte';
  import Shortcuts from './ui/Shortcuts.svelte';
  import StatusBar from './ui/StatusBar.svelte';
  import Tips from './ui/Tips.svelte';
  import { CanvasView } from './ui/state/view.svelte';
  import { clearShareHash, LONG_LINK, readShareHash, shareUrl } from './ui/state/share-link';

  import { untrack } from 'svelte';
  import type { Design } from './design/design';

  interface Props {
    /** The design in the page's share link, already decoded (main.ts). */
    shared?: SavedDesign | null;
    shareFailed?: boolean;
  }
  let { shared = null, shareFailed = false }: Props = $props();
  // Read once: a link only matters at startup (later ones arrive as hashchange).
  const startShared = untrack(() => shared);
  const startShareFailed = untrack(() => shareFailed);
  function designKey(design: Design): string {
    return JSON.stringify(saveDesign(design).design);
  }

  // Opens on a shared link's design, else the autosaved one, or a shuffle on a first visit;
  // `?default` starts from the built-in one and leaves the save alone (tests).
  const builtIn = new URLSearchParams(location.search).has('default');
  const saved = startShared ?? (builtIn ? null : readAutosave());
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
  const exportSettings = new ExportSettings();
  // A first visit gets the walkthrough in place of the tips card; `?default` (tests) gets neither.
  // `?walkthrough` runs it on demand, whatever was stored.
  const firstVisit =
    new URLSearchParams(location.search).has('walkthrough') || (!builtIn && !tipsDismissed() && !walkthroughDone());
  const ui = new PanelUi({ tips: false });
  const walkthrough = new WalkthroughState(undefined, () => {
    markWalkthroughDone();
    dismissTips();
  });
  if (firstVisit) {
    walkthrough.start();
    // Starts from the device: the panel folded away and the size of its screen (the OS screen waits for `o`).
    ui.collapsed = true;
    const touch = isTouchDevice(navigator.platform, navigator.userAgent, navigator.maxTouchPoints);
    exportSettings.open(startSize({ width: screen.width, height: screen.height }, devicePixelRatio, touch));
  }
  if (!firstVisit && !builtIn) ui.collapsed = panelFolded() ?? false;
  // Not while the walkthrough runs: it folds and opens the panel itself, and a first visit should not pin that.
  $effect(() => {
    const folded = ui.collapsed;
    if (!builtIn && !walkthrough.active) rememberPanelFolded(folded);
  });
  $effect(() => {
    if (ui.contextAuto) ui.contextId = contextForSize(exportSettings.size, navigator.platform);
  });
  const contextScreen = $derived(CONTEXT_SCREENS.find((s) => s.id === (ui.contextPreview ?? ui.contextId)) ?? null);
  const monitors = new MonitorsState();
  // A first-time visitor is nudged toward shuffle until it has been used once (`?default` never nudges).
  const nudgeOnLoad = !builtIn && !shuffleTried();
  const reelAtStart = initial.reel.length;
  const shuffled = $derived(editor.reel.length !== reelAtStart);
  const nudgeShuffle = $derived(nudgeOnLoad && !shuffled);
  $effect(() => {
    if (nudgeOnLoad && shuffled) markShuffleTried();
  });
  const signals = (): Signals => ({
    reel: editor.reel.pushes,
    exploring: ui.exploring,
    collapsed: ui.collapsed,
    context: ui.contextId !== '',
    kind: editor.kind,
    warpShape: editor.warp.shape,
    adjust: JSON.stringify([editor.finish, editor.warp, editor.transform]),
    pattern: JSON.stringify([editor.ramp, editor.mesh, editor.planes, editor.aurora, editor.blobs, editor.grid]),
    colors: JSON.stringify(editor.palette.colors),
    arrange: JSON.stringify([editor.planes.edits, editor.blobs.edits]),
    shortcuts: ui.shortcuts,
    favourites: favourites.items.length,
  });
  $effect(() => {
    const now = signals();
    untrack(() => walkthrough.update(now));
  });
  /** After the app's own handlers, so a step sees the state its key produced. */
  function onWalkthroughKey(e: KeyboardEvent) {
    if (!walkthrough.active || e.repeat) return;
    // Esc closes the more-like-this grid and the shortcut list first.
    if (e.key === 'Escape') {
      if (!ui.exploring && !ui.shortcuts) walkthrough.leave();
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
      const key = e.key.toLowerCase();
      queueMicrotask(() => untrack(() => walkthrough.update(signals(), key)));
    }
  }
  const pinning = $derived(editor.pins.pinning && editor.pins.canPin && !ui.exploring);
  /** The preview alone, in the browser's full screen; the panel, handles and overlays are hidden. */
  let fullscreen = $state(false);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  let exporting = $state(false);
  let progress = $state<ExportProgress | null>(null);
  let error = $state(startShareFailed ? "That link couldn't be opened." : '');
  let notice = $state('');
  /** The design a share link opened, until the first edit: the address bar and the autosave both leave it alone meanwhile. */
  let linked = startShared ? designKey(startShared) : null;
  let abort: AbortController | null = null;
  const view = new CanvasView();
  let preview: Preview;

  const output = $derived(exportSettings.size);

  const wallpaper = $derived({ w: output.width, h: output.height });
  const renderDesign = $derived(editor.design);
  const aspect = $derived(output.width / output.height);
  const previewPreset = $derived(exportSettings.previewPreset);
  const previewAspect = $derived(previewPreset ? previewPreset.width / previewPreset.height : aspect);

  const showMonitors = $derived(monitors.on && !fullscreen && !ui.exploring && !previewPreset);
  /** In the stretch fit the wallpaper is drawn bent to the block, whose shape the monitors keep. */
  const stretchedTo = $derived.by(() => {
    if (!showMonitors || monitors.fit !== 'stretch') return null;
    const r = monitors.rect(wallpaper);
    return r.w / r.h;
  });
  // The editor clamps handle drags to the frame, so it needs the output's aspect.
  $effect(() => {
    editor.aspect = aspect;
  });

  $effect(() => history.record(step()));

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const design = renderDesign;
    clearTimeout(saveTimer);
    // The first edit after opening a link ends its hold: the link would describe the old design from here on.
    if (linked !== null && designKey(design) !== linked) {
      linked = null;
      clearShareHash();
    }
    if (!builtIn && linked === null) saveTimer = setTimeout(() => writeAutosave(design), 300);
  });

  async function share() {
    error = '';
    notice = '';
    try {
      const url = await shareUrl(renderDesign);
      await navigator.clipboard.writeText(url);
      notice =
        url.length > LONG_LINK
          ? 'link copied; long, so chat apps may cut it (download keeps the design)'
          : 'link copied';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  /** A link pasted into this tab only changes the fragment, so the page isn't reloaded: open it here. */
  async function onHashChange() {
    const { design, failed } = await readShareHash(location.hash);
    if (failed) {
      error = "That link couldn't be opened.";
    } else if (design) {
      error = '';
      history.commit();
      linked = designKey(design);
      editor.setDesign(design);
      view.reset();
    }
  }

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

  /** The OS screen that fits the canvas, on or off; it then follows the canvas shape until one is picked by hand. */
  function toggleContext() {
    ui.contextAuto = !ui.contextId;
    ui.contextId = ui.contextId ? '' : contextForSize(output, navigator.platform);
  }

  /** ⌘Z undoes and ⇧⌘Z or Ctrl+Y redoes, except in text fields, which keep their own undo. */
  function onKeyDown(e: KeyboardEvent) {
    onWalkthroughKey(e);
    if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
      if (fullscreen) exitFullscreen();
      else enterFullscreen();
      glowKey('fullscreen');
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !isTypingTarget(e.target)) {
      const key = e.key.toLowerCase();
      if (key === 'e') {
        void startExport();
        glowKey('download');
      } else if (key === 'o') toggleContext();
    }
    // The browser's own save-page dialog is no use here, so ⌘S downloads, even from a text field.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void startExport();
      glowKey('download');
      return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      e.preventDefault();
      if (key === 'z' && !e.shiftKey) {
        undo();
        glowKey('undo');
      } else {
        redo();
        glowKey('redo');
      }
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
    const fmt = exportSettings.format;
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

  function openExport({ design, size }: ExportedDesign) {
    exportSettings.open(size);
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
  onhashchange={onHashChange}
  onpagehide={() => !builtIn && linked === null && writeAutosave(renderDesign)}
/>

<Preview
  bind:this={preview}
  design={editor.preview ?? renderDesign}
  aspect={previewAspect}
  stretchTo={stretchedTo}
  paused={exporting}
  docked={!ui.collapsed && !fullscreen}
  barred={!fullscreen}
  {view}
  zoomable={!ui.exploring && !fullscreen}
  {fullscreen}
  onexitfullscreen={exitFullscreen}
>
  {#snippet overlay()}
    {#if !ui.exploring && contextScreen && !previewPreset && !showMonitors}
      <ContextOverlay design={renderDesign} {aspect} screen={contextScreen} />
    {/if}
    {#if fullscreen}
      <!-- The image and the OS context only: no handles. -->
    {:else if showMonitors}
      <MonitorsOverlay {monitors} {wallpaper} design={renderDesign} context={contextScreen} />
    {:else if ui.exploring}
      <MoreLikeThis
        design={renderDesign}
        {aspect}
        onpick={(d) => {
          editor.setDesign(d);
          ui.exploring = false;
        }}
        onclose={() => (ui.exploring = false)}
      />
    {:else if editor.preview || previewPreset}
      <!-- A picker preview: the handles belong to the design underneath. -->
    {:else if editor.kind === 'mesh'}
      <MeshOverlay {editor} {aspect} />
    {:else if editor.kind === 'grid'}
      <GridOverlay {editor} {aspect} />
    {:else if editor.kind === 'planes' || editor.kind === 'blobs'}
      <PlanesOverlay {editor} {aspect} />
    {/if}
  {/snippet}
</Preview>
{#if !fullscreen}
  <ControlPanel
    bind:editor
    {favourites}
    {exportSettings}
    {ui}
    canUndo={history.canUndo}
    canRedo={history.canRedo}
    onundo={undo}
    onredo={redo}
    {nudgeShuffle}
  />
{/if}
{#if !fullscreen}
  <StatusBar
    {editor}
    docked={!ui.collapsed}
    {exportSettings}
    {exporting}
    {progress}
    {error}
    {notice}
    onshare={share}
    onexport={startExport}
    oncancel={cancelExport}
    {ui}
    {monitors}
    portrait={output.height > output.width}
    {view}
    onzoom={(f) => preview.zoomBy(f)}
    onfullscreen={canFullscreen ? enterFullscreen : undefined}
  />
{/if}
{#if pinning && !fullscreen}
  <ImagePins {editor} />
{/if}
{#if walkthrough.active && !fullscreen}
  <Walkthrough {walkthrough} />
{/if}
{#if ui.shortcuts && !fullscreen}
  <Shortcuts
    onclose={() => (ui.shortcuts = false)}
    ontricks={() => {
      ui.shortcuts = false;
      ui.tips = true;
    }}
  />
{:else if ui.tips && !fullscreen}
  <Tips
    onkeys={() => {
      ui.tips = false;
      ui.shortcuts = true;
    }}
    onclose={() => {
      ui.tips = false;
      dismissTips();
    }}
  />
{/if}
