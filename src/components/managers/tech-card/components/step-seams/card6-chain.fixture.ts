// Card 6's left-sleeve chain with the missing #430 pass-through and explicit owner rows/poses.

import type { EdgeAnchor, StoredPose, StoredSeam } from 'lib/seams';
import { poseRow } from 'lib/seams';

import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
} from './card6.fixture';
import type { FormOpLike } from './step-seams-model';

export const CARD6_CHAIN_SURFACE_KEY = 'left sleeve slit surface';
export const CARD6_CHAIN_JOIN_KEY = 'left second placket';
export const CARD6_CHAIN_PASS_KEY = 'left sleeve pass';
export const CARD6_CHAIN_POSE_380 = 'left second placket pose';
export const CARD6_CHAIN_POSE_430 = 'left sleeve legacy pose';

const baseAnchor = (piece: string, edge: number): EdgeAnchor => ({
  piece,
  samples: [
    [0, 0],
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [1, 0],
  ],
  perimShare: 0.25,
  lenMm: 160,
  notches: 0,
  turnDeg: 0,
  range: [0, 1],
  edgeHint: `${piece}#${edge}`,
  contourSig: 'card6-chain',
});

const joinRow: StoredSeam = {
  seamKey: CARD6_CHAIN_JOIN_KEY,
  status: 'confirmed',
  kind: 'edge',
  direction: 'reversed',
  source: 'manual',
  sideA: [baseAnchor('FLP_L_MAIN', 7)],
  sideB: [baseAnchor('FLP_L', 1)],
  anchoredSize: '',
  note: '',
};

const passRow: StoredSeam = { ...joinRow, seamKey: CARD6_CHAIN_PASS_KEY };

const withoutPlacement = (anchor: EdgeAnchor): EdgeAnchor => {
  const plain = { ...anchor };
  delete plain.placement;
  return plain;
};

const surfaceRow: StoredSeam = {
  ...CARD6_SEAMS.get('left sleeve slit')!,
  seamKey: CARD6_CHAIN_SURFACE_KEY,
  // Exercise `surfaceSeam → alongLine`; production rows with placement take the sibling path.
  sideA: CARD6_SEAMS.get('left sleeve slit')!.sideA.map(withoutPlacement),
  sideB: CARD6_SEAMS.get('left sleeve slit')!.sideB.map(withoutPlacement),
};

const poseGeoms = card6Geoms();
const poses: StoredPose[] = [
  poseRow({
    seamKey: CARD6_CHAIN_POSE_380,
    piece: poseGeoms.get('FLP_L_MAIN')!,
    host: poseGeoms.get('SLV_L')!,
    placement: { xMm: 82, yMm: 225, rotDeg: 0, flip: false },
  }),
  poseRow({
    seamKey: CARD6_CHAIN_POSE_430,
    piece: poseGeoms.get('FLP_L')!,
    host: poseGeoms.get('SLV_L')!,
    placement: { xMm: 30, yMm: 90, rotDeg: 90, flip: true },
  }),
];

export const CARD6_CHAIN_SEAMS: ReadonlyMap<string, StoredSeam> = new Map([
  ...CARD6_SEAMS,
  [CARD6_CHAIN_SURFACE_KEY, surfaceRow],
  [CARD6_CHAIN_JOIN_KEY, joinRow],
  [CARD6_CHAIN_PASS_KEY, passRow],
]);

export const CARD6_CHAIN_POSES: ReadonlyMap<string, StoredPose> = new Map(
  poses.map((pose) => [pose.seamKey, pose]),
);

export const CARD6_CHAIN_OPS: FormOpLike[] = CARD6_OPS.flatMap((operation) => {
  if (operation.operationNumber === 30)
    return [{ ...operation, seamKeys: [CARD6_CHAIN_SURFACE_KEY] }];
  if (operation.operationNumber === 380)
    return [
      {
        ...operation,
        seamKeys: [CARD6_CHAIN_JOIN_KEY],
        poseKeys: [CARD6_CHAIN_POSE_380],
      },
      {
        operationNumber: 430,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        work: 'press_flat',
        inputKeys: ['SLEEVE-2'],
        outputUnitKey: 'SLEEVE-2-FINISHED',
        seamKeys: [CARD6_CHAIN_PASS_KEY],
        poseKeys: [CARD6_CHAIN_POSE_430],
      },
    ];
  if (operation.operationNumber === 1030)
    return [
      {
        ...operation,
        inputKeys: (operation.inputKeys ?? []).map((key) =>
          key === 'SLEEVE-2' ? 'SLEEVE-2-FINISHED' : key,
        ),
      },
    ];
  return [{ ...operation }];
});

export const CARD6_CHAIN_PIECE_KEYS = CARD6_PIECE_KEYS;
export const card6ChainGeoms = card6Geoms;
export const card6ChainInnerLines = card6InnerLines;

export const card6ChainStep = (operationNumber: number) =>
  CARD6_CHAIN_OPS.findIndex((operation) => operation.operationNumber === operationNumber);
