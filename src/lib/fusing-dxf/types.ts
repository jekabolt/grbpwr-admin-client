import type { common_TechCardPiece } from 'api/proto-http/admin';
import type { PtMm } from 'lib/pattern-import/types';

export type FuseMode = 'whole' | 'strip' | 'zone';
export type FuseGrain = 'as_piece' | 'lengthwise' | 'crosswise' | 'bias' | 'any';
export type FuseDarts = 'cut' | 'fuse';

export type FuseEdge = {
  /** Zero-based segment index on the base-size outline. */
  edge: number;
  startMm: number;
  endMm: number;
};

export type FuseZone =
  | { rect: [x0: number, y0: number, x1: number, y1: number] }
  | { dxfPieceKey: string };

/**
 * Client-side mirror of the FUSING wave's piece fields. Keep this local until the parallel proto
 * lane lands; generated files under api/proto-http must never be edited by hand.
 */
export type PieceFuseSpec = {
  mode: FuseMode;
  bomLineKey: string | null;
  widthMm: number | null;
  edges: FuseEdge[];
  zone: FuseZone | null;
  /** null means the 3 mm material/default inset. */
  insetMm: number | null;
  /** When true, the effective inset is the piece's seam allowance. */
  net: boolean;
  grain: FuseGrain;
  darts: FuseDarts;
};

export type FuseGeometryInput = {
  outline: PtMm[];
  spec: PieceFuseSpec;
  seamAllowanceMm?: number | null;
  /** Closed dart polygons in the same piece-local frame as outline. */
  darts?: PtMm[][];
  /** Resolved referenced DXF zone when spec.zone is dxfPieceKey. */
  zoneOutline?: PtMm[] | null;
  /** Base-size segment count. A mismatch is a skipped size, never guessed. */
  expectedEdgeCount?: number;
};

export type FusePolygon = { outer: PtMm[]; holes: PtMm[][] };

type CurrentPieceFuseFields = Pick<common_TechCardPiece, 'fused' | 'fusingMode' | 'fusingWidthMm'>;

const finiteOrNull = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Adapts today's generated TechCardPiece to the forward local contract. The explicit defaults make
 * old cards useful now; the TODO markers are the only places that need switching when the proto
 * lane regenerates the client.
 */
export function fuseSpecFromPiece(piece: CurrentPieceFuseFields): PieceFuseSpec | null {
  if (!piece.fused) return null;
  const rawMode = String(piece.fusingMode ?? '');
  const mode: FuseMode = rawMode.endsWith('_STRIP')
    ? 'strip'
    : rawMode.endsWith('_ZONE')
      ? 'zone'
      : 'whole';
  return {
    mode,
    // TODO(proto-fusing-fields): read piece.fusingBomLineKey.
    bomLineKey: null,
    widthMm: finiteOrNull(piece.fusingWidthMm?.value),
    // TODO(proto-fusing-fields): read/validate piece.fusingEdges JSON.
    edges: [],
    // TODO(proto-fusing-fields): read/validate piece.fusingZone JSON.
    zone: null,
    // TODO(proto-fusing-fields): read piece.fusingInsetMm.
    insetMm: null,
    // TODO(proto-fusing-fields): read piece.fusingInsetNet.
    net: false,
    // TODO(proto-fusing-fields): read piece.fusingGrain.
    grain: 'as_piece',
    // TODO(proto-fusing-fields): read piece.fusingDarts.
    darts: 'cut',
  };
}
