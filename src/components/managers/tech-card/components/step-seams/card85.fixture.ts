// Card 85 as beta stores it: opaque piece line keys on the operation wire, with the identical
// card-77 outlines remapped by the card's piece names. Keeping the wire keys here is intentional:
// the editor's scene receives line keys, not the readable names used by the older fixture.

import { segmentPiece, twins } from 'lib/assembly-skeleton/geometry';
import type { PieceGeom, SkeletonFacts } from 'lib/assembly-skeleton/types';
import type { EdgeAnchor, StoredSeam } from 'lib/seams';

import { card77Facts } from './card77.fixture';
import real from './card85-real.json';
import type { FormOpLike } from './step-seams-model';

export type Card85Op = FormOpLike & {
  operationType: string;
  work: string;
  zone: string;
  outputUnitName: string;
};

const wireEnum = (prefix: string, value: string) =>
  value.startsWith(prefix) ? value : `${prefix}${value.toUpperCase()}`;

export const CARD85_OPS: Card85Op[] = real.ops.map((op) => ({
  operationNumber: op.operationNumber,
  operationType: wireEnum('TECH_CARD_OPERATION_TYPE_', op.operationType),
  work: op.work,
  zone: wireEnum('TECH_CARD_GARMENT_ZONE_', op.zone),
  inputKeys: [...op.inputKeys],
  outputUnitKey: op.outputUnitKey,
  outputUnitName: op.outputUnitName,
  seamKeys: [...op.seamKeys],
  assemblyBlockDetached: op.assemblyBlockDetached,
  fullnessRatio: op.fullnessRatio,
}));

export const CARD85_PIECE_KEYS: ReadonlySet<string> = new Set(
  real.pieces.map((piece) => piece.lineKey),
);

export const CARD85_PIECE_NAME_BY_KEY: ReadonlyMap<string, string> = new Map(
  real.pieces.map((piece) => [piece.lineKey, piece.name]),
);

type RawAnchor = (typeof real.seams)[number]['sideA'][number];

const anchor = (row: RawAnchor): EdgeAnchor => ({
  piece: row.piece_line_key,
  samples: row.samples.map(({ u, v }) => [u, v]),
  perimShare: row.perim_share,
  lenMm: row.len_mm,
  notches: row.notches,
  turnDeg: row.turn_deg,
  range: row.range_from === 0 && row.range_to === 0 ? [0, 1] : [row.range_from, row.range_to],
  edgeHint: row.edge_hint,
  contourSig: row.contour_sig,
  ...(row.placement
    ? {
        placement: {
          xMm: row.placement.x_mm,
          yMm: row.placement.y_mm,
          rotDeg: row.placement.rot_deg,
          flip: row.placement.flip,
        },
      }
    : {}),
  ...('layer' in row && (row.layer === 'under' || row.layer === 'over')
    ? { layer: row.layer }
    : {}),
});

/** Only the stored row linked by an operation before 970; unattached card rows cannot affect it. */
export const CARD85_SEAMS: ReadonlyMap<string, StoredSeam> = new Map(
  real.seams.map((row) => [
    row.seamKey,
    {
      seamKey: row.seamKey,
      status: row.status,
      kind: row.kind,
      direction: row.direction,
      source: row.source,
      sideA: row.sideA.map(anchor),
      sideB: row.sideB.map(anchor),
      anchoredSize: row.anchoredSize,
      note: row.note,
    } as StoredSeam,
  ]),
);

export const card85Step = (operationNumber: number) =>
  CARD85_OPS.findIndex((operation) => operation.operationNumber === operationNumber);

/** Card 85 after one shoulder of op 970 has been accepted. */
export function card85WithStoredShoulder(row: StoredSeam): {
  operations: Card85Op[];
  seams: Map<string, StoredSeam>;
} {
  const index = card85Step(970);
  const operations = CARD85_OPS.map((operation, operationIndex) =>
    operationIndex === index
      ? { ...operation, seamKeys: [...(operation.seamKeys ?? []), row.seamKey] }
      : { ...operation },
  );
  const seams = new Map(CARD85_SEAMS);
  seams.set(row.seamKey, row);
  return { operations, seams };
}

/** The geometry map built with the same opaque line keys that `useCardPieceKeys` returns. */
export function card85Geoms(): Map<string, PieceGeom> {
  const keyByName = new Map(real.pieces.map((piece) => [piece.name, piece.lineKey]));
  const source = card77Facts();
  const facts: SkeletonFacts = {
    ...source,
    pieces: source.pieces.map((piece) => {
      const pieceKey = keyByName.get(piece.pieceKey);
      if (!pieceKey) throw new Error(`card 85 piece missing: ${piece.pieceKey}`);
      return { ...piece, pieceKey };
    }),
  };
  return new Map(twins(facts.pieces.map(segmentPiece)).map((geom) => [geom.pieceKey, geom]));
}
