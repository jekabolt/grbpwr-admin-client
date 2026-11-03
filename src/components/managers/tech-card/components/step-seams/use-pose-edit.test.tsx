import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { poseRow } from 'lib/seams';

import { usePoseEdit } from './use-pose-edit';

const square = (key: string, size: number): PieceGeom =>
  ({
    pieceKey: key,
    name: key,
    hand: null,
    cloth: null,
    corners: [0, 1, 2, 3],
    edges: [],
    rect: true,
    twinOf: [],
    rs: [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ],
    notchIdx: [],
    perimMm: size * 4,
    areaMm2: size * size,
  }) as PieceGeom;

describe('usePoseEdit no-press invariant', () => {
  it('reads stored pose data without a write or pending edit', () => {
    const piece = square('PIECE', 20);
    const host = square('HOST', 100);
    const stored = poseRow({
      seamKey: 'stored-pose',
      piece,
      host,
      placement: { xMm: 5, yMm: 7, rotDeg: 12, flip: false },
    });
    const attach = vi.fn(async () => null);
    const attachPose = vi.fn(async () => true);
    let snapshot: ReturnType<typeof usePoseEdit> | undefined;

    function Harness() {
      snapshot = usePoseEdit({
        poseKeys: [stored.seamKey],
        poses: new Map([[stored.seamKey, stored]]),
        stepPicture: null,
        stepResult: undefined,
        stepRows: [],
        geoms: new Map([
          [piece.pieceKey, piece],
          [host.pieceKey, host],
        ]),
        grainDeg: undefined,
        busy: false,
        setBusy: vi.fn(),
        setRefused: vi.fn(),
        attach,
        attachPose,
      });
      return null;
    }

    renderToStaticMarkup(createElement(Harness));

    expect(snapshot?.ownPoseRows.size).toBe(1);
    expect(snapshot?.posing).toBe(false);
    expect(snapshot?.poseEdits.size).toBe(0);
    expect(attach).not.toHaveBeenCalled();
    expect(attachPose).not.toHaveBeenCalled();
  });
});
