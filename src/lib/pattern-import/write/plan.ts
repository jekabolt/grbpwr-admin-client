// PieceSpec[] (source frame) → PlannedBlock[] (written frame): everything the emitters need,
// with every garment decision already taken. The emitters only serialise.
//
// Decisions taken here (10-CLO-DXF-FORMAT §1.5–1.8, 09-CARD-CONTRACT obligations 12–14, 07-TASKS D1'):
//   • block name = `<IDENTITY>_<SIZE>`; an ungraded piece is ONE block `<IDENTITY>_UNI` (K1 case g:
//     the card reads `PCK_UNI` as one ungraded piece; `PCK_UNI_M` would leak the base size into the
//     card's identity, see block-code.ts splitBlockSize);
//   • pairs are two blocks (owner decision 9) of ONE card piece cut IDENTICAL — both hands drawn
//     (D1', F6b: card markers never lay a mirrored copy); a hand whose sibling spec is missing is
//     DERIVED as the explicit mirror across that size's grain line (never an INSERT with negative
//     scale) — a geometric mirror, not MIRRORED cut symmetry;
//   • every identity (all its sizes together, keeping their shared grade nest) is translated onto a
//     shelf so different pieces never overlap in world space — the source sheet placement is not
//     kept: a derived mirror lands on top of its sibling, and an unfolded piece on its neighbour;
//   • grain = CLO 3-vertex arrow, 180 mm shaft centred on the source grain's midpoint;
//   • notch = one LINE per logical notch, start projected ONTO the written cut line, inward, depth
//     clamped to [1, 8] mm (< 1 cm, so the card never takes it for a grain candidate);
//   • every open 2-point L8 line (internal or fold) gets a midpoint: the card's parser takes any
//     2-point open chain ≥ 1 cm as a grain candidate (pieces.ts), and a fold line won that way (K1 d).

import type {
  Affine,
  DraftScopeTarget,
  DrillFeature,
  FoldFeature,
  GrainFeature,
  InternalFeature,
  NotchFeature,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
} from '../types';
import { PATIMPORT } from '../types';
import {
  IDENTITY,
  applyAffine,
  areaOf,
  bboxOf,
  closestOnPolyline,
  compose,
  dist,
  reflection,
  signedArea,
  simplify,
  translation,
  unionBox,
} from './geom';

/** Simplification tolerance for written polylines, mm (well under the 0.05 mm sagitta). */
export const WRITE_SIMPLIFY_MM = 0.01;
export const DEFAULT_NOTCH_DEPTH_MM = 5;
export const GRAIN_SHAFT_MM = 180;
export const GRAIN_BARB_BACK_MM = 27;
export const GRAIN_BARB_SIDE_MM = 13.5;
export const DRILL_SQUARE_MM = 10;
export const LAYOUT_GAP_MM = 50;
export const LAYOUT_ROW_MAX_MM = 4000;
export const UNI_TOKEN = 'UNI';

export type PlannedNotch = { a: PtMm; b: PtMm; depthMm: number; angleDeg: number };
export type PlannedGrain = { tail: PtMm; tip: PtMm; barb: PtMm; u: PtMm };

export type PlannedBlock = {
  name: string;
  identity: string;
  /** Card token, or 'UNI' for an ungraded piece. */
  sizeToken: string;
  /** What the `SIZE:` label says: the card token (the base token for UNI). */
  labelSize: string;
  sizeId: number;
  rank: number;
  quantity: number;
  material: string;
  annotation: string[];
  cut: PtMm[];
  seam: PtMm[] | null;
  /** L8 lines: internal features, then the fold line. Open 2-pt lines already densified. */
  internal: { pts: PtMm[]; closed: boolean }[];
  /** How many of `internal` are the fold line (0/1) — the manifest counts both as internal. */
  foldLines: number;
  drills: PtMm[];
  grain: PlannedGrain | null;
  notches: PlannedNotch[];
  /** Source frame → written frame (translation, possibly after a derived mirror). */
  transform: Affine;
  /** Identity this block was mirrored from when the writer derived the pair hand; else null. */
  derivedFrom: string | null;
  /** The written-frame size spec (what the gate compares the file with). */
  size: PieceSizeSpec;
};

export type Plan = {
  blocks: PlannedBlock[];
  /** Written-frame specs, derived mirrors included — `GateExpectation.pieces` must be these. */
  specs: PieceSpec[];
  /** identity → translation applied to that identity (written = T · sourceFrame[·mirror]). */
  offsets: Record<string, { dx: number; dy: number }>;
  warnings: string[];
};

// ── names ──────────────────────────────────────────────────────────────────────────────────

export function blockNameOf(spec: PieceSpec, size: PieceSizeSpec): string {
  return spec.ungraded ? `${spec.identity}_${UNI_TOKEN}` : `${spec.identity}_${size.sizeToken}`;
}

/** Does this piece belong to the scope? Matches purpose, BOM line or scope key. */
export function pieceInScope(spec: PieceSpec, scope: DraftScopeTarget): boolean {
  const keys = new Set([scope.scopeKey, scope.fabricPurpose, scope.bomLineKey].filter(Boolean));
  return spec.fabrics.some((f) => keys.has(f));
}

// ── transforms of typed features ───────────────────────────────────────────────────────────

const mapPts = (t: Affine, pts: readonly PtMm[]) => pts.map((p) => applyAffine(t, p));

function transformSize(s: PieceSizeSpec, t: Affine): PieceSizeSpec {
  const P = (p: PtMm) => applyAffine(t, p);
  const grain: GrainFeature | null = s.grain
    ? (() => {
        const a = P(s.grain.a);
        const b = P(s.grain.b);
        return { ...s.grain, a, b, angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
      })()
    : null;
  const notches: NotchFeature[] = s.notches.map((n) => ({
    ...n,
    at: P(n.at),
    seg: [P(n.seg[0]), P(n.seg[1])],
  }));
  const drills: DrillFeature[] = s.drills.map((d) => ({ ...d, at: P(d.at) }));
  const internal: InternalFeature[] = s.internal.map((f) => ({ ...f, pts: mapPts(t, f.pts) }));
  const fold: FoldFeature | null = s.fold ? { ...s.fold, a: P(s.fold.a), b: P(s.fold.b) } : null;
  const cut = mapPts(t, s.cut);
  return {
    ...s,
    cut,
    seam: s.seam ? mapPts(t, s.seam) : null,
    grain,
    notches,
    drills,
    internal,
    fold,
    bbox: bboxOf(cut),
    areaMm2: areaOf(cut),
  };
}

const ccw = (pts: PtMm[]) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

// ── pairs ──────────────────────────────────────────────────────────────────────────────────

const otherHand = (h: 'L' | 'R') => (h === 'L' ? 'R' : 'L');

/**
 * The sibling of a pair hand, as the explicit mirror across each size's grain line.
 * Returns null (with a warning) when a size has no grain: there is no axis to mirror across.
 */
function deriveSibling(
  spec: PieceSpec,
  warnings: string[],
): { spec: PieceSpec; axisBySize: Map<number, Affine> } | null {
  const hand = spec.pairHand;
  if (!hand || !spec.pairOf) return null;
  const axisBySize = new Map<number, Affine>();
  for (const s of spec.sizes) {
    if (!s.grain || dist(s.grain.a, s.grain.b) <= 0) {
      warnings.push(
        `${spec.identity}: cannot derive the ${otherHand(hand)} hand ${spec.pairOf} — size ${s.sizeToken} has no grain line to mirror across`,
      );
      return null;
    }
    axisBySize.set(s.rank, reflection(s.grain.a, s.grain.b));
  }
  const mods = spec.mods.map((m) => (m === hand ? otherHand(hand) : m));
  const sib: PieceSpec = {
    ...spec,
    identity: spec.pairOf,
    mods,
    pairHand: otherHand(hand),
    pairOf: spec.identity,
    sizes: spec.sizes.map((s) => transformSize(s, axisBySize.get(s.rank)!)),
  };
  return { spec: sib, axisBySize };
}

// ── written primitives ─────────────────────────────────────────────────────────────────────

function grainArrow(g: GrainFeature): PlannedGrain | null {
  const L = dist(g.a, g.b);
  if (!(L > 0)) return null;
  const u = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L };
  const n = { x: -u.y, y: u.x };
  const mid = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  const tail = { x: mid.x - (GRAIN_SHAFT_MM / 2) * u.x, y: mid.y - (GRAIN_SHAFT_MM / 2) * u.y };
  const tip = { x: tail.x + GRAIN_SHAFT_MM * u.x, y: tail.y + GRAIN_SHAFT_MM * u.y };
  const barb = {
    x: tip.x - GRAIN_BARB_BACK_MM * u.x + GRAIN_BARB_SIDE_MM * n.x,
    y: tip.y - GRAIN_BARB_BACK_MM * u.y + GRAIN_BARB_SIDE_MM * n.y,
  };
  return { tail, tip, barb, u };
}

function plannedNotch(cut: PtMm[], n: NotchFeature, warnings: string[], who: string): PlannedNotch {
  const { q, seg } = closestOnPolyline(n.at, cut, true);
  const a = cut[seg];
  const b = cut[(seg + 1) % cut.length];
  const L = dist(a, b) || 1;
  // cut is CCW → the left normal points inside.
  const nx = -(b.y - a.y) / L;
  const ny = (b.x - a.x) / L;
  let depth = n.depthMm > 0 ? n.depthMm : DEFAULT_NOTCH_DEPTH_MM;
  const clamped = Math.min(PATIMPORT.notchMaxMm, Math.max(1, depth));
  if (clamped !== depth) {
    warnings.push(`${who}: notch depth ${depth.toFixed(2)} mm clamped to ${clamped} mm`);
    depth = clamped;
  }
  return {
    a: q,
    b: { x: q.x + nx * depth, y: q.y + ny * depth },
    depthMm: depth,
    angleDeg: (Math.atan2(ny, nx) * 180) / Math.PI,
  };
}

function densifyOpen2(pts: PtMm[]): PtMm[] {
  if (pts.length !== 2) return pts;
  const [a, b] = pts;
  return [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b];
}

// ── the plan ───────────────────────────────────────────────────────────────────────────────

export function planBlocks(
  input: PieceSpec[],
  scope: DraftScopeTarget,
  warnings: string[] = [],
): Plan {
  // 1. scope membership
  const inScope: PieceSpec[] = [];
  for (const p of input) {
    if (pieceInScope(p, scope)) inScope.push(p);
    else warnings.push(`${p.identity}: not cut from ${scope.label || scope.scopeKey} — skipped`);
  }

  // 2. pair siblings (`_L` + its explicit mirror `_R`, two blocks — D1', cut IDENTICAL)
  const byId = new Map(inScope.map((p) => [p.identity, p]));
  type Entry = { spec: PieceSpec; srcT: Map<number, Affine>; derivedFrom: string | null };
  const entries: Entry[] = [];
  for (const p of inScope) {
    entries.push({
      spec: p,
      srcT: new Map(p.sizes.map((s) => [s.rank, IDENTITY])),
      derivedFrom: null,
    });
    if (p.pairHand && p.pairOf && !byId.has(p.pairOf)) {
      const d = deriveSibling(p, warnings);
      if (d) {
        warnings.push(
          `${d.spec.identity}: derived as the mirror of ${p.identity} across its grain`,
        );
        byId.set(d.spec.identity, d.spec);
        entries.push({ spec: d.spec, srcT: d.axisBySize, derivedFrom: p.identity });
      }
    }
  }

  // 3. which sizes get a block
  const written = entries.map((e) => {
    let sizes = [...e.spec.sizes].sort((a, b) => a.rank - b.rank);
    if (e.spec.ungraded && sizes.length > 1) {
      warnings.push(
        `${e.spec.identity}: ungraded — only the ${sizes[0].sizeToken} contour is written (${sizes.length - 1} more ignored)`,
      );
      sizes = sizes.slice(0, 1);
    }
    if (!sizes.length) warnings.push(`${e.spec.identity}: no sizes — nothing written`);
    return { ...e, sizes };
  });

  // 4. shelf layout per identity (all sizes share one translation → the grade nest survives)
  const offsets: Plan['offsets'] = {};
  let cx = 0;
  let rowY = 0;
  let rowH = 0;
  for (const w of written) {
    if (!w.sizes.length) continue;
    let box = bboxOf(w.sizes[0].cut);
    for (const s of w.sizes) box = unionBox(box, bboxOf(s.cut)); // srcT already applied in derived sizes
    const W = box.maxX - box.minX;
    const H = box.maxY - box.minY;
    if (cx > 0 && cx + W > LAYOUT_ROW_MAX_MM) {
      rowY += rowH + LAYOUT_GAP_MM;
      cx = 0;
      rowH = 0;
    }
    offsets[w.spec.identity] = { dx: cx - box.minX, dy: rowY - box.minY };
    cx += W + LAYOUT_GAP_MM;
    rowH = Math.max(rowH, H);
  }

  // 5. blocks
  const blocks: PlannedBlock[] = [];
  const specs: PieceSpec[] = [];
  const material = scope.fabricPurpose || scope.bomLineKey || scope.scopeKey;
  for (const w of written) {
    const off = offsets[w.spec.identity];
    if (!off) continue;
    const T = translation(off.dx, off.dy);
    const outSizes: PieceSizeSpec[] = [];
    for (const s0 of w.sizes) {
      const s = transformSize(s0, T);
      const name = blockNameOf(w.spec, s);
      const who = name;
      const cut = ccw(simplify(s.cut, true, WRITE_SIMPLIFY_MM));
      const seam = s.seam ? ccw(simplify(s.seam, true, WRITE_SIMPLIFY_MM)) : null;
      if (!seam) warnings.push(`${who}: no seam line — layer 14 omitted (the gate will block)`);
      const internal = s.internal.map((f) => ({
        pts: f.closed
          ? simplify(f.pts, true, WRITE_SIMPLIFY_MM)
          : densifyOpen2(simplify(f.pts, false, WRITE_SIMPLIFY_MM)),
        closed: f.closed,
      }));
      let foldLines = 0;
      if (s.fold) {
        if (!w.spec.unfoldedFold)
          warnings.push(`${who}: fold line on a piece that is not unfolded`);
        internal.push({ pts: densifyOpen2([s.fold.a, s.fold.b]), closed: false });
        foldLines = 1;
      }
      const grain = s.grain ? grainArrow(s.grain) : null;
      if (!grain) warnings.push(`${who}: no grain line`);
      const notches = s.notches.map((n) => plannedNotch(cut, n, warnings, who));
      const annotation: string[] = [];
      if (w.spec.fused) annotation.push('FUSED');
      if (w.spec.unfoldedFold) annotation.push('UNFOLDED');
      const srcT = w.srcT.get(s0.rank) ?? IDENTITY;
      const size: PieceSizeSpec = { ...s, cut, seam, bbox: bboxOf(cut), areaMm2: areaOf(cut) };
      outSizes.push(size);
      blocks.push({
        name,
        identity: w.spec.identity,
        sizeToken: w.spec.ungraded ? UNI_TOKEN : s.sizeToken,
        labelSize: s.sizeToken,
        sizeId: s.sizeId,
        rank: s.rank,
        quantity: w.spec.piecesPerGarment,
        material,
        annotation,
        cut,
        seam,
        internal,
        foldLines,
        drills: s.drills.map((d) => d.at),
        grain,
        notches,
        transform: compose(T, srcT),
        derivedFrom: w.derivedFrom,
        size,
      });
    }
    specs.push({ ...w.spec, sizes: outSizes });
  }

  // Size-major block order (every piece of the smallest size first), as CLO's per-size export and
  // K2's golden file: stable within a size, so identities keep their input order.
  blocks.sort((a, b) => a.rank - b.rank);

  // 6. names must be unique (ci) — the card's alias index is case-insensitive
  const seen = new Map<string, string>();
  for (const b of blocks) {
    const k = b.name.toLowerCase();
    if (seen.has(k)) warnings.push(`block name ${b.name} written twice (also ${seen.get(k)})`);
    else seen.set(k, b.name);
  }
  return { blocks, specs, offsets, warnings };
}
