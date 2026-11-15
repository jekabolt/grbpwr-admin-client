import { identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import type { PieceSpec, PtMm, WriteJob } from 'lib/pattern-import/types';
import { WRITE_SIMPLIFY_MM } from 'lib/pattern-import/write/plan';

import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ROUND_PIECE_EXECUTOR_V1 =
  'pattern-import-dxf-phase-e-draft-cad-round-piece-executor/1' as const;

type RoundCommand = Extract<
  PatternImportDxfPhaseEDraftCadCommandV1,
  { tool: 'circle' | 'ellipse' }
>;

export type PatternImportDxfPhaseEDraftCadRoundPieceBlockerCodeV1 =
  | 'invalid-input'
  | 'stale-source'
  | 'invalid-dimensions'
  | 'off-canvas'
  | 'duplicate-identity'
  | 'overlap-policy-ambiguous'
  | 'grading-requirement'
  | 'approximation-capability';

export type PatternImportDxfPhaseEDraftCadRoundPieceResultV1 =
  | Readonly<{
      ok: true;
      job: WriteJob;
      createdPiece: Readonly<{
        pieceId: string;
        pieceLineKey: string;
        contourId: string;
        vertexIds: readonly string[];
        sizeToken: string;
        gradingPolicy: 'ungraded-current-size';
        approximation: 'bounded-polyline';
        maxChordErrorMm: number;
        segmentCount: number;
      }>;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      job: null;
      createdPiece: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEDraftCadRoundPieceBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ROUND_PIECE_CLAIMS_V1 = Object.freeze({
  nativeArcWriterClaimed: false,
  deterministicBoundedPolyline: true,
  explicitMaximumChordError: true,
  sharedWriterSimplificationReservedInsideErrorBudget: true,
  coordinateProximitySearchUsed: false,
  explicitSeparateWriterBlockPolicy: true,
  explicitUngradedCurrentSizePolicy: true,
  syntheticGradingCreated: false,
  sourceJobMutated: false,
  retainedPieceSpecWriterReused: true,
  persistenceIntegrated: false,
} as const);

const MIN_RADIUS_MM = 0.1;
const DXF_COORDINATE_ROUNDING_RESERVE_MM = 0.000_001;
const WRITER_ERROR_RESERVE_MM = WRITE_SIMPLIFY_MM + DXF_COORDINATE_ROUNDING_RESERVE_MM;
const MIN_CHORD_ERROR_MM = 0.02;
const MAX_CHORD_ERROR_MM = 0.25;
const MIN_SEGMENTS = 16;
const MAX_SEGMENTS = 2_048;
const MAX_ABS_COORDINATE_MM = 1_000_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseEDraftCadRoundPieceBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEDraftCadRoundPieceResultV1 {
  return deepFreeze({
    ok: false as const,
    job: null,
    createdPiece: null,
    blockers: [{ code, detail }] as const,
  });
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function finitePoint(value: unknown): value is PtMm {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PtMm>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function deterministicSeed(identity: string, used: ReadonlySet<number>): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  let candidate = hash >>> 0;
  while (used.has(candidate)) candidate = (candidate + 1) >>> 0;
  return candidate;
}

function segmentCountFor(maxRadiusMm: number, maxChordErrorMm: number): number | null {
  const ratio = 1 - maxChordErrorMm / maxRadiusMm;
  if (!(ratio > -1 && ratio < 1)) return null;
  const halfAngle = Math.acos(ratio);
  if (!(halfAngle > 0)) return null;
  const count = Math.max(MIN_SEGMENTS, Math.ceil(Math.PI / halfAngle));
  return count <= MAX_SEGMENTS ? count : null;
}

function polygonArea(points: readonly PtMm[]): number {
  let doubled = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    doubled += current.x * next.y - next.x * current.y;
  }
  return Math.abs(doubled) / 2;
}

function validNewPiece(command: RoundCommand): boolean {
  const piece = command.payload.newPiece;
  return Boolean(
    piece &&
    stableId(piece.pieceId) &&
    stableId(piece.pieceLineKey) &&
    stableId(piece.contourId) &&
    stableId(piece.vertexIdPrefix) &&
    typeof piece.displayName === 'string' &&
    piece.displayName.trim() === piece.displayName &&
    piece.displayName.length > 0 &&
    piece.displayName.length <= 256 &&
    Number.isFinite(piece.maxChordErrorMm),
  );
}

/** Creates one ungraded current-size PieceSpec using a deterministic bounded curve polyline. */
export function executePatternImportDxfPhaseEDraftCadRoundPieceV1(
  source: WriteJob,
  command: RoundCommand,
  selectedSizeToken: string,
): PatternImportDxfPhaseEDraftCadRoundPieceResultV1 {
  let job: WriteJob;
  try {
    job = structuredClone(source);
  } catch {
    return blocked('invalid-input', 'Round-piece source could not be detached safely.');
  }
  if (
    !job ||
    !Array.isArray(job.pieces) ||
    !Array.isArray(job.sizes) ||
    !command ||
    (command.tool !== 'circle' && command.tool !== 'ellipse') ||
    !stableId(command.commandId) ||
    !stableId(command.payload?.entityId) ||
    !stableId(command.target?.pieceId) ||
    !stableId(command.target?.pieceLineKey) ||
    !stableId(selectedSizeToken) ||
    !finitePoint(command.payload.centerMm) ||
    !validNewPiece(command)
  )
    return blocked(
      'invalid-input',
      'Circle/Ellipse requires finite exact geometry and complete stable piece identities.',
    );

  const newPiece = command.payload.newPiece!;
  if (newPiece.placementPolicy !== 'separate-writer-block')
    return blocked(
      'overlap-policy-ambiguous',
      'Round-piece creation requires the explicit separate-writer-block placement policy.',
    );
  if (newPiece.gradingPolicy !== 'ungraded-current-size')
    return blocked(
      'grading-requirement',
      'Round-piece creation cannot invent grading; select current-size ungraded explicitly.',
    );

  const radiusXmm =
    command.tool === 'circle' ? command.payload.radiusMm : command.payload.radiusXmm;
  const radiusYmm =
    command.tool === 'circle' ? command.payload.radiusMm : command.payload.radiusYmm;
  const rotationDeg = command.tool === 'circle' ? 0 : command.payload.rotationDeg;
  if (
    !Number.isFinite(radiusXmm) ||
    !Number.isFinite(radiusYmm) ||
    !Number.isFinite(rotationDeg) ||
    radiusXmm < MIN_RADIUS_MM ||
    radiusYmm < MIN_RADIUS_MM
  )
    return blocked(
      'invalid-dimensions',
      `Circle/Ellipse radii must each be at least ${MIN_RADIUS_MM} mm and rotation must be finite.`,
    );
  if (
    newPiece.maxChordErrorMm < MIN_CHORD_ERROR_MM ||
    newPiece.maxChordErrorMm > MAX_CHORD_ERROR_MM ||
    newPiece.maxChordErrorMm >= Math.min(radiusXmm, radiusYmm) / 4
  )
    return blocked(
      'approximation-capability',
      `Maximum chord error must be ${MIN_CHORD_ERROR_MM}–${MAX_CHORD_ERROR_MM} mm and below one quarter of the minimum radius.`,
    );
  const executorChordErrorMm = newPiece.maxChordErrorMm - WRITER_ERROR_RESERVE_MM;
  const segmentCount = segmentCountFor(Math.max(radiusXmm, radiusYmm), executorChordErrorMm);
  if (!segmentCount)
    return blocked(
      'approximation-capability',
      `Requested chord error requires more than ${MAX_SEGMENTS} deterministic segments.`,
    );

  const vertexIds = Array.from(
    { length: segmentCount },
    (_, index) => `${newPiece.vertexIdPrefix}${index}`,
  );
  const topologyIds = [newPiece.pieceId, newPiece.pieceLineKey, newPiece.contourId, ...vertexIds];
  if (
    topologyIds.some((identity) => !stableId(identity)) ||
    new Set(topologyIds).size !== topologyIds.length
  )
    return blocked(
      'duplicate-identity',
      'Round-piece piece, line, contour and generated vertex identities must be stable and distinct.',
    );

  const contextPieces = job.pieces.filter(({ identity }) => identity === command.target.pieceId);
  const selectedSizes = job.sizes.filter(({ token }) => token === selectedSizeToken);
  const contextSizes = contextPieces[0]?.sizes.filter(
    ({ sizeToken }) => sizeToken === selectedSizeToken,
  );
  if (contextPieces.length !== 1 || selectedSizes.length !== 1 || contextSizes?.length !== 1)
    return blocked(
      'stale-source',
      'Round-piece context and selected size must resolve exactly once in the retained writer job.',
    );
  if (
    new Set(job.pieces.map(({ identity }) => identity)).size !== job.pieces.length ||
    job.pieces.some(({ identity }) => identity === newPiece.pieceId)
  )
    return blocked('duplicate-identity', `Piece identity ${newPiece.pieceId} is already present.`);
  const identityIssue = identityProblem(newPiece.pieceId, {
    isSizeToken: sizeTokenTest(job.sizes.map(({ token }) => token)),
    pair: null,
  });
  if (identityIssue || !/^[A-Z][A-Z0-9]*$/.test(newPiece.pieceId))
    return blocked(
      'invalid-input',
      `Round-piece identity ${newPiece.pieceId} is not one writer-safe code word${identityIssue ? `: ${identityIssue}` : '.'}`,
    );

  const radians = (rotationDeg * Math.PI) / 180;
  const cosRotation = Math.cos(radians);
  const sinRotation = Math.sin(radians);
  const cut = Array.from({ length: segmentCount }, (_, index) => {
    const angle = (index / segmentCount) * Math.PI * 2;
    const localX = radiusXmm * Math.cos(angle);
    const localY = radiusYmm * Math.sin(angle);
    return {
      x: command.payload.centerMm.x + localX * cosRotation - localY * sinRotation,
      y: command.payload.centerMm.y + localX * sinRotation + localY * cosRotation,
    };
  });
  if (
    cut.some(
      ({ x, y }) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        Math.abs(x) > MAX_ABS_COORDINATE_MM ||
        Math.abs(y) > MAX_ABS_COORDINATE_MM,
    )
  )
    return blocked(
      'off-canvas',
      `Circle/Ellipse coordinates must stay inside the ±${MAX_ABS_COORDINATE_MM} mm authoring envelope.`,
    );
  const minX = Math.min(...cut.map(({ x }) => x));
  const minY = Math.min(...cut.map(({ y }) => y));
  const maxX = Math.max(...cut.map(({ x }) => x));
  const maxY = Math.max(...cut.map(({ y }) => y));
  const areaMm2 = polygonArea(cut);
  if (!(areaMm2 > 0))
    return blocked('invalid-dimensions', 'Circle/Ellipse approximation is degenerate.');

  const selectedSize = selectedSizes[0]!;
  const contextPiece = contextPieces[0]!;
  const evidenceKind = command.tool === 'circle' ? 'circle' : 'ellipse';
  const piece: PieceSpec = {
    identity: newPiece.pieceId,
    code: newPiece.pieceId,
    mods: [],
    displayName: newPiece.displayName,
    nameOrigin: 'operator',
    seed: deterministicSeed(newPiece.pieceId, new Set(job.pieces.map(({ seed }) => seed))),
    variant: null,
    pairHand: null,
    pairOf: null,
    unfoldedFold: false,
    piecesPerGarment: 1,
    allowance: {
      meaning: 'cut',
      allowanceMm: 0,
      origin: 'operator',
      evidence: [
        `draft-cad:${evidenceKind}:create-piece:bounded-polyline`,
        `draft-cad:max-chord-error-mm:${newPiece.maxChordErrorMm}`,
        `draft-cad:writer-error-reserve-mm:${WRITER_ERROR_RESERVE_MM}`,
      ],
    },
    fabrics: [...contextPiece.fabrics],
    fused: false,
    ungraded: true,
    sizes: [
      {
        rank: selectedSize.rank,
        sizeToken: selectedSize.token,
        sizeId: selectedSize.sizeId,
        cut: cut.map((point) => ({ ...point })),
        seam: cut.map((point) => ({ ...point })),
        grain: null,
        notches: [],
        drills: [],
        internal: [],
        fold: null,
        offset: null,
        walls: [],
        bbox: { minX, minY, maxX, maxY },
        areaMm2,
      },
    ],
  };
  job.pieces.push(piece);
  return deepFreeze({
    ok: true as const,
    job,
    createdPiece: {
      pieceId: newPiece.pieceId,
      pieceLineKey: newPiece.pieceLineKey,
      contourId: newPiece.contourId,
      vertexIds,
      sizeToken: selectedSizeToken,
      gradingPolicy: newPiece.gradingPolicy,
      approximation: 'bounded-polyline' as const,
      maxChordErrorMm: newPiece.maxChordErrorMm,
      segmentCount,
    },
    blockers: [] as const,
  });
}
