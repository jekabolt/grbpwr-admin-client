import type { common_TechCard } from 'api/proto-http/admin';
import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { toWire, type EdgeAnchor, type StoredSeam } from 'lib/seams';

import card83 from './assembly-card83.fixture.json';
import type { AsmPiece, AssemblyInput } from './derive-assembly';

type CardSeam = NonNullable<common_TechCard['seams']>[number];

type EdgeFact = {
  k: number;
  lenMm: number;
  notches?: number;
  turnDeg?: number;
  semanticRole?: string;
};

const pointsFor = (fact: EdgeFact): Pt2[] => {
  const y = fact.k * 12;
  return Math.abs(fact.turnDeg ?? 0) >= 10
    ? [
        [0, y],
        [fact.lenMm / 2, y + Math.min(40, fact.lenMm / 5)],
        [fact.lenMm, y],
      ]
    : [
        [0, y],
        [fact.lenMm, y],
      ];
};

function fixturePiece(key: string, name: string, facts: EdgeFact[], area = 10_000): AsmPiece {
  const edges: (Edge & { semanticRole?: string })[] = facts.map((fact) => ({
    id: `${key}#${fact.k}`,
    pieceKey: key,
    k: fact.k,
    s: fact.k,
    e: fact.k + 1,
    pts: pointsFor(fact),
    lenMm: fact.lenMm,
    chordMm: fact.lenMm,
    turnDeg: fact.turnDeg ?? 0,
    notchesMm: Array.from({ length: fact.notches ?? 0 }, (_, index) => index + 1),
    kind: 'edge',
    ...(fact.semanticRole ? { semanticRole: fact.semanticRole } : {}),
  }));
  const width = Math.max(...facts.map((fact) => fact.lenMm), 40);
  const height = Math.max(40, facts.length * 16);
  const rs: Pt2[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const geom: PieceGeom = {
    pieceKey: key,
    name,
    hand: null,
    cloth: null,
    rs,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges,
    rect: false,
    areaMm2: area,
    perimMm: edges.reduce((sum, edge) => sum + edge.lenMm, 0),
    twinOf: [],
  };
  return {
    key,
    name,
    code: name.split(' ')[0],
    cut: rs.map(([x, y]) => [x, -y]),
    inner: [],
    notch: [],
    pocketing: false,
    area,
    geom,
  };
}

function inputOf(
  pieces: AsmPiece[],
  operations: unknown[],
  seams: common_TechCard['seams'] = [],
): AssemblyInput {
  return {
    techCard: {
      id: 85,
      techCard: {
        pieces: pieces.map((piece) => ({ lineKey: piece.key, name: piece.name })),
        operations,
      },
      seams,
    } as unknown as common_TechCard,
    pieces: new Map(pieces.map((piece) => [piece.key, piece])),
    grainDeg: new Map(pieces.map((piece) => [piece.key, 0])),
  };
}

/**
 * Real card 83 (beta), captured from the print page's deriveAssembly input and trimmed to its
 * sewing joins. No stored seams: op 400 attaches a two-layer collar (CLR + CLR_1) to «Base»,
 * whose ten pieces include both sleeves with their two-layer cuffs (SLV_M_*).
 */
export function card83RealFixture(): AssemblyInput {
  const raw = card83 as unknown as {
    techCard: common_TechCard;
    pieces: (Omit<AsmPiece, 'geom'> & {
      geom: Omit<PieceGeom, 'edges'> & { edges: Omit<Edge, 'pts'>[] };
    })[];
    grainDeg: [string, number][];
  };
  // Edge points are stored once, in `rs`; every edge is the closed-ring slice rs[s..e].
  const ringSlice = (rs: readonly Pt2[], s: number, e: number): Pt2[] =>
    s <= e ? rs.slice(s, e + 1) : [...rs.slice(s), ...rs.slice(0, e + 1)];
  const pieces = raw.pieces.map(
    (piece): AsmPiece => ({
      ...piece,
      geom: {
        ...piece.geom,
        edges: piece.geom.edges.map((edge) => ({
          ...edge,
          pts: ringSlice(piece.geom.rs, edge.s, edge.e),
        })),
      },
    }),
  );
  return {
    techCard: raw.techCard,
    pieces: new Map(pieces.map((piece) => [piece.key, piece])),
    grainDeg: new Map(raw.grainDeg),
  };
}

export function collarGrammarFixture(): AssemblyInput {
  const pieces = [
    fixturePiece('BP', 'BP back', [
      { k: 2, lenMm: 271.3, notches: 2, turnDeg: -42, semanticRole: 'neckline' },
    ]),
    fixturePiece('CLR', 'CLR collar', [
      { k: 6, lenMm: 414.6, notches: 2, turnDeg: 42, semanticRole: 'collar neck' },
    ]),
  ];
  return inputOf(pieces, [
    {
      operationNumber: 400,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join_lockstitch',
      zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE',
      inputKeys: ['BP', 'CLR'],
    },
  ]);
}

export function roleNameFixture(): AssemblyInput {
  const pieces = [
    fixturePiece('BP', 'BP back', [{ k: 0, lenMm: 300, notches: 1 }]),
    fixturePiece('FR', 'FR front', [{ k: 0, lenMm: 150, notches: 1 }]),
    fixturePiece('FL', 'FL', [{ k: 0, lenMm: 150, notches: 1 }]),
    fixturePiece('HB', 'HB hemband', [{ k: 0, lenMm: 320, notches: 2 }]),
    fixturePiece('SLV_UP_R', 'SLV_UP_R sleeve', [{ k: 0, lenMm: 100 }]),
    fixturePiece('SLV_R', 'SLV_R sleeve', [{ k: 0, lenMm: 126 }]),
  ];
  pieces.find((piece) => piece.key === 'FR')!.geom.twinOf = [{ key: 'FL', kind: 'mirror' }];
  pieces.find((piece) => piece.key === 'FL')!.geom.twinOf = [{ key: 'FR', kind: 'mirror' }];
  return inputOf(pieces, [
    {
      operationNumber: 190,
      operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
      work: 'press_flat',
      inputKeys: ['FR', 'FL'],
      outputUnitKey: 'FRONT_PARTS',
    },
    {
      operationNumber: 200,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join_lockstitch',
      zone: 'TECH_CARD_GARMENT_ZONE_HEM',
      inputKeys: ['HB', 'FRONT_PARTS'],
    },
    {
      operationNumber: 201,
      operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
      work: 'press_flat',
      inputKeys: ['FR', 'BP'],
      outputUnitKey: 'MIXED_PARTS',
    },
    {
      operationNumber: 205,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join_lockstitch',
      zone: 'TECH_CARD_GARMENT_ZONE_HEM',
      inputKeys: ['HB', 'MIXED_PARTS'],
    },
    {
      operationNumber: 210,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join_lockstitch',
      zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
      inputKeys: ['SLV_UP_R', 'SLV_R'],
    },
  ]);
}

const MAIN_A = '01M5J6VRN9XB5BH7KSBRCP14GG';
const MAIN_B = '01M5J6VRN9C91JZ0JSRB9EJAMK';
const SECOND_A = '01M5J6VRN95R2SK2GXTRKMXCTX';
const SECOND_B = '01M5J6VRN9RMCHGVC5RTE8NBEP';
const NECK = '01M5J6VRN9GN0D1TWQ67ZKEEZN';
const FLAP = '01M5J6VRN9VZFPDVMWRQH5EGWM';
const FRONT = '01M5J6VRN9ZVDSQE6ZX576FF2V';
const PLACKET = '01M5J6VRN9XP3FP644MYPNNWTJ';

const curveSamples = (kind: 'main' | 'second' | 'neck'): [number, number][] =>
  kind === 'main'
    ? [
        [0.095, 0],
        [0.276, 0.478],
        [0.5, 0.609],
        [0.724, 0.478],
        [0.905, 0],
      ]
    : kind === 'second'
      ? [
          [1, 1],
          [0.751, 0.723],
          [0.5, 0.67],
          [0.249, 0.723],
          [0, 1],
        ]
      : [
          [0.95, 1],
          [0.749, 0.436],
          [0.5, 0.275],
          [0.251, 0.436],
          [0.05, 1],
        ];

function anchor(
  piece: string,
  edgeHint: string,
  lenMm: number,
  turnDeg: number,
  samples: [number, number][],
  contourSig: string,
): EdgeAnchor {
  return {
    piece,
    samples,
    perimShare: 0.4,
    lenMm,
    notches: 0,
    turnDeg,
    range: [0, 1],
    edgeHint,
    contourSig,
  };
}

function stored(
  seamKey: string,
  status: StoredSeam['status'],
  kind: StoredSeam['kind'],
  sideA: EdgeAnchor[],
  sideB: EdgeAnchor[],
): CardSeam {
  return {
    ...toWire({
      seamKey,
      status,
      kind,
      direction: 'reversed',
      source: kind === 'edge' && status === 'rejected' ? 'graph' : 'manual',
      sideA,
      sideB,
      anchoredSize: 'M',
      note: '',
      stale: true,
    }),
    stale: true,
  } as CardSeam;
}

/** Trimmed from card85-asm-input.json: only ops 490/620/640 and their relevant pieces/seams. */
export function card85StoredSeamFixture(): AssemblyInput {
  const pieces = [
    fixturePiece(MAIN_A, 'clr_main collar', [
      { k: 2, lenMm: 420.9838, notches: 1, turnDeg: -245.6146 },
    ]),
    fixturePiece(MAIN_B, 'clr_main_2 collar', [
      { k: 2, lenMm: 420.9843, notches: 1, turnDeg: -245.6146 },
    ]),
    fixturePiece(SECOND_A, 'CLR_SECOND collar', [{ k: 1, lenMm: 420.9033, turnDeg: -59.3976 }]),
    fixturePiece(SECOND_B, 'CLR_SECOND_2 collar', [{ k: 1, lenMm: 420.9033, turnDeg: -59.383 }]),
    fixturePiece(NECK, 'nck stand', [{ k: 1, lenMm: 446.1344, notches: 5, turnDeg: -253.2888 }]),
    fixturePiece(FLAP, 'FLP_L_MAIN flap', [{ k: 8, lenMm: 101.5, notches: 3 }]),
    fixturePiece(FRONT, 'P_L_MAIN front', [{ k: 2, lenMm: 572.171 }]),
    fixturePiece(PLACKET, 'PLCK_L placket', [{ k: 0, lenMm: 701.4316 }]),
  ];
  const seams = [
    stored(
      '01M5MK6MG75FE9V3019GTXBRBD',
      'rejected',
      'edge',
      [
        anchor(
          FLAP,
          `${FLAP}#8`,
          110.5,
          0,
          [
            [0, 0],
            [0.25, 0],
            [0.5, 0],
            [0.75, 0],
            [1, 0],
          ],
          '649faf2a568ca960',
        ),
      ],
      [
        anchor(
          PLACKET,
          `${PLACKET}#0`,
          110,
          0,
          [
            [0.991, 1],
            [0.744, 1],
            [0.496, 1],
            [0.248, 1],
            [0, 1],
          ],
          '9f997afe49f22218',
        ),
      ],
    ),
    stored(
      '01M5MK81G9F80KD3JZ7NS0XHXX',
      'confirmed',
      'composite',
      [
        anchor(MAIN_A, `${MAIN_A}#2`, 423.5, -245.6, curveSamples('main'), 'ec3cb4042985e2f2'),
        anchor(MAIN_B, `${MAIN_B}#2`, 423.5, -245.6, curveSamples('main'), 'ec3cb4042985e2f2'),
      ],
      [
        anchor(SECOND_A, `${SECOND_A}#1`, 429, -59.3, curveSamples('second'), 'd290e0742ccdd6c6'),
        anchor(SECOND_B, `${SECOND_B}#1`, 429, -59.3, curveSamples('second'), 'd290e0742ccdd6c6'),
      ],
    ),
    stored(
      '01M5MK9PHZS1BD5Q8WBJ94GQH0',
      'confirmed',
      'edge',
      [anchor(NECK, `${NECK}#1`, 448.2, -253.3, curveSamples('neck'), '20701c1a618a0ef8')],
      [anchor(MAIN_B, `${MAIN_B}#2`, 423.5, -245.6, curveSamples('main'), 'ec3cb4042985e2f2')],
    ),
  ];
  return inputOf(
    pieces,
    [
      {
        operationNumber: 180,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        work: 'press_flat',
        inputKeys: [MAIN_A, MAIN_B],
        outputUnitKey: 'MAIN COLLAR',
      },
      {
        operationNumber: 210,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        work: 'press_flat',
        inputKeys: [SECOND_A, SECOND_B],
        outputUnitKey: 'SECOND COLLAR',
      },
      {
        operationNumber: 480,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        work: 'press_flat',
        inputKeys: [FLAP, FRONT],
        outputUnitKey: 'LEFT FRONT PANEL',
      },
      {
        operationNumber: 490,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        work: 'join_lockstitch',
        zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
        inputKeys: [PLACKET, 'LEFT FRONT PANEL'],
        outputUnitKey: 'LEFT FRONT PANEL WITH PLACKET',
      },
      {
        operationNumber: 620,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        work: 'join_lockstitch',
        zone: 'TECH_CARD_GARMENT_ZONE_COLLAR',
        inputKeys: ['MAIN COLLAR', 'SECOND COLLAR'],
        outputUnitKey: 'COLLAR BASE',
      },
      {
        operationNumber: 640,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        work: 'join_lockstitch',
        zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE',
        inputKeys: ['COLLAR BASE', NECK],
        outputUnitKey: 'COLLAR WITH NECK DETAIL',
      },
    ],
    seams,
  );
}
