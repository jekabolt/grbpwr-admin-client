import { aliasNames, normBlock } from 'lib/pattern-import/fabrics/draft';
import type {
  DraftScopeTarget,
  GrainFeature,
  ManifestSize,
  ManifestSource,
  PieceSizeSpec,
  PieceSpec,
  PtMm,
} from 'lib/pattern-import/types';
import { GENERATED_FUSING_DXF_MARKER } from 'lib/pattern-import/types';
import { writeScopes } from 'lib/pattern-import/write';
import { fitGrainInside } from 'lib/pattern-import/semantics/grain-inside';
import { edgeRunsOf } from './edge-runs';
import { fuseAreaMm2, fuseInsetRingMm, fuseParts, generateFuseGeometry } from './geometry';
import { ZONE_ON_CONTOUR_MM, projectOnRing } from './spline';
import type { FuseSpline, PieceFuseSpec } from './types';

export type FusingBomLine = {
  bomLineKey: string;
  code: string;
  label: string;
};

export type FusingSourceSize = {
  sizeToken: string;
  sizeId: number;
  rank: number;
  outline: PtMm[];
  /** The size's own sewing contour, in the same piece-local frame as outline. */
  netOutline?: PtMm[];
  darts?: PtMm[][];
  grain?: { a: PtMm; b: PtMm } | null;
};

export type FusingSourcePiece = {
  identity: string;
  displayName: string;
  piecesPerGarment: number;
  ungraded: boolean;
  /** null keeps a non-fused source piece available as a referenced zone. */
  fuse: PieceFuseSpec | null;
  seamAllowanceMm?: number | null;
  sizes: FusingSourceSize[];
};

export type BuildFusingSheetsInput = {
  techCardId: number;
  style: string;
  baseSizeId?: number | null;
  bomLines: FusingBomLine[];
  pieces: FusingSourcePiece[];
  /**
   * T5 (09.11): the time the R12 header prints («Creation Date / Time»). The sheets the build reads
   * fix it, never the clock: the same inputs give the same bytes, so a rebuild with nothing changed
   * finds its sheet by sha256 and writes nothing. Absent or unreadable → the epoch.
   */
  createdAt?: string;
};

/** The header time of a generated sheet: the given one when readable, else the epoch. */
export function fusingSheetStamp(createdAt: string | undefined): Date {
  const at = createdAt ? new Date(createdAt) : new Date(0);
  return Number.isNaN(at.getTime()) ? new Date(0) : at;
}

export type FusingSkippedSize = {
  piece: string;
  size: string;
  reason: string;
};

export type GeneratedFusingSheet = {
  bomLineKey: string;
  filename: string;
  dxfText: string;
  blocks: string[];
  /**
   * How the card links this sheet's blocks to pieces: one row per block identity, spelled as the
   * importer spells its own converted sheets (`aliasNames`: the identity, or the raw `_UNI` block);
   * `identity` is the SOURCE piece, so every separate part (`BP_PART1`) links to the piece it was
   * cut from.
   */
  aliases: { identity: string; blockName: string }[];
};

export type BuildFusingSheetsResult = {
  sheets: GeneratedFusingSheet[];
  warnings: string[];
  skippedSizes: FusingSkippedSize[];
};

const SOURCE: ManifestSource = {
  files: [],
  scale: { method: 'declared', factor: 1, measuredMm: null, declaredMm: null },
  sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
  sizeEncoding: 'dxf-block',
  variant: null,
};

const slug = (value: string, fallback: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || fallback;

export function fusingSheetFilename(style: string, bomCode: string): string {
  return `${slug(style, 'style')}-fusing-${slug(bomCode, 'interlining')}.dxf`;
}

function markGeneratedFusing(dxfText: string): string {
  const eol = dxfText.includes('\r\n') ? '\r\n' : '\n';
  return `999${eol}${GENERATED_FUSING_DXF_MARKER}${eol}${dxfText}`;
}

function bbox(points: readonly PtMm[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function axisThrough(points: readonly PtMm[], angleDeg: number): { a: PtMm; b: PtMm } {
  const box = bbox(points);
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const radians = (angleDeg * Math.PI) / 180;
  const reach = Math.max(box.maxX - box.minX, box.maxY - box.minY, 20) / 2;
  const u = { x: Math.cos(radians), y: Math.sin(radians) };
  return {
    a: { x: centre.x - reach * u.x, y: centre.y - reach * u.y },
    b: { x: centre.x + reach * u.x, y: centre.y + reach * u.y },
  };
}

function grainOf(
  spec: PieceFuseSpec,
  source: FusingSourceSize,
  cut: readonly PtMm[],
): GrainFeature | null {
  if (spec.grain === 'any') return null;
  const sourceAngle = source.grain
    ? (Math.atan2(source.grain.b.y - source.grain.a.y, source.grain.b.x - source.grain.a.x) * 180) /
      Math.PI
    : 90;
  const angle =
    spec.grain === 'crosswise'
      ? sourceAngle + 90
      : spec.grain === 'bias'
        ? sourceAngle + 45
        : sourceAngle;
  const line = spec.grain === 'as_piece' && source.grain ? source.grain : axisThrough(cut, angle);
  const fitted = fitGrainInside(line.a, line.b, [cut], { minMm: 1 });
  if (!fitted) return null;
  const angleDeg = (Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI;
  return {
    kind: 'grain',
    origin: 'derived',
    ranges: [],
    confidence: 1,
    a: fitted[0],
    b: fitted[1],
    angleDeg,
    evidence: ['geometry'],
  };
}

function routeOf(piece: FusingSourcePiece, lines: readonly FusingBomLine[]): FusingBomLine | null {
  const key = piece.fuse?.bomLineKey?.trim();
  if (key) return lines.find((line) => line.bomLineKey === key) ?? null;
  return lines.length === 1 ? lines[0] : null;
}

const zoneKey = (identity: string, size: string) =>
  `${normBlock(identity).toLowerCase()}|${size.trim().toLowerCase()}`;

function mapPointBetweenOutlines(
  point: PtMm,
  from: ReturnType<typeof bbox>,
  to: ReturnType<typeof bbox>,
): PtMm {
  const fromWidth = from.maxX - from.minX;
  const fromHeight = from.maxY - from.minY;
  const toWidth = to.maxX - to.minX;
  const toHeight = to.maxY - to.minY;
  return {
    x: fromWidth > 0 ? to.minX + ((point.x - from.minX) / fromWidth) * toWidth : to.minX,
    y: fromHeight > 0 ? to.minY + ((point.y - from.minY) / fromHeight) * toHeight : to.minY,
  };
}

/** Vertices where the contour turns by more than this count as its corners. */
const CONTOUR_CORNER_DEG = 35;

type ContourRuns = { ring: PtMm[]; cum: number[]; corners: number[] };

function contourRuns(outline: readonly PtMm[]): ContourRuns {
  const ring = outline.filter(
    (p, i) =>
      Math.hypot(
        p.x - outline[(i + 1) % outline.length].x,
        p.y - outline[(i + 1) % outline.length].y,
      ) > 1e-6,
  );
  const n = ring.length;
  const cum = [0];
  for (let i = 1; i <= n; i++)
    cum.push(cum[i - 1] + Math.hypot(ring[i % n].x - ring[i - 1].x, ring[i % n].y - ring[i - 1].y));
  const corners: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n];
    const b = ring[i];
    const c = ring[(i + 1) % n];
    const t1 = Math.atan2(b.y - a.y, b.x - a.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if ((turn * 180) / Math.PI > CONTOUR_CORNER_DEG) corners.push(i);
  }
  return { ring, cum, corners };
}

function pointAtArc(c: ContourRuns, s: number): { p: PtMm; dir: number } {
  const total = c.cum[c.ring.length];
  const t = ((s % total) + total) % total;
  let i = 0;
  while (i < c.ring.length - 1 && c.cum[i + 1] < t) i++;
  const a = c.ring[i];
  const b = c.ring[(i + 1) % c.ring.length];
  const len = c.cum[i + 1] - c.cum[i];
  const f = len > 0 ? (t - c.cum[i]) / len : 0;
  return {
    p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
    dir: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** Nearest point of the ring stretch [s0, s1] (arc, cyclic), with its tangent direction. */
function projectOnRun(
  c: ContourRuns,
  q: PtMm,
  s0: number,
  s1: number,
): { p: PtMm; d: number; s: number; tx: number; ty: number } {
  const n = c.ring.length;
  const total = c.cum[n];
  const len = (((s1 - s0) % total) + total) % total || total;
  let best = { p: q, d: Infinity, s: s0, tx: 1, ty: 0 };
  for (let i = 0; i < n; i++) {
    const startArc = (((c.cum[i] - s0) % total) + total) % total;
    if (startArc >= len - 1e-9) continue;
    const a = c.ring[i];
    const b = c.ring[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ll = abx * abx + aby * aby;
    if (ll <= 0) continue;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / ll));
    const p = { x: a.x + abx * t, y: a.y + aby * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.d) {
      const l = Math.sqrt(ll);
      best = { p, d, s: c.cum[i] + l * t, tx: abx / l, ty: aby / l };
    }
  }
  return best;
}

/** Stretches this close to parallel cannot pin a point between them (one of them is used). */
const MIN_PIN_ANGLE_DEG = 30;

/**
 * Carries a point of the base contour's plane onto the target contour. The contour is cut into
 * stretches at its corners (corners matched across sizes by the grade's proportional position). A
 * point keeps its signed mm from its two nearest non-parallel stretches — a placket band keeps its
 * width off the front edge and its depth below the neck while the side seam grows. With one usable
 * stretch it keeps its mm off it at the same arc fraction. null when the corners do not match up.
 */
function contourCarrier(
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  from: ReturnType<typeof bbox>,
  to: ReturnType<typeof bbox>,
): ((point: PtMm) => PtMm) | null {
  const base = contourRuns(baseOutline);
  const target = contourRuns(targetOutline);
  if (base.ring.length < 3 || target.ring.length < 3 || base.corners.length < 2) return null;
  const matched = base.corners.map((i) => {
    const want = mapPointBetweenOutlines(base.ring[i], from, to);
    let best = -1;
    let bestD = Infinity;
    for (const j of target.corners) {
      const d = Math.hypot(target.ring[j].x - want.x, target.ring[j].y - want.y);
      if (d < bestD) [best, bestD] = [j, d];
    }
    return best;
  });
  // One-to-one, in the same cyclic order: otherwise the corners are not the same corners.
  if (new Set(matched).size !== matched.length || matched.some((j) => j < 0)) return null;
  const start = matched.indexOf(Math.min(...matched));
  for (let k = 1; k < matched.length; k++)
    if (matched[(start + k) % matched.length] <= matched[(start + k - 1) % matched.length])
      return null;
  const m = base.corners.length;
  const baseTotal = base.cum[base.ring.length];
  const targetTotal = target.cum[target.ring.length];
  const runs = base.corners.map((i, k) => ({
    b0: base.cum[i],
    b1: base.cum[base.corners[(k + 1) % m]],
    t0: target.cum[matched[k]],
    t1: target.cum[matched[(k + 1) % m]],
  }));
  const span = (s0: number, s1: number, total: number) =>
    (((s1 - s0) % total) + total) % total || total;
  return (point) => {
    const near = runs
      .map((run, k) => ({ k, run, pr: projectOnRun(base, point, run.b0, run.b1) }))
      .sort((x, y) => x.pr.d - y.pr.d);
    const first = near[0];
    const second = near
      .slice(1)
      .find(
        (x) =>
          Math.abs(first.pr.tx * x.pr.ty - first.pr.ty * x.pr.tx) >
          Math.sin((MIN_PIN_ANGLE_DEG * Math.PI) / 180),
      );
    const pins = [first, ...(second ? [second] : [])].map(({ run, pr }) => {
      const signed = pr.tx * (point.y - pr.p.y) - pr.ty * (point.x - pr.p.x);
      const along = (((pr.s - run.b0) % baseTotal) + baseTotal) % baseTotal;
      const frac = along / span(run.b0, run.b1, baseTotal);
      const length = span(run.t0, run.t1, targetTotal);
      const at = pointAtArc(target, run.t0 + frac * length);
      // The tangent comes from inside the pin's own stretch, as the re-anchoring below reads it. At a
      // stretch end the arc sits on a corner, and which side's segment it read there depended on
      // where the ring happens to start: the wrong side threw the point off the piece.
      const edge = Math.min(1e-3, length / 2);
      const inside = pointAtArc(
        target,
        run.t0 + Math.min(Math.max(frac * length, edge), length - edge),
      );
      return {
        run,
        signed,
        p: at.p,
        tx: Math.cos(inside.dir),
        ty: Math.sin(inside.dir),
      };
    });
    const offsetOf = (pin: (typeof pins)[number]) => ({
      x: pin.p.x - pin.ty * pin.signed,
      y: pin.p.y + pin.tx * pin.signed,
    });
    if (pins.length < 2) return offsetOf(pins[0]);
    let x = offsetOf(pins[0]);
    for (let iter = 0; iter < 4; iter++) {
      // tx·(X−P).y − ty·(X−P).x = signed, for both pins: a 2×2 linear system in X.
      const [a, b] = pins;
      const a11 = -a.ty;
      const a12 = a.tx;
      const c1 = a.signed + (-a.ty * a.p.x + a.tx * a.p.y);
      const a21 = -b.ty;
      const a22 = b.tx;
      const c2 = b.signed + (-b.ty * b.p.x + b.tx * b.p.y);
      const det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-9) break;
      x = { x: (c1 * a22 - a12 * c2) / det, y: (a11 * c2 - c1 * a21) / det };
      // Re-anchor each pin at X's nearest point of its target stretch (curved stretches).
      for (const pin of pins) {
        const pr = projectOnRun(target, x, pin.run.t0, pin.run.t1);
        pin.p = pr.p;
        pin.tx = pr.tx;
        pin.ty = pr.ty;
      }
    }
    return x;
  };
}

/**
 * Maps base-size markup onto one graded outline. Widths and insets remain physical millimetres;
 * positions follow the grade. Drawn zones use the two outlines' local frames, while strip trims
 * keep the same fraction of their selected edge run. A drawn zone's point keeps its mm from the cut
 * contour and, along it, from the nearer corner of that stretch (contourCarrier). A point on the
 * inset contour stays on it, so a contour-following side keeps following the contour in every size.
 */
export function mapFuseSpecToSize(
  source: PieceFuseSpec,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  seamAllowanceMm?: number | null,
): PieceFuseSpec {
  if (source.mode === 'zone' && source.zone && !('dxfPieceKey' in source.zone)) {
    const from = bbox(baseOutline);
    const to = bbox(targetOutline);
    let baseInset: PtMm[] | null = null;
    let targetInset: PtMm[] | null = null;
    try {
      baseInset = fuseInsetRingMm(baseOutline, source, seamAllowanceMm);
      targetInset = fuseInsetRingMm(targetOutline, source, seamAllowanceMm);
    } catch {
      // generateFuseGeometry owns the inset refusal; the cut contour stands in for it here.
    }
    // A zone point rides the cut contour: its nearest contour point keeps its mm from the nearer
    // corner of that run, and the point keeps its mm off the contour. A placket band so keeps its
    // width and its distance from the neck and the hem while the grade grows the piece around it.
    const carry = contourCarrier(baseOutline, targetOutline, from, to);
    const mapPoint = (point: PtMm, followContour: boolean): PtMm => {
      const moved = carry ? carry(point) : mapPointBetweenOutlines(point, from, to);
      const onContour =
        followContour &&
        baseInset &&
        targetInset &&
        projectOnRing(point, baseInset).d <= ZONE_ON_CONTOUR_MM;
      return onContour ? projectOnRing(moved, targetInset!).p : moved;
    };
    if ('rect' in source.zone) {
      const [ax, ay, bx, by] = source.zone.rect;
      const a = mapPoint({ x: ax, y: ay }, false);
      const b = mapPoint({ x: bx, y: by }, false);
      return { ...source, zone: { rect: [a.x, a.y, b.x, b.y] } };
    }
    const mapSpline = (spline: FuseSpline, followContour: boolean): FuseSpline => ({
      points: spline.points.map((point) => ({ ...point, ...mapPoint(point, followContour) })),
    });
    return {
      ...source,
      zone: {
        spline: mapSpline(source.zone.spline, true),
        islands: source.zone.islands.map((island) => mapSpline(island, true)),
        holes: source.zone.holes.map((hole) => mapSpline(hole, false)),
      },
    };
  }
  if (source.mode === 'strip' && source.edges.length > 0) {
    const from = edgeRunsOf(baseOutline);
    const to = edgeRunsOf(targetOutline);
    // generateFuseGeometry owns the topology refusal and its actionable error text.
    if (from.length !== to.length) return source;
    return {
      ...source,
      edges: source.edges.map((edge) => {
        const fromLength = from[edge.edge]?.length ?? 0;
        const ratio = fromLength > 0 ? (to[edge.edge]?.length ?? fromLength) / fromLength : 1;
        return { ...edge, startMm: edge.startMm * ratio, endMm: edge.endMm * ratio };
      }),
    };
  }
  return source;
}

/** Pure source-piece → one all-size DXF per used interlining BOM line. */
export function buildFusingSheets(input: BuildFusingSheetsInput): BuildFusingSheetsResult {
  const warnings: string[] = [];
  const skippedSizes: FusingSkippedSize[] = [];
  const byLine = new Map<string, FusingSourcePiece[]>();
  const validLines = input.bomLines.filter((line) => line.bomLineKey.trim());
  const zoneOutlines = new Map<string, PtMm[]>();
  for (const piece of input.pieces) {
    for (const size of piece.sizes)
      zoneOutlines.set(zoneKey(piece.identity, size.sizeToken), size.outline);
  }

  for (const piece of input.pieces) {
    if (!piece.fuse) continue;
    const line = routeOf(piece, validLines);
    if (!line) {
      warnings.push(
        `${piece.identity}: fused, interlining not chosen${piece.fuse.bomLineKey ? ` (${piece.fuse.bomLineKey} is not a live line)` : ''}`,
      );
      continue;
    }
    const list = byLine.get(line.bomLineKey) ?? [];
    list.push(piece);
    byLine.set(line.bomLineKey, list);
  }

  const sheets: GeneratedFusingSheet[] = [];
  for (const line of validLines) {
    const sources = byLine.get(line.bomLineKey) ?? [];
    if (!sources.length) continue;
    const pieceSpecs: PieceSpec[] = [];
    // A part's identity → the source piece it was cut from: the card links both blocks to it.
    const sourceOfPart = new Map<string, string>();
    let extraSeeds = 0;
    for (let pieceIndex = 0; pieceIndex < sources.length; pieceIndex++) {
      const sourcePiece = sources[pieceIndex];
      const fuse = sourcePiece.fuse!;
      const ordered = [...sourcePiece.sizes].sort((a, b) => a.rank - b.rank);
      const base = ordered.find((size) => size.sizeId === input.baseSizeId) ?? ordered[0] ?? null;
      if (!base) {
        warnings.push(`${sourcePiece.identity}: no source sizes`);
        continue;
      }
      // One list of sizes per separate part of the fuse: part 0 keeps the piece's own name, the
      // others are pieces of their own (`BP_PART1`), never a loop drawn inside part 0's cut.
      const partSizes: PieceSizeSpec[][] = [];
      const partCounts = new Set<number>();
      for (const sourceSize of ordered) {
        try {
          const sizedFuse = mapFuseSpecToSize(
            fuse,
            base.outline,
            sourceSize.outline,
            sourcePiece.seamAllowanceMm,
          );
          const reference =
            fuse.zone && 'dxfPieceKey' in fuse.zone
              ? zoneOutlines.get(zoneKey(fuse.zone.dxfPieceKey, sourceSize.sizeToken)) ??
                zoneOutlines.get(zoneKey(fuse.zone.dxfPieceKey, ''))
              : undefined;
          const polygons = generateFuseGeometry({
            outline: sourceSize.outline,
            netOutline: sourceSize.netOutline,
            spec: sizedFuse,
            seamAllowanceMm: sourcePiece.seamAllowanceMm,
            darts: sourceSize.darts,
            zoneOutline: reference,
            expectedEdgeCount:
              fuse.mode === 'strip' && !(fuse.widthMm == null && fuse.edges.length === 0)
                ? edgeRunsOf(base.outline).length
                : undefined,
          });
          const parts = fuseParts(polygons, sizedFuse.zone);
          partCounts.add(parts.length);
          parts.forEach((part, index) => {
            const cut = part.outer;
            (partSizes[index] ??= []).push({
              rank: sourceSize.rank,
              sizeToken: sourceSize.sizeToken,
              sizeId: sourceSize.sizeId,
              cut,
              cutLoops: part.holes,
              seam: null,
              grain: grainOf(fuse, sourceSize, cut),
              notches: [],
              drills: [],
              internal: [],
              fold: null,
              offset: null,
              walls: [],
              bbox: bbox(cut),
              areaMm2: fuseAreaMm2([part]),
            });
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          skippedSizes.push({ piece: sourcePiece.identity, size: sourceSize.sizeToken, reason });
          warnings.push(`${sourcePiece.identity}_${sourceSize.sizeToken}: ${reason}`);
        }
      }
      if (partCounts.size > 1)
        warnings.push(`${sourcePiece.identity}: fuse parts differ across sizes`);
      partSizes.forEach((sizes, index) => {
        if (!sizes?.length) return;
        const identity =
          index === 0 ? sourcePiece.identity : `${sourcePiece.identity}_PART${index}`;
        sourceOfPart.set(normBlock(identity).toLowerCase(), sourcePiece.identity);
        pieceSpecs.push({
          identity,
          code: identity,
          mods: [],
          displayName:
            index === 0 ? sourcePiece.displayName : `${sourcePiece.displayName} part ${index}`,
          nameOrigin: 'operator',
          seed: index === 0 ? pieceIndex : sources.length + extraSeeds++,
          variant: null,
          pairHand: null,
          pairOf: null,
          unfoldedFold: false,
          piecesPerGarment: sourcePiece.piecesPerGarment,
          allowance: { meaning: 'cut', allowanceMm: 0, origin: 'operator', evidence: [] },
          fabrics: [line.bomLineKey],
          fused: true,
          // A stale card checkbox must not collapse a real source grade to the base contour. The
          // writer emits only one `_UNI` block for an ungraded spec, so five parsed garment outlines
          // otherwise became the reported one-block / not-graded generated sheet. A genuinely
          // ungraded source still has one outline and keeps its UNI contract.
          ungraded: sourcePiece.ungraded && sizes.length === 1,
          sizes,
        });
      });
    }
    if (!pieceSpecs.length) continue;
    const scope: DraftScopeTarget = {
      scopeKey: line.bomLineKey,
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_UNSET',
      bomLineKey: line.bomLineKey,
      label: line.label || line.code,
      isInterlining: true,
      sections: ['TECH_CARD_BOM_SECTION_INTERLINING'],
    };
    const sizes: ManifestSize[] = [
      ...new Map(
        pieceSpecs.flatMap((piece) =>
          piece.sizes.map((size) => [size.sizeToken.toLowerCase(), size] as const),
        ),
      ).values(),
    ]
      .sort((a, b) => a.rank - b.rank)
      .map((size) => ({
        token: size.sizeToken,
        sizeId: size.sizeId,
        name: size.sizeToken,
        sourceLabel: size.sizeToken,
        rank: size.rank,
      }));
    const [written] = writeScopes(
      {
        techCardId: input.techCardId,
        scopes: [scope],
        pieces: pieceSpecs,
        sizes,
        source: SOURCE,
        generator: 'grbpwr/fusing-dxf',
        dialect: 'r12',
      },
      { embed: null, now: () => fusingSheetStamp(input.createdAt) },
    );
    warnings.push(
      ...written.detail.warnings.filter(
        (warning) => !warning.includes('no seam line') && !warning.includes('no grain line'),
      ),
    );
    sheets.push({
      bomLineKey: line.bomLineKey,
      filename: fusingSheetFilename(input.style, line.code),
      dxfText: markGeneratedFusing(written.detail.bareText),
      blocks: written.detail.plan.blocks.map((block) => block.name),
      aliases: [...aliasNames(written.detail.manifest)].map(([identity, blockName]) => ({
        identity: sourceOfPart.get(normBlock(identity).toLowerCase()) ?? identity,
        blockName,
      })),
    });
  }
  return { sheets, warnings, skippedSizes };
}
