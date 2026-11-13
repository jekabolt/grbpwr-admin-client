// Grade map · building piece maps: the nesting worker runs `runGradeMapJobs`; tests and the golden
// run build in place with `attachGradeMapsSync`. One piece that fails to build goes without a map.

import { buildPieceMap } from 'lib/grade-map/build';
import type { FusingSourcePiece } from './dxf';
import {
  planGradeMaps,
  type GradeMapJob,
  type GradeMapJobResult,
  type GradeMapStats,
} from './grade-map-source';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function runGradeMapJobs(jobs: readonly GradeMapJob[]): GradeMapJobResult[] {
  return jobs.map((job) => {
    const t0 = now();
    try {
      const { piece } = buildPieceMap(job.input, job.sizeOrder);
      return { key: job.key, piece, ms: now() - t0 };
    } catch (e) {
      return {
        key: job.key,
        piece: null,
        ms: now() - t0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

/** `attachGradeMaps` built in place, for callers off the main thread or outside the app. */
export function attachGradeMapsSync(
  pieces: readonly FusingSourcePiece[],
  baseSizeId: number | null | undefined,
  fileHash = '',
): { pieces: FusingSourcePiece[]; stats: GradeMapStats } {
  const plan = planGradeMaps(pieces, baseSizeId, fileHash);
  return { pieces: plan.apply(runGradeMapJobs(plan.jobs)), stats: plan.stats };
}
