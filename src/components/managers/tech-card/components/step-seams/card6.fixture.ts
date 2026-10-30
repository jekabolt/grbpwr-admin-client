// Card 6 «starvation»: only the pieces, operations and stored rows needed by the seam-starvation
// regressions. Its pattern is the same checked-in DXF outline capture used by card 77/85.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { contourSig, frameOf, type EdgeAnchor, type StoredSeam } from 'lib/seams';
import { runSamples } from 'lib/seams/frame';

import { card77Geoms, card77InnerLines } from './card77.fixture';
import type { FormOpLike } from './step-seams-model';

const PIECES = [
  'SLV_R',
  'FLP_R',
  'FLP_R_MAIN',
  'clr_main',
  'clr_main_2',
  'CLR_SECOND',
  'CLR_SECOND_2',
  'nck',
  'nck_2',
  'P_L_U',
  'P_L_MAIN',
  'PCK_L_MAIN',
  'PCK_L_BTTM',
  'PLCK_L',
  'P_R_U',
  'P_R_MAIN',
  'PCK_R_MAIN',
  'PCK_R_BTTM',
] as const;

export const CARD6_PIECE_KEYS: ReadonlySet<string> = new Set(PIECES);

const op = (
  operationNumber: number,
  inputKeys: string[],
  outputUnitKey = '',
  seamKeys: string[] = [],
): FormOpLike => ({
  operationNumber,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  work: 'join_lockstitch',
  inputKeys,
  outputUnitKey,
  seamKeys,
});

export const CARD6_OPS: FormOpLike[] = [
  op(90, ['SLV_R', 'FLP_R'], 'SLEEVE-3', ['sleeve slit']),
  op(150, ['clr_main', 'clr_main_2'], 'MAIN COLLAR', ['main neck', 'main outer']),
  op(200, ['CLR_SECOND', 'CLR_SECOND_2'], 'SECOND COLLAR', ['second outer']),
  op(260, ['FLP_R_MAIN', 'SLEEVE-3']),
  op(540, ['P_L_MAIN', 'PCK_L_BTTM'], 'LOWER LEFT', ['left pocket layer']),
  op(570, ['P_L_U', 'PCK_L_MAIN'], 'UPPER LEFT', ['left pocket place']),
  op(610, ['P_R_U', 'PCK_R_MAIN'], 'UPPER RIGHT', ['right pocket place']),
  op(630, ['P_R_MAIN', 'PCK_R_BTTM'], 'LOWER RIGHT', ['right pocket layer']),
  op(660, ['UPPER LEFT', 'LOWER LEFT'], 'LEFT FRONT PANEL'),
  op(720, ['PLCK_L', 'LEFT FRONT PANEL']),
  op(770, ['UPPER RIGHT', 'LOWER RIGHT']),
  op(870, ['MAIN COLLAR', 'SECOND COLLAR'], 'COLLAR BASE'),
  op(910, ['COLLAR BASE', 'nck'], 'COLLAR WITH NECK DETAIL'),
  op(940, ['nck_2', 'COLLAR WITH NECK DETAIL']),
];

export const card6Step = (operationNumber: number) =>
  CARD6_OPS.findIndex((step) => step.operationNumber === operationNumber);

export function card6Geoms(): Map<string, PieceGeom> {
  const all = card77Geoms();
  return new Map(PIECES.flatMap((key) => (all.has(key) ? [[key, all.get(key)!]] : [])));
}

export function card6InnerLines(): Map<string, Pt2[][]> {
  const all = card77InnerLines();
  return new Map(PIECES.flatMap((key) => (all.has(key) ? [[key, all.get(key)!]] : [])));
}

const anchor = (edgeHint: string): EdgeAnchor => ({
  piece: edgeHint.slice(0, edgeHint.lastIndexOf('#')),
  samples: [
    [0, 0],
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [1, 0],
  ],
  perimShare: 0.25,
  lenMm: 100,
  notches: 0,
  turnDeg: 0,
  range: [0, 1],
  edgeHint,
  contourSig: 'card6',
});

const row = (
  seamKey: string,
  a: readonly string[],
  b: readonly string[],
  kind: StoredSeam['kind'] = 'edge',
): StoredSeam => ({
  seamKey,
  status: 'confirmed',
  kind,
  direction: 'reversed',
  source: 'manual',
  sideA: a.map(anchor),
  sideB: b.map(anchor),
  anchoredSize: '',
  note: '',
});

const sleeveSlitRow = (): StoredSeam => {
  const host = card6Geoms().get('SLV_R')!;
  const line = card6InnerLines().get('SLV_R')![0];
  const frame = frameOf(host);
  const lenMm = line.reduce(
    (sum, point, index) =>
      index ? sum + Math.hypot(point[0] - line[index - 1][0], point[1] - line[index - 1][1]) : sum,
    0,
  );
  const placement = { xMm: 150, yMm: 560, rotDeg: 0, flip: false };
  const hostAnchor: EdgeAnchor = {
    ...anchor('SLV_R#0'),
    samples: runSamples(frame, { pts: line }),
    perimShare: lenMm / host.perimMm,
    lenMm,
    edgeHint: 'i0',
    contourSig: contourSig(host, frame),
    placement,
  };
  return {
    ...row('sleeve slit', ['SLV_R#0'], ['FLP_R#0'], 'surface'),
    sideA: [hostAnchor],
    sideB: [{ ...anchor('FLP_R#0'), placement }],
  };
};

export const CARD6_SEAMS: ReadonlyMap<string, StoredSeam> = new Map([
  ['sleeve slit', sleeveSlitRow()],
  ['main neck', row('main neck', ['clr_main#2'], ['clr_main_2#2'])],
  [
    'main outer',
    row('main outer', ['clr_main#3+0+1'], ['clr_main_2#0', 'clr_main_2#3', 'clr_main_2#1']),
  ],
  [
    'second outer',
    row(
      'second outer',
      ['CLR_SECOND#2', 'CLR_SECOND#1', 'CLR_SECOND#0'],
      ['CLR_SECOND_2#2+3+0'],
      'composite',
    ),
  ],
  ['left pocket layer', row('left pocket layer', ['P_L_MAIN#1'], ['PCK_L_BTTM#1'])],
  ['left pocket place', row('left pocket place', ['PCK_L_MAIN#0'], ['P_L_U#3'], 'surface')],
  ['right pocket place', row('right pocket place', ['PCK_R_MAIN#0'], ['P_R_U#4'], 'surface')],
  ['right pocket layer', row('right pocket layer', ['P_R_MAIN#1'], ['PCK_R_BTTM#0'])],
]);
