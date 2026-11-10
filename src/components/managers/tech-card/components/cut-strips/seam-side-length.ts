// A SEAM'S LENGTH ON EVERY SIZE. Geometry lives only on the client, so this is where a `from_seam`
// strip's `seam_mm` comes from: the seam's anchors resolved on the size they were confirmed on and
// carried to the others by the piece's own edge sequence, exactly as every stored seam is.
//
// Only the side that is cloth is read. A strip on the other side would break the read in two ways:
// its rectangle is one drawing for all sizes, so the seam's length ratio "drifts" on every size but
// the drawn one; and its length is the very thing being computed. The partner is a fixed probe
// instead, with the drift guard off, because a probe has no length to be faithful to.
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { seamPieceOf, segmentPiece } from 'lib/assembly-skeleton/geometry';
import { grainRotation } from 'lib/pom/upright';
import {
  anchorOfRunId,
  resolveAcrossSizes,
  type EdgeAnchor,
  type SizePieces,
  type StoredSeam,
} from 'lib/seams';

import { sizeTokensOf } from '../nesting/block-code';
import type { FoundPiece } from '../nesting/dxf-geometry';
import { stripFoundPiece } from './strip-pieces';

/** Sewn length per card size id. `undefined` when it cannot be read: the stored value then stands. */
export type SeamLengthsMm = (seamKey: string) => ReadonlyMap<number, number> | undefined;

export type FindPiece = (pieceKey: string, atSize?: string) => FoundPiece | null;

const NO_LENGTHS: ReadonlyMap<string, number> = new Map();
const ONE_DECIMAL = 10;

const geomOf = (pieceKey: string, hit: FoundPiece): PieceGeom =>
  segmentPiece({
    pieceKey,
    name: pieceKey,
    piece: seamPieceOf(hit.layers?.length ? hit.layers : [hit.piece]) ?? hit.piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });

const PROBE_KEY = 'seam-length-probe';
let cachedProbe: { geom: PieceGeom; anchor: EdgeAnchor } | null | undefined;

function probeOf() {
  if (cachedProbe !== undefined) return cachedProbe;
  const found = stripFoundPiece(PROBE_KEY, {
    label: PROBE_KEY,
    mode: 'per_size',
    fitPct: 100,
    overlapMm: 0,
    widthMm: 100,
    sewnMm: 1000,
  });
  const geom = geomOf(PROBE_KEY, found);
  const long = [...geom.edges].sort((a, b) => b.lenMm - a.lenMm)[0];
  const anchor = long ? anchorOfRunId([geom], long.id) : null;
  cachedProbe = anchor ? { geom, anchor } : null;
  return cachedProbe;
}

/** The side that is the seam's length: the one with no strip on it. `null` when neither is. */
export function seamSideOf(
  row: StoredSeam,
  stripKeys: ReadonlySet<string>,
): readonly EdgeAnchor[] | null {
  if (row.kind === 'surface') return null;
  const isCloth = (side: readonly EdgeAnchor[]) =>
    side.length > 0 && side.every((anchor) => !stripKeys.has(anchor.piece));
  if (isCloth(row.sideA)) return row.sideA;
  return isCloth(row.sideB) ? row.sideB : null;
}

const sewnShare = (anchor: EdgeAnchor, kind: StoredSeam['kind']) =>
  kind === 'edge' ? 1 : Math.max(0, Math.min(1, anchor.range[1]) - Math.max(0, anchor.range[0]));

/** One side's sewn length on every size given, by the size's token. */
export function sideLengthsAcrossSizes(
  row: StoredSeam,
  side: readonly EdgeAnchor[],
  sizes: readonly SizePieces[],
): ReadonlyMap<string, number> {
  const probe = probeOf();
  if (!probe || sizes.length === 0) return NO_LENGTHS;
  const alone: StoredSeam = {
    ...row,
    kind: 'edge',
    status: 'confirmed',
    stale: false,
    sideA: [...side],
    sideB: [probe.anchor],
  };
  const resolved = resolveAcrossSizes(
    [alone],
    sizes.map((size) => ({ ...size, pieces: [...size.pieces, probe.geom] })),
    { thresholds: { ratioDrift: Number.POSITIVE_INFINITY as never } },
  );
  const out = new Map<string, number>();
  for (const [size, read] of resolved) {
    const hits = read.applied[0]?.a;
    if (!hits?.length) continue;
    const mm = hits.reduce((sum, hit) => sum + hit.lenMm * sewnShare(hit.anchor, row.kind), 0);
    out.set(size, Math.round(mm * ONE_DECIMAL) / ONE_DECIMAL);
  }
  return out;
}

/**
 * The seam on every size the pattern draws its pieces in. A block drawn once joins every size; a
 * size missing one of the side's pieces has no length, and says so by being absent.
 */
export function seamLengthsOf(
  row: StoredSeam,
  stripKeys: ReadonlySet<string>,
  find: FindPiece,
): ReadonlyMap<string, number> {
  const side = seamSideOf(row, stripKeys);
  if (!side) return NO_LENGTHS;
  return sideAnchorLengthsOf(row, side, find);
}

/** One persisted side across the pattern sizes; used by one-sided topstitch lines. */
export function sideAnchorLengthsOf(
  row: Pick<StoredSeam, 'anchoredSize'> & { kind?: StoredSeam['kind'] },
  side: readonly EdgeAnchor[],
  find: FindPiece,
): ReadonlyMap<string, number> {
  const keys = [...new Set(side.map((anchor) => anchor.piece))];
  const medians = new Map(keys.map((key) => [key, find(key)]));
  if ([...medians.values()].some((hit) => !hit)) return NO_LENGTHS;
  const graded = new Set(keys.flatMap((key) => medians.get(key)!.sizes.filter(Boolean)));
  const sizes = (graded.size ? [...graded] : ['']).map((size) => {
    const pieces: PieceGeom[] = [];
    const grainDeg = new Map<string, number>();
    for (const key of keys) {
      const median = medians.get(key)!;
      const isGraded = median.sizes.some(Boolean);
      const hit = !isGraded || median.size === size ? median : find(key, size);
      if (!hit) continue;
      pieces.push(geomOf(key, hit));
      grainDeg.set(key, grainRotation(hit.piece));
    }
    return { size, pieces, grainDeg };
  });
  return sideLengthsAcrossSizes(
    {
      seamKey: 'one-sided-length',
      status: 'confirmed',
      kind: row.kind ?? 'partial',
      direction: 'unknown',
      source: 'manual',
      sideA: [...side],
      sideB: [],
      anchoredSize: row.anchoredSize,
      note: '',
    },
    side,
    sizes,
  );
}

/** The seam on the geometry already read for one size: the print's question, "is what is stored still so". */
export function seamLengthOnGeoms(
  row: StoredSeam,
  stripKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg?: ReadonlyMap<string, number>,
): number | undefined {
  const side = seamSideOf(row, stripKeys);
  if (!side) return undefined;
  const pieces = [...new Set(side.map((anchor) => anchor.piece))].flatMap((key) => {
    const geom = geoms.get(key);
    return geom ? [geom] : [];
  });
  const size = row.anchoredSize;
  return sideLengthsAcrossSizes(row, side, [{ size, pieces, grainDeg }]).get(size);
}

/** DXF size tokens to the card's size ids. A pattern drawn in one size is every size of the card. */
export function lengthsBySizeId(
  byToken: ReadonlyMap<string, number>,
  sizeIds: readonly number[],
  sizeNames: ReadonlyMap<number, string>,
): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  const ungraded = byToken.get('');
  for (const id of sizeIds) {
    if (ungraded !== undefined) {
      out.set(id, ungraded);
      continue;
    }
    const tokens = sizeTokensOf(sizeNames.get(id));
    for (const [token, mm] of byToken) {
      if (tokens.includes(token.trim().toLowerCase())) {
        out.set(id, mm);
        break;
      }
    }
  }
  return out;
}

/** A stable reader: the same seam gives the same Map, so an effect on it runs once. */
export function seamLengthsReader(input: {
  rows: readonly StoredSeam[];
  stripKeys: ReadonlySet<string>;
  find: FindPiece;
  sizeIds: readonly number[];
  sizeNames: ReadonlyMap<number, string>;
}): SeamLengthsMm {
  const cache = new Map<string, ReadonlyMap<number, number> | undefined>();
  return (seamKey) => {
    if (cache.has(seamKey)) return cache.get(seamKey);
    const row = input.rows.find((candidate) => candidate.seamKey === seamKey);
    const lengths = row
      ? lengthsBySizeId(
          seamLengthsOf(row, input.stripKeys, input.find),
          input.sizeIds,
          input.sizeNames,
        )
      : undefined;
    const known = lengths?.size ? lengths : undefined;
    cache.set(seamKey, known);
    return known;
  };
}
