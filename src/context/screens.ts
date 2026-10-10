import type { ContextScreen, Zone } from './zones';

// Sources and confidence per value: docs/research/context-zones.md.

const STATUS_FONT = 17;

const appleHome: Zone = { kind: 'indicator', label: 'home indicator', x: 0, y: 8, w: 134, h: 5, radius: 2.5 };
const island: Zone = { kind: 'cutout', label: 'dynamic island', x: 0, y: 11, w: 126, h: 37, radius: 18.5 };
const punchHole: Zone = { kind: 'cutout', label: 'camera', x: 0, y: 17, w: 32, h: 32, radius: 16 };
const gestureHandle: Zone = { kind: 'indicator', label: 'gesture handle', x: 0, y: 8, w: 108, h: 4, radius: 2 };

const center = (z: Zone): Zone => ({ ...z, anchorX: 'center' });
const bottom = (z: Zone): Zone => ({ ...z, anchorY: 'bottom' });
/** Launchers spread their grids and docks across wider phones, keeping the side margins. */
const stretch = (margin: number, z: Zone): Zone => ({ ...z, anchorX: 'stretch', x: margin });

export const CONTEXT_SCREENS: ContextScreen[] = [
  {
    id: 'macos',
    label: 'macOS',
    group: 'desktop',
    os: 'macOS 27.0',
    // Measured with NSScreen on this device: menu bar and notch heights from
    // safeAreaInsets, notch width from the auxiliary top areas.
    device: 'MacBook Pro 16-inch at 1800 × 1169',
    width: 1800,
    height: 1169,
    zones: [
      { kind: 'area', label: 'menu bar', x: 0, y: 0, w: 0, h: 38, anchorX: 'stretch', check: true },
      {
        kind: 'text',
        label: 'menus',
        x: 20,
        y: 12,
        w: 520,
        h: 14,
        text: ' Finder   File   Edit   View   Go   Window   Help',
        align: 'left',
        follows: 'menu bar',
      },
      {
        kind: 'text',
        label: 'menu clock',
        x: 16,
        y: 12,
        w: 220,
        h: 14,
        anchorX: 'right',
        text: 'Wed 7 Oct  9:41',
        align: 'right',
        follows: 'menu bar',
      },
      center({ kind: 'cutout', label: 'notch', x: 0, y: 0, w: 220, h: 38, radius: 10 }),
      {
        kind: 'icons',
        label: 'desktop icons',
        x: 16,
        y: 50,
        w: 100,
        h: 384,
        anchorX: 'right',
        grid: { cols: 1, rows: 4, icon: 64, set: 'mac-desktop' },
        check: true,
      },
      bottom(
        center({
          kind: 'dock',
          label: 'dock',
          x: 0,
          y: 6,
          w: 860,
          h: 64,
          radius: 22,
          grid: { cols: 15, rows: 1, icon: 48, set: 'mac-dock' },
        }),
      ),
    ],
  },
  {
    id: 'windows',
    label: 'Windows',
    group: 'desktop',
    os: 'Windows 11 24H2',
    device: '1920 × 1080 at 100%',
    width: 1920,
    height: 1080,
    zones: [
      {
        kind: 'icons',
        label: 'desktop icons',
        x: 2,
        y: 2,
        w: 75,
        h: 344,
        grid: { cols: 1, rows: 4, icon: 48, set: 'win-desktop' },
        check: true,
      },
      bottom({ kind: 'bar', label: 'taskbar', x: 0, y: 0, w: 0, h: 48, anchorX: 'stretch' }),
      bottom(
        center({
          kind: 'icons',
          label: 'taskbar apps',
          x: 0,
          y: 12,
          w: 308,
          h: 24,
          grid: { cols: 7, rows: 1, icon: 24, set: 'win-taskbar' },
        }),
      ),
      bottom({
        kind: 'text',
        label: 'tray clock',
        x: 24,
        y: 17,
        w: 120,
        h: 14,
        anchorX: 'right',
        text: '9:41',
        align: 'right',
      }),
    ],
  },
  {
    id: 'ios-lock',
    label: 'iOS lock screen',
    group: 'mobile',
    os: 'iOS 26',
    device: 'iPhone 16 Pro',
    width: 402,
    height: 874,
    zones: [
      center(island),
      center({ kind: 'text', label: 'date', x: 0, y: 72, w: 300, h: 20, text: 'Wednesday 7 October', check: true }),
      center({ kind: 'clock', label: 'clock', x: 0, y: 96, w: 360, h: 100, text: '9:41', check: true }),
      center({ kind: 'widget', label: 'widgets', x: 0, y: 212, w: 354, h: 72, radius: 20 }),
      bottom({ kind: 'widget', label: 'flashlight', x: 46, y: 56, w: 50, h: 50, radius: 25 }),
      bottom({ kind: 'widget', label: 'camera', x: 46, y: 56, w: 50, h: 50, radius: 25, anchorX: 'right' }),
      bottom(center(appleHome)),
    ],
  },
  {
    id: 'ios-home',
    label: 'iOS home screen',
    group: 'mobile',
    os: 'iOS 26',
    device: 'iPhone 16 Pro',
    width: 402,
    height: 874,
    zones: [
      { kind: 'text', label: 'status', x: 40, y: 19, w: 60, h: STATUS_FONT, text: '9:41', check: true },
      center(island),
      stretch(26, {
        kind: 'icons',
        label: 'app icons',
        x: 0,
        y: 72,
        w: 350,
        h: 540,
        grid: { cols: 4, rows: 6, icon: 62 },
        check: true,
      }),
      bottom(center({ kind: 'widget', label: 'search', x: 0, y: 136, w: 70, h: 26, radius: 13 })),
      bottom(
        stretch(12, {
          kind: 'dock',
          label: 'dock',
          x: 0,
          y: 18,
          w: 378,
          h: 96,
          radius: 34,
          grid: { cols: 4, rows: 1, icon: 62 },
        }),
      ),
      bottom(center(appleHome)),
    ],
  },
  {
    id: 'android-lock',
    label: 'Android lock screen',
    group: 'mobile',
    os: 'Android 16',
    device: 'Pixel 9',
    width: 411,
    height: 923,
    zones: [
      center(punchHole),
      { kind: 'text', label: 'date', x: 24, y: 90, w: 363, h: 20, text: 'Wed, 7 Oct', align: 'left', check: true },
      center({ kind: 'clock', label: 'clock', x: 0, y: 150, w: 363, h: 260, text: '09\n41', check: true }),
      bottom(center(gestureHandle)),
    ],
  },
  {
    id: 'android-home',
    label: 'Android home screen',
    group: 'mobile',
    os: 'Android 16',
    device: 'Pixel 9',
    width: 411,
    height: 923,
    zones: [
      { kind: 'text', label: 'status', x: 24, y: 25, w: 60, h: 16, text: '9:41', align: 'left', check: true },
      center(punchHole),
      {
        kind: 'text',
        label: 'at a glance',
        x: 24,
        y: 110,
        w: 363,
        h: 24,
        text: 'Wed, 7 Oct  18°',
        align: 'left',
        check: true,
      },
      stretch(0, {
        kind: 'icons',
        label: 'app icons',
        x: 0,
        y: 200,
        w: 411,
        h: 480,
        grid: { cols: 5, rows: 4, icon: 56 },
        check: true,
      }),
      bottom(
        stretch(16, {
          kind: 'icons',
          label: 'hotseat',
          x: 0,
          y: 75,
          w: 379,
          h: 88,
          grid: { cols: 5, rows: 1, icon: 56 },
        }),
      ),
      bottom(stretch(16, { kind: 'widget', label: 'search', x: 0, y: 19, w: 379, h: 52, radius: 26 })),
      bottom(center(gestureHandle)),
    ],
  },
];
