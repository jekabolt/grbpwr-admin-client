// pieces/gfit/silent-inputs (SILENT) — the pieces-stage side of the grade checks: the families'
// closed sizes and the wall model's size lines near each family → `gradeVerdicts` (silent.ts), and
// whether a size draws its own line beside its outline (the drawing grades it there). One reading
// per sheet, used by the semantics stage (→ the gate's `gradeByBlock`) and by the archive probe.
import type { ChainId, ChainSet, GradeEvidence, PieceFamily, PtMm } from 'lib/pattern-import/types';

import { isAnchor } from '../fill';
import { bboxOf, pointInPoly, segNearest, SegGrid } from '../geom';
import type { WallModel } from '../walls';
import { gradeVerdicts, silentOff, type GradeFamilyIn, type GradeResult } from './silent';

/** A size draws its own line off its outline: ≥ minMm of its own lines, > offMm from the outline,
 * inside it or ≤ outsideMm out of it. */
export const DRAWS_OWN = { offMm: 1.5, minMm: 20, sampleMm: 2, padMm: 15, outsideMm: 15 };

export type SilentRead = {
  /** The grade model over the sheet's families (fitted on first use). */
  grade: () => GradeResult | null;
  /** The size draws its own line beside its outline (undefined: no closed candidate). */
  drawsOwn: (seed: number, rank: number) => boolean | undefined;
  /** The pieces-stage evidence of one size of one family (undefined: nothing to say). */
  evidence: (seed: number, rank: number) => GradeEvidence | undefined;
};

const NONE: SilentRead = {
  grade: () => null,
  drawsOwn: () => undefined,
  evidence: () => undefined,
};

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const inBox = (pts: readonly PtMm[], b: Box, pad: number) => {
  const q = bboxOf(pts);
  return !(
    q.maxX < b.minX - pad ||
    q.minX > b.maxX + pad ||
    q.maxY < b.minY - pad ||
    q.minY > b.maxY + pad
  );
};

/**
 * The sheet's grade reading. `wm` — the wall model the families were ranked by (its size classes
 * and common lines); null or single-size → nothing (no size lines to tell sizes apart by).
 */
export function silentRead(
  families: readonly PieceFamily[],
  set: ChainSet,
  wm: Pick<WallModel, 'mode' | 'byRank' | 'common'> | null,
): SilentRead {
  if (silentOff() || !wm || wm.mode === 'single' || wm.byRank.length < 2) return NONE;
  const chainById = new Map(set.chains.map((c) => [c.id, c]));
  const common = new Set(wm.common);
  const rankOf = new Map<ChainId, number[]>();
  wm.byRank.forEach((ids, r) => {
    for (const id of ids) rankOf.set(id, [...(rankOf.get(id) ?? []), r]);
  });
  const lineOf = (id: ChainId): PtMm[] | null => {
    const c = chainById.get(id);
    if (!c || c.pts.length < 2) return null;
    return c.closed ? [...c.pts, c.pts[0]] : c.pts;
  };
  const boxes = new Map<number, Box>();
  const ins: GradeFamilyIn[] = [];
  for (const f of families) {
    const closed = f.candidates.filter((c) => c.outcome === 'closed' && c.outer.length > 2);
    if (!closed.length) continue;
    const box = bboxOf(closed.flatMap((c) => c.outer));
    boxes.set(f.seed, box);
    // the size lines near the family, once per family
    const near: { id: ChainId; pts: PtMm[]; ranks: number[]; common: boolean }[] = [];
    for (const [id, ranks] of rankOf) {
      const pts = lineOf(id);
      if (pts && inBox(pts, box, 5)) near.push({ id, pts, ranks, common: common.has(id) });
    }
    for (const id of common) {
      if (rankOf.has(id)) continue;
      const pts = lineOf(id);
      if (pts && inBox(pts, box, 5)) near.push({ id, pts, ranks: [], common: true });
    }
    const memo = new Map<string, PtMm[][]>();
    const pick = (key: string, ok: (x: (typeof near)[number]) => boolean) => {
      let v = memo.get(key);
      if (!v) memo.set(key, (v = near.filter(ok).map((x) => x.pts)));
      return v;
    };
    // the grade model for a family that can be written: every size closed (a leaking size blocks
    // the family before the gate — fitting it costs the worker time for nothing)
    if (closed.length < f.candidates.length) continue;
    ins.push({
      seed: f.seed,
      sizes: closed.map((c) => ({ rank: c.rank, outer: c.outer, anchor: isAnchor(c) })),
      lines: {
        neighbour: (r) =>
          pick(`n${r}`, (x) => !x.common && x.ranks.length > 0 && !x.ranks.includes(r)),
        own: (r) => pick(`o${r}`, (x) => x.common || x.ranks.includes(r)),
      },
    });
  }
  let grade: GradeResult | null = null;
  let byKey: Map<string, GradeResult['verdicts'][number]> | null = null;
  const gradeNow = () => {
    if (!grade) {
      grade = gradeVerdicts(ins);
      byKey = new Map(grade.verdicts.map((v) => [`${v.seed}:${v.rank}`, v]));
    }
    return grade;
  };
  const famBy = new Map(families.map((f) => [f.seed, f]));
  const drawsMemo = new Map<string, boolean>();
  const drawsOwn = (seed: number, rank: number): boolean | undefined => {
    const key = `${seed}:${rank}`;
    if (drawsMemo.has(key)) return drawsMemo.get(key);
    const box = boxes.get(seed);
    const cand = famBy.get(seed)?.candidates.find((c) => c.rank === rank);
    if (!box || !cand || cand.outcome !== 'closed' || cand.outer.length < 3) return undefined;
    const ring = cand.outer;
    const g = new SegGrid(4);
    g.addPolyline(0, ring, true);
    const onRing = (p: PtMm) => {
      let hit = false;
      g.near(p, DRAWS_OWN.offMm, (_o, s) => {
        if (!hit && segNearest(p, ring[s], ring[(s + 1) % ring.length]).d <= DRAWS_OWN.offMm)
          hit = true;
      });
      return hit;
    };
    const P = DRAWS_OWN.padMm;
    let len = 0;
    for (const id of wm.byRank[rank] ?? []) {
      if (common.has(id) || (rankOf.get(id)?.length ?? 0) > 1) continue;
      const pts = lineOf(id);
      if (!pts || !inBox(pts, box, P)) continue;
      for (let i = 0; i + 1 < pts.length && len < DRAWS_OWN.minMm; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const k = Math.max(1, Math.ceil(L / DRAWS_OWN.sampleMm));
        for (let j = 0; j < k; j++) {
          const p = { x: a.x + ((b.x - a.x) * (j + 0.5)) / k, y: a.y + ((b.y - a.y) * (j + 0.5)) / k };
          if (p.x < box.minX - P || p.x > box.maxX + P || p.y < box.minY - P || p.y > box.maxY + P)
            continue;
          // beside the outline: inside it, or outside within ~a size step (a run collapsed onto its
          // SMALLEST outline has the next size's line just out there; farther out a neighbouring
          // piece's lines of the same size would read as this piece's — Codex r2)
          if (onRing(p)) continue;
          if (!pointInPoly(p, ring)) {
            let near = false;
            g.near(p, DRAWS_OWN.outsideMm, (_o, s) => {
              if (!near && segNearest(p, ring[s], ring[(s + 1) % ring.length]).d <= DRAWS_OWN.outsideMm)
                near = true;
            });
            if (!near) continue;
          }
          len += L / k;
        }
      }
      if (len >= DRAWS_OWN.minMm) break;
    }
    const out = len >= DRAWS_OWN.minMm;
    drawsMemo.set(key, out);
    return out;
  };
  return {
    grade: gradeNow,
    drawsOwn,
    evidence: (seed, rank) => {
      gradeNow();
      const v = byKey!.get(`${seed}:${rank}`);
      const own = drawsOwn(seed, rank);
      const e: GradeEvidence = {
        ...(v?.hold ? { hold: v.note } : {}),
        ...(v && !v.hold && !v.excused ? { warn: v.note } : {}),
        ...(own != null ? { drawsOwn: own } : {}),
      };
      return Object.keys(e).length ? e : undefined;
    },
  };
}
