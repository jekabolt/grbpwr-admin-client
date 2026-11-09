import { describe, expect, it } from 'vitest';

import { doorHitWidths } from './step-picture-view';

const edge = (id: string, points: [number, number][]) => ({ id: id as never, points });

describe('doorHitWidths', () => {
  it('narrows the hit stroke of a thin label so its body can be taken', () => {
    const widths = doorHitWidths([
      edge('label#0', [
        [0, 0],
        [12, 0],
      ]),
      edge('label#1', [
        [12, 0],
        [12, 40],
      ]),
    ]);
    expect(widths.get('label')).toBe(4);
  });

  it('leaves a full-size piece at the default width', () => {
    const widths = doorHitWidths([
      edge('front#0', [
        [0, 0],
        [300, 0],
      ]),
      edge('front#1', [
        [300, 0],
        [300, 400],
      ]),
    ]);
    expect(widths.has('front')).toBe(false);
  });
});
