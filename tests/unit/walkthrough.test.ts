import { describe, expect, it, vi } from 'vitest';
import { STEPS, Walkthrough, type Signals } from '../../src/ui/state/walkthrough.svelte';

const idle: Signals = {
  reel: 0,
  exploring: false,
  collapsed: true,
  context: false,
  kind: 'mesh',
  warpShape: 'circular',
  adjust: 'a',
  colors: 'c',
  arrange: 'x',
  shortcuts: false,
  favourites: 0,
};

function started(onend = () => {}) {
  const w = new Walkthrough(STEPS, onend);
  w.start();
  w.update(idle);
  return w;
}

/** Past the shuffle step, on more like this. */
function atMoreLikeThis() {
  const w = started();
  for (const reel of [1, 2, 3]) w.update({ ...idle, reel });
  expect(STEPS[w.index].keys).toBe('m');
  return w;
}

describe('walkthrough', () => {
  it('asks for three shuffles, then for more like this', () => {
    const w = started();
    w.update(idle);
    expect(w.index).toBe(0);
    w.update({ ...idle, reel: 1 });
    w.update({ ...idle, reel: 2 });
    expect(w.index).toBe(0);
    expect(w.progress).toBe(2);
    w.update({ ...idle, reel: 3 });
    expect(w.index).toBe(1);
    expect(w.progress).toBe(0);
    w.update({ ...idle, reel: 3 }, 'k');
    expect(w.index).toBe(1);
  });

  it('finishes more like this only once the grid has been opened and closed', () => {
    const w = atMoreLikeThis();
    const at = w.index;
    w.update({ ...idle, reel: 3, exploring: true });
    expect(w.index).toBe(at);
    w.update({ ...idle, reel: 3, exploring: false });
    expect(w.index).toBe(at + 1);
  });

  it('takes q and w once each, and no other key', () => {
    const w = atMoreLikeThis();
    w.update({ ...idle, reel: 3, exploring: true });
    w.update({ ...idle, reel: 3 });
    w.update({ ...idle, reel: 3, context: true });
    w.update({ ...idle, reel: 3, context: true, collapsed: false });
    const at = w.index;
    expect(STEPS[at].keys).toBe('q w');
    w.update(idle, 'x');
    expect(w.index).toBe(at);
    w.update(idle, 'w');
    expect(w.index).toBe(at);
    w.update(idle, 'q');
    expect(w.index).toBe(at + 1);
  });

  it('ends once, on the last step or when left', () => {
    const onend = vi.fn();
    const w = started(onend);
    w.leave();
    w.leave();
    expect(w.active).toBe(false);
    expect(onend).toHaveBeenCalledTimes(1);
  });

  it('goes through the screen, panel and export steps on their own events', () => {
    const w = new Walkthrough(STEPS, () => {});
    w.start();
    w.update(idle);
    let now = { ...idle };
    const doIt = (change: Partial<Signals>, key: string | null = null) => {
      now = { ...now, ...change };
      w.update(now, key);
    };
    for (const reel of [1, 2, 3]) doIt({ reel });
    doIt({ exploring: true });
    doIt({ exploring: false });
    const at = (keys: string) => expect(STEPS[w.index].keys).toBe(keys);
    at('o');
    doIt({ context: true });
    at('p');
    doIt({ collapsed: false });
    at('q w');
    doIt({}, 'q');
    doIt({}, 'w');
    at('l ;');
    doIt({ kind: 'blobs' });
    at(', .');
    doIt({ warpShape: 'oval' });
    at('a slider');
    doIt({ adjust: 'b' });
    at('a blob or plane');
    doIt({ arrange: 'y' });
    at('r');
    doIt({ colors: 'd' });
    at('k');
    doIt({ favourites: 1 });
    at('settings in the panel');
    doIt({ adjust: 'e' });
    doIt({ colors: 'f' });
    doIt({ kind: 'cells' });
    at('?');
    doIt({ shortcuts: true });
    expect(w.active).toBe(false);
  });
});
