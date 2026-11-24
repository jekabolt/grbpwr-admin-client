import { expect, it } from 'vitest';
import { chromeProblems } from './checks';
import type { RawEntity } from './reader';

it('distinguishes a nearby registration mark only when the full written cut follows an independently keyed source boundary', () => {
  const pt = (x: number, y: number) => ({ x, y });
  const cut = [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100)];
  const raw: RawEntity[] = [{ type: 'POLYLINE', layer: '1', closed: true, pts: cut }];
  const mark = (x: number) => [{ mark: true, pts: [pt(x, 25), pt(x, 45)] }];
  expect(chromeProblems(raw, mark(0.16)).block).toHaveLength(1);
  expect(chromeProblems(raw, mark(0.16), false, cut).block).toEqual([]);
  expect(chromeProblems(raw, mark(0), false, cut).block).toHaveLength(1);
  expect(chromeProblems(raw, mark(0.06), false, cut).block).toHaveLength(1);
  const unrelated = [...cut];
  unrelated[1] = pt(98, 0);
  expect(chromeProblems(raw, mark(0.16), false, unrelated).block).toHaveLength(1);
  expect(chromeProblems([{ ...raw[0], layer: '14' }], mark(0.16), false, cut).block).toHaveLength(
    1,
  );
});
