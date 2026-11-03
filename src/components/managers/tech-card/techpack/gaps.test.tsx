import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';

const pieces = new Map();
const grainDeg = new Map();

import {
  assemblyPieceCode,
  deriveAssembly,
  joinSvg,
  silhouetteSvg,
  type AsmPiece,
} from './derive-assembly';
import { GapSink } from './gaps';

Object.assign(globalThis, { window: { location: { search: '' } } });

const fixture = {
  id: 1,
  lockVersion: 1,
  techCard: {
    name: 'Assembly schema fixture',
    brand: 'GRBPWR',
    status: 'released',
    baseSampleSizeId: 1,
    pieces: [{ lineKey: 'RIGHT_FRONT', name: 'Right front', piecesPerGarment: 1 }],
    operations: [
      {
        operationNumber: 560,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        work: 'join_lockstitch',
        inputKeys: ['RIGHT_FRONT'],
      },
    ],
    bomItems: [],
    patterns: [],
  },
  colorways: [],
  markers: [],
  seams: [],
  resolvedTechnicalMedia: [],
} as unknown as common_TechCard;

const fasteningPiece = (
  key: string,
  name: string,
  kind: 'buttonhole' | 'drill',
  count: number,
): AsmPiece => {
  const rs: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 100],
    [0, 100],
  ];
  return {
    key,
    name,
    code: key,
    cut: rs,
    inner: [],
    notch: [],
    pocketing: false,
    area: 2000,
    geom: {
      pieceKey: key,
      name,
      hand: null,
      cloth: 'main',
      rs,
      corners: [0, 1, 2, 3],
      notchIdx: [],
      edges: [],
      rect: true,
      areaMm2: 2000,
      perimMm: 240,
      twinOf: [],
      marks: Array.from({ length: count }, (_, index) => ({
        id: `${key}@${index}`,
        kind,
        layer: 'mark',
        closed: kind === 'drill',
        pts: [
          [10, 10 + index * 10],
          [10, 12 + index * 10],
        ],
        bbox: { w: 0, h: 2, cx: 10, cy: 11 + index * 10 },
        lenMm: 2,
      })),
    },
  };
};

const fasteningCard = (piece: string, operation: Record<string, unknown>): common_TechCard =>
  ({
    id: 2,
    techCard: {
      name: 'Fastening gaps',
      pieces: [{ lineKey: piece, name: piece }],
      operations: [
        {
          operationNumber: 10,
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          inputKeys: [piece],
          ...operation,
        },
      ],
      bomItems: [],
      patterns: [],
    },
    seams: [],
    colorways: [],
    markers: [],
    resolvedTechnicalMedia: [],
  }) as unknown as common_TechCard;

describe('PDF gap registry', () => {
  it('collects assembly gaps without adding row markers', () => {
    const sink = new GapSink();
    const model = deriveAssembly({ techCard: fixture, pieces, grainDeg }, sink);
    const collected = sink.list();
    const codes = new Set(collected.map((gap) => gap.code));
    expect(collected.every((gap) => /^(?:asm|pdf)_/.test(gap.code))).toBe(true);
    expect(codes.has('asm_edge_missing')).toBe(true);
    expect(codes.has('asm_partner_missing')).toBe(false);
    const unmarkedJoin = collected.find(
      (gap) => gap.section === '06' && gap.code === 'asm_edge_missing',
    );
    expect(unmarkedJoin).toBeDefined();
    expect(model.gaps).toEqual(collected);
    expect(model.words.get(560)?.line.map((segment) => segment.t)).not.toContain('no seam · pick');
  });

  it('has no PDF text-error renderer outside Gap', () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.tsx')) files.push(path);
      }
    };
    walk(root);
    const offenders = files
      .filter((path) => !path.endsWith('/gaps.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes('text-error'));
    expect(offenders).toEqual([]);
  });
});

describe('fastening mark gaps', () => {
  it('prints all available marks and reports a count shortfall', () => {
    const front = fasteningPiece('FRONT', 'front', 'buttonhole', 7);
    const model = deriveAssembly({
      techCard: fasteningCard('FRONT', {
        work: 'buttonhole',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
        zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
        placementLayout: { count: 8, pitchMm: { value: '18' } },
      }),
      pieces: new Map([[front.key, front]]),
      grainDeg: new Map(),
    });

    expect(model.rows[0].action?.placements).toHaveLength(7);
    expect(model.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'asm_placement_marks_short',
          label: 'too few pattern marks',
          target: expect.objectContaining({ op: 10, field: 'position' }),
        }),
      ]),
    );
  });

  it('does not invent a placement for marks outside the operation zone', () => {
    const sleeve = fasteningPiece('SLV', 'sleeve', 'drill', 1);
    const front = fasteningPiece('FRONT', 'front', 'buttonhole', 1);
    const techCard = fasteningCard('SLV', {
      work: 'button_attach',
      machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
      zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
      inputKeys: ['garment'],
      placementLayout: { count: 1, pitchMm: { value: '18' } },
    });
    const card = techCard.techCard as unknown as { pieces: unknown[]; operations: unknown[] };
    card.pieces = [
      { lineKey: 'SLV', name: 'SLV' },
      { lineKey: 'FRONT', name: 'FRONT' },
    ];
    card.operations.unshift({
      operationNumber: 5,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join',
      inputKeys: ['SLV', 'FRONT'],
      outputUnitKey: 'garment',
    });
    const model = deriveAssembly({
      techCard,
      pieces: new Map([
        [sleeve.key, sleeve],
        [front.key, front],
      ]),
      grainDeg: new Map(),
    });

    expect(model.rows.find((row) => row.n === 10)?.action?.placements).toEqual([]);
    expect(model.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'asm_placement_marks_unrelated',
          label: 'marks outside operation zone',
          target: expect.objectContaining({ op: 10, field: 'position' }),
        }),
      ]),
    );
  });
});

describe('assembly raw-card fallbacks', () => {
  it('prints filled operation facts and real press equipment', () => {
    const raw = {
      techCard: {
        pieces: [{ lineKey: 'P1', name: 'Front' }],
        construction: {
          equipmentDefaults: {
            machines: [
              {
                profileKey: 'PROFILE_1',
                label: 'jack',
                machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
              },
            ],
          },
        },
        operations: [
          {
            operationNumber: 10,
            operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
            work: 'fuse',
            inputKeys: ['P1'],
            pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS',
            pressTemperatureC: 165,
            pressDwellSec: 12,
            pressPressureNCm2: { value: '2.5' },
          },
          {
            operationNumber: 20,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
            machineProfileKey: 'PROFILE_1',
            work: 'buttonhole',
            inputKeys: ['P1'],
            seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
            topstitch: {
              mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
              widthMm: { value: '3' },
              rows: 2,
            },
            placementLayout: { count: 6, pitchMm: { value: '18' } },
            stitching: {
              needleCount: 2,
              rowSpacingMm: { value: '6' },
              seamSecuring: 'TECH_CARD_SEAM_SECURING_BACKTACK',
            },
            fastening: {
              buttonholeStyle: 'TECH_CARD_BUTTONHOLE_STYLE_STRAIGHT',
              buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL',
              cutLengthMm: { value: '18' },
            },
            draft: true,
          },
          {
            operationNumber: 30,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
            work: 'topstitch',
            inputKeys: ['P1'],
            topstitch: {
              mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
              widthMm: { value: '3' },
              rows: 2,
            },
          },
          {
            operationNumber: 40,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
            work: 'button_attach',
            inputKeys: ['P1'],
            fastening: {
              attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL',
              buttonHoles: 4,
            },
          },
          {
            operationNumber: 50,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'set_zip',
            inputKeys: ['P1'],
            fastening: {
              zipperApplication: 'TECH_CARD_ZIPPER_APPLICATION_LAPPED',
            },
          },
          {
            operationNumber: 60,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_DOUBLE_NEEDLE_LOCKSTITCH',
            work: 'topstitch',
            inputKeys: ['P1'],
            topstitch: {
              mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
              widthMm: { value: '3' },
            },
            stitching: {
              needleCount: 2,
              needleGaugeMm: { value: '6' },
            },
          },
        ],
      },
      seams: [],
    } as unknown as common_TechCard;
    const model = deriveAssembly({ techCard: raw, pieces: new Map(), grainDeg: new Map() });
    const fuse = model.words.get(10)!;
    const buttonhole = model.words.get(20)!;
    const topstitch = model.words.get(30)!;
    const button = model.words.get(40)!;
    const zipper = model.words.get(50)!;
    const doubleNeedle = model.words.get(60)!;

    expect(fuse.verb).toBe('Fuse');
    expect(fuse.mc?.t).toBe('Fusing press');
    expect(fuse.machineParams).toEqual(['165 °C', '12 s', '2.5 N/cm²']);
    expect(buttonhole.verb).toBe('Buttonhole');
    expect(buttonhole.params.join(' · ')).toContain('topstitch 2 × 3 mm from the edge');
    expect(buttonhole.icon).toMatchObject({ key: 'buttonhole_straight' });
    expect(buttonhole.params.join(' · ')).toContain('vertical buttonhole, cut 18 mm');
    expect(buttonhole.params.join(' · ')).not.toContain('straight buttonhole');
    expect(buttonhole.params.join(' · ')).toContain('stitch rows 6 mm apart');
    expect(buttonhole.params.join(' · ')).toContain('×6 · pitch 18 mm');
    expect(buttonhole.params).toContain('profile jack');
    expect(buttonhole.draft).toBe(true);
    expect(topstitch.icon).toMatchObject({ key: 'topstitch', bars: 2, at: 'edge' });
    expect(topstitch.params).toContain('3 mm from the edge');
    expect(topstitch.params.join(' · ')).not.toContain('topstitch 2 ×');
    expect(button.icon).toMatchObject({ key: 'button_parallel' });
    expect(button.params.join(' · ')).not.toContain('parallel');
    expect(zipper.icon).toMatchObject({ key: 'set_zip', chip: 'LAP' });
    expect(zipper.params.join(' · ')).not.toContain('lapped');
    expect(doubleNeedle.icon).toMatchObject({ key: 'topstitch', bars: 2, at: 'edge' });
    expect(doubleNeedle.params).toContain('6 mm apart');
    expect(doubleNeedle.params.join(' · ')).not.toContain('2 needles');
  });

  it('uses operation types for empty-work verbs and flags every unmarked join', () => {
    const raw = {
      techCard: {
        pieces: [
          { lineKey: '01M5EVQR86N1RGS9BTSNKJ39WX', name: 'BP' },
          { lineKey: '01M5EVQR86Q4MTCB72ZFJDK8AY', name: 'BP_1' },
          { lineKey: '01M5EVQR86T6QF9J4NZ2XH7KPC', name: 'CLR_3' },
        ],
        operations: [
          {
            operationNumber: 10,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            inputKeys: ['01M5EVQR86N1RGS9BTSNKJ39WX', '01M5EVQR86Q4MTCB72ZFJDK8AY'],
            outputUnitKey: 'raw-back',
            outputUnitName: 'Back',
          },
          {
            operationNumber: 20,
            operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
            inputKeys: ['01M5EVQR86T6QF9J4NZ2XH7KPC'],
          },
          {
            operationNumber: 30,
            operationType: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
            inputKeys: ['raw-back'],
          },
        ],
      },
      seams: [],
    } as unknown as common_TechCard;
    const sink = new GapSink();
    const model = deriveAssembly({ techCard: raw, pieces: new Map(), grainDeg: new Map() }, sink);

    expect(model.words.get(10)?.verb).toBe('Sew');
    expect(model.words.get(20)?.verb).toBe('Fuse');
    expect(model.words.get(30)?.verb).toBe('Press open');
    expect(model.words.get(10)?.line.map((segment) => segment.t)).not.toContain('no seam · pick');
    expect(
      sink
        .list()
        .filter((gap) => gap.code === 'asm_edge_missing')
        .map((gap) => gap.target.op),
    ).toEqual([10]);
  });

  it('prints resolved codes and never falls back to a ULID', () => {
    const left = '01M5EVQR86N1RGS9BTSNKJ39WX';
    const right = '01M5EVQR86Q4MTCB72ZFJDK8AY';
    const tiny = 'TINY';
    const shape = (
      key: string,
      code: string,
      width = 80,
      height = 100,
      placement = false,
    ): AsmPiece => ({
      key,
      name: code,
      code,
      cut: [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      inner: [],
      notch: [],
      pocketing: false,
      area: width * height,
      geom: {
        edges: [],
        twinOf: [],
        marks: placement
          ? [
              {
                id: `${key}@placement`,
                kind: 'placement',
                pts: [
                  [22, -20],
                  [58, -20],
                  [58, 120],
                  [22, 120],
                ],
                bbox: { x: 22, y: -20, w: 36, h: 140, cx: 40, cy: 50 },
              },
            ]
          : [],
      } as unknown as AsmPiece['geom'],
    });
    const raw = {
      techCard: {
        pieces: [
          { lineKey: left, name: 'BP' },
          { lineKey: right, name: 'BP_1' },
        ],
        operations: [
          {
            operationNumber: 10,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            inputKeys: [left, right],
            outputUnitKey: 'raw-back',
            outputUnitName: 'Back',
          },
          {
            operationNumber: 20,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'topstitch',
            inputKeys: [left, right],
            outputUnitKey: 'finished-back',
            outputUnitName: 'Right back panel',
          },
          {
            operationNumber: 30,
            operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
            inputKeys: ['finished-back'],
          },
          {
            operationNumber: 40,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'join_lockstitch',
            inputKeys: ['raw-back'],
          },
        ],
      },
      seams: [],
    } as unknown as common_TechCard;
    const model = deriveAssembly({
      techCard: raw,
      pieces: new Map([
        [left, shape(left, 'BP', 80, 100, true)],
        [right, shape(right, 'BP_1', 36, 140)],
        [tiny, shape(tiny, 'TINY', 4, 24)],
      ]),
      grainDeg: new Map(),
    });
    const markup = joinSvg(model, model.cards.get(10)!, true, [134, 100]);
    const block = joinSvg(model, model.cards.get(40)!, true, [134, 100]);
    const pressRow = model.rows.find((row) => row.n === 30);
    const silhouette = silhouetteSvg(model, pressRow?.target, [118, 72]);
    const pieceSilhouette = silhouetteSvg(model, { piece: right }, [118, 72]);
    const tinySilhouette = silhouetteSvg(model, { piece: tiny }, [118, 72]);

    expect(assemblyPieceCode('FP_L', 'ignored')).toBe('FP_L');
    expect(assemblyPieceCode('Back', 'BP_MAIN')).toBe('BP_MAIN');
    expect(assemblyPieceCode('Left front panel', 'P_L_MAIN')).toBe('P_L_MAIN');
    expect(assemblyPieceCode(left, right)).toBe('');
    // Only the incoming item is labelled; the base is the grey context.
    expect(markup.body).not.toContain('>BP</text>');
    expect(markup.body).toContain('>BP_1</text>');
    expect(markup.body).not.toContain('data-asm-piece-number=');
    expect(model.words.get(10)?.ins).toEqual(['1 BP', '2 BP_1']);
    expect(model.words.get(10)?.seams).toEqual(['slit']);
    expect(JSON.stringify(model.words.get(10))).not.toMatch(/[0-9A-HJKMNP-TV-Z]{26}/i);
    expect(markup.body).not.toContain('data-asm-code-placement=');
    expect(markup.body).not.toContain('tpa-asm-code-leader');
    expect(markup.body).not.toContain(left);
    expect(markup.body).not.toContain(right);
    expect(block.body).not.toContain('tpa-asm-old');
    expect(block.body).not.toContain('tpa-asm-unit');
    expect(block.body).toContain('data-asm-missing="seam"');
    expect(model.units.get('finished-back')).toHaveLength(2);
    expect(pressRow?.target?.label).toBe('Right back panel · 20');
    expect(silhouette?.body.match(/<path/g)?.length).toBeGreaterThanOrEqual(1);
    expect(silhouette?.body).not.toContain('tpa-asm-code');
    expect(silhouette?.body).not.toContain('Right back');
    expect(silhouette?.body).not.toContain('panel · 20');
    expect(silhouette?.body).not.toContain('…');
    expect(pieceSilhouette?.body).toContain('>BP_1</text>');
    expect(pieceSilhouette?.body).not.toContain('transform="rotate');
    expect(tinySilhouette?.body).toContain('>TINY</text>');
    expect(tinySilhouette?.body).not.toContain('data-asm-code-placement=');
    expect(tinySilhouette?.body).not.toContain('tpa-asm-code-leader');
  });
});
