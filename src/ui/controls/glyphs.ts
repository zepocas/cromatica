/** One drawing grid for the panel's glyph buttons: 14x14, a 1.3px stroke, like the padlock in Lock.svelte. Static markup, never user input. */
export const GLYPH_BOX = 14;

/** Every shuffle dice in the panel; the one place to resize them. */
export const DICE_SIZE = 14;

const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r=".9" fill="currentColor" stroke="none"/>`;
const refresh = '<path d="M2.5 7a4.5 4.5 0 0 1 8-2.8M11 1.8v2.8H8.2M11.5 7a4.5 4.5 0 0 1-8 2.8M3 12.2V9.4h2.8"/>';
const turn = '<path d="M3.5 4.2A4.5 4.5 0 1 1 2.5 7M2 1.8v3h3"/>';
const flip = '<path d="M7 1.5v11" stroke-dasharray="1.5 1.5"/><path d="M5.5 3.5v7L1.5 7zM8.5 3.5v7l4-3.5z"/>';

export const GLYPHS = {
  dice: `<rect x="1.5" y="1.5" width="11" height="11" rx="2"/>${dot(4.5, 4.5)}${dot(9.5, 4.5)}${dot(7, 7)}${dot(4.5, 9.5)}${dot(9.5, 9.5)}`,
  shuffle: refresh,
  swap: '<path d="M2 4.5h10M9.5 2 12 4.5 9.5 7M12 9.5H2M4.5 7 2 9.5 4.5 12"/>',
  image:
    '<rect x="1.5" y="2" width="11" height="10" rx="1.5"/><circle cx="5" cy="5.5" r="1"/><path d="m1.5 10.5 3.5-3.5 3 3 2-2 2.5 2.5"/>',
  pins: '<circle cx="7" cy="7" r="5.5"/><circle cx="7" cy="7" r="2" fill="currentColor"/>',
  fullscreen: '<path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9"/>',
  fold: '<path d="M3 11.5h8"/>',
  unfold: '<rect x="2.5" y="2.5" width="9" height="9"/>',
  tips: '<path d="M7 1.5C7.4 5 9 6.6 12.5 7 9 7.4 7.4 9 7 12.5 6.6 9 5 7.4 1.5 7 5 6.6 6.6 5 7 1.5z"/>',
  undo: '<path d="M4.5 2.5 2 5l2.5 2.5M2.5 5H8a3.5 3.5 0 0 1 0 7H5"/>',
  redo: '<path d="M9.5 2.5 12 5 9.5 7.5M11.5 5H6a3.5 3.5 0 0 0 0 7h3"/>',
  'turn-left': turn,
  'turn-right': `<g transform="translate(14 0) scale(-1 1)">${turn}</g>`,
  'flip-x': flip,
  'flip-y': `<g transform="rotate(90 7 7)">${flip}</g>`,
  crosshair: '<circle cx="7" cy="7" r="3.2"/><path d="M7 1v3M7 10v3M1 7h3M10 7h3"/>',
} as const;

export type GlyphName = keyof typeof GLYPHS;
