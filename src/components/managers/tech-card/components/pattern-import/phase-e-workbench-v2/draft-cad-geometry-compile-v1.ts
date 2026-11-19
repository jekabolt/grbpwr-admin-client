import { applyDraftParallelSpreadV1 } from './draft-cad-parallel-spread-v1';
import { hasSavedDraftGeometrySourceV1 } from './draft-cad-saved-dart-tip-review-v1';
import { sameDartVertices } from './draft-cad-saved-dart-tip-v1';
import { applyAffine, closestOnPolyline, pointInPolygon } from 'lib/pattern-import/semantics/geom';
import {
  authoredQuadraticGrid,
  decodeAuthoredQuadratic,
  sampleAuthoredQuadratic,
} from 'lib/pattern-import/manifest/authored-internal';
import { normalizeAuthoredText } from 'lib/pattern-import/manifest/authored-text';
import { segIntersect } from 'lib/pattern-import/pieces/geom';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import { readManifest } from 'lib/pattern-import/manifest';
import {
  PATIMPORT,
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type ConversionManifest,
  type InternalFeature,
  type NotchFeature,
  type PieceSizeSpec,
  type PtMm,
  type WriteJob,
} from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import {
  readSavedDraftPairedAllowanceAuthorityV1,
  sameDraftAllowanceRingV1,
  type SavedDraftPairedAllowanceAuthorityV1,
  type SavedDraftPairedAllowanceProofV1,
} from './draft-cad-paired-allowance-authority-v1';

import {
  buildPatternImportDxfPhaseEDraftCadPreviewV1,
  type PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1,
} from './draft-cad-preview-v1';
import {
  editDraftCadSelectedSizeVertexV1,
  resizeDraftCadSelectedSizeEdgeV1,
} from './draft-cad-edge-length-geometry-v1';
import { executePatternImportDxfPhaseEDraftCadAddPointGeometryV1 } from './draft-cad-add-point-geometry-executor-v1';
import { executePatternImportDxfPhaseEDraftCadCutGeometryV1 } from './draft-cad-cut-geometry-executor-v1';
import {
  executePatternImportDxfPhaseEDraftCadPenPieceV1,
  executePatternImportDxfPhaseEDraftCadRectanglePieceV1,
} from './draft-cad-rectangle-piece-executor-v1';
import { executePatternImportDxfPhaseEDraftCadRoundPieceV1 } from './draft-cad-round-piece-executor-v1';
import type { PatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import type {
  PatternImportDxfPhaseEDraftCadCommandV1,
  PatternImportDxfPhaseEDraftCadSessionV1,
  PatternImportDxfPhaseEDraftCadToolV1,
} from './draft-cad-session-v1';
import {
  activeDraftCadTransactionsV1,
  DRAFT_CAD_CROSS_MARK_HALF_SPAN_MM,
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1,
  permitsDraftCadLocalPieceEditV1,
} from './draft-cad-session-v1';
import { executePatternImportDxfPhaseEDraftCadSpreadGeometryV1 } from './draft-cad-spread-geometry-executor-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GEOMETRY_COMPILE_V1 =
  'pattern-import-dxf-phase-e-draft-cad-geometry-compile/1' as const;

type SelectedPhaseD = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;

export type PatternImportDxfPhaseEDraftCadGeometryCompileBlockerCodeV1 =
  | 'invalid-input'
  | 'nothing-to-compile'
  | 'source-binding-mismatch'
  | 'writer-replay-unavailable'
  | 'writer-piece-unavailable'
  | 'writer-size-unavailable'
  | 'preview-blocked'
  | 'edge-length-geometry-blocked'
  | 'paired-allowance-authority-required'
  | 'move-point-geometry-blocked'
  | 'delete-point-geometry-blocked'
  | 'sharpen-corner-geometry-blocked'
  | 'add-point-geometry-blocked'
  | 'rectangle-geometry-blocked'
  | 'pen-geometry-blocked'
  | 'round-piece-geometry-blocked'
  | 'cut-geometry-blocked'
  | 'spread-geometry-blocked'
  | 'unsupported-command'
  | 'writer-failed'
  | 'writer-output-mismatch'
  | 'manifest-readback-mismatch';

export type PatternImportDxfPhaseEDraftCadGeometryCompileBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEDraftCadGeometryCompileBlockerCodeV1;
  detail: string;
  commandId: string | null;
  tool: PatternImportDxfPhaseEDraftCadToolV1 | null;
}>;

export type PatternImportDxfPhaseEDraftCadCompiledFeatureV1 = Readonly<{
  commandId: string;
  entityId: string;
  tool: PatternImportDxfPhaseEDraftCadToolV1;
  pieceId: string;
  sizeToken: string;
  output:
    | 'internal'
    | 'point-mark'
    | 'text-mark'
    | 'drill'
    | 'notch'
    | 'boundary-point'
    | 'moved-dart-tip'
    | 'moved-fish-eye'
    | 'moved-french-curve'
    | 'moved-vertex'
    | 'deleted-vertex'
    | 'sharpened-corner'
    | 'edge-length'
    | 'piece-create'
    | 'split'
    | 'slash-guide'
    | 'parallel-spread'
    | 'spread';
  derivedPieceIds?: readonly [string, string];
  /** Session-local topology identity; the ordinary re-import remains canonical topology owner. */
  createdTopology?: Readonly<{
    pieceLineKey: string;
    contourId: string;
    vertexIds: readonly string[];
  }>;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GEOMETRY_COMPILE_CLAIMS_V1 = Object.freeze({
  exactActiveHistoryOnly: true,
  exactPhaseDSelectionRequired: true,
  retainedWriterReplayRequired: true,
  existingPieceSpecModelReused: true,
  deterministicProductWriterReused: true,
  embeddedManifestReadbackVerified: true,
  sessionLocalCutExecutorIntegrated: true,
  sessionLocalSpreadExecutorIntegrated: true,
  sessionLocalAddPointExecutorIntegrated: true,
  sessionLocalRectanglePieceExecutorIntegrated: true,
  sessionLocalRoundPieceExecutorIntegrated: true,
  sourcePieceSpecMutated: false,
  directTopologyInjection: false,
  parallelDocumentModelCreated: false,
  productionWritePerformed: false,
  freshImportSemanticsPhaseDPhaseERequired: true,
  applyAuthorityCreated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GEOMETRY_COMPILE_V1;
  status: 'compiled-reimport-required';
  source: Readonly<{
    revision: number;
    sourceFileId: string;
    sourceSha256: string;
    selectedGeometrySha256: string;
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
  }>;
  scope: Readonly<{ techCardId: number; scopeKey: string; sizeToken: string }>;
  /** Detached writer input containing the compiled PieceSpec geometry. It is not a CardDraft. */
  compiledJob: WriteJob;
  /** New deterministic DXF text. It must enter through the ordinary import pipeline. */
  dxfText: string;
  manifest: ConversionManifest;
  warnings: readonly string[];
  compiledFeatures: readonly PatternImportDxfPhaseEDraftCadCompiledFeatureV1[];
  reimport: Readonly<{
    required: true;
    boundary: 'ordinary-import-semantics-phase-d-phase-e';
    applyEligible: false;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GEOMETRY_COMPILE_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEDraftCadGeometryCompileResultV1 =
  | Readonly<{
      ok: true;
      artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      artifact: null;
      blockers: readonly PatternImportDxfPhaseEDraftCadGeometryCompileBlockerV1[];
    }>;

export type PatternImportDxfPhaseEDraftCadGeometryCompileInputV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  selection: SelectedPhaseD;
  compileSource: PatternImportDxfPhaseEDraftCadCompileSourceV1;
}>;

const pairedAllowanceReviews = new WeakMap<
  PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
  () => boolean
>();

export function requiresCurrentPairedAllowanceReviewV1(
  artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
): boolean {
  const current = pairedAllowanceReviews.get(artifact);
  if (!current) return false;
  if (!current())
    throw new Error('The saved allowance Draft changed. Compile the current edit again.');
  return true;
}

const INTERNAL_TOOLS = new Set<PatternImportDxfPhaseEDraftCadToolV1>([
  'internal-line',
  'pattern-line',
  'french-curve',
  'guideline',
  'dart',
  'fish-eye',
]);
const PRODUCTIVE_TOOLS = new Set<PatternImportDxfPhaseEDraftCadToolV1>(
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1,
);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseEDraftCadGeometryCompileBlockerCodeV1,
  detail: string,
  command: PatternImportDxfPhaseEDraftCadCommandV1 | null = null,
): PatternImportDxfPhaseEDraftCadGeometryCompileResultV1 {
  return deepFreeze({
    ok: false as const,
    artifact: null,
    blockers: [
      {
        code,
        detail,
        commandId: command?.commandId ?? null,
        tool: command?.tool ?? null,
      },
    ],
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function activeCommands(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
): readonly PatternImportDxfPhaseEDraftCadCommandV1[] {
  return activeDraftCadTransactionsV1(session).flatMap(({ commands }) => commands);
}

function supported(command: PatternImportDxfPhaseEDraftCadCommandV1): boolean {
  if (!PRODUCTIVE_TOOLS.has(command.tool)) return false;
  if (command.tool === 'pen') return command.payload.closed && Boolean(command.payload.newPiece);
  if (command.tool === 'rectangle') return Boolean(command.payload.newPiece);
  if (command.tool === 'circle' || command.tool === 'ellipse')
    return Boolean(command.payload.newPiece);
  if (INTERNAL_TOOLS.has(command.tool)) return true;
  if (command.tool === 'draft-point' || command.tool === 'point-only') return true;
  if (command.tool === 'add-point') return Boolean(command.payload.edge);
  if (
    command.tool === 'edge-length' ||
    command.tool === 'move-point' ||
    command.tool === 'delete-point' ||
    command.tool === 'sharpen-corner'
  )
    return true;
  if (command.tool === 'cut') return command.payload.keepSide === 'both';
  if (command.tool === 'spread') return command.payload.amountMm > 0;
  if (command.tool === 'mark')
    return (
      command.payload.kind === 'drill' ||
      command.payload.kind === 'cross' ||
      (command.payload.kind === 'text' && normalizeAuthoredText(command.payload.text) !== null)
    );
  if (command.tool === 'notch') return true;
  return false;
}

function unsupportedDetail(command: PatternImportDxfPhaseEDraftCadCommandV1): string {
  if (command.tool === 'rectangle')
    return 'Legacy rectangle intent has no stable new-piece identity or explicit grading/placement policy.';
  if (command.tool === 'circle' || command.tool === 'ellipse')
    return `Legacy ${command.tool} intent has no stable new-piece identity or explicit bounded-approximation/grading/placement policy.`;
  if (command.tool === 'mark')
    return `Mark kind ${command.payload.kind} has no typed DXF encoding.`;
  return `Tool ${command.tool} changes topology or carries semantics the retained PieceSpec writer cannot encode losslessly.`;
}

function primitiveFor(
  primitives: readonly PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1[],
  command: PatternImportDxfPhaseEDraftCadCommandV1,
): PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1 | null {
  const matches = primitives.filter(
    ({ commandId, entityId, tool, target }) =>
      commandId === command.commandId &&
      entityId === command.payload.entityId &&
      tool === command.tool &&
      target.pieceId === command.target.pieceId &&
      target.pieceLineKey === command.target.pieceLineKey,
  );
  return matches.length === 1 ? matches[0] : null;
}

function featureBase() {
  return { origin: 'operator' as const, ranges: [], confidence: 1 };
}

function distanceToChord(point: PtMm, from: PtMm, to: PtMm): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(point.x - from.x, point.y - from.y);
  return Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) / length;
}

function splitBezier(control: readonly PtMm[]): readonly [PtMm[], PtMm[]] {
  const levels: PtMm[][] = [control.map(({ x, y }) => ({ x, y }))];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!;
    levels.push(
      previous.slice(0, -1).map((point, index) => ({
        x: (point.x + previous[index + 1].x) / 2,
        y: (point.y + previous[index + 1].y) / 2,
      })),
    );
  }
  return [levels.map((level) => level[0]), levels.map((level) => level.at(-1)!).reverse()];
}

function sampleBezier(control: readonly PtMm[], depth = 0): PtMm[] {
  const from = control[0];
  const to = control.at(-1)!;
  const flat = control.slice(1, -1).every((point) => distanceToChord(point, from, to) <= 0.05);
  if (flat || depth >= 16)
    return [
      { x: from.x, y: from.y },
      { x: to.x, y: to.y },
    ];
  const [left, right] = splitBezier(control);
  return [...sampleBezier(left, depth + 1).slice(0, -1), ...sampleBezier(right, depth + 1)];
}

function internalFeature(
  command: PatternImportDxfPhaseEDraftCadCommandV1,
  primitive: PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1,
): InternalFeature | null {
  if (
    primitive.kind === 'path' &&
    (command.tool === 'internal-line' ||
      command.tool === 'pattern-line' ||
      command.tool === 'guideline')
  )
    return {
      kind: 'internal',
      pts: primitive.pointsMm.map(({ x, y }) => ({ x, y })),
      closed: primitive.closed,
      label: `draft-cad:${command.tool}`,
      ...featureBase(),
    };
  if (command.tool === 'french-curve' && primitive.kind === 'curve') {
    const [start, control, end] = primitive.controlPointsMm;
    const grid =
      primitive.controlPointsMm.length === 3 && start && control && end
        ? authoredQuadraticGrid([start, control, end])
        : null;
    // Historical draft payloads can have higher degree and remain sampled-only.
    const pts =
      primitive.controlPointsMm.length === 3
        ? grid && sampleAuthoredQuadratic(grid)
        : sampleBezier(primitive.controlPointsMm);
    if (!pts) return null;
    return {
      kind: 'internal',
      pts,
      closed: false,
      label: 'draft-cad:french-curve',
      ...(grid ? { authoredQuadratic: decodeAuthoredQuadratic(grid) } : {}),
      ...featureBase(),
    };
  }
  if (command.tool === 'dart' && primitive.kind === 'dart')
    return {
      kind: 'internal',
      pts: [primitive.baseLeftMm, primitive.apexMm, primitive.baseRightMm].map(({ x, y }) => ({
        x,
        y,
      })),
      closed: false,
      label: 'draft-cad:dart',
      ...featureBase(),
    };
  if (command.tool === 'fish-eye' && primitive.kind === 'path' && primitive.closed)
    return {
      kind: 'internal',
      pts: primitive.pointsMm.map(({ x, y }) => ({ x, y })),
      closed: true,
      label: 'draft-cad:fish-eye',
      ...featureBase(),
    };
  return null;
}

function pathInsideCut(
  path: Pick<InternalFeature, 'pts' | 'closed'>,
  size: PieceSizeSpec,
): boolean {
  const toleranceMm = 0.001;
  const { pts, closed } = path;
  const distance = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
  const holes = size.cutLoops ?? [];
  const basePoint = (index: number) => !closed && (index === 0 || index === pts.length - 1);
  const insideRing = (point: PtMm, ring: PtMm[]) =>
    pointInPolygon(point, ring) || closestOnPolyline(point, ring, true).d <= toleranceMm;
  if (
    !pts.every((point, index) => {
      const inCut = basePoint(index)
        ? insideRing(point, size.cut)
        : pointInPolygon(point, size.cut) &&
          closestOnPolyline(point, size.cut, true).d > toleranceMm;
      return inCut && holes.every((hole) => !insideRing(point, hole));
    })
  )
    return false;

  if (closed && holes.some((hole) => hole.some((point) => pointInPolygon(point, pts))))
    return false;

  const segmentCount = closed ? pts.length : pts.length - 1;
  for (let index = 0; index < segmentCount; index++) {
    const next = (index + 1) % pts.length;
    const a = pts[index]!;
    const b = pts[next]!;
    if (distance(a, b) <= toleranceMm) return false;
    const crosses = (ring: PtMm[], allowBase: boolean) =>
      ring.some((c, i) => {
        const edge = segIntersect(a, b, c, ring[(i + 1) % ring.length]!);
        if (!edge) return false;
        return (
          !allowBase ||
          (!(basePoint(index) && distance(a, edge.p) <= toleranceMm) &&
            !(basePoint(next) && distance(b, edge.p) <= toleranceMm))
        );
      });
    if (crosses(size.cut, true) || holes.some((hole) => crosses(hole, false))) return false;
  }
  return true;
}

function notchFeature(
  primitive: Extract<PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1, { kind: 'notch' }>,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): NotchFeature | null {
  const projectedPiece = projection.pieces.find(
    ({ pieceId, pieceLineKey }) =>
      pieceId === primitive.target.pieceId && pieceLineKey === primitive.target.pieceLineKey,
  );
  const contour = projectedPiece?.contours.find(
    ({ contourId }) => contourId === primitive.sourceAnchor.contourId,
  );
  const [fromId, toId] = primitive.sourceAnchor.boundaryVertexIds;
  const from = contour?.vertices.find(({ vertexId }) => vertexId === fromId)?.pointMm;
  const to = contour?.vertices.find(({ vertexId }) => vertexId === toId)?.pointMm;
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const at = { x: primitive.pointMm.x, y: primitive.pointMm.y };
  return {
    kind: 'notch',
    at,
    seg: [
      at,
      {
        x: at.x - (dy / length) * primitive.depthMm,
        y: at.y + (dx / length) * primitive.depthMm,
      },
    ],
    depthMm: primitive.depthMm,
    ...featureBase(),
  };
}

function exactSameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Compiles the PieceSpec-safe feature subset into detached DXF text. The result deliberately cannot
 * be applied to a card: callers must feed it back through import, semantics, Phase-D and Phase-E.
 */
function compilePatternImportDxfPhaseEDraftCadGeometryUnsafeV1(
  input: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
  pairedAllowance?: SavedDraftPairedAllowanceProofV1 | null,
): PatternImportDxfPhaseEDraftCadGeometryCompileResultV1 {
  let detached: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1;
  try {
    const original = input.session;
    if (
      !original ||
      !Number.isSafeInteger(original.cursor) ||
      original.cursor < 0 ||
      original.cursor > original.history.length
    )
      return blocked('invalid-input', 'Draft CAD compile requires complete V1 session inputs.');
    // Resolve authenticated handle revisions before detaching loses local session ownership.
    const history = activeDraftCadTransactionsV1(original);
    detached = structuredClone(
      history.length === original.cursor
        ? input
        : { ...input, session: { ...original, history, cursor: history.length } },
    );
  } catch {
    return blocked('invalid-input', 'Draft CAD compile input could not be detached safely.');
  }

  const { session, projection, selection, compileSource } = detached;
  if (!projection || selection?.ok !== true || !compileSource)
    return blocked('invalid-input', 'Draft CAD compile requires complete V1 session inputs.');

  const commands = activeCommands(session);
  if (!commands.length)
    return blocked('nothing-to-compile', 'The active Draft CAD history contains no commands.');
  if (new Set(commands.map(({ commandId }) => commandId)).size !== commands.length)
    return blocked('invalid-input', 'Active Draft CAD command ids must be globally unique.');

  const binding = selection.pipeline.contentBinding;
  const selected = selection.selection;
  const catalogPieceIds = session.source.catalog.pieces.map(({ pieceId }) => pieceId);
  if (
    !binding ||
    selected.scopeKey === '' ||
    selected.sizeToken !== projection.sizeToken ||
    selected.canonicalSha256 !== session.source.catalog.sizeSelectionCanonicalSha256 ||
    binding.sourceFileId !== session.source.phaseD.sourceFileId ||
    binding.sourceSha256 !== session.source.phaseD.sourceSha256 ||
    binding.selectedGeometrySha256 !== session.source.phaseD.selectedGeometrySha256 ||
    projection.sourceFileId !== binding.sourceFileId ||
    projection.expectedCatalogCanonicalSha256 !== session.source.catalog.canonicalSha256 ||
    projection.sizeSelectionCanonicalSha256 !== selected.canonicalSha256 ||
    !exactSameMembers(selected.pieceIds, catalogPieceIds) ||
    compileSource.techCardId < 1
  )
    return blocked(
      'source-binding-mismatch',
      'Session, projection, selected Phase-D identity and compile source do not exact-match.',
    );

  if (
    !compileSource.dxfProvenance?.pipelineIntegrated ||
    !compileSource.dxfProvenance.contentBinding ||
    !compileSource.dxfPhaseDReplay?.replayReady ||
    !compileSource.dxfPhaseDReplay.carrier ||
    compileSource.dxfProvenance.contentBinding.sourceFileId !== binding.sourceFileId ||
    compileSource.dxfProvenance.contentBinding.sourceSha256 !== binding.sourceSha256 ||
    compileSource.dxfPhaseDReplay.carrier.sourceFileId !== binding.sourceFileId ||
    compileSource.dxfPhaseDReplay.carrier.sourceSha256 !== binding.sourceSha256
  )
    return blocked(
      'source-binding-mismatch',
      'The compile source no longer retains the exact public and replay Phase-D identity.',
    );

  const scopes = compileSource.scopes.filter(({ target }) => target.scopeKey === selected.scopeKey);
  const scope = scopes.length === 1 ? scopes[0] : null;
  const replay = scope?.writerReplay;
  if (
    !scope ||
    !replay ||
    replay.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 ||
    replay.job.techCardId !== compileSource.techCardId ||
    replay.job.scope.scopeKey !== selected.scopeKey ||
    !Number.isFinite(new Date(replay.createdAt).valueOf())
  )
    return blocked(
      'writer-replay-unavailable',
      'Exactly one matching retained writer replay is required for Draft CAD compilation.',
    );

  for (const command of commands) {
    if (!supported(command))
      return blocked('unsupported-command', unsupportedDetail(command), command);
  }

  const preview = buildPatternImportDxfPhaseEDraftCadPreviewV1(session, projection);
  if (!preview.previewReady)
    return blocked(
      'preview-blocked',
      preview.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );

  const sourceIds = new Set<string>();
  for (const piece of session.source.catalog.pieces) {
    sourceIds.add(piece.pieceId);
    sourceIds.add(piece.pieceLineKey);
    for (const contour of piece.contours) {
      sourceIds.add(contour.contourId);
      for (const vertex of contour.boundaryVertices) sourceIds.add(vertex.vertexId);
    }
  }
  const cutCommands = commands.filter(
    (command): command is Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'cut' }> =>
      command.tool === 'cut',
  );
  const spreadCommands = commands.filter(
    (command): command is Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'spread' }> =>
      command.tool === 'spread',
  );
  const duplicateCut = cutCommands.find(
    (command, index) =>
      cutCommands.findIndex(({ target }) => target.pieceId === command.target.pieceId) !== index,
  );
  if (duplicateCut)
    return blocked(
      'cut-geometry-blocked',
      'unsupported-piece-geometry: Minimal Cut compilation accepts one split per retained PieceSpec.',
      duplicateCut,
    );
  const spreadPair = new Map<
    string,
    Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'cut' }>
  >();
  const cutOwners = new Set<string>();
  for (const spread of spreadCommands) {
    const matches = cutCommands.filter(
      (cut) =>
        cut.payload.entityId === spread.payload.cutLineEntityId &&
        cut.target.pieceId === spread.target.pieceId &&
        cut.target.pieceLineKey === spread.target.pieceLineKey,
    );
    if (matches.length !== 1)
      return blocked(
        'spread-geometry-blocked',
        'anchor-unavailable: Spread must reference one active same-piece Cut guide.',
        spread,
      );
    const cut = matches[0]!;
    if (cutOwners.has(cut.commandId))
      return blocked(
        'spread-geometry-blocked',
        'invalid-input: One Cut guide can own only one Spread command.',
        spread,
      );
    cutOwners.add(cut.commandId);
    spreadPair.set(spread.commandId, cut);
  }
  // Retained point/line features commute with a topology mutation and are partitioned by its
  // executor. Running bare Cuts or paired Spreads last keeps canvas details on the source identity.
  const compileCommands = [
    ...commands.filter(({ tool }) => tool !== 'cut' && tool !== 'spread'),
    ...cutCommands.filter((cut) => !cutOwners.has(cut.commandId)),
    ...spreadCommands,
  ];

  let job = structuredClone(replay.job);
  const createdTopologyIds = new Set(sourceIds);
  const compiledFeatures: PatternImportDxfPhaseEDraftCadCompiledFeatureV1[] = [];
  let sharpenedRing: readonly PtMm[] | null = null;
  let pairedWrite: { commandId: string; cut: readonly PtMm[]; seam: readonly PtMm[] } | null = null;
  const createdPieceLineKeys = new Map<string, string>();
  for (const command of compileCommands) {
    const catalogTargets = session.source.catalog.pieces.filter(
      ({ pieceId, pieceLineKey }) =>
        pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
    );
    const writerPieces = job.pieces.filter(({ identity }) => identity === command.target.pieceId);
    const exactLocalEdit =
      permitsDraftCadLocalPieceEditV1(command.tool) &&
      createdPieceLineKeys.get(command.target.pieceId) === command.target.pieceLineKey;
    if ((!exactLocalEdit && catalogTargets.length !== 1) || writerPieces.length !== 1)
      return blocked(
        'writer-piece-unavailable',
        `Command target ${command.target.pieceId} does not resolve to one retained PieceSpec.`,
        command,
      );
    const sizes = writerPieces[0].sizes.filter(({ sizeToken }) => sizeToken === selected.sizeToken);
    if (sizes.length !== 1)
      return blocked(
        'writer-size-unavailable',
        `Piece ${command.target.pieceId} does not have one retained ${selected.sizeToken} size.`,
        command,
      );
    const size = sizes[0];
    const primitive = primitiveFor(preview.primitives, command);
    if (!primitive)
      return blocked(
        'preview-blocked',
        'The command does not have one exact primitive in the bound preview.',
        command,
      );

    if (command.tool === 'rectangle' || command.tool === 'pen') {
      const isPen = command.tool === 'pen';
      const geometryBlocker = isPen ? 'pen-geometry-blocked' : 'rectangle-geometry-blocked';
      const matches = isPen
        ? primitive.kind === 'path' && primitive.closed && primitive.role === 'outline'
        : primitive.kind === 'rectangle';
      if (!matches || !command.payload.newPiece)
        return blocked(
          'preview-blocked',
          `Create ${command.tool} requires an exact closed outline and piece identity.`,
          command,
        );
      const created = isPen
        ? executePatternImportDxfPhaseEDraftCadPenPieceV1(job, command, selected.sizeToken)
        : executePatternImportDxfPhaseEDraftCadRectanglePieceV1(job, command, selected.sizeToken);
      if (!created.ok)
        return blocked(
          geometryBlocker,
          `${created.blockers[0].code}: ${created.blockers[0].detail}`,
          command,
        );
      const { pieceId, pieceLineKey, contourId, vertexIds } = created.createdPiece;
      const topologyIds = [pieceId, pieceLineKey, contourId, ...vertexIds];
      if (
        topologyIds.some((identity) => createdTopologyIds.has(identity)) ||
        new Set(topologyIds).size !== topologyIds.length
      )
        return blocked(
          geometryBlocker,
          `duplicate-identity: ${command.tool} piece, line, contour and vertex identities must be globally distinct from the bound source and active piece creations.`,
          command,
        );
      for (const identity of topologyIds) createdTopologyIds.add(identity);
      job = structuredClone(created.job);
      createdPieceLineKeys.set(pieceId, pieceLineKey);
      compiledFeatures.push({
        commandId: command.commandId,
        entityId: command.payload.entityId,
        tool: command.tool,
        pieceId,
        sizeToken: selected.sizeToken,
        output: 'piece-create',
        createdTopology: { pieceLineKey, contourId, vertexIds },
      });
      continue;
    }

    if (command.tool === 'circle' || command.tool === 'ellipse') {
      if (primitive.kind !== command.tool || !command.payload.newPiece)
        return blocked(
          'preview-blocked',
          `Create ${command.tool} does not have one exact ${command.tool} primitive and piece identity.`,
          command,
        );
      const roundPiece = executePatternImportDxfPhaseEDraftCadRoundPieceV1(
        job,
        command,
        selected.sizeToken,
      );
      if (!roundPiece.ok)
        return blocked(
          'round-piece-geometry-blocked',
          `${roundPiece.blockers[0].code}: ${roundPiece.blockers[0].detail}`,
          command,
        );
      const topologyIds = [
        roundPiece.createdPiece.pieceId,
        roundPiece.createdPiece.pieceLineKey,
        roundPiece.createdPiece.contourId,
        ...roundPiece.createdPiece.vertexIds,
      ];
      if (
        topologyIds.some((identity) => createdTopologyIds.has(identity)) ||
        new Set(topologyIds).size !== topologyIds.length
      )
        return blocked(
          'round-piece-geometry-blocked',
          'duplicate-identity: Circle/Ellipse piece, line, contour and generated vertex identities must be globally distinct from the bound source and active piece creations.',
          command,
        );
      for (const identity of topologyIds) createdTopologyIds.add(identity);
      job = structuredClone(roundPiece.job);
      createdPieceLineKeys.set(
        roundPiece.createdPiece.pieceId,
        roundPiece.createdPiece.pieceLineKey,
      );
      compiledFeatures.push({
        commandId: command.commandId,
        entityId: command.payload.entityId,
        tool: command.tool,
        pieceId: roundPiece.createdPiece.pieceId,
        sizeToken: selected.sizeToken,
        output: 'piece-create',
        createdTopology: {
          pieceLineKey: roundPiece.createdPiece.pieceLineKey,
          contourId: roundPiece.createdPiece.contourId,
          vertexIds: roundPiece.createdPiece.vertexIds,
        },
      });
      continue;
    }

    if (command.tool === 'cut') {
      if (primitive.kind !== 'path' || primitive.role !== 'cut-intent')
        return blocked(
          'preview-blocked',
          'The Cut command does not have one exact cut-intent path in the bound preview.',
          command,
        );
      const cutResult = executePatternImportDxfPhaseEDraftCadCutGeometryV1(job, command);
      if (!cutResult.ok)
        return blocked(
          'cut-geometry-blocked',
          `${cutResult.blockers[0].code}: ${cutResult.blockers[0].detail}`,
          command,
        );
      job = cutResult.job;
      compiledFeatures.push({
        commandId: command.commandId,
        entityId: command.payload.entityId,
        tool: command.tool,
        pieceId: command.target.pieceId,
        sizeToken: selected.sizeToken,
        output: 'split',
        derivedPieceIds: cutResult.derivedPieceIdentities,
      });
      continue;
    }

    if (command.tool === 'spread') {
      const pairedCut = spreadPair.get(command.commandId);
      const cutPrimitive = pairedCut ? primitiveFor(preview.primitives, pairedCut) : null;
      if (command.payload.mode === 'parallel') {
        if (
          !hasSavedDraftGeometrySourceV1(input) ||
          !pairedCut ||
          commands.length !== 2 ||
          commands[0]?.commandId !== pairedCut.commandId ||
          commands[1]?.commandId !== command.commandId ||
          replay.retainedLineSplit ||
          primitive.kind !== 'path' ||
          primitive.role !== 'construction' ||
          cutPrimitive?.kind !== 'path' ||
          cutPrimitive.role !== 'cut-intent'
        )
          return blocked(
            'spread-geometry-blocked',
            'Use one registered Cut followed by one parallel opening on its original piece.',
            command,
          );
        const opened = applyDraftParallelSpreadV1(job, pairedCut, command);
        if (!opened.ok) return blocked('spread-geometry-blocked', opened.detail, command);
        job = opened.job;
        compiledFeatures.push(
          {
            commandId: pairedCut.commandId,
            entityId: pairedCut.payload.entityId,
            tool: 'cut',
            pieceId: pairedCut.target.pieceId,
            sizeToken: selected.sizeToken,
            output: 'slash-guide',
          },
          {
            commandId: command.commandId,
            entityId: command.payload.entityId,
            tool: 'spread',
            pieceId: command.target.pieceId,
            sizeToken: selected.sizeToken,
            output: 'parallel-spread',
          },
        );
        continue;
      }
      if (
        primitive.kind !== 'point' ||
        primitive.indicator !== 'cross' ||
        !pairedCut ||
        !cutPrimitive ||
        cutPrimitive.kind !== 'path' ||
        cutPrimitive.role !== 'cut-intent'
      )
        return blocked(
          'preview-blocked',
          'Spread does not have one exact pivot and one referenced cut-intent path.',
          command,
        );
      const spreadResult = executePatternImportDxfPhaseEDraftCadSpreadGeometryV1(
        job,
        pairedCut,
        command,
      );
      if (!spreadResult.ok)
        return blocked(
          'spread-geometry-blocked',
          `${spreadResult.blockers[0].code}: ${spreadResult.blockers[0].detail}`,
          command,
        );
      job = spreadResult.job;
      compiledFeatures.push(
        {
          commandId: pairedCut.commandId,
          entityId: pairedCut.payload.entityId,
          tool: pairedCut.tool,
          pieceId: pairedCut.target.pieceId,
          sizeToken: selected.sizeToken,
          output: 'slash-guide',
          derivedPieceIds: spreadResult.derivedPieceIdentities,
        },
        {
          commandId: command.commandId,
          entityId: command.payload.entityId,
          tool: command.tool,
          pieceId: command.target.pieceId,
          sizeToken: selected.sizeToken,
          output: 'spread',
          derivedPieceIds: spreadResult.derivedPieceIdentities,
        },
      );
      continue;
    }

    if (
      command.tool === 'edge-length' ||
      command.tool === 'move-point' ||
      command.tool === 'delete-point' ||
      command.tool === 'sharpen-corner'
    ) {
      if (
        command.tool === 'sharpen-corner' &&
        (!hasSavedDraftGeometrySourceV1(input) || commands.length !== 1)
      )
        return blocked(
          'sharpen-corner-geometry-blocked',
          'Review one corner from the exact current saved cut and sewing outlines.',
          command,
        );
      const edited =
        command.tool === 'edge-length'
          ? resizeDraftCadSelectedSizeEdgeV1(
              size,
              command,
              projection,
              selection.phaseD,
              pairedAllowance,
            )
          : editDraftCadSelectedSizeVertexV1(size, command, projection, selection.phaseD);
      if (!edited.ok)
        return blocked(
          edited.requiresPairedAllowance
            ? 'paired-allowance-authority-required'
            : `${command.tool}-geometry-blocked`,
          edited.detail,
          command,
        );
      if (edited.pairedAllowance && edited.size.seam) {
        if (!pairedAllowance || writerPieces[0]!.allowance.allowanceMm !== pairedAllowance.widthMm)
          return blocked(
            'edge-length-geometry-blocked',
            'The writer width differs from the verified native allowance.',
            command,
          );
        pairedWrite = {
          commandId: command.commandId,
          cut: edited.size.cut,
          seam: edited.size.seam,
        };
      }
      if (command.tool === 'sharpen-corner') sharpenedRing = edited.size.cut;
      Object.assign(size, edited.size);
      compiledFeatures.push({
        commandId: command.commandId,
        entityId: command.payload.entityId,
        tool: command.tool,
        pieceId: command.target.pieceId,
        sizeToken: selected.sizeToken,
        output:
          command.tool === 'edge-length'
            ? 'edge-length'
            : command.tool === 'move-point'
              ? 'moved-vertex'
              : command.tool === 'sharpen-corner'
                ? 'sharpened-corner'
                : 'deleted-vertex',
      });
      continue;
    }

    if (command.tool === 'add-point') {
      if (primitive.kind !== 'point' || primitive.indicator !== 'draft')
        return blocked(
          'preview-blocked',
          'Add point does not have one exact sealed-edge point in the bound preview.',
          command,
        );
      const addPoint = executePatternImportDxfPhaseEDraftCadAddPointGeometryV1(
        job,
        command,
        projection,
        selected.sizeToken,
      );
      if (!addPoint.ok)
        return blocked(
          'add-point-geometry-blocked',
          `${addPoint.blockers[0].code}: ${addPoint.blockers[0].detail}`,
          command,
        );
      // The executor seals its detached result. Keep the compiler's remaining feature pass mutable.
      job = structuredClone(addPoint.job);
      compiledFeatures.push({
        commandId: command.commandId,
        entityId: command.payload.entityId,
        tool: command.tool,
        pieceId: command.target.pieceId,
        sizeToken: selected.sizeToken,
        output: 'boundary-point',
      });
      continue;
    }

    const internal = internalFeature(command, primitive);
    if (!internal && command.tool === 'french-curve')
      return blocked(
        'preview-blocked',
        'The French curve needs distinct endpoints and a representable native path.',
        command,
      );
    let output: PatternImportDxfPhaseEDraftCadCompiledFeatureV1['output'];
    if (internal) {
      if (
        (command.tool === 'dart' || command.tool === 'fish-eye') &&
        !pathInsideCut(internal, size)
      )
        return blocked(
          'preview-blocked',
          'Keep the complete dart inside the selected cut and outside its holes.',
          command,
        );
      if (command.tool === 'dart' && command.payload.savedTip) {
        const tip = command.payload.savedTip,
          dart = size.internal[tip.index];
        if (
          !hasSavedDraftGeometrySourceV1(input) ||
          commands.length !== 1 ||
          dart?.label !== 'draft-cad:dart' ||
          dart.closed ||
          !sameDartVertices(dart.pts, tip.original)
        )
          return blocked(
            'source-binding-mismatch',
            'Review the original saved dart on its exact piece and size.',
            command,
          );
        const feet = [dart.pts[0]!, dart.pts[2]!],
          previewFeet = [internal.pts[0]!, internal.pts[2]!];
        if (
          !sameDartVertices(feet, previewFeet) &&
          !sameDartVertices(feet, [...previewFeet].reverse())
        )
          return blocked('source-binding-mismatch', 'The original dart feet changed.', command);
        dart.pts[1] = { ...command.payload.apexMm };
        output = 'moved-dart-tip';
      } else if (command.tool === 'fish-eye' && command.payload.savedMove) {
        const source = command.payload.savedMove;
        const dart = size.internal[source.index];
        if (
          !hasSavedDraftGeometrySourceV1(input) ||
          commands.length !== 1 ||
          dart?.label !== 'draft-cad:fish-eye' ||
          !dart.closed ||
          dart.graded ||
          dart.ranges.length !== 1 ||
          dart.ranges[0]?.path !== source.sourcePathId ||
          !pathInsideCut(dart, size) ||
          !sameDartVertices(dart.pts, source.original)
        )
          return blocked(
            'source-binding-mismatch',
            'Review the original saved fish-eye on its exact piece and size.',
            command,
          );
        dart.pts = internal.pts;
        output = 'moved-fish-eye';
      } else if (command.tool === 'french-curve' && command.payload.savedCurve) {
        const source = command.payload.savedCurve;
        const curve = size.internal[source.index];
        if (
          !hasSavedDraftGeometrySourceV1(input) ||
          commands.length !== 1 ||
          curve?.label !== 'draft-cad:french-curve' ||
          curve.closed ||
          curve.graded ||
          curve.ranges.length !== 1 ||
          curve.ranges[0]?.path !== source.sourcePathId ||
          !curve.authoredQuadratic ||
          !internal.authoredQuadratic ||
          !sameDartVertices(curve.authoredQuadratic, source.original)
        )
          return blocked(
            'source-binding-mismatch',
            'Review the original saved French curve on its exact piece and size.',
            command,
          );
        size.internal[source.index] = internal;
        output = 'moved-french-curve';
      } else {
        size.internal.push(internal);
        output = 'internal';
      }
    } else if (
      (command.tool === 'draft-point' || command.tool === 'point-only') &&
      primitive.kind === 'point' &&
      primitive.indicator === (command.tool === 'draft-point' ? 'draft' : 'point-only')
    ) {
      const at = primitive.pointMm;
      if (
        !pointInPolygon(at, size.cut) ||
        (size.cutLoops ?? []).some((loop) => pointInPolygon(at, loop))
      )
        return blocked('preview-blocked', 'Place the point inside the selected cut.', command);
      (size.pointMarks ??= []).push({ at: { ...at }, kind: command.tool });
      output = 'point-mark';
    } else if (
      command.tool === 'mark' &&
      command.payload.kind === 'text' &&
      primitive.kind === 'point' &&
      primitive.indicator === 'text' &&
      primitive.text
    ) {
      const at = primitive.pointMm;
      if (
        !pointInPolygon(at, size.cut) ||
        (size.cutLoops ?? []).some((loop) => pointInPolygon(at, loop))
      )
        return blocked(
          'preview-blocked',
          'Place the text anchor inside the selected cut.',
          command,
        );
      (size.textMarks ??= []).push({ at: { ...at }, text: primitive.text });
      output = 'text-mark';
    } else if (
      command.tool === 'mark' &&
      command.payload.kind === 'cross' &&
      primitive.kind === 'point' &&
      primitive.indicator === 'cross'
    ) {
      const center = primitive.pointMm;
      const { x, y } = center;
      const halfSpanMm = DRAFT_CAD_CROSS_MARK_HALF_SPAN_MM;
      if (
        !pointInPolygon(center, size.cut) ||
        closestOnPolyline(center, size.cut, true).d <= halfSpanMm ||
        (size.cutLoops ?? []).some(
          (loop) =>
            pointInPolygon(center, loop) || closestOnPolyline(center, loop, true).d <= halfSpanMm,
        )
      )
        return blocked('preview-blocked', 'Place the full cross inside the selected cut.', command);
      size.internal.push({
        kind: 'internal',
        label: 'draft-cad:cross',
        closed: false,
        // The middle return follows the horizontal arm already drawn, with no extra diagonal.
        pts: [
          { x: x - halfSpanMm, y },
          { x: x + halfSpanMm, y },
          { x, y },
          { x, y: y - halfSpanMm },
          { x, y: y + halfSpanMm },
        ],
        ...featureBase(),
      });
      output = 'internal';
    } else if (
      command.tool === 'mark' &&
      command.payload.kind === 'drill' &&
      primitive.kind === 'point' &&
      primitive.indicator === 'drill'
    ) {
      if (
        exactLocalEdit &&
        (!pointInPolygon(primitive.pointMm, size.cut) ||
          closestOnPolyline(primitive.pointMm, size.cut, true).d < 0.001)
      )
        return blocked(
          'preview-blocked',
          'Place the drill strictly inside the new cut boundary.',
          command,
        );
      size.drills.push({
        kind: 'drill',
        at: { x: primitive.pointMm.x, y: primitive.pointMm.y },
        form: 'point',
        ...featureBase(),
      });
      output = 'drill';
    } else if (
      command.tool === 'notch' &&
      command.payload.kind === 'single' &&
      primitive.kind === 'notch'
    ) {
      const notch = notchFeature(primitive, projection);
      if (!notch)
        return blocked(
          'preview-blocked',
          'The anchored notch edge is degenerate in the exact projection.',
          command,
        );
      if (
        size.notches.some(
          ({ at, authoredGroup }) =>
            authoredGroup && Math.hypot(at.x - notch.at.x, at.y - notch.at.y) <= 1.5,
        )
      )
        return blocked('preview-blocked', 'The notch overlaps a saved notch group.', command);
      size.notches.push(notch);
      output = 'notch';
    } else if (
      command.tool === 'notch' &&
      command.payload.kind !== 'single' &&
      primitive.kind === 'notch' &&
      primitive.strokes
    ) {
      const shape = command.payload.kind;
      const notches = primitive.strokes.map(
        ([at, end], index): NotchFeature => ({
          kind: 'notch',
          at: { ...at },
          seg: [{ ...at }, { ...end }],
          depthMm: Math.hypot(at.x - end.x, at.y - end.y),
          authoredGroup: { groupId: command.payload.entityId, shape, index },
          ...featureBase(),
        }),
      );
      if (
        notches.some(
          ({ at, seg, depthMm }) =>
            depthMm < 1 ||
            depthMm > PATIMPORT.notchMaxMm ||
            !pointInPolygon(seg[1], size.cut) ||
            !pathInsideCut({ pts: seg, closed: false }, size) ||
            size.notches.some(
              (existing) => Math.hypot(existing.at.x - at.x, existing.at.y - at.y) <= 1.5,
            ),
        )
      )
        return blocked(
          'preview-blocked',
          'Keep the full notch inside the cut with clearance from existing notches and holes.',
          command,
        );
      size.notches.push(...notches);
      output = 'notch';
    } else {
      return blocked(
        'preview-blocked',
        'The command primitive cannot be compiled losslessly to PieceSpec.',
        command,
      );
    }
    compiledFeatures.push({
      commandId: command.commandId,
      entityId: command.payload.entityId,
      tool: command.tool,
      pieceId: command.target.pieceId,
      sizeToken: selected.sizeToken,
      output,
    });
  }

  if (pairedAllowance && !pairedWrite)
    return blocked(
      'source-binding-mismatch',
      'The verified allowance edit no longer matches the writer.',
    );
  let written: ReturnType<typeof writeDxfDetailed>;
  try {
    written = writeDxfDetailed(job, { now: () => new Date(replay.createdAt) });
  } catch (error) {
    return blocked(
      'writer-failed',
      error instanceof Error ? error.message : 'The deterministic DXF writer failed.',
    );
  }

  for (const command of compileCommands) {
    if (
      command.tool !== 'edge-length' &&
      command.tool !== 'move-point' &&
      command.tool !== 'delete-point' &&
      command.tool !== 'sharpen-corner'
    )
      continue;
    if (command.tool === 'edge-length' && pairedWrite?.commandId !== command.commandId) continue;
    const matches = written.plan.blocks.filter(
      ({ identity, labelSize }) =>
        identity === command.target.pieceId && labelSize === command.payload.sizeToken,
    );
    const [block] = matches;
    if (!block || matches.length !== 1)
      return blocked(
        `${command.tool}-geometry-blocked`,
        'The edited outline lost its exact writer block.',
        command,
      );
    if (command.tool === 'edge-length') {
      if (
        !pairedWrite ||
        !block.seam ||
        !sameDraftAllowanceRingV1(
          block.cut,
          pairedWrite.cut.map((point) => applyAffine(block.transform, point)),
        ) ||
        !sameDraftAllowanceRingV1(
          block.seam,
          pairedWrite.seam.map((point) => applyAffine(block.transform, point)),
        )
      )
        return blocked(
          'edge-length-geometry-blocked',
          'The DXF writer would change the verified cut or sewing outline.',
          command,
        );
      continue;
    }
    if (command.tool === 'sharpen-corner') {
      const expected = sharpenedRing?.map((point) => applyAffine(block.transform, point));
      if (
        !expected ||
        !block.seam ||
        !sameDraftAllowanceRingV1(block.cut, expected) ||
        !sameDraftAllowanceRingV1(block.seam, expected)
      )
        return blocked(
          'sharpen-corner-geometry-blocked',
          'The DXF writer would change the sharp corner or another outline point.',
          command,
        );
      continue;
    }
    const holds = (x: PtMm, y: PtMm) => Math.hypot(x.x - y.x, x.y - y.y) <= 1e-7;
    const rings = block.seam ? [block.cut, block.seam] : [block.cut];
    if (command.tool === 'move-point') {
      const target = applyAffine(block.transform, command.payload.pointMm);
      if (rings.some((ring) => !ring.some((point) => holds(point, target))))
        return blocked(
          'move-point-geometry-blocked',
          'The DXF writer would omit the moved outline point.',
          command,
        );
      continue;
    }
    const { contourId, vertexId } = command.payload;
    const sourcePiece = projection.pieces.find(
      ({ pieceId, pieceLineKey }) =>
        pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
    );
    const vertices = sourcePiece?.contours.find(
      (contour) => contour.contourId === contourId,
    )?.vertices;
    const index = vertices?.findIndex((vertex) => vertex.vertexId === vertexId) ?? -1;
    if (!vertices || index < 0)
      return blocked(
        'delete-point-geometry-blocked',
        'The exact original outline point is unavailable.',
        command,
      );
    const [deleted, before, after] = [
      vertices[index]!,
      vertices[(index + vertices.length - 1) % vertices.length]!,
      vertices[(index + 1) % vertices.length]!,
    ].map(({ pointMm }) => applyAffine(block.transform, pointMm));
    const keepsBridge = (ring: readonly PtMm[]) =>
      !ring.some((point) => holds(point, deleted!)) &&
      ring.some((first, index) => {
        const second = ring[(index + 1) % ring.length]!;
        return (
          (holds(first, before!) && holds(second, after!)) ||
          (holds(first, after!) && holds(second, before!))
        );
      });
    if (rings.some((ring) => !keepsBridge(ring)))
      return blocked(
        'delete-point-geometry-blocked',
        'The DXF writer would change the exact joined edge.',
        command,
      );
  }

  for (const feature of compiledFeatures) {
    const topologyMutation = compiledFeatures.find(
      ({ output, pieceId }) =>
        (output === 'split' || output === 'spread') && pieceId === feature.pieceId,
    );
    const expectedPieceIds = feature.derivedPieceIds
      ? feature.derivedPieceIds
      : topologyMutation?.derivedPieceIds ?? ([feature.pieceId] as const);
    if (!expectedPieceIds?.length)
      return blocked(
        'writer-output-mismatch',
        `Compiled Cut target ${feature.pieceId}/${feature.sizeToken} lost its derived identities.`,
      );
    for (const expectedPieceId of expectedPieceIds) {
      const blocks = written.manifest.blocks.filter(
        ({ identity, sizeToken: blockSize }) =>
          identity === expectedPieceId &&
          (blockSize === feature.sizeToken || blockSize.toUpperCase() === 'UNI'),
      );
      if (blocks.length !== 1)
        return blocked(
          'writer-output-mismatch',
          `Compiled target ${expectedPieceId}/${feature.sizeToken} did not produce one exact writer block.`,
        );
    }
  }

  try {
    const readBack = readManifest(written.dxfText);
    if (!readBack || canonical(readBack) !== canonical(written.manifest))
      return blocked(
        'manifest-readback-mismatch',
        'The embedded manifest did not exact-roundtrip through the shared reader.',
      );
  } catch (error) {
    return blocked(
      'manifest-readback-mismatch',
      error instanceof Error
        ? `The embedded manifest could not be verified by the shared reader: ${error.message}`
        : 'The embedded manifest could not be verified by the shared reader.',
    );
  }

  const artifact = draftCadCompiledArtifactV1(
    session,
    compileSource.techCardId,
    selected.scopeKey,
    selected.sizeToken,
    job,
    written,
    compiledFeatures,
  );
  return deepFreeze({ ok: true as const, artifact, blockers: [] as const });
}

/** Common output envelope of the ordinary compiler and the exact saved-line compiler. */
export function draftCadCompiledArtifactV1(
  session: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1['session'],
  techCardId: number,
  scopeKey: string,
  sizeToken: string,
  job: WriteJob,
  written: Pick<ReturnType<typeof writeDxfDetailed>, 'dxfText' | 'manifest' | 'warnings'>,
  compiledFeatures: readonly PatternImportDxfPhaseEDraftCadCompiledFeatureV1[],
): PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 {
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GEOMETRY_COMPILE_V1,
    status: 'compiled-reimport-required' as const,
    source: {
      revision: session.source.revision,
      sourceFileId: session.source.phaseD.sourceFileId,
      sourceSha256: session.source.phaseD.sourceSha256,
      selectedGeometrySha256: session.source.phaseD.selectedGeometrySha256,
      catalogCanonicalSha256: session.source.catalog.canonicalSha256,
      sizeSelectionCanonicalSha256: session.source.catalog.sizeSelectionCanonicalSha256,
    },
    scope: { techCardId, scopeKey, sizeToken },
    compiledJob: job,
    dxfText: written.dxfText,
    manifest: written.manifest,
    warnings: written.warnings,
    compiledFeatures,
    reimport: {
      required: true as const,
      boundary: 'ordinary-import-semantics-phase-d-phase-e' as const,
      applyEligible: false as const,
    },
    claims: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_GEOMETRY_COMPILE_CLAIMS_V1,
  });
}

export function compilePatternImportDxfPhaseEDraftCadGeometryV1(
  input: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
  authority?: SavedDraftPairedAllowanceAuthorityV1,
): PatternImportDxfPhaseEDraftCadGeometryCompileResultV1 {
  try {
    const proof = authority
      ? readSavedDraftPairedAllowanceAuthorityV1(authority, input.session)
      : null;
    if (authority && !proof)
      return blocked(
        'source-binding-mismatch',
        'The saved allowance authority no longer belongs to this Draft.',
      );
    const result = compilePatternImportDxfPhaseEDraftCadGeometryUnsafeV1(input, proof);
    if (proof && !proof.current())
      return blocked('source-binding-mismatch', 'The saved allowance changed while compiling.');
    if (proof && result.ok) pairedAllowanceReviews.set(result.artifact, proof.current);
    return result;
  } catch {
    return blocked('invalid-input', 'Draft CAD compile input failed closed during validation.');
  }
}
