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
