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
