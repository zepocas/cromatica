import type { Attachment } from 'svelte/attachments';

const buttons = new Map<string, Set<HTMLElement>>();

function pulse(el: HTMLElement): void {
  if ((el as HTMLButtonElement).disabled) return;
  // Taking the class off and reading the layout restarts the animation on a quick second press.
  el.classList.remove('glow');
  void el.offsetWidth;
  el.classList.add('glow');
}

/** Puts a button under an id: a click makes it glow, and so does `glowKey(id)` when its shortcut is pressed. */
export function glow(id: string): Attachment<HTMLElement> {
  return (el) => {
    const set = buttons.get(id) ?? new Set();
    buttons.set(id, set.add(el));
    const onclick = () => pulse(el);
    const onend = () => el.classList.remove('glow');
    el.addEventListener('click', onclick);
    el.addEventListener('animationend', onend);
    return () => {
      el.removeEventListener('click', onclick);
      el.removeEventListener('animationend', onend);
      set.delete(el);
    };
  };
}

/** The shortcut for a button was pressed: it glows as if clicked. */
export function glowKey(id: string): void {
  buttons.get(id)?.forEach(pulse);
}
