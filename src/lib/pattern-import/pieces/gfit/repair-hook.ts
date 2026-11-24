// pieces/gfit/repair-hook (GRADE P2, hook A) — repair of a size from its family's grade, inside the
// fill (pieces/fill.ts, after the continuity / correspondence / bridge passes, before the leak mouths
// and before `buildPieceSpecsDetailed` blocks a family for one unclosed size).
//
// Targets, per family (seed), never across families and never another rank:
//   'leak'      a size that leaks, strictly between two ANCHORS (sizes closed on their own lines);
//   'neighbour' a closed size the grade check (G26, silent-inputs) HOLDS — its outline leaves the
//               grade for another size's drawn line — strictly between two anchors other than itself
//               (palto SL_76: its tip closes on size 72's lines). Read only on a sheet where a leak
//               was repaired, or with GRADE_P2_NEIGHBOUR=1 (cost; see below).
// The repaired outline runs on the size's OWN lines (its pen class) and the COMMON lines, inside the
// corridor around the grade model of its two neighbouring anchors (repair.ts `repairSize`, E1–E4);
// holes ≤ 15 mm between its own line ends are filled from the model and written as derived
// 'grade-fill' edges (G15). On top of `repairSize`: the G15 bounds (≤ 6 holes, ≤ 60 mm), and the
// continuity judgement of the family (growth band, outline spread and shape against the anchors —
// `continuityVerdicts`). A refused size stays as it was (a leak; a 'neighbour' size G26 holds) and
// carries `gradeHint` — where the grade puts it, for the operator's question. An H1-refused, merged or tiny size is
// never touched; an extreme size (extrapolation) is never repaired unless `GFIT_EDGE_ACCEPT=1`.
// `GRADE_P2_OFF=1` turns the pass off.
import type {
  BoxMm,
  ChainId,
  ChainSet,
  PieceCandidate,
  PieceFamily,
  PtMm,
  RepairRecord,
  TextId,
} from 'lib/pattern-import/types';

import { continuityVerdicts, isAnchor } from '../fill';
import { bboxOf, dist, pointInPoly, signedArea, simplify } from '../geom';
import type { WallModel } from '../walls';
import { outlineOf, predictPair } from './checks';
import { GFIT_TOL_P0, GFIT_TOL_PDF, type GfitFamily, type GfitSizeIn } from './fit';
import {
  canonRing,
  linesToRing,
  NEST_WALK,
  NestLineIndex,
  nestWalk,
  ringDistance,
  type NestSizeIn,
} from './nest-walk';
import { GFIT_REPAIR, looseWallsOn, repairSize, type GfitWall } from './repair';
import { silentRead } from './silent-inputs';

/** The repair's grade-model tolerance: the PDF one; `GRADE_TOL_P0=1` brings back the CAD one. */
const repairTol = () =>
  typeof process !== 'undefined' && process.env?.GRADE_TOL_P0 ? GFIT_TOL_P0 : GFIT_TOL_PDF;

/**
 * A repair try as a replayable case (dev loop: replay `repairSize` on real cells in seconds instead
 * of re-running the corpus — scripts/pattern-import/gfit-replay.ts). Exactly `repairSize`'s input,
 * plus what the run decided. Collected only when a sink is set (node scripts); never in the app.
 */
export type RepairProbe = {
  seed: number;
  rank: number;
  kind: RepairRecord['kind'];
  ins: GfitSizeIn[];
  walls: GfitWall[];
  tol: typeof GFIT_TOL_PDF;
  strict: string[];
  /** null = draw mode was not tried */
  draw: string[] | null;
  drawn: boolean;
  /** Share of the covered perimeter snapped to a loose wall. Absent when GRADE_P2_LOOSE is off. */
  looseShare?: number;
};
let probeSink: ((p: RepairProbe) => void) | null = null;
export function setRepairProbeSink(fn: ((p: RepairProbe) => void) | null): void {
  probeSink = fn;
}

/** G15 bounds the repair must stay inside (gate/checks.ts DERIVED_MAX_PER_BLOCK / _TOTAL_MM). */
export const GRADE_P2 = {
  maxHoles: 6,
  maxHolesMm: 60,
  boxPadMm: 30,
  hintTolMm: 0.3,
  /** An operator bridge this short (each, mm) leaves a size an anchor of the grade model. */
  anchorBridgeMm: 6,
};

const polyLen = (pts: readonly PtMm[]) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};

/**
 * An anchor of the grade model: a size closed on its own lines (`isAnchor`), or closed on its own
 * class lines plus the OPERATOR's short bridges (≤ 6 mm each — a junction the drawing leaves open,
 * closed by the operator's click: palto's sleeve corner, 4.7 mm). Never a continuity, plug, rerank,
 * auto-bridge or repaired closure: the model stands only on drawn sizes and the operator's word.
 */
export function gradeAnchor(c: PieceCandidate): boolean {
  if (isAnchor(c)) return true;
  return (
    c.outcome === 'closed' &&
    c.outer.length > 2 &&
    (c.rankFrom === 'class' || c.rankFrom === undefined) &&
    !!c.derived?.length &&
    c.derived.every(
      (d) => d.kind === 'operator-bridge' && polyLen(d.pts) <= GRADE_P2.anchorBridgeMm,
    )
  );
}

const DEBUG = typeof process !== 'undefined' && !!process.env?.GRADEP2_DEBUG;
const TIME = typeof process !== 'undefined' && !!process.env?.GRADEP2_TIME;

export function gradeP2Off(): boolean {
  return typeof process !== 'undefined' && !!process.env?.GRADE_P2_OFF;
}

/**
 * Drawing by the grade (owner, 11 Nov 2026 — "сделай по своим рекомендациям"): a bracketed size the
 * strict fill refuses is drawn from the piece's grade model up to 15 % of its perimeter in total;
 * the extreme sizes are never drawn; the model holds per piece (fitFamily, PDF tolerance).
 * `GRADE_DRAW_OFF=1` turns it off.
 *
 * `maxShare` is a point below the gate's `DERIVED_DRAWN_MAX_SHARE`: the repair measures holes along
 * the prediction, G15 measures the filled polylines against the written line, and the two differ by
 * a fraction of a mm per hole — a block drawn at 14.9 % must not fail the gate at 15.2 %.
 * `maxHoles` / `maxHolesMm` are the manifest's `grade` bounds (manifest/index.ts): a drawn block
 * the manifest would refuse to read back is not drawn.
 */
export const GRADE_DRAW = {
  maxShare: GFIT_REPAIR.drawMaxShare - 0.01,
  maxHoles: 16,
  maxHolesMm: 1000,
  /** The end of the range drawn one step on (owner, 12 Nov 2026; GFIT_REPAIR.extrapolate*). */
  extrapolate: true,
};

export function gradeDrawOff(): boolean {
  return typeof process !== 'undefined' && process.env?.GRADE_DRAW_OFF === '1';
}

/** The nest walk closes the leaks the repair refused; `GFIT_NEST_WALK=0` turns it off. */
export function nestWalkOn(): boolean {
  return !(typeof process !== 'undefined' && process.env?.GFIT_NEST_WALK === '0');
}

export type RepairWallIn = { chain: ChainId; pts: readonly PtMm[]; closed?: boolean };

export type RepairCtx = {
  set: ChainSet;
  /** Rank r's own lines (its size class); the common lines; both without excluded chains. */
  own: (r: number) => readonly RepairWallIn[];
  common: readonly RepairWallIn[];
  /** The wall model (size classes, common lines) — the G26 check for 'neighbour' targets. */
  wm: Pick<WallModel, 'mode' | 'byRank' | 'common'>;
  texts: readonly { id: TextId; at: PtMm }[];
  /**
   * Unassigned chains available to the fallback after the ordinary repair leaves a leak.
   * repairSize checks each candidate against this size's corridor and both anchor outlines.
   */
  loose?: readonly RepairWallIn[];
};

export type RepairDiag = {
  tried: number;
  repaired: { seed: number; rank: number; kind: RepairRecord['kind'] }[];
  /** Refusals by reason (a refused try counts every reason it gave). */
  refused: Record<string, number>;
  ms: number;
};

const grown = (b: BoxMm, m: number): BoxMm => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});
const meets = (a: BoxMm, b: BoxMm) =>
  !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);

/**
 * Hook A: repairs the families of `cands` in place (one list per seed). `skip`: seeds the fill does
 * not own (H1-refused up front) — never touched.
 */
export function repairPass(
  cands: Map<number, PieceCandidate[]>,
  ctx: RepairCtx,
  skip: ReadonlySet<number> = new Set(),
): RepairDiag {
  const t0 = Date.now();
  const diag: RepairDiag = { tried: 0, repaired: [], refused: {}, ms: 0 };
  const ownMemo = new Map<number, { w: RepairWallIn; box: BoxMm }[]>();
  const withBox = (ws: readonly RepairWallIn[]) => ws.map((w) => ({ w, box: bboxOf(w.pts) }));
  const commonB = withBox(ctx.common);
  // once per pass: the try loop used to rebuild this box for every size
  const looseB = looseWallsOn() && ctx.loose ? withBox(ctx.loose) : null;
  const ownOf = (r: number) => {
    let v = ownMemo.get(r);
    if (!v) ownMemo.set(r, (v = withBox(ctx.own(r))));
    return v;
  };
  const refuse = (why: string) => (diag.refused[why] = (diag.refused[why] ?? 0) + 1);

  /** One try: replaces list[i] when every check holds; returns the refusals (empty = repaired). */
  /**
   * The operator's question on a refused size: where the grade puts it — the repair's prediction
   * between the anchors around it, else carried on from the two nearest trusted anchors (marked).
   */
  const hint = (
    list: PieceCandidate[],
    i: number,
    pred0: PtMm[] | undefined,
    from0: [number, number] | undefined,
    trusted: readonly number[],
    anchors: readonly PieceCandidate[],
    why: string[],
  ) => {
    const c = list[i];
    const r = c.rank;
    let pred = pred0;
    let from = from0;
    let extrapolated = false;
    if (!pred) {
      const t = trusted.slice().sort((a, b) => Math.abs(a - r) - Math.abs(b - r));
      if (t.length >= 2) {
        const [a, b] = t[0] < t[1] ? [t[0], t[1]] : [t[1], t[0]];
        const oa = outlineOf(anchors.find((x) => x.rank === a)!.outer);
        const ob = outlineOf(anchors.find((x) => x.rank === b)!.outer);
        const P = oa && ob ? predictPair(oa, ob, (r - a) / (b - a), b - a, 'stacked') : null;
        if (P) {
          pred = P.pts;
          from = [a, b];
          extrapolated = r < a || r > b;
        }
      }
    }
    if (pred && from)
      list[i] = {
        ...c,
        gradeHint: {
          pred: simplify([...pred, pred[0]], GRADE_P2.hintTolMm).slice(0, -1),
          from,
          refusals: why,
          ...(extrapolated ? { extrapolated: true } : {}),
        },
      };
    // no prediction (no model / not bracketed): the reason still reaches the cell, reporting only
    // (a hint without a prediction would show the operator a line that is not there)
    else if (why.length) list[i] = { ...c, gradeTryWhy: why };
  };
  /** Per family: the grade model of a set of anchors (the tries of one family share it). */
  const fitCaches = new Map<number, Map<string, GfitFamily>>();
  /** The leaks repaired in (A), as they were (a repair resting on a size G26 holds is undone). */
  const orig = new Map<string, PieceCandidate>();
  const tryRepair = (
    list: PieceCandidate[],
    i: number,
    kind: RepairRecord['kind'],
    /** ranks that are no anchor here (sizes the grade check holds) */
    exclude: ReadonlySet<number> = new Set(),
    withLooseWalls = false,
  ): string[] => {
    const c = list[i];
    const r = c.rank;
    const anchors = list
      .filter((x) => x.rank !== r && !exclude.has(x.rank) && gradeAnchor(x))
      .sort((a, b) => a.rank - b.rank);
    let lo = anchors.filter((x) => x.rank < r).pop();
    let hi = anchors.find((x) => x.rank > r);
    // the end of the range: the draw mode may carry the grade one step on (repairSize decides,
    // GFIT_REPAIR.extrapolate*); the walls are then those near the two nearest anchors
    const edge = lo ?? hi;
    // GFIT_EDGE_ACCEPT: the strict try (draw off) still sees an edge size one step past the last
    // anchor. Draw mode already did; this opens the same try when drawing is switched off.
    const edgeAccept = typeof process !== 'undefined' && !!process.env?.GFIT_EDGE_ACCEPT;
    if (
      (!lo || !hi) &&
      edge &&
      (edgeAccept || (GRADE_DRAW.extrapolate && !gradeDrawOff())) &&
      anchors.length >= GFIT_REPAIR.extrapolateMinTrusted &&
      Math.abs(edge.rank - r) === 1
    ) {
      const k = anchors.indexOf(edge);
      [lo, hi] = lo ? [anchors[k - 1], edge] : [edge, anchors[k + 1]];
    }
    if (!lo || !hi) {
      // no anchor on one side: nothing to repair from — the question still shows where the grade
      // of the two nearest anchors carries the size (marked extrapolated)
      hint(
        list,
        i,
        undefined,
        undefined,
        anchors.map((x) => x.rank),
        anchors,
        ['not-bracketed'],
      );
      return ['not-bracketed'];
    }
    if (!withLooseWalls) diag.tried++;
    const ins: GfitSizeIn[] = anchors.map((x) => ({ rank: x.rank, outer: x.outer, anchor: true }));
    // the walls near the bracketing anchors (the size lies between them)
    const box = grown(bboxOf([...lo.outer, ...hi.outer]), GRADE_P2.boxPadMm);
    const ws: GfitWall[] = [];
    const chainOf: ChainId[] = [];
    for (const { w, box: b } of ownOf(r))
      if (meets(b, box)) {
        ws.push({ pts: w.pts, kind: 'own', closed: !!w.closed });
        chainOf.push(w.chain);
      }
    for (const { w, box: b } of commonB)
      if (meets(b, box)) {
        ws.push({ pts: w.pts, kind: 'common', closed: !!w.closed });
        chainOf.push(w.chain);
      }
    // Include nearby unassigned lines on the fallback attempt.
    if (withLooseWalls && looseB)
      for (const { w, box: b } of looseB)
        if (meets(b, box)) {
          ws.push({ pts: w.pts, kind: 'loose', closed: !!w.closed });
          chainOf.push(w.chain);
        }
    // overlay: the lines the anchors themselves close on (another size's pen, an orphan) — cover
    // only where both bracketing anchors run on them (repairSize)
    // (a whole chain already a wall; a lone PORTION of a chain leaves the rest of it to the overlay)
    const taken = new Set(chainOf.filter((id, k) => ws[k].pts === ctx.set.chains[id]?.pts));
    for (const id of new Set(anchors.flatMap((x) => x.walls))) {
      const ch = ctx.set.chains[id];
      if (taken.has(id) || !ch || ch.pts.length < 2 || !meets(bboxOf(ch.pts), box)) continue;
      ws.push({ pts: ch.pts, kind: 'overlay', closed: ch.closed });
      chainOf.push(id);
    }
    let fitCache = fitCaches.get(c.seed);
    if (!fitCache) fitCaches.set(c.seed, (fitCache = new Map()));
    const run = (draw: boolean) => {
      const rep = repairSize(ins, r, ws, {
        tol: repairTol(),
        frame: 'stacked',
        fitCache,
        fast: true,
        ...(draw
          ? { draw: { maxShare: GRADE_DRAW.maxShare, extrapolate: GRADE_DRAW.extrapolate } }
          : {}),
      });
      const why: string[] = rep.refusals.map((w) =>
        w === 'no-model' && rep.modelWhy ? `no-model:${rep.modelWhy}` : w,
      );
      const holesMm = rep.holes.reduce((a, h) => a + h.lenMm, 0);
      // G15: a repaired block must pass the derived-edge audit as written. Every hole of a DRAWN
      // block is a 'grade-draw' edge (below), bounded there by its share, not by the fill's count /
      // mm; the manifest still bounds the record.
      if (!draw && rep.holes.length > GRADE_P2.maxHoles) why.push('G15-holes');
      if (!draw && holesMm > GRADE_P2.maxHolesMm) why.push('G15-holes-mm');
      if (draw && rep.holes.length > GRADE_DRAW.maxHoles) why.push('D-holes');
      if (draw && holesMm > GRADE_DRAW.maxHolesMm) why.push('D-holes-mm');
      return { rep, why, holesMm };
    };
    let { rep, why, holesMm } = run(false);
    const strictWhy = why.slice();
    let drawWhy: string[] | null = null;
    // the strict fill refused, the piece has a model and the size is bracketed: draw the missing
    // line from the grade (owner, 11 Nov 2026), within GRADE_DRAW.maxShare of the perimeter
    let drawn = false;
    if (why.length && !rep.refusals.includes('no-model') && !gradeDrawOff()) {
      const d = run(true);
      drawWhy = d.why.slice();
      if (!d.why.length) {
        ({ rep, why, holesMm } = d);
        drawn = true;
      } else {
        // keep the draw mode's reasons beside the strict ones: the corpus reports read them
        why.push(...d.why.map((w) => `draw:${w}`));
        if (DEBUG) console.log(`GRADEP2   draw refused too: ${d.why.join(',')}`);
      }
    }
    let cand: PieceCandidate | null = null;
    if (!why.length && rep.outer && rep.from) {
      const ring0 = signedArea(rep.outer) < 0 ? rep.outer.slice().reverse() : rep.outer;
      const outer = simplify([...ring0, ring0[0]], 0.02).slice(0, -1);
      const bbox = bboxOf(outer);
      const walls = [...new Set(rep.usedWalls.map((k) => chainOf[k]))];
      const wallSet = new Set(walls);
      const inside: ChainId[] = [];
      for (const ch of ctx.set.chains) {
        if (wallSet.has(ch.id) || ch.pts.length < 2) continue;
        const b = bboxOf(ch.pts);
        if (b.minX < bbox.minX || b.maxX > bbox.maxX || b.minY < bbox.minY || b.maxY > bbox.maxY)
          continue;
        const step = Math.max(1, Math.floor(ch.pts.length / 8));
        let ok = true;
        for (let j = 0; j < ch.pts.length && ok; j += step) ok = pointInPoly(ch.pts[j], outer);
        if (ok && pointInPoly(ch.pts[ch.pts.length - 1], outer)) inside.push(ch.id);
      }
      const record: RepairRecord = {
        kind,
        from: rep.from,
        cover: Math.round(rep.cover * 1000) / 1000,
        holes: rep.holes.length,
        holesMm: Math.round(holesMm * 10) / 10,
        score: Math.round((rep.score ?? 0) * 1000) / 1000,
        devMm: Math.round((rep.devMm ?? 0) * 100) / 100,
        // a drawn block was accepted under the draw rules as a whole (no hole-end / count / sum
        // check), so every one of its holes is drawn — a short one included
        ...(drawn
          ? {
              drawnMm:
                Math.round(
                  (holesMm -
                    rep.holes.filter((h) => h.endsLoose).reduce((a, h) => a + h.lenMm, 0)) *
                    10,
                ) / 10,
            }
          : {}),
        ...(rep.extrapolated ? { extrapolated: true as const } : {}),
        ...(rep.local ? { local: rep.local } : {}),
        ...(drawn && rep.spreadMm !== undefined ? { spreadMm: rep.spreadMm } : {}),
        ...(kind === 'neighbour' && c.outer.length > 2
          ? { was: simplify([...c.outer, c.outer[0]], 0.3).slice(0, -1) }
          : {}),
      };
      cand = {
        seed: c.seed,
        rank: r,
        outer,
        walls,
        inside,
        textsInside: ctx.texts.filter((t) => pointInPoly(t.at, outer)).map((t) => t.id),
        outcome: 'closed',
        areaMm2: Math.abs(signedArea(outer)),
        bbox,
        sourceCoverage: rep.cover,
        p95Mm: 0,
        rankFrom: 'repair',
        repair: record,
        ...(rep.holes.length
          ? {
              derived: rep.holes.map((h) => ({
                // the strict fill's holes stay fills; a drawn block's holes are all DRAWN
                kind: drawn ? ('grade-draw' as const) : ('grade-fill' as const),
                pts: h.pts,
              })),
            }
          : {}),
      };
      // E3 · continuity: the family stays consistent with it (growth in the anchors' band, outline
      // within their spread, the same shape) — judged as a continuity closure would be
      const probe = list.map((x, k) =>
        k === i
          ? {
              ...cand!,
              rankFrom: 'continuity' as const,
              continuity: [{ rule: 'R1' as const, chains: [], pts: [] }],
            }
          : x,
      );
      const verdict = continuityVerdicts(
        probe,
        (x) => !exclude.has(x.rank) && gradeAnchor(x),
      ).refused.get(r);
      if (verdict) why.push('E3-family');
      if (verdict && DEBUG) console.log(`GRADEP2   E3-family: ${verdict}`);
    }
    // Try unassigned ink only for a leak the ordinary strict and draw paths both leave open.
    // A nearer unassigned stroke can otherwise displace a valid outline (MDF451 B, size 2).
    if (
      why.length &&
      kind === 'leak' &&
      !withLooseWalls &&
      rep.pred &&
      looseB?.some(({ box: b }) => meets(b, box))
    ) {
      return tryRepair(list, i, kind, exclude, true);
    }
    probeSink?.({
      seed: c.seed,
      rank: r,
      kind,
      ins,
      walls: ws,
      ...(rep.looseShare != null ? { looseShare: rep.looseShare } : {}),
      tol: repairTol(),
      strict: strictWhy,
      draw: drawWhy,
      drawn,
    });
    if (!why.length && cand) {
      if (DEBUG)
        console.log(
          `GRADEP2 seed ${c.seed} r${r} ${kind} REPAIRED cover ${rep.cover.toFixed(3)} holes ${rep.holes.map((h) => h.lenMm.toFixed(1)).join('/')}`,
        );
      if (kind === 'leak') orig.set(`${c.seed}:${r}`, c);
      // the walk's refusal stays the recorded reason the walk did not build it
      list[i] = c.nest ? { ...cand, nest: c.nest } : cand;
      diag.repaired.push({ seed: c.seed, rank: r, kind });
      return [];
    }
    for (const w of why) refuse(`${kind}:${w}`);
    if (DEBUG)
      console.log(
        `GRADEP2 seed ${c.seed} r${r} ${kind} REFUSED ${why.join(',')} trusted ${rep.trusted?.join('/')} of ${ins.map((x) => x.rank).join('/')} cover ${rep.cover.toFixed(3)} holes ${rep.holes.map((h) => h.lenMm.toFixed(1)).join('/')} offRun ${rep.offRunMm.toFixed(1)} dev ${rep.devMm?.toFixed(2)} score ${rep.score?.toFixed(2)}`,
      );
    if (DEBUG && rep.holes.length) {
      // what is drawn under each hole: the nearest chain within 1.5 mm and how the model files it
      const rankOf = new Map<ChainId, number[]>();
      ctx.wm.byRank.forEach((ids, k) =>
        ids.forEach((id) => rankOf.set(id, [...(rankOf.get(id) ?? []), k])),
      );
      const commonS = new Set(ctx.wm.common);
      for (const h of rep.holes.slice(0, 6)) {
        let best: { id: ChainId; d: number } | null = null;
        for (const ch of ctx.set.chains)
          for (let j = 1; j < ch.pts.length; j++) {
            const a = ch.pts[j - 1];
            const b = ch.pts[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const L2 = dx * dx + dy * dy || 1e-9;
            const u = Math.max(0, Math.min(1, ((h.at.x - a.x) * dx + (h.at.y - a.y) * dy) / L2));
            const d = Math.hypot(h.at.x - a.x - u * dx, h.at.y - a.y - u * dy);
            if (d < 1.5 && (!best || d < best.d)) best = { id: ch.id, d };
          }
        const cls = best
          ? commonS.has(best.id)
            ? 'common'
            : rankOf.has(best.id)
              ? `rank ${rankOf.get(best.id)!.join('/')}`
              : `unranked (${
                  ctx.set.classes.find((k) => k.chains.includes(best!.id))?.role ??
                  (ctx.set.orphans.includes(best.id) ? 'orphan' : '?')
                })`
          : 'nothing drawn';
        const dRing = (rk: number) => {
          const o = anchors.find((x) => x.rank === rk)?.outer ?? [];
          let m = Infinity;
          for (let j = 0; j < o.length; j++) {
            const a = o[j];
            const b = o[(j + 1) % o.length];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const L2 = dx * dx + dy * dy || 1e-9;
            const u = Math.max(0, Math.min(1, ((h.at.x - a.x) * dx + (h.at.y - a.y) * dy) / L2));
            m = Math.min(m, Math.hypot(h.at.x - a.x - u * dx, h.at.y - a.y - u * dy));
          }
          return m.toFixed(2);
        };
        console.log(
          `GRADEP2   hole lo r${rep.from?.[0]} ${rep.from ? dRing(rep.from[0]) : '-'} hi r${rep.from?.[1]} ${rep.from ? dRing(rep.from[1]) : '-'} overlayCand ${best ? chainOf.includes(best.id) : '-'}`,
        );
        console.log(
          `GRADEP2   hole ${h.lenMm.toFixed(1)} mm at ${h.at.x.toFixed(0)},${h.at.y.toFixed(0)}: ${cls}${best ? ` c${best.id} ${best.d.toFixed(2)} mm` : ''}`,
        );
      }
    }
    // the operator's question: where the grade puts the size — between the anchors around it, else
    // (no anchor on one side the model trusts) carried on from the two nearest, marked so
    hint(list, i, rep.pred, rep.from, rep.trusted ?? [], anchors, why);
    return why;
  };

  if (DEBUG)
    for (const [seed, list] of cands)
      console.log(
        `GRADEP2 fam ${seed}: ${list.map((x) => `${x.rank}${x.outcome[0]}${isAnchor(x) ? '*' : gradeAnchor(x) ? '+' : ''}${x.rankFrom && x.rankFrom !== 'class' ? `(${x.rankFrom})` : ''}${x.derived?.length ? `[${x.derived.map((d) => `${d.kind}`).join(',')}]` : ''}`).join(' ')}`,
      );
  // (A) leaks between two anchors — repairSize first; the nest walk only fills what it leaves
  // open (owner, 18 Nov 2026)
  for (const [seed, list] of cands) {
    if (skip.has(seed)) continue;
    for (let i = 0; i < list.length; i++)
      if (list[i].outcome === 'leak') tryRepair(list, i, 'leak');
  }
  const tA = Date.now() - t0;
  // (B) closed sizes the grade check holds (on another size's line), with the families as now —
  // the sheet's whole grade reading (its breaks come from every family) costs seconds on a big sheet
  // (London: 9 s of 12): read only where (A) repaired a size (its anchors must not be held — the
  // undo below) or when asked (GRADE_P2_NEIGHBOUR=1). Elsewhere the semantics stage's own G26
  // holds such a size, as before; across the archive (B) repaired none (GRADE-P2.md).
  const wantB =
    diag.repaired.length > 0 ||
    (typeof process !== 'undefined' && !!process.env?.GRADE_P2_NEIGHBOUR);
  const families: PieceFamily[] = wantB
    ? [...cands]
        .filter(([seed]) => !skip.has(seed))
        .map(([seed, candidates]) => ({ seed, candidates, monotone: true }))
    : [];
  const held = wantB
    ? silentRead(families, ctx.set, ctx.wm)
        .grade()
        ?.verdicts.filter((v) => v.hold)
    : [];
  if (DEBUG)
    console.log(
      `GRADEP2 held by G26: ${(held ?? []).map((v) => `${v.seed}:${v.rank}`).join(' ') || '-'}`,
    );
  const tG = Date.now() - t0 - tA;
  const heldOf = new Map<number, Set<number>>();
  for (const v of held ?? []) heldOf.set(v.seed, (heldOf.get(v.seed) ?? new Set()).add(v.rank));
  for (const v of held ?? []) {
    const list = cands.get(v.seed);
    if (!list) continue;
    const i = list.findIndex((x) => x.rank === v.rank);
    if (i < 0 || list[i].outcome !== 'closed') continue;
    if (list[i].rankFrom === 'repair') {
      // a repair the family's full grade check still holds: not proven — back to the leak it was
      const o = orig.get(`${v.seed}:${v.rank}`);
      if (o) {
        const walkE = list[i].repair?.walk?.etalon;
        list[i] =
          walkE != null
            ? { ...o, nest: { etalon: walkE, state: 'refused', why: 'walk:g26-held' } }
            : o;
        orig.delete(`${v.seed}:${v.rank}`);
        diag.repaired = diag.repaired.filter((x) => !(x.seed === v.seed && x.rank === v.rank));
        refuse('leak:held-after-repair');
      }
      continue;
    }
    tryRepair(list, i, 'neighbour', heldOf.get(v.seed));
  }
  // a leak repaired in (A) on the model of a size the grade check holds (it closed on another size's
  // line — repaired since or not) rested on a wrong anchor: undone, and tried again without it
  for (const [seed, hs] of heldOf) {
    const list = cands.get(seed);
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const o = orig.get(`${seed}:${c.rank}`);
      // a walked size rests on the etalon, not on the anchors' model
      if (c.rankFrom !== 'repair' || c.repair?.kind !== 'leak' || c.repair.walk || !o) continue;
      if (!c.repair.from.some((r) => hs.has(r))) continue;
      list[i] = o;
      orig.delete(`${seed}:${c.rank}`);
      diag.repaired = diag.repaired.filter((x) => !(x.seed === seed && x.rank === c.rank));
      refuse('leak:undone-held-anchor');
      tryRepair(list, i, 'leak', hs);
    }
  }
  // (W) nest walk: confirm/disagree closed sizes; close remaining leaks (owner, 18 Nov 2026)
  if (nestWalkOn()) nestWalkPass(cands, ctx, skip, diag, orig);
  diag.ms = Date.now() - t0;
  if (DEBUG || TIME)
    console.log(
      `GRADEP2 pass ${diag.ms} ms (A ${tA}, G26 ${tG}) · tried ${diag.tried} · repaired ${diag.repaired.length} · families ${cands.size}`,
    );
  return diag;
}

/**
 * The nest walk (gfit/nest-walk.ts), the main build (owner, 17 Nov 2026): per family, every size
 * the file draws is scored for the etalon and every size is built from it by the walk. A closed
 * size keeps its own outline when the walk's lies within `NEST_WALK.confirmP95Mm` of it, else it
 * is flagged 'disagree' (a closure on another size's line). A leak gets the walk's outline when its
 * ring holds, its stretches off the lines ('grade-draw', flagged) stay within
 * `GFIT_REPAIR.drawMaxShare` of its perimeter and, blind to its own lines, the walk still lands on
 * them. A leak it refuses keeps `nest.why` and goes on to repairSize. Returns the seeds it found an
 * etalon for.
 */
/**
 * NEST_WALK_DUMP=<dir> (Node only): writes the walk's exact input per family as
 * `<dir>/seed<seed>.json` ({ sizes, own[i] = lines of sizes[i], common }), the format
 * `nest-walk-check.ts --dump` and `nest-walk-cover.ts --dump` replay. No-op in the browser.
 */
function dumpWalkInput(
  seed: number,
  sizes: NestSizeIn[],
  own: (rank: number) => unknown[],
  common: unknown[],
): void {
  if (typeof process === 'undefined' || !process.env?.NEST_WALK_DUMP) return;
  const get = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  const fs = get?.('node:fs') as
    | { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void }
    | undefined;
  if (!fs) return;
  const dir = process.env.NEST_WALK_DUMP;
  fs.mkdirSync(dir, { recursive: true });
  const body = { sizes, own: sizes.map((s) => own(s.rank)), common };
  fs.writeFileSync(`${dir}/seed${seed}.json`, JSON.stringify(body));
}

function nestWalkPass(
  cands: Map<number, PieceCandidate[]>,
  ctx: RepairCtx,
  skip: ReadonlySet<number>,
  diag: RepairDiag,
  orig: Map<string, PieceCandidate>,
): Set<number> {
  const walked = new Set<number>();
  const count = (why: string) => (diag.refused[why] = (diag.refused[why] ?? 0) + 1);
  const commonPts = ctx.common.map((w) => w.pts);
  for (const [seed, list] of cands) {
    if (skip.has(seed) || !list.length) continue;
    const open = list.filter((c) => c.outcome === 'leak').map((c) => c.rank);
    const sizes: NestSizeIn[] = list.map((c) => ({
      rank: c.rank,
      outer: c.outcome === 'closed' && c.outer.length > 2 ? c.outer : null,
      ...(c.rankFrom ? { from: c.rankFrom } : {}),
      ...(c.derived ? { derived: c.derived.map((d) => ({ kind: d.kind, pts: d.pts })) } : {}),
    }));
    const w = nestWalk({
      sizes,
      own: (r) => ctx.own(r).map((x) => x.pts),
      common: commonPts,
    });
    dumpWalkInput(seed, sizes, (r) => ctx.own(r).map((x) => x.pts), commonPts);
    if (w.etalon == null) {
      const why = `walk:no-etalon:${w.why ?? '-'}`;
      diag.refused[why] = (diag.refused[why] ?? 0) + open.length;
      if (DEBUG) console.log(`GRADEP2 walk seed ${seed}: ${why}`);
      continue;
    }
    const E = w.etalon;
    walked.add(seed);
    const closed = list.filter((c) => c.outcome === 'closed').map((c) => c.rank);
    // closed sizes: the walk confirms the read outline or flags it
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.outcome !== 'closed') continue;
      if (c.rank === E) {
        list[i] = { ...c, nest: { etalon: E, state: 'etalon' } };
        continue;
      }
      const b = w.sizes.get(c.rank);
      if (!b || b.outer.length < 3 || b.refused) {
        const why = `walk:${b?.refused ?? 'not-built'}`;
        list[i] = { ...c, nest: { etalon: E, state: 'unchecked', why } };
        count(`walk-check:${why}`);
        continue;
      }
      const d = ringDistance(b.outer, canonRing(c.outer).pts);
      if (d.p95 <= NEST_WALK.confirmP95Mm) {
        list[i] = { ...c, nest: { etalon: E, state: 'confirmed', p95Mm: round2(d.p95) } };
        continue;
      }
      let landmark = '';
      let best = Infinity;
      w.landmarks.forEach((l, j) => {
        const p = w.tracks?.[j]?.pos[c.rank];
        if (!p) return;
        const dd = dist(p, d.at);
        if (dd < best) [best, landmark] = [dd, `#${j} ${l.kind} e${l.edge}`];
      });
      list[i] = {
        ...c,
        nest: {
          etalon: E,
          state: 'disagree',
          p95Mm: round2(d.p95),
          maxMm: round2(d.max),
          at: d.at,
          ...(landmark ? { landmark } : {}),
        },
      };
      count('walk-check:disagree');
      if (DEBUG)
        console.log(
          `GRADEP2 walk seed ${seed} r${c.rank} disagrees with the nest: p95 ${d.p95.toFixed(2)} max ${d.max.toFixed(2)} at ${d.at.x.toFixed(0)},${d.at.y.toFixed(0)} ${landmark}`,
        );
    }
    for (const r of open) {
      const i = list.findIndex((c) => c.rank === r);
      const b = w.sizes.get(r);
      const refuse = (why: string, err?: { p95: number; max: number }) => {
        count(why);
        list[i] = {
          ...list[i],
          nest: {
            etalon: E,
            state: 'refused',
            why,
            ...(err ? { p95Mm: round2(err.p95), maxMm: round2(err.max) } : {}),
          },
        };
      };
      diag.tried++;
      if (!b || b.outer.length < 3) {
        refuse('walk:not-built');
        continue;
      }
      if (b.refused) {
        refuse(`walk:${b.refused}`);
        continue;
      }
      const ring0 = signedArea(b.outer) < 0 ? b.outer.slice().reverse() : b.outer;
      const outer = simplify([...ring0, ring0[0]], 0.02).slice(0, -1);
      let per = 0;
      for (let k = 0; k < outer.length; k++) {
        const p = outer[k];
        const q = outer[(k + 1) % outer.length];
        per += Math.hypot(q.x - p.x, q.y - p.y);
      }
      if (b.derivedMm > GFIT_REPAIR.drawMaxShare * per) {
        refuse('walk:derived-share');
        continue;
      }
      // the walk must predict the size, not trace it: blind to its own lines it still lands on them
      const blind = nestWalk({
        sizes,
        own: (k) => ctx.own(k).map((x) => x.pts),
        common: commonPts,
        etalon: w.etalon,
        hide: new Set([r]),
        only: new Set([r]),
      }).sizes.get(r);
      const fit =
        blind && blind.outer.length > 2
          ? linesToRing(
              ctx.own(r).map((x) => x.pts),
              blind.outer,
              NEST_WALK.blindNearMm,
            )
          : null;
      if (!fit || !fit.n || fit.p95 > NEST_WALK.blindP95Mm || fit.max > NEST_WALK.blindMaxMm) {
        refuse('walk:blind', fit ?? undefined);
        if (DEBUG)
          console.log(
            `GRADEP2 walk seed ${seed} r${r} refused blind: ${fit ? `p95 ${fit.p95.toFixed(2)} max ${fit.max.toFixed(2)} n${fit.n}` : 'not built'}`,
          );
        continue;
      }
      const below = closed.filter((k) => k < r).pop();
      const above = closed.find((k) => k > r);
      const areaOf = (k: number | undefined) =>
        k == null ? NaN : Math.abs(signedArea(list[list.findIndex((c) => c.rank === k)].outer));
      const area = Math.abs(signedArea(outer));
      if (area <= areaOf(below) || area >= areaOf(above)) {
        refuse('walk:area-order');
        continue;
      }
      // the chains the outline runs on (≥ 3 mm of it within 0.5 mm): its walls
      const kept = [...ctx.own(r), ...ctx.common].filter(
        (x) => x.pts.length >= 2 && x.pts.some((p, k) => k > 0 && dist(p, x.pts[k - 1]) > 0),
      );
      const idx = new NestLineIndex(
        kept.map((x) => x.pts),
        4,
      );
      const onMm = new Map<number, number>();
      for (let k = 0; k < outer.length; k++) {
        const p = outer[k];
        const q = outer[(k + 1) % outer.length];
        const L = Math.hypot(q.x - p.x, q.y - p.y);
        const n = Math.max(1, Math.ceil(L / 0.5));
        for (let s = 0; s < n; s++) {
          const t = s / n;
          const h = idx.nearest({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, 0.5);
          if (h) {
            const li = idx.pts[h.j].line;
            onMm.set(li, (onMm.get(li) ?? 0) + L / n);
          }
        }
      }
      const walls = [
        ...new Set([...onMm].filter(([, mm]) => mm >= 3).map(([li]) => kept[li].chain)),
      ];
      const bbox = bboxOf(outer);
      const wallSet = new Set(walls);
      const inside: ChainId[] = [];
      for (const ch of ctx.set.chains) {
        if (wallSet.has(ch.id) || ch.pts.length < 2) continue;
        const cb = bboxOf(ch.pts);
        if (
          cb.minX < bbox.minX ||
          cb.maxX > bbox.maxX ||
          cb.minY < bbox.minY ||
          cb.maxY > bbox.maxY
        )
          continue;
        const step = Math.max(1, Math.floor(ch.pts.length / 8));
        let ok = true;
        for (let j = 0; j < ch.pts.length && ok; j += step) ok = pointInPoly(ch.pts[j], outer);
        if (ok && pointInPoly(ch.pts[ch.pts.length - 1], outer)) inside.push(ch.id);
      }
      const from: [number, number] = [below ?? above ?? w.etalon, above ?? below ?? w.etalon];
      const derivedMm = Math.round(b.derivedMm * 10) / 10;
      const record: RepairRecord = {
        kind: 'leak',
        from,
        cover: Math.round((1 - b.derivedMm / per) * 1000) / 1000,
        holes: b.derived.length,
        holesMm: derivedMm,
        score: 0,
        devMm: 0,
        ...(b.derived.length ? { drawnMm: derivedMm } : {}),
        ...(below == null || above == null ? { extrapolated: true as const } : {}),
        walk: { etalon: w.etalon },
      };
      orig.set(`${seed}:${r}`, list[i]);
      list[i] = {
        seed,
        rank: r,
        outer,
        walls,
        inside,
        textsInside: ctx.texts.filter((t) => pointInPoly(t.at, outer)).map((t) => t.id),
        outcome: 'closed',
        areaMm2: Math.abs(signedArea(outer)),
        bbox,
        sourceCoverage: record.cover,
        p95Mm: 0,
        rankFrom: 'repair',
        repair: record,
        nest: { etalon: E, state: 'built', p95Mm: round2(fit.p95), maxMm: round2(fit.max) },
        ...(b.derived.length
          ? { derived: b.derived.map((d) => ({ kind: 'grade-draw' as const, pts: d.pts })) }
          : {}),
      };
      diag.repaired.push({ seed, rank: r, kind: 'leak' });
      if (DEBUG)
        console.log(
          `GRADEP2 walk seed ${seed} r${r} from etalon ${w.etalon}: derived ${derivedMm} mm (${((b.derivedMm / per) * 100).toFixed(1)} %)`,
        );
    }
  }
  return walked;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
