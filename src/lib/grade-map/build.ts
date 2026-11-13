// Grade map · builder of one piece and of one file from the per-size geometry the runtime sees.
//
// Cut and seam: contour.ts. Notches on the cut ride the cut's correspondence. Internal lines, drills
// and notches off the cut are paired the way the zone mapper pairs internal lines: each base mark,
// moved by the contour-only grade field, takes the nearest mark of its kind in the size — only when
// both prefer each other, no other mark rivals it (within max(0.5 mm, half the cost)) and it sits
// within the contour's largest move + 2 mm. A paired line's nodes are its ends and matched corners
// (the importer's corner matcher; a closed line that matches more than one way is refused).

import { lineCorners, matchLineCorners } from 'lib/pattern-import/adapters/rul/correspond';
import { contourSignature } from 'lib/pattern-import/manifest/contour-sig';
import type { PtMm } from 'lib/pattern-import/types';
import { CONTOUR_CORNER_THRESHOLDS, zoneGrade } from 'lib/fusing-dxf/zone-grade';
import { contourTrack } from './contour';
import { corrOf, fwdU, nearestUnique, refineNodes, type Anchor, type Corr } from './corr';
import { chamfer, dist, pathOf, pointAt, resampled, toQ, type Path } from './geom';
import {
  classify,
  NOTCH_LAYER,
  type Drill,
  type Internal,
  type Notch,
  type SizeMarks,
} from './marks';
import type {
  GmBuildOptions,
  GmFile,
  GmLine,
  GmPiece,
  GmPieceBuild,
  GmPieceInput,
  GmSizeGeometry,
  GmTrack,
  GmTrackInfo,
  GmTrackSize,
} from './types';

export const BUILDER = 'gm-p0.1';
const CUT_LAYER = '1';
const SEAM_LAYER = '14';
/** A paired mark may sit this far beyond the contour's largest move from its prediction, mm. */
const LINE_SLACK_MM = 2;
/** Two lines of one size this close (RMS) are the same line drawn twice. */
const SAME_LINE_MM = 0.25;
/** Lines are compared at this many points. */
const LINE_SAMPLES = 32;

type Side = {
  geo: GmSizeGeometry;
  cut: Path | null;
  seam: Path | null;
  marks: SizeMarks;
};

type Predict = (p: PtMm) => PtMm;

/** Per size: the contour-only grade field base → size and its largest move. */
function predictorOf(base: Side, size: Side): { predict: Predict; reach: number } | null {
  if (!base.cut || !size.cut) return null;
  const grade = zoneGrade(base.cut.pts, size.cut.pts, null);
  const step = Math.max(1, Math.floor(base.cut.pts.length / 64));
  let reach = 0;
  for (let i = 0; i < base.cut.pts.length; i += step) {
    const p = base.cut.pts[i];
    reach = Math.max(reach, dist(p, grade.point(p)));
  }
  return { predict: grade.point, reach };
}

type PairResult = { j: number; margin: number } | { refused: string };

/** The zone mapper's line pairing rule over a cost matrix (base rows × size columns). */
function pairRule(
  cost: number[][],
  sameT: (j: number, k: number) => boolean,
  sameB: (i: number, k: number) => boolean,
  cap: number,
): PairResult[] {
  return cost.map((row, i) => {
    if (!row.length) return { refused: 'missing: no mark of this kind in the size' };
    let j = 0;
    for (let k = 1; k < row.length; k++) if (row[k] < row[j]) j = k;
    const c = row[j];
    if (!(c <= cap)) return { refused: 'missing: none within reach' };
    const margin = (x: number) => Math.max(0.5, 0.5 * x);
    let second = Infinity;
    for (let k = 0; k < row.length; k++) if (!sameT(j, k)) second = Math.min(second, row[k]);
    if (second - c < margin(c)) return { refused: 'ambiguous: another mark as near' };
    for (let k = 0; k < cost.length; k++)
      if (!sameB(i, k) && cost[k][j] - c < margin(c))
        return { refused: 'ambiguous: another base mark as near' };
    return { j, margin: c > 1e-9 ? second / c : Infinity };
  });
}

function trackOf(
  kind: GmTrack['kind'],
  layer: string,
  closed: boolean,
  basePts: PtMm[],
  sizes: { sizeId: number; pts?: PtMm[]; refused?: string; residualMm?: number }[],
): GmTrack {
  const base: [number, number][] = basePts.map((p) => [toQ(p.x), toQ(p.y)]);
  const out: GmTrackSize[] = sizes.map((s) =>
    s.pts
      ? {
          sizeId: s.sizeId,
          delta: s.pts.map((p, j) => [toQ(p.x) - base[j][0], toQ(p.y) - base[j][1]]),
          residualMm: s.residualMm ?? 0,
        }
      : { sizeId: s.sizeId, refused: s.refused ?? 'refused' },
  );
  const carried = out.some((s) => s.delta) || !out.length;
  return {
    kind,
    layer,
    closed,
    trust: carried ? 'derived' : 'refused',
    ...(carried ? {} : { reason: out[0].refused }),
    residualMm: Math.max(0, ...out.map((s) => s.residualMm ?? 0)),
    base,
    sizes: out,
  };
}

/** Anchors of one paired line: the importer's corners (open lines: ends + corners). */
function lineAnchors(
  b: Path,
  twin: Path,
): { ok: true; anchors: Anchor[]; oriented: Path } | { ok: false; reason: string } {
  const m = matchLineCorners([b.pts, twin.pts], b.closed, CONTOUR_CORNER_THRESHOLDS);
  if (!m.ok) {
    if (m.reason.includes('more than one way'))
      return { ok: false, reason: 'symmetric: corners match more than one way' };
    if (m.reason.includes('differ in number')) {
      const T = CONTOUR_CORNER_THRESHOLDS[0];
      const nb = lineCorners(b.pts, b.closed, T).length;
      const nz = lineCorners(twin.pts, b.closed, T).length;
      return {
        ok: false,
        reason:
          nb < 2 && nz < 2
            ? 'round: no corners'
            : `corners-differ: base ${nb} / size ${nz} at ${T}°`,
      };
    }
    return { ok: false, reason: `corners-turn: ${m.reason}` };
  }
  const oriented = pathOf(m.lines[1], b.closed);
  if (!oriented || oriented.pts.length !== m.lines[1].length)
    return { ok: false, reason: 'degenerate: twin line' };
  const [cb, cz] = m.corners;
  return {
    ok: true,
    anchors: cb.map((i, k) => ({ s: b.cum[i], t: oriented.cum[cz[k]] })),
    oriented,
  };
}

export function buildPieceMap(
  input: GmPieceInput,
  sizeOrder: readonly number[],
  opts: GmBuildOptions = {},
): GmPieceBuild {
  const sideOf = (geo: GmSizeGeometry): Side => {
    const cut = pathOf(geo.cut, true);
    return {
      geo,
      cut,
      seam: geo.seam ? pathOf(geo.seam, true) : null,
      marks: classify(geo.lines, cut),
    };
  };
  const byId = new Map(input.sizes.map((g) => [g.sizeId, g]));
  const baseGeo = byId.get(input.baseSizeId);
  if (!baseGeo)
    throw new Error(`grade map: base size ${input.baseSizeId} missing for ${input.key}`);
  const base = sideOf(baseGeo);
  const others = sizeOrder
    .filter((id) => id !== input.baseSizeId && byId.has(id))
    .map((id) => sideOf(byId.get(id)!));
  const tracks: GmTrack[] = [];
  const info: GmTrackInfo[] = [];
  const claimed = new Map<number, Set<string>>(others.map((s) => [s.geo.sizeId, new Set()]));

  // cut + notches on it
  const cut = contourTrack(
    'cut',
    CUT_LAYER,
    { sizeId: input.baseSizeId, path: base.cut, notches: base.marks.notches },
    others.map((s) => ({ sizeId: s.geo.sizeId, path: s.cut, notches: s.marks.notches })),
    opts,
  );
  if (cut) {
    tracks.push(cut.track);
    info.push(cut.info);
  }
  // seam
  if (base.seam) {
    const seam = contourTrack(
      'seam',
      SEAM_LAYER,
      { sizeId: input.baseSizeId, path: base.seam },
      others.map((s) => ({ sizeId: s.geo.sizeId, path: s.seam })),
      opts,
    );
    if (seam) {
      tracks.push(seam.track);
      info.push(seam.info);
    }
  }
  const predictors = new Map(others.map((s) => [s.geo.sizeId, predictorOf(base, s)]));

  // notches on the cut: their twins come with the cut's correspondence
  base.marks.notches.forEach((n, k) => {
    if (n.arc === null) return;
    const sizes = others.map((s) => {
      const p = cut?.notchPair.get(s.geo.sizeId)?.[k];
      if (typeof p !== 'number') {
        const why = cut?.track.sizes.find((x) => x.sizeId === s.geo.sizeId)?.refused;
        return { sizeId: s.geo.sizeId, refused: p ?? `no-cut: ${why ?? 'cut not carried'}` };
      }
      const twin = s.marks.notches[p];
      claimed.get(s.geo.sizeId)!.add(`n${twin.idx}`);
      return { sizeId: s.geo.sizeId, pts: [twin.a, twin.b] };
    });
    tracks.push(trackOf('notch', NOTCH_LAYER, false, [n.a, n.b], sizes));
    info.push({ margin: Infinity, anchors: 2, source: n.idx });
  });

  // notches off the cut and drills: point marks paired by the contour field
  const offCut = (m: SizeMarks) => m.notches.filter((n) => n.arc === null);
  pointMarks(
    offCut(base.marks).map((n) => ({ c: mid(n), idx: n.idx, pts: [n.a, n.b] })),
    others.map((s) => offCut(s.marks).map((n) => ({ c: mid(n), idx: n.idx, pts: [n.a, n.b] }))),
    'notch',
    NOTCH_LAYER,
  );
  pointMarks(
    base.marks.drills.map((d) => drillMark(d, base.geo.lines)),
    others.map((s) => s.marks.drills.map((d) => drillMark(d, s.geo.lines))),
    'drill',
    null,
  );

  function pointMarks(
    baseList: { c: PtMm; idx: number; pts: PtMm[]; layer?: string }[],
    sizeLists: { c: PtMm; idx: number; pts: PtMm[]; layer?: string }[][],
    kind: 'notch' | 'drill',
    layer: string | null,
  ) {
    if (!baseList.length) return;
    const perSize = others.map((s, z) => {
      const pr = predictors.get(s.geo.sizeId);
      const list = sizeLists[z];
      if (!pr) return baseList.map((): PairResult => ({ refused: 'no-cut: no contour field' }));
      const predicted = baseList.map((m) => pr.predict(m.c));
      const cost = predicted.map((p) => list.map((m) => dist(p, m.c)));
      return pairRule(
        cost,
        (j, k) => j === k,
        (i, k) => i === k,
        pr.reach + LINE_SLACK_MM,
      );
    });
    baseList.forEach((m, i) => {
      let margin = Infinity;
      const sizes = others.map((s, z) => {
        const r = perSize[z][i];
        if ('refused' in r) return { sizeId: s.geo.sizeId, refused: `${kind}-${r.refused}` };
        margin = Math.min(margin, r.margin);
        const twin = sizeLists[z][r.j];
        claimed.get(s.geo.sizeId)!.add(`${kind[0]}${twin.idx}`);
        if (kind === 'drill') return { sizeId: s.geo.sizeId, pts: [twin.c] };
        // a notch keeps its ends in the order nearest to the prediction
        const pr = predictors.get(s.geo.sizeId)!;
        const [pa, pb] = m.pts.map(pr.predict);
        const flip =
          dist(pa, twin.pts[1]) + dist(pb, twin.pts[0]) <
          dist(pa, twin.pts[0]) + dist(pb, twin.pts[1]);
        return { sizeId: s.geo.sizeId, pts: flip ? [twin.pts[1], twin.pts[0]] : twin.pts };
      });
      tracks.push(
        trackOf(
          kind,
          layer ?? m.layer ?? '',
          kind === 'drill',
          kind === 'drill' ? [m.c] : m.pts,
          sizes,
        ),
      );
      info.push({ margin, anchors: kind === 'drill' ? 1 : 2, source: m.idx });
    });
  }

  // internal lines
  const groups = new Map<string, Internal[]>();
  for (const l of base.marks.internals) {
    const key = `${l.line.layer}|${l.line.closed ? 1 : 0}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  for (const [key, bl] of groups) {
    const sample = (p: Path) => resampled(p, LINE_SAMPLES);
    const bs = bl.map((l) => sample(l.path));
    const closed = bl[0].line.closed;
    const perSize = others.map((s) => {
      const tl = s.marks.internals.filter(
        (l) => `${l.line.layer}|${l.line.closed ? 1 : 0}` === key,
      );
      const pr = predictors.get(s.geo.sizeId);
      if (!pr)
        return { tl, res: bl.map((): PairResult => ({ refused: 'no-cut: no contour field' })) };
      const ts = tl.map((l) => sample(l.path));
      const cost = bs.map((p) => {
        const moved = p.map(pr.predict);
        return ts.map((t) => chamfer(moved, t, closed));
      });
      const sameT = (j: number, k: number) =>
        j === k || chamfer(ts[j], ts[k], closed) <= SAME_LINE_MM;
      const sameB = (i: number, k: number) =>
        i === k || chamfer(bs[i], bs[k], closed) <= SAME_LINE_MM;
      return { tl, res: pairRule(cost, sameT, sameB, pr.reach + LINE_SLACK_MM) };
    });
    bl.forEach((l, i) => {
      let margin = Infinity;
      const pairs = new Map<number, { corr: Corr; twin: Path }>();
      const refused = new Map<number, string>();
      const anchorArcs: number[] = [];
      others.forEach((s, z) => {
        const r = perSize[z].res[i];
        if ('refused' in r) {
          refused.set(s.geo.sizeId, `line-${r.refused}`);
          return;
        }
        margin = Math.min(margin, r.margin);
        const twin = perSize[z].tl[r.j];
        const a = lineAnchors(l.path, twin.path);
        if (!a.ok) {
          refused.set(s.geo.sizeId, a.reason);
          return;
        }
        const corr = corrOf(l.path, a.oriented, a.anchors, null);
        if (!corr) {
          refused.set(s.geo.sizeId, 'corners-order: matched corners out of order');
          return;
        }
        claimed.get(s.geo.sizeId)!.add(`l${twin.idx}`);
        pairs.set(s.geo.sizeId, { corr, twin: a.oriented });
        anchorArcs.push(...a.anchors.map((x) => x.s));
      });
      if (!closed) anchorArcs.push(0, l.path.total);
      const carried = others.filter((s) => pairs.has(s.geo.sizeId));
      const refined = refineNodes(
        l.path,
        anchorArcs.length ? anchorArcs : [0],
        carried.map((s) => pairs.get(s.geo.sizeId)!.corr),
      );
      const nodes = refined?.nodes ?? [0];
      const sizes = others.map((s) => {
        const p = pairs.get(s.geo.sizeId);
        if (!p || !refined)
          return { sizeId: s.geo.sizeId, refused: refused.get(s.geo.sizeId) ?? 'too-many-nodes' };
        return {
          sizeId: s.geo.sizeId,
          pts: nodes.map((x) => pointAt(p.twin, fwdU(p.corr, x))),
          residualMm: refined.residual[carried.indexOf(s)],
        };
      });
      tracks.push(
        trackOf(
          'internal',
          l.line.layer,
          closed,
          nodes.map((x) => pointAt(l.path, x)),
          sizes,
        ),
      );
      info.push({ margin, anchors: refined ? nodes.length - refined.added : 0, source: l.idx });
    });
  }

  const unclaimed: Record<number, number> = {};
  for (const s of others) {
    const c = claimed.get(s.geo.sizeId)!;
    const m = s.marks;
    unclaimed[s.geo.sizeId] =
      m.internals.filter((l) => !c.has(`l${l.idx}`)).length +
      m.drills.filter((d) => !c.has(`d${d.idx[0]}`)).length +
      m.notches.filter((n) => !c.has(`n${n.idx}`)).length;
  }
  const piece: GmPiece = {
    key: input.key,
    sig: base.cut ? contourSignature(base.cut.pts) : null,
    tracks,
  };
  return { piece, info, unclaimed };
}

const mid = (n: Notch): PtMm => ({ x: (n.a.x + n.b.x) / 2, y: (n.a.y + n.b.y) / 2 });

function drillMark(d: Drill, lines: readonly GmLine[]) {
  return { c: d.c, idx: d.idx[0], pts: [d.c], layer: lines[d.idx[0]]?.layer };
}

/** The map of one file: every piece with at least one size, in the given size order. */
export function buildFileMap(
  pieces: readonly GmPieceInput[],
  sizeOrder: readonly number[],
  baseSizeId: number,
  opts: GmBuildOptions = {},
): { file: GmFile; builds: GmPieceBuild[] } {
  const builds = pieces.map((p) => buildPieceMap(p, sizeOrder, opts));
  return {
    file: {
      format: 'GRBPWR-GRADEMAP',
      version: 1,
      builder: BUILDER,
      sizes: [...sizeOrder],
      baseSizeId,
      pieces: builds.map((b) => b.piece),
    },
    builds,
  };
}
