import { describe, expect, it } from 'vitest';

import {
  cycleLayerHit,
  pendingStacking,
  piecesUnder,
  posePieceOrder,
  snapAtDuringDrag,
  type PosePieceRing,
} from './pose-picking';

const square = (piece: string, x: number, y: number, size: number): PosePieceRing => ({
  piece,
  ring: [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ],
});

describe('PLACE piece picking', () => {
  it('uses the picture paint order and returns overlapping pieces topmost first', () => {
    const order = posePieceOrder(
      ['BOTTOM', 'STACK_HOST', 'STACK_TWIN', 'TOP'],
      [['STACK_HOST', 'STACK_TWIN']],
      ['BOTTOM', 'STACK_HOST', 'STACK_TWIN', 'TOP'],
      ['BOTTOM'],
    );
    expect(order).toEqual(['BOTTOM', 'STACK_TWIN', 'STACK_HOST', 'TOP']);

    const rings = order.map((piece) => square(piece, 0, 0, 20));
    expect(piecesUnder([10, 10], rings)).toEqual(['TOP', 'STACK_HOST', 'STACK_TWIN', 'BOTTOM']);
    expect(piecesUnder([30, 30], rings)).toEqual([]);
  });

  it('starts on top, walks down at the same spot, then wraps', () => {
    const hits = ['TOP', 'MIDDLE', 'BOTTOM'];
    const at: [number, number] = [100, 80];
    expect(cycleLayerHit(hits, at, null)).toBe('TOP');
    expect(cycleLayerHit(hits, at, { piece: 'TOP', at })).toBe('MIDDLE');
    expect(cycleLayerHit(hits, [103, 82], { piece: 'MIDDLE', at })).toBe('BOTTOM');
    expect(cycleLayerHit(hits, at, { piece: 'BOTTOM', at })).toBe('TOP');
  });

  it('restarts on top after a drag or a click away from the previous spot', () => {
    const hits = ['TOP', 'BOTTOM'];
    expect(cycleLayerHit(hits, [20, 20], { piece: 'TOP', at: [10, 10] })).toBe('TOP');
    expect(cycleLayerHit(hits, [10, 10], null)).toBe('TOP');
  });
});

describe('PLACE snap marker', () => {
  it('is absent at rest, present for a snapping drag, and absent after drop', () => {
    expect(snapAtDuringDrag(null)).toBeNull();
    expect(snapAtDuringDrag({ snap: { at: [12, 34] } })).toEqual([12, 34]);
    expect(snapAtDuringDrag(null)).toBeNull();
  });

  it('stays absent while a drag has no snap candidate', () => {
    expect(snapAtDuringDrag({ snap: null })).toBeNull();
  });
});

describe('pendingStacking', () => {
  const base = { layers: ['SLV', 'PLK'], lower: [], stacked: [] as [string, string][] };

  it('a fresh «under» before save claims the pair, so only the overlap is grey', () => {
    const shown = pendingStacking(base, [{ piece: 'SLV', host: 'PLK', under: true }]);
    expect(shown.stacked).toEqual([['SLV', 'PLK']]);
    expect(shown.lower).toEqual(['SLV']);
    expect(shown.layers).toEqual(['SLV', 'PLK']);
  });

  it('«over» replaces the reverse claim instead of adding a second one', () => {
    const shown = pendingStacking(
      { layers: ['SLV', 'PLK'], lower: ['SLV'], stacked: [['SLV', 'PLK']] },
      [{ piece: 'SLV', host: 'PLK', under: false }],
    );
    expect(shown.stacked).toEqual([['PLK', 'SLV']]);
    expect(shown.lower).toEqual([]);
    expect(shown.layers).toEqual(['PLK', 'SLV']);
  });

  it('a cleared switch drops the piece’s claims and grey', () => {
    const shown = pendingStacking(
      { layers: ['SLV', 'PLK'], lower: ['SLV'], stacked: [['SLV', 'PLK']] },
      [{ piece: 'SLV', under: null }],
    );
    expect(shown.stacked).toEqual([]);
    expect(shown.lower).toEqual([]);
  });

  it('no switches keep the shared result as it is', () => {
    const stored = {
      layers: ['A', 'B'],
      lower: ['A'],
      stacked: [['A', 'B']] as [string, string][],
    };
    expect(pendingStacking(stored, [])).toEqual(stored);
  });
});
