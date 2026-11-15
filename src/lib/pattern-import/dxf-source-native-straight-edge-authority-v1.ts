import { createDxfSourceCurveIdV1 } from './dxf-path-provenance-v1';
import { decodeDxfSourceNativeStraightEdgesInternalV1 } from './adapters/dxf/extract';
import type { DxfPathProvenanceReadArtifactV1, DxfRead } from './adapters/dxf/dxf-types';
import type { ExtractOpts, Progress } from './types';

export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1 =
  'dxf-source-native-straight-edge-authority/1' as const;
export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_OWNER_V1 =
  'dxf-source-native-straight-edge-owner/1' as const;
export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1 =
  'dxf-source-native-straight-edge-projection-request/1' as const;

export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1 = Object.freeze({
  maximumDescriptors: 100_000,
  maximumBlockers: 4_096,
  maximumStableIdUtf8Bytes: 256,
  maximumDetailUtf8Bytes: 1_024,
  maximumCanonicalUtf8Bytes: 32 * 1024 * 1024,
  maximumCoordinateAbsMm: 1_000_000_000,
} as const);

export type DxfSourceNativeStraightEdgeUnsupportedCodeV1 =
  | 'unsupported-bulge'
  | 'unsupported-arc'
  | 'unsupported-circle'
  | 'unsupported-ellipse'
  | 'unsupported-spline'
  | 'unsupported-spline-fit-polyline'
  | 'unsupported-entity-kind';

export type DxfSourceNativeStraightEdgeBlockerCodeV1 =
  | 'source-file-id-missing'
  | 'source-file-id-invalid'
  | 'source-identity-mismatch'
  | 'path-provenance-unavailable'
  | 'identity-rejected'
  | 'duplicate-descriptor'
  | 'degenerate-line'
  | 'bounds-exceeded'
  | 'decode-failed'
  | 'sha256-unavailable'
  | 'forged-owner'
  | 'stale-owner'
  | DxfSourceNativeStraightEdgeUnsupportedCodeV1;

export type DxfSourceNativeStraightEdgeBlockerV1 = Readonly<{
  code: DxfSourceNativeStraightEdgeBlockerCodeV1;
  sourceFileId: string | null;
  sourcePathId: number | null;
  sourceCurveId: string | null;
  primitiveSegmentIndex: number | null;
  entityType: string | null;
  detail: string;
}>;

export type DxfSourceNativeStraightEdgeDescriptorV1 = Readonly<{
  sourceFileId: string;
  sourceCurveId: string;
  instancePath: readonly string[];
  path: Readonly<{
    sourcePathId: number;
    closed: boolean;
    startPointIndex: number;
    endPointIndex: number;
  }>;
  primitive: Readonly<{
    entityType: 'LINE' | 'LWPOLYLINE' | 'POLYLINE';
    entityHandle: string | null;
    entityOp: number;
    sub: number;
    primitiveSegmentIndex: number;
  }>;
  startVertexId: string;
  endVertexId: string;
  startMm: readonly [x: number, y: number];
  endMm: readonly [x: number, y: number];
  nativeFrame: 'page-mm';
  normalization: Readonly<{
    kind: 'exact-affine-line-to-page-mm';
    sourceAffine: Readonly<{
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;
    }>;
  }>;
  native: Readonly<{
    sourceCurveId: string;
    curveKind: 'line';
    parameterSpace: 'unit';
    sourceCurveTRange: readonly [0, 1];
    chordErrorBoundMm: 0;
    periodic: false;
    transform: Readonly<{ kind: 'identity' }>;
  }>;
}>;

export type DxfSourceNativeStraightEdgeProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1;
  sourceFileId: string;
  sourceSha256: string;
  authoritySha256: string;
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[];
  blockers: readonly DxfSourceNativeStraightEdgeBlockerV1[];
  complete: boolean;
  claims: Readonly<{
    freshExtractionReplay: true;
    curveKindLineMintedByDecoder: true;
    endpointInferenceUsed: false;
    parameterSpaceInferenceUsed: false;
    pageMmNormalizationExactForAffineLines: true;
    descriptorTransformIdentity: true;
    includesRawDxf: false;
    includesTags: false;
    includesAst: false;
    includesBytes: false;
    phaseDIntegrated: false;
    phase2RequestIntegrated: false;
    productionReady: false;
  }>;
}>;

/** Opaque one-shot capability. Runtime authority is held in a module-local WeakMap. */
export type DxfSourceNativeStraightEdgeOwnerV1 = Readonly<{
  version: typeof DXF_SOURCE_NATIVE_STRAIGHT_EDGE_OWNER_V1;
  opaque: 'module-private-weak-owner';
}>;

export type DxfSourceNativeStraightEdgeReadV1 = Readonly<{
  read: DxfRead;
  provenance: DxfPathProvenanceReadArtifactV1;
  owner: DxfSourceNativeStraightEdgeOwnerV1;
}>;

export type DxfSourceNativeStraightEdgeReadResultV1 =
  | Readonly<{ ok: true; value: DxfSourceNativeStraightEdgeReadV1 }>
  | Readonly<{
      ok: false;
      blockers: readonly DxfSourceNativeStraightEdgeBlockerV1[];
      productionReady: false;
    }>;

export type DxfSourceNativeStraightEdgeProjectionRequestV1 = Readonly<{
  schemaVersion: typeof DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1;
  sourceFileId: string;
  sourceSha256: string;
}>;

export type DxfSourceNativeStraightEdgeProjectionResultV1 =
  | Readonly<{ ok: true; projection: DxfSourceNativeStraightEdgeProjectionV1 }>
  | Readonly<{
      ok: false;
      projection: null;
      blockers: readonly DxfSourceNativeStraightEdgeBlockerV1[];
    }>;

/** Internal decoder output. It is not a public authority and cannot mint an owner. */
export type DxfSourceNativeStraightEdgeDecodedCandidateV1 = DxfSourceNativeStraightEdgeDescriptorV1;

/** Internal decoder blocker. It is copied and bounded before any public projection. */
export type DxfSourceNativeStraightEdgeDecodedBlockerV1 = DxfSourceNativeStraightEdgeBlockerV1;

export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_CONTRACT_V1 = Object.freeze({
  authorityOrigin: 'fresh DXF extraction decoder only',
  admittedPrimitives: Object.freeze(['LINE', 'straight LWPOLYLINE', 'straight POLYLINE']),
  unsupportedPrimitives: Object.freeze([
    'bulge',
    'ARC',
    'CIRCLE',
    'ELLIPSE',
    'SPLINE',
    'spline-fit POLYLINE',
  ]),
  lineNormalization: 'exact affine image in page-mm, then identity descriptor transform',
  curveKindInferenceFromEndpointsAllowed: false,
  curveKindInferenceFromParameterSpaceAllowed: false,
  existingPathProvenanceV1ShapeChanged: false,
  existingPathProvenanceV1DigestChanged: false,
  ownerReplay: 'one-shot module-private WeakMap capability',
  phaseDIntegrated: false,
  phase2RequestIntegrated: false,
  productionReady: false,
} as const);

type OwnerState = {
  consumed: boolean;
  sourceFileId: string;
  sourceSha256: string;
  authoritySha256: string;
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[];
  blockers: readonly DxfSourceNativeStraightEdgeBlockerV1[];
};

const ownerState = new WeakMap<object, OwnerState>();
const textEncoder = new TextEncoder();
const SHA256 = /^[0-9a-f]{64}$/;

function freezeBlocker(
  blocker: DxfSourceNativeStraightEdgeDecodedBlockerV1,
): DxfSourceNativeStraightEdgeBlockerV1 {
  const detail = boundedText(
    blocker.detail,
    DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumDetailUtf8Bytes,
  );
  return Object.freeze({
    code: blocker.code,
    sourceFileId: boundedStableId(blocker.sourceFileId),
    sourcePathId: Number.isSafeInteger(blocker.sourcePathId) ? blocker.sourcePathId : null,
    sourceCurveId: boundedStableId(blocker.sourceCurveId),
    primitiveSegmentIndex: Number.isSafeInteger(blocker.primitiveSegmentIndex)
      ? blocker.primitiveSegmentIndex
      : null,
    entityType: boundedStableId(blocker.entityType),
    detail,
  });
}

function blocker(
  code: DxfSourceNativeStraightEdgeBlockerCodeV1,
  detail: string,
  sourceFileId: string | null = null,
): DxfSourceNativeStraightEdgeBlockerV1 {
  return freezeBlocker({
    code,
    sourceFileId,
    sourcePathId: null,
    sourceCurveId: null,
    primitiveSegmentIndex: null,
    entityType: null,
    detail,
  });
}

function failure(
  code: DxfSourceNativeStraightEdgeBlockerCodeV1,
  detail: string,
  sourceFileId: string | null = null,
): DxfSourceNativeStraightEdgeReadResultV1 {
  return Object.freeze({
    ok: false as const,
    blockers: Object.freeze([blocker(code, detail, sourceFileId)]),
    productionReady: false as const,
  });
}

function projectionFailure(
  code: DxfSourceNativeStraightEdgeBlockerCodeV1,
  detail: string,
  sourceFileId: string | null = null,
): DxfSourceNativeStraightEdgeProjectionResultV1 {
  return Object.freeze({
    ok: false as const,
    projection: null,
    blockers: Object.freeze([blocker(code, detail, sourceFileId)]),
  });
}

function boundedText(value: unknown, maximumBytes: number): string {
  if (typeof value !== 'string') return 'invalid blocker detail';
  if (textEncoder.encode(value).byteLength <= maximumBytes) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > maximumBytes) break;
    output += scalar;
  }
  return `${output}…`;
}

function boundedStableId(value: unknown): string | null {
  return typeof value === 'string' &&
    textEncoder.encode(value).byteLength <=
      DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumStableIdUtf8Bytes
    ? value
    : null;
}

function exactRecord(value: unknown, expected: readonly string[]): Record<string, unknown> | null {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== 'string' || !expected.includes(key))
    )
      return null;
    const output: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function explicitSourceFileId(optionsInput: unknown): string | null {
  const options = exactRecord(optionsInput, ['sourceFileId']);
  if (!options) return null;
  const probe = createDxfSourceCurveIdV1({
    sourceFileId: options.sourceFileId,
    instancePath: [],
    entityHandle: null,
    entityOp: 0,
    sub: 0,
    primitiveSegmentIndex: 0,
  });
  return probe.ok ? (options.sourceFileId as string) : null;
}

function finiteCanonical(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError('non-finite descriptor number');
  return Object.is(value, -0) ? 0 : value;
}

function freezeDescriptor(
  candidate: DxfSourceNativeStraightEdgeDecodedCandidateV1,
): DxfSourceNativeStraightEdgeDescriptorV1 {
  return Object.freeze({
    sourceFileId: candidate.sourceFileId,
    sourceCurveId: candidate.sourceCurveId,
    instancePath: Object.freeze([...candidate.instancePath]),
    path: Object.freeze({ ...candidate.path }),
    primitive: Object.freeze({ ...candidate.primitive }),
    startVertexId: candidate.startVertexId,
    endVertexId: candidate.endVertexId,
    startMm: Object.freeze([
      finiteCanonical(candidate.startMm[0]),
      finiteCanonical(candidate.startMm[1]),
    ]) as readonly [number, number],
    endMm: Object.freeze([
      finiteCanonical(candidate.endMm[0]),
      finiteCanonical(candidate.endMm[1]),
    ]) as readonly [number, number],
    nativeFrame: 'page-mm' as const,
    normalization: Object.freeze({
      kind: 'exact-affine-line-to-page-mm' as const,
      sourceAffine: Object.freeze({
        a: finiteCanonical(candidate.normalization.sourceAffine.a),
        b: finiteCanonical(candidate.normalization.sourceAffine.b),
        c: finiteCanonical(candidate.normalization.sourceAffine.c),
        d: finiteCanonical(candidate.normalization.sourceAffine.d),
        e: finiteCanonical(candidate.normalization.sourceAffine.e),
        f: finiteCanonical(candidate.normalization.sourceAffine.f),
      }),
    }),
    native: Object.freeze({
      sourceCurveId: candidate.sourceCurveId,
      curveKind: 'line' as const,
      parameterSpace: 'unit' as const,
      sourceCurveTRange: Object.freeze([0, 1]) as readonly [0, 1],
      chordErrorBoundMm: 0 as const,
      periodic: false as const,
      transform: Object.freeze({ kind: 'identity' as const }),
    }),
  });
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
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

async function sha256(value: unknown): Promise<string | null> {
  try {
    const encoded = textEncoder.encode(
      `dxf-source-native-straight-edge-authority-v1\0${canonical(value)}`,
    );
    if (encoded.byteLength > DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumCanonicalUtf8Bytes)
      return null;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof subtle.digest !== 'function') return null;
    const digest = new Uint8Array(await subtle.digest('SHA-256', encoded));
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Fresh extraction entry point. The line fact is minted inside the DXF entity decoder. This wrapper
 * only snapshots that private capture and creates a one-shot owner; it never derives curve kind.
 */
export async function readDxfWithSourceNativeStraightEdgeAuthorityV1(
  file: { id: string; name: string; bytes: ArrayBuffer; generatedFusing?: boolean },
  opts: ExtractOpts,
  authorityOptions: unknown,
  progress?: Progress,
): Promise<DxfSourceNativeStraightEdgeReadResultV1> {
  const sourceFileId = explicitSourceFileId(authorityOptions);
  if (!sourceFileId)
    return failure(
      authorityOptions === undefined ? 'source-file-id-missing' : 'source-file-id-invalid',
      'A fresh straight-edge read requires one exact caller-owned sourceFileId.',
    );
  try {
    const decoded = await decodeDxfSourceNativeStraightEdgesInternalV1(
      file,
      opts,
      sourceFileId,
      progress,
    );
    if (decoded.candidates.length > DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumDescriptors)
      return failure('bounds-exceeded', 'Straight-edge descriptor bound exceeded.', sourceFileId);
    if (decoded.blockers.length > DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumBlockers)
      return failure('bounds-exceeded', 'Straight-edge blocker bound exceeded.', sourceFileId);

    const descriptors = Object.freeze(decoded.candidates.map(freezeDescriptor));
    const blockers = Object.freeze(decoded.blockers.map(freezeBlocker));
    const seen = new Set<string>();
    for (const descriptor of descriptors) {
      const identity = `${descriptor.sourceFileId}\0${descriptor.path.sourcePathId}\0${descriptor.sourceCurveId}\0${descriptor.primitive.primitiveSegmentIndex}`;
      if (seen.has(identity))
        return failure(
          'duplicate-descriptor',
          'Fresh extraction produced a duplicate straight-edge identity.',
          sourceFileId,
        );
      seen.add(identity);
    }
    const sourceSha256 = decoded.read.doc.file.sha256;
    if (!SHA256.test(sourceSha256))
      return failure('sha256-unavailable', 'Fresh source SHA-256 is unavailable.', sourceFileId);
    const authoritySha256 = await sha256({
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1,
      sourceFileId,
      sourceSha256,
      descriptors,
      blockers,
    });
    if (!authoritySha256)
      return failure(
        'sha256-unavailable',
        'Authority SHA-256 could not be computed.',
        sourceFileId,
      );

    const owner = Object.freeze({
      version: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_OWNER_V1,
      opaque: 'module-private-weak-owner' as const,
    });
    ownerState.set(owner, {
      consumed: false,
      sourceFileId,
      sourceSha256,
      authoritySha256,
      descriptors,
      blockers,
    });
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({ read: decoded.read, provenance: decoded.provenance, owner }),
    });
  } catch {
    return failure(
      'decode-failed',
      'Fresh DXF extraction could not mint straight-edge authority.',
      sourceFileId,
    );
  }
}

/** Consumes one genuine owner and returns detached immutable metadata. */
export function projectDxfSourceNativeStraightEdgeAuthorityV1(
  owner: unknown,
  requestInput: unknown,
): DxfSourceNativeStraightEdgeProjectionResultV1 {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null)
    return projectionFailure('forged-owner', 'Straight-edge owner is not genuine.');
  const state = ownerState.get(owner);
  if (!state) return projectionFailure('forged-owner', 'Straight-edge owner is not genuine.');
  if (state.consumed)
    return projectionFailure(
      'stale-owner',
      'Straight-edge owner was already consumed.',
      state.sourceFileId,
    );
  state.consumed = true;

  const request = exactRecord(requestInput, ['schemaVersion', 'sourceFileId', 'sourceSha256']);
  if (
    !request ||
    request.schemaVersion !== DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1 ||
    request.sourceFileId !== state.sourceFileId ||
    request.sourceSha256 !== state.sourceSha256
  )
    return projectionFailure(
      'source-identity-mismatch',
      'Projection request does not exact-match the fresh source identity.',
      state.sourceFileId,
    );

  const projection: DxfSourceNativeStraightEdgeProjectionV1 = Object.freeze({
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1,
    sourceFileId: state.sourceFileId,
    sourceSha256: state.sourceSha256,
    authoritySha256: state.authoritySha256,
    descriptors: Object.freeze(state.descriptors.map(freezeDescriptor)),
    blockers: Object.freeze(state.blockers.map(freezeBlocker)),
    complete: state.descriptors.length > 0 && state.blockers.length === 0,
    claims: Object.freeze({
      freshExtractionReplay: true as const,
      curveKindLineMintedByDecoder: true as const,
      endpointInferenceUsed: false as const,
      parameterSpaceInferenceUsed: false as const,
      pageMmNormalizationExactForAffineLines: true as const,
      descriptorTransformIdentity: true as const,
      includesRawDxf: false as const,
      includesTags: false as const,
      includesAst: false as const,
      includesBytes: false as const,
      phaseDIntegrated: false as const,
      phase2RequestIntegrated: false as const,
      productionReady: false as const,
    }),
  });
  return Object.freeze({ ok: true as const, projection });
}
