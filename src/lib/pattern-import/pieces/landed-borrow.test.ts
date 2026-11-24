import { describe, expect, it } from 'vitest';

import type { Chain, ChainSet, PtMm } from 'lib/pattern-import/types';

import { landedBorrowWalls } from './landed-borrow';
import type { WallModel } from './walls';

const chain = (id: number, pts: PtMm[]): Chain =>
  ({ id, pts, closed: false, ranges: [], motif: null, style: 0, lengthMm: 0 }) as Chain;

const model = (byRank: number[][]): WallModel =>
  ({ mode: 'graded', byRank, n: byRank.length }) as WallModel;

const sheet = (chains: Chain[]): ChainSet => ({ chains }) as ChainSet;

const horiz = (id: number, x0: number, x1: number) =>
  chain(id, [
    { x: x0, y: 0 },
    { x: x1, y: 0 },
  ]);

const land = (id: number, x: number) =>
  chain(id, [
    { x, y: 10 },
    { x, y: 0 },
  ]);

describe('landedBorrowWalls', () => {
  it('borrows the stretch between two own landings when three other sizes run along it', () => {
    const chains = [
      land(0, 20),
      land(1, 80),
      horiz(2, 0, 100),
      horiz(3, 0, 100),
      horiz(4, 0, 100),
      horiz(5, 0, 100),
    ];
    const walls = landedBorrowWalls(sheet(chains), model([[0, 1], [2], [3], [4], [5]]));
    expect(walls[0].length).toBeGreaterThan(0);
    const xs = walls[0][0].pts.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(20, 1);
    expect(Math.max(...xs)).toBeCloseTo(80, 1);
  });

  it('does not borrow when only one other size runs along the line', () => {
    const chains = [land(0, 20), land(1, 80), horiz(2, 0, 100)];
    const walls = landedBorrowWalls(sheet(chains), model([[0, 1], [2]]));
    expect(walls[0]).toEqual([]);
  });

  it('keeps a short tail past the bundle up to the landing, and never the whole line', () => {
    const chains = [
      land(0, 20),
      land(1, 78),
      horiz(2, 0, 100),
      horiz(3, 0, 70),
      horiz(4, 0, 70),
      horiz(5, 0, 70),
    ];
    const walls = landedBorrowWalls(sheet(chains), model([[0, 1], [2], [3], [4], [5]]));
    expect(walls[0]).toHaveLength(1);
    const xs = walls[0][0].pts.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(20, 1);
    expect(Math.max(...xs)).toBeCloseTo(78, 1);
    const whole = landedBorrowWalls(
      sheet([
        land(0, 0),
        land(1, 100),
        horiz(2, 0, 100),
        horiz(3, 0, 100),
        horiz(4, 0, 100),
        horiz(5, 0, 100),
      ]),
      model([[0, 1], [2], [3], [4], [5]]),
    );
    expect(whole[0]).toEqual([]);
  });
});
