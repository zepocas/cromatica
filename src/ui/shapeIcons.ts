/**
 * Inline SVG bodies for the gradient and warp-shape selects, drawn on a 24x14 grid in
 * `currentColor`, so they follow the panel's monochrome look. Static strings, safe for {@html}.
 */
import type { WarpShape } from '../design/design';

export const ICON_WIDTH = 24;
export const ICON_HEIGHT = 14;

const line = (d: string) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const lines = (...d: string[]) => d.map(line).join('');

export const WARP_ICONS: Record<WarpShape, string> = {
  none: line('M2 7H22'),
  domain: lines('M2 9C5 2 8 12 12 6S19 3 22 8', 'M2 12C6 8 9 14 13 10S19 8 22 11'),
  fbm: line('M2 8C3 5 4 10 6 6S8 3 9 7 11 11 13 6 15 3 17 8 19 9 20 6 21 6 22 7'),
  simplex: lines('M2 5C7 1 10 8 15 5S20 4 22 6', 'M2 10C7 6 10 13 15 10S20 9 22 11'),
  waves: lines('M1 7Q4.5 0 8 7T15 7T22 7'),
  rows: lines('M2 3H14', 'M8 7H22', 'M2 11H14'),
  columns: lines('M5 1V9', 'M12 5V13', 'M19 1V9'),
  circular:
    '<g fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="7" r="3.8"/><path d="M5.7 3.5A7 7 0 0 1 18.3 3.5M5.7 10.5A7 7 0 0 0 18.3 10.5"/></g>',
  oval: line('M12 7C12 6 13 6 13 7S12 9 10.5 8.5 8.5 5.5 11 4.5 16 5.5 16 8.5 13 12 9.5 11 5 6 8 3 15 1.5 19 5'),
  worley:
    '<g fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="5" cy="5" r="2.2"/><circle cx="13" cy="9" r="2.2"/><circle cx="19" cy="4" r="1.6"/><circle cx="6" cy="11" r="1"/></g>',
  voronoi: lines('M2 4L9 6L12 1', 'M9 6L7 13', 'M9 6L16 8L22 4', 'M16 8L14 13'),
  curl: lines('M2 4C9 1 14 8 22 5', 'M2 7.5C9 4.5 14 11.5 22 8.5', 'M2 11C9 8 14 15 22 12'),
  ridged: lines('M2 4C9 4 12 8 22 6', 'M2 10C8 8 13 12 22 11', 'M12 1L12 5'),
  marble: `<g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M1 8C6 8 8 4 11 4S13 8 16 7S19 2 23 2" transform="translate(0 -1)" stroke-width="2.4" stroke-opacity=".45"/><path d="M1 8C6 8 8 4 11 4S13 8 16 7S19 2 23 2" transform="translate(0 3)" stroke-width="1"/><path d="M1 8C6 8 8 4 11 4S13 8 16 7S19 2 23 2" transform="translate(0 6.5)" stroke-width="1.8" stroke-opacity=".7"/></g>`,
  bristle: lines(
    'M2 1 H14 A7 7 0 0 1 21 8 V13',
    'M2 3 H14 A5 5 0 0 1 19 8 V13',
    'M2 5 H14 A3 3 0 0 1 17 8 V13',
    'M2 7 H14 A1 1 0 0 1 15 8 V13',
  ),
};

const fill = (opacity: number, shape: string) =>
  shape.replace('/>', ` fill="currentColor" fill-opacity="${opacity}"/>`);

export const PATTERN_ICONS: Record<string, string> = {
  mesh: `<defs><filter id="mesh-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.6"/></filter></defs><g fill="currentColor" filter="url(#mesh-blur)"><polygon points="5.9,0.6 8.9,2.3 8.9,5.8 5.9,7.6 2.9,5.8 2.9,2.3" fill-opacity="1"/><polygon points="12.1,0.6 15.1,2.3 15.1,5.8 12.1,7.6 9.1,5.8 9.1,2.3" fill-opacity="0.4"/><polygon points="18.3,0.6 21.3,2.3 21.3,5.8 18.3,7.6 15.3,5.8 15.3,2.3" fill-opacity="0.75"/><polygon points="9.0,6.0 12.0,7.8 12.0,11.2 9.0,13.0 6.0,11.2 6.0,7.8" fill-opacity="0.55"/><polygon points="15.2,6.0 18.2,7.8 18.2,11.2 15.2,13.0 12.2,11.2 12.2,7.8" fill-opacity="1"/></g>`,
  grid: `<g fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2 2H22M2 7H22M2 12H22M4 1V13M10 1V13M16 1V13M22 1V13"/></g>`,
  linear: [0.15, 0.3, 0.5, 0.75, 1]
    .map((o, i) => fill(o, `<rect x="${2 + i * 4.4}" y="1" width="4.4" height="12"/>`))
    .join(''),
  radial: [1, 0.7, 0.45, 0.2]
    .map((o, i) => fill(o, `<circle cx="12" cy="7" r="${[2, 3.5, 5, 6.5][i]}"/>`))
    .reverse()
    .join(''),
  conic: [0.9, 0.55, 0.25, 0.7]
    .map((o, i) =>
      fill(o, `<path d="M12 7L${['12 0.5L18.5 7', '18.5 7L12 13.5', '12 13.5L5.5 7', '5.5 7L12 0.5'][i]}Z"/>`),
    )
    .join(''),
  noise: `<g fill="currentColor"><circle cx="5" cy="5" r="3.2" fill-opacity=".7"/><circle cx="11" cy="9" r="3.6" fill-opacity=".4"/><circle cx="17" cy="5" r="3.2" fill-opacity=".9"/><circle cx="20" cy="10" r="2" fill-opacity=".5"/><circle cx="4" cy="11" r="1.8" fill-opacity=".3"/></g>`,
  cells: `<g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"><path d="M2 2H9L11 6L7 9L2 8ZM9 2H22V6L16 5L11 6M7 9L9 13H2M11 6L16 5L22 6M16 5L15 10L11 13L9 13M15 10L22 9"/></g>`,
  planes: [0.25, 0.5, 0.85]
    .map((o, i) => fill(o, `<rect x="${2 + i * 4}" y="${1.5 + i * 2.5}" width="12" height="7"/>`))
    .join(''),
  aurora: [0.9, 0.55, 0.3]
    .map(
      (o, i) =>
        `<path d="M${3 + i * 7} 13C${1 + i * 7} 9 ${6 + i * 7} 6 ${4 + i * 7} 1" fill="none" stroke="currentColor" stroke-opacity="${o}" stroke-width="2.6" stroke-linecap="round"/>`,
    )
    .join(''),
};
