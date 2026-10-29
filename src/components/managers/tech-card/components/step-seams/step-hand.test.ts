import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { anchorOfRunId, fromWire, toWire, type StoredSeam } from 'lib/seams';

import {
  clampHandSlide,
  decodeHandPlace,
  handsFromSeams,
  snapHand,
  type HandPlace,
  withHandPlace,
} from './step-hand';

// A rectangle walked CCW from its bottom-left corner; edge 0 is its bottom seam.
function rect(key: string, width: number, height: number): PieceGeom {
  const ring: Pt2[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const edges = ring.map((point, k) => {
    const next = ring[(k + 1) % ring.length];
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    return {
      id: `${key}#${k}`,
      pieceKey: key,
      k,
      s: k,
      e: k + 1,
      pts: [point, next],
      lenMm: length,
      chordMm: length,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    } as Edge;
  });
  return {
    pieceKey: key,
    name: key,
    hand: 'none',
    cloth: null,
    rs: ring,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges,
    rect: true,
    areaMm2: width * height,
    perimMm: 2 * (width + height),
    twinOf: [],
  } as unknown as PieceGeom;
}

const endpoints = (run: readonly Pt2[]) => [run[0], run[run.length - 1]] as const;
const endpointError = (actual: readonly Pt2[], expected: readonly Pt2[]) => {
  const distance = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const direct = Math.max(distance(actual[0], expected[0]), distance(actual[1], expected[1]));
  const reverse = Math.max(distance(actual[0], expected[1]), distance(actual[1], expected[0]));
  return Math.min(direct, reverse);
};

describe('hand placement storage', () => {
  it('round-trips through the existing edge-anchor wire placement', () => {
    const part = rect('PART', 100, 60);
    const partner = rect('PARTNER', 160, 200);
    const hand: HandPlace = { inside: true, rotDeg: 270, flip: true, slideMm: -12.3 };
    const partAnchor = anchorOfRunId([part, partner], 'PART#0')!;
    const partnerAnchor = anchorOfRunId([part, partner], 'PARTNER#0')!;
    const row = withHandPlace(
      {
        seamKey: 'seam-hand',
        status: 'confirmed',
        kind: 'edge',
        direction: 'reversed',
        source: 'manual',
        sideA: [partAnchor],
        sideB: [partnerAnchor],
        anchoredSize: 'base',
        note: '',
      } satisfies StoredSeam,
      part.pieceKey,
      hand,
    );

    const read = fromWire(toWire(row))!;
    expect(decodeHandPlace(read.sideA[0].placement)).toEqual(hand);
    expect(handsFromSeams([read]).get(part.pieceKey)).toEqual(hand);
    expect(read.sideB[0].placement).toBeUndefined();
  });
});

describe('snapHand', () => {
  const part = rect('PART', 100, 60);
  const partner = rect('PARTNER', 100, 200);
  const partRun = part.edges[0].pts;
  const partnerRun = partner.edges[0].pts;
  const combinations = [false, true].flatMap((inside) =>
    [false, true].flatMap((flip) => [0, 90, 180, 270].map((rotDeg) => ({ inside, flip, rotDeg }))),
  );

  it.each(combinations)(
    'keeps both seam endpoints attached for inside=$inside flip=$flip rot=$rotDeg',
    ({ inside, flip, rotDeg }) => {
      const transform = snapHand(part, partner, partRun, partnerRun, {
        inside,
        flip,
        rotDeg,
        slideMm: 0,
      });
      const moved = endpoints(partRun).map((point) => apply(transform, point)) as [Pt2, Pt2];
      expect(endpointError(moved, endpoints(partnerRun))).toBeLessThan(0.5);
    },
  );

  it('clamps slide at both ends of the partner seam', () => {
    const longPartner = rect('LONG', 200, 200);
    const run = longPartner.edges[0].pts;
    expect(clampHandSlide(partRun, run, -1_000)).toBe(-50);
    expect(clampHandSlide(partRun, run, 1_000)).toBe(50);

    const atStart = snapHand(part, longPartner, partRun, run, {
      inside: false,
      flip: false,
      rotDeg: 0,
      slideMm: -1_000,
    });
    const atEnd = snapHand(part, longPartner, partRun, run, {
      inside: false,
      flip: false,
      rotDeg: 0,
      slideMm: 1_000,
    });
    expect(
      endpointError(endpoints(partRun).map((point) => apply(atStart, point)) as [Pt2, Pt2], [
        [0, 0],
        [100, 0],
      ]),
    ).toBeLessThan(0.5);
    expect(
      endpointError(endpoints(partRun).map((point) => apply(atEnd, point)) as [Pt2, Pt2], [
        [100, 0],
        [200, 0],
      ]),
    ).toBeLessThan(0.5);
  });

  it('re-snaps scaled pieces from their new runs', () => {
    const scaledPart = rect('PART_SCALED', 150, 90);
    const scaledPartner = rect('PARTNER_SCALED', 300, 300);
    const hand: HandPlace = { inside: true, flip: true, rotDeg: 180, slideMm: 25 };
    const transform = snapHand(
      scaledPart,
      scaledPartner,
      scaledPart.edges[0].pts,
      scaledPartner.edges[0].pts,
      hand,
    );
    const moved = endpoints(scaledPart.edges[0].pts).map((point) => apply(transform, point)) as [
      Pt2,
      Pt2,
    ];
    expect(
      endpointError(moved, [
        [100, 0],
        [250, 0],
      ]),
    ).toBeLessThan(0.5);
  });
});
