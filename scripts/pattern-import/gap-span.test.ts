import { describe, expect, it } from 'vitest';
import { referenceSpan, spanError, straightSpan } from './gap-span';

const p = (x: number, y: number) => ({ x, y });
const left = { p: p(5, 1), inner: p(3, 1) };
const right = { p: p(35, 1), inner: p(37, 1) };
const ring = [p(20, 0), p(40, 0), p(40, 20), p(0, 20), p(0, 0)];

describe('local missing span experiment', () => {
  it('transfers the short arc across the reference index seam in either winding and direction', () => {
    for (const ref of [ring, [...ring].reverse()]) {
      for (const [a, b] of [
        [left, right],
        [right, left],
      ]) {
        const span = referenceSpan(a, b, ref);
        expect(span?.[0]).toEqual(a.p);
        expect(span?.at(-1)).toEqual(b.p);
        expect(spanError(span!, [a.p, b.p]).max).toBeLessThan(1e-8);
      }
    }
  });
  it('rejects a perpendicular entry and detects a hidden notch even when both tips look straight', () => {
    expect(referenceSpan({ ...left, inner: p(5, 3) }, right, ring)).toBeNull();
    const chord = straightSpan(left, right)!;
    expect(spanError(chord, [left.p, p(19, 1), p(20, 5), p(21, 1), right.p]).max).toBeGreaterThan(
      3.5,
    );
  });
});
