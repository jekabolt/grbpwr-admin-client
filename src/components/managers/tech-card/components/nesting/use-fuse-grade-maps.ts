// The piece dialog's grade maps: the same maps the fusing sheet carries drawn zones and notch ends
// by (attachGradeMaps in regenerate.ts), built in the nesting worker, so a zone drawn on one size
// looks on screen exactly as on the generated sheet. Maps already built come from the shared cache
// at once; the rest arrive when the worker answers, and until then the carry infers as before.

import { useEffect, useMemo, useState } from 'react';
import type { FusingSourcePiece } from 'lib/fusing-dxf/dxf';
import type { PieceGradeMap } from 'lib/fusing-dxf/grade-map-pair';
import { planGradeMaps } from 'lib/fusing-dxf/grade-map-source';
import { NestingWorkerClient } from 'lib/nesting/worker/client';

/** Piece identity → its grade map, for the pieces that read one and could be built. */
export function useFuseGradeMaps(
  pieces: readonly FusingSourcePiece[],
  baseSizeId: number | null,
): { maps: ReadonlyMap<string, PieceGradeMap>; settled: boolean } {
  // Bumped when the worker has put new maps into the cache: the plan is read again from it.
  const [built, setBuilt] = useState(0);
  // The plan whose worker run failed: its pieces stay inferred, and nothing more will arrive.
  const [failed, setFailed] = useState<unknown>(null);
  const plan = useMemo(() => planGradeMaps(pieces, baseSizeId), [pieces, baseSizeId, built]);
  const maps = useMemo(() => {
    const out = new Map<string, PieceGradeMap>();
    if (plan.jobs.length) return out;
    for (const piece of plan.apply([])) if (piece.gradeMap) out.set(piece.identity, piece.gradeMap);
    return out;
  }, [plan]);
  useEffect(() => {
    if (!plan.jobs.length) return;
    let live = true;
    const worker = new NestingWorkerClient();
    worker
      .gradeMaps(plan.jobs)
      .then((results) => {
        plan.apply(results);
        if (live) setBuilt((n) => n + 1);
      })
      // A failed run leaves those pieces inferred until the pieces change; no retry loop.
      .catch(() => {
        if (live) setFailed(plan);
      })
      .finally(() => worker.terminate());
    return () => {
      live = false;
      worker.terminate();
    };
  }, [plan]);
  return { maps, settled: !plan.jobs.length || failed === plan };
}
