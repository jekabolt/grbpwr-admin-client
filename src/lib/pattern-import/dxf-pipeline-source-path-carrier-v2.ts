import {
  bridgeDxfProvenanceToPieceSpecBoundaryV1,
  createDxfPieceSpecProvenanceBridgeInputV1,
  type DxfPieceSpecBridgeSourceVertexV1,
  type DxfPieceSpecContourBoundaryV1,
  type DxfPieceSpecProvenanceSourceV1,
} from './dxf-piece-spec-provenance-bridge-v1';
import {
  DXF_PIPELINE_CONTENT_BINDING_V1,
  DXF_PIPELINE_PROVENANCE_V1,
  computeDxfPipelineContentBindingV1,
  type DxfPipelineProvenanceStageOutputV1,
} from './dxf-pipeline-provenance-v1';
import type { PieceSpec, PtMm } from './types';

export const DXF_PIPELINE_SOURCE_PATH_CARRIER_V2 = 'dxf-pipeline-source-path-carrier/2' as const;
export const DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2 =
  'dxf-pipeline-source-path-carrier-request/2' as const;
export const DXF_PIPELINE_CONTENT_BINDING_V2 = 'dxf-pipeline-content-binding/2' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_DEPTH = 32;
const MAX_NODES = 250_000;
const MAX_PROPERTIES = 2_000_000;
const MAX_ARRAY_LENGTH = 100_000;
const MAX_STRING_BYTES = 64 * 1024;
const MAX_CANONICAL_BYTES = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();

export type DxfPipelineSourcePathCarrierRequestV2 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2;
  source: DxfPieceSpecProvenanceSourceV1;
  contours: readonly DxfPieceSpecContourBoundaryV1[];
  pieces: readonly PieceSpec[];
  pipeline: DxfPipelineProvenanceStageOutputV1;
  sourceSha256: string;
}>;

export type DxfPipelineSourcePathVertexV2 = DxfPieceSpecBridgeSourceVertexV1 &
  Readonly<{ sourcePathId: number }>;

export type DxfPipelineSourcePathCarrierV2 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_SOURCE_PATH_CARRIER_V2;
  sourceFileId: string;
  pieces: readonly Readonly<{
    pieceId: string;
    sizeToken: string;
    contours: readonly Readonly<{
      id: string;
      role: 'sewing-boundary' | 'cut-boundary' | 'hole';
      geometry:
        | Readonly<{ kind: 'cut' }>
        | Readonly<{ kind: 'seam' }>
        | Readonly<{ kind: 'cut-loop'; index: number }>;
      sourceVertices: readonly DxfPipelineSourcePathVertexV2[];
    }>[];
  }>[];
  upstreamBlockerCount: number;
  productionReady: false;
  heuristicRecoveryUsed: false;
  pieceSpecWireIntegrated: false;
  includesRawDxf: false;
  includesTags: false;
  includesAst: false;
}>;

export type DxfPipelineContentBindingV2 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_CONTENT_BINDING_V2;
  algorithm: 'SHA-256';
  sourceFileId: string;
  sourceSha256: string;
  baseContentBindingVersion: typeof DXF_PIPELINE_CONTENT_BINDING_V1;
  baseSelectedGeometrySha256: string;
  selectedGeometryAndSourcePathSha256: string;
}>;

export type DxfPipelineSourcePathArtifactV2 = Readonly<{
  schemaVersion: typeof DXF_PIPELINE_SOURCE_PATH_CARRIER_V2;
  carrier: DxfPipelineSourcePathCarrierV2;
  contentBinding: DxfPipelineContentBindingV2;
  claims: Readonly<{
    rebuiltFromExactPhaseCLineage: true;
    baseCarrierByteSemanticMatch: true;
    baseContentBindingFreshlyRecomputed: true;
    sourcePathIdIncludedInV2ContentBinding: true;
    sourceCurveIdParsingUsed: false;
    nearestGeometryRecoveryUsed: false;
    topologyMutationRecoveryUsed: false;
    writerExportShaBound: false;
    trustedAuthorityIntegrated: false;
    productionReady: false;
  }>;
}>;

export type DxfPipelineSourcePathCarrierBlockerCodeV2 =
  | 'reentrant-call'
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'phase-c-rebuild-blocked'
  | 'base-pipeline-invalid'
  | 'base-carrier-mismatch'
  | 'base-content-binding-mismatch'
  | 'source-path-cardinality-invalid'
  | 'selected-geometry-unavailable'
  | 'sha256-unavailable';

export type DxfPipelineSourcePathCarrierBlockerV2 = Readonly<{
  code: DxfPipelineSourcePathCarrierBlockerCodeV2;
  field: string;
  detail: string;
}>;

export type DxfPipelineSourcePathCarrierResultV2 =
  | Readonly<{
      ok: true;
      artifact: DxfPipelineSourcePathArtifactV2;
      blockers: readonly DxfPipelineSourcePathCarrierBlockerV2[];
    }>
  | Readonly<{
      ok: false;
      artifact: null;
      blockers: readonly DxfPipelineSourcePathCarrierBlockerV2[];
    }>;

export const DXF_PIPELINE_SOURCE_PATH_CARRIER_CONTRACT_V2 = Object.freeze({
  authority: 'fresh Phase-C V1 exact-lineage rebuild plus existing final-coordinate binding',
  additiveVertexKey: 'sourcePathId',
  sourcePathOrigin: 'single exact contour.lineage.sourcePathIds entry before projection',
  sourceCurveIdParsingAllowed: false,
  nearestGeometryRecoveryAllowed: false,
  v1SchemaChanged: false,
  v2ContentBindingIncludesSourcePathId: true,
  contentBindingAuthority: 'unsigned consistency evidence only',
  writerExportShaAuthority: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

class CarrierFailure extends Error {
  constructor(
    readonly code: DxfPipelineSourcePathCarrierBlockerCodeV2,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type SnapshotBudget = { nodes: number; properties: number; seen: Set<object> };

function fail(
  code: DxfPipelineSourcePathCarrierBlockerCodeV2,
  field: string,
  detail: string,
): never {
  throw new CarrierFailure(code, field, detail);
}

function bounded(value: string, maximumBytes = 1_024): string {
  if (textEncoder.encode(value).byteLength <= maximumBytes) return value;
  let result = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${result}${scalar}…`).byteLength > maximumBytes) break;
    result += scalar;
  }
  return `${result}…`;
}

function blocked(error: unknown): DxfPipelineSourcePathCarrierResultV2 {
  const known = error instanceof CarrierFailure;
  return Object.freeze({
    ok: false as const,
    artifact: null,
    blockers: Object.freeze([
      Object.freeze({
        code: known ? error.code : ('invalid-input' as const),
        field: bounded(known ? error.field : 'request'),
        detail: bounded(
          known
            ? error.message
            : 'DXF source-path carrier rejected inaccessible, hostile, or inconsistent input.',
        ),
      }),
    ]),
  });
}

function snapshotData(
  value: unknown,
  path: string,
  depth: number,
  budget: SnapshotBudget,
): unknown {
  if (depth > MAX_DEPTH) fail('bounds-exceeded', path, 'maximum snapshot depth exceeded.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('invalid-input', path, 'number must be finite and canonical.');
    return value;
  }
  if (typeof value === 'string') {
    if (textEncoder.encode(value).byteLength > MAX_STRING_BYTES)
      fail('bounds-exceeded', path, 'string byte bound exceeded.');
    return value;
  }
  if (
    !value ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer
  )
    fail('invalid-input', path, 'value must be descriptor-safe JSON data.');
  if (budget.seen.has(value)) fail('invalid-input', path, 'aliases and cycles are forbidden.');
  budget.seen.add(value);
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) fail('bounds-exceeded', path, 'node bound exceeded.');
  const isArray = Array.isArray(value);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(descriptors);
  } catch {
    fail('invalid-input', path, 'reflection failed.');
  }
  if (prototype !== (isArray ? Array.prototype : Object.prototype))
    fail('invalid-input', path, 'prototype is unsupported.');
  if (keys.some((key) => typeof key !== 'string'))
    fail('invalid-input', path, 'symbol properties are forbidden.');
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH)
      fail('bounds-exceeded', path, 'array length is invalid.');
    if (keys.length !== length + 1)
      fail('invalid-input', path, 'array must be dense and contain no extra properties.');
    budget.properties += length;
    if (budget.properties > MAX_PROPERTIES)
      fail('bounds-exceeded', path, 'property bound exceeded.');
    return Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        fail(
          'invalid-input',
          `${path}[${index}]`,
          'array entry must be an enumerable data property.',
        );
      return snapshotData(descriptor.value, `${path}[${index}]`, depth + 1, budget);
    });
  }
  budget.properties += keys.length;
  if (budget.properties > MAX_PROPERTIES) fail('bounds-exceeded', path, 'property bound exceeded.');
  const output: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${path}.${key}`, 'field must be an enumerable data property.');
    output[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, budget);
  }
  return output;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', path, 'must be an exact record.');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key)))
    fail('invalid-input', path, 'contains missing or unexpected fields.');
  return record;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('unsupported canonical value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function freezeOwned<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) freezeOwned(child, seen);
  return Object.freeze(value);
}

function selectedPoints(
  piece: PieceSpec,
  sizeToken: string,
  geometry: DxfPipelineSourcePathCarrierV2['pieces'][number]['contours'][number]['geometry'],
): readonly PtMm[] | null {
  const sizes = piece.sizes.filter((size) => size.sizeToken === sizeToken);
  if (sizes.length !== 1) return null;
  const size = sizes[0]!;
  if (geometry.kind === 'cut') return size.cut;
  if (geometry.kind === 'seam') return size.seam;
  return size.cutLoops?.[geometry.index] ?? null;
}

async function computeV2Binding(
  carrier: DxfPipelineSourcePathCarrierV2,
  pieces: readonly PieceSpec[],
  sourceSha256: string,
  baseSelectedGeometrySha256: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<DxfPipelineContentBindingV2> {
  if (!SHA256.test(sourceSha256) || !SHA256.test(baseSelectedGeometrySha256))
    fail('sha256-unavailable', 'sourceSha256', 'source or base content SHA-256 is invalid.');
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 implementation is unavailable.');
  const pieceById = new Map<string, PieceSpec>();
  for (const piece of pieces) {
    if (pieceById.has(piece.identity))
      fail('selected-geometry-unavailable', 'pieces', 'duplicate PieceSpec identity.');
    pieceById.set(piece.identity, piece);
  }
  let vertexCount = 0;
  const payloadPieces = carrier.pieces.map((carriedPiece) => {
    const piece = pieceById.get(carriedPiece.pieceId);
    if (!piece)
      fail('selected-geometry-unavailable', 'pieces', 'carrier PieceSpec is unavailable.');
    const contours = carriedPiece.contours.map((contour) => {
      const points = selectedPoints(piece, carriedPiece.sizeToken, contour.geometry);
      if (!points || points.length !== contour.sourceVertices.length)
        fail(
          'selected-geometry-unavailable',
          `pieces.${carriedPiece.pieceId}.${contour.id}`,
          'selected geometry cardinality differs from the rebuilt carrier.',
        );
      vertexCount += points.length;
      if (vertexCount > MAX_ARRAY_LENGTH)
        fail('bounds-exceeded', 'pieces', 'selected geometry vertex bound exceeded.');
      return {
        id: contour.id,
        role: contour.role,
        geometry: contour.geometry,
        pointsMm: points.map(({ x, y }) => {
          if (!Number.isFinite(x) || !Number.isFinite(y) || Object.is(x, -0) || Object.is(y, -0))
            fail('invalid-input', 'pieces.pointsMm', 'selected coordinate is non-canonical.');
          return [x, y] as const;
        }),
        sourceVertices: contour.sourceVertices.map((vertex) => ({ ...vertex })),
      };
    });
    return { pieceId: carriedPiece.pieceId, sizeToken: carriedPiece.sizeToken, contours };
  });
  const payload = canonical({
    schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V2,
    sourceFileId: carrier.sourceFileId,
    sourceSha256,
    baseSelectedGeometrySha256,
    pieces: payloadPieces,
  });
  const encoded = textEncoder.encode(`dxf-pipeline-content-binding-v2\0${payload}`);
  if (encoded.byteLength > MAX_CANONICAL_BYTES)
    fail('bounds-exceeded', 'contentBinding', 'canonical content byte bound exceeded.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
  if (digest.byteLength !== 32)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 returned an invalid digest.');
  return Object.freeze({
    schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V2,
    algorithm: 'SHA-256' as const,
    sourceFileId: carrier.sourceFileId,
    sourceSha256,
    baseContentBindingVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
    baseSelectedGeometrySha256,
    selectedGeometryAndSourcePathSha256: Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
  });
}

let claimed = false;

export async function buildDxfPipelineSourcePathCarrierV2(
  inputValue: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfPipelineSourcePathCarrierResultV2> {
  if (claimed)
    return blocked(
      new CarrierFailure('reentrant-call', 'request', 'reentrant source-path rebuild was refused.'),
    );
  claimed = true;
  try {
    const snapshot = snapshotData(inputValue, 'request', 0, {
      nodes: 0,
      properties: 0,
      seen: new Set(),
    });
    const request = exactKeys(
      snapshot,
      ['schemaVersion', 'source', 'contours', 'pieces', 'pipeline', 'sourceSha256'],
      'request',
    );
    if (request.schemaVersion !== DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2)
      fail('invalid-input', 'request.schemaVersion', 'schema version is unsupported.');
    if (typeof request.sourceSha256 !== 'string' || !SHA256.test(request.sourceSha256))
      fail('sha256-unavailable', 'request.sourceSha256', 'must be lowercase SHA-256.');

    const bridgeInput = createDxfPieceSpecProvenanceBridgeInputV1(
      freezeOwned(request.source) as DxfPieceSpecProvenanceSourceV1,
      freezeOwned(request.contours) as readonly DxfPieceSpecContourBoundaryV1[],
    );
    if (!bridgeInput.ok)
      fail(
        'phase-c-rebuild-blocked',
        'request.source/contours',
        bridgeInput.blockers.map(({ detail }) => detail).join('; '),
      );
    const rebuilt = bridgeDxfProvenanceToPieceSpecBoundaryV1(bridgeInput.value);
    if (!rebuilt.ok)
      fail(
        'phase-c-rebuild-blocked',
        'request.source/contours',
        rebuilt.blockers.map(({ detail }) => detail).join('; '),
      );

    const pipeline = request.pipeline as DxfPipelineProvenanceStageOutputV1;
    if (
      pipeline.schemaVersion !== DXF_PIPELINE_PROVENANCE_V1 ||
      pipeline.pipelineIntegrated !== true ||
      pipeline.productionReady !== false ||
      pipeline.heuristicRecoveryUsed !== false ||
      pipeline.pieceSpecWireIntegrated !== false ||
      pipeline.includesRawDxf !== false ||
      pipeline.includesTags !== false ||
      pipeline.includesAst !== false ||
      pipeline.blockers.length !== 0 ||
      !pipeline.carrier ||
      !pipeline.contentBinding
    )
      fail(
        'base-pipeline-invalid',
        'request.pipeline',
        'successful exact V1 pipeline is required.',
      );
    if (canonical(pipeline.carrier) !== canonical(rebuilt.value))
      fail(
        'base-carrier-mismatch',
        'request.pipeline.carrier',
        'fresh Phase-C carrier differs from the supplied V1 carrier.',
      );

    const pieces = request.pieces as readonly PieceSpec[];
    const baseBinding = await computeDxfPipelineContentBindingV1(
      rebuilt.value,
      pieces,
      request.sourceSha256,
      crypto,
    );
    if (!baseBinding.ok)
      fail(
        'base-content-binding-mismatch',
        'request.pipeline.contentBinding',
        baseBinding.blocker.detail,
      );
    if (canonical(baseBinding.value) !== canonical(pipeline.contentBinding))
      fail(
        'base-content-binding-mismatch',
        'request.pipeline.contentBinding',
        'fresh V1 final-coordinate content binding differs from the supplied pipeline.',
      );

    const contourByKey = new Map(
      bridgeInput.value.contours.map((contour) => [
        `${contour.pieceId}\0${contour.sizeToken}\0${contour.contourId}`,
        contour,
      ]),
    );
    const carrier: DxfPipelineSourcePathCarrierV2 = freezeOwned({
      schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
      sourceFileId: rebuilt.value.sourceFileId,
      pieces: rebuilt.value.pieces.map((piece) => ({
        pieceId: piece.pieceId,
        sizeToken: piece.sizeToken,
        contours: piece.contours.map((contour) => {
          const sourceContour = contourByKey.get(
            `${piece.pieceId}\0${piece.sizeToken}\0${contour.id}`,
          );
          if (!sourceContour || sourceContour.lineage.sourcePathIds.length !== 1)
            fail(
              'source-path-cardinality-invalid',
              `carrier.${piece.pieceId}.${contour.id}`,
              'exactly one verified pre-projection source PathId is required.',
            );
          const sourcePathId = sourceContour.lineage.sourcePathIds[0]!;
          if (!Number.isSafeInteger(sourcePathId) || sourcePathId < 0)
            fail(
              'source-path-cardinality-invalid',
              `carrier.${piece.pieceId}.${contour.id}`,
              'source PathId must be a non-negative safe integer.',
            );
          return {
            id: contour.id,
            role: contour.role,
            geometry: contour.geometry,
            sourceVertices: contour.sourceVertices.map((vertex) => ({
              ...vertex,
              sourcePathId,
            })),
          };
        }),
      })),
      upstreamBlockerCount: rebuilt.value.upstreamBlockerCount,
      productionReady: false as const,
      heuristicRecoveryUsed: false as const,
      pieceSpecWireIntegrated: false as const,
      includesRawDxf: false as const,
      includesTags: false as const,
      includesAst: false as const,
    });
    const contentBinding = await computeV2Binding(
      carrier,
      pieces,
      request.sourceSha256,
      baseBinding.value.selectedGeometrySha256,
      crypto,
    );
    const artifact: DxfPipelineSourcePathArtifactV2 = freezeOwned({
      schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
      carrier,
      contentBinding,
      claims: {
        rebuiltFromExactPhaseCLineage: true as const,
        baseCarrierByteSemanticMatch: true as const,
        baseContentBindingFreshlyRecomputed: true as const,
        sourcePathIdIncludedInV2ContentBinding: true as const,
        sourceCurveIdParsingUsed: false as const,
        nearestGeometryRecoveryUsed: false as const,
        topologyMutationRecoveryUsed: false as const,
        writerExportShaBound: false as const,
        trustedAuthorityIntegrated: false as const,
        productionReady: false as const,
      },
    });
    return Object.freeze({ ok: true as const, artifact, blockers: Object.freeze([]) });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}
