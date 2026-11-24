import { expect, it } from 'vitest';

import type { Chain, Style } from 'lib/pattern-import/types';

import { cappedLegendSample } from './recover';

it('reads the declared rhythm between equal solid caps in a printed size key', () => {
  const line = (id: number, x: number, end: number, style: number): Chain => ({
    id,
    pts: [
      { x, y: 1 },
      { x: end, y: 1 },
    ],
    style,
    closed: false,
    lengthMm: end - x,
    motif: null,
    ranges: [],
  });
  const pen: Style = {
    id: 0,
    widthMm: 0.53,
    strokeRgb: [44, 46, 53],
    fill: false,
    dash: null,
    layer: null,
    clip: null,
  };
  const styles = new Map([
    [0, pen],
    [1, { ...pen, id: 1, dash: [24.84, 1.66, 0.41, 1.66] }],
  ]);
  const cap = line(0, 0, 10.58, 0);
  const body = line(1, 14.31, 42.05, 1);
  const tail = line(2, 42.88, 53.46, 0);
  expect(cappedLegendSample(cap, [cap, body, tail], styles)).toBe(body);
  expect(cappedLegendSample(cap, [cap, body], styles)).toBeUndefined();
  const otherRow = { ...body, pts: body.pts.map((p) => ({ ...p, y: 3 })) };
  expect(cappedLegendSample(cap, [cap, otherRow, tail], styles)).toBeUndefined();
});
