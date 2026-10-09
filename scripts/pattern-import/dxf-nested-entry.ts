// Nested-size guard probe entry — bundled by `scripts/pattern-import/dxf-nested.mjs`.
import { dxfFastPath, readDxf, segmentDxf } from 'lib/pattern-import/adapters/dxf';
import type { DxfPieceCandidate } from 'lib/pattern-import/adapters/dxf';

export { dxfFastPath, readDxf, segmentDxf };

const OPTS = { sagittaMm: 0.05, keepFills: true };

/** DXF bytes → fast path, the way the worker builds it (read → segment → fast path). */
export async function fastPathOf(name: string, bytes: ArrayBuffer) {
  const read = await readDxf({ id: '0', name, bytes }, OPTS);
  const seg = segmentDxf(read);
  return { read, seg, fast: seg.presegmented ? dxfFastPath(read, seg) : null };
}

/**
 * Canonical, order-stable summary of the fast path's piece output: what the pieces stage hands
 * downstream (families × candidates) plus the run. Areas are rounded to 1 mm² so the comparison
 * is about decisions, not float noise.
 */
export function canonical(fast: ReturnType<typeof dxfFastPath> | null) {
  if (!fast) return null;
  return {
    sizes: fast.run.sizes.map((s) => s.label),
    encoding: fast.run.encoding,
    families: fast.families.map((f) => ({
      seed: f.seed,
      monotone: f.monotone,
      candidates: f.candidates.map((c) => {
        const d = (c as DxfPieceCandidate).dxf;
        return {
          seed: c.seed,
          rank: c.rank,
          block: d?.block ?? null,
          outcome: c.outcome,
          areaMm2: Math.round(c.areaMm2),
          outerPts: c.outer.length,
          walls: c.walls.length,
          inside: c.inside.length,
          features: d?.features.length ?? 0,
          ...(c.gradeRefusal ? { gradeRefusal: c.gradeRefusal } : {}),
        };
      }),
    })),
  };
}
