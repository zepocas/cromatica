/**
 * True when a key press belongs to the focused control: text-like inputs,
 * selects and editable content. Range sliders and buttons don't count, so
 * app shortcuts (Space, [ and ]) still work after touching them.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  if (el.closest('select, textarea, [contenteditable]:not([contenteditable="false"])')) return true;
  const input = el.closest('input');
  return !!input && input.type !== 'range';
}
