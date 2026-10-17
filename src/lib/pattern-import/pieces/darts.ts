// pieces/darts (DARTS) — a dart drawn inside a piece is a mark of that piece, never a piece.
//
// Mood's old (G0) sheets draw a dart as two legs meeting at its point, its mouth closed by the
// piece's outline — a closed face the face pass sets aside beside the piece it lies in, printing
// «DART» (pieces/faces dartIn: its only label a dart word, its face a narrow wedge). Its own label
// made it «a piece of its own» to the copy proof (SetAsideCopy.ownLabel), so the file stopped on a
// question no operator needs. Here it is proven a dart of its piece against the piece's closed
// sizes (dartOf — the third evidence: its mouth on the piece's edge, its sides and point inside),
// and the proven darts travel to the semantics (SemanticsInput.darts): each size of the piece
// writes its own dart legs as internal lines, labelled «dart» (layer 8, semantics/features).
// The helpers the copy proof shares (auto-advance provenCopy) live here too.
import type { BoxMm, ChainSet, PieceFamily, PtMm, Seed, SeedId, SetAside, SizeRun } from '../types';
import { dartVs } from '../semantics/features';
import { pointInPoly } from './geom';

export type DartFam = Pick<PieceFamily, 'candidates' | 'seed'>;
export type DartSeedAt = Pick<Seed, 'id' | 'at'>;

/** A dart proven of a seeded piece: its point, its mouth's corners, its length (dartOf). */
export type ProvenDart = {
  seed: SeedId;
  label: string;
  apex: PtMm;
  base: [PtMm, PtMm];
  lenMm: number;
};

/** A family's closed sizes (an outline to measure against). */
export const closedSizes = (f: DartFam) =>
  f.candidates.filter((x) => x.outcome === 'closed' && x.outer.length > 2);

/**
 * How far an edge sample (pieces/faces rimSamples: on the wall that bounds it — the drawn line)
 * may lie from a size outline and still be that outline's line: 2.5 face cells, never under
 * 1.5 mm.
 */
export const rimTolMm = (cellMm: number | undefined) => Math.max(1.5, 2.5 * (cellMm ?? 0.5));

/**
 * The seeded piece of a host outline: the family of the seed standing on the host's seed point (a
 * click moved off it, or the seed gone → none); without the seeds, the innermost family whose
 * outline holds the point.
 */
export function hostFamily(
  h: PtMm,
  families: readonly DartFam[],
  seeds?: readonly DartSeedAt[],
): DartFam | null {
  if (seeds) {
    const sd = seeds.find((x) => Math.abs(x.at.x - h.x) < 0.01 && Math.abs(x.at.y - h.y) < 0.01);
    return sd == null
      ? null
      : families.find((f) => f.seed === sd.id && closedSizes(f).length > 0) ?? null;
  }
  let fam: DartFam | null = null;
  let best = Infinity;
  for (const f of families)
    for (const x of closedSizes(f))
      if (x.areaMm2 < best && pointInPoly(h, x.outer)) {
        best = x.areaMm2;
        fam = f;
      }
  return fam;
}

/** The share of points within `tol` mm of one of the outlines. */
export function onOutlines(
  pts: readonly PtMm[],
  outlines: readonly { outer: readonly PtMm[]; bbox: BoxMm }[],
  tol: number,
): number {
  const t2 = tol * tol;
  let on = 0;
  for (const p of pts) {
    let hit = false;
    for (const o of outlines) {
      const b = o.bbox;
      if (p.x < b.minX - tol || p.x > b.maxX + tol || p.y < b.minY - tol || p.y > b.maxY + tol)
        continue;
      const q = o.outer;
      for (let i = 0, j = q.length - 1; i < q.length && !hit; j = i++) {
        const A = q[j];
        const B = q[i];
        if (
          (p.x < A.x - tol && p.x < B.x - tol) ||
          (p.x > A.x + tol && p.x > B.x + tol) ||
          (p.y < A.y - tol && p.y < B.y - tol) ||
          (p.y > A.y + tol && p.y > B.y + tol)
        )
          continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L)) : 0;
        const ex = A.x + u * dx - p.x;
        const ey = A.y + u * dy - p.y;
        if (ex * ex + ey * ey <= t2) hit = true;
      }
      if (hit) break;
    }
    if (hit) on++;
  }
  return pts.length ? on / pts.length : 0;
}

/**
 * An aside the face pass read as a possible dart (SetAside.dart: its only label a dart word, its
 * face a narrow wedge) is a dart of the piece it lies in — never a piece, never a size copy — when
 * that piece is seeded and closes, and the wedge sits on it as a dart does. Read along its edge
 * samples (on the lines that bound it), placed along its axis from the point (0) to the mouth (1):
 *   mouth  on ONE closed size outline of the piece (within rimTolMm): ≥ 3 samples, all in the
 *          mouth's quarter (≥ 0.75), spread across the axis over ≥ 60 % of its opening — it opens
 *          on the piece's edge;
 *   sides  the samples of its sides (0.15…0.7) lie on none of the piece's size outlines — its
 *          sides are lines inside the piece, not a strip between two of its sizes;
 *   point  inside every closed size, at least a quarter of its length from each outline;
 *   legs   every closed size draws its own V there (SetAsideDart.legs, dartLegsDrawn) — the legs
 *          the semantics write on layer 8 for each size; a size without them leaves the question.
 * The evidence in words and the host's seed, or null (a wedge that is not a dart of its piece
 * stays a question, D3).
 */
export function provenDart(
  a: SetAside,
  families: readonly DartFam[],
  seeds?: readonly DartSeedAt[],
): { ev: string; seed: SeedId } | null {
  const d = a.dart;
  if (!d?.host || !d.rim.length) return null;
  // every closed size of the piece draws its own V there (the session counts them: dartLegsDrawn)
  if (!d.legs || !d.legs.sizes || d.legs.drawn < d.legs.sizes) return null;
  const fam = hostFamily(d.host, families, seeds);
  if (!fam) return null;
  const sizes = closedSizes(fam);
  if (!sizes.length) return null;
  const tol = rimTolMm(d.cellMm);
  const mid = { x: (d.base[0].x + d.base[1].x) / 2, y: (d.base[0].y + d.base[1].y) / 2 };
  const ax = { x: mid.x - d.apex.x, y: mid.y - d.apex.y };
  const L2 = ax.x * ax.x + ax.y * ax.y;
  if (L2 < 1) return null;
  const L = Math.sqrt(L2);
  const along = (p: PtMm) => ((p.x - d.apex.x) * ax.x + (p.y - d.apex.y) * ax.y) / L2;
  const across = (p: PtMm) => ((p.x - d.apex.x) * -ax.y + (p.y - d.apex.y) * ax.x) / L;
  const mouth = sizes.some((x) => {
    const on = d.rim.filter((p) => onOutlines([p], [x], tol) === 1);
    if (on.length < 3 || on.some((p) => along(p) < 0.75)) return false;
    const t = on.map(across);
    return Math.max(...t) - Math.min(...t) >= 0.6 * d.openMm;
  });
  if (!mouth) return null;
  const sides = d.rim.filter((p) => along(p) >= 0.15 && along(p) <= 0.7);
  if (sides.length < 4 || onOutlines(sides, sizes, tol) > 0) return null;
  const deep = Math.max(tol, 0.25 * d.lenMm);
  const point = sizes.every(
    (x) => pointInPoly(d.apex, x.outer) && onOutlines([d.apex], [x], deep) === 0,
  );
  if (!point) return null;
  return {
    seed: fam.seed,
    ev: `a dart of the piece («${d.label}»): a wedge ${d.lenMm} mm long opening ${d.openMm} mm on the piece's outline, its sides inside the piece, its point inside every size`,
  };
}

/**
 * Per possible dart (an aside carrying SetAsideDart), how many of its host's closed sizes draw
 * their own V there (semantics/features dartVs: the legs each size writes on layer 8), of how many.
 * Every possible dart of one host is matched together, so a V two of them would both take is
 * neither's (Codex r2). On the face pass's account of the wedge, before it is proven; the session
 * sets SetAsideDart.legs with it.
 */
export function dartLegsDrawn(
  asides: readonly SetAside[],
  families: readonly PieceFamily[],
  seeds: readonly DartSeedAt[],
  set: ChainSet,
  run: SizeRun | null,
): Map<number, { sizes: number; drawn: number }> {
  const out = new Map<number, { sizes: number; drawn: number }>();
  const byHost = new Map<DartFam, SetAside[]>();
  for (const a of asides) {
    const fam = a.dart?.host ? hostFamily(a.dart.host, families, seeds) : null;
    if (!a.dart) continue;
    if (!fam) {
      out.set(a.id, { sizes: 0, drawn: 0 });
      continue;
    }
    byHost.set(fam, [...(byHost.get(fam) ?? []), a]);
  }
  for (const [fam, list] of byHost) {
    const sizes = closedSizes(fam);
    const darts = list.map((a) => ({
      seed: fam.seed,
      label: a.dart!.label,
      apex: a.dart!.apex,
      base: a.dart!.base,
      lenMm: a.dart!.lenMm,
    }));
    const drawn = list.map(() => 0);
    for (const c of sizes) {
      const vs = dartVs(c, set, darts, run?.sizes[c.rank]?.classId ?? null);
      vs.forEach((v, i) => {
        if (v) drawn[i]++;
      });
    }
    list.forEach((a, i) => out.set(a.id, { sizes: sizes.length, drawn: drawn[i] }));
  }
  return out;
}

/** provenDart's evidence in words, or null. */
export const dartOf = (
  a: SetAside,
  families: readonly DartFam[],
  seeds?: readonly DartSeedAt[],
): string | null => provenDart(a, families, seeds)?.ev ?? null;

/** Every aside proven a dart of a seeded piece (the semantics write its legs on layer 8). */
export function provenDarts(
  asides: readonly SetAside[],
  families: readonly DartFam[],
  seeds?: readonly DartSeedAt[],
): ProvenDart[] {
  return asides.flatMap((a) => {
    const p = a.dart ? provenDart(a, families, seeds) : null;
    return p && a.dart
      ? [
          {
            seed: p.seed,
            label: a.dart.label,
            apex: a.dart.apex,
            base: a.dart.base,
            lenMm: a.dart.lenMm,
          },
        ]
      : [];
  });
}
