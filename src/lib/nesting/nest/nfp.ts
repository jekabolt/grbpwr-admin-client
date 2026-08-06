// No-fit polygons via convex decomposition — exact and numerically boring:
//   NFP(A, B) = ⋃ over convex parts (pa ∈ A, pb ∈ B) of hull(pa ⊕ −pb) ⊕ gap-octagon
// clipper2-js's own MinkowskiDiff/InflatePaths produce broken output on real polygons
// (phantom holes inside the NFP let pieces overlap; asymmetric offsets) — so Clipper is
// used ONLY to union convex parts. Two things keep that union tractable (a triangle ×
// triangle decomposition fed it 4 761+ overlapping paths and OOM'd the tab):
//   - pieces decompose to ~6-10 convex parts (Hertel–Mehlhorn merge), so a pair costs
//     ~36-100 hulls, not thousands;
//   - the union itself runs as a binary pairwise tree (unionBatched), so no single
//     boolean call ever sees hundreds of overlapping paths.
//
// AUTHORITY SPLIT (verification finding): clipper2-js's Union bites bays up to 1.09 cm
// deep out of real NFPs, and its Difference AGREES with the bitten result — so any
// union-derived self-check is structurally blind (measured: 25/32 pair-rels affected,
// pieces touching at 0.0000 cm through the bites). The union is therefore used ONLY to
// GENERATE candidate positions (it is compact); every candidate is ACCEPTED against the
// raw convex Minkowski parts, which are exact by construction and never see a boolean
// op. Placement (nest/place.ts) never runs boolean ops either way: it reads cache-owned
// rotated variants (paths/parts + bboxes) and tests points with integer winding math.
//
// Cache tricks from SVGnest (MIT, algorithm only): rotation canonicalization
//   NFP(A@a, B@b) = Rot(a)·NFP(A@0, B@(b−a))
// plus the reflection identity
//   NFP(A@0, B@rel) = Rot(rel+180)·NFP(B@0, A@(360−rel))
// so each unordered pair is computed once (cache keyed minId|maxId|rel).
import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import type { Pt, RotationDeg } from '../types';
import { SCALE, toPath64 } from '../geom/clipper';
import { gapOctagon, minkowskiSumConvex, negate } from '../geom/convex';

export type PreparedPiece = {
  id: number;
  // Uninflated contour per rotation (cm, local origin) + bounds — placement geometry.
  polyAt: Record<RotationDeg, Pt[]>;
  boundsAt: Record<RotationDeg, { minX: number; minY: number; maxX: number; maxY: number }>;
  // Convex decomposition of the RDP-simplified contour at rotation 0 — NFP input.
  parts0: Pt[][];
  areaCm2: number;
};

// Integer-unit bounding box of one NFP path (same SCALE as the path coords).
export type IntBox = { minX: number; minY: number; maxX: number; maxY: number };

// A rotated NFP variant, cache-owned and READONLY for callers: placement must never
// mutate or translate these paths — it works in relative integer coordinates instead.
//
// TWO representations of the same forbidden region travel together, with different
// jobs (see the module header on why they may DISAGREE):
//   paths/boxes — the clipper union, compact: candidate GENERATION only;
//   parts/partBoxes — the raw convex Minkowski hulls, authoritative: candidate
//     ACCEPTANCE. A point is forbidden iff strictly inside ANY part.
export type NfpPaths = {
  paths: readonly Path64[];
  boxes: readonly IntBox[];
  parts: readonly Path64[];
  partBoxes: readonly IntBox[];
};

// One-sided NFP boundary decimation: drop a vertex ONLY when the replacing chord GROWS
// the forbidden region (reflex vertices of outers, and their mirror on holes) and the
// grown triangle is tiny. Unlike RDP this can never cut inward, so it needs no
// compensation and cannot create the eps-deep bays that RDP-of-the-union measurably did.
const DECIMATE_MAX_TRI_CM2 = 0.01;

// Residual-error safety margin baked into the gap octagon (see NfpCache constructor).
export const NFP_SAFETY_CM = 0.05;

// Both orientations share one rule: with CCW outers (interior left) and CW holes
// (pocket right), the forbidden side sits to the RIGHT of travel in both, so a
// right-turn vertex (cross < 0) is the one whose chord grows the forbidden region.
function decimateOneSided(path: Path64): Path64 {
  const maxTri2 = 2 * DECIMATE_MAX_TRI_CM2 * SCALE * SCALE; // doubled triangle area
  let cur = path;
  for (let round = 0; round < 4; round++) {
    if (cur.length <= 8) break;
    const out = new Path64();
    let dropped = 0;
    let i = 0;
    const n = cur.length;
    while (i < n) {
      const u = out.length > 0 ? out[out.length - 1] : cur[(i - 1 + n) % n];
      const v = cur[i];
      const w = cur[(i + 1) % n];
      // cross > 0 — v is a left turn (CCW); dropping v with growSign=+1 (CCW outer)
      // replaces the wedge by its chord on the FORBIDDEN side only when v turns right.
      const cross = (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
      const doubled = Math.abs(cross);
      const removable = cross < 0 && doubled <= maxTri2 && out.length > 0 && i < n - 1;
      if (removable) {
        dropped++;
      } else {
        out.push(v);
      }
      i++;
    }
    if (out.length < 3) break;
    cur = out;
    if (dropped === 0) break;
  }
  return cur;
}

function rotPart(part: readonly Pt[], rot: RotationDeg): Pt[] {
  switch (rot) {
    case 0:
      return [...part];
    case 90:
      return part.map((p) => ({ x: -p.y, y: p.x }));
    case 180:
      return part.map((p) => ({ x: -p.x, y: -p.y }));
    case 270:
      return part.map((p) => ({ x: p.y, y: -p.x }));
  }
}

function rotPath64(paths: readonly Path64[], rot: RotationDeg): Path64[] {
  return paths.map((path) => {
    const out = new Path64();
    for (const q of path) {
      switch (rot) {
        case 0:
          out.push(q);
          break;
        case 90:
          out.push(new Point64(-q.y, q.x));
          break;
        case 180:
          out.push(new Point64(-q.x, -q.y));
          break;
        case 270:
          out.push(new Point64(q.y, -q.x));
          break;
      }
    }
    return out;
  });
}

function boxOf(path: Path64): IntBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const q of path) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }
  return { minX, minY, maxX, maxY };
}

// Union of many convex parts as a BINARY TREE of pairwise unions. Two invariants matter:
//
// 1. Never hand the boolean engine hundreds of paths at once — clipper2-js's Union
//    degrades catastrophically past ~100 overlapping inputs (measured: 64 paths 3 ms,
//    100 paths OOM).
// 2. Never split an intermediate RESULT across calls. A union result is a region — outer
//    loops plus their holes with opposite winding. Flat re-batching (the first version of
//    this function sliced a flattened path list 32 at a time) can land a hole in one batch
//    and its enclosing outer in another; under NonZero a stray hole then eats OTHER
//    geometry's area, and the NFP comes out with phantom bays the placer happily uses —
//    measured 4.4 cm² under-coverage and real piece overlap on the marker. The tree keeps
//    each intermediate region intact as one operand.
//
// Because clipper2-js has already burned us twice, the result is post-checked: every
// input part must be covered, else fall back to the slow-but-region-preserving
// incremental union. The check batches ≤32 parts per Difference call — the subjects are
// original convex SOLID loops (no holes to split, so the flatten hazard above does not
// apply to them), and the clip (the result region) stays intact per call.
export function unionBatched(parts: Path64[]): Path64[] {
  if (parts.length === 0) return [];
  let layer: Path64[][] = parts.map((p) => [p]);
  while (layer.length > 1) {
    const next: Path64[][] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 === layer.length) {
        next.push(layer[i]);
        continue;
      }
      next.push(
        Clipper.Union([...layer[i], ...layer[i + 1]], undefined, FillRule.NonZero) as Path64[],
      );
    }
    layer = next;
  }
  const result = layer[0];
  // Post-check per batch of <=32 original convex solids (no holes among subjects, so the
  // flatten hazard above does not apply; the clip region stays intact per call).
  // Sliver-vs-bite discrimination is by WIDTH, not area: an integer-rounding hairline
  // along a long edge can carry more area than a genuine nick but is only 1-2 units
  // wide; a residual whose mean width (2·area/perimeter) exceeds a few units is a real
  // bay clipper bit out of the union — measured as 0.005-0.02 cm² nicks at 90° rels
  // producing clearance deficits up to 0.12 cm. On a bite: INCREMENTAL rebuild (exact,
  // region-preserving, ~10× slower — a Union-based "repair" of the bitten result was
  // tried twice and produced 258 cm² craters both times; this library's Union cannot be
  // trusted with a multi-path region plus patches).
  const maxWidthUnits = 5;
  let covered = true;
  const CHECK_BATCH = 32;
  for (let i = 0; i < parts.length && covered; i += CHECK_BATCH) {
    const residual = Clipper.Difference(
      parts.slice(i, i + CHECK_BATCH),
      result,
      FillRule.NonZero,
    ) as Path64[];
    for (const r of residual) {
      const area = Math.abs(Clipper.area(r));
      let perim = 0;
      for (let k = 0; k < r.length; k++) {
        const a = r[k];
        const b = r[(k + 1) % r.length];
        perim += Math.hypot(b.x - a.x, b.y - a.y);
      }
      if (perim > 0 && (2 * area) / perim > maxWidthUnits) {
        covered = false;
        break;
      }
    }
  }
  if (covered) return result;
  let acc: Path64[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    acc = Clipper.Union([...acc, parts[i]], undefined, FillRule.NonZero) as Path64[];
  }
  return acc;
}

type CanonicalNfp = { paths: Path64[]; parts: Path64[] };

export class NfpCache {
  // key `${minId}|${maxId}|${rel}` → canonical (rot 0) union paths + raw convex parts.
  private cache = new Map<string, CanonicalNfp>();
  // key `${canonicalKey}|${outRot}` → rotated variant with bboxes (cache-owned, readonly).
  private rotated = new Map<string, NfpPaths>();
  private gapOct: Pt[];
  computed = 0;

  // gapCm here must already include the RDP compensation (+2·rdpEps): NFP inputs are the
  // SIMPLIFIED contours, whose chords cut up to rdpEps inside convex runs on each piece,
  // so the octagon under-delivers by up to 2·rdpEps against the true contours otherwise.
  // Boundary decimation is one-sided (grows the forbidden side only) — no term for it.
  // NFP_SAFETY_CM absorbs the residual error stack the compensations don't formally
  // cover (int rounding, octagon flats at the worst direction, clipper union noise
  // under the width guard): the 400-layout stress measured a single worst deficit of
  // 0.047 cm — the margin pushes the whole stack back above the promised gap at the
  // cost of a marginally longer marker.
  // verifyGapCm is the gap PROMISED to the operator (uncompensated). Placement verifies
  // the chosen position against true contours at this distance — the NFP proxies are
  // built from simplified contours and were measured accepting short positions.
  readonly verifyGapCm: number;

  constructor(gapCm: number, verifyGapCm = gapCm) {
    this.gapOct = gapOctagon(gapCm + NFP_SAFETY_CM);
    this.verifyGapCm = verifyGapCm;
  }

  // Canonical NFP for the UNORDERED pair, at relative rotation `rel`, with the
  // lower-id piece in the A role. Everything else derives from it.
  private canonical(a: PreparedPiece, b: PreparedPiece, rel: RotationDeg): CanonicalNfp {
    const key = `${a.id}|${b.id}|${rel}`;
    let entry = this.cache.get(key);
    if (!entry) {
      const parts: Path64[] = [];
      for (const pa of a.parts0) {
        for (const pb of b.parts0) {
          const hull = minkowskiSumConvex(pa, negate(rotPart(pb, rel)));
          const withGap = this.gapOct.length > 1 ? minkowskiSumConvex(hull, this.gapOct) : hull;
          parts.push(toPath64(withGap));
        }
      }
      const union = unionBatched(parts);
      // DROP degenerate paths: clipper's union emits zero-area sliver loops, and a
      // sliver's edge deep inside the real outer reads as "on the region boundary" to the
      // placement contact test — measured 459 cm² of piece overlap from exactly that. A
      // dropped sliver changes the region by less than the guard tolerance either way.
      //
      // Then decimate each surviving boundary ONE-SIDED (forbidden side only): the union
      // of hundreds of hulls⊕octagon carries micro-vertices placement would pay for on
      // every candidate test. RDP here was measurably unsafe — it carved eps-deep bays
      // into narrow necks of the union that its compensation did not cover.
      const minPathArea = 0.02 * SCALE * SCALE;
      const paths = union
        .filter((p) => Math.abs(Clipper.area(p)) >= minPathArea)
        .map((p) => decimateOneSided(p));
      // The RAW parts are retained as the acceptance authority: verification proved the
      // clipper union carries bites up to 1.09 cm deep that Difference AGREES with, so a
      // union-derived coverage check is structurally blind to them (25/32 pair-rels
      // affected on the benchmark set). The parts are exact by construction (convex hull
      // of a Minkowski sum of convex operands) and never touched a boolean op.
      entry = { paths, parts };
      this.cache.set(key, entry);
      this.computed++;
    }
    return entry;
  }

  // Precompute the canonical entry (NFP prepass) — same normalization as get().
  ensure(a: PreparedPiece, b: PreparedPiece, rel: RotationDeg): void {
    if (a.id <= b.id) {
      this.canonical(a, b, rel);
    } else {
      this.canonical(b, a, ((360 - rel) % 360) as RotationDeg);
    }
  }

  private rotatedVariant(canonicalKey: string, entry: CanonicalNfp, rot: RotationDeg): NfpPaths {
    const key = `${canonicalKey}|${rot}`;
    let v = this.rotated.get(key);
    if (!v) {
      const rp = rotPath64(entry.paths, rot);
      const rparts = rotPath64(entry.parts, rot);
      v = { paths: rp, boxes: rp.map(boxOf), parts: rparts, partBoxes: rparts.map(boxOf) };
      this.rotated.set(key, v);
    }
    return v;
  }

  // NFP of (A at rotA) vs (B at rotB): forbidden positions of B's local origin relative
  // to A's, in the strip frame; the caller offsets candidates by A's position instead of
  // translating paths. CACHE-OWNED and readonly — never mutate the returned arrays.
  get(a: PreparedPiece, rotA: RotationDeg, b: PreparedPiece, rotB: RotationDeg): NfpPaths {
    const rel = ((((rotB - rotA) % 360) + 360) % 360) as RotationDeg;
    if (a.id <= b.id) {
      const key = `${a.id}|${b.id}|${rel}`;
      return this.rotatedVariant(key, this.canonical(a, b, rel), rotA);
    }
    // Reflection identity: NFP_0(a,b,rel) = Rot(rel+180)·NFP_0(b,a,(360−rel)); the output
    // rotation composes on top, so the total is a single exact 90°-multiple rotation.
    const relC = ((360 - rel) % 360) as RotationDeg;
    const total = ((((rotA + rel + 180) % 360) + 360) % 360) as RotationDeg;
    const key = `${b.id}|${a.id}|${relC}`;
    return this.rotatedVariant(key, this.canonical(b, a, relC), total);
  }
}
