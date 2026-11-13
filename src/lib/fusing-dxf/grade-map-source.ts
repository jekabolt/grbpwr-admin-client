// Grade map · which pieces get one, under which key, and the cache that keeps them.
//
// A map is built for a piece whose fuse is a drawn zone (not a zone borrowed from another piece)
// and that has two or more sizes: that is the only carry that reads it. The map is built once per
// key — builder version, file, piece, base size and a fingerprint of the geometry it was built
// from — and kept in a small cache on this side, so a second regeneration of the same file builds
// nothing. The build itself runs wherever `run` sends the jobs: the nesting worker in the app,
// in place in tests and the golden run (`attachGradeMapsSync` in grade-map-job.ts).

import { fromSourceSize } from 'lib/grade-map';
import { BUILDER } from 'lib/grade-map/build';
import type { GmPiece, GmPieceInput } from 'lib/grade-map/types';
import type { FusingSourcePiece } from './dxf';
import { chooseBaseSize } from './grade-map-base';
import type { PieceGradeMap } from './grade-map-pair';

/** One piece map to build. */
export type GradeMapJob = { key: string; input: GmPieceInput; sizeOrder: number[] };
/** Its outcome: the piece map, or null and why. */
export type GradeMapJobResult = { key: string; piece: GmPiece | null; ms: number; error?: string };

export type GradeMapStats = {
  /** Pieces that could use a map (drawn zone, two or more sizes). */
  eligible: number;
  /** Maps built now, and taken from the cache. */
  built: number;
  cached: number;
  /** Pieces left without a map (builder error, or the run failed). */
  failed: number;
  /** Build time reported by the jobs, ms. */
  buildMs: number;
};

/** Maps kept, most recently used last. Built maps and failed builds both stay. */
const CACHE_MAX = 64;
const cache = new Map<string, PieceGradeMap | null>();

function remember(key: string, map: PieceGradeMap | null) {
  cache.delete(key);
  cache.set(key, map);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

function recall(key: string): PieceGradeMap | null | undefined {
  if (!cache.has(key)) return undefined;
  const map = cache.get(key)!;
  remember(key, map);
  return map;
}

/** Forget every kept map (tests). */
export function clearGradeMapCache() {
  cache.clear();
}

/** The piece reads a map: a drawn zone, two or more sizes. */
export function wantsGradeMap(piece: FusingSourcePiece): boolean {
  const fuse = piece.fuse;
  if (!fuse || piece.ungraded) return false;
  // A drawn zone, or a strip with an end kept at its notch: the two carries that read the map.
  const zone = fuse.mode === 'zone' && !!fuse.zone && !('dxfPieceKey' in fuse.zone);
  const notch =
    fuse.mode === 'strip' &&
    fuse.edges.some((e) => e.startMode === 'notch' || e.endMode === 'notch');
  if (!zone && !notch) return false;
  return new Set(piece.sizes.map((s) => s.sizeId)).size >= 2;
}

/** FNV-1a over a string, as 8 hex digits. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const pts = (list: readonly { x: number; y: number }[] | null | undefined) =>
  (list ?? []).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

/** The build input of a piece, its key, and the base size the map is absolute in. */
export function gradeMapJob(
  piece: FusingSourcePiece,
  baseSizeId: number | null | undefined,
  fileHash = '',
): GradeMapJob | null {
  if (!wantsGradeMap(piece)) return null;
  const ordered = [...piece.sizes].sort((a, b) => a.rank - b.rank);
  const base = chooseBaseSize(
    ordered,
    (size) => size.sizeId === baseSizeId,
    (size) => size.rank,
  );
  if (!base) return null;
  const seen = new Set<number>();
  const sizes = ordered.filter((s) => !seen.has(s.sizeId) && !!seen.add(s.sizeId));
  const input: GmPieceInput = {
    key: piece.identity,
    baseSizeId: base.sizeId,
    sizes: sizes.map(fromSourceSize),
  };
  const fingerprint = fnv(
    input.sizes
      .map(
        (g) =>
          `${g.sizeId}|${pts(g.cut)}|${pts(g.seam)}|` +
          g.lines.map((l) => `${l.layer}:${l.closed ? 1 : 0}:${pts(l.points)}`).join(';'),
      )
      .join('#'),
  );
  return {
    key: `${BUILDER}|${fileHash}|${piece.identity}|${base.sizeId}|${fingerprint}`,
    input,
    sizeOrder: sizes.map((s) => s.sizeId),
  };
}

/** What still has to be built, and how to put the results onto the pieces. */
export function planGradeMaps(
  pieces: readonly FusingSourcePiece[],
  baseSizeId: number | null | undefined,
  fileHash = '',
) {
  const stats: GradeMapStats = { eligible: 0, built: 0, cached: 0, failed: 0, buildMs: 0 };
  const plans = pieces.map((piece) => gradeMapJob(piece, baseSizeId, fileHash));
  const jobs: GradeMapJob[] = [];
  /** The maps this call hands out, held here so a cache eviction cannot drop one midway. */
  const resolved = new Map<string, PieceGradeMap | null>();
  for (const plan of plans) {
    if (!plan) continue;
    stats.eligible++;
    if (resolved.has(plan.key) || jobs.some((j) => j.key === plan.key)) continue;
    const kept = recall(plan.key);
    if (kept !== undefined) {
      stats.cached++;
      resolved.set(plan.key, kept);
    } else jobs.push(plan);
  }
  /** `results` = null when the run failed as a whole: those pieces go without a map, uncached. */
  const apply = (results: readonly GradeMapJobResult[] | null): FusingSourcePiece[] => {
    const byKey = new Map((results ?? []).map((r) => [r.key, r]));
    for (const job of jobs) {
      const r = byKey.get(job.key);
      if (!r) continue;
      stats.buildMs += r.ms;
      if (r.piece) stats.built++;
      const map = r.piece
        ? { piece: r.piece, baseSizeId: job.input.baseSizeId, key: job.key }
        : null;
      remember(job.key, map);
      resolved.set(job.key, map);
    }
    return pieces.map((piece, i) => {
      const plan = plans[i];
      if (!plan) return piece;
      const map = resolved.get(plan.key) ?? null;
      if (!map) {
        stats.failed++;
        return piece;
      }
      return { ...piece, gradeMap: map };
    });
  };
  return { jobs, stats, apply };
}

/**
 * The pieces with their grade maps attached (pieces that read none come back as they were).
 * `run` builds the jobs (the nesting worker); when it fails, every piece goes without a map.
 */
export async function attachGradeMaps(
  pieces: readonly FusingSourcePiece[],
  baseSizeId: number | null | undefined,
  run: (jobs: GradeMapJob[]) => Promise<GradeMapJobResult[]>,
  fileHash = '',
): Promise<{ pieces: FusingSourcePiece[]; stats: GradeMapStats }> {
  const plan = planGradeMaps(pieces, baseSizeId, fileHash);
  let results: GradeMapJobResult[] | null = [];
  if (plan.jobs.length) {
    try {
      results = await run(plan.jobs);
    } catch {
      results = null;
    }
  }
  return { pieces: plan.apply(results), stats: plan.stats };
}
