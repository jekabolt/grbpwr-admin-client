import { describe, expect, it, vi } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import * as seamLength from 'components/managers/tech-card/components/step-seams/seam-length';
import { surfaceRow } from 'components/managers/tech-card/components/step-seams/step-seams-model';
import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { anchorOfRunId, toWire, type StoredSeam } from 'lib/seams';

import { card83RealFixture } from './assembly-inference.fixture';
import { actionPartOfTarget, deriveAssembly, type AsmPiece } from './derive-assembly';
import { createPdfT } from './i18n';
import { ownerLayoutsByNumber, ownerStepResultsOfCard } from './owner-step-results';

vi.mock(
  'components/managers/tech-card/components/step-seams/seam-length',
  async (importOriginal) => {
    const actual = await importOriginal<typeof seamLength>();
    return { ...actual, sideLengthMm: vi.fn(actual.sideLengthMm) };
  },
);

describe('assembly seam lengths', () => {
  it('reads a stretch laid on another piece on the editor step picture, not the print layout', () => {
    const input = card83RealFixture();
    const editor = ownerLayoutsByNumber(
      ownerStepResultsOfCard(input.techCard, input.techCard, input.pieces, input.grainDeg),
    ).get(400);
    expect(editor?.size).toBeGreaterThan(1);

    const spy = vi.mocked(seamLength.sideLengthMm);
    spy.mockClear();
    const model = deriveAssembly({ ...input, t: createPdfT('ru') });
    expect(model.cards.get(400)?.metrics).toHaveLength(1);

    const neckline = model.cards.get(400)!.seams[0].b;
    const targets = neckline.map((part) => part.edgeId).join(' ');
    const placed = spy.mock.calls.find(
      ([parts]) => parts.map((part) => part.target).join(' ') === targets,
    )?.[3]?.placed;
    expect(placed).toBeDefined();
    for (const { piece } of neckline) expect(placed?.get(piece)).toEqual(editor?.get(piece));
  });
});

describe('assembly inner contour ranges', () => {
  it('slices the inner range used by the PDF action', () => {
    const piece = {
      key: 'HOST',
      inner: [
        [
          [0, 0],
          [140, 0],
          [140, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    } as AsmPiece;
    const part = actionPartOfTarget('HOST:i0', new Map([['HOST', piece]]), [140, 150]);

    expect(part?.pts).toEqual([
      [140, 0],
      [140, 10],
    ]);
    expect(part?.lenMm).toBe(10);
    expect(part?.share).toBeCloseTo(1 / 30, 6);
  });

  const geom = (key: string, width: number, height: number): PieceGeom => {
    const rs: Pt2[] = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
    const edges = rs.map((point, index): Edge => {
      const next = rs[(index + 1) % rs.length];
      const lenMm = Math.hypot(next[0] - point[0], next[1] - point[1]);
      return {
        id: `${key}#${index}`,
        pieceKey: key,
        k: index,
        s: index,
        e: index + 1,
        pts: [point, next],
        lenMm,
        chordMm: lenMm,
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
      rs,
      corners: [0, 1, 2, 3],
      notchIdx: [],
      edges,
      rect: true,
      areaMm2: width * height,
      perimMm: 2 * (width + height),
      twinOf: [],
    } as unknown as PieceGeom;
  };

  const surfaceInput = (
    ranges: readonly (readonly [number, number])[],
    mutate?: (row: StoredSeam) => void,
    partWidth = 40,
  ) => {
    const hostGeom = geom('HOST', 200, 100);
    const partGeom = geom('PART', partWidth, 20);
    const line: Pt2[] = [
      [0, 0],
      [140, 0],
      [140, 10],
      [0, 10],
      [0, 0],
    ];
    const row = surfaceRow(
      { geom: hostGeom, k: 0, line, grainDeg: 0 },
      [anchorOfRunId([hostGeom, partGeom], 'PART#0')!],
      undefined,
      'surface-ranges',
    )!;
    const hostAnchor = row.sideA[0];
    row.sideA = ranges.map((range) => ({ ...hostAnchor, range: [...range] as [number, number] }));
    mutate?.(row);
    const pieces = new Map<string, AsmPiece>([
      [
        'HOST',
        {
          key: 'HOST',
          name: 'HOST',
          cut: hostGeom.rs.map(([x, y]) => [x, -y]),
          inner: [line],
          notch: [],
          pocketing: false,
          area: hostGeom.areaMm2,
          geom: hostGeom,
        },
      ],
      [
        'PART',
        {
          key: 'PART',
          name: 'PART',
          cut: partGeom.rs.map(([x, y]) => [x, -y]),
          inner: [
            [
              [0, 0],
              [partWidth, 0],
            ],
          ],
          notch: [],
          pocketing: false,
          area: partGeom.areaMm2,
          geom: partGeom,
        },
      ],
    ]);
    const techCard = {
      techCard: {
        pieces: [...pieces.values()].map((piece) => ({ lineKey: piece.key, name: piece.name })),
        operations: [
          {
            operationNumber: 1,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'join_lockstitch',
            inputKeys: ['HOST', 'PART'],
            pieceLineKeys: ['HOST', 'PART'],
            outputUnitKey: 'UNIT',
            seamKeys: [row.seamKey],
          },
        ],
      },
      seams: [toWire(row)],
    } as unknown as common_TechCard;
    return { techCard, pieces, grainDeg: new Map<string, number>() };
  };

  it('draws disjoint stored inner ranges as separate PDF paths and sums only their lengths', () => {
    const model = deriveAssembly(
      surfaceInput([
        [0, 0.1],
        [0.5, 0.6],
      ]),
      undefined,
      {
        globalAssembly: false,
      },
    );
    const seam = model.cards.get(1)?.seams[0];

    expect(seam?.a.map((part) => part.lenMm)).toEqual([30, 30]);
    expect(seam?.a.reduce((sum, part) => sum + part.lenMm, 0)).toBe(60);
  });

  it.each([
    ['exact shares', 140 / 300, 290 / 300],
    // What the server holds: shares rounded to 1e-4 run a hair (0.01 mm) past the corner.
    ['stored rounded shares', 0.4667, 0.9667],
  ])(
    'lays a straight partner on the longer leg of a sharp inner-contour stretch: %s',
    (_, to, from) => {
      const input = surfaceInput(
        [
          [0, to],
          [from, 1],
        ],
        undefined,
        150,
      );
      const card = deriveAssembly(input, undefined, { globalAssembly: false }).cards.get(1)!;
      const host = card.items.find((item) => item.p === 'HOST')!;
      const part = card.items.find((item) => item.p === 'PART')!;
      const transform = (matrix: typeof host.T, point: Pt2): Pt2 => [
        matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
        matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
      ];
      const leg = [transform(host.T, [0, 0]), transform(host.T, [140, 0])] as const;
      const partner = [transform(part.T, [0, 0]), transform(part.T, [150, 0])] as const;
      const distanceToLeg = (point: Pt2) => {
        const dx = leg[1][0] - leg[0][0];
        const dy = leg[1][1] - leg[0][1];
        return Math.abs(dy * (point[0] - leg[0][0]) - dx * (point[1] - leg[0][1])) / 140;
      };

      expect(Math.max(...partner.map(distanceToLeg))).toBeLessThan(1e-6);
      expect(
        Math.min(...partner.map((point) => Math.hypot(point[0] - leg[1][0], point[1] - leg[1][1]))),
      ).toBeLessThan(1e-6);
    },
  );

  it('names a side of a closed inner contour without the slit word', () => {
    const model = deriveAssembly(surfaceInput([[0, 0.4667]]), undefined, { globalAssembly: false });
    const seam = model.cards.get(1)?.seams[0];

    expect(seam?.surfaceRole).toBe('inner');
  });

  it('keeps the slit word for an open inner line', () => {
    const input = surfaceInput([[0, 1]]);
    input.pieces.get('HOST')!.inner = [
      [
        [0, 0],
        [140, 0],
      ],
    ];
    const model = deriveAssembly(input, undefined, { globalAssembly: false });
    const seam = model.cards.get(1)?.seams[0];

    expect(seam?.surfaceRole).toBeUndefined();
  });

  it('uses only inner anchors with the selected piece and iK hint', () => {
    const input = surfaceInput([[0.1, 0.2]], (row) => {
      row.sideA.push({ ...row.sideA[0], edgeHint: 'i1', range: [0.5, 0.6] });
      row.sideB.push({ ...row.sideA[0], piece: 'PART', range: [0.7, 0.8] });
    });
    const model = deriveAssembly(input, undefined, { globalAssembly: false });
    const seam = model.cards.get(1)?.seams[0];

    expect(seam?.a).toHaveLength(1);
    expect(seam?.a[0].lenMm).toBeCloseTo(30, 6);
  });
});
