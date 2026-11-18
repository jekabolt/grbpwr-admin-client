import { RECORDED_TERMINAL_PRESS_PROFILE } from 'lib/cloth/domain/dxf-recorded-terminal-press-v1';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CardDraft, PieceSpec } from 'lib/pattern-import/types';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
  replayPatternImportDxfProductWriterV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-writer-replay-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  buildDxfPipelineSourcePathCarrierV2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
} from 'lib/pattern-import/dxf-pipeline-source-path-carrier-v2';
import {
  bindDxfProductPhaseDNativeStraightEdgesV3,
  bindDxfProductPhaseDSelectedNativeStraightEdgesV3,
  consumeDxfProductPhaseDNativeStraightEdgesV3,
  type DxfProductPhaseDNativeStraightEdgesProjectionV3,
} from 'lib/cloth/domain/dxf-product-phase-d-native-straight-edge-binding-v1';
import {
  buildPatternImportDxfPipelineHandoffV1,
  PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1,
} from 'lib/cloth/domain/pattern-import-dxf-pipeline-handoff-v1';
import {
  computePatternImportDxfBridgeBindingDigestsV1,
  computePatternImportDxfBridgeArtifactBindingSha256V1,
  type PatternImportDxfManifestBridgeViewV1,
} from 'lib/cloth/domain/pattern-import-dxf-handoff-bridge-v1';
import {
  buildDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffV1,
} from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import {
  DXF_EXACT_ASSEMBLY_GRAPH_V1,
  projectDxfExactAssemblyGraphCompileRequestV1,
  type DxfExactAssemblyGraphV1,
} from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import {
  compileDxfGarmentAssemblyMaterialStageV1,
  type DxfGarmentAssemblyMaterialCompileStageResultV1,
  type DxfGarmentAssemblyMaterialCompileStageRequestV1,
} from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import {
  PHASE2_BOUNDARY_SAMPLING_V1,
  type Phase2BoundarySamplingRequestV1,
} from 'lib/cloth/mesh/triangulation/phase2-boundary-sampling-v1';
import {
  readSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  disposeSavedFullAssemblySnapshotV1,
  type SavedFullAssemblySnapshotProjectionV1,
  SavedFullAssemblySnapshotErrorV1,
} from './saved-full-assembly-snapshot-production-v1';

export const SAVED_FULL_ASSEMBLY_COMPILE_SESSION_V1 =
  'saved-full-assembly-compile-session/1' as const;
export type SavedFullAssemblyCompileIntentV1 = Readonly<
  Pick<
    DxfExactAssemblyGraphV1,
    'pieces' | 'operations' | 'seams' | 'compile' | 'productionOrder'
  > & {
    documentId: string;
    revision: string;
    sizeToken: string;
    physicalSurface: { readonly mode: 'sewing-surface'; readonly seamAllowancePhysical: false };
  }
>;
export type SavedFullAssemblyCompileRequestV1 = Readonly<{
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  /** Only this original draft reference is used to authenticate the existing one-shot owner. */
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
  expected: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    serverAssemblyRevision: string;
    fullAssemblySnapshotSha256: string;
  }>;
  seedOperationNumber: number;
  intent: SavedFullAssemblyCompileIntentV1;
}>;
const CLAIMS = Object.freeze({
  generatedProductionSnapshotReader: true,
  freshAtPublicationOnly: true,
  durableGraphVerified: false,
  productAuthority: false,
  runtimeAuthority: false,
  assemblyScheduleExecuted: false,
  bodyPlacementReady: false,
  supportAttachmentPolicy: 'none',
} as const);
export type SavedFullAssemblyCompileEvidenceV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  sourceFileId: string;
  writerSha256: string;
  writerByteLength: number;
  writerManifestSha256: string;
  sizeSelectionSha256: string;
  authoringCatalogSha256: string;
  nativeBinding: DxfProductPhaseDNativeStraightEdgesProjectionV3['binding'];
  zeroAllowanceEquivalence: readonly Readonly<{
    pieceId: string;
    contourId: string;
    sha256: string;
  }>[];
  sourceCutHandoffSha256: string | null;
  nativeSewingHandoffSha256?: string;
  directedNativeSewingHandoffSha256?: string;
  nativeEdgeBindingSha256?: string;
  reversedNativeEdgeCount?: number;
  sourceSurface?: 'explicit-native-drawn-sewing';
  originalSourceSha256?: string;
  sewingHandoffSha256: string;
  fullAssemblySnapshotSha256: string;
  serverAssemblyRevision: string;
  outer: SavedFullAssemblySnapshotProjectionV1['outer'];
  freshReadCount: number;
}>;
export type SavedFullAssemblyCompileResultV1 = Readonly<{
  generation: number;
  compiled: boolean;
  sealed: boolean;
  compileResult: DxfGarmentAssemblyMaterialCompileStageResultV1 | null;
  /** Exact content-only request consumed by the real compiler; not an authority capability. */
  compileRequest: DxfGarmentAssemblyMaterialCompileStageRequestV1 | null;
  graph: DxfExactAssemblyGraphV1 | null;
  evidence: SavedFullAssemblyCompileEvidenceV1 | null;
  blockers: readonly Readonly<{ code: string; detail: string }>[];
  claims: typeof CLAIMS;
}>;
export type SavedFullAssemblyCompileSessionV1 = Readonly<{
  consume(
    request: SavedFullAssemblyCompileRequestV1,
    signal?: AbortSignal,
  ): Promise<SavedFullAssemblyCompileResultV1>;
  projectLatest(
    expectedGeneration: number,
    signal?: AbortSignal,
  ): Promise<SavedFullAssemblyCompileResultV1>;
  snapshot(): Readonly<{
    generation: number;
    busy: boolean;
    disposed: boolean;
    hasArtifact: boolean;
  }>;
  dispose(): void;
}>;
class Failure extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new Failure(code, detail);
}
const encoder = new TextEncoder();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const SHA = /^[0-9a-f]{64}$/;
function checkSignal(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'Saved full-assembly operation was cancelled.');
}
function link(signal: AbortSignal | undefined, child: AbortController): () => void {
  checkSignal(signal);
  if (!signal) return () => {};
  const cancel = () => child.abort();
  add.call(signal, 'abort', cancel, { once: true });
  if (aborted.call(signal)) child.abort();
  return () => remove.call(signal, 'abort', cancel);
}
/** Descriptor-only, bounded data capture; the authentic source owner/draft reference is handled separately. */
function capture<T>(input: T, { omitUndefinedFields = false } = {}): T {
  let nodes = 0,
    chars = 0;
  const active = new Set<object>();
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > 500_000 || depth > 48) fail('bounds', 'Input exceeds capture bounds.');
    if (value === undefined || value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      chars += value.length;
      if (chars > 64 * 1024 * 1024) fail('bounds', 'Input text exceeds capture bound.');
      return value;
    }
    if (!value || typeof value !== 'object' || active.has(value))
      fail('invalid-input', 'Input must be acyclic plain data.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', 'Unsupported input prototype.');
    const ds = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(ds);
    if (keys.some((k) => typeof k !== 'string'))
      fail('invalid-input', 'Symbol input fields are unsupported.');
    const dataKeys = (keys as string[]).filter((k) => !(array && k === 'length'));
    if (
      array &&
      (ds.length.value > 250_000 ||
        dataKeys.length !== ds.length.value ||
        dataKeys.some((k, i) => k !== String(i)))
    )
      fail('bounds', 'Arrays must be dense and bounded.');
    active.add(value);
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const k of dataKeys) {
      const d = ds[k];
      if (!('value' in d) || !d.enumerable || k === '__proto__')
        fail('invalid-input', 'Input accessors/hidden fields are unsupported.');
      if (!array && omitUndefinedFields && d.value === undefined) continue;
      Object.defineProperty(out, k, {
        value: copy(d.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(value);
    return out;
  };
  return copy(input, 0) as T;
}
function fields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    fail('invalid-input', 'Expected a plain request.');
  const ds = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(ds).length !== keys.length ||
    keys.some((k) => !ds[k] || !('value' in ds[k]) || !ds[k].enumerable)
  )
    fail('invalid-input', 'Request fields must be exact own data.');
  return Object.fromEntries(keys.map((k) => [k, ds[k].value]));
}
function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
async function hash(value: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(value).buffer)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
function blocked(generation: number, error: unknown): SavedFullAssemblyCompileResultV1 {
  return Object.freeze({
    generation,
    compiled: false,
    sealed: false,
    compileResult: null,
    compileRequest: null,
    graph: null,
    evidence: null,
    blockers: [
      {
        code:
          error instanceof Failure || error instanceof SavedFullAssemblySnapshotErrorV1
            ? error.code
            : 'invalid-input',
        detail: error instanceof Error ? error.message : 'Invalid saved full-assembly request.',
      },
    ],
    claims: CLAIMS,
  });
}
function writerPieces(draft: CardDraft): PieceSpec[] {
  const all = new Map<string, PieceSpec>();
  for (const scope of draft.scopes)
    for (const piece of scope.writerReplay?.job.pieces ?? []) {
      const old = all.get(piece.identity);
      if (old && canonical(old) !== canonical(piece))
        fail('writer-piece-drift', 'Conflicting retained writer piece identities.');
      all.set(piece.identity, piece);
    }
  return [...all.values()].sort((a, b) =>
    a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0,
  );
}
function sampling(
  handoff: DxfAssemblyHandoffV1,
  native: DxfProductPhaseDNativeStraightEdgesProjectionV3,
  sizeToken: string,
  targetEdgeMm: number,
  allowNativeReverse = false,
): Phase2BoundarySamplingRequestV1 {
  const used = new Set<object>();
  const pieces = handoff.pieces.map((piece) => {
    if (piece.contours.length !== 1)
      fail('unsupported-contour', 'One outer contour without holes is supported.');
    const contour = piece.contours[0];
    const edges = contour.vertices.map((start, i) => {
      const end = contour.vertices[(i + 1) % contour.vertices.length];
      const matches = native.edges.filter(
        (e) => e.pieceId === piece.id && e.contourId === contour.id && e.edgeIndex === i,
      );
      if (matches.length !== 1 || used.has(matches[0]))
        fail('native-edge-binding', 'Exact native edge occurrence missing or duplicated.');
      const edge = matches[0],
        d = edge.descriptor;
      used.add(edge);
      const vertexMatches = (v: typeof start, n: typeof edge.startVertex) =>
        v.id === n.vertexId &&
        v.source.sourceCurveId === n.sourceCurveId &&
        v.source.parameterSpace === n.parameterSpace &&
        v.source.sourceCurveT === n.sourceCurveT &&
        v.source.normalizedArc === n.normalizedArc;
      if (
        edge.sizeToken !== sizeToken ||
        (!allowNativeReverse && edge.contourDirection !== 'forward') ||
        !vertexMatches(start, edge.startVertex) ||
        !vertexMatches(end, edge.endVertex) ||
        d.startVertexId !== (edge.contourDirection === 'forward' ? start.id : end.id) ||
        d.endVertexId !== (edge.contourDirection === 'forward' ? end.id : start.id) ||
        d.path.sourcePathId !== edge.sourcePathId ||
        d.sourceFileId !== native.binding.sourceFileId ||
        canonical(d.startMm) !==
          canonical(edge.contourDirection === 'forward' ? start.positionMm : end.positionMm) ||
        canonical(d.endMm) !==
          canonical(edge.contourDirection === 'forward' ? end.positionMm : start.positionMm) ||
        d.native.curveKind !== 'line' ||
        d.native.parameterSpace !== 'unit' ||
        canonical(d.native.sourceCurveTRange) !== '[0,1]' ||
        d.native.chordErrorBoundMm !== 0 ||
        d.native.periodic ||
        d.native.transform.kind !== 'identity'
      )
        fail(
          'native-edge-binding',
          'Native source IDs, parameters, direction or exact coordinates drifted.',
        );
      return {
        edgeId: `${piece.id}/${contour.id}/edge-${i}`,
        pieceId: piece.id,
        ringId: contour.id,
        edgeIndex: i,
        startBoundaryVertexId: start.id,
        endBoundaryVertexId: end.id,
        native: {
          sourceFileId: native.binding.sourceFileId,
          ...d.native,
          ...(edge.contourDirection === 'reverse' ? { sourceCurveTRange: [1, 0] as const } : {}),
        },
      };
    });
    return {
      input: {
        pieceId: piece.id,
        shell: {
          id: contour.id,
          role: 'shell' as const,
          vertices: contour.vertices.map((v, i) => ({
            id: v.id,
            positionMm: v.positionMm,
            source: {
              contourId: contour.id,
              sourceCurveId: allowNativeReverse
                ? edges[i].native.sourceCurveId
                : v.source.sourceCurveId,
              sourceCurveParameterSpace: v.source.parameterSpace,
              sourceCurveT: allowNativeReverse
                ? edges[i].native.sourceCurveTRange[0]
                : v.source.sourceCurveT,
              normalizedArc: v.source.normalizedArc,
            },
          })),
        },
        holes: [],
        grainDegrees: piece.grainDegrees,
        seamEndpoints: [],
        options: {
          targetEdgeMm: 10,
          minInputEdgeMm: 1e-6,
          minTriangleAngleDegrees: 0.01,
          maxEdgeRatio: 1e9,
          maxRadiusEdgeRatio: 1e9,
          maxBoundaryErrorMm: 1e-9,
          collinearSinTolerance: 1e-12,
        },
      },
      edges,
    };
  });
  if (used.size !== native.edges.length)
    fail('native-edge-binding', 'Unused selected native edges are unsupported.');
  return {
    version: PHASE2_BOUNDARY_SAMPLING_V1,
    sourceFileId: native.binding.sourceFileId,
    targetEdgeMm,
    pieces,
    equalSeams: [],
  };
}

/** No runtime owner or durable graph authority is minted. The real compile artifact is retained. */
export function createSavedFullAssemblyCompileSessionV1(): SavedFullAssemblyCompileSessionV1 {
  let generation = 0,
    busy = false,
    disposed = false;
  let current: {
    generation: number;
    controller: AbortController;
    unlink: () => void;
    expected: SavedFullAssemblyCompileRequestV1['expected'];
    seed: number;
    result: SavedFullAssemblyCompileResultV1 | null;
  } | null = null;
  const revoke = () => {
    const old = current;
    current = null;
    old?.controller.abort();
    old?.unlink();
  };
  const fresh = async (
    ticket: NonNullable<typeof current>,
    operationSignal = ticket.controller.signal,
  ) => {
    const check = () => {
      checkSignal(operationSignal);
      checkSignal(ticket.controller.signal);
      if (disposed || current !== ticket)
        fail('stale-generation', 'Saved source generation changed.');
    };
    check();
    const receipt = await readSavedFullAssemblySnapshotV1(
      { row: ticket.expected.row, seedOperationNumber: ticket.seed },
      operationSignal,
    );
    try {
      check();
      const snapshot = projectSavedFullAssemblySnapshotV1(receipt);
      if (
        canonical(snapshot.row) !== canonical(ticket.expected.row) ||
        snapshot.serverAssemblyRevision !== ticket.expected.serverAssemblyRevision ||
        snapshot.snapshotSha256 !== ticket.expected.fullAssemblySnapshotSha256
      )
        fail(
          'saved-assembly-drift',
          'Fresh exact row, full Assembly graph or outer sidecar bytes changed.',
        );
      check();
      return snapshot;
    } finally {
      disposeSavedFullAssemblySnapshotV1(receipt);
    }
  };
  return Object.freeze({
    async consume(input, signal) {
      if (disposed) return blocked(generation, new Failure('disposed', 'Session is disposed.'));
      if (busy)
        return blocked(generation, new Failure('busy', 'Another source consume is active.'));
      try {
        checkSignal(signal);
      } catch (e) {
        return blocked(generation, e);
      }
      revoke();
      const ticket = {
        generation: ++generation,
        controller: new AbortController(),
        unlink: () => {},
        expected: null as unknown as SavedFullAssemblyCompileRequestV1['expected'],
        seed: 0,
        result: null as SavedFullAssemblyCompileResultV1 | null,
      };
      current = ticket;
      add.call(
        ticket.controller.signal,
        'abort',
        () => {
          ticket.result = null;
          ticket.unlink();
          if (current === ticket) current = null;
        },
        { once: true },
      );
      busy = true;
      const check = () => {
        checkSignal(ticket.controller.signal);
        if (disposed || current !== ticket)
          fail('stale-generation', 'Saved source generation changed.');
      };
      let freshReadCount = 0;
      const read = async () => {
        const r = await fresh(ticket);
        check();
        freshReadCount++;
        return r;
      };
      const stage = async <T>(work: () => Promise<T>): Promise<T> => {
        check();
        const value = await work();
        check();
        await read();
        check();
        return value;
      };
      try {
        ticket.unlink = link(signal, ticket.controller);
        const top = fields(input, [
          'sourceOwner',
          'sourceRequest',
          'expected',
          'seedOperationNumber',
          'intent',
        ]);
        const sr = fields(top.sourceRequest, [
          'schemaVersion',
          'sourceFileId',
          'sourceSha256',
          'techCardId',
          'scopeKey',
          'patternLineKey',
          'cardLockVersion',
          'draft',
        ]);
        const request = {
          ...capture({ ...top, sourceOwner: null, sourceRequest: null }),
          sourceOwner: top.sourceOwner,
          sourceRequest: { ...capture({ ...sr, draft: null }), draft: sr.draft },
        } as unknown as SavedFullAssemblyCompileRequestV1;
        fields(request.expected, ['row', 'serverAssemblyRevision', 'fullAssemblySnapshotSha256']);
        fields(request.intent, [
          ...(Object.hasOwn(request.intent, 'productionOrder') ? ['productionOrder'] : []),
          'documentId',
          'revision',
          'sizeToken',
          'physicalSurface',
          'pieces',
          'operations',
          'seams',
          'compile',
        ]);
        if (
          !SHA.test(request.expected.fullAssemblySnapshotSha256) ||
          !Number.isSafeInteger(request.seedOperationNumber) ||
          request.seedOperationNumber < 1 ||
          request.intent.physicalSurface.mode !== 'sewing-surface' ||
          request.intent.physicalSurface.seamAllowancePhysical !== false ||
          !Array.isArray(request.intent.pieces) ||
          request.intent.pieces.length < 2 ||
          request.intent.pieces.length > 64
        )
          fail(
            'unsupported-profile',
            'Explicit >=2-piece single-row sewing intent and fresh snapshot binding are required.',
          );
        ticket.expected = request.expected;
        ticket.seed = request.seedOperationNumber;
        const consumed = consumeDxfProductSavedNativeCompilerSourceV1(
          request.sourceOwner,
          request.sourceRequest,
        );
        if (!consumed.ok) fail(consumed.blockers[0].code, consumed.blockers[0].detail);
        if (canonical(consumed.value.row) !== canonical(request.expected.row))
          fail(
            'saved-source-row-mismatch',
            'Genuine saved source row does not match all eight expected fields.',
          );
        const source = consumed.value;
        const nativeSewing = source.nativeSewingReplay;
        if (nativeSewing && !nativeSewing.replayReady)
          fail('native-sewing-unavailable', nativeSewing.blockers.map((b) => b.detail).join('; '));
        const draft = capture(source.draft);
        if (nativeSewing?.replayReady) {
          draft.dxfProvenance = capture(nativeSewing.pipeline);
          draft.dxfPhaseDReplay = capture(nativeSewing.replay);
        }
        const before = await read();
        check();
        const chosen = await stage(() =>
          selectPatternImportDxfProductDraftPhaseDSizeV1(
            draft,
            source.row.scopeKey,
            request.intent.sizeToken,
          ),
        );
        if (!chosen.ok) fail('phase-d-selection-blocked', chosen.blockers[0].detail);
        const selection = chosen.selection;
        const catalog = await stage(() =>
          buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
            draft,
            source.row.scopeKey,
            request.intent.sizeToken,
          ),
        );
        if (!catalog.ok) fail('authoring-catalog-blocked', catalog.blockers[0].detail);
        if (
          catalog.catalog.sizeSelectionCanonicalSha256 !== selection.selection.canonicalSha256 ||
          catalog.catalog.pieces.length !== request.intent.pieces.length ||
          request.intent.pieces.some(
            (p) =>
              catalog.catalog.pieces.filter(
                (c) => c.pieceId === p.pieceId && c.pieceLineKey === p.pieceLineKey,
              ).length !== 1,
          )
        )
          fail(
            'piece-line-binding',
            'Explicit native piece/card-line bindings differ from the genuine selected draft catalog.',
          );
        if (
          selection.phaseD.sourceSha256 !== source.row.sha256 ||
          selection.phaseD.source.sourceFileId !== source.sourceFileId
        )
          fail('source-binding', 'Selected Phase-D source differs from genuine saved bytes.');
        const scopes = draft.scopes.filter((s) => s.target.scopeKey === source.row.scopeKey);
        if (scopes.length !== 1 || !scopes[0].writerReplay)
          fail('writer-replay-unavailable', 'Exact retained writer replay is required.');
        const scope = scopes[0],
          replay = scope.writerReplay!;
        const reconstruction = source.reconstruction;
        if (
          replay.job.techCardId !== source.row.techCardId ||
          (reconstruction &&
            (reconstruction.kind !== 'foreign-saved-dxf' ||
              reconstruction.originalSourceSha256 !== source.row.sha256))
        )
          fail('writer-replay-mismatch', 'Writer card or original source differs.');
        const writer = await stage(() =>
          replayPatternImportDxfProductWriterV1({
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
            replay,
            finalManifest: scope.manifest,
            expected: {
              scopeKey: source.row.scopeKey,
              exportSha256: reconstruction?.canonicalWriterSha256 ?? source.row.sha256,
            },
          }),
        );
        if (!writer.ok) fail('writer-replay-mismatch', writer.blockers[0].detail);
        if (!reconstruction && writer.receipt.byteLength !== source.row.sizeBytes)
          fail('writer-replay-mismatch', 'Fresh writer byte length differs from the saved source.');
        const { exportSha256: writerSha256, byteLength: writerByteLength } = writer.receipt;
        const writerManifestSha256 = await stage(() =>
          hash(encoder.encode(canonical(scope.manifest))),
        );
        // Replay verified the complete file. The handoff must contain exactly the piece/size
        // pairs in the freshly selected Phase-D carrier. Worker records can carry undefined
        // optional values, while the source-path transport expects absent optional fields.
        const selectedPieceIds = new Set(selection.selection.pieceIds);
        const selectedPieces = capture(
          writerPieces(draft)
            .filter(({ identity }) => selectedPieceIds.has(identity))
            .map((piece) => ({
              ...piece,
              sizes: piece.sizes.filter(
                ({ sizeToken }) => sizeToken === selection.selection.sizeToken,
              ),
            })),
          { omitUndefinedFields: true },
        );
        const carrier = await stage(() =>
          buildDxfPipelineSourcePathCarrierV2({
            schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
            source: selection.phaseD.source,
            contours: selection.phaseD.contours,
            pieces: selectedPieces,
            pipeline: selection.pipeline,
            sourceSha256: selection.phaseD.sourceSha256,
          }),
        );
        if (!carrier.ok)
          fail(
            'source-path-binding-blocked',
            carrier.blockers.map(({ field, detail }) => `${field}: ${detail}`).join('; '),
          );
        const nativeExpected = {
          sourceFileId: source.sourceFileId,
          sourceSha256: source.row.sha256,
          selectedGeometrySha256: selection.selection.selectedGeometrySha256,
        };
        const bound = await stage(() =>
          (nativeSewing
            ? bindDxfProductPhaseDSelectedNativeStraightEdgesV3
            : bindDxfProductPhaseDNativeStraightEdgesV3)(
            source.nativeRead.owner,
            carrier.artifact,
            nativeExpected,
          ),
        );
        if (!bound.ok) fail('native-binding-blocked', bound.blockers[0].detail);
        const projected = consumeDxfProductPhaseDNativeStraightEdgesV3(bound.owner, nativeExpected);
        if (!projected.ok) fail('native-binding-blocked', projected.blockers[0].detail);
        const native = projected.projection;
        const m = scope.manifest;
        const manifest: PatternImportDxfManifestBridgeViewV1 = {
          v: m.v,
          generator: m.generator,
          createdAt: m.createdAt,
          techCardId: m.techCardId,
          units: m.units,
          cutLayerIsFinal: m.cutLayerIsFinal,
          // This view describes the directly decoded saved file. The exact original writer
          // manifest stays unchanged and separately hashed above; its upstream files remain there.
          source: {
            sizeEncoding: m.source.sizeEncoding,
            variant: m.source.variant,
            ...(m.source.generatedFusing === true ? { generatedFusing: true as const } : {}),
            ...(m.source.presegmentedIdentities
              ? { presegmentedIdentities: [...m.source.presegmentedIdentities] }
              : {}),
            files: [
              {
                name: scope.filename,
                sha256: source.row.sha256,
                bytes: source.row.sizeBytes,
                kind: 'dxf',
                pages: 1,
              },
            ],
            scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
            sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
          },
        };
        const selections = selection.pipeline.carrier!.pieces.map((p) => ({
          pieceId: p.pieceId,
          sizeToken: p.sizeToken,
        }));
        const digests = await stage(() =>
          computePatternImportDxfBridgeBindingDigestsV1(manifest, selectedPieces, selections),
        );
        if (!digests.ok) fail('handoff-binding-blocked', digests.errors.join('; '));
        const unsigned = {
          documentId: request.intent.documentId,
          revision: request.intent.revision,
          exporterId: nativeSewing
            ? 'grbpwr.saved-native-drawn-sewing'
            : 'grbpwr.pattern-import.writeDxfDetailed',
          exporterVersion: SAVED_FULL_ASSEMBLY_COMPILE_SESSION_V1,
          exportSha256: nativeSewing ? source.row.sha256 : writerSha256,
          manifestIdentitySha256: digests.value.manifestIdentitySha256,
          selectedGeometrySha256: digests.value.selectedGeometrySha256,
          manifestCreatedAt: manifest.createdAt,
          manifestGenerator: manifest.generator,
          techCardId: manifest.techCardId,
          provenanceKind: 'untrusted-product' as const,
          corpusEntryId: null,
        };
        const binding = await stage(() =>
          computePatternImportDxfBridgeArtifactBindingSha256V1(unsigned),
        );
        if (!binding.ok) fail('handoff-binding-blocked', binding.code);
        const intent = request.intent;
        const seams = intent.seams.map((s) => {
          if (s.sides.length !== 2)
            fail('seam-binding', 'Exactly two explicit seam sides are required.');
          const side = (value: (typeof s.sides)[number]) => ({
            pieceId: value.pieceId,
            contourId: value.contourId,
            anchors: value.anchors,
            direction: value.direction,
          });
          return {
            id: s.id,
            operationId: s.clientOperationId,
            mapping: s.mapping,
            lengthRatio: s.lengthRatio,
            sides: [side(s.sides[0]), side(s.sides[1])] as const,
          };
        });
        const operations = intent.operations.map((o) => ({
          id: o.clientOperationId,
          stage: o.stage,
          order: o.order,
          kind: o.kind,
          seamIds: o.seamIds,
        }));
        const materials = intent.compile.materials.map((material) => ({
          id: material.id,
          materialRevision: material.revision,
          pieceIds: intent.pieces
            .filter((p) => p.materialId === material.id && p.materialRevision === material.revision)
            .map((p) => p.pieceId),
        }));
        const surface = await stage(() =>
          buildPatternImportDxfPipelineHandoffV1({
            schemaVersion: PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1,
            sourceFileId: source.sourceFileId,
            pipeline: selection.pipeline,
            manifest,
            pieces: selectedPieces,
            binding: { ...unsigned, artifactBindingSha256: binding.artifactBindingSha256 },
            physicalSurface: nativeSewing
              ? intent.physicalSurface
              : { mode: 'cut-surface', seamAllowancePhysical: true },
            seams,
            operations,
            materials,
          }),
        );
        if (!surface.ok)
          fail('cut-handoff-blocked', surface.blockers.map((b) => b.detail).join('; '));
        // Prove native coordinates/IDs first. Coordinates only confirm already-selected exact IDs.
        const sourceSampling = sampling(
          surface.handoff,
          native,
          intent.sizeToken,
          intent.compile.targetEdgeMm,
          !!nativeSewing,
        );
        const zeroAllowanceEquivalence: { pieceId: string; contourId: string; sha256: string }[] =
          [];
        if (!nativeSewing) {
          if (m.cutLayerIsFinal !== true || m.allowanceMm !== 0 || Object.is(m.allowanceMm, -0))
            fail('unsupported-cut-surface', 'Exact saved manifest allowance zero is required.');
          for (const piece of surface.handoff.pieces) {
            const matches = replay.job.pieces.filter((p) => p.identity === piece.id);
            const manifestPieces = m.pieces.filter((p) => p.identity === piece.id);
            const p = matches[0],
              sizes = p?.sizes.filter((s) => s.sizeToken === intent.sizeToken) ?? [];
            const s = sizes[0],
              c = piece.contours[0];
            if (
              matches.length !== 1 ||
              manifestPieces.length !== 1 ||
              manifestPieces[0].allowanceMm !== 0 ||
              Object.is(manifestPieces[0].allowanceMm, -0) ||
              !p ||
              p.allowance.meaning !== 'cut' ||
              p.allowance.allowanceMm !== 0 ||
              Object.is(p.allowance.allowanceMm, -0) ||
              sizes.length !== 1 ||
              !s?.seam ||
              s.cutLoops?.length ||
              piece.contours.length !== 1 ||
              c.role !== 'cut-boundary' ||
              canonical(s.cut) !== canonical(s.seam) ||
              canonical(s.cut.map((v) => [v.x, v.y])) !==
                canonical(c.vertices.map((v) => v.positionMm))
            )
              fail(
                'unsupported-cut-surface',
                'Exact ordered zero-allowance cut/seam/native equivalence is missing.',
              );
            const sha256 = await stage(() =>
              hash(
                encoder.encode(
                  `saved-full-assembly-zero-allowance/1\0${canonical({ pieceId: piece.id, contour: c, sizeToken: intent.sizeToken, cut: s.cut, seam: s.seam, nativeEdges: native.edges.filter((e) => e.pieceId === piece.id) })}`,
                ),
              ),
            );
            zeroAllowanceEquivalence.push({ pieceId: piece.id, contourId: c.id, sha256 });
          }
        }
        const sewing = nativeSewing
          ? await stage(() =>
              buildDxfAssemblyHandoffV1({
                schemaVersion: surface.handoff.schemaVersion,
                source: {
                  ...surface.handoff.source,
                  provenanceKind: unsigned.provenanceKind,
                },
                physicalSurface: surface.handoff.physicalSurface,
                pieces: surface.handoff.pieces.map((p) => ({
                  ...p,
                  contours: p.contours.map((c) => {
                    const ring = sourceSampling.pieces.find((s) => s.input.pieceId === p.id)!.input
                      .shell;
                    return {
                      ...c,
                      vertices: c.vertices.map((v, i) => ({
                        ...v,
                        source: {
                          ...v.source,
                          sourceCurveId: ring.vertices[i].source.sourceCurveId,
                          sourceCurveT: ring.vertices[i].source.sourceCurveT,
                        },
                      })),
                    };
                  }),
                })),
                seams,
                operations,
                materials,
              }),
            )
          : await stage(() =>
              buildDxfAssemblyHandoffV1({
                schemaVersion: surface.handoff.schemaVersion,
                source: {
                  ...surface.handoff.source,
                  provenanceKind: 'untrusted-product',
                  corpusEntryId: null,
                },
                physicalSurface: intent.physicalSurface,
                pieces: surface.handoff.pieces.map((p) => ({
                  ...p,
                  contours: p.contours.map((c) => ({ ...c, role: 'sewing-boundary' as const })),
                })),
                seams,
                operations,
                materials,
              }),
            );
        if (!sewing.ok) fail('sewing-handoff-blocked', sewing.errors.join('; '));
        const graph: DxfExactAssemblyGraphV1 = {
          schemaVersion: DXF_EXACT_ASSEMBLY_GRAPH_V1,
          profile: intent.productionOrder
            ? RECORDED_TERMINAL_PRESS_PROFILE
            : 'single-saved-row-size-adjacent-native-stitch',
          ...(intent.productionOrder ? { productionOrder: intent.productionOrder } : {}),
          row: source.row,
          serverAssemblyRevision: before.serverAssemblyRevision,
          source: {
            sourceFileId: source.sourceFileId,
            nativeDxfSha256: source.row.sha256,
            sizeToken: intent.sizeToken,
            handoffCanonicalSha256: sewing.value.seal.canonicalSha256,
            handoffSource: sewing.value.source,
          },
          pieces: intent.pieces,
          operations: intent.operations,
          seams: intent.seams,
          compile: intent.compile,
        };
        const projection = await stage(() =>
          projectDxfExactAssemblyGraphCompileRequestV1(
            {
              graph,
              // The pure graph consumes AO content only. Keep the complete snapshot (including
              // binary outer bytes) in `before` for all fresh joins and returned CAS evidence.
              assemblySnapshot: {
                row: before.row,
                serverAssemblyRevision: before.serverAssemblyRevision,
                operations: before.operations,
                ...(intent.productionOrder
                  ? { operationsPayloadCanonicalJson: before.operationsPayloadCanonicalJson }
                  : {}),
                seams: before.seams,
              },
              sourceHandoff: sewing.value,
              sourceSampling: nativeSewing
                ? sourceSampling
                : sampling(sewing.value, native, intent.sizeToken, intent.compile.targetEdgeMm),
            },
            ticket.controller.signal,
          ),
        );
        const compileResult = await stage(() =>
          compileDxfGarmentAssemblyMaterialStageV1(projection.request, ticket.controller.signal),
        );
        check();
        const result: SavedFullAssemblyCompileResultV1 = {
          generation: ticket.generation,
          compiled: compileResult.compiled,
          sealed: compileResult.sealed,
          compileResult,
          compileRequest: projection.request,
          graph,
          evidence: {
            row: source.row,
            sourceFileId: source.sourceFileId,
            writerSha256,
            writerByteLength,
            writerManifestSha256,
            sizeSelectionSha256: selection.selection.canonicalSha256,
            authoringCatalogSha256: catalog.catalog.canonicalSha256,
            nativeBinding: native.binding,
            zeroAllowanceEquivalence,
            sourceCutHandoffSha256: nativeSewing ? null : surface.handoff.seal.canonicalSha256,
            ...(nativeSewing
              ? {
                  nativeSewingHandoffSha256: surface.handoff.seal.canonicalSha256,
                  directedNativeSewingHandoffSha256: sewing.value.seal.canonicalSha256,
                  nativeEdgeBindingSha256: native.binding.nativeStraightEdgesSha256,
                  reversedNativeEdgeCount: native.edges.filter(
                    (e) => e.contourDirection === 'reverse',
                  ).length,
                  sourceSurface: 'explicit-native-drawn-sewing' as const,
                  originalSourceSha256: source.row.sha256,
                }
              : {}),
            sewingHandoffSha256: sewing.value.seal.canonicalSha256,
            fullAssemblySnapshotSha256: before.snapshotSha256,
            serverAssemblyRevision: before.serverAssemblyRevision,
            outer: before.outer,
            freshReadCount,
          },
          blockers: [
            ...compileResult.blockers.map((b) => ({
              code: b.code,
              detail: `${b.stage}: ${b.detail}`,
            })),
            {
              code: 'durable-full-assembly-graph-unavailable',
              detail:
                'The full graph was explicitly authored and compiled, but no registered, fresh verified durable full-graph component exists. This artifact is not product/runtime admission.',
            },
          ],
          claims: CLAIMS,
        };
        ticket.result = structuredClone(result);
        check();
        return structuredClone(result);
      } catch (error) {
        if (current === ticket) revoke();
        return blocked(ticket.generation, error);
      } finally {
        busy = false;
      }
    },
    async projectLatest(expectedGeneration, signal) {
      const ticket = current;
      try {
        checkSignal(signal);
        if (!ticket || !ticket.result || ticket.generation !== expectedGeneration || disposed)
          fail('stale-generation', 'No current artifact for the exact expected generation.');
        const operation = new AbortController();
        const unlinks: (() => void)[] = [];
        try {
          unlinks.push(link(ticket.controller.signal, operation));
          unlinks.push(link(signal, operation));
          await fresh(ticket, operation.signal);
          checkSignal(operation.signal);
          if (current !== ticket || disposed)
            fail('stale-generation', 'Saved generation changed during read.');
          return structuredClone(ticket.result);
        } finally {
          unlinks.forEach((unlink) => unlink());
        }
      } catch (error) {
        if (
          current === ticket &&
          ((error instanceof Failure && error.code === 'saved-assembly-drift') ||
            (error instanceof SavedFullAssemblySnapshotErrorV1 &&
              ['row-drift', 'assembly-drift', 'join-drift'].includes(error.code)))
        )
          revoke();
        return blocked(ticket?.generation ?? generation, error);
      }
    },
    snapshot: () =>
      Object.freeze({
        generation,
        busy,
        disposed,
        hasArtifact: !!current?.result && !aborted.call(current.controller.signal),
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      revoke();
    },
  });
}
