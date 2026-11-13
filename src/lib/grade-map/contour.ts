// Grade map · the cut and seam tracks. Each size is matched to the base on its own (a size that
// cannot be matched is refused alone): corners by the importer's matcher (equal count, cyclic shift
// with agreeing turn signs, an unclear shift refused as symmetric), then the notches on the cut by
// where that correspondence predicts them (nearest, clearly nearest, mutual). Matched notches become
// anchors too. The nodes are every size's anchors read on the base plus the refinement points.

import { lineCorners, matchLineCorners } from 'lib/pattern-import/adapters/rul/correspond';
import { CONTOUR_CORNER_THRESHOLDS } from 'lib/fusing-dxf/zone-grade';
import type { PtMm } from 'lib/pattern-import/types';
import { corrOf, fwdU, nearestUnique, refineNodes, type Anchor, type Corr } from './corr';
import { bboxOf, dist, pointAt, toQ, type Path } from './geom';
import type { Notch } from './marks';
import type { GmBuildOptions, GmTrack, GmTrackInfo, GmTrackSize } from './types';

/** A notch is looked for this far (mm) from where the corner correspondence puts it. */
export const NOTCH_REACH_MM = 15;
/** Gap-tolerant corners: a base corner's twin may sit this far from its bbox image (or 3 % of the diagonal). */
const POSITION_REACH_MM = 10;

export type ContourSide = { sizeId: number; path: Path | null; notches?: Notch[] };

export type ContourBuild = {
  track: GmTrack;
  info: GmTrackInfo;
  /** Carried sizes' correspondences. */
  corr: Map<number, Corr>;
  /** Per size, per base notch on the cut: the size notch index paired, or the refusal. */
  notchPair: Map<number, (number | string)[]>;
};

const stretchOf = (b: Path, z: Path) => {
  const from = bboxOf(b.pts);
  const to = bboxOf(z.pts);
  const sx = from.maxX > from.minX ? (to.maxX - to.minX) / (from.maxX - from.minX) || 1 : 1;
  const sy = from.maxY > from.minY ? (to.maxY - to.minY) / (from.maxY - from.minY) || 1 : 1;
  return { sx, sy };
};

/** Corner anchors by the importer's matcher (zone mapper's threshold order). */
export function cornerAnchors(
  b: Path,
  z: Path,
): { ok: true; anchors: Anchor[] } | { ok: false; reason: string } {
  const m = matchLineCorners([b.pts, z.pts], true, CONTOUR_CORNER_THRESHOLDS);
  if (m.ok) {
    const [cb, cz] = m.corners;
    return { ok: true, anchors: cb.map((i, k) => ({ s: b.cum[i], t: z.cum[cz[k]] })) };
  }
  const T = CONTOUR_CORNER_THRESHOLDS[0];
  if (m.reason.includes('differ in number')) {
    const nb = lineCorners(b.pts, true, T).length;
    const nz = lineCorners(z.pts, true, T).length;
    if (nb < 2 && nz < 2) return { ok: false, reason: 'round: no corners' };
    return { ok: false, reason: `corners-differ: base ${nb} / size ${nz} at ${T}°` };
  }
  if (m.reason.includes('more than one way'))
    return { ok: false, reason: 'symmetric: corners match more than one way' };
  if (m.reason.includes('turn differently'))
    return { ok: false, reason: 'corners-turn: no shift with agreeing turns' };
  return { ok: false, reason: `corners: ${m.reason}` };
}

/** What-if matcher: corners paired by position after the bbox map, gaps allowed. */
export function positionAnchors(
  b: Path,
  z: Path,
): { ok: true; anchors: Anchor[] } | { ok: false; reason: string } {
  const T = CONTOUR_CORNER_THRESHOLDS[0];
  const cb = lineCorners(b.pts, true, T);
  const cz = lineCorners(z.pts, true, T);
  if (cb.length < 2 || cz.length < 2) return { ok: false, reason: 'round: no corners' };
  const from = bboxOf(b.pts);
  const to = bboxOf(z.pts);
  const { sx, sy } = stretchOf(b, z);
  const image = (p: PtMm): PtMm => ({
    x: to.minX + (p.x - from.minX) * sx,
    y: to.minY + (p.y - from.minY) * sy,
  });
  const diag = Math.hypot(to.maxX - to.minX, to.maxY - to.minY);
  const reach = Math.max(POSITION_REACH_MM, 0.03 * diag);
  const pairs = nearestUnique(
    cb,
    cz,
    (x, y) =>
      Math.sign(x.turn) === Math.sign(y.turn) ? dist(image(b.pts[x.i]), z.pts[y.i]) : Infinity,
    reach,
  );
  const anchors: Anchor[] = [];
  pairs.forEach((j, k) => {
    if (j !== null) anchors.push({ s: b.cum[cb[k].i], t: z.cum[cz[j].i] });
  });
  if (anchors.length < 2)
    return { ok: false, reason: `gap-tolerant: ${anchors.length} corner pairs` };
  return { ok: true, anchors };
}

function reasonOfNotch(predicted: PtMm, candidates: readonly Notch[], reach: number): string {
  const near = candidates.filter((c) => dist(predicted, c.a) <= reach).length;
  return near ? 'notch-ambiguous: no clear twin' : 'notch-missing: none within reach';
}

/** Notch anchors of one size: two passes, the second on the correspondence the first refined. */
function pairNotches(
  b: Path,
  z: Path,
  anchors: Anchor[],
  stretch: { sx: number; sy: number },
  baseNotches: readonly Notch[],
  sizeNotches: readonly Notch[],
): { corr: Corr; pair: (number | string)[] } | null {
  let corr = corrOf(b, z, anchors, stretch);
  if (!corr) return null;
  const onCut = sizeNotches.map((n, i) => ({ n, i })).filter((x) => x.n.arc !== null);
  const pair: (number | string)[] = baseNotches.map(() => 'notch-missing: none within reach');
  let all = [...anchors];
  for (let pass = 0; pass < 2; pass++) {
    const open = baseNotches
      .map((n, k) => ({ n, k }))
      .filter((x) => typeof pair[x.k] === 'string' && x.n.arc !== null);
    const taken = new Set(pair.filter((p): p is number => typeof p === 'number'));
    const free = onCut.filter((x) => !taken.has(x.i));
    const predicted = open.map((x) => pointAt(z, fwdU(corr!, x.n.arc!)));
    const got = nearestUnique(
      predicted,
      free.map((x) => x.n.a),
      dist,
      NOTCH_REACH_MM,
    );
    const added: Anchor[] = [];
    got.forEach((j, k) => {
      const at = open[k].k;
      if (j === null) {
        pair[at] = reasonOfNotch(
          predicted[k],
          free.map((x) => x.n),
          NOTCH_REACH_MM,
        );
        return;
      }
      const cand = { s: open[k].n.arc!, t: free[j].n.arc! };
      const trial = corrOf(b, z, [...all, ...added, cand], stretch);
      if (!trial) {
        pair[at] = 'notch-order: twin out of order on the cut';
        return;
      }
      added.push(cand);
      pair[at] = free[j].i;
    });
    if (!added.length) break;
    all = [...all, ...added];
    corr = corrOf(b, z, all, stretch)!;
  }
  return { corr, pair };
}

export function contourTrack(
  kind: 'cut' | 'seam',
  layer: string,
  base: ContourSide,
  others: readonly ContourSide[],
  opts: GmBuildOptions = {},
): ContourBuild | null {
  const b = base.path;
  if (!b) return null;
  const baseNotches = kind === 'cut' ? base.notches ?? [] : [];
  const corr = new Map<number, Corr>();
  const notchPair = new Map<number, (number | string)[]>();
  const refused = new Map<number, string>();
  const whatIf: Record<number, string> = {};
  const anchorArcs: number[] = baseNotches.filter((n) => n.arc !== null).map((n) => n.arc!);
  for (const side of others) {
    const z = side.path;
    if (!z) {
      refused.set(side.sizeId, `no-line: no ${kind} line in this size`);
      continue;
    }
    const matched = opts.gapTolerant ? positionAnchors(b, z) : cornerAnchors(b, z);
    const stretch = stretchOf(b, z);
    if (!matched.ok) {
      refused.set(side.sizeId, matched.reason);
      if (!opts.gapTolerant) {
        const alt = positionAnchors(b, z);
        whatIf[side.sizeId] = alt.ok
          ? corrOf(b, z, alt.anchors, stretch)
            ? 'ok'
            : 'gap-tolerant: corners out of order'
          : alt.reason;
      }
      continue;
    }
    const paired = pairNotches(b, z, matched.anchors, stretch, baseNotches, side.notches ?? []);
    if (!paired) {
      refused.set(side.sizeId, 'corners-order: matched corners out of order');
      continue;
    }
    corr.set(side.sizeId, paired.corr);
    notchPair.set(side.sizeId, paired.pair);
    anchorArcs.push(...matched.anchors.map((a) => a.s));
  }
  const carried = others.filter((s) => corr.has(s.sizeId));
  const refined = refineNodes(
    b,
    anchorArcs,
    carried.map((s) => corr.get(s.sizeId)!),
  );
  if (!refined) {
    for (const s of carried) refused.set(s.sizeId, 'too-many-nodes: more than the node cap');
    corr.clear();
    notchPair.clear();
  }
  const nodes = refined?.nodes ?? [0];
  const basePts = nodes.map((s) => pointAt(b, s));
  const sizes: GmTrackSize[] = others.map((side) => {
    const c = corr.get(side.sizeId);
    if (!c || !side.path)
      return { sizeId: side.sizeId, refused: refused.get(side.sizeId) ?? 'refused' };
    const k = carried.indexOf(side);
    return {
      sizeId: side.sizeId,
      delta: nodes.map((s, j) => {
        const p = pointAt(side.path!, fwdU(c, s));
        return [toQ(p.x) - toQ(basePts[j].x), toQ(p.y) - toQ(basePts[j].y)];
      }),
      residualMm: refined!.residual[k],
    };
  });
  const residualMm = Math.max(0, ...sizes.map((s) => s.residualMm ?? 0));
  const anyCarried = sizes.some((s) => s.delta) || !others.length;
  const track: GmTrack = {
    kind,
    layer,
    closed: true,
    trust: anyCarried ? 'derived' : 'refused',
    ...(anyCarried ? {} : { reason: sizes[0]?.refused ?? 'refused' }),
    residualMm,
    base: basePts.map((p) => [toQ(p.x), toQ(p.y)]),
    sizes,
  };
  return {
    track,
    info: {
      margin: Infinity,
      anchors: refined ? nodes.length - refined.added : 0,
      ...(Object.keys(whatIf).length ? { whatIf } : {}),
    },
    corr,
    notchPair,
  };
}
