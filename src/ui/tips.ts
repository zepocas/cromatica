// First-visit tips, dismissed for good (best-effort, D13).
export const TIPS_KEY = 'cromatica.tips';

export function tipsDismissed(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(TIPS_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissTips(storage: Storage = localStorage): void {
  try {
    storage.setItem(TIPS_KEY, 'dismissed');
  } catch {
    // Shown again next visit; nothing else is lost.
  }
}

// The shuffle button pulses until it has been used once (best-effort, D13).
export const SHUFFLE_TRIED_KEY = 'cromatica.shuffle-tried';

export function shuffleTried(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(SHUFFLE_TRIED_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markShuffleTried(storage: Storage = localStorage): void {
  try {
    storage.setItem(SHUFFLE_TRIED_KEY, 'yes');
  } catch {
    // Pulses again next visit; nothing else is lost.
  }
}

// The first-visit walkthrough runs once, finished or left (best-effort, D13).
export const WALKTHROUGH_KEY = 'cromatica.walkthrough';

export function walkthroughDone(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(WALKTHROUGH_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markWalkthroughDone(storage: Storage = localStorage): void {
  try {
    storage.setItem(WALKTHROUGH_KEY, 'done');
  } catch {
    // Runs again next visit; nothing else is lost.
  }
}

// Whether the panel was last left folded: a first visit starts folded, later ones start as the user left it (best-effort, D13).
export const PANEL_FOLDED_KEY = 'cromatica.panel-folded';

/** null when nothing was stored yet. */
export function panelFolded(storage: Storage = localStorage): boolean | null {
  try {
    const v = storage.getItem(PANEL_FOLDED_KEY);
    return v === null ? null : v === 'yes';
  } catch {
    return null;
  }
}

export function rememberPanelFolded(folded: boolean, storage: Storage = localStorage): void {
  try {
    storage.setItem(PANEL_FOLDED_KEY, folded ? 'yes' : 'no');
  } catch {
    // Starts as the default next visit; nothing else is lost.
  }
}
