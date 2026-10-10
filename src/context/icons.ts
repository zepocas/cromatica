/** Which stand-in icons a zone's grid shows. Generic shapes, never real app icons or logos. */
export type IconSet = 'mac-desktop' | 'mac-dock' | 'win-desktop' | 'win-taskbar';

export type IconGlyph = 'circle' | 'square' | 'triangle' | 'bars' | 'ring';

export type IconSpec =
  | { shape: 'folder'; platform: 'mac' | 'win' }
  | { shape: 'app'; platform: 'mac' | 'win'; color: string; glyph: IconGlyph; dark?: boolean };

/** Saturated primaries plus one black and one near-white item, to show how dark and light items read. */
const MAC_APPS: [string, IconGlyph][] = [
  ['#0a84ff', 'circle'],
  ['#ff453a', 'square'],
  ['#30d158', 'triangle'],
  ['#ff9f0a', 'bars'],
  ['#bf5af2', 'ring'],
  ['#1c1c1e', 'circle'],
  ['#ffd60a', 'square'],
  ['#64d2ff', 'bars'],
  ['#ff375f', 'triangle'],
  ['#f2f2f7', 'ring'],
];

/** Windows 11 is flatter and a little less saturated. */
const WIN_APPS: [string, IconGlyph][] = [
  ['#0f6cbd', 'circle'],
  ['#e8742a', 'square'],
  ['#2e9d52', 'triangle'],
  ['#c4314b', 'bars'],
  ['#202020', 'ring'],
  ['#7a5bc7', 'circle'],
  ['#f2c230', 'square'],
];

const DARK = new Set(['#1c1c1e', '#202020']);

/** The icon in slot `i` of a grid, cycling when the grid has more slots than the set has icons. */
export function iconFor(set: IconSet, i: number): IconSpec {
  const platform = set.startsWith('mac') ? 'mac' : 'win';
  if (set === 'mac-desktop' || set === 'win-desktop') return { shape: 'folder', platform };
  const apps = platform === 'mac' ? MAC_APPS : WIN_APPS;
  const [color, glyph] = apps[i % apps.length];
  return { shape: 'app', platform, color, glyph, dark: DARK.has(color) };
}

const FOLDER_NAMES = ['lorem', 'ipsum dolor', 'sit amet', 'consectetur'];

/** The name under a desktop folder, or none for sets without labels. */
export function labelFor(set: IconSet, i: number): string | null {
  return set === 'mac-desktop' || set === 'win-desktop' ? FOLDER_NAMES[i % FOLDER_NAMES.length] : null;
}
