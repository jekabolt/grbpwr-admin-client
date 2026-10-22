// HOW A PIECE IS FUSED — the UI's own shape of the fuse markup (FUSING wave, panel «Fold»).
//
// The piece row today carries only `fused` + `fusingMode` (full|strip) + `fusingWidthMm`. The
// rest of the markup (which interlining line, which edges, the zone, the inset, the fusible's
// grain, what happens to darts) is coming in the proto in a parallel lane. Until it lands the
// editor keeps the whole spec in its buffer and the WRITE adapter below persists only the fields
// that exist; every place a new field goes is marked `TODO(fusing-proto)`.
import { FUSING_MODE_STRIP, UNSET_FUSING_MODE } from '../piece-codes';

const FUSING_MODE_FULL = 'TECH_CARD_PIECE_FUSING_MODE_FULL';

export type FuseMode = '' | 'whole' | 'strip' | 'zone';
export type FuseGrain = 'as_piece' | 'lengthwise' | 'crosswise' | 'bias' | 'any';
export type FuseDarts = 'cut' | 'fuse';
/** One chosen edge of the outline (index of the segment poly[i]→poly[i+1]), trimmed at its ends. */
export type FuseEdge = { edge: number; startMm: number; endMm: number };
/** Piece-local mm, DXF axes (Y up), origin at the piece bbox min corner — or another DXF block. */
export type FuseZone = { rect: [number, number, number, number] } | { dxfPieceKey: string };

export type PieceFuseSpec = {
  mode: FuseMode;
  /** INTERLINING BOM line; '' = auto (the only interlining line of the BOM). */
  bomLineKey: string;
  /** Strip width, mm as typed; '' = the card's seam allowance. */
  widthMm: string;
  edges: FuseEdge[];
  zone?: FuseZone;
  /** undefined = default (DEFAULT_INSET_MM). */
  insetMm?: string;
  /** Inset equals the piece's seam allowance («net»). */
  insetNet?: boolean;
  /** undefined = as the piece. */
  grain?: FuseGrain;
  /** undefined = cut out. */
  darts?: FuseDarts;
};

export const DEFAULT_INSET_MM = 3;
/** Preview only: the strip drawn for an empty width (the real one is the seam allowance). */
export const PREVIEW_STRIP_MM = 10;
/** Preview only: «net» drawn at a typical seam allowance until the card's own is read here. */
export const PREVIEW_NET_MM = 10;

export const WIDTH_PRESETS = [10, 15, 20, 25];
export const INSET_PRESETS = [0, 2, 3, 5];
export const FUSE_GRAIN_ITEMS: { value: FuseGrain; label: string }[] = [
  { value: 'as_piece', label: 'as piece' },
  { value: 'lengthwise', label: 'lengthwise' },
  { value: 'crosswise', label: 'crosswise' },
  { value: 'bias', label: 'bias' },
  { value: 'any', label: 'any' },
];
export const DART_ITEMS: { value: FuseDarts; label: string }[] = [
  { value: 'cut', label: 'cut out' },
  { value: 'fuse', label: 'fuse over' },
];

export const blankFuse = (mode: FuseMode = ''): PieceFuseSpec => ({
  mode,
  bomLineKey: '',
  widthMm: '',
  edges: [],
});

type StoredFuse = { fused?: boolean; fusingMode?: string; fusingWidthMm?: string };

/** READ adapter: the piece's stored fields → the spec. */
export function readFuseSpec(p: StoredFuse): PieceFuseSpec {
  if (!p.fused) return blankFuse();
  const m = (p.fusingMode ?? '').trim();
  // A fused piece with no mode is the legacy «fused, how not said» — the panel flags it.
  const mode: FuseMode = m === FUSING_MODE_FULL ? 'whole' : m === FUSING_MODE_STRIP ? 'strip' : '';
  return {
    ...blankFuse(mode),
    widthMm: mode === 'strip' ? (p.fusingWidthMm ?? '').trim() : '',
    // TODO(fusing-proto): bomLineKey ← piece.fusingBomLineKey, edges ← fusingEdges,
    // zone ← fusingZone (and mode 'zone' ← TECH_CARD_PIECE_FUSING_MODE_ZONE), insetMm ←
    // fusingInsetMm, insetNet ← fusingInsetNet, grain ← fusingGrain, darts ← fusingDarts.
  };
}

/** WRITE adapter: the spec → the piece fields that exist today. `mode ''` with fused=false. */
export function writeFuseFields(s: PieceFuseSpec): Required<StoredFuse> {
  const fused = s.mode !== '';
  return {
    fused,
    fusingMode:
      s.mode === 'whole'
        ? FUSING_MODE_FULL
        : s.mode === 'strip'
          ? FUSING_MODE_STRIP
          : // TODO(fusing-proto): 'zone' → TECH_CARD_PIECE_FUSING_MODE_ZONE.
            UNSET_FUSING_MODE,
    fusingWidthMm: s.mode === 'strip' ? s.widthMm : '',
    // TODO(fusing-proto): fusingBomLineKey = bomLineKey || undefined; fusingEdges = edges
    // (strip only, as {edge,start_mm,end_mm}); fusingZone = zone (zone only); fusingInsetMm =
    // insetMm; fusingInsetNet = insetNet; fusingGrain = grain; fusingDarts = darts.
  };
}

/** The fused pieces whose spec is not finished: a strip with no edge, a zone with no zone. */
export const fuseIncomplete = (s: PieceFuseSpec) =>
  (s.mode === 'strip' && s.edges.length === 0) || (s.mode === 'zone' && !s.zone);

/** Any «more» field off its default — the fold opens by itself. */
export const fuseOffDefault = (s: PieceFuseSpec) =>
  !!s.insetNet ||
  (s.insetMm !== undefined && s.insetMm !== '' && Number(s.insetMm) !== DEFAULT_INSET_MM) ||
  (s.grain !== undefined && s.grain !== 'as_piece') ||
  (s.darts !== undefined && s.darts !== 'cut');

const mmOf = (x?: string): number | null => {
  if (x === undefined || x.trim() === '') return null;
  const v = Number(x.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/** Numbers the canvas draws with. */
export function resolveFuse(s: PieceFuseSpec) {
  return {
    widthMm: mmOf(s.widthMm) ?? PREVIEW_STRIP_MM,
    insetMm: s.insetNet ? PREVIEW_NET_MM : mmOf(s.insetMm) ?? DEFAULT_INSET_MM,
    darts: s.darts ?? 'cut',
  };
}

/** The interlining line in force: the chosen one, else the only one. */
export const fuseLineOf = (s: PieceFuseSpec, lineKeys: readonly string[]) =>
  s.bomLineKey || (lineKeys.length === 1 ? lineKeys[0] : '');

/** «12», «12.5», «12,5» — a number the width/inset pickers accept as typed. */
export const isMmText = (t: string) => /^\d+([.,]\d+)?$/.test(t.trim());
