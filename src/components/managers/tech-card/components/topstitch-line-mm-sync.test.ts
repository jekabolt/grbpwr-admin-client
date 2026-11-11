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

  it('leaves the stored lengths and the stale mark alone when the pattern cannot be read', () => {
    const stale = {
      ...operation,
      topstitchLines: [{ ...line, sizes: [{ sizeId: 1, lineMm: '240.5' }], stale: true }],
    } as TopstitchOperation;
    const result = syncTopstitchLineMm([stale], [1], () => undefined);
    expect(result.changed).toEqual([]);
    expect(result.operations[0]).toBe(stale);
  });

  it('re-measures a stale line whose lengths did not change, so the server stamps it fresh', () => {
    const stale = {
      ...operation,
      topstitchLines: [{ ...line, sizes: [{ sizeId: 1, lineMm: '240.5' }], stale: true }],
    } as TopstitchOperation;
    const result = syncTopstitchLineMm([stale], [1], () => new Map([[1, 240.5]]));
    expect(result.changed).toEqual([0]);
    expect(result.operations[0].topstitchLines?.[0]).toMatchObject({
      measured: true,
      stale: false,
      sizes: [{ sizeId: 1, lineMm: '240.5' }],
    });
  });

  it('does not rewrite a line when the card lists its sizes out of id order', () => {
    // The server stores and returns rows by ascending size_id; the card range may be [2, 1].
    const current = {
      ...operation,
      topstitchLines: [
        {
          ...line,
          sizes: [
            { sizeId: 1, lineMm: '240.5' },
            { sizeId: 2, lineMm: '252' },
          ],
        },
      ],
    } as TopstitchOperation;
    const result = syncTopstitchLineMm(
      [current],
      [2, 1],
      () =>
        new Map([
          [1, 240.5],
          [2, 252],
        ]),
    );
    expect(result.changed).toEqual([]);
    expect(result.operations[0]).toBe(current);
  });
});
