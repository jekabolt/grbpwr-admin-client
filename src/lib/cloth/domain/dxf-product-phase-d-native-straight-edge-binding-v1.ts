import {
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { DxfProductPhaseDReplayStageOutputV1 } from '../../pattern-import/dxf-product-phase-d-replay-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import {
  DXF_PIPELINE_CONTENT_BINDING_V2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
  type DxfPipelineSourcePathArtifactV2,
  type DxfPipelineSourcePathVertexV2,
} from '../../pattern-import/dxf-pipeline-source-path-carrier-v2';
import { DXF_PIPELINE_CONTENT_BINDING_V1 } from '../../pattern-import/dxf-pipeline-provenance-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeAuthorityV1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  type DxfSourceNativeStraightEdgeDescriptorV1,
  type DxfSourceNativeStraightEdgeOwnerV1,
} from '../../pattern-import/dxf-source-native-straight-edge-authority-v1';

export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_REQUEST_V1 =
  'dxf-product-phase-d-native-straight-edge-binding-request/1' as const;
export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_V1 =
  'dxf-product-phase-d-native-straight-edge-binding/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_DEPTH = 40;
const MAX_NODES = 500_000;
const MAX_ARRAY = 200_000;
const MAX_KEYS = 1_000_000;
const MAX_TEXT_BYTES = 32 * 1024 * 1024;
const MAX_CANONICAL_BYTES = 64 * 1024 * 1024;
const textEncoder = new TextEncoder();

type SuccessfulSelection = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;
type SuccessfulReplay = Extract<DxfProductPhaseDReplayStageOutputV1, { replayReady: true }>;

export type DxfProductPhaseDNativeStraightEdgeBindingRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_REQUEST_V1;
  owner: DxfSourceNativeStraightEdgeOwnerV1;
  sourceFileId: string;
  sourceSha256: string;
  selection: SuccessfulSelection;
  phaseDReplay: SuccessfulReplay;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
}>;

export type DxfProductPhaseDNativeStraightEdgeSelectedEdgeV1 = Readonly<{
  occurrenceId: string;
  pieceId: string;
  sizeToken: string;
  contourId: string;
  sourcePathId: number;
  edgeIndex: number;
  closing: boolean;
  direction: 'forward' | 'reverse';
  startBoundaryVertexId: string;
  endBoundaryVertexId: string;
  sourceCurveId: string;
  directedSourceCurveTRange: readonly [0, 1] | readonly [1, 0];
  descriptor: DxfSourceNativeStraightEdgeDescriptorV1;
}>;

export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_CLAIMS_V1 = Object.freeze({
  sourceOwnerGenuine: true,
  sourceOwnerConsumedExactlyOnce: true,
  sourceOwnerAuthorityShaRecomputed: true,
  phaseDSelectionAndReplayExactBound: true,
  selectedCatalogEdgeOccurrencesExactBound: true,
  unrelatedSourceDescriptorsAllowed: true,
  endpointInferenceUsed: false,
  parameterSpaceInferenceUsed: false,
  includesRawDxf: false,
  includesTags: false,
  includesAst: false,
  includesBytes: false,
  sourceAuthenticityVerified: false,
  serverAuthenticityVerified: false,
  handoffIntegrated: false,
  phase2RequestIntegrated: false,
  savedReloadAccepted: false,
  productionReady: false,
} as const);

export type DxfProductPhaseDNativeStraightEdgeBindingV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_V1;
  sourceFileId: string;
  sourceSha256: string;
  sourceNativeAuthoritySha256: string;
  fullSelectedGeometrySha256: string;
  selectedGeometrySha256: string;
  sizeSelectionCanonicalSha256: string;
  catalogCanonicalSha256: string;
  scopeKey: string;
  sizeToken: string;
  pieceIds: readonly string[];
  selectedEdges: readonly DxfProductPhaseDNativeStraightEdgeSelectedEdgeV1[];
  selectedDescriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[];
  selectedEdgeCount: number;
  closingEdgeCount: number;
  reverseEdgeCount: number;
  canonicalSha256: string;
  claims: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_CLAIMS_V1;
}>;

export type DxfProductPhaseDNativeStraightEdgeBindingBlockerCodeV1 =
  | 'invalid-input'
  | 'saved-reload-forbidden'
  | 'phase-d-binding-mismatch'
  | 'catalog-binding-mismatch'
  | 'source-native-owner-forged'
  | 'source-native-owner-stale'
  | 'source-native-owner-rejected'
  | 'source-native-projection-incomplete'
  | 'authority-sha-drift'
  | 'selected-edge-missing'
  | 'selected-edge-duplicate'
  | 'selected-edge-binding-mismatch'
  | 'sha256-unavailable';

export type DxfProductPhaseDNativeStraightEdgeBindingBlockerV1 = Readonly<{
  code: DxfProductPhaseDNativeStraightEdgeBindingBlockerCodeV1;
  detail: string;
}>;

export type DxfProductPhaseDNativeStraightEdgeBindingResultV1 =
  | Readonly<{
      ok: true;
      binding: DxfProductPhaseDNativeStraightEdgeBindingV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      binding: null;
      blockers: readonly [DxfProductPhaseDNativeStraightEdgeBindingBlockerV1];
    }>;

export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_CONTRACT_V1 = Object.freeze({
  ownerInput: 'genuine one-shot DxfSourceNativeStraightEdgeOwnerV1 only',
  projectionCallsPerAcceptedRequest: 1,
  phaseDCompatibility: 'additive companion; all existing V1 carriers and digests remain unchanged',
  selectedEdgeIdentity:
    'PathId + sourceCurveId + adjacent boundary vertex IDs + directed occurrence index',
  closingEdgeRequiredForClosedContours: true,
  reverseDirectionRetainsDirectedUnitRange: true,
  unrelatedDescriptorsAllowed: true,
  savedReloadAccepted: false,
  sourceAuthenticityClaim: false,
  serverAuthenticityClaim: false,
  handoffIntegrated: false,
  phase2RequestIntegrated: false,
  productionReady: false,
} as const);

class BindingFailure extends Error {
  constructor(
    readonly code: DxfProductPhaseDNativeStraightEdgeBindingBlockerCodeV1,
    message: string,
  ) {
    super(message);
  }
}

type SnapshotBudget = {
  nodes: number;
  keys: number;
  textBytes: number;
  active: Set<object>;
};

function fail(code: DxfProductPhaseDNativeStraightEdgeBindingBlockerCodeV1, detail: string): never {
  throw new BindingFailure(code, detail);
}

function blocked(
  code: DxfProductPhaseDNativeStraightEdgeBindingBlockerCodeV1,
  detail: string,
): DxfProductPhaseDNativeStraightEdgeBindingResultV1 {
  return Object.freeze({
    ok: false as const,
    binding: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      DxfProductPhaseDNativeStraightEdgeBindingBlockerV1,
    ],
  });
}

function exactRoot(value: unknown): {
  owner: unknown;
  rest: Record<string, unknown>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', 'Binding request must be one exact plain record.');
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      fail('invalid-input', 'Binding request must use Object.prototype.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expected = [
      'schemaVersion',
      'owner',
      'sourceFileId',
      'sourceSha256',
      'selection',
      'phaseDReplay',
      'catalog',
    ];
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== 'string' || !expected.includes(key))
    )
      fail('invalid-input', 'Binding request contains missing, hidden, symbol, or extra fields.');
    const rest: Record<string, unknown> = {};
    let owner: unknown;
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (
        !descriptor?.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        fail('invalid-input', `Binding request ${key} must be an enumerable data property.`);
      if (key === 'owner') owner = descriptor.value;
      else rest[key] = descriptor.value;
    }
    return { owner, rest };
  } catch (error) {
    if (error instanceof BindingFailure) throw error;
    fail('invalid-input', 'Binding request reflection failed closed.');
  }
}

function snapshotData(
  value: unknown,
  path: string,
  budget: SnapshotBudget,
  depth = 0,
  arrayElement = false,
): unknown {
  if (depth > MAX_DEPTH) fail('invalid-input', `${path} exceeds the depth bound.`);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'undefined' && !arrayElement) return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', `${path} contains a non-canonical number.`);
    return value;
  }
  if (typeof value === 'string') {
    const bytes = textEncoder.encode(value).byteLength;
    budget.textBytes += bytes;
    if (budget.textBytes > MAX_TEXT_BYTES) fail('invalid-input', `${path} exceeds the text bound.`);
    return value;
  }
  if (!value || typeof value !== 'object')
    fail('invalid-input', `${path} contains a non-data value.`);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    fail('invalid-input', `${path} contains forbidden binary data.`);
  if (budget.active.has(value)) fail('invalid-input', `${path} contains an alias or cycle.`);
  budget.active.add(value);
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) fail('invalid-input', `${path} exceeds the node bound.`);
  try {
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', `${path} must use a plain prototype.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol'))
      fail('invalid-input', `${path} contains a symbol field.`);
    if (array) {
      if (value.length > MAX_ARRAY || keys.length !== value.length + 1)
        fail('invalid-input', `${path} must be one bounded dense array.`);
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          !descriptor?.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        )
          fail('invalid-input', `${path}[${index}] must be an enumerable data property.`);
        output.push(snapshotData(descriptor.value, `${path}[${index}]`, budget, depth + 1, true));
      }
      budget.keys += value.length;
      if (budget.keys > MAX_KEYS) fail('invalid-input', `${path} exceeds the property bound.`);
      return output;
    }
    const output: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (
        !descriptor?.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        fail('invalid-input', `${path}.${key} must be an enumerable data property.`);
      const child = snapshotData(descriptor.value, `${path}.${key}`, budget, depth + 1, false);
      if (child !== undefined) output[key] = child;
    }
    budget.keys += keys.length;
    if (budget.keys > MAX_KEYS) fail('invalid-input', `${path} exceeds the property bound.`);
    return output;
  } catch (error) {
    if (error instanceof BindingFailure) throw error;
    fail('invalid-input', `${path} reflection failed closed.`);
  } finally {
    budget.active.delete(value);
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
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

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return canonical(left) === canonical(right);
  } catch {
    return false;
  }
}

async function digest(
  domain: string,
  value: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  try {
    if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
    const encoded = textEncoder.encode(`${domain}\0${canonical(value)}`);
    if (encoded.byteLength > MAX_CANONICAL_BYTES) return null;
    const output = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
    if (output.byteLength !== 32) return null;
    return Array.from(output, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function clonePlain<T>(value: T): T {
  return deepFreeze(
    snapshotData(value, 'detachedBinding', {
      nodes: 0,
      keys: 0,
      textBytes: 0,
      active: new Set(),
    }) as T,
  );
}

function mappedSourceIndex(
  length: number,
  cyclicShift: number,
  direction: 'forward' | 'reverse',
  targetIndex: number,
  closed: boolean,
): number {
  if (!closed) return direction === 'forward' ? targetIndex : length - 1 - targetIndex;
  return direction === 'forward'
    ? (cyclicShift + targetIndex) % length
    : (cyclicShift + length - 1 - targetIndex) % length;
}

type SnapshotRequest = Omit<DxfProductPhaseDNativeStraightEdgeBindingRequestV1, 'owner'>;

function validateBase(request: SnapshotRequest): void {
  if (
    request.schemaVersion !== DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_REQUEST_V1 ||
    !STABLE_ID.test(request.sourceFileId) ||
    !SHA256.test(request.sourceSha256)
  )
    fail('invalid-input', 'Schema and explicit source identity are required.');
  if (request.sourceFileId.startsWith('pattern-import/saved/'))
    fail(
      'saved-reload-forbidden',
      'Saved product DXF replay cannot mint the original source-native authority.',
    );
  const selection = request.selection;
  const replay = request.phaseDReplay;
  const binding = selection?.pipeline?.contentBinding;
  if (
    selection?.ok !== true ||
    replay?.replayReady !== true ||
    !selection.pipeline.carrier ||
    !binding ||
    !replay.carrier
  )
    fail(
      'phase-d-binding-mismatch',
      'Successful selected and replay Phase-D carriers are required.',
    );
  if (
    binding.sourceFileId !== request.sourceFileId ||
    binding.sourceSha256 !== request.sourceSha256 ||
    binding.selectedGeometrySha256 !== selection.selection.selectedGeometrySha256 ||
    replay.carrier.sourceFileId !== request.sourceFileId ||
    replay.carrier.sourceSha256 !== request.sourceSha256 ||
    replay.carrier.selectedGeometrySha256 !== selection.selection.fullSelectedGeometrySha256 ||
    selection.phaseD.sourceSha256 !== request.sourceSha256 ||
    selection.phaseD.source.sourceFileId !== request.sourceFileId ||
    replay.carrier.source.sourceFileId !== request.sourceFileId ||
    !sameCanonical(selection.phaseD.source, replay.carrier.source)
  )
    fail(
      'phase-d-binding-mismatch',
      'Explicit source identity, full replay and selected Phase-D content binding must exact-match.',
    );
  for (const contour of selection.phaseD.contours) {
    const matches = replay.carrier.contours.filter(
      (candidate) =>
        candidate.pieceId === contour.pieceId &&
        candidate.sizeToken === contour.sizeToken &&
        candidate.contourId === contour.contourId,
    );
    if (matches.length !== 1 || !sameCanonical(matches[0], contour))
      fail(
        'phase-d-binding-mismatch',
        `Selected contour ${contour.pieceId}/${contour.contourId} is not an exact replay subset.`,
      );
  }
  const catalog = request.catalog;
  const selectedPieceIds = [...selection.selection.pieceIds].sort();
  const catalogPieceIds = catalog.pieces.map(({ pieceId }) => pieceId).sort();
  if (
    catalog.techCardId <= 0 ||
    catalog.scopeKey !== selection.selection.scopeKey ||
    catalog.sizeToken !== selection.selection.sizeToken ||
    catalog.sourceFileId !== request.sourceFileId ||
    catalog.sizeSelectionCanonicalSha256 !== selection.selection.canonicalSha256 ||
    selectedPieceIds.length === 0 ||
    selectedPieceIds.join('\0') !== catalogPieceIds.join('\0')
  )
    fail(
      'catalog-binding-mismatch',
      'Catalog card, scope, size, source and selected piece set must exact-match Phase D.',
    );
}

function selectedEdges(
  request: SnapshotRequest,
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[],
): DxfProductPhaseDNativeStraightEdgeSelectedEdgeV1[] {
  const selection = request.selection;
  const sourcePaths = new Map(selection.phaseD.source.paths.map((path) => [path.pathId, path]));
  const publicPieces = selection.pipeline.carrier!.pieces;
  const selected: DxfProductPhaseDNativeStraightEdgeSelectedEdgeV1[] = [];
  const descriptorUse = new Set<string>();
  const totalCatalogContours = request.catalog.pieces.reduce(
    (total, piece) => total + piece.contours.length,
    0,
  );
  if (
    publicPieces.length !== request.catalog.pieces.length ||
    selection.phaseD.contours.length !== totalCatalogContours
  )
    fail('catalog-binding-mismatch', 'Catalog must cover the exact selected Phase-D contour set.');

  for (const catalogPiece of request.catalog.pieces) {
    const publicMatches = publicPieces.filter(
      ({ pieceId, sizeToken }) =>
        pieceId === catalogPiece.pieceId && sizeToken === request.catalog.sizeToken,
    );
    if (publicMatches.length !== 1)
      fail(
        'catalog-binding-mismatch',
        `Catalog piece ${catalogPiece.pieceId} has no unique selected public carrier.`,
      );
    const publicPiece = publicMatches[0];
    if (publicPiece.contours.length !== catalogPiece.contours.length)
      fail(
        'catalog-binding-mismatch',
        `Catalog piece ${catalogPiece.pieceId} contour coverage is incomplete.`,
      );
    for (const catalogContour of catalogPiece.contours) {
      const publicContours = publicPiece.contours.filter(
        ({ id }) => id === catalogContour.contourId,
      );
      const phaseDContours = selection.phaseD.contours.filter(
        ({ pieceId, sizeToken, contourId }) =>
          pieceId === catalogPiece.pieceId &&
          sizeToken === request.catalog.sizeToken &&
          contourId === catalogContour.contourId,
      );
      if (publicContours.length !== 1 || phaseDContours.length !== 1)
        fail(
          'catalog-binding-mismatch',
          `Catalog contour ${catalogPiece.pieceId}/${catalogContour.contourId} is not unique.`,
        );
      const publicContour = publicContours[0];
      const phaseDContour = phaseDContours[0];
      const lineage = phaseDContour.lineage;
      if (
        publicContour.role !== catalogContour.role ||
        !sameCanonical(publicContour.geometry, catalogContour.geometry) ||
        phaseDContour.role !== catalogContour.role ||
        phaseDContour.closed !== catalogContour.closed ||
        !sameCanonical(phaseDContour.geometry, catalogContour.geometry) ||
        lineage.sourcePathIds.length !== 1 ||
        lineage.uniformPositiveScale !== 1 ||
        lineage.mutations.length !== 0 ||
        !Number.isSafeInteger(lineage.cyclicShift) ||
        (lineage.direction !== 'forward' && lineage.direction !== 'reverse')
      )
        fail(
          'selected-edge-binding-mismatch',
          `Catalog contour ${catalogPiece.pieceId}/${catalogContour.contourId} has unsupported lineage.`,
        );
      const sourcePathId = lineage.sourcePathIds[0];
      const sourcePath = sourcePaths.get(sourcePathId);
      const vertices = publicContour.sourceVertices;
      if (
        !sourcePath ||
        sourcePath.closed !== catalogContour.closed ||
        sourcePath.pointsMm.length !== sourcePath.provenance.samples.length ||
        vertices.length !== catalogContour.boundaryVertices.length ||
        vertices.length !== phaseDContour.pointsMm.length ||
        vertices.length < (catalogContour.closed ? 3 : 2)
      )
        fail(
          'selected-edge-binding-mismatch',
          `Catalog contour ${catalogPiece.pieceId}/${catalogContour.contourId} does not bind one source path.`,
        );
      for (let index = 0; index < vertices.length; index += 1) {
        const target = catalogContour.boundaryVertices[index];
        const vertex = vertices[index];
        const sourceIndex = mappedSourceIndex(
          sourcePath.provenance.samples.length,
          lineage.cyclicShift,
          lineage.direction,
          index,
          sourcePath.closed,
        );
        const sample = sourcePath.provenance.samples[sourceIndex];
        if (
          !target ||
          target.ordinal !== index ||
          target.vertexId !== vertex.vertexId ||
          target.normalizedArc !== vertex.normalizedArc ||
          !sample ||
          sample.vertexId !== vertex.vertexId ||
          sample.sourceCurveId !== vertex.sourceCurveId ||
          sample.parameterSpace !== vertex.parameterSpace ||
          sample.sourceCurveT !== vertex.sourceCurveT
        )
          fail(
            'selected-edge-binding-mismatch',
            `Boundary vertex ${catalogPiece.pieceId}/${catalogContour.contourId}/${index} is stale.`,
          );
      }
      const edgeCount = catalogContour.closed ? vertices.length : vertices.length - 1;
      for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
        const nextIndex = (edgeIndex + 1) % vertices.length;
        const start = vertices[edgeIndex];
        const end = vertices[nextIndex];
        const matches = descriptors.filter((descriptor) => {
          if (
            descriptor.sourceFileId !== request.sourceFileId ||
            descriptor.path.sourcePathId !== sourcePathId ||
            descriptor.path.closed !== sourcePath.closed ||
            descriptor.native.sourceCurveId !== descriptor.sourceCurveId ||
            descriptor.native.curveKind !== 'line' ||
            descriptor.native.parameterSpace !== 'unit' ||
            descriptor.native.sourceCurveTRange[0] !== 0 ||
            descriptor.native.sourceCurveTRange[1] !== 1 ||
            descriptor.native.chordErrorBoundMm !== 0 ||
            descriptor.native.periodic !== false ||
            descriptor.native.transform.kind !== 'identity'
          )
            return false;
          const forward =
            descriptor.startVertexId === start.vertexId &&
            descriptor.endVertexId === end.vertexId &&
            descriptor.sourceCurveId === start.sourceCurveId;
          const reverse =
            descriptor.startVertexId === end.vertexId &&
            descriptor.endVertexId === start.vertexId &&
            descriptor.sourceCurveId === end.sourceCurveId;
          return forward || reverse;
        });
        if (matches.length === 0)
          fail(
            'selected-edge-missing',
            `No native line descriptor covers ${catalogPiece.pieceId}/${catalogContour.contourId}/${edgeIndex}.`,
          );
        if (matches.length !== 1)
          fail(
            'selected-edge-duplicate',
            `Multiple native line descriptors cover ${catalogPiece.pieceId}/${catalogContour.contourId}/${edgeIndex}.`,
          );
        const descriptor = matches[0];
        const forward =
          descriptor.startVertexId === start.vertexId && descriptor.endVertexId === end.vertexId;
        const direction = forward ? ('forward' as const) : ('reverse' as const);
        if (direction !== lineage.direction)
          fail(
            'selected-edge-binding-mismatch',
            `Edge direction disagrees with contour lineage at ${catalogPiece.pieceId}/${catalogContour.contourId}/${edgeIndex}.`,
          );
        const sourceStart = sourcePath.provenance.samples[descriptor.path.startPointIndex];
        const sourceEnd = sourcePath.provenance.samples[descriptor.path.endPointIndex];
        if (
          !sourceStart ||
          !sourceEnd ||
          sourceStart.vertexId !== descriptor.startVertexId ||
          sourceEnd.vertexId !== descriptor.endVertexId ||
          sourceStart.sourceCurveId !== descriptor.sourceCurveId
        )
          fail(
            'selected-edge-binding-mismatch',
            `Descriptor source occurrence is stale at ${catalogPiece.pieceId}/${catalogContour.contourId}/${edgeIndex}.`,
          );
        const descriptorKey = `${descriptor.path.sourcePathId}\0${descriptor.sourceCurveId}\0${descriptor.startVertexId}\0${descriptor.endVertexId}`;
        if (descriptorUse.has(descriptorKey))
          fail(
            'selected-edge-duplicate',
            `One native descriptor was selected by multiple catalog edge occurrences.`,
          );
        descriptorUse.add(descriptorKey);
        selected.push({
          occurrenceId: `${catalogPiece.pieceId}/${catalogContour.contourId}/${edgeIndex}`,
          pieceId: catalogPiece.pieceId,
          sizeToken: request.catalog.sizeToken,
          contourId: catalogContour.contourId,
          sourcePathId,
          edgeIndex,
          closing: catalogContour.closed && edgeIndex === vertices.length - 1,
          direction,
          startBoundaryVertexId: start.vertexId,
          endBoundaryVertexId: end.vertexId,
          sourceCurveId: descriptor.sourceCurveId,
          directedSourceCurveTRange: direction === 'forward' ? [0, 1] : [1, 0],
          descriptor,
        });
      }
    }
  }
  return selected;
}

/**
 * Consumes one genuine decoder owner and produces a detached companion authority. The owner is
 * projected exactly once. Existing Phase-D, writer, handoff, and sampling V1 records are untouched.
 */
export async function bindDxfProductPhaseDNativeStraightEdgesV1(
  input: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductPhaseDNativeStraightEdgeBindingResultV1> {
  let owner: unknown;
  let request: SnapshotRequest;
  try {
    const root = exactRoot(input);
    owner = root.owner;
    request = snapshotData(root.rest, 'request', {
      nodes: 0,
      keys: 0,
      textBytes: 0,
      active: new Set(),
    }) as SnapshotRequest;
    validateBase(request);
  } catch (error) {
    return blocked(
      error instanceof BindingFailure ? error.code : 'invalid-input',
      error instanceof Error ? error.message : 'Binding request was inaccessible.',
    );
  }

  const projected = projectDxfSourceNativeStraightEdgeAuthorityV1(owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
    sourceFileId: request.sourceFileId,
    sourceSha256: request.sourceSha256,
  });
  if (!projected.ok) {
    const upstream = projected.blockers[0];
    const code: DxfProductPhaseDNativeStraightEdgeBindingBlockerCodeV1 =
      upstream?.code === 'forged-owner'
        ? 'source-native-owner-forged'
        : upstream?.code === 'stale-owner'
          ? 'source-native-owner-stale'
          : upstream?.code === 'source-identity-mismatch'
            ? 'phase-d-binding-mismatch'
            : 'source-native-owner-rejected';
    return blocked(code, upstream?.detail ?? 'Source-native owner projection was rejected.');
  }

  const projection = projected.projection;
  const recomputedAuthoritySha256 = await digest(
    'dxf-source-native-straight-edge-authority-v1',
    {
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1,
      sourceFileId: projection.sourceFileId,
      sourceSha256: projection.sourceSha256,
      descriptors: projection.descriptors,
      blockers: projection.blockers,
    },
    crypto,
  );
  if (!recomputedAuthoritySha256)
    return blocked('sha256-unavailable', 'Source-native authority SHA-256 is unavailable.');
  if (recomputedAuthoritySha256 !== projection.authoritySha256)
    return blocked(
      'authority-sha-drift',
      'Projected source-native authority no longer matches its canonical SHA-256.',
    );
  if (
    projection.schemaVersion !== DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1 ||
    projection.sourceFileId !== request.sourceFileId ||
    projection.sourceSha256 !== request.sourceSha256 ||
    projection.complete !== true ||
    projection.blockers.length !== 0 ||
    projection.descriptors.length === 0
  )
    return blocked(
      'source-native-projection-incomplete',
      'A complete blocker-free source-native projection is required.',
    );

  try {
    const { canonicalSha256: retainedCatalogSha256, ...catalogWithoutSha256 } = request.catalog;
    const catalogSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
      catalogWithoutSha256,
      crypto,
    );
    if (!catalogSha256) return blocked('sha256-unavailable', 'Catalog SHA-256 is unavailable.');
    if (catalogSha256 !== retainedCatalogSha256)
      return blocked('catalog-binding-mismatch', 'Catalog canonical SHA-256 is stale.');

    const edges = selectedEdges(request, projection.descriptors);
    const detachedEdges = clonePlain(edges);
    const bindingPayload = {
      schemaVersion: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_V1,
      sourceFileId: request.sourceFileId,
      sourceSha256: request.sourceSha256,
      sourceNativeAuthoritySha256: projection.authoritySha256,
      fullSelectedGeometrySha256: request.selection.selection.fullSelectedGeometrySha256,
      selectedGeometrySha256: request.selection.selection.selectedGeometrySha256,
      sizeSelectionCanonicalSha256: request.selection.selection.canonicalSha256,
      catalogCanonicalSha256: request.catalog.canonicalSha256,
      scopeKey: request.selection.selection.scopeKey,
      sizeToken: request.selection.selection.sizeToken,
      pieceIds: [...request.selection.selection.pieceIds].sort(),
      selectedEdges: detachedEdges,
    };
    const canonicalSha256 = await digest(
      'dxf-product-phase-d-native-straight-edge-binding-v1',
      bindingPayload,
      crypto,
    );
    if (!canonicalSha256)
      return blocked('sha256-unavailable', 'Companion binding SHA-256 is unavailable.');
    const selectedDescriptors = detachedEdges.map(({ descriptor }) => descriptor);
    const binding = clonePlain({
      ...bindingPayload,
      selectedDescriptors,
      selectedEdgeCount: detachedEdges.length,
      closingEdgeCount: detachedEdges.filter(({ closing }) => closing).length,
      reverseEdgeCount: detachedEdges.filter(({ direction }) => direction === 'reverse').length,
      canonicalSha256,
      claims: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGE_BINDING_CLAIMS_V1,
    } satisfies DxfProductPhaseDNativeStraightEdgeBindingV1);
    return Object.freeze({
      ok: true as const,
      binding,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return blocked(
      error instanceof BindingFailure ? error.code : 'invalid-input',
      error instanceof Error ? error.message : 'Native straight-edge binding failed closed.',
    );
  }
}

// ── additive V3 owner companion ─────────────────────────────────────────────────────────────

export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3 =
  'dxf-product-phase-d-native-straight-edges/3' as const;
export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_BINDING_V3 =
  'dxf-product-phase-d-native-straight-edges-binding/3' as const;
export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_OWNER_V3 =
  'dxf-product-phase-d-native-straight-edges-owner/3' as const;

export type DxfProductPhaseDNativeStraightEdgesBindRequestV3 = Readonly<{
  sourceFileId: string;
  sourceSha256: string;
  selectedGeometrySha256: string;
}>;

export type DxfProductPhaseDNativeStraightEdgeV3 = Readonly<{
  pieceId: string;
  sizeToken: string;
  contourId: string;
  edgeIndex: number;
  sourcePathId: number;
  contourDirection: 'forward' | 'reverse';
  startVertex: DxfPipelineSourcePathVertexV2;
  endVertex: DxfPipelineSourcePathVertexV2;
  descriptor: DxfSourceNativeStraightEdgeDescriptorV1;
}>;

export type DxfProductPhaseDNativeStraightEdgesContentBindingV3 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_BINDING_V3;
  algorithm: 'SHA-256';
  sourceFileId: string;
  sourceSha256: string;
  selectedGeometrySha256: string;
  selectedGeometryAndSourcePathSha256: string;
  sourceNativeAuthoritySha256: string;
  nativeStraightEdgesSha256: string;
}>;

export type DxfProductPhaseDNativeStraightEdgesProjectionV3 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3;
  binding: DxfProductPhaseDNativeStraightEdgesContentBindingV3;
  edges: readonly DxfProductPhaseDNativeStraightEdgeV3[];
  claims: Readonly<{
    extractionOwnerConsumed: true;
    exactSourcePathCurveVertexAndParameterJoin: true;
    authoritySha256ContentBound: true;
    sourceSha256ContentBound: true;
    selectedGeometrySha256ContentBound: true;
    endpointInferenceUsed: false;
    parameterSpaceInferenceUsed: false;
    v1ReplayCarrierChanged: false;
    v2SourcePathCarrierChanged: false;
    callerSuppliedProjectionAccepted: false;
    sourcePathArtifactAuthenticityAccepted: false;
    phase1ProofConsumerAvailable: true;
    phase2RequestIntegrated: false;
    productionReady: false;
  }>;
}>;

export type DxfProductPhaseDNativeStraightEdgesOwnerV3 = Readonly<{
  version: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_OWNER_V3;
  opaque: 'module-private-weak-owner';
}>;

export type DxfProductPhaseDNativeStraightEdgesReceiptV3 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3;
  binding: DxfProductPhaseDNativeStraightEdgesContentBindingV3;
  edgeCount: number;
  pieceCount: number;
  contourCount: number;
  phase2RequestIntegrated: false;
  productionReady: false;
}>;

export type DxfProductPhaseDNativeStraightEdgesBlockerCodeV3 =
  | 'invalid-request'
  | 'hostile-input'
  | 'bounds-exceeded'
  | 'source-path-artifact-invalid'
  | 'source-identity-mismatch'
  | 'forged-source-native-owner'
  | 'stale-source-native-owner'
  | 'source-native-owner-rejected'
  | 'source-native-incomplete'
  | 'missing-descriptor'
  | 'duplicate-descriptor'
  | 'extra-descriptor'
  | 'vertex-parameter-mismatch'
  | 'sha256-unavailable'
  | 'forged-v3-owner'
  | 'stale-v3-owner'
  | 'reentrant-call';

export type DxfProductPhaseDNativeStraightEdgesBlockerV3 = Readonly<{
  code: DxfProductPhaseDNativeStraightEdgesBlockerCodeV3;
  field: string;
  detail: string;
}>;

export type DxfProductPhaseDNativeStraightEdgesBindResultV3 =
  | Readonly<{
      ok: true;
      owner: DxfProductPhaseDNativeStraightEdgesOwnerV3;
      receipt: DxfProductPhaseDNativeStraightEdgesReceiptV3;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      owner: null;
      receipt: null;
      blockers: readonly [DxfProductPhaseDNativeStraightEdgesBlockerV3];
    }>;

export type DxfProductPhaseDNativeStraightEdgesConsumeResultV3 =
  | Readonly<{
      ok: true;
      projection: DxfProductPhaseDNativeStraightEdgesProjectionV3;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      projection: null;
      blockers: readonly [DxfProductPhaseDNativeStraightEdgesBlockerV3];
    }>;

export const DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_CONTRACT_V3 = Object.freeze({
  authoritySource: 'one genuine source-native extraction owner consumed exactly once',
  sourcePathSource: 'DxfPipelineSourcePathArtifactV2 exact descriptor-safe snapshot',
  joinIdentity: Object.freeze([
    'sourcePathId',
    'sourceCurveId',
    'startVertexId',
    'endVertexId',
    'parameterSpace',
    'sourceCurveT',
  ] as const),
  admittedContours: 'closed straight-edge contours only',
  unrelatedSourceDescriptorsAllowed: true,
  missingDuplicateAndSelectedPathExtraDescriptorsRejected: true,
  contentBindingIncludes: Object.freeze([
    'authoritySha256',
    'sourceSha256',
    'selectedGeometrySha256',
    'selectedGeometryAndSourcePathSha256',
    'exact joined edges',
  ] as const),
  v1ReplayCarrierChanged: false,
  v2SourcePathShapeOrDigestChanged: false,
  sourcePathArtifactAuthenticityAccepted: false,
  phase2RequestIntegrated: false,
  productionReady: false,
} as const);

class V3BindingFailure extends Error {
  constructor(
    readonly code: DxfProductPhaseDNativeStraightEdgesBlockerCodeV3,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type V3OwnerState = {
  consumed: boolean;
  projection: DxfProductPhaseDNativeStraightEdgesProjectionV3;
};

const v3OwnerState = new WeakMap<object, V3OwnerState>();
const v3BindingInProgress = new WeakSet<object>();

function v3Fail(
  code: DxfProductPhaseDNativeStraightEdgesBlockerCodeV3,
  field: string,
  detail: string,
): never {
  throw new V3BindingFailure(code, field, detail);
}

function v3Bounded(value: string, maximumBytes = 1_024): string {
  if (textEncoder.encode(value).byteLength <= maximumBytes) return value;
  let result = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${result}${scalar}…`).byteLength > maximumBytes) break;
    result += scalar;
  }
  return `${result}…`;
}

function v3Blocker(
  code: DxfProductPhaseDNativeStraightEdgesBlockerCodeV3,
  field: string,
  detail: string,
): DxfProductPhaseDNativeStraightEdgesBlockerV3 {
  return Object.freeze({ code, field: v3Bounded(field), detail: v3Bounded(detail) });
}

function v3BindFailure(error: unknown): DxfProductPhaseDNativeStraightEdgesBindResultV3 {
  const known = error instanceof V3BindingFailure;
  return Object.freeze({
    ok: false as const,
    owner: null,
    receipt: null,
    blockers: Object.freeze([
      v3Blocker(
        known ? error.code : 'hostile-input',
        known ? error.field : 'request',
        known
          ? error.message
          : 'Phase-D native-edge binding rejected inaccessible or hostile input.',
      ),
    ]) as readonly [DxfProductPhaseDNativeStraightEdgesBlockerV3],
  });
}

function v3ConsumeFailure(
  code: DxfProductPhaseDNativeStraightEdgesBlockerCodeV3,
  field: string,
  detail: string,
): DxfProductPhaseDNativeStraightEdgesConsumeResultV3 {
  return Object.freeze({
    ok: false as const,
    projection: null,
    blockers: Object.freeze([v3Blocker(code, field, detail)]) as readonly [
      DxfProductPhaseDNativeStraightEdgesBlockerV3,
    ],
  });
}

function v3ExactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    v3Fail('hostile-input', path, 'must be one exact plain data record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    v3Fail('hostile-input', path, 'reflection failed closed.');
  }
  if (prototype !== Object.prototype) v3Fail('hostile-input', path, 'must use Object.prototype.');
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    v3Fail('hostile-input', path, 'contains missing, hidden, symbol, or unexpected fields.');
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      v3Fail('hostile-input', `${path}.${key}`, 'must be an enumerable data property.');
    output[key] = descriptor.value;
  }
  return output;
}

function v3StableId(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !STABLE_ID.test(value) ||
    textEncoder.encode(value).byteLength > 256
  )
    v3Fail('source-path-artifact-invalid', path, 'must be one bounded stable identifier.');
  return value;
}

function v3Sha(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    v3Fail('source-identity-mismatch', path, 'must be lowercase SHA-256.');
  return value;
}

function v3Finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0))
    v3Fail('source-path-artifact-invalid', path, 'must be a finite canonical number.');
  return value;
}

function v3Request(input: unknown): DxfProductPhaseDNativeStraightEdgesBindRequestV3 {
  const request = v3ExactRecord(
    input,
    ['sourceFileId', 'sourceSha256', 'selectedGeometrySha256'],
    'request',
  );
  return Object.freeze({
    sourceFileId: v3StableId(request.sourceFileId, 'request.sourceFileId'),
    sourceSha256: v3Sha(request.sourceSha256, 'request.sourceSha256'),
    selectedGeometrySha256: v3Sha(request.selectedGeometrySha256, 'request.selectedGeometrySha256'),
  });
}

type V3ValidatedSourcePathArtifact = Readonly<{
  artifact: DxfPipelineSourcePathArtifactV2;
  pieceCount: number;
  contourCount: number;
}>;

function v3SourcePathArtifact(
  input: unknown,
  request: DxfProductPhaseDNativeStraightEdgesBindRequestV3,
): V3ValidatedSourcePathArtifact {
  let snapshot: unknown;
  try {
    snapshot = snapshotData(input, 'sourcePathArtifactV2', {
      nodes: 0,
      keys: 0,
      textBytes: 0,
      active: new Set(),
    });
  } catch (error) {
    v3Fail(
      error instanceof BindingFailure ? 'hostile-input' : 'source-path-artifact-invalid',
      'sourcePathArtifactV2',
      error instanceof Error ? error.message : 'V2 artifact snapshot failed closed.',
    );
  }
  const root = v3ExactRecord(
    snapshot,
    ['schemaVersion', 'carrier', 'contentBinding', 'claims'],
    'sourcePathArtifactV2',
  );
  if (root.schemaVersion !== DXF_PIPELINE_SOURCE_PATH_CARRIER_V2)
    v3Fail(
      'source-path-artifact-invalid',
      'sourcePathArtifactV2.schemaVersion',
      'V2 source-path artifact is required.',
    );
  const carrier = v3ExactRecord(
    root.carrier,
    [
      'schemaVersion',
      'sourceFileId',
      'pieces',
      'upstreamBlockerCount',
      'productionReady',
      'heuristicRecoveryUsed',
      'pieceSpecWireIntegrated',
      'includesRawDxf',
      'includesTags',
      'includesAst',
    ],
    'sourcePathArtifactV2.carrier',
  );
  if (
    carrier.schemaVersion !== DXF_PIPELINE_SOURCE_PATH_CARRIER_V2 ||
    carrier.sourceFileId !== request.sourceFileId ||
    !Number.isSafeInteger(carrier.upstreamBlockerCount) ||
    Number(carrier.upstreamBlockerCount) < 0 ||
    carrier.productionReady !== false ||
    carrier.heuristicRecoveryUsed !== false ||
    carrier.pieceSpecWireIntegrated !== false ||
    carrier.includesRawDxf !== false ||
    carrier.includesTags !== false ||
    carrier.includesAst !== false ||
    !Array.isArray(carrier.pieces) ||
    carrier.pieces.length === 0
  )
    v3Fail(
      'source-path-artifact-invalid',
      'sourcePathArtifactV2.carrier',
      'carrier flags, source identity, or piece cardinality are invalid.',
    );

  const contentBinding = v3ExactRecord(
    root.contentBinding,
    [
      'schemaVersion',
      'algorithm',
      'sourceFileId',
      'sourceSha256',
      'baseContentBindingVersion',
      'baseSelectedGeometrySha256',
      'selectedGeometryAndSourcePathSha256',
    ],
    'sourcePathArtifactV2.contentBinding',
  );
  if (
    contentBinding.schemaVersion !== DXF_PIPELINE_CONTENT_BINDING_V2 ||
    contentBinding.algorithm !== 'SHA-256' ||
    contentBinding.sourceFileId !== request.sourceFileId ||
    contentBinding.sourceSha256 !== request.sourceSha256 ||
    contentBinding.baseContentBindingVersion !== DXF_PIPELINE_CONTENT_BINDING_V1 ||
    contentBinding.baseSelectedGeometrySha256 !== request.selectedGeometrySha256 ||
    !SHA256.test(String(contentBinding.selectedGeometryAndSourcePathSha256 ?? ''))
  )
    v3Fail(
      'source-identity-mismatch',
      'sourcePathArtifactV2.contentBinding',
      'V2 source, selection, or source-path binding does not exact-match the request.',
    );

  const claims = v3ExactRecord(
    root.claims,
    [
      'rebuiltFromExactPhaseCLineage',
      'baseCarrierByteSemanticMatch',
      'baseContentBindingFreshlyRecomputed',
      'sourcePathIdIncludedInV2ContentBinding',
      'sourceCurveIdParsingUsed',
      'nearestGeometryRecoveryUsed',
      'topologyMutationRecoveryUsed',
      'writerExportShaBound',
      'trustedAuthorityIntegrated',
      'productionReady',
    ],
    'sourcePathArtifactV2.claims',
  );
  if (
    claims.rebuiltFromExactPhaseCLineage !== true ||
    claims.baseCarrierByteSemanticMatch !== true ||
    claims.baseContentBindingFreshlyRecomputed !== true ||
    claims.sourcePathIdIncludedInV2ContentBinding !== true ||
    claims.sourceCurveIdParsingUsed !== false ||
    claims.nearestGeometryRecoveryUsed !== false ||
    claims.topologyMutationRecoveryUsed !== false ||
    claims.writerExportShaBound !== false ||
    claims.trustedAuthorityIntegrated !== false ||
    claims.productionReady !== false
  )
    v3Fail(
      'source-path-artifact-invalid',
      'sourcePathArtifactV2.claims',
      'V2 source-path claims do not exact-match the admitted contract.',
    );

  const pieceKeys = new Set<string>();
  const contourKeys = new Set<string>();
  const vertexKeys = new Set<string>();
  let contourCount = 0;
  let vertexCount = 0;
  for (let pieceIndex = 0; pieceIndex < carrier.pieces.length; pieceIndex += 1) {
    const piecePath = `sourcePathArtifactV2.carrier.pieces[${pieceIndex}]`;
    const piece = v3ExactRecord(
      carrier.pieces[pieceIndex],
      ['pieceId', 'sizeToken', 'contours'],
      piecePath,
    );
    const pieceId = v3StableId(piece.pieceId, `${piecePath}.pieceId`);
    const sizeToken = v3StableId(piece.sizeToken, `${piecePath}.sizeToken`);
    const pieceKey = `${pieceId}\0${sizeToken}`;
    if (pieceKeys.has(pieceKey))
      v3Fail('duplicate-descriptor', piecePath, 'piece occurrence is duplicated.');
    pieceKeys.add(pieceKey);
    if (!Array.isArray(piece.contours) || piece.contours.length === 0)
      v3Fail(
        'source-path-artifact-invalid',
        `${piecePath}.contours`,
        'at least one contour is required.',
      );
    for (let contourIndex = 0; contourIndex < piece.contours.length; contourIndex += 1) {
      contourCount += 1;
      const contourPath = `${piecePath}.contours[${contourIndex}]`;
      const contour = v3ExactRecord(
        piece.contours[contourIndex],
        ['id', 'role', 'geometry', 'sourceVertices'],
        contourPath,
      );
      const contourId = v3StableId(contour.id, `${contourPath}.id`);
      const contourKey = `${pieceKey}\0${contourId}`;
      if (contourKeys.has(contourKey))
        v3Fail('duplicate-descriptor', contourPath, 'contour occurrence is duplicated.');
      contourKeys.add(contourKey);
      if (
        contour.role !== 'sewing-boundary' &&
        contour.role !== 'cut-boundary' &&
        contour.role !== 'hole'
      )
        v3Fail('source-path-artifact-invalid', `${contourPath}.role`, 'role is unsupported.');
      const geometry = contour.geometry as Record<string, unknown>;
      if (!geometry || typeof geometry !== 'object')
        v3Fail('source-path-artifact-invalid', `${contourPath}.geometry`, 'geometry is invalid.');
      if (geometry.kind === 'cut' || geometry.kind === 'seam')
        v3ExactRecord(geometry, ['kind'], `${contourPath}.geometry`);
      else if (geometry.kind === 'cut-loop') {
        const exactGeometry = v3ExactRecord(geometry, ['kind', 'index'], `${contourPath}.geometry`);
        if (!Number.isSafeInteger(exactGeometry.index) || Number(exactGeometry.index) < 0)
          v3Fail(
            'source-path-artifact-invalid',
            `${contourPath}.geometry.index`,
            'cut-loop index is invalid.',
          );
      } else
        v3Fail(
          'source-path-artifact-invalid',
          `${contourPath}.geometry.kind`,
          'geometry kind is unsupported.',
        );
      if (!Array.isArray(contour.sourceVertices) || contour.sourceVertices.length < 3)
        v3Fail(
          'source-path-artifact-invalid',
          `${contourPath}.sourceVertices`,
          'closed beta contours require at least three vertices.',
        );
      vertexCount += contour.sourceVertices.length;
      if (vertexCount > MAX_ARRAY)
        v3Fail('bounds-exceeded', 'sourcePathArtifactV2.carrier', 'vertex bound exceeded.');
      let sourcePathId: number | null = null;
      for (let vertexIndex = 0; vertexIndex < contour.sourceVertices.length; vertexIndex += 1) {
        const vertexPath = `${contourPath}.sourceVertices[${vertexIndex}]`;
        const vertex = v3ExactRecord(
          contour.sourceVertices[vertexIndex],
          [
            'vertexId',
            'sourceCurveId',
            'parameterSpace',
            'sourceCurveT',
            'normalizedArc',
            'sourcePathId',
          ],
          vertexPath,
        );
        const vertexId = v3StableId(vertex.vertexId, `${vertexPath}.vertexId`);
        v3StableId(vertex.sourceCurveId, `${vertexPath}.sourceCurveId`);
        if (
          vertex.parameterSpace !== 'unit' &&
          vertex.parameterSpace !== 'angle-radians' &&
          vertex.parameterSpace !== 'knot-domain'
        )
          v3Fail(
            'source-path-artifact-invalid',
            `${vertexPath}.parameterSpace`,
            'parameter space is unsupported.',
          );
        v3Finite(vertex.sourceCurveT, `${vertexPath}.sourceCurveT`);
        const normalizedArc = v3Finite(vertex.normalizedArc, `${vertexPath}.normalizedArc`);
        if (normalizedArc < 0 || normalizedArc >= 1)
          v3Fail(
            'source-path-artifact-invalid',
            `${vertexPath}.normalizedArc`,
            'closed contour normalizedArc must be in [0, 1).',
          );
        if (!Number.isSafeInteger(vertex.sourcePathId) || Number(vertex.sourcePathId) < 0)
          v3Fail(
            'source-path-artifact-invalid',
            `${vertexPath}.sourcePathId`,
            'sourcePathId must be a non-negative safe integer.',
          );
        const currentPathId = Number(vertex.sourcePathId);
        sourcePathId ??= currentPathId;
        if (currentPathId !== sourcePathId)
          v3Fail(
            'source-path-artifact-invalid',
            `${contourPath}.sourceVertices`,
            'one contour must retain exactly one source PathId.',
          );
        const vertexKey = `${currentPathId}\0${vertexId}`;
        if (vertexKeys.has(vertexKey))
          v3Fail('duplicate-descriptor', vertexPath, 'source vertex occurrence is duplicated.');
        vertexKeys.add(vertexKey);
      }
    }
  }
  return Object.freeze({
    artifact: deepFreeze(root) as unknown as DxfPipelineSourcePathArtifactV2,
    pieceCount: carrier.pieces.length,
    contourCount,
  });
}

function v3EdgeKey(sourcePathId: number, left: string, right: string): string {
  const [first, second] = left < right ? [left, right] : [right, left];
  return `${sourcePathId}\0${first}\0${second}`;
}

function v3ValidateDescriptor(
  descriptor: DxfSourceNativeStraightEdgeDescriptorV1,
  sourceFileId: string,
): void {
  if (
    descriptor.sourceFileId !== sourceFileId ||
    descriptor.native.sourceCurveId !== descriptor.sourceCurveId ||
    descriptor.native.curveKind !== 'line' ||
    descriptor.native.parameterSpace !== 'unit' ||
    descriptor.native.sourceCurveTRange[0] !== 0 ||
    descriptor.native.sourceCurveTRange[1] !== 1 ||
    descriptor.native.chordErrorBoundMm !== 0 ||
    descriptor.native.periodic !== false ||
    descriptor.native.transform.kind !== 'identity' ||
    descriptor.nativeFrame !== 'page-mm' ||
    typeof descriptor.path.closed !== 'boolean'
  )
    v3Fail(
      'source-native-incomplete',
      'sourceNativeProjection.descriptors',
      'only complete native line descriptors are admitted.',
    );
}

function v3CloneDescriptor(
  descriptor: DxfSourceNativeStraightEdgeDescriptorV1,
): DxfSourceNativeStraightEdgeDescriptorV1 {
  return deepFreeze({
    ...descriptor,
    instancePath: [...descriptor.instancePath],
    path: { ...descriptor.path },
    primitive: { ...descriptor.primitive },
    startMm: [...descriptor.startMm] as [number, number],
    endMm: [...descriptor.endMm] as [number, number],
    normalization: {
      ...descriptor.normalization,
      sourceAffine: { ...descriptor.normalization.sourceAffine },
    },
    native: {
      ...descriptor.native,
      sourceCurveTRange: [...descriptor.native.sourceCurveTRange] as [0, 1],
      transform: { ...descriptor.native.transform },
    },
  });
}

function v3JoinEdges(
  artifact: DxfPipelineSourcePathArtifactV2,
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[],
  sourceFileId: string,
): readonly DxfProductPhaseDNativeStraightEdgeV3[] {
  const descriptorByEdge = new Map<string, DxfSourceNativeStraightEdgeDescriptorV1>();
  const descriptorIdentities = new Set<string>();
  const selectedPathIds = new Set(
    artifact.carrier.pieces.flatMap((piece) =>
      piece.contours.flatMap((contour) =>
        contour.sourceVertices.map(({ sourcePathId }) => sourcePathId),
      ),
    ),
  );
  let selectedDescriptorCount = 0;
  for (const descriptor of descriptors) {
    v3ValidateDescriptor(descriptor, sourceFileId);
    const identity = `${descriptor.sourceFileId}\0${descriptor.path.sourcePathId}\0${descriptor.sourceCurveId}\0${descriptor.primitive.primitiveSegmentIndex}`;
    if (descriptorIdentities.has(identity))
      v3Fail('duplicate-descriptor', 'sourceNativeProjection.descriptors', 'duplicate identity.');
    descriptorIdentities.add(identity);
    // A production pattern DXF contains cut/seam alternatives, internal loops, grain and notch
    // paths beyond the selected physical contour. They remain content-bound through the complete
    // sourceNativeAuthoritySha256, but only an exact selected PathId may authorize a garment edge.
    if (!selectedPathIds.has(descriptor.path.sourcePathId)) continue;
    if (!descriptor.path.closed)
      v3Fail(
        'source-native-incomplete',
        'sourceNativeProjection.descriptors',
        'selected source paths must be complete closed native line contours.',
      );
    selectedDescriptorCount += 1;
    const edgeKey = v3EdgeKey(
      descriptor.path.sourcePathId,
      descriptor.startVertexId,
      descriptor.endVertexId,
    );
    if (descriptorByEdge.has(edgeKey))
      v3Fail(
        'duplicate-descriptor',
        'sourceNativeProjection.descriptors',
        'multiple descriptors claim one source path edge.',
      );
    descriptorByEdge.set(edgeKey, descriptor);
  }

  const consumed = new Set<DxfSourceNativeStraightEdgeDescriptorV1>();
  const joined: DxfProductPhaseDNativeStraightEdgeV3[] = [];
  for (const piece of artifact.carrier.pieces) {
    for (const contour of piece.contours) {
      for (let edgeIndex = 0; edgeIndex < contour.sourceVertices.length; edgeIndex += 1) {
        const startVertex = contour.sourceVertices[edgeIndex]!;
        const endVertex = contour.sourceVertices[(edgeIndex + 1) % contour.sourceVertices.length]!;
        if (startVertex.sourcePathId !== endVertex.sourcePathId)
          v3Fail(
            'source-path-artifact-invalid',
            `carrier.${piece.pieceId}.${contour.id}.sourceVertices`,
            'adjacent vertices do not share one source PathId.',
          );
        const descriptor = descriptorByEdge.get(
          v3EdgeKey(startVertex.sourcePathId, startVertex.vertexId, endVertex.vertexId),
        );
        if (!descriptor)
          v3Fail(
            'missing-descriptor',
            `carrier.${piece.pieceId}.${contour.id}.edge[${edgeIndex}]`,
            'no exact source-native descriptor covers this selected edge.',
          );
        if (consumed.has(descriptor))
          v3Fail(
            'duplicate-descriptor',
            `carrier.${piece.pieceId}.${contour.id}.edge[${edgeIndex}]`,
            'one descriptor cannot authorize multiple selected edge occurrences.',
          );
        const descriptorStart =
          descriptor.startVertexId === startVertex.vertexId
            ? startVertex
            : descriptor.startVertexId === endVertex.vertexId
              ? endVertex
              : null;
        const descriptorEnd =
          descriptor.endVertexId === startVertex.vertexId
            ? startVertex
            : descriptor.endVertexId === endVertex.vertexId
              ? endVertex
              : null;
        if (
          !descriptorStart ||
          !descriptorEnd ||
          descriptorStart.sourceCurveId !== descriptor.sourceCurveId ||
          descriptorStart.parameterSpace !== 'unit' ||
          descriptorStart.sourceCurveT !== 0 ||
          descriptorEnd.parameterSpace !== 'unit' ||
          descriptorEnd.sourceCurveId === descriptor.sourceCurveId ||
          descriptorEnd.sourceCurveT !== 0
        )
          v3Fail(
            'vertex-parameter-mismatch',
            `carrier.${piece.pieceId}.${contour.id}.edge[${edgeIndex}]`,
            'PathId, curve, shared-vertex ownership, parameter space, or t is stale.',
          );
        consumed.add(descriptor);
        joined.push(
          deepFreeze({
            pieceId: piece.pieceId,
            sizeToken: piece.sizeToken,
            contourId: contour.id,
            edgeIndex,
            sourcePathId: startVertex.sourcePathId,
            contourDirection:
              descriptor.startVertexId === startVertex.vertexId
                ? ('forward' as const)
                : ('reverse' as const),
            startVertex: { ...startVertex },
            endVertex: { ...endVertex },
            descriptor: v3CloneDescriptor(descriptor),
          }),
        );
      }
    }
  }
  if (consumed.size !== selectedDescriptorCount)
    v3Fail(
      'extra-descriptor',
      'sourceNativeProjection.descriptors',
      'a selected source path contains descriptors outside selected V2 geometry.',
    );
  return Object.freeze(joined);
}

function v3CloneProjection(
  projection: DxfProductPhaseDNativeStraightEdgesProjectionV3,
): DxfProductPhaseDNativeStraightEdgesProjectionV3 {
  return deepFreeze({
    ...projection,
    binding: { ...projection.binding },
    edges: projection.edges.map((edge) => ({
      ...edge,
      startVertex: { ...edge.startVertex },
      endVertex: { ...edge.endVertex },
      descriptor: v3CloneDescriptor(edge.descriptor),
    })),
    claims: { ...projection.claims },
  });
}

/**
 * Consumes the genuine extraction owner and content-binds its exact line descriptors to the V2
 * selected source-path artifact. Existing replay V1 and source-path V2 values are never widened.
 */
/** Whole-file V3 admission remains unchanged. */
export function bindDxfProductPhaseDNativeStraightEdgesV3(
  sourceNativeOwner: DxfSourceNativeStraightEdgeOwnerV1,
  sourcePathArtifactV2: DxfPipelineSourcePathArtifactV2,
  requestInput: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductPhaseDNativeStraightEdgesBindResultV3> {
  return bindNativeStraightEdgesV3(
    sourceNativeOwner,
    sourcePathArtifactV2,
    requestInput,
    crypto,
    false,
  );
}

/** Selected paths derive only from the validated V2 carrier, never caller-supplied projection data. */
export function bindDxfProductPhaseDSelectedNativeStraightEdgesV3(
  sourceNativeOwner: DxfSourceNativeStraightEdgeOwnerV1,
  sourcePathArtifactV2: DxfPipelineSourcePathArtifactV2,
  requestInput: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductPhaseDNativeStraightEdgesBindResultV3> {
  return bindNativeStraightEdgesV3(
    sourceNativeOwner,
    sourcePathArtifactV2,
    requestInput,
    crypto,
    true,
  );
}

async function bindNativeStraightEdgesV3(
  sourceNativeOwner: DxfSourceNativeStraightEdgeOwnerV1,
  sourcePathArtifactV2: DxfPipelineSourcePathArtifactV2,
  requestInput: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined,
  selectedPathsOnly: boolean,
): Promise<DxfProductPhaseDNativeStraightEdgesBindResultV3> {
  if (
    (typeof sourceNativeOwner !== 'object' && typeof sourceNativeOwner !== 'function') ||
    sourceNativeOwner === null
  )
    return v3BindFailure(
      new V3BindingFailure(
        'forged-source-native-owner',
        'sourceNativeOwner',
        'source-native owner is not an object capability.',
      ),
    );
  if (v3BindingInProgress.has(sourceNativeOwner))
    return v3BindFailure(
      new V3BindingFailure(
        'reentrant-call',
        'sourceNativeOwner',
        'reentrant binding with the same capability was refused.',
      ),
    );
  v3BindingInProgress.add(sourceNativeOwner);
  try {
    const request = v3Request(requestInput);
    const validatedArtifact = v3SourcePathArtifact(sourcePathArtifactV2, request);
    const selectedPathIds = [
      ...new Set(
        validatedArtifact.artifact.carrier.pieces.flatMap((piece) =>
          piece.contours.flatMap((contour) =>
            contour.sourceVertices.map((vertex) => vertex.sourcePathId),
          ),
        ),
      ),
    ].sort((a, b) => a - b);
    const sourceProjectionResult = selectedPathsOnly
      ? await projectDxfSourceNativeStraightEdgeSelectedPathsV1(sourceNativeOwner, {
          schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
          sourceFileId: request.sourceFileId,
          sourceSha256: request.sourceSha256,
          sourcePathIds: selectedPathIds,
        })
      : projectDxfSourceNativeStraightEdgeAuthorityV1(sourceNativeOwner, {
          schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
          sourceFileId: request.sourceFileId,
          sourceSha256: request.sourceSha256,
        });
    if (!sourceProjectionResult.ok) {
      const upstreamCode = sourceProjectionResult.blockers[0]?.code;
      if (upstreamCode === 'forged-owner')
        v3Fail(
          'forged-source-native-owner',
          'sourceNativeOwner',
          'source-native owner is forged or cloned.',
        );
      if (upstreamCode === 'stale-owner')
        v3Fail(
          'stale-source-native-owner',
          'sourceNativeOwner',
          'source-native owner was already consumed.',
        );
      if (upstreamCode === 'source-identity-mismatch')
        v3Fail(
          'source-identity-mismatch',
          'sourceNativeOwner',
          'source-native owner does not exact-match the requested source.',
        );
      v3Fail(
        'source-native-owner-rejected',
        'sourceNativeOwner',
        'source-native extraction capability rejected projection.',
      );
    }
    const sourceProjection = sourceProjectionResult.projection;
    if (
      sourceProjection.schemaVersion !==
        (selectedPathsOnly
          ? 'dxf-source-native-straight-edge-selected-paths/1'
          : DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1) ||
      sourceProjection.sourceFileId !== request.sourceFileId ||
      sourceProjection.sourceSha256 !== request.sourceSha256 ||
      !SHA256.test(sourceProjection.authoritySha256) ||
      sourceProjection.complete !== true ||
      sourceProjection.blockers.length !== 0 ||
      sourceProjection.descriptors.length === 0 ||
      sourceProjection.descriptors.length > MAX_ARRAY ||
      sourceProjection.claims.freshExtractionReplay !== true ||
      sourceProjection.claims.curveKindLineMintedByDecoder !== true ||
      sourceProjection.claims.endpointInferenceUsed !== false ||
      sourceProjection.claims.parameterSpaceInferenceUsed !== false ||
      sourceProjection.claims.descriptorTransformIdentity !== true ||
      sourceProjection.claims.phaseDIntegrated !== false ||
      sourceProjection.claims.phase2RequestIntegrated !== false
    )
      v3Fail(
        'source-native-incomplete',
        'sourceNativeProjection',
        'fresh extraction projection must be complete, blocker-free, and line-native.',
      );
    if (
      selectedPathsOnly &&
      (!('scope' in sourceProjection) ||
        sourceProjection.scope.kind !== 'exact-selected-source-paths' ||
        sourceProjection.scope.wholeFileCompletenessClaimed !== false ||
        canonical(sourceProjection.scope.sourcePathIds) !== canonical(selectedPathIds))
    )
      v3Fail(
        'source-native-incomplete',
        'sourceNativeProjection.scope',
        'Selected native scope differs from exact validated carrier paths.',
      );
    const recomputedAuthoritySha256 = await digest(
      selectedPathsOnly
        ? 'dxf-source-native-straight-edge-selected-paths-v1'
        : 'dxf-source-native-straight-edge-authority-v1',
      {
        schemaVersion: sourceProjection.schemaVersion,
        sourceFileId: sourceProjection.sourceFileId,
        sourceSha256: sourceProjection.sourceSha256,
        ...('scope' in sourceProjection
          ? { scope: sourceProjection.scope, complete: sourceProjection.complete }
          : {}),
        descriptors: sourceProjection.descriptors,
        blockers: sourceProjection.blockers,
      },
      crypto,
    );
    if (!recomputedAuthoritySha256)
      v3Fail('sha256-unavailable', 'sourceNativeProjection', 'authority SHA-256 unavailable.');
    if (recomputedAuthoritySha256 !== sourceProjection.authoritySha256)
      v3Fail(
        'source-native-incomplete',
        'sourceNativeProjection.authoritySha256',
        'fresh authority SHA-256 drifted.',
      );

    const edges = v3JoinEdges(
      validatedArtifact.artifact,
      sourceProjection.descriptors,
      request.sourceFileId,
    );
    const selectedGeometryAndSourcePathSha256 =
      validatedArtifact.artifact.contentBinding.selectedGeometryAndSourcePathSha256;
    const bindingPayload = {
      schemaVersion: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_BINDING_V3,
      sourceFileId: request.sourceFileId,
      sourceSha256: request.sourceSha256,
      selectedGeometrySha256: request.selectedGeometrySha256,
      selectedGeometryAndSourcePathSha256,
      sourceNativeAuthoritySha256: sourceProjection.authoritySha256,
      edges,
    };
    const nativeStraightEdgesSha256 = await digest(
      'dxf-product-phase-d-native-straight-edges-v3',
      bindingPayload,
      crypto,
    );
    if (!nativeStraightEdgesSha256)
      v3Fail('sha256-unavailable', 'contentBinding', 'V3 content SHA-256 unavailable.');
    const binding = deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_BINDING_V3,
      algorithm: 'SHA-256' as const,
      sourceFileId: request.sourceFileId,
      sourceSha256: request.sourceSha256,
      selectedGeometrySha256: request.selectedGeometrySha256,
      selectedGeometryAndSourcePathSha256,
      sourceNativeAuthoritySha256: sourceProjection.authoritySha256,
      nativeStraightEdgesSha256,
    } satisfies DxfProductPhaseDNativeStraightEdgesContentBindingV3);
    const projection = deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3,
      binding,
      edges,
      claims: {
        extractionOwnerConsumed: true as const,
        exactSourcePathCurveVertexAndParameterJoin: true as const,
        authoritySha256ContentBound: true as const,
        sourceSha256ContentBound: true as const,
        selectedGeometrySha256ContentBound: true as const,
        endpointInferenceUsed: false as const,
        parameterSpaceInferenceUsed: false as const,
        v1ReplayCarrierChanged: false as const,
        v2SourcePathCarrierChanged: false as const,
        callerSuppliedProjectionAccepted: false as const,
        sourcePathArtifactAuthenticityAccepted: false as const,
        phase1ProofConsumerAvailable: true as const,
        phase2RequestIntegrated: false as const,
        productionReady: false as const,
      },
    } satisfies DxfProductPhaseDNativeStraightEdgesProjectionV3);
    const owner = Object.freeze({
      version: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_OWNER_V3,
      opaque: 'module-private-weak-owner' as const,
    });
    v3OwnerState.set(owner, { consumed: false, projection });
    const receipt = deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE_D_NATIVE_STRAIGHT_EDGES_V3,
      binding,
      edgeCount: edges.length,
      pieceCount: validatedArtifact.pieceCount,
      contourCount: validatedArtifact.contourCount,
      phase2RequestIntegrated: false as const,
      productionReady: false as const,
    } satisfies DxfProductPhaseDNativeStraightEdgesReceiptV3);
    return Object.freeze({
      ok: true as const,
      owner,
      receipt,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return v3BindFailure(error);
  } finally {
    v3BindingInProgress.delete(sourceNativeOwner);
  }
}

/** Consumes one genuine V3 owner and returns a detached immutable Phase-1 proof input. */
export function consumeDxfProductPhaseDNativeStraightEdgesV3(
  owner: unknown,
  requestInput: unknown,
): DxfProductPhaseDNativeStraightEdgesConsumeResultV3 {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null)
    return v3ConsumeFailure('forged-v3-owner', 'owner', 'V3 owner is not genuine.');
  const state = v3OwnerState.get(owner);
  if (!state) return v3ConsumeFailure('forged-v3-owner', 'owner', 'V3 owner is not genuine.');
  if (state.consumed)
    return v3ConsumeFailure('stale-v3-owner', 'owner', 'V3 owner was already consumed.');
  state.consumed = true;
  let request: DxfProductPhaseDNativeStraightEdgesBindRequestV3;
  try {
    request = v3Request(requestInput);
  } catch {
    return v3ConsumeFailure(
      'source-identity-mismatch',
      'request',
      'V3 consume request is incomplete, hostile, or mismatched.',
    );
  }
  const binding = state.projection.binding;
  if (
    request.sourceFileId !== binding.sourceFileId ||
    request.sourceSha256 !== binding.sourceSha256 ||
    request.selectedGeometrySha256 !== binding.selectedGeometrySha256
  )
    return v3ConsumeFailure(
      'source-identity-mismatch',
      'request',
      'V3 consume request does not exact-match the bound product source identity.',
    );
  return Object.freeze({
    ok: true as const,
    projection: v3CloneProjection(state.projection),
    blockers: Object.freeze([]) as readonly [],
  });
}
