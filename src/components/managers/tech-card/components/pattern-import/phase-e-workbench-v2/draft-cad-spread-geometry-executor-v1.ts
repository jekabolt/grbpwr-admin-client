import type { PieceSizeSpec, PieceSpec, PtMm, WriteJob } from 'lib/pattern-import/types';

import { executePatternImportDxfPhaseEDraftCadCutGeometryV1 } from './draft-cad-cut-geometry-executor-v1';
import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SPREAD_GEOMETRY_EXECUTOR_V1 =
  'pattern-import-dxf-phase-e-draft-cad-spread-geometry-executor/1' as const;

type CutCommand = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'cut' }>;
type SpreadCommand = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'spread' }>;

export type PatternImportDxfPhaseEDraftCadSpreadGeometryBlockerCodeV1 =
  | 'invalid-input'
  | 'piece-unavailable'
  | 'cut-geometry-blocked'
  | 'invalid-pivot'
  | 'invalid-amount'
  | 'spread-direction-ambiguous'
  | 'spread-overlap';

export type PatternImportDxfPhaseEDraftCadSpreadGeometryResultV1 =
  | Readonly<{
      ok: true;
      job: WriteJob;
      sourcePieceIdentity: string;
      derivedPieceIdentities: readonly [string, string];
      rotationDegBySize: Readonly<Record<string, number>>;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      job: null;
      sourcePieceIdentity: string | null;
      derivedPieceIdentities: null;
      rotationDegBySize: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEDraftCadSpreadGeometryBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_SPREAD_GEOMETRY_CLAIMS_V1 = Object.freeze({
  sessionLocal: true,
  retainedPieceSpecWriterReused: true,
  sourceJobMutated: false,
  slashGuideMustSplitExactly: true,
  pivotMustBeOneExactSlashEndpoint: true,
  exactlyTwoDerivedPanels: true,
  allSizesMustSpreadExactly: true,
  movedPanelIsRigid: true,
  stableDerivedIdentity: true,
  ambiguousOrOverlappingSpreadFailsClosed: true,
  persistenceIntegrated: false,
} as const);

const EPS = 1e-7;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseEDraftCadSpreadGeometryBlockerCodeV1,
  detail: string,
  sourcePieceIdentity: string | null = null,
): PatternImportDxfPhaseEDraftCadSpreadGeometryResultV1 {
  return deepFreeze({
    ok: false as const,
    job: null,
    sourcePieceIdentity,
    derivedPieceIdentities: null,
    rotationDegBySize: null,
    blockers: [{ code, detail }] as const,
  });
}

function finitePoint(point: PtMm): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function samePoint(left: PtMm, right: PtMm): boolean {
  return Math.abs(left.x - right.x) <= EPS && Math.abs(left.y - right.y) <= EPS;
}

function subtract(left: PtMm, right: PtMm): PtMm {
  return { x: left.x - right.x, y: left.y - right.y };
}

function cross(left: PtMm, right: PtMm): number {
  return left.x * right.y - left.y * right.x;
}

function pointOnSegment(point: PtMm, from: PtMm, to: PtMm): boolean {
  if (Math.abs(cross(subtract(point, from), subtract(to, from))) > EPS) return false;
  return (
    point.x >= Math.min(from.x, to.x) - EPS &&
    point.x <= Math.max(from.x, to.x) + EPS &&
    point.y >= Math.min(from.y, to.y) - EPS &&
    point.y <= Math.max(from.y, to.y) + EPS
  );
}

function pointLocation(point: PtMm, polygon: readonly PtMm[]): -1 | 0 | 1 {
  for (let index = 0; index < polygon.length; index += 1) {
    if (pointOnSegment(point, polygon[index]!, polygon[(index + 1) % polygon.length]!)) return 0;
  }
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    if (
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x
    )
      inside = !inside;
  }
  return inside ? 1 : -1;
}

function segmentsIntersect(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const ab = subtract(b, a);
  const cd = subtract(d, c);
  const denominator = cross(ab, cd);
  const ca = subtract(c, a);
  if (Math.abs(denominator) <= EPS)
    return (
      pointOnSegment(a, c, d) ||
      pointOnSegment(b, c, d) ||
      pointOnSegment(c, a, b) ||
      pointOnSegment(d, a, b)
    );
  const t = cross(ca, cd) / denominator;
  const u = cross(ca, ab) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
}

function rotatePoint(point: PtMm, pivot: PtMm, radians: number): PtMm {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

function uniqueSharedPoints(left: readonly PtMm[], right: readonly PtMm[]): readonly PtMm[] {
  const shared: PtMm[] = [];
  for (const point of left) {
    if (!right.some((candidate) => samePoint(point, candidate))) continue;
    if (!shared.some((candidate) => samePoint(point, candidate))) shared.push({ ...point });
  }
  return shared;
}

function polygonsOverlapBeyondPivot(
  stationary: readonly PtMm[],
  moved: readonly PtMm[],
  pivot: PtMm,
): boolean {
  if (
    moved.some((point) => !samePoint(point, pivot) && pointLocation(point, stationary) >= 0) ||
    stationary.some((point) => !samePoint(point, pivot) && pointLocation(point, moved) >= 0)
  )
    return true;
  for (let left = 0; left < stationary.length; left += 1) {
    const a = stationary[left]!;
    const b = stationary[(left + 1) % stationary.length]!;
    for (let right = 0; right < moved.length; right += 1) {
      const c = moved[right]!;
      const d = moved[(right + 1) % moved.length]!;
      if (!segmentsIntersect(a, b, c, d)) continue;
      const stationaryTouchesPivot = samePoint(a, pivot) || samePoint(b, pivot);
      const movedTouchesPivot = samePoint(c, pivot) || samePoint(d, pivot);
      if (stationaryTouchesPivot && movedTouchesPivot) continue;
      return true;
    }
  }
  return false;
}

function bbox(points: readonly PtMm[]) {
  return {
    minX: Math.min(...points.map(({ x }) => x)),
    minY: Math.min(...points.map(({ y }) => y)),
    maxX: Math.max(...points.map(({ x }) => x)),
    maxY: Math.max(...points.map(({ y }) => y)),
  };
}

function rotateSize(size: PieceSizeSpec, pivot: PtMm, radians: number): PieceSizeSpec {
  const point = (value: PtMm) => rotatePoint(value, pivot, radians);
  const cut = size.cut.map(point);
  const output = structuredClone(size);
  output.cut = cut;
  if (size.cutLoops?.length) output.cutLoops = size.cutLoops.map((loop) => loop.map(point));
  output.seam = size.seam?.map(point) ?? null;
  output.notches = size.notches.map((feature) => ({
    ...structuredClone(feature),
    at: point(feature.at),
    seg: [point(feature.seg[0]), point(feature.seg[1])],
  }));
  output.drills = size.drills.map((feature) => ({
    ...structuredClone(feature),
    at: point(feature.at),
  }));
  if (size.textMarks?.length)
    output.textMarks = size.textMarks.map((mark) => ({ ...mark, at: point(mark.at) }));
  if (size.pointMarks?.length)
    output.pointMarks = size.pointMarks.map((mark) => ({ ...mark, at: point(mark.at) }));
  output.internal = size.internal.map((feature) => ({
    ...structuredClone(feature),
    pts: feature.pts.map(point),
  }));
  output.grain = size.grain
    ? {
        ...structuredClone(size.grain),
        a: point(size.grain.a),
        b: point(size.grain.b),
        angleDeg:
          (Math.atan2(
            point(size.grain.b).y - point(size.grain.a).y,
            point(size.grain.b).x - point(size.grain.a).x,
          ) *
            180) /
          Math.PI,
      }
    : null;
  output.fold = size.fold
    ? { ...structuredClone(size.fold), a: point(size.fold.a), b: point(size.fold.b) }
    : null;
  output.bbox = bbox(cut);
  return output;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function normalizedPoint(point: PtMm): readonly [number, number] {
  return [Object.is(point.x, -0) ? 0 : point.x, Object.is(point.y, -0) ? 0 : point.y];
}

function normalizedCut(points: readonly PtMm[]) {
  const direct = points.map(normalizedPoint);
  const reverse = [...direct].reverse();
  return JSON.stringify(direct) <= JSON.stringify(reverse) ? direct : reverse;
}

function derivedIdentity(
  source: PieceSpec,
  cut: CutCommand,
  spread: SpreadCommand,
): readonly [string, string] {
  const fingerprint = fnv1a64(
    JSON.stringify({
      source: source.identity,
      line: spread.target.pieceLineKey,
      cut: normalizedCut(cut.payload.pointsMm),
      pivot: normalizedPoint(spread.payload.pivotMm),
      amountMm: spread.payload.amountMm,
    }),
  )
    .slice(0, 10)
    .toUpperCase();
  const stem = `S${fingerprint}`;
  return [`${stem}A`, `${stem}B`];
}

/**
 * Executes a minimal lossless slash-and-spread as two retained PieceSpec panels. The Cut command is
 * the slash guide. Its pivot must be one exact guide endpoint on every size. Panel B is rotated
 * rigidly away from panel A until the other slash endpoint moves by amountMm. The panels deliberately
 * stay separate: merging a wedge into one contour would require a new topology/document authority.
 */
export function executePatternImportDxfPhaseEDraftCadSpreadGeometryV1(
  sourceJob: WriteJob,
  cut: CutCommand,
  spread: SpreadCommand,
): PatternImportDxfPhaseEDraftCadSpreadGeometryResultV1 {
  if (
    !cut ||
    cut.tool !== 'cut' ||
    cut.payload.keepSide !== 'both' ||
    cut.payload.pointsMm.length !== 2 ||
    !spread ||
    spread.tool !== 'spread' ||
    spread.payload.cutLineEntityId !== cut.payload.entityId ||
    spread.target.pieceId !== cut.target.pieceId ||
    spread.target.pieceLineKey !== cut.target.pieceLineKey ||
    !finitePoint(spread.payload.pivotMm)
  )
    return blocked(
      'invalid-input',
      'Spread requires one exact same-piece Cut guide referenced by entity id.',
      spread?.target?.pieceId ?? null,
    );
  if (!Number.isFinite(spread.payload.amountMm) || spread.payload.amountMm <= EPS)
    return blocked(
      'invalid-amount',
      'Spread amount must be a finite positive millimetre distance.',
      spread.target.pieceId,
    );

  const sourceMatches = sourceJob.pieces.filter(
    ({ identity }) => identity === spread.target.pieceId,
  );
  if (sourceMatches.length !== 1)
    return blocked(
      'piece-unavailable',
      `Spread target ${spread.target.pieceId} must resolve to one retained PieceSpec.`,
      spread.target.pieceId,
    );
  const source = sourceMatches[0]!;
  const split = executePatternImportDxfPhaseEDraftCadCutGeometryV1(sourceJob, cut);
  if (!split.ok)
    return blocked(
      'cut-geometry-blocked',
      `${split.blockers[0].code}: ${split.blockers[0].detail}`,
      source.identity,
    );

  const job = structuredClone(split.job);
  const panels = split.derivedPieceIdentities.map((identity) =>
    job.pieces.find((piece) => piece.identity === identity),
  );
  const stationaryPanel = panels[0];
  const movingPanel = panels[1];
  if (!stationaryPanel || !movingPanel)
    return blocked(
      'piece-unavailable',
      'Cut executor did not return both exact retained panels.',
      source.identity,
    );

  const rotationDegBySize: Record<string, number> = {};
  for (const stationarySize of stationaryPanel.sizes) {
    const movingSizes = movingPanel.sizes.filter(
      ({ sizeToken }) => sizeToken === stationarySize.sizeToken,
    );
    if (movingSizes.length !== 1)
      return blocked(
        'piece-unavailable',
        `Spread size ${stationarySize.sizeToken} does not resolve on both panels.`,
        source.identity,
      );
    const movingSize = movingSizes[0]!;
    const shared = uniqueSharedPoints(stationarySize.cut, movingSize.cut);
    if (shared.length !== 2)
      return blocked(
        'invalid-pivot',
        `Spread size ${stationarySize.sizeToken} does not expose exactly two slash endpoints.`,
        source.identity,
      );
    const pivotMatches = shared.filter((point) => samePoint(point, spread.payload.pivotMm));
    if (pivotMatches.length !== 1)
      return blocked(
        'invalid-pivot',
        `Spread pivot must exact-match one slash endpoint in every size; ${stationarySize.sizeToken} does not.`,
        source.identity,
      );
    const pivot = pivotMatches[0]!;
    const freeEndpoint = shared.find((point) => !samePoint(point, pivot))!;
    const radius = Math.hypot(freeEndpoint.x - pivot.x, freeEndpoint.y - pivot.y);
    if (!(radius > EPS) || spread.payload.amountMm >= 2 * radius - EPS)
      return blocked(
        'invalid-amount',
        `Spread amount must be smaller than twice the slash span in size ${stationarySize.sizeToken}.`,
        source.identity,
      );
    const angle = 2 * Math.asin(spread.payload.amountMm / (2 * radius));
    const candidates = [angle, -angle].filter((radians) => {
      const moved = movingSize.cut.map((point) => rotatePoint(point, pivot, radians));
      return !polygonsOverlapBeyondPivot(stationarySize.cut, moved, pivot);
    });
    if (candidates.length !== 1)
      return blocked(
        candidates.length ? 'spread-direction-ambiguous' : 'spread-overlap',
        candidates.length
          ? `Both spread directions remain valid in size ${stationarySize.sizeToken}; side selection is ambiguous.`
          : `Neither spread direction separates the panels in size ${stationarySize.sizeToken}.`,
        source.identity,
      );
    const radians = candidates[0]!;
    const movedFreeEndpoint = rotatePoint(freeEndpoint, pivot, radians);
    const actualAmount = Math.hypot(
      movedFreeEndpoint.x - freeEndpoint.x,
      movedFreeEndpoint.y - freeEndpoint.y,
    );
    if (Math.abs(actualAmount - spread.payload.amountMm) > EPS)
      return blocked(
        'invalid-amount',
        `Spread amount could not be reproduced exactly in size ${stationarySize.sizeToken}.`,
        source.identity,
      );
    const moved = rotateSize(movingSize, pivot, radians);
    const index = movingPanel.sizes.findIndex(
      ({ sizeToken }) => sizeToken === movingSize.sizeToken,
    );
    movingPanel.sizes[index] = moved;
    rotationDegBySize[movingSize.sizeToken] = (radians * 180) / Math.PI;
  }
  if (Object.keys(rotationDegBySize).length !== movingPanel.sizes.length)
    return blocked(
      'piece-unavailable',
      'Spread could not exact-match every retained size on both panels.',
      source.identity,
    );

  const identities = derivedIdentity(source, cut, spread);
  if (
    job.pieces.some(
      (piece) =>
        !split.derivedPieceIdentities.includes(
          piece.identity as (typeof split.derivedPieceIdentities)[number],
        ) && identities.includes(piece.identity as (typeof identities)[number]),
    )
  )
    return blocked(
      'piece-unavailable',
      'Derived Spread identities collide with retained PieceSpec identities.',
      source.identity,
    );
  [stationaryPanel, movingPanel].forEach((panel, index) => {
    panel.identity = identities[index]!;
    panel.code = `${source.code}_SPREAD`;
    panel.mods = [...source.mods, index === 0 ? 'A' : 'B'];
    panel.displayName = `${source.displayName} · spread ${index === 0 ? 'A' : 'B'}`;
  });

  return deepFreeze({
    ok: true as const,
    job,
    sourcePieceIdentity: source.identity,
    derivedPieceIdentities: identities,
    rotationDegBySize,
    blockers: [] as const,
  });
}
