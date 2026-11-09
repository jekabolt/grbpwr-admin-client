import { describe, expect, it } from 'vitest';

import { syncTopstitchLineMm } from './topstitch-line-mm-sync';
import type { TopstitchLine, TopstitchOperation } from './topstitch-lines';

const line = {
  lineKey: 'line-a',
  bomLineKey: 'thread-a',
  anchoredSize: 'M',
  rows: 1,
  parts: [],
  sizes: [{ sizeId: 1, lineMm: 'old' }],
} as TopstitchLine;
const operation = { topstitchLines: [line] } as TopstitchOperation;

describe('syncTopstitchLineMm', () => {
  it('writes one-sided per-size lengths and marks a remeasurement', () => {
    const result = syncTopstitchLineMm(
      [operation],
      [1, 2],
      () =>
        new Map([
          [1, 240.5],
          [2, 252],
        ]),
    );
    expect(result.changed).toEqual([0]);
    expect(result.operations[0].topstitchLines?.[0]).toMatchObject({
      measured: true,
      sizes: [
        { sizeId: 1, lineMm: '240.5' },
        { sizeId: 2, lineMm: '252' },
      ],
    });
  });

  it('leaves identical measurements alone', () => {
    const current = {
      ...operation,
      topstitchLines: [{ ...line, sizes: [{ sizeId: 1, lineMm: '240.5' }] }],
    } as TopstitchOperation;
    const result = syncTopstitchLineMm([current], [1], () => new Map([[1, 240.5]]));
    expect(result.changed).toEqual([]);
    expect(result.operations[0]).toBe(current);
  });

  it('stores no numbers when the pattern has no measurable edge', () => {
    const result = syncTopstitchLineMm([operation], [1], () => undefined);
    expect(result.operations[0].topstitchLines?.[0]).toMatchObject({ sizes: [], measured: true });
  });
});
