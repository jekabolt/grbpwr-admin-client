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
  it('draws every real mark and reports a count shortfall', () => {
    const marks = Array.from({ length: 7 }, (_, index) =>
      placementMark('FRONT', index, 'buttonhole', 5, 10 + index * 10),
    );
    const selected = selectPlacementMarks(
      { work: 'buttonhole', zone: 'front', placementLayout: { count: 8 } },
      [placementHost('FRONT', marks, 'front')],
    );

    expect(selected?.marks).toHaveLength(7);
    expect(selected?.marks.map((mark) => mark.id)).toEqual(marks.map((mark) => mark.id));
    expect(selected?.issue).toBe('count-exceeds-marks');
  });

  it('uses one deterministic mark per fastening when no count is set', () => {
    const collar = placementHost('CLR', [
      placementMark('CLR', 0, 'buttonhole', 10, 20),
      placementMark('CLR', 1, 'buttonhole', 90, 20),
      placementMark('CLR', 2, 'drill', 12, 20),
      placementMark('CLR', 3, 'drill', 88, 20),
    ]);
    const [hole, button] = walkPlacementMarks([
      { operation: { work: 'buttonhole', zone: 'collar' }, hosts: [collar] },
      { operation: { work: 'button_attach', zone: 'collar' }, hosts: [collar] },
    ]);

    expect(hole?.marks.map((mark) => mark.bbox.cx)).toEqual([10]);
    expect(button?.marks.map((mark) => mark.bbox.cx)).toEqual([88]);
  });

  it('rejects marks outside a specific zone but preserves generic-zone selection', () => {
    const front = placementHost('FRONT', [], 'front');
    const sleeve = placementHost('SLV', [placementMark('SLV', 0, 'buttonhole', 5, 20)], 'sleeve');
    const operation = { work: 'buttonhole', zone: 'front', placementLayout: { count: 1 } };

    const unrelated = selectPlacementMarks(operation, [front, sleeve]);
    expect(unrelated?.marks).toEqual([]);
    expect(unrelated?.issue).toBe('marks-outside-zone');
    for (const zone of [
      undefined,
      'TECH_CARD_GARMENT_ZONE_OTHER',
      'TECH_CARD_GARMENT_ZONE_OUTER',
      'TECH_CARD_GARMENT_ZONE_LINING',
    ]) {
      const generic = selectPlacementMarks({ ...operation, zone }, [front, sleeve]);
      expect(generic?.host.key, String(zone)).toBe('SLV');
      expect(generic?.marks).toHaveLength(1);
    }
  });

  it('reads short piece codes by role, so a front or waistband is not called unrelated', () => {
    const front = placementHost('FR', [placementMark('FR', 0, 'drill', 5, 20)], 'FR');
    const waist = placementHost('WS', [placementMark('WS', 0, 'buttonhole', 5, 20)], 'WS');

    const onFront = selectPlacementMarks({ work: 'button_attach', zone: 'front' }, [front]);
    const onWaist = selectPlacementMarks({ work: 'buttonhole', zone: 'waist' }, [waist]);

    expect(onFront?.issue).toBeUndefined();
    expect(onFront?.marks).toHaveLength(1);
    expect(onWaist?.issue).toBeUndefined();
    expect(onWaist?.marks).toHaveLength(1);
  });

  it('keeps a piece with an unread name: no evidence that it is unrelated', () => {
    const plank = placementHost('plank', [placementMark('plank', 0, 'drill', 5, 20)], 'plank');
    const selected = selectPlacementMarks({ work: 'button_attach', zone: 'front' }, [plank]);

    expect(selected?.issue).toBeUndefined();
    expect(selected?.marks).toHaveLength(1);
  });

  it('never moves a closure to an unrelated exact mark past a wrong mark on the right piece', () => {
    const front = placementHost('P_L', [placementMark('P_L', 0, 'buttonhole', 5, 20)], 'P_L');
    const pocket = placementHost('PCK_X', [placementMark('PCK_X', 0, 'drill', 5, 20)], 'PCK_X');

    const selected = selectPlacementMarks({ work: 'button_attach', zone: 'front' }, [
      front,
      pocket,
    ]);

    expect(selected?.marks).toEqual([]);
    expect(selected?.issue).toBe('marks-outside-zone');
  });

  it('does not spill to a sleeve once the placket marks are used up', () => {
    const placketMark = placementMark('PLCK', 0, 'drill', 5, 20);
    const placket = placementHost('PLCK', [placketMark], 'PLCK');
    const sleeve = placementHost('SLV', [placementMark('SLV', 0, 'drill', 5, 20)], 'SLV');

    const selected = selectPlacementMarks(
      { work: 'button_attach', zone: 'front' },
      [placket, sleeve],
      new Set([placketMark.id]),
    );

    expect(selected?.marks).toEqual([]);
    expect(selected?.issue).toBe('marks-outside-zone');
  });

  it('leaves labels out of the closure rules: every mark, on any piece', () => {
    const marks = [0, 1, 2].map((index) => placementMark('BP', index, 'placement', 5, 10 + index));
    const selected = selectPlacementMarks({ work: 'attach_label', zone: 'front' }, [
      placementHost('BP', marks, 'BP'),
    ]);

    expect(selected?.issue).toBeUndefined();
    expect(selected?.marks).toHaveLength(3);
  });

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

  it('keeps a button on the one piece its operation names, whatever the zone', () => {
    const pocket = placementHost('PCK_R_MAIN', [placementMark('PCK_R_MAIN', 0, 'drill', 10, 10)]);
    const selected = selectPlacementMarks({ work: 'button_attach', zone: 'front' }, [pocket]);
    expect(selected?.issue).toBeUndefined();
    expect(selected?.marks.map((mark) => mark.id)).toEqual(['PCK_R_MAIN@0']);
  });

  it('keeps a waist button on a fly coded FL', () => {
    const waist = placementHost('WS', [placementMark('WS', 0, 'drill', 10, 10)]);
    const fly = placementHost(
      'FL_2',
      [10, 40, 70].map((y, index) => placementMark('FL_2', index, 'drill', 10, y)),
    );
    const selected = selectPlacementMarks(
      { work: 'button_attach', zone: 'waist', placementCount: 3 },
      [waist, fly],
    );
    expect(selected?.host.geom.name).toBe('FL_2');
    expect(selected?.issue).toBeUndefined();
  });

  it('sends uncounted buttons to the other strip when holes took one strip as drills', () => {
    const holeStrip = placementHost(
      'PLCK_L',
      [10, 40, 70].map((y, index) => placementMark('PLCK_L', index, 'drill', 10, y)),
    );
    const buttonStrip = placementHost(
      'PLCK_R',
      [10, 40].map((y, index) => placementMark('PLCK_R', index, 'drill', 10, y)),
    );
    const hosts = [holeStrip, buttonStrip];
    const [hole, top, next] = walkPlacementMarks([
      { operation: { work: 'buttonhole', zone: 'front' }, hosts: [holeStrip] },
      { operation: { work: 'button_attach', zone: 'collar' }, hosts },
      { operation: { work: 'button_attach', zone: 'front' }, hosts },
    ]);
    expect(hole?.marks.map((mark) => mark.id)).toEqual(['PLCK_L@2']);
    expect(top?.marks.map((mark) => mark.id)).toEqual(['PLCK_R@1']);
    expect(next?.marks.map((mark) => mark.id)).toEqual(['PLCK_R@0']);
  });
});
