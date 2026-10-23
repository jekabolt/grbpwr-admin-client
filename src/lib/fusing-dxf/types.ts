import type { common_TechCardPiece, common_TechCardPieceFusingZone } from 'api/proto-http/admin';
import type { PtMm } from 'lib/pattern-import/types';

/** '' = not fused, or the legacy «fused, how not said» (a stored fused piece with no mode). */
export type FuseMode = '' | 'whole' | 'strip' | 'zone';
export type FusePanelMode = FuseMode | 'file';
export type FuseGrain = 'as_piece' | 'lengthwise' | 'crosswise' | 'bias' | 'any';
export type FuseDarts = 'cut' | 'fuse';

export type FuseEdge = {
  /** Zero-based edge-run index on the base-size outline (a run is bounded by >30° corners). */
  edge: number;
  startMm: number;
  endMm: number;
};

/** A control point of a freeform zone; corner = a sharp vertex (the curve does not round it). */
export type FuseSplinePoint = { x: number; y: number; corner?: boolean };
export type FuseSpline = { points: FuseSplinePoint[] };

/**
 * Piece-local mm, DXF axes (Y up), the outline's own frame — or another DXF block. A spline is a
 * closed curve through its 3..64 points (rule in ./spline.ts); a rect is its 4-corner special case
 * and stays the stored shape of an untouched rectangle.
 */
export type FuseZone =
  | { rect: [x0: number, y0: number, x1: number, y1: number] }
  | { spline: FuseSpline; holes: FuseSpline[]; islands: FuseSpline[] }
  | { dxfPieceKey: string };

/**
 * HOW A PIECE IS FUSED — the one shape of the fuse markup, shared by the piece editor (Fold panel)
 * and the fusible-DXF generator. Read from the wire / the form by the adapters below.
 */
export type PieceFuseSpec = {
  mode: FuseMode;
  /** INTERLINING BOM line; '' = auto (the BOM's only interlining line). */
  bomLineKey: string;
  /** Strip width; null = the card's seam allowance. */
  widthMm: number | null;
  edges: FuseEdge[];
  zone: FuseZone | null;
  /** null = the 3 mm default inset. */
  insetMm: number | null;
  /** The inset is the piece's seam allowance («net»). */
  insetNet: boolean;
  grain: FuseGrain;
  darts: FuseDarts;
};

export const DEFAULT_INSET_MM = 3;

export const blankFuse = (mode: FuseMode = ''): PieceFuseSpec => ({
  mode,
  bomLineKey: '',
  widthMm: null,
  edges: [],
  zone: null,
  insetMm: null,
  insetNet: false,
  grain: 'as_piece',
  darts: 'cut',
});

/**
 * FILE is a view of stored FULL fusing, never a fifth wire value. The caller supplies the other
 * half of the fact: this piece is mapped to a block of the selected slot's owner drawing.
 */
export function deriveFusePanelMode(
  spec: Pick<PieceFuseSpec, 'mode'>,
  mappedToOwnerFile: boolean,
): FusePanelMode {
  return spec.mode === 'whole' && mappedToOwnerFile ? 'file' : spec.mode;
}

/**
 * Moves the editor to one panel mode and removes geometry owned by every other mode. FILE is the
 * stored FULL mode plus an owner-file alias, so it also has no strip or zone draft of its own.
 */
export function fuseSpecForPanelMode(
  spec: PieceFuseSpec,
  mode: FusePanelMode,
  fileBomLineKey = spec.bomLineKey,
): PieceFuseSpec {
  if (!mode) return blankFuse();
  const nextMode: FuseMode = mode === 'file' ? 'whole' : mode;
  const staying = mode !== 'file' && spec.mode === nextMode;
  return {
    ...spec,
    mode: nextMode,
    bomLineKey: mode === 'file' ? fileBomLineKey.trim() : spec.bomLineKey,
    widthMm: nextMode === 'strip' && staying ? spec.widthMm : null,
    edges: nextMode === 'strip' && staying ? spec.edges.map((edge) => ({ ...edge })) : [],
    zone: nextMode === 'zone' && staying ? spec.zone : null,
  };
}

export type FuseGeometryInput = {
  outline: PtMm[];
  spec: PieceFuseSpec;
  seamAllowanceMm?: number | null;
  /** Closed dart polygons in the same piece-local frame as outline. */
  darts?: PtMm[][];
  /** Resolved referenced DXF zone when spec.zone is dxfPieceKey. */
  zoneOutline?: PtMm[] | null;
  /** Base-size edge-run count. A mismatch is a skipped size, never guessed. */
  expectedEdgeCount?: number;
};

export type FusePolygon = { outer: PtMm[]; holes: PtMm[][] };

const MODE_FULL = 'TECH_CARD_PIECE_FUSING_MODE_FULL';
const MODE_STRIP = 'TECH_CARD_PIECE_FUSING_MODE_STRIP';
const MODE_ZONE = 'TECH_CARD_PIECE_FUSING_MODE_ZONE';
const MODE_UNSET = 'TECH_CARD_PIECE_FUSING_MODE_UNKNOWN';
const GRAINS: readonly FuseGrain[] = ['as_piece', 'lengthwise', 'crosswise', 'bias', 'any'];

/**
 * The piece's fuse fields as plain values — the tech-card form's shape of them (decimals as
 * strings, the way the form keeps every decimal while it is typed).
 */
export type PieceFuseFields = {
  fused: boolean;
  fusingMode: string;
  fusingWidthMm: string;
  fusingBomLineKey: string;
  fusingEdges: FuseEdge[];
  fusingZone: FuseZone | null;
  fusingInsetMm: string;
  fusingInsetNet: boolean;
  fusingGrain: string;
  fusingDarts: string;
};

const num = (value: string | undefined): number | null => {
  const t = (value ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const dec = (value: number) => ({ value: String(Math.round(value * 10) / 10) });

const modeOf = (raw: string | undefined): FuseMode => {
  const m = (raw ?? '').trim();
  return m === MODE_FULL ? 'whole' : m === MODE_STRIP ? 'strip' : m === MODE_ZONE ? 'zone' : '';
};

/** READ: the stored fields → the spec. A fused piece with no mode reads as mode ''. */
export function readFuseSpec(f: Partial<PieceFuseFields>): PieceFuseSpec {
  if (!f.fused) return blankFuse();
  const mode = modeOf(f.fusingMode);
  const width = num(f.fusingWidthMm);
  const grain = (f.fusingGrain ?? '').trim().toLowerCase() as FuseGrain;
  return {
    mode,
    bomLineKey: (f.fusingBomLineKey ?? '').trim(),
    widthMm: mode === 'strip' && width != null && width > 0 ? width : null,
    edges: mode === 'strip' ? (f.fusingEdges ?? []).map((e) => ({ ...e })) : [],
    zone: mode === 'zone' ? f.fusingZone ?? null : null,
    insetMm: f.fusingInsetNet ? null : num(f.fusingInsetMm),
    insetNet: !!f.fusingInsetNet,
    grain: GRAINS.includes(grain) ? grain : 'as_piece',
    darts: (f.fusingDarts ?? '').trim().toLowerCase() === 'fuse' ? 'fuse' : 'cut',
  };
}

/** WRITE: the spec → every stored fuse field. Mode '' writes an unfused piece. */
export function writeFuseFields(s: PieceFuseSpec): PieceFuseFields {
  const fused = s.mode !== '';
  return {
    fused,
    fusingMode:
      s.mode === 'whole'
        ? MODE_FULL
        : s.mode === 'strip'
          ? MODE_STRIP
          : s.mode === 'zone'
            ? MODE_ZONE
            : MODE_UNSET,
    fusingWidthMm: s.mode === 'strip' && s.widthMm != null ? String(s.widthMm) : '',
    fusingBomLineKey: fused ? s.bomLineKey.trim() : '',
    fusingEdges: s.mode === 'strip' ? s.edges.map((e) => ({ ...e })) : [],
    fusingZone: s.mode === 'zone' ? s.zone : null,
    fusingInsetMm:
      fused && !s.insetNet && s.insetMm != null ? String(Math.round(s.insetMm * 10) / 10) : '',
    fusingInsetNet: fused && s.insetNet,
    fusingGrain: fused && s.grain !== 'as_piece' ? s.grain : '',
    fusingDarts: fused && s.darts !== 'cut' ? s.darts : '',
  };
}

type WireFuse = Pick<
  common_TechCardPiece,
  | 'fusingBomLineKey'
  | 'fusingEdges'
  | 'fusingInsetMm'
  | 'fusingInsetNet'
  | 'fusingGrain'
  | 'fusingDarts'
> & { fusingZone?: common_TechCardPieceFusingZone };

/** One wire spline → one form spline (null = absent or unreadable). */
function splineFromWire(spline: common_TechCardPieceFusingZone['spline']): FuseSpline | null {
  const pts = spline?.points ?? [];
  if (!pts.length) return null;
  const points = pts.map((p) => ({ x: num(p.x?.value), y: num(p.y?.value), corner: !!p.corner }));
  return points.every((p) => p.x != null && p.y != null)
    ? { points: points as { x: number; y: number; corner: boolean }[] }
    : null;
}

/** The wire zone → the form's zone (null = none, or an unreadable one). */
function zoneFromWire(z: common_TechCardPieceFusingZone | undefined): FuseZone | null {
  const rect = z?.rect;
  const r = rect ? [rect.x0, rect.y0, rect.x1, rect.y1].map((d) => num(d?.value)) : null;
  if (r && r.every((x) => x != null)) return { rect: r as [number, number, number, number] };
  const spline = splineFromWire(z?.spline);
  if (spline) {
    const holes = (z?.holes ?? []).map(splineFromWire);
    const islands = (z?.islands ?? []).map(splineFromWire);
    if (holes.every(Boolean) && islands.every(Boolean)) {
      return {
        spline,
        holes: holes as FuseSpline[],
        islands: islands as FuseSpline[],
      };
    }
  }
  const key = z?.dxfPieceKey?.trim();
  return key ? { dxfPieceKey: key } : null;
}

/** The form's zone → the wire. An empty message clears the stored zone. */
function zoneToWire(z: FuseZone | null): common_TechCardPieceFusingZone {
  const splineToWire = (spline: FuseSpline) => ({
    points: spline.points.map((p) => ({ x: dec(p.x), y: dec(p.y), corner: !!p.corner })),
  });
  if (!z) return { holes: [], islands: [] };
  if ('rect' in z)
    return {
      rect: { x0: dec(z.rect[0]), y0: dec(z.rect[1]), x1: dec(z.rect[2]), y1: dec(z.rect[3]) },
      holes: [],
      islands: [],
    };
  if ('spline' in z)
    return {
      spline: splineToWire(z.spline),
      holes: z.holes.map(splineToWire),
      islands: z.islands.map(splineToWire),
    };
  return { dxfPieceKey: z.dxfPieceKey, holes: [], islands: [] };
}

/** The wire piece → the form's plain fields (the new FUSING fields; fused/mode/width stay put). */
export function fuseFieldsFromWire(
  p: Partial<WireFuse>,
): Omit<PieceFuseFields, 'fused' | 'fusingMode' | 'fusingWidthMm'> {
  return {
    fusingBomLineKey: (p.fusingBomLineKey ?? '').trim(),
    fusingEdges: (p.fusingEdges?.items ?? []).map((e) => ({
      edge: e.edge ?? 0,
      startMm: num(e.startMm?.value) ?? 0,
      endMm: num(e.endMm?.value) ?? 0,
    })),
    fusingZone: zoneFromWire(p.fusingZone),
    fusingInsetMm: (p.fusingInsetMm?.value ?? '').trim(),
    fusingInsetNet: !!p.fusingInsetNet,
    fusingGrain: (p.fusingGrain ?? '').trim(),
    fusingDarts: (p.fusingDarts ?? '').trim(),
  };
}

/**
 * The form's plain fields → the wire. Every field goes out PRESENT: absence means «an older client,
 * keep what is stored», and this client speaks all of them (an empty edges/zone message clears).
 */
export function fuseFieldsToWire(
  f: Omit<PieceFuseFields, 'fused' | 'fusingMode' | 'fusingWidthMm'>,
): WireFuse {
  return {
    fusingBomLineKey: f.fusingBomLineKey.trim(),
    fusingEdges: {
      items: f.fusingEdges.map((e) => ({
        edge: e.edge,
        startMm: dec(e.startMm),
        endMm: dec(e.endMm),
      })),
    },
    fusingZone: zoneToWire(f.fusingZone),
    fusingInsetMm: { value: f.fusingInsetMm.trim() },
    fusingInsetNet: f.fusingInsetNet,
    fusingGrain: f.fusingGrain.trim(),
    fusingDarts: f.fusingDarts.trim(),
  };
}

/**
 * The generator's read of a stored card piece: null when not fused; a fused piece with no mode is
 * cut whole (what the workshop does with a bare «fused»).
 */
export function fuseSpecFromPiece(
  piece: Pick<common_TechCardPiece, 'fused' | 'fusingMode' | 'fusingWidthMm'> & Partial<WireFuse>,
): PieceFuseSpec | null {
  if (!piece.fused) return null;
  const spec = readFuseSpec({
    fused: true,
    fusingMode: piece.fusingMode,
    fusingWidthMm: piece.fusingWidthMm?.value ?? '',
    ...fuseFieldsFromWire(piece),
  });
  return spec.mode ? spec : { ...spec, mode: 'whole' };
}
