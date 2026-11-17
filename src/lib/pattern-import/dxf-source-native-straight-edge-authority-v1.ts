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
  selectedPathCoverage: Readonly<{
    globalFailure: boolean;
    paths: ReadonlyMap<
      number,
      Readonly<{ pointCount: number; closed: boolean; rejected: boolean }>
    >;
  }>;
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
    // Retain the decoder's independent coverage ledger before returning its mutable public read.
    const selectedPathCoverage = Object.freeze({
      globalFailure: decoded.selectedPathCoverage.globalFailure,
      paths: new Map(
        decoded.selectedPathCoverage.paths.map(
          ({ sourcePathId, ...coverage }) =>
            [sourcePathId, Object.freeze({ ...coverage })] as const,
        ),
      ),
    });
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
      selectedPathCoverage,
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

export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1 =
  'dxf-source-native-straight-edge-selected-paths-request/1' as const;
export const DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_V1 =
  'dxf-source-native-straight-edge-selected-paths/1' as const;

export type DxfSourceNativeStraightEdgeSelectedPathsRequestV1 = Readonly<{
  schemaVersion: typeof DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1;
  sourceFileId: string;
  sourceSha256: string;
  /** Strictly increasing, unique exact native path IDs; no geometry-based selection. */
  sourcePathIds: readonly number[];
}>;

export type DxfSourceNativeStraightEdgeSelectedPathsProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_V1;
  sourceFileId: string;
  sourceSha256: string;
  authoritySha256: string;
  scope: Readonly<{
    kind: 'exact-selected-source-paths';
    sourcePathIds: readonly number[];
    wholeFileCompletenessClaimed: false;
  }>;
  descriptors: readonly DxfSourceNativeStraightEdgeDescriptorV1[];
  blockers: readonly DxfSourceNativeStraightEdgeBlockerV1[];
  /** Complete only for every exact path in scope, never for the entire source file. */
  complete: boolean;
  claims: DxfSourceNativeStraightEdgeProjectionV1['claims'] &
    Readonly<{
      completenessScope: 'exact-selected-source-paths';
      fullSelectedPathSegmentCoverageChecked: true;
      diagnosticTruncationCannotHideSelectedRejection: true;
      wholeFileCompletenessClaimed: false;
    }>;
}>;

export type DxfSourceNativeStraightEdgeSelectedPathsProjectionResultV1 =
  | Readonly<{ ok: true; projection: DxfSourceNativeStraightEdgeSelectedPathsProjectionV1 }>
  | Extract<DxfSourceNativeStraightEdgeProjectionResultV1, { ok: false }>;

function selectedFailure(
  code: DxfSourceNativeStraightEdgeBlockerCodeV1,
  detail: string,
  sourceFileId: string | null = null,
): Extract<DxfSourceNativeStraightEdgeProjectionResultV1, { ok: false }> {
  return Object.freeze({
    ok: false,
    projection: null,
    blockers: Object.freeze([blocker(code, detail, sourceFileId)]),
  });
}

function captureSelectedPathIds(input: unknown): readonly number[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    const length = Object.getOwnPropertyDescriptor(input, 'length')?.value;
    if (
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumDescriptors
    )
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const output: number[] = [];
    for (let i = 0; i < length; i++) {
      const d = descriptors[String(i)];
      if (
        !d ||
        !d.enumerable ||
        !Object.hasOwn(d, 'value') ||
        d.get ||
        d.set ||
        !Number.isSafeInteger(d.value) ||
        d.value < 0 ||
        Object.is(d.value, -0) ||
        (i > 0 && d.value <= output[i - 1])
      )
        return null;
      output.push(d.value);
    }
    return Object.freeze(output);
  } catch {
    return null;
  }
}

/**
 * Consumes the same genuine one-shot decoder capability as V1, but seals an explicitly bounded
 * path scope. The decoder's private coverage ledger, not a filtered public V1 projection, proves
 * coverage. Diagnostic truncation is harmless only when this independent ledger is complete.
 */
export async function projectDxfSourceNativeStraightEdgeSelectedPathsV1(
  owner: unknown,
  requestInput: unknown,
): Promise<DxfSourceNativeStraightEdgeSelectedPathsProjectionResultV1> {
  if ((typeof owner !== 'object' && typeof owner !== 'function') || owner === null)
    return selectedFailure('forged-owner', 'Straight-edge owner is not genuine.');
  const state = ownerState.get(owner);
  if (!state) return selectedFailure('forged-owner', 'Straight-edge owner is not genuine.');
  if (state.consumed)
    return selectedFailure(
      'stale-owner',
      'Straight-edge owner was already consumed.',
      state.sourceFileId,
    );
  // Claim before any request reflection, including adversarial proxy traps/reentrant calls.
  state.consumed = true;
  const request = exactRecord(requestInput, [
    'schemaVersion',
    'sourceFileId',
    'sourceSha256',
    'sourcePathIds',
  ]);
  if (
    !request ||
    request.schemaVersion !== DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1 ||
    request.sourceFileId !== state.sourceFileId ||
    request.sourceSha256 !== state.sourceSha256
  )
    return selectedFailure(
      'source-identity-mismatch',
      'Selected projection must exact-match the fresh source identity.',
      state.sourceFileId,
    );
  const sourcePathIds = captureSelectedPathIds(request.sourcePathIds);
  if (!sourcePathIds)
    return selectedFailure(
      'bounds-exceeded',
      'Selected paths must be bounded, strictly increasing unique native path IDs.',
      state.sourceFileId,
    );

  const selected = new Set(sourcePathIds);
  const grouped = new Map<number, DxfSourceNativeStraightEdgeDescriptorV1[]>();
  for (const descriptor of state.descriptors) {
    const id = descriptor.path.sourcePathId;
    if (!selected.has(id)) continue;
    const group = grouped.get(id) ?? [];
    group.push(descriptor);
    grouped.set(id, group);
  }
  const blockers: DxfSourceNativeStraightEdgeBlockerV1[] = [];
  const reject = (sourcePathId: number | null, detail: string) => {
    // Reserve one summary if a large requested scope itself exceeds presentation diagnostics.
    if (blockers.length >= DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumBlockers) return;
    blockers.push(
      freezeBlocker({
        ...blocker('path-provenance-unavailable', detail, state.sourceFileId),
        sourcePathId,
      }),
    );
  };
  if (state.selectedPathCoverage.globalFailure)
    reject(null, 'Global source/descriptor/coverage loss prevents selected-path completeness.');
  const descriptors: DxfSourceNativeStraightEdgeDescriptorV1[] = [];
  for (const id of sourcePathIds) {
    const coverage = state.selectedPathCoverage.paths.get(id);
    const group = grouped.get(id) ?? [];
    if (!coverage || coverage.rejected) {
      reject(
        id,
        'The exact selected native path is missing or decoder-rejected (independent of diagnostic truncation).',
      );
      continue;
    }
    const expected = coverage.closed ? coverage.pointCount : coverage.pointCount - 1;
    const byStart = new Map(group.map((d) => [d.path.startPointIndex, d]));
    let valid = expected > 0 && group.length === expected && byStart.size === expected;
    for (let i = 0; valid && i < expected; i++) {
      const edge = byStart.get(i);
      const end = coverage.closed ? (i + 1) % coverage.pointCount : i + 1;
      valid = !!edge && edge.path.closed === coverage.closed && edge.path.endPointIndex === end;
      if (!valid || !edge) break;
      const next = byStart.get(end);
      // Equality confirms exact adjacent endpoint identity; it never selects or recovers an edge.
      if (
        next &&
        (edge.endVertexId !== next.startVertexId ||
          edge.endMm[0] !== next.startMm[0] ||
          edge.endMm[1] !== next.startMm[1])
      )
        valid = false;
    }
    if (!valid) {
      reject(id, 'Selected path does not have complete ordered native segment coverage.');
      continue;
    }
    descriptors.push(...group.map(freezeDescriptor));
  }
  const scope = Object.freeze({
    kind: 'exact-selected-source-paths' as const,
    sourcePathIds,
    wholeFileCompletenessClaimed: false as const,
  });
  const content = Object.freeze({
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_V1,
    sourceFileId: state.sourceFileId,
    sourceSha256: state.sourceSha256,
    scope,
    descriptors: Object.freeze(descriptors),
    blockers: Object.freeze(blockers),
    complete: blockers.length === 0 && descriptors.length > 0,
  });
  let authoritySha256: string;
  try {
    const bytes = textEncoder.encode(
      `dxf-source-native-straight-edge-selected-paths-v1\0${canonical(content)}`,
    );
    if (bytes.byteLength > DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1.maximumCanonicalUtf8Bytes)
      return selectedFailure(
        'bounds-exceeded',
        'Selected metadata canonical byte bound exceeded.',
        state.sourceFileId,
      );
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) throw new Error('Invalid digest');
    authoritySha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return selectedFailure(
      'sha256-unavailable',
      'Selected metadata SHA-256 is unavailable.',
      state.sourceFileId,
    );
  }
  return Object.freeze({
    ok: true,
    projection: Object.freeze({
      ...content,
      authoritySha256,
      claims: Object.freeze({
        freshExtractionReplay: true,
        curveKindLineMintedByDecoder: true,
        endpointInferenceUsed: false,
        parameterSpaceInferenceUsed: false,
        pageMmNormalizationExactForAffineLines: true,
        descriptorTransformIdentity: true,
        includesRawDxf: false,
        includesTags: false,
        includesAst: false,
        includesBytes: false,
        phaseDIntegrated: false,
        phase2RequestIntegrated: false,
        productionReady: false,
        completenessScope: 'exact-selected-source-paths',
        fullSelectedPathSegmentCoverageChecked: true,
        diagnosticTruncationCannotHideSelectedRejection: true,
        wholeFileCompletenessClaimed: false,
      } as const),
    }),
  });
}
