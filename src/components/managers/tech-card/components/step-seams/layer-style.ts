import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import {
  closedOutline,
  coverOrder,
  coverPiece,
  outlineRuns,
  pointInPiece,
  uncoveredRuns,
  type CoverPiece,
  type CollidingPairs,
  type OutlineRun,
} from 'lib/assembly-skeleton/union/layer-cover';

import type { PictureActionGlyph } from './step-picture-view';

export type PieceLayerStyle = {
  key: string;
  fullyCovered: boolean;
  /** No part of the contour is hidden: `visible` is the whole ring, closed by its first point again. */
  whole: boolean;
  /** Contour drawn solid. */
  visible: Pt2[][];
  /** Contour passing under another piece, drawn dashed. */
  covered: Pt2[][];
  /** The pieces above that cover it. */
  coveredBy: string[];
  /** Its hierarchy level, read from the shapes alone: the one thing its colour depends on. */
  level: number;
  /** Per inner line of the piece, the runs no piece above lies on. */
  lines: Pt2[][][];
};

export type MarkLayerStyle = {
  id: string;
  draw: 'solid' | 'hidden';
  at: Pt2;
};

export type LayerStyle = {
  pieces: Map<string, PieceLayerStyle>;
  marks: Map<string, MarkLayerStyle>;
  lower: string[];
};

export type LayerStyleInput = {
  /** Bottom to top. Keys absent here are placed below these keys in transform-map order. */
  layers: readonly string[];
  T: ReadonlyMap<string, Affine>;
  geoms: ReadonlyMap<string, PieceGeom>;
  marks?: readonly PictureActionGlyph[];
  innerLines?: ReadonlyMap<string, readonly (readonly Pt2[])[]>;
  /** The ring a piece covers and is covered with; the geometry's own by default. */
  ringOf?: (geom: PieceGeom) => readonly Pt2[];
  /** Pieces that only collide: neither covers the other (`StepLayout.colliding`). */
  colliding?: CollidingPairs;
};

/** The one source of the pieces' rings, bottom to top. */
function orderedPieces(input: LayerStyleInput): CoverPiece[] {
  const validInputOrder = [...input.T.keys()].filter((key) => input.geoms.has(key));
  const layerSet = new Set(input.layers);
  const orderedKeys = [
    ...validInputOrder.filter((key) => !layerSet.has(key)),
    ...input.layers.filter((key, index) => input.layers.indexOf(key) === index),
  ];
  const seen = new Set<string>();
  return orderedKeys.flatMap((key) => {
    if (seen.has(key)) return [];
    seen.add(key);
    const T = input.T.get(key);
    const geom = input.geoms.get(key);
    if (!T || !geom) return [];
    const ring = (input.ringOf?.(geom) ?? geom.rs).map((point) => apply(T, point));
    return coverPiece(key, ring) ?? [];
  });
}

export function layerStyle(input: LayerStyleInput): LayerStyle {
  const ordered = orderedPieces(input);
  const indexByKey = new Map(ordered.map((piece, index) => [piece.key, index]));
  const { covers, sameShape, levels } = coverOrder(ordered, input.colliding);
  const piecesAt = (indexes: readonly number[]) => indexes.map((upper) => ordered[upper]);

  const pieces = new Map<string, PieceLayerStyle>();
  ordered.forEach((piece, index) => {
    const above = piecesAt(covers[index]);
    const runs = above.length ? outlineRuns(piece, above) : [];
    const whole = runs.every((run) => run.state === 'solid');
    const pointsOf = (state: OutlineRun['state']) =>
      runs.filter((run) => run.state === state).map((run) => run.points);
    const T = input.T.get(piece.key)!;
    pieces.set(piece.key, {
      key: piece.key,
      fullyCovered: sameShape[index] && runs.length > 0 && !pointsOf('solid').length,
      whole,
      visible: whole ? closedOutline(piece) : pointsOf('solid'),
      covered: pointsOf('dashed'),
      coveredBy: above.map((cover) => cover.key),
      level: levels[index],
      lines: (input.innerLines?.get(piece.key) ?? []).map((line) =>
        uncoveredRuns(
          line.map((point) => apply(T, point)),
          above,
        ),
      ),
    });
  });

  const marks = new Map<string, MarkLayerStyle>();
  for (const mark of input.marks ?? []) {
    const pieceIndex = indexByKey.get(mark.piece);
    const T = input.T.get(mark.piece);
    if (pieceIndex == null || !T) continue;
    const at = apply(T, mark.point);
    const isCovered = piecesAt(covers[pieceIndex]).some((piece) => pointInPiece(at, piece));
    const draw: MarkLayerStyle['draw'] =
      // A press arrow points at a seam, it is not a mark on the cloth: never covered.
      mark.kind === 'buttonhole' || mark.kind === 'press-arrow'
        ? 'solid'
        : // The owner's pick (layer mockup, case 3 A): an upper piece hides what it covers.
          isCovered
          ? 'hidden'
          : 'solid';
    marks.set(mark.id, { id: mark.id, draw, at });
  }

  return {
    pieces,
    marks,
    lower: ordered.filter((_, index) => covers[index].length > 0).map((piece) => piece.key),
  };
}
