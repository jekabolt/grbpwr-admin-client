import type { PieceSizeSpec, PieceSpec, PtMm, WriteJob } from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_CUT_GEOMETRY_EXECUTOR_V1 =
  'pattern-import-dxf-phase-e-draft-cad-cut-geometry-executor/1' as const;

type CutCommand = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'cut' }>;

export type PatternImportDxfPhaseEDraftCadCutGeometryBlockerCodeV1 =
  | 'invalid-input'
  | 'piece-unavailable'
  | 'unsupported-piece-geometry'
  | 'self-intersecting-boundary'
  | 'cut-intersection-ambiguous'
  | 'cut-tangent-or-degenerate'
  | 'feature-partition-ambiguous';

export type PatternImportDxfPhaseEDraftCadCutGeometryResultV1 =
  | Readonly<{
      ok: true;
      job: WriteJob;
      sourcePieceIdentity: string;
      derivedPieceIdentities: readonly [string, string];
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      job: null;
      sourcePieceIdentity: string | null;
      derivedPieceIdentities: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEDraftCadCutGeometryBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_CUT_GEOMETRY_CLAIMS_V1 = Object.freeze({
  sessionLocal: true,
  retainedPieceSpecWriterReused: true,
  sourceJobMutated: false,
  exactlyTwoDerivedPieces: true,
  allSizesMustSplitExactly: true,
  stableDerivedIdentity: true,
  ambiguousFeaturePartitionFailsClosed: true,
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
  code: PatternImportDxfPhaseEDraftCadCutGeometryBlockerCodeV1,
  detail: string,
  sourcePieceIdentity: string | null = null,
): PatternImportDxfPhaseEDraftCadCutGeometryResultV1 {
  return deepFreeze({
    ok: false as const,
    job: null,
    sourcePieceIdentity,
    derivedPieceIdentities: null,
    blockers: [{ code, detail }] as const,
  });
}

function finitePoint(point: PtMm): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function samePoint(left: PtMm, right: PtMm): boolean {
  return Math.abs(left.x - right.x) <= EPS && Math.abs(left.y - right.y) <= EPS;
}

function cross(a: PtMm, b: PtMm): number {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: PtMm, b: PtMm): PtMm {
  return { x: a.x - b.x, y: a.y - b.y };
}

function areaSigned(points: readonly PtMm[]): number {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function pointOnSegment(point: PtMm, from: PtMm, to: PtMm): boolean {
  const line = cross(subtract(point, from), subtract(to, from));
  if (Math.abs(line) > EPS) return false;
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

function selfIntersects(polygon: readonly PtMm[]): boolean {
  for (let left = 0; left < polygon.length; left += 1) {
    const leftNext = (left + 1) % polygon.length;
    for (let right = left + 1; right < polygon.length; right += 1) {
      const rightNext = (right + 1) % polygon.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (left === 0 && rightNext === 0) continue;
      if (
        segmentsIntersect(polygon[left]!, polygon[leftNext]!, polygon[right]!, polygon[rightNext]!)
      )
        return true;
    }
  }
  return false;
}

type BoundaryIntersection = Readonly<{ point: PtMm; edgeIndex: number; cutProgress: number }>;

function boundaryIntersections(
  polygon: readonly PtMm[],
  from: PtMm,
  to: PtMm,
): readonly BoundaryIntersection[] | null {
  const cut = subtract(to, from);
  const intersections: BoundaryIntersection[] = [];
  for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
    const edgeFrom = polygon[edgeIndex]!;
    const edgeTo = polygon[(edgeIndex + 1) % polygon.length]!;
    const edge = subtract(edgeTo, edgeFrom);
    const denominator = cross(cut, edge);
    const offset = subtract(edgeFrom, from);
    if (Math.abs(denominator) <= EPS) {
      if (Math.abs(cross(offset, cut)) <= EPS) return null;
      continue;
    }
    const cutProgress = cross(offset, edge) / denominator;
    const edgeProgress = cross(offset, cut) / denominator;
    if (
      cutProgress < -EPS ||
      cutProgress > 1 + EPS ||
      edgeProgress <= EPS ||
      edgeProgress >= 1 - EPS
    )
      continue;
    intersections.push({
      point: {
        x: from.x + cut.x * Math.max(0, Math.min(1, cutProgress)),
        y: from.y + cut.y * Math.max(0, Math.min(1, cutProgress)),
      },
      edgeIndex,
      cutProgress: Math.max(0, Math.min(1, cutProgress)),
    });
  }
  return intersections;
}

function openPolygon(points: readonly PtMm[]): readonly PtMm[] {
  if (points.length > 1 && samePoint(points[0]!, points.at(-1)!)) return points.slice(0, -1);
  return points;
}

function splitPolygon(
  sourcePoints: readonly PtMm[],
  from: PtMm,
  to: PtMm,
):
  | Readonly<{ ok: true; polygons: readonly [readonly PtMm[], readonly PtMm[]] }>
  | Readonly<{
      ok: false;
      code:
        | 'unsupported-piece-geometry'
        | 'self-intersecting-boundary'
        | 'cut-intersection-ambiguous'
        | 'cut-tangent-or-degenerate';
      detail: string;
    }> {
  const polygon = openPolygon(sourcePoints).map(({ x, y }) => ({ x, y }));
  if (polygon.length < 3 || polygon.some((point) => !finitePoint(point)))
    return {
      ok: false,
      code: 'unsupported-piece-geometry',
      detail: 'Cut requires one finite closed PieceSpec boundary with at least three vertices.',
    };
  if (polygon.some((point, index) => samePoint(point, polygon[(index + 1) % polygon.length]!)))
    return {
      ok: false,
      code: 'unsupported-piece-geometry',
      detail: 'Cut refuses a source boundary with a zero-length edge.',
    };
  if (Math.abs(areaSigned(polygon)) <= EPS)
    return {
      ok: false,
      code: 'cut-tangent-or-degenerate',
      detail: 'The source boundary has zero usable area.',
    };
  if (selfIntersects(polygon))
    return {
      ok: false,
      code: 'self-intersecting-boundary',
      detail: 'Cut refuses a self-intersecting source boundary.',
    };
  if (!finitePoint(from) || !finitePoint(to) || samePoint(from, to))
    return {
      ok: false,
      code: 'cut-tangent-or-degenerate',
      detail: 'Cut requires two distinct finite points.',
    };
  const intersections = boundaryIntersections(polygon, from, to);
  if (!intersections)
    return {
      ok: false,
      code: 'cut-intersection-ambiguous',
      detail: 'Cut overlaps a boundary edge and cannot choose one exact split.',
    };
  if (intersections.length !== 2)
    return {
      ok: false,
      code: intersections.length < 2 ? 'cut-tangent-or-degenerate' : 'cut-intersection-ambiguous',
      detail: `Cut must cross exactly two boundary edges; observed ${intersections.length}.`,
    };
  const [first, second] = [...intersections].sort(
    (left, right) => left.edgeIndex - right.edgeIndex,
  );
  if (!first || !second || first.edgeIndex === second.edgeIndex)
    return {
      ok: false,
      code: 'cut-tangent-or-degenerate',
      detail: 'Cut intersections do not divide the boundary into two paths.',
    };
  const firstPath: PtMm[] = [{ ...first.point }];
  for (let index = first.edgeIndex + 1; index <= second.edgeIndex; index += 1)
    firstPath.push({ ...polygon[index]! });
  firstPath.push({ ...second.point });
  const secondPath: PtMm[] = [{ ...second.point }];
  for (let index = second.edgeIndex + 1; index < polygon.length; index += 1)
    secondPath.push({ ...polygon[index]! });
  for (let index = 0; index <= first.edgeIndex; index += 1) secondPath.push({ ...polygon[index]! });
  secondPath.push({ ...first.point });
  if (
    firstPath.length < 3 ||
    secondPath.length < 3 ||
    Math.abs(areaSigned(firstPath)) <= EPS ||
    Math.abs(areaSigned(secondPath)) <= EPS ||
    selfIntersects(firstPath) ||
    selfIntersects(secondPath)
  )
    return {
      ok: false,
      code: 'cut-tangent-or-degenerate',
      detail: 'Cut produced a degenerate or self-intersecting derived boundary.',
    };
  return { ok: true, polygons: [firstPath, secondPath] };
}

function pointsExactlyEqual(left: readonly PtMm[], right: readonly PtMm[]): boolean {
  const openLeft = openPolygon(left);
  const openRight = openPolygon(right);
  return (
    openLeft.length === openRight.length &&
    openLeft.every((point, index) => samePoint(point, openRight[index]!))
  );
}

function featureSide(
  points: readonly PtMm[],
  polygons: readonly [readonly PtMm[], readonly PtMm[]],
) {
  const sides = new Set<number>();
  for (const point of points) {
    const memberships = polygons
      .map((polygon, index) => (pointLocation(point, polygon) >= 0 ? index : -1))
      .filter((index) => index >= 0);
    if (memberships.length !== 1) return null;
    sides.add(memberships[0]!);
  }
  return sides.size === 1 ? [...sides][0]! : null;
}

function bbox(points: readonly PtMm[]) {
  return {
    minX: Math.min(...points.map(({ x }) => x)),
    minY: Math.min(...points.map(({ y }) => y)),
    maxX: Math.max(...points.map(({ x }) => x)),
    maxY: Math.max(...points.map(({ y }) => y)),
  };
}

function splitSize(
  size: PieceSizeSpec,
  from: PtMm,
  to: PtMm,
):
  | Readonly<{ ok: true; sizes: readonly [PieceSizeSpec, PieceSizeSpec] }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfPhaseEDraftCadCutGeometryBlockerCodeV1;
      detail: string;
    }> {
  if (size.cutLoops?.length || size.continuity || size.repair || size.kinks?.length)
    return {
      ok: false,
      code: 'unsupported-piece-geometry',
      detail: `Size ${size.sizeToken} carries derived loops or repair evidence that Cut cannot repartition losslessly.`,
    };
  if (size.seam && !pointsExactlyEqual(size.seam, size.cut))
    return {
      ok: false,
      code: 'unsupported-piece-geometry',
      detail: `Size ${size.sizeToken} has an independent seam contour that Cut cannot repartition losslessly.`,
    };
  const split = splitPolygon(size.cut, from, to);
  if (!split.ok) return split;
  const [left, right] = split.polygons;
  const output = [
    {
      ...structuredClone(size),
      cut: left.map((point) => ({ ...point })),
      seam: size.seam ? left.map((point) => ({ ...point })) : null,
      notches: [],
      drills: [],
      internal: [],
      grain: null,
      fold: null,
      offset: null,
      walls: [],
      bbox: bbox(left),
      areaMm2: Math.abs(areaSigned(left)),
    },
    {
      ...structuredClone(size),
      cut: right.map((point) => ({ ...point })),
      seam: size.seam ? right.map((point) => ({ ...point })) : null,
      notches: [],
      drills: [],
      internal: [],
      grain: null,
      fold: null,
      offset: null,
      walls: [],
      bbox: bbox(right),
      areaMm2: Math.abs(areaSigned(right)),
    },
  ] as [PieceSizeSpec, PieceSizeSpec];
  for (const notch of size.notches) {
    const side = featureSide([notch.at, ...notch.seg], split.polygons);
    if (side === null)
      return {
        ok: false,
        code: 'feature-partition-ambiguous',
        detail: `A notch in size ${size.sizeToken} lies on the cut chord.`,
      };
    output[side].notches.push(structuredClone(notch));
  }
  for (const drill of size.drills) {
    const side = featureSide([drill.at], split.polygons);
    if (side === null)
      return {
        ok: false,
        code: 'feature-partition-ambiguous',
        detail: `A drill in size ${size.sizeToken} lies on the cut chord.`,
      };
    output[side].drills.push(structuredClone(drill));
  }
  for (const internal of size.internal) {
    const side = featureSide(internal.pts, split.polygons);
    if (side === null)
      return {
        ok: false,
        code: 'feature-partition-ambiguous',
        detail: `An internal feature in size ${size.sizeToken} crosses the cut chord.`,
      };
    output[side].internal.push(structuredClone(internal));
  }
  if (size.grain) {
    const side = featureSide([size.grain.a, size.grain.b], split.polygons);
    if (side === null)
      return {
        ok: false,
        code: 'feature-partition-ambiguous',
        detail: `The grainline in size ${size.sizeToken} crosses the cut chord.`,
      };
    output[side].grain = structuredClone(size.grain);
  }
  if (size.fold) {
    const side = featureSide([size.fold.a, size.fold.b], split.polygons);
    if (side === null)
      return {
        ok: false,
        code: 'feature-partition-ambiguous',
        detail: `The fold line in size ${size.sizeToken} crosses the cut chord.`,
      };
    output[side].fold = structuredClone(size.fold);
  }
  return { ok: true, sizes: output };
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function normalizedCutKey(points: readonly PtMm[]): string {
  const normalized = points.map(({ x, y }) => [x, y] as const);
  const reversed = [...normalized].reverse();
  return JSON.stringify(
    JSON.stringify(normalized) <= JSON.stringify(reversed) ? normalized : reversed,
  );
}

function derivedPiece(source: PieceSpec, identity: string, suffix: 'A' | 'B'): PieceSpec {
  return {
    ...structuredClone(source),
    identity,
    code: `${source.code}_CUT`,
    mods: [...source.mods, suffix],
    displayName: `${source.displayName} · cut ${suffix}`,
    nameOrigin: 'operator',
    pairHand: null,
    pairOf: null,
    piecesPerGarment: source.piecesPerGarment,
    sizes: [],
  };
}

/**
 * Applies one explicit two-point Cut to every retained size of one PieceSpec. The source writer job
 * is detached first and remains untouched; any size or feature that cannot be partitioned exactly
 * blocks the entire split.
 */
export function executePatternImportDxfPhaseEDraftCadCutGeometryV1(
  sourceJob: WriteJob,
  command: CutCommand,
): PatternImportDxfPhaseEDraftCadCutGeometryResultV1 {
  let job: WriteJob;
  try {
    job = structuredClone(sourceJob);
  } catch {
    return blocked('invalid-input', 'Cut source writer job could not be detached safely.');
  }
  if (
    !command ||
    command.tool !== 'cut' ||
    command.payload.keepSide !== 'both' ||
    command.payload.pointsMm.length !== 2 ||
    !command.target.pieceId ||
    !command.target.pieceLineKey
  )
    return blocked(
      'invalid-input',
      'Cut requires one exact target, two points and keepSide=both.',
      command?.target?.pieceId ?? null,
    );
  const sourceMatches = job.pieces.filter(({ identity }) => identity === command.target.pieceId);
  if (sourceMatches.length !== 1)
    return blocked(
      'piece-unavailable',
      `Cut target ${command.target.pieceId} must resolve to one retained PieceSpec.`,
      command.target.pieceId,
    );
  const source = sourceMatches[0]!;
  if (!source.sizes.length)
    return blocked(
      'unsupported-piece-geometry',
      `Cut target ${source.identity} has no retained sizes to split.`,
      source.identity,
    );
  const [from, to] = command.payload.pointsMm;
  const fingerprint = fnv1a64(
    `${source.identity}\u0000${command.target.pieceLineKey}\u0000${normalizedCutKey([from!, to!])}`,
  );
  const identities = [
    `${source.identity}__CUT_${fingerprint.slice(0, 10)}_A`,
    `${source.identity}__CUT_${fingerprint.slice(0, 10)}_B`,
  ] as const;
  if (
    job.pieces.some(({ identity }) => identities.includes(identity as (typeof identities)[number]))
  )
    return blocked(
      'piece-unavailable',
      'Derived Cut identities collide with retained PieceSpec identities.',
      source.identity,
    );
  const derived = [
    derivedPiece(source, identities[0], 'A'),
    derivedPiece(source, identities[1], 'B'),
  ];
  for (const size of source.sizes) {
    const result = splitSize(size, from!, to!);
    if (!result.ok) return blocked(result.code, result.detail, source.identity);
    derived[0]!.sizes.push(result.sizes[0]);
    derived[1]!.sizes.push(result.sizes[1]);
  }
  const sourceIndex = job.pieces.findIndex(({ identity }) => identity === source.identity);
  job.pieces.splice(sourceIndex, 1, derived[0]!, derived[1]!);
  return deepFreeze({
    ok: true as const,
    job,
    sourcePieceIdentity: source.identity,
    derivedPieceIdentities: identities,
    blockers: [] as const,
  });
}
