import { expect, it } from 'vitest';
import type { Chain } from '../types';
import { keyedFragmentLoop } from './recover';

it('requires reciprocal, unique end pairs around the entire keyed row', () => {
  const chain = (id: number, x: number, y: number, u: number, v: number): Chain => ({
    id,
    closed: false,
    style: 1,
    motif: [1.75, 0.5],
    ranges: [],
    pts: [
      { x, y },
      { x: u, y: v },
    ],
    lengthMm: Math.hypot(u - x, v - y),
  });
  const edges = [
    chain(0, 0, 1, 0, 99),
    chain(1, 1, 100, 99, 100),
    chain(2, 100, 99, 100, 1),
    chain(3, 99, 0, 1, 0),
  ];
  expect(keyedFragmentLoop(0, edges, 2)).toBe(true);
  expect(keyedFragmentLoop(0, edges.slice(0, 3), 2)).toBe(false);
  expect(keyedFragmentLoop(0, [...edges, chain(4, 0, 2, 25, 25)], 2)).toBe(false);
});
