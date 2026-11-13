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
import { clampStripTrims, edgeRunsOf, pairEdgeRuns } from './edge-runs';
import {
  fuseAreaMm2,
  fuseInsetRingMm,
  fuseParts,
  generateFuseGeometry,
  pointInRing,
  signedArea,
} from './geometry';
import { ZONE_ON_CONTOUR_MM, flattenSpline, projectOnRing } from './spline';
import { followLineMove } from './follow-line';
import { carryStripEnd } from './strip-ends';
import type { FuseEdge, FuseSpline, PieceFuseSpec } from './types';
import { zoneGrade } from './zone-grade';

export type FusingBomLine = {
  bomLineKey: string;
  code: string;
  label: string;
};

/**
 * One internal pattern line of a size (welt, fold, dart leg, notch, drill), piece-local mm, in the
 * file's own vertex order. Never the cut or the sewing contour.
 */
export type FuseInternalLine = { layer: string; closed: boolean; points: PtMm[] };

/** The internal lines of the two outlines a size mapping runs between. */
export type FuseInternals = {
  base: readonly FuseInternalLine[];
  target: readonly FuseInternalLine[];
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
  /** Internal lines in the outline's frame: a drawn zone rides them between sizes. */
  internals?: FuseInternalLine[];
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

/**
 * A ring clear of the contour by RIGID_AT_MM or more is a free patch and moves whole; one within
 * RIGID_FROM_MM of it moves point by point; mixed in between. A band drawn a few mm inside the edge
 * (a placket, a cuff) is attached to it; a patch a centimetre clear of every edge is free.
 */
const RIGID_FROM_MM = 6;
const RIGID_AT_MM = 10;
/** A point this close to the inset contour lands exactly on the size's inset contour. */
const ZONE_SNAP_MM = 0.25;
/** A mapped rect whose corners stay this square is still a rect. */
const RECT_SQUARE_MM = 0.05;

/** 0 at or below `from`, 1 at or above `to`, smooth in between. */
function smoothstep(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** Two closed polygons' sides cross somewhere other than at a shared vertex. */
function selfCrossing(ring: readonly PtMm[]): boolean {
  const n = ring.length;
  const side = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  return false;
}

/**
 * Maps base-size markup onto one graded outline. Widths and insets remain physical millimetres;
 * positions follow the grade. Strip trims keep their mm from the paired run's corners, shrunk
 * only when a shorter run cannot hold them (clampStripTrims).
 *
 * A drawn zone (zone-grade.ts `follow`): a point near the contour keeps its mm from it and from the
 * nearer corner of its stretch (the carrier), fully up to 50 mm in, so a band keeps its width; a
 * point deep inside follows the grade field (the matched contour, corrected by the paired internal
 * lines), and a point nearer to a paired internal line than to the contour follows the line. A
 * point on the inset contour stays on it. Everything blends smoothly; nothing jumps at a distance.
 *
 * Rigid or pointwise: a ring that keeps RIGID_AT_MM or more from the contour moves whole, by one
 * translation (a patch round a welt pocket is the same patch in every size); a ring that comes
 * within RIGID_FROM_MM of it moves point by point; in between the two are mixed by the ring's
 * nearest distance to the contour, so a ring at 9.9 or 10.1 mm gives the same shape. A hole
 * follows the ring it sits in. A mapped ring that folds over (its orientation flips, it crosses
 * itself, it collapses) is moved whole instead.
 *
 * A rect zone goes the same way by its four corners and stays a rect while they stay square (a
 * detached rect always does); otherwise it is returned as a four-corner spline.
 * `internals` are the two outlines' internal lines; without them the contour alone leads.
 */
export function mapFuseSpecToSize(
  source: PieceFuseSpec,
  baseOutline: readonly PtMm[],
  targetOutline: readonly PtMm[],
  seamAllowanceMm?: number | null,
  internals?: FuseInternals | null,
  /**
   * Told when a ring's line or a strip end's notch is not found on the target size: that markup
   * then goes the default way (built by guess), and the sheet is still built.
   */
  onGuess?: (what: 'line' | 'notch') => void,
): PieceFuseSpec {
  if (source.mode === 'zone' && source.zone && !('dxfPieceKey' in source.zone)) {
    let baseInset: PtMm[] | null = null;
    let targetInset: PtMm[] | null = null;
    try {
      baseInset = fuseInsetRingMm(baseOutline, source, seamAllowanceMm);
      targetInset = fuseInsetRingMm(targetOutline, source, seamAllowanceMm);
    } catch {
      // generateFuseGeometry owns the inset refusal; the cut contour stands in for it here.
    }
    const grade = zoneGrade(baseOutline, targetOutline, internals);
    /** mm from the nearer of the cut and the inset contour. */
    const offContour = (point: PtMm) =>
      Math.min(
        projectOnRing(point, baseOutline).d,
        baseInset ? projectOnRing(point, baseInset).d : Infinity,
      );
    const pointwise = (point: PtMm, followContour: boolean): PtMm => {
      const carried = grade.follow(point);
      if (!followContour || !baseInset || !targetInset) return carried;
      // A point on the inset contour stays on it (fully up to ZONE_SNAP_MM, which covers the 0.1 mm
      // rounding of stored points); the pull fades to nothing at ZONE_ON_CONTOUR_MM, so the point
      // does not snap as it crosses that distance.
      const was = projectOnRing(point, baseInset).d;
      const pull = 1 - smoothstep(ZONE_SNAP_MM, ZONE_ON_CONTOUR_MM, was);
      if (pull <= 0) return carried;
      const onto = projectOnRing(carried, targetInset).p;
      return {
        x: onto.x + (carried.x - onto.x) * (1 - pull),
        y: onto.y + (carried.y - onto.y) * (1 - pull),
      };
    };
    type Carried = {
      spline: FuseSpline;
      ring: PtMm[];
      rigid: number;
      shift: PtMm | null;
      /** Set by a ring with a carry-over mode of its own: its holes go the same way. */
      by?: (point: PtMm) => PtMm;
    };
    /** rigid: 1 = moved whole by `shift`, 0 = point by point. */
    const mapRing = (
      spline: FuseSpline,
      followContour: boolean,
      parent: Carried | null = null,
    ): Carried => {
      const ring = flattenSpline(spline.points);
      // A ring with a mode of its own, or a default hole inside one, goes that way and no other.
      const followed =
        spline.gradeMode === 'follow_line' && spline.anchor
          ? followLineMove(spline.anchor, grade.linePair(spline.anchor))
          : null;
      if (spline.gradeMode === 'follow_line' && !followed) onGuess?.('line');
      const by =
        spline.gradeMode === 'grow'
          ? grade.point
          : followed
            ? followed
            : !spline.gradeMode && parent?.by
              ? parent.by
              : null;
      if (by)
        return {
          spline: {
            ...spline,
            points: spline.points.map((point) => ({ ...point, ...by(point) })),
            ...(spline.anchor ? { anchor: by(spline.anchor) } : {}),
          },
          ring,
          rigid: 0,
          shift: null,
          by,
        };
      let off = Infinity;
      for (const point of [...spline.points, ...ring]) off = Math.min(off, offContour(point));
      const own = smoothstep(RIGID_FROM_MM, RIGID_AT_MM, off);
      const shift = own > 0 ? grade.shift(ring) : null;
      // A follow_line ring whose line has no twin lands here: its anchor goes as a point of the
      // ring, so the stored anchor stays with the ring on this size and the way back starts there.
      const n = spline.points.length;
      const carried = spline.anchor ? [...spline.points, spline.anchor] : spline.points;
      const whole = (by: PtMm) => carried.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));
      let moved: PtMm[] =
        own >= 1 && shift
          ? whole(shift)
          : carried.map((point) => {
              const loose = pointwise(point, followContour);
              return shift
                ? {
                    x: loose.x + (point.x + shift.x - loose.x) * own,
                    y: loose.y + (point.y + shift.y - loose.y) * own,
                  }
                : loose;
            });
      // Fold-over: the control polygon must keep its orientation, a fair share of its area, and
      // not start crossing itself; otherwise the ring is moved whole.
      const before = signedArea(spline.points);
      const after = signedArea(moved.slice(0, n));
      if (
        own < 1 &&
        spline.points.length >= 3 &&
        Math.abs(before) > 1e-6 &&
        (after * before <= 0 ||
          Math.abs(after) < Math.abs(before) / 4 ||
          (!selfCrossing(spline.points) && selfCrossing(moved.slice(0, n))))
      )
        moved = whole(shift ?? grade.shift(ring));
      // A hole inside a ring that moved whole moves with it, so it stays where it was cut.
      if (parent?.shift && parent.rigid > 0) {
        const by = parent.shift;
        moved = moved.map((p, i) => ({
          x: p.x + (carried[i].x + by.x - p.x) * parent.rigid,
          y: p.y + (carried[i].y + by.y - p.y) * parent.rigid,
        }));
      }
      return {
        spline: {
          ...spline,
          points: spline.points.map((point, i) => ({ ...point, ...moved[i] })),
          ...(spline.anchor ? { anchor: moved[n] } : {}),
        },
        ring,
        rigid: own,
        shift,
      };
    };
    if ('rect' in source.zone) {
      const [ax, ay, bx, by] = source.zone.rect;
      const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
      const [y0, y1] = [Math.min(ay, by), Math.max(ay, by)];
      const corners = mapRing(
        {
          points: [
            { x: x0, y: y0, corner: true },
            { x: x1, y: y0, corner: true },
            { x: x1, y: y1, corner: true },
            { x: x0, y: y1, corner: true },
          ],
        },
        false,
      ).spline;
      const [a, b, c, d] = corners.points;
      const square =
        Math.max(
          Math.abs(a.y - b.y),
          Math.abs(b.x - c.x),
          Math.abs(c.y - d.y),
          Math.abs(d.x - a.x),
        ) <= RECT_SQUARE_MM;
      return square
        ? { ...source, zone: { rect: [a.x, a.y, c.x, c.y] } }
        : { ...source, zone: { spline: corners, holes: [], islands: [] } };
    }
    const outers = [source.zone.spline, ...source.zone.islands].map((spline) =>
      mapRing(spline, true),
    );
    return {
      ...source,
      zone: {
        spline: outers[0].spline,
        islands: outers.slice(1).map((outer) => outer.spline),
        holes: source.zone.holes.map((hole) => {
          const first = hole.points[0];
          const parent = first
            ? outers.find(
                (outer) => (outer.rigid > 0 || outer.by) && pointInRing(first, outer.ring),
              )
            : undefined;
          return mapRing(hole, false, parent ?? null).spline;
        }),
      },
    };
  }
  if (source.mode === 'strip' && source.edges.length > 0) {
    // Runs are paired by geometry: the index of a run depends on where each size's ring starts.
    const pairing = pairEdgeRuns(baseOutline, targetOutline);
    // generateFuseGeometry owns the topology refusal and its actionable error text.
    if (!pairing) return source;
    const to = edgeRunsOf(targetOutline);
    const from = edgeRunsOf(baseOutline);
    return {
      ...source,
      edges: source.edges
        .map((edge) => {
          const target = pairing.target[edge.edge];
          if (target == null) return edge;
          const baseRun = from[edge.edge];
          const run = to[target];
          // An end's trim on this size; absent mode = the same mm from the run's corner (FuseEdge).
          const pair = {
            baseRun,
            run,
            reversed: pairing.reversed,
            baseLines: internals?.base ?? [],
            lines: internals?.target ?? [],
          };
          const carried = (mm: number, mode: FuseEdge['startMode'], atStart: boolean): number => {
            if (!baseRun) return mm;
            const end = carryStripEnd(mm, mode, atStart, pair);
            if (end.guessed) onGuess?.('notch');
            return end.mm;
          };
          const start = carried(edge.startMm, edge.startMode, true);
          const end = carried(edge.endMm, edge.endMode, false);
          const [startMm, endMm] = clampStripTrims(
            run.length,
            pairing.reversed ? end : start,
            pairing.reversed ? start : end,
          );
          const next: FuseEdge = { edge: target, startMm, endMm };
          const [startMode, endMode] = pairing.reversed
            ? [edge.endMode, edge.startMode]
            : [edge.startMode, edge.endMode];
          if (startMode) next.startMode = startMode;
          if (endMode) next.endMode = endMode;
          return next;
        })
        .sort((a, b) => a.edge - b.edge),
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
        const guessed = new Set<'line' | 'notch'>();
        try {
          const sizedFuse = mapFuseSpecToSize(
            fuse,
            base.outline,
            sourceSize.outline,
            sourcePiece.seamAllowanceMm,
            { base: base.internals ?? [], target: sourceSize.internals ?? [] },
            (what) => guessed.add(what),
          );
          for (const what of guessed)
            warnings.push(
              `${sourcePiece.identity}_${sourceSize.sizeToken}: ${what} not found, built by guess`,
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
