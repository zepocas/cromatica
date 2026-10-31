import type { UiScaleChoice } from './ui-scale';

/** Chrome state shared by the panel, the bars and the preview: what is open, folded or picked. */
export class PanelUi {
  /** The panel is folded to a one-line bar floating over a full-width preview. */
  collapsed = $state(false);
  /** The "more like this" grid covers the preview. */
  exploring = $state(false);
  tips = $state(false);
  shortcuts = $state(false);
  /** The OS screen drawn over the preview; '' = none. */
  contextId = $state('');
  /** The OS screen follows the canvas shape until one is picked by hand. */
  contextAuto = $state(false);
  /** The screen highlighted in the open list, shown until it closes; null = none. */
  contextPreview = $state<string | null>(null);

  /** The panel size picked by hand; null = follows the window width. */
  scale = $state<UiScaleChoice>(null);

  constructor(opts: { tips: boolean; scale?: UiScaleChoice }) {
    this.tips = opts.tips;
    this.scale = opts.scale ?? null;
  }
}
