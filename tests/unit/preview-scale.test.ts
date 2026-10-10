import { describe, expect, it } from 'vitest';
import { editingScale } from '../../src/preview/preview';

describe('editingScale', () => {
  it('stays at full resolution while a full frame fits the budget', () => {
    expect(editingScale(4)).toBe(1);
    expect(editingScale(20)).toBe(1);
  });

  it('drops gradually as frames get dearer, in eighths', () => {
    // sqrt(16 / 25) = 0.8 -> 0.75; sqrt(16 / 40) = 0.63 -> 0.625
    expect(editingScale(25)).toBe(0.75);
    expect(editingScale(40)).toBe(0.625);
  });

  it('never goes below half, and treats an unmeasured cost as expensive', () => {
    expect(editingScale(500)).toBe(0.5);
    expect(editingScale(Infinity)).toBe(0.5);
  });
});
