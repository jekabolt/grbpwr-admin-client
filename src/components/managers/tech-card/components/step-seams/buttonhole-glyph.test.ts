import { describe, expect, it } from 'vitest';

import type { PieceGeom, PieceMark, Pt2 } from 'lib/assembly-skeleton/types';

import {
  buttonholeDirection,
  buttonholeLengthMm,
  buttonholePictureGlyphs,
  fasteningPictureGlyphs,
  isFrontHost,
  placementPictureGlyphsForStep,
  selectPlacementMarks,
  walkPlacementMarks,
  type PlacementMarkHost,
  type PlacementMarkStep,
} from './buttonhole-glyph';

const placket = {
  pieceKey: 'PLCK_R',
  name: 'right placket',
  hand: 'R',
  cloth: 'main',
  rs: [
    [0, 0],
    [10, 0],
    [10, 100],
    [0, 100],
  ] as Pt2[],
  corners: [0, 1, 2, 3],
  notchIdx: [],
  edges: [],
  rect: true,
  areaMm2: 1000,
  perimMm: 220,
  twinOf: [],
  marks: [20, 50, 80].map((y, index) => ({
    id: `PLCK_R@${index}`,
    kind: 'buttonhole' as const,
    layer: '8',
    closed: false,
    pts: [
      [5, y - 2],
      [5, y + 2],
    ] as Pt2[],
    bbox: { w: 0, h: 4, cx: 5, cy: y },
    lenMm: 4,
  })),
} satisfies PieceGeom;

describe('buttonhole glyph geometry', () => {
  it('reads the operation length and keeps the 12 mm fallback', () => {
    expect(buttonholeLengthMm({ cutLengthMm: '18,5' })).toBe(18.5);
    expect(buttonholeLengthMm({ fastening: { cutLengthMm: { value: '16' } } })).toBe(16);
    expect(buttonholeLengthMm(undefined)).toBe(12);
  });

  it('orients horizontal and unset slits across the host long axis', () => {
    const horizontal = buttonholeDirection(
      placket.rs,
      'TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL',
    );
    const unset = buttonholeDirection(placket.rs, 'TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN');
    const vertical = buttonholeDirection(placket.rs, 'TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL');

    expect(Math.abs(horizontal[0])).toBeCloseTo(1);
    expect(Math.abs(horizontal[1])).toBeCloseTo(0);
    expect(unset).toEqual(horizontal);
    expect(Math.abs(vertical[0])).toBeCloseTo(0);
    expect(Math.abs(vertical[1])).toBeCloseTo(1);
  });

  it('uses classified marks, the operation count, and the operation cut length', () => {
    const glyphs = buttonholePictureGlyphs(
      {
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
        placementCount: 2,
        cutLengthMm: '14',
        buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL',
      },
      [placket.pieceKey],
      new Map([[placket.pieceKey, placket]]),
    );

    expect(glyphs).toHaveLength(2);
    expect(glyphs.map((glyph) => glyph.point)).toEqual([
      [5, 20],
      [5, 50],
    ]);
    expect(glyphs.every((glyph) => glyph.lengthMm === 14)).toBe(true);
    expect(glyphs.every((glyph) => Math.abs(glyph.direction[0]) > 0.999)).toBe(true);
  });

  it('uses drill marks for the button-attach step', () => {
    const buttonHost = {
      ...placket,
      marks: placket.marks.map((mark) => ({ ...mark, kind: 'drill' as const })),
    } satisfies PieceGeom;
    const glyphs = fasteningPictureGlyphs(
      {
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
        placementCount: 2,
      },
      [buttonHost.pieceKey],
      new Map([[buttonHost.pieceKey, buttonHost]]),
    );

    expect(glyphs.map((glyph) => glyph.kind)).toEqual(['button', 'button']);
    expect(glyphs.map((glyph) => glyph.point)).toEqual([
      [5, 20],
      [5, 50],
    ]);
  });
});

describe('isFrontHost', () => {
  it('takes a front or a placket by its whole code', () => {
    for (const code of ['P_L_MAIN', 'P_R_U', 'PLCK_L', 'front panel'])
      expect(isFrontHost(code)).toBe(true);
  });

  it('does not read a cuff placket as a front', () => {
    for (const code of ['FLP_L', 'FLP_R_MAIN', 'nck', 'PCK_L_MAIN', 'BP_U'])
      expect(isFrontHost(code)).toBe(false);
  });
});

const placementMark = (
  piece: string,
  index: number,
  kind: PieceMark['kind'],
  x: number,
  y: number,
): PieceMark => ({
  id: `${piece}@${index}`,
  kind,
  layer: 'mark',
  closed: kind === 'drill',
  pts: [
    [x, y - 1],
    [x, y + 1],
  ],
  bbox: { w: 0, h: 2, cx: x, cy: y },
  lenMm: 2,
});

const placementHost = (
  key: string,
  marks: readonly PieceMark[],
  name = key,
): PlacementMarkHost => ({
  key,
  code: key,
  name,
  geom: {
    ...placket,
    pieceKey: key,
    name,
    marks: [...marks],
  },
});

const semaphoreHosts = () => {
  const column = (piece: string, kind: PieceMark['kind'], count: number, x: number) =>
    Array.from({ length: count }, (_, index) =>
      placementMark(piece, index, kind, x, 10 + index * 25),
    );
  return [
    placementHost('PLCK', column('PLCK', 'drill', 9, 17)),
    placementHost('CLR', [
      ...column('CLR', 'buttonhole', 2, 50),
      ...column('CLR_DRILL', 'drill', 2, 55).map((mark, index) => ({
        ...mark,
        id: `CLR@${index + 2}`,
      })),
    ]),
    placementHost(
      'FR',
      [
        placementMark('FR', 0, 'buttonhole', 273, 5),
        ...column('FR_DRILL', 'drill', 7, 273).map((mark, index) => ({
          ...mark,
          id: `FR@${index + 1}`,
        })),
      ],
      'front right',
    ),
    placementHost('FL', [placementMark('FL', 0, 'buttonhole', 10, 10)], 'front left'),
  ];
};

const semaphoreSteps = (): PlacementMarkStep[] => {
  const hosts = semaphoreHosts();
  return [
    {
      operation: {
        work: 'button_attach',
        zone: 'TECH_CARD_GARMENT_ZONE_CLOSURE',
        placementLayout: { count: 7 },
      },
      hosts,
    },
    {
      operation: {
        work: 'button_attach',
        zone: 'TECH_CARD_GARMENT_ZONE_COLLAR',
        placementLayout: { count: 7 },
      },
      hosts,
    },
    {
      operation: {
        work: 'buttonhole',
        zone: 'TECH_CARD_GARMENT_ZONE_COLLAR',
        placementLayout: { count: 1 },
      },
      hosts,
    },
  ];
};

describe('shared placement mark selector', () => {
  it('walks the Semaphore distribution from PLCK to all seven FR drills, then CLR', () => {
    const selected = walkPlacementMarks(semaphoreSteps());

    expect(selected[0]?.host.key).toBe('PLCK');
    expect(selected[0]?.marks).toHaveLength(7);
    expect(selected[1]?.host.key).toBe('FR');
    expect(selected[1]?.marks).toHaveLength(7);
    expect(selected[1]?.marks.every((mark) => mark.bbox.cx === 273)).toBe(true);
    expect(selected[2]?.host.key).toBe('CLR');
    expect(selected[2]?.marks).toHaveLength(1);
    expect(selected[2]?.marks[0].kind).toBe('buttonhole');
  });

  it('keeps a seven-mark fastening on the front when the named collar lacks seven marks', () => {
    const hosts = semaphoreHosts();
    const selected = selectPlacementMarks(
      {
        work: 'button_attach',
        zone: 'TECH_CARD_GARMENT_ZONE_COLLAR',
        placementLayout: { count: 7 },
      },
      hosts,
      new Set(hosts[0].geom.marks?.slice(0, 7).map((mark) => mark.id)),
    );

    expect(selected?.host.key).toBe('FR');
    expect(selected?.marks).toHaveLength(7);
  });

  it('prefers any exact host to a higher-scoring fallback and uses fallback when none is exact', () => {
    const plck = placementHost('PLCK', [placementMark('PLCK', 0, 'drill', 5, 20)]);
    const collar = placementHost('CLR', [placementMark('CLR', 0, 'buttonhole', 5, 20)]);
    const operation = { work: 'buttonhole', placementLayout: { count: 1 } };

    expect(selectPlacementMarks(operation, [plck, collar])?.host.key).toBe('CLR');
    expect(selectPlacementMarks(operation, [plck])?.host.key).toBe('PLCK');
    expect(selectPlacementMarks(operation, [plck])?.exact).toBe(false);
  });

  it('breaks an equal score by the less used host, whatever the host order', () => {
    const holes = placementHost('PLCK_L', [
      placementMark('PLCK_L', 0, 'drill', 5, 20),
      placementMark('PLCK_L', 1, 'drill', 5, 40),
      placementMark('PLCK_L', 2, 'drill', 55, 20),
    ]);
    const buttons = placementHost('PLCK_R', [placementMark('PLCK_R', 0, 'drill', 5, 20)]);
    const operation = { work: 'button_attach', placementLayout: { count: 1 } };
    const used = new Set(holes.geom.marks?.slice(0, 2).map((mark) => mark.id));

    expect(selectPlacementMarks(operation, [holes, buttons], used)?.host.key).toBe('PLCK_R');
    expect(selectPlacementMarks(operation, [buttons, holes], used)?.host.key).toBe('PLCK_R');
    expect(selectPlacementMarks(operation, [buttons, holes])?.host.key).toBe('PLCK_L');
  });

  it('keeps a collar button on the twin that holds the hole, at the other end', () => {
    const collar = (key: string) =>
      placementHost(key, [
        placementMark(key, 0, 'buttonhole', 400, 20),
        placementMark(key, 1, 'drill', 418, 20),
        placementMark(key, 2, 'drill', 17, 20),
      ]);
    const twins = [collar('CLR_1'), collar('CLR')];
    const hole = { work: 'buttonhole', zone: 'collar', placementLayout: { count: 1 } };
    const button = { work: 'button_attach', zone: 'collar', placementLayout: { count: 1 } };

    for (const hosts of [twins, [...twins].reverse()]) {
      const [first, second] = walkPlacementMarks([
        { operation: hole, hosts },
        { operation: button, hosts },
      ]);
      expect(first?.host.key).toBe('CLR');
      expect(second?.host.key).toBe('CLR');
      expect(second?.marks[0].bbox.cx).toBe(17);
    }
  });

  it('excludes used marks and chooses the end away from a consumed partner', () => {
    const near = placementMark('CLR', 0, 'drill', 5, 5);
    const far = placementMark('CLR', 1, 'drill', 5, 95);
    const hole = placementMark('CLR', 2, 'buttonhole', 5, 2);
    const collar = placementHost('CLR', [near, far, hole]);
    const selected = selectPlacementMarks(
      { work: 'button_attach', placementLayout: { count: 1 } },
      [collar],
      new Set([hole.id]),
    );
    const afterFarIsUsed = selectPlacementMarks(
      { work: 'button_attach', placementLayout: { count: 1 } },
      [collar],
      new Set([hole.id, far.id]),
    );

    expect(selected?.marks.map((mark) => mark.id)).toEqual([far.id]);
    expect(afterFarIsUsed?.marks.map((mark) => mark.id)).toEqual([near.id]);
  });

  it('keeps editor and PDF entry results identical for every walked operation', () => {
    const steps = semaphoreSteps();
    const pdf = walkPlacementMarks(steps);

    steps.forEach((_, index) => {
      const editor = placementPictureGlyphsForStep(steps, index);
      expect(editor.map((glyph) => glyph.piece)).toEqual(
        pdf[index]?.marks.map(() => pdf[index]!.host.key) ?? [],
      );
      expect(editor.map((glyph) => glyph.id)).toEqual(
        pdf[index]?.marks.map((mark) => mark.id) ?? [],
      );
    });
  });
});
