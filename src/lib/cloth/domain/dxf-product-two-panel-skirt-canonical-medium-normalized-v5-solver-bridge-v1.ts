import {
  compileSimulationPackageV5,
  validateSimulationPackageV5,
  type CompileSimulationPackageV5Options,
  type SimulationPackageV5,
} from '../compiler/simulation-package';
import {
  sealSimulationPackageV5V1,
  type SealedSimulationPackageV5V1,
  type SimulationPackageV5SealV1,
} from '../compiler/simulation-package-v5-integrity';
import {
  decodeParticleMassGpuV1,
  decodeTriangleRestFrameGpuV1,
} from '../compiler/material-package';
import { SUPPORT_ATTACHMENT_POLICY_V1_VERSION } from '../compiler/support-attachment-policy';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from '../material/presets';
import { type ClothMeshIR } from '../mesh/cloth-mesh-ir';
import {
  evaluateTriangleStrain,
  type TrianglePositions,
} from '../runtime/cpu/triangle-strain-oracle';
import {
  projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2,
} from './dxf-product-two-panel-skirt-canonical-medium-self-orientation-v2';
import {
  projectPatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
  type PatternImportDxfProductGarmentMeshComposerProjectionV3,
} from './pattern-import-dxf-product-garment-mesh-composer-v3';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1 =
  'dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-request/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REPORT_V1 =
  'dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-report/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_OWNER_V1 =
  'dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-owner/1' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_PROJECTION_V1 =
  'dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-projection/1' as const;

const EXPECTED_VERTEX_COUNT = 580;
const EXPECTED_TRIANGLE_COUNT = 912;
const EXPECTED_SEAM_PAIR_COUNT = 34;
const EXPECTED_PIN_COUNT = 82;
const EXPECTED_NORMALIZED_TRIANGLE_COUNT = 456;
const FIXED_DT_S = 1 / 120;
const FIXED_SOLVER_ITERATIONS = 8;
const SHA256 = /^[0-9a-f]{64}$/;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const objectPrototype = Object.prototype;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const structuredCloneCaptured = globalThis.structuredClone.bind(globalThis);
const textEncoder = new TextEncoder();
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;

const visualMaterial = VISUAL_UNCALIBRATED_CLOTH_PRESETS[1]!;

export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1;
  expected: Readonly<{
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    selfOrientationReportSha256: string;
  }>;
  composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  selfOrientationOwner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeClaimsV1 = Readonly<{
  status: 'diagnostic-complete';
  genuineComposerV3Bound: true;
  selfOrientationV2Bound: true;
  normalizedTopologyReplayed: true;
  sourceMaterialFramesBound: true;
  originalAndNormalizedV5Compiled: true;
  originalAndNormalizedV5Validated: true;
  normalizedInverseRestStateRebuilt: true;
  exactMappedStrainParityEstablished: true;
  normalizedTopologySolverMaterialCompatibilityEstablished: true;
  normalizedV5DiagnosticPackageAuthority: true;
  initializationTransportBound: true;
  physicalInverseMassTransportBound: true;
  sourceAdmissionAuthority: false;
  materialCalibrationAuthority: false;
  placementAuthority: false;
  collisionAuthority: false;
  retentionAuthority: false;
  settleAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REPORT_V1;
  status: 'diagnostic-complete';
  bindings: Readonly<{
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    selfOrientationReportSha256: string;
    originalTopologySha256: string;
    normalizedTopologySha256: string;
    sourceTriangleMaterialFramesSha256: string;
    mappedPositions3MSha256: string;
    mappedPositionsPinMaskSha256: string;
    initialPhysicalPositionsInvMassKgSha256: string;
    seamPairsSha256: string;
    pinnedWaistVertexIndicesSha256: string;
    originalV5AggregateSha256: string;
    normalizedV5AggregateSha256: string;
  }>;
  policy: Readonly<{
    materialId: string;
    materialRevision: string;
    calibrationStatus: 'uncalibrated-visual';
    dtS: typeof FIXED_DT_S;
    solverIterations: typeof FIXED_SOLVER_ITERATIONS;
    supportMode: 'explicit-fixed-particles';
    inverseMassSource: 'normalized-v5-particle-mass-records';
    continuumComplianceMPerN: Readonly<{ warp: number; weft: number; shear: number }>;
  }>;
  counts: Readonly<{
    pieceCount: number;
    vertexCount: number;
    triangleCount: number;
    normalizedTriangleCount: number;
    seamPairCount: number;
    pinnedWaistVertexCount: number;
    zeroPhysicalInverseMassCount: number;
    positivePhysicalInverseMassCount: number;
    distanceConstraintCount: number;
    distanceColorCount: number;
    seamConstraintCount: number;
    seamColorCount: number;
    bendConstraintCount: number;
    bendColorCount: number;
    continuumConstraintCount: number;
    continuumColorCount: number;
    materialCount: number;
  }>;
  topology: Readonly<{
    everyNormalizedTriangleIsExactOriginalOrBCSwap: true;
    originalTriangleCount: number;
    unchangedTriangleCount: number;
    bcSwapTriangleCount: number;
    sourcePieceGrainsDegrees: readonly Readonly<{ pieceId: string; grainDegrees: number }>[];
  }>;
  packageParity: Readonly<{
    bothPackagesValidated: true;
    manifestWorkloadCountsEqual: true;
    distanceBuffersByteEqual: boolean;
    seamBuffersByteEqual: boolean;
    bendConstraintCountsEqual: true;
    continuumConstraintCountsEqual: true;
    supportParticleIndicesEqual: true;
    normalizedPackageOwnsRebuiltRestFrames: true;
    originalAndNormalizedPackageSealsDiffer: true;
  }>;
  strainParity: Readonly<{
    evaluatedTriangleCount: number;
    maximumAbsoluteWarpDelta: number;
    maximumAbsoluteWeftDelta: number;
    maximumAbsoluteShearDelta: number;
    maximumAbsoluteComponentDelta: number;
    maximumAbsoluteNormalizedWarp: number;
    maximumAbsoluteNormalizedWeft: number;
    maximumAbsoluteNormalizedShear: number;
    degenerateRestFrameCount: 0;
    nonFiniteStrainCount: 0;
    exactComponentParity: boolean;
  }>;
  decision: 'PASS_NORMALIZED_V5_SOLVER_MATERIAL_BRIDGE';
  blockers: readonly [
    'source-admission-not-established',
    'visual-material-not-calibrated',
    'retention-and-settle-not-established',
    'runtime-authority-not-established',
  ];
  claims: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeClaimsV1;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-same-session-normalized-v5-diagnostic-only';
  }>;
}>;

declare const normalizedV5OwnerBrand: unique symbol;
export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_OWNER_V1;
  report: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1;
  readonly [normalizedV5OwnerBrand]: never;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeProjectionV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_PROJECTION_V1;
  reportCanonicalSha256: string;
  normalizedV5: SealedSimulationPackageV5V1;
  mappedPositionsPinMask: Float32Array;
  initialPhysicalPositionsInvMassKg: Float32Array;
  normalizedTriangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  callerOwnedMutableCopies: true;
  normalizedTopologySolverMaterialCompatibilityEstablished: true;
  normalizedV5DiagnosticPackageAuthority: true;
  initializationTransportBound: true;
  physicalInverseMassTransportBound: true;
  sourceAdmissionAuthority: false;
  materialCalibrationAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeErrorCodeV1 =
  | 'invalid-input'
  | 'upstream-owner-unavailable'
  | 'upstream-owner-stale'
  | 'upstream-binding-mismatch'
  | 'topology-normalization-mismatch'
  | 'material-frame-mismatch'
  | 'package-compilation-failed'
  | 'package-validation-failed'
  | 'strain-parity-failed'
  | 'sha256-unavailable';

export type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeResultV1 =
  | Readonly<{
      ok: true;
      owner: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1;
      report: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1;
      claims: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeClaimsV1;
    }>
  | Readonly<{
      ok: false;
      code: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeErrorCodeV1;
      detail: string;
    }>;

type OwnerRecord = {
  normalizedV5: SealedSimulationPackageV5V1;
  mappedPositionsPinMask: Float32Array;
  initialPhysicalPositionsInvMassKg: Float32Array;
  normalizedTriangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
};

const owners = new WeakMap<object, OwnerRecord>();

class BridgeError extends Error {
  constructor(
    readonly code: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeErrorCodeV1,
  message: string,
): never {
  throw new BridgeError(code, message);
}

function blocked(
  error: unknown,
): DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeResultV1 {
  if (error instanceof BridgeError)
    return Object.freeze({ ok: false, code: error.code, detail: error.message });
  return Object.freeze({
    ok: false,
    code: 'package-compilation-failed' as const,
    detail: error instanceof Error ? error.message : 'Normalized V5 bridge failed closed.',
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || objectGetPrototypeOf(value) !== objectPrototype) {
    fail('invalid-input', `${label} must be one plain object.`);
  }
  if (objectGetOwnPropertySymbols(value).length !== 0) {
    fail('invalid-input', `${label} must not contain symbol keys.`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const actual = objectKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('invalid-input', `${label} fields are incomplete or unsupported.`);
  }
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
      fail('invalid-input', `${label}.${key} must be an enumerable data property.`);
    }
    record[key] = descriptor.value;
  }
  return record;
}

function snapshotRequest(
  value: unknown,
): DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeRequestV1 {
  const record = exactRecord(
    value,
    ['schemaVersion', 'expected', 'composerV3Owner', 'selfOrientationOwner'],
    'request',
  );
  if (
    record.schemaVersion !==
    DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1
  ) {
    fail('invalid-input', 'request.schemaVersion is unsupported.');
  }
  const expected = exactRecord(
    record.expected,
    [
      'composerV3CanonicalSha256',
      'phase2ArtifactSha256',
      'refinedArtifactSha256',
      'selfOrientationReportSha256',
    ],
    'request.expected',
  );
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value !== 'string' || !SHA256.test(value)) {
      fail('invalid-input', `request.expected.${key} must be lowercase SHA-256.`);
    }
  }
  return {
    schemaVersion:
      DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1,
    expected:
      expected as DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeRequestV1['expected'],
    composerV3Owner: record.composerV3Owner as PatternImportDxfProductGarmentMeshComposerOwnerV3,
    selfOrientationOwner:
      record.selfOrientationOwner as DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
  };
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical report numbers must be finite.');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object')
    throw new TypeError('Canonical report value is unsupported.');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function') {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 is unavailable.');
  }
  let digest: ArrayBuffer;
  try {
    digest = (await reflectApply(capturedDigest, capturedSubtle, [
      'SHA-256',
      bytes,
    ])) as ArrayBuffer;
  } catch {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 failed.');
  }
  if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) {
    fail('sha256-unavailable', 'Native Web Crypto returned an invalid SHA-256 digest.');
  }
  return toHex(digest);
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new Uint8Array(0))) !== EMPTY_SHA256) {
    fail('sha256-unavailable', 'SHA-256 empty-message known-answer test failed.');
  }
  if ((await digestBytes(textEncoder.encode('abc'))) !== ABC_SHA256) {
    fail('sha256-unavailable', 'SHA-256 abc known-answer test failed.');
  }
}

function capturedCrypto(): Pick<Crypto, 'subtle'> {
  return Object.freeze({
    subtle: Object.freeze({
      digest(
        algorithm: string | object,
        data: ArrayBuffer | ArrayBufferView,
      ): Promise<ArrayBuffer> {
        if (!capturedSubtle || typeof capturedDigest !== 'function') {
          return Promise.reject(new TypeError('Native Web Crypto SHA-256 is unavailable.'));
        }
        return reflectApply(capturedDigest, capturedSubtle, [
          algorithm,
          data,
        ]) as Promise<ArrayBuffer>;
      },
    }) as unknown as SubtleCrypto,
  });
}

function rawBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

async function sha256View(view: ArrayBufferView): Promise<string> {
  return digestBytes(rawBytes(view));
}

async function sha256Text(value: string): Promise<string> {
  return digestBytes(textEncoder.encode(value));
}

function ownFloat32(value: Float32Array, label: string): Float32Array {
  if (
    objectGetPrototypeOf(value) !== Float32Array.prototype ||
    !(value.buffer instanceof ArrayBuffer) ||
    value.byteOffset !== 0 ||
    value.byteLength !== value.buffer.byteLength ||
    (value.buffer as ArrayBuffer & { resizable?: boolean }).resizable === true ||
    objectGetOwnPropertySymbols(value).length !== 0
  ) {
    fail('upstream-binding-mismatch', `${label} is not one full owned Float32Array.`);
  }
  return new Float32Array(value);
}

function ownUint32(value: Uint32Array, label: string): Uint32Array {
  if (
    objectGetPrototypeOf(value) !== Uint32Array.prototype ||
    !(value.buffer instanceof ArrayBuffer) ||
    value.byteOffset !== 0 ||
    value.byteLength !== value.buffer.byteLength ||
    (value.buffer as ArrayBuffer & { resizable?: boolean }).resizable === true ||
    objectGetOwnPropertySymbols(value).length !== 0
  ) {
    fail('upstream-binding-mismatch', `${label} is not one full owned Uint32Array.`);
  }
  return new Uint32Array(value);
}

function cloneMesh(source: ClothMeshIR, triangles: Uint32Array): ClothMeshIR {
  return Object.freeze({
    schemaVersion: source.schemaVersion,
    sourceAssemblyFingerprint: source.sourceAssemblyFingerprint,
    sourceUnits: source.sourceUnits,
    restPositions2Mm: ownFloat32(source.restPositions2Mm, 'mesh.restPositions2Mm'),
    triangles: new Uint32Array(triangles),
    pieceRanges: Object.freeze(source.pieceRanges.map((range) => Object.freeze({ ...range }))),
    boundarySamples: Object.freeze(
      source.boundarySamples.map((sample) => Object.freeze({ ...sample })),
    ),
    seams: Object.freeze(
      source.seams.map((seam) =>
        Object.freeze({ ...seam, vertexPairs: ownUint32(seam.vertexPairs, `seam ${seam.seamId}`) }),
      ),
    ),
    quality: Object.freeze({ ...source.quality }),
  });
}

function bytesEqual(
  left: ArrayBufferView | ArrayBuffer,
  right: ArrayBufferView | ArrayBuffer,
): boolean {
  const leftBytes =
    left instanceof ArrayBuffer
      ? new Uint8Array(left)
      : new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const rightBytes =
    right instanceof ArrayBuffer
      ? new Uint8Array(right)
      : new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  for (let index = 0; index < leftBytes.byteLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return false;
  }
  return true;
}

function validateTopologyNormalization(
  original: Uint32Array,
  normalized: Uint32Array,
): {
  unchangedTriangleCount: number;
  bcSwapTriangleCount: number;
} {
  if (original.length !== normalized.length || original.length !== EXPECTED_TRIANGLE_COUNT * 3) {
    fail('topology-normalization-mismatch', 'Original and normalized topology lengths drifted.');
  }
  let unchangedTriangleCount = 0;
  let bcSwapTriangleCount = 0;
  for (let offset = 0; offset < original.length; offset += 3) {
    const a = original[offset]!;
    const b = original[offset + 1]!;
    const c = original[offset + 2]!;
    const na = normalized[offset]!;
    const nb = normalized[offset + 1]!;
    const nc = normalized[offset + 2]!;
    if (na === a && nb === b && nc === c) unchangedTriangleCount += 1;
    else if (na === a && nb === c && nc === b) bcSwapTriangleCount += 1;
    else {
      fail(
        'topology-normalization-mismatch',
        `Triangle ${String(offset / 3)} is neither original order nor exact B/C swap.`,
      );
    }
  }
  if (
    bcSwapTriangleCount !== EXPECTED_NORMALIZED_TRIANGLE_COUNT ||
    unchangedTriangleCount + bcSwapTriangleCount !== EXPECTED_TRIANGLE_COUNT
  ) {
    fail(
      'topology-normalization-mismatch',
      'Canonical-medium winding normalization count drifted.',
    );
  }
  return { unchangedTriangleCount, bcSwapTriangleCount };
}

function sourcePieceGrains(
  composer: PatternImportDxfProductGarmentMeshComposerProjectionV3,
): readonly Readonly<{ pieceId: string; grainDegrees: number }>[] {
  const frames = composer.triangleMaterialFrames2;
  if (frames.length !== EXPECTED_TRIANGLE_COUNT * 4) {
    fail('material-frame-mismatch', 'Source triangle material-frame count drifted.');
  }
  return Object.freeze(
    composer.mesh.pieceRanges.map((piece) => {
      const firstOffset = piece.triangleOffset * 4;
      const warpX = frames[firstOffset]!;
      const warpY = frames[firstOffset + 1]!;
      const weftX = frames[firstOffset + 2]!;
      const weftY = frames[firstOffset + 3]!;
      if (
        ![warpX, warpY, weftX, weftY].every(Number.isFinite) ||
        Math.abs(Math.hypot(warpX, warpY) - 1) > 1e-6 ||
        Math.abs(Math.hypot(weftX, weftY) - 1) > 1e-6 ||
        Math.abs(warpX * weftX + warpY * weftY) > 1e-6 ||
        Math.abs(weftX + warpY) > 1e-6 ||
        Math.abs(weftY - warpX) > 1e-6
      ) {
        fail(
          'material-frame-mismatch',
          `Piece ${piece.pieceId} has an invalid source grain frame.`,
        );
      }
      for (
        let triangle = piece.triangleOffset;
        triangle < piece.triangleOffset + piece.triangleCount;
        triangle += 1
      ) {
        const offset = triangle * 4;
        if (
          frames[offset] !== warpX ||
          frames[offset + 1] !== warpY ||
          frames[offset + 2] !== weftX ||
          frames[offset + 3] !== weftY
        ) {
          fail('material-frame-mismatch', `Piece ${piece.pieceId} source grain is not uniform.`);
        }
      }
      const grainDegrees = (Math.atan2(warpY, warpX) * 180) / Math.PI;
      if (!Number.isFinite(grainDegrees)) {
        fail('material-frame-mismatch', `Piece ${piece.pieceId} grain angle is non-finite.`);
      }
      return Object.freeze({ pieceId: piece.pieceId, grainDegrees });
    }),
  );
}

function sortedUnique(values: Uint32Array, count: number, label: string): Uint32Array {
  const sorted = new Uint32Array(values);
  sorted.sort();
  if (sorted.length !== count) fail('upstream-binding-mismatch', `${label} count drifted.`);
  for (let index = 0; index < sorted.length; index += 1) {
    if (
      sorted[index]! >= EXPECTED_VERTEX_COUNT ||
      (index > 0 && sorted[index] === sorted[index - 1])
    ) {
      fail('upstream-binding-mismatch', `${label} is duplicate or outside the vertex domain.`);
    }
  }
  return sorted;
}

function validateInitialPositions(
  positions3M: Float32Array,
  positionsPinMask: Float32Array,
  pinned: Uint32Array,
): void {
  if (
    positions3M.length !== EXPECTED_VERTEX_COUNT * 3 ||
    positionsPinMask.length !== EXPECTED_VERTEX_COUNT * 4
  ) {
    fail('upstream-binding-mismatch', 'Mapped initialization buffer lengths drifted.');
  }
  const pinSet = new Set(pinned);
  for (let vertex = 0; vertex < EXPECTED_VERTEX_COUNT; vertex += 1) {
    const p3 = vertex * 3;
    const p4 = vertex * 4;
    if (
      positionsPinMask[p4] !== positions3M[p3] ||
      positionsPinMask[p4 + 1] !== positions3M[p3 + 1] ||
      positionsPinMask[p4 + 2] !== positions3M[p3 + 2] ||
      positionsPinMask[p4 + 3] !== (pinSet.has(vertex) ? 0 : 1)
    ) {
      fail('upstream-binding-mismatch', `Mapped initialization tuple ${String(vertex)} drifted.`);
    }
  }
}

function initializeV5WithMappedPhysicalMass(
  compiled: SimulationPackageV5,
  positions3M: Float32Array,
  pinned: Uint32Array,
): Readonly<{
  simulation: SimulationPackageV5;
  positionsInvMassKg: Float32Array;
  zeroInverseMassCount: number;
  positiveInverseMassCount: number;
}> {
  const pinSet = new Set(pinned);
  const positionsInvMassKg = new Float32Array(EXPECTED_VERTEX_COUNT * 4);
  let zeroInverseMassCount = 0;
  let positiveInverseMassCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let vertex = 0; vertex < EXPECTED_VERTEX_COUNT; vertex += 1) {
    const p3 = vertex * 3;
    const p4 = vertex * 4;
    const x = positions3M[p3]!;
    const y = positions3M[p3 + 1]!;
    const z = positions3M[p3 + 2]!;
    const mass = decodeParticleMassGpuV1(compiled.material.particleMassRecords, vertex);
    if (
      ![x, y, z, mass.massKg, mass.inverseMassKgInv].every(Number.isFinite) ||
      mass.massKg <= 0 ||
      mass.inverseMassKgInv <= 0
    ) {
      fail('package-validation-failed', `Particle ${String(vertex)} has invalid physical mass.`);
    }
    const inverseMassKgInv = pinSet.has(vertex) ? 0 : mass.inverseMassKgInv;
    positionsInvMassKg[p4] = x;
    positionsInvMassKg[p4 + 1] = y;
    positionsInvMassKg[p4 + 2] = z;
    positionsInvMassKg[p4 + 3] = inverseMassKgInv;
    if (inverseMassKgInv === 0) zeroInverseMassCount += 1;
    else positiveInverseMassCount += 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (
    zeroInverseMassCount !== EXPECTED_PIN_COUNT ||
    positiveInverseMassCount !== EXPECTED_VERTEX_COUNT - EXPECTED_PIN_COUNT
  ) {
    fail('package-validation-failed', 'Physical inverse-mass support counts drifted.');
  }
  const snapshot = structuredCloneCaptured(compiled);
  const simulation: SimulationPackageV5 = {
    ...snapshot,
    restBoundsM: { minX, maxX, minY, maxY },
    mesh: {
      ...snapshot.mesh,
      restPositionsInvMass: new Float32Array(positionsInvMassKg),
    },
  };
  return Object.freeze({
    simulation,
    positionsInvMassKg,
    zeroInverseMassCount,
    positiveInverseMassCount,
  });
}

function flattenedMeshSeams(mesh: ClothMeshIR): Uint32Array {
  const pairs: number[] = [];
  for (const seam of mesh.seams) pairs.push(...seam.vertexPairs);
  return new Uint32Array(pairs);
}

const continuumComplianceMPerN = Object.freeze({
  warp: 8e-11,
  weft: 1.2e-10,
  shear: 5e-10,
});

function compileOptions(
  mesh: ClothMeshIR,
  grains: readonly Readonly<{ pieceId: string; grainDegrees: number }>[],
  pinned: Uint32Array,
): CompileSimulationPackageV5Options {
  const pieceIds = mesh.pieceRanges.map(({ pieceId }) => pieceId);
  return {
    materials: [visualMaterial],
    materialAssignments: [
      { id: visualMaterial.id, materialRevision: visualMaterial.revision, pieceIds },
    ],
    pieceGrains: grains.map((grain) => ({ ...grain })),
    materialSolver: {
      dtS: FIXED_DT_S,
      solverIterations: FIXED_SOLVER_ITERATIONS,
      allowUncalibratedVisual: true,
    },
    supportAttachmentPolicy: {
      version: SUPPORT_ATTACHMENT_POLICY_V1_VERSION,
      mode: 'explicit-fixed-particles',
      provenance: {
        sourceId: 'canonical-medium-self-orientation-v2:waist-pins',
        intendedUse: 'debug',
      },
      attachments: Array.from(pinned, (particleIndex) => ({
        attachmentId: `canonical-waist-pin:${String(particleIndex).padStart(4, '0')}`,
        particleIndex,
      })),
    },
    continuumMaterials: [
      {
        materialId: visualMaterial.id,
        materialRevision: visualMaterial.revision,
        complianceMPerN: continuumComplianceMPerN,
        provenance: {
          calibrationStatus: 'uncalibrated-visual',
          sourceId: 'canonical-medium-normalized-v5-beta-visual-policy-v1',
        },
      },
    ],
  };
}

function trianglePositions(
  positions: Float32Array,
  triangles: Uint32Array,
  triangleIndex: number,
): TrianglePositions {
  const offset = triangleIndex * 3;
  const point = (vertex: number) =>
    [positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!] as const;
  return [point(triangles[offset]!), point(triangles[offset + 1]!), point(triangles[offset + 2]!)];
}

function evaluateStrainParity(
  positions3M: Float32Array,
  originalTriangles: Uint32Array,
  normalizedTriangles: Uint32Array,
  original: SimulationPackageV5,
  normalized: SimulationPackageV5,
): DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1['strainParity'] {
  let maximumAbsoluteWarpDelta = 0;
  let maximumAbsoluteWeftDelta = 0;
  let maximumAbsoluteShearDelta = 0;
  let maximumAbsoluteNormalizedWarp = 0;
  let maximumAbsoluteNormalizedWeft = 0;
  let maximumAbsoluteNormalizedShear = 0;
  let nonFiniteStrainCount = 0;
  let degenerateRestFrameCount = 0;
  for (let triangleIndex = 0; triangleIndex < EXPECTED_TRIANGLE_COUNT; triangleIndex += 1) {
    const originalFrame = decodeTriangleRestFrameGpuV1(
      original.material.triangleRestFrames,
      triangleIndex,
    );
    const normalizedFrame = decodeTriangleRestFrameGpuV1(
      normalized.material.triangleRestFrames,
      triangleIndex,
    );
    if (
      !Number.isFinite(originalFrame.restAreaM2) ||
      originalFrame.restAreaM2 <= 0 ||
      !Number.isFinite(normalizedFrame.restAreaM2) ||
      normalizedFrame.restAreaM2 <= 0
    ) {
      degenerateRestFrameCount += 1;
      continue;
    }
    const originalStrain = evaluateTriangleStrain(
      trianglePositions(positions3M, originalTriangles, triangleIndex),
      { ...originalFrame, warpDirectionRest: [0, 1], weftDirectionRest: [-1, 0] },
    );
    const normalizedStrain = evaluateTriangleStrain(
      trianglePositions(positions3M, normalizedTriangles, triangleIndex),
      { ...normalizedFrame, warpDirectionRest: [0, 1], weftDirectionRest: [-1, 0] },
    );
    const values = [
      originalStrain.warp,
      originalStrain.weft,
      originalStrain.shear,
      normalizedStrain.warp,
      normalizedStrain.weft,
      normalizedStrain.shear,
    ];
    if (!values.every(Number.isFinite)) nonFiniteStrainCount += 1;
    maximumAbsoluteWarpDelta = Math.max(
      maximumAbsoluteWarpDelta,
      Math.abs(originalStrain.warp - normalizedStrain.warp),
    );
    maximumAbsoluteWeftDelta = Math.max(
      maximumAbsoluteWeftDelta,
      Math.abs(originalStrain.weft - normalizedStrain.weft),
    );
    maximumAbsoluteShearDelta = Math.max(
      maximumAbsoluteShearDelta,
      Math.abs(originalStrain.shear - normalizedStrain.shear),
    );
    maximumAbsoluteNormalizedWarp = Math.max(
      maximumAbsoluteNormalizedWarp,
      Math.abs(normalizedStrain.warp),
    );
    maximumAbsoluteNormalizedWeft = Math.max(
      maximumAbsoluteNormalizedWeft,
      Math.abs(normalizedStrain.weft),
    );
    maximumAbsoluteNormalizedShear = Math.max(
      maximumAbsoluteNormalizedShear,
      Math.abs(normalizedStrain.shear),
    );
  }
  const maximumAbsoluteComponentDelta = Math.max(
    maximumAbsoluteWarpDelta,
    maximumAbsoluteWeftDelta,
    maximumAbsoluteShearDelta,
  );
  if (degenerateRestFrameCount !== 0 || nonFiniteStrainCount !== 0) {
    fail('strain-parity-failed', 'Normalized V5 rest frames produced invalid strain evidence.');
  }
  if (maximumAbsoluteComponentDelta !== 0) {
    fail(
      'strain-parity-failed',
      `Original/normalized mapped strain parity is not exact: ${String(maximumAbsoluteComponentDelta)}.`,
    );
  }
  return Object.freeze({
    evaluatedTriangleCount: EXPECTED_TRIANGLE_COUNT,
    maximumAbsoluteWarpDelta,
    maximumAbsoluteWeftDelta,
    maximumAbsoluteShearDelta,
    maximumAbsoluteComponentDelta,
    maximumAbsoluteNormalizedWarp,
    maximumAbsoluteNormalizedWeft,
    maximumAbsoluteNormalizedShear,
    degenerateRestFrameCount: 0 as const,
    nonFiniteStrainCount: 0 as const,
    exactComponentParity: true,
  });
}

function sameWorkloadCounts(
  original: SimulationPackageV5,
  normalized: SimulationPackageV5,
): boolean {
  const left = original.manifest;
  const right = normalized.manifest;
  return [
    'particleCount',
    'triangleCount',
    'distanceConstraintCount',
    'distanceColorCount',
    'seamConstraintCount',
    'seamColorCount',
    'bendConstraintCount',
    'bendColorCount',
    'continuumConstraintCount',
    'continuumColorCount',
    'materialCount',
    'pinnedParticleCount',
  ].every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]);
}

function distanceBuffersEqual(left: SimulationPackageV5, right: SimulationPackageV5): boolean {
  return (
    bytesEqual(left.constraints.distance.vertexPairs, right.constraints.distance.vertexPairs) &&
    bytesEqual(left.constraints.distance.restLengthsM, right.constraints.distance.restLengthsM) &&
    JSON.stringify(left.constraints.distance.colorRanges) ===
      JSON.stringify(right.constraints.distance.colorRanges)
  );
}

function seamBuffersEqual(left: SimulationPackageV5, right: SimulationPackageV5): boolean {
  const a = left.constraints.seam;
  const b = right.constraints.seam;
  return (
    bytesEqual(a.vertexPairs, b.vertexPairs) &&
    bytesEqual(a.targetLengthsM, b.targetLengthsM) &&
    bytesEqual(a.seamIdIndices, b.seamIdIndices) &&
    bytesEqual(a.sourcePairIndices, b.sourcePairIndices) &&
    bytesEqual(a.colorRanges, b.colorRanges) &&
    bytesEqual(a.activationOrder, b.activationOrder)
  );
}

function publicSelfReport(
  owner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
): DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2 {
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'report');
  if (!descriptor || !('value' in descriptor)) {
    fail(
      'upstream-owner-unavailable',
      'Authenticated self/orientation owner report is unavailable.',
    );
  }
  return descriptor.value as DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2;
}

function exactUpstreamBindings(
  request: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeRequestV1,
  composer: PatternImportDxfProductGarmentMeshComposerProjectionV3,
  selfReport: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2,
  selfReportSha256: string,
): void {
  if (
    composer.composerCanonicalSha256 !== request.expected.composerV3CanonicalSha256 ||
    composer.phase2ArtifactSha256 !== request.expected.phase2ArtifactSha256 ||
    composer.refinedArtifactSha256 !== request.expected.refinedArtifactSha256 ||
    selfReportSha256 !== request.expected.selfOrientationReportSha256 ||
    selfReport.bindings.composerV3CanonicalSha256 !== composer.composerCanonicalSha256 ||
    selfReport.bindings.phase2ArtifactSha256 !== composer.phase2ArtifactSha256 ||
    selfReport.bindings.refinedArtifactSha256 !== composer.refinedArtifactSha256 ||
    selfReport.decision !== 'PASS_PRODUCT_SELF_AND_ORIENTATION_DIAGNOSTIC' ||
    selfReport.claims.sourceSelfOrientationNoOpQualified !== true
  ) {
    fail('upstream-binding-mismatch', 'Composer and self/orientation owner bindings drifted.');
  }
}

function assertPackageCounts(simulation: SimulationPackageV5): void {
  const manifest = simulation.manifest;
  if (
    manifest.particleCount !== EXPECTED_VERTEX_COUNT ||
    manifest.triangleCount !== EXPECTED_TRIANGLE_COUNT ||
    manifest.seamConstraintCount !== EXPECTED_SEAM_PAIR_COUNT ||
    manifest.continuumConstraintCount !== EXPECTED_TRIANGLE_COUNT ||
    manifest.pinnedParticleCount !== EXPECTED_PIN_COUNT ||
    manifest.materialCount !== 1
  ) {
    fail('package-validation-failed', 'Canonical-medium normalized V5 workload counts drifted.');
  }
}

export async function buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(
  input: unknown,
): Promise<DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeResultV1> {
  try {
    const request = snapshotRequest(input);
    const composerProjection = projectPatternImportDxfProductGarmentMeshComposerV3(
      request.composerV3Owner,
    );
    const selfProjection = projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
      request.selfOrientationOwner,
    );
    if (!composerProjection || !selfProjection) {
      fail(
        'upstream-owner-unavailable',
        'Live composer V3 and self/orientation V2 owners are required.',
      );
    }
    const selfReport = publicSelfReport(request.selfOrientationOwner);
    exactUpstreamBindings(
      request,
      composerProjection,
      selfReport,
      selfProjection.reportCanonicalSha256,
    );

    const originalTriangles = ownUint32(composerProjection.mesh.triangles, 'original topology');
    const normalizedTriangles = ownUint32(
      selfProjection.normalizedTriangles,
      'normalized topology',
    );
    const positions3M = ownFloat32(selfProjection.positions3M, 'mapped positions3M');
    const mappedPositionsPinMask = ownFloat32(
      selfProjection.positionsInvMass,
      'mapped positions pin mask',
    );
    const seamPairs = ownUint32(selfProjection.seamPairs, 'AO seam pairs');
    const pinnedWaistVertexIndices = sortedUnique(
      ownUint32(selfProjection.pinnedWaistVertexIndices, 'waist pins'),
      EXPECTED_PIN_COUNT,
      'waist pins',
    );
    const sourceMaterialFrames = ownFloat32(
      composerProjection.triangleMaterialFrames2,
      'source triangle material frames',
    );
    const topologyCounts = validateTopologyNormalization(originalTriangles, normalizedTriangles);
    validateInitialPositions(positions3M, mappedPositionsPinMask, pinnedWaistVertexIndices);
    if (
      seamPairs.length !== EXPECTED_SEAM_PAIR_COUNT * 2 ||
      !bytesEqual(flattenedMeshSeams(composerProjection.mesh), seamPairs)
    ) {
      fail('upstream-binding-mismatch', 'Assembly Order seam-pair transport drifted.');
    }
    const grains = sourcePieceGrains(composerProjection);
    const originalMesh = cloneMesh(composerProjection.mesh, originalTriangles);
    const normalizedMesh = cloneMesh(composerProjection.mesh, normalizedTriangles);
    const options = compileOptions(normalizedMesh, grains, pinnedWaistVertexIndices);
    let compiledOriginalV5: SimulationPackageV5;
    let compiledNormalizedV5: SimulationPackageV5;
    try {
      compiledOriginalV5 = compileSimulationPackageV5(originalMesh, options);
      compiledNormalizedV5 = compileSimulationPackageV5(normalizedMesh, options);
    } catch (error) {
      fail(
        'package-compilation-failed',
        error instanceof Error ? error.message : 'V5 package compilation failed.',
      );
    }
    const originalInitialization = initializeV5WithMappedPhysicalMass(
      compiledOriginalV5,
      positions3M,
      pinnedWaistVertexIndices,
    );
    const normalizedInitialization = initializeV5WithMappedPhysicalMass(
      compiledNormalizedV5,
      positions3M,
      pinnedWaistVertexIndices,
    );
    const originalV5 = originalInitialization.simulation;
    const normalizedV5 = normalizedInitialization.simulation;
    if (
      !bytesEqual(
        originalInitialization.positionsInvMassKg,
        normalizedInitialization.positionsInvMassKg,
      )
    ) {
      fail('package-validation-failed', 'Original/normalized physical inverse masses drifted.');
    }
    const originalValidation = validateSimulationPackageV5(originalV5);
    const normalizedValidation = validateSimulationPackageV5(normalizedV5);
    if (originalValidation.length !== 0 || normalizedValidation.length !== 0) {
      fail('package-validation-failed', [...originalValidation, ...normalizedValidation].join(' '));
    }
    assertPackageCounts(originalV5);
    assertPackageCounts(normalizedV5);
    if (
      !bytesEqual(originalV5.mesh.triangles, originalTriangles) ||
      !bytesEqual(normalizedV5.mesh.triangles, normalizedTriangles) ||
      !sameWorkloadCounts(originalV5, normalizedV5)
    ) {
      fail('package-validation-failed', 'Compiled V5 topology or workload binding drifted.');
    }
    if (
      !bytesEqual(
        originalV5.mesh.supportAttachments.particleIndices,
        normalizedV5.mesh.supportAttachments.particleIndices,
      ) ||
      !bytesEqual(normalizedV5.mesh.supportAttachments.particleIndices, pinnedWaistVertexIndices)
    ) {
      fail('package-validation-failed', 'Compiled support pin mask drifted.');
    }
    const strainParity = evaluateStrainParity(
      positions3M,
      originalTriangles,
      normalizedTriangles,
      originalV5,
      normalizedV5,
    );

    await validateDigestAuthority();
    const [
      originalTopologySha256,
      normalizedTopologySha256,
      sourceTriangleMaterialFramesSha256,
      mappedPositions3MSha256,
      mappedPositionsPinMaskSha256,
      initialPhysicalPositionsInvMassKgSha256,
      seamPairsSha256,
      pinnedWaistVertexIndicesSha256,
      originalSealResult,
      normalizedSealResult,
    ] = await Promise.all([
      sha256View(originalTriangles),
      sha256View(normalizedTriangles),
      sha256View(sourceMaterialFrames),
      sha256View(positions3M),
      sha256View(mappedPositionsPinMask),
      sha256View(normalizedInitialization.positionsInvMassKg),
      sha256View(seamPairs),
      sha256View(pinnedWaistVertexIndices),
      sealSimulationPackageV5V1(originalV5, { crypto: capturedCrypto() }),
      sealSimulationPackageV5V1(normalizedV5, { crypto: capturedCrypto() }),
    ]);
    if (!originalSealResult.ok || !normalizedSealResult.ok) {
      const errors: string[] = [];
      if ('errors' in originalSealResult) errors.push(...originalSealResult.errors);
      if ('errors' in normalizedSealResult) errors.push(...normalizedSealResult.errors);
      fail('package-validation-failed', `V5 package sealing failed: ${errors.join(' ')}`);
    }
    if (
      originalTopologySha256 !== selfReport.bindings.originalV3TopologySha256 ||
      normalizedTopologySha256 !== selfReport.bindings.normalizedTopologySha256 ||
      sourceTriangleMaterialFramesSha256 !==
        selfReport.bindings.originalTriangleMaterialFramesSha256 ||
      mappedPositions3MSha256 !== selfReport.bindings.initialPositions3MSha256 ||
      mappedPositionsPinMaskSha256 !== selfReport.bindings.initialPositionsInvMassSha256 ||
      seamPairsSha256 !== selfReport.bindings.seamPairsSha256 ||
      pinnedWaistVertexIndicesSha256 !== selfReport.bindings.pinnedWaistVertexIndicesSha256
    ) {
      fail('upstream-binding-mismatch', 'Self/orientation binary content binding drifted.');
    }
    if (
      originalSealResult.artifact.seal.aggregateSha256 ===
      normalizedSealResult.artifact.seal.aggregateSha256
    ) {
      fail('package-validation-failed', 'Original and normalized V5 package seals must differ.');
    }

    const freshComposer = projectPatternImportDxfProductGarmentMeshComposerV3(
      request.composerV3Owner,
    );
    const freshSelf = projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
      request.selfOrientationOwner,
    );
    if (!freshComposer || !freshSelf) {
      fail(
        'upstream-owner-stale',
        'An upstream owner was disposed during the async seal boundary.',
      );
    }
    const [
      freshOriginalTopology,
      freshMaterialFrames,
      freshNormalized,
      freshPositions,
      freshSeams,
      freshPins,
    ] = await Promise.all([
      sha256View(freshComposer.mesh.triangles),
      sha256View(freshComposer.triangleMaterialFrames2),
      sha256View(freshSelf.normalizedTriangles),
      sha256View(freshSelf.positionsInvMass),
      sha256View(freshSelf.seamPairs),
      sha256View(freshSelf.pinnedWaistVertexIndices),
    ]);
    if (
      freshComposer.composerCanonicalSha256 !== request.expected.composerV3CanonicalSha256 ||
      freshSelf.reportCanonicalSha256 !== request.expected.selfOrientationReportSha256 ||
      freshOriginalTopology !== originalTopologySha256 ||
      freshMaterialFrames !== sourceTriangleMaterialFramesSha256 ||
      freshNormalized !== normalizedTopologySha256 ||
      freshPositions !== mappedPositionsPinMaskSha256 ||
      freshSeams !== seamPairsSha256 ||
      freshPins !== pinnedWaistVertexIndicesSha256
    ) {
      fail(
        'upstream-owner-stale',
        'Upstream owner content changed across the async seal boundary.',
      );
    }

    const distanceByteParity = distanceBuffersEqual(originalV5, normalizedV5);
    const seamByteParity = seamBuffersEqual(originalV5, normalizedV5);
    if (!distanceByteParity || !seamByteParity) {
      fail('package-validation-failed', 'Topology normalization changed distance or seam buffers.');
    }
    const claims: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeClaimsV1 =
      Object.freeze({
        status: 'diagnostic-complete' as const,
        genuineComposerV3Bound: true as const,
        selfOrientationV2Bound: true as const,
        normalizedTopologyReplayed: true as const,
        sourceMaterialFramesBound: true as const,
        originalAndNormalizedV5Compiled: true as const,
        originalAndNormalizedV5Validated: true as const,
        normalizedInverseRestStateRebuilt: true as const,
        exactMappedStrainParityEstablished: true as const,
        normalizedTopologySolverMaterialCompatibilityEstablished: true as const,
        normalizedV5DiagnosticPackageAuthority: true as const,
        initializationTransportBound: true as const,
        physicalInverseMassTransportBound: true as const,
        sourceAdmissionAuthority: false as const,
        materialCalibrationAuthority: false as const,
        placementAuthority: false as const,
        collisionAuthority: false as const,
        retentionAuthority: false as const,
        settleAuthority: false as const,
        runtimeAuthority: false as const,
        persistenceAuthority: false as const,
        fitAuthority: false as const,
        productionAuthority: false as const,
      });
    const manifest = normalizedV5.manifest;
    const reportWithoutSeal = Object.freeze({
      schemaVersion:
        DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REPORT_V1,
      status: 'diagnostic-complete' as const,
      bindings: Object.freeze({
        composerV3CanonicalSha256: composerProjection.composerCanonicalSha256,
        phase2ArtifactSha256: composerProjection.phase2ArtifactSha256,
        refinedArtifactSha256: composerProjection.refinedArtifactSha256,
        selfOrientationReportSha256: selfProjection.reportCanonicalSha256,
        originalTopologySha256,
        normalizedTopologySha256,
        sourceTriangleMaterialFramesSha256,
        mappedPositions3MSha256,
        mappedPositionsPinMaskSha256,
        initialPhysicalPositionsInvMassKgSha256,
        seamPairsSha256,
        pinnedWaistVertexIndicesSha256,
        originalV5AggregateSha256: originalSealResult.artifact.seal.aggregateSha256,
        normalizedV5AggregateSha256: normalizedSealResult.artifact.seal.aggregateSha256,
      }),
      policy: Object.freeze({
        materialId: visualMaterial.id,
        materialRevision: visualMaterial.revision,
        calibrationStatus: 'uncalibrated-visual' as const,
        dtS: FIXED_DT_S,
        solverIterations: FIXED_SOLVER_ITERATIONS,
        supportMode: 'explicit-fixed-particles' as const,
        inverseMassSource: 'normalized-v5-particle-mass-records' as const,
        continuumComplianceMPerN,
      }),
      counts: Object.freeze({
        pieceCount: composerProjection.mesh.pieceRanges.length,
        vertexCount: manifest.particleCount,
        triangleCount: manifest.triangleCount,
        normalizedTriangleCount: topologyCounts.bcSwapTriangleCount,
        seamPairCount: seamPairs.length / 2,
        pinnedWaistVertexCount: pinnedWaistVertexIndices.length,
        zeroPhysicalInverseMassCount: normalizedInitialization.zeroInverseMassCount,
        positivePhysicalInverseMassCount: normalizedInitialization.positiveInverseMassCount,
        distanceConstraintCount: manifest.distanceConstraintCount,
        distanceColorCount: manifest.distanceColorCount,
        seamConstraintCount: manifest.seamConstraintCount,
        seamColorCount: manifest.seamColorCount,
        bendConstraintCount: manifest.bendConstraintCount,
        bendColorCount: manifest.bendColorCount,
        continuumConstraintCount: manifest.continuumConstraintCount,
        continuumColorCount: manifest.continuumColorCount,
        materialCount: manifest.materialCount,
      }),
      topology: Object.freeze({
        everyNormalizedTriangleIsExactOriginalOrBCSwap: true as const,
        originalTriangleCount: EXPECTED_TRIANGLE_COUNT,
        unchangedTriangleCount: topologyCounts.unchangedTriangleCount,
        bcSwapTriangleCount: topologyCounts.bcSwapTriangleCount,
        sourcePieceGrainsDegrees: grains,
      }),
      packageParity: Object.freeze({
        bothPackagesValidated: true as const,
        manifestWorkloadCountsEqual: true as const,
        distanceBuffersByteEqual: distanceByteParity,
        seamBuffersByteEqual: seamByteParity,
        bendConstraintCountsEqual: true as const,
        continuumConstraintCountsEqual: true as const,
        supportParticleIndicesEqual: true as const,
        normalizedPackageOwnsRebuiltRestFrames: true as const,
        originalAndNormalizedPackageSealsDiffer: true as const,
      }),
      strainParity,
      decision: 'PASS_NORMALIZED_V5_SOLVER_MATERIAL_BRIDGE' as const,
      blockers: Object.freeze([
        'source-admission-not-established',
        'visual-material-not-calibrated',
        'retention-and-settle-not-established',
        'runtime-authority-not-established',
      ] as const),
      claims,
    });
    const reportSealSha256 = await sha256Text(canonical(reportWithoutSeal));
    const report: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1 =
      Object.freeze({
        ...reportWithoutSeal,
        seal: Object.freeze({
          algorithm: 'SHA-256' as const,
          canonicalSha256: reportSealSha256,
          authority: 'unsigned-same-session-normalized-v5-diagnostic-only' as const,
        }),
      });
    const owner = Object.freeze({
      schemaVersion:
        DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_OWNER_V1,
      report,
    }) as DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1;
    owners.set(owner, {
      normalizedV5: normalizedSealResult.artifact,
      mappedPositionsPinMask: new Float32Array(mappedPositionsPinMask),
      initialPhysicalPositionsInvMassKg: new Float32Array(
        normalizedInitialization.positionsInvMassKg,
      ),
      normalizedTriangles: new Uint32Array(normalizedTriangles),
      seamPairs: new Uint32Array(seamPairs),
      pinnedWaistVertexIndices: new Uint32Array(pinnedWaistVertexIndices),
    });
    return Object.freeze({ ok: true as const, owner, report, claims });
  } catch (error) {
    return blocked(error);
  }
}

export function projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(
  owner: unknown,
): DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner =
    owner as DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1;
  return Object.freeze({
    schemaVersion:
      DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_PROJECTION_V1,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    normalizedV5: structuredCloneCaptured(record.normalizedV5),
    mappedPositionsPinMask: new Float32Array(record.mappedPositionsPinMask),
    initialPhysicalPositionsInvMassKg: new Float32Array(record.initialPhysicalPositionsInvMassKg),
    normalizedTriangles: new Uint32Array(record.normalizedTriangles),
    seamPairs: new Uint32Array(record.seamPairs),
    pinnedWaistVertexIndices: new Uint32Array(record.pinnedWaistVertexIndices),
    callerOwnedMutableCopies: true as const,
    normalizedTopologySolverMaterialCompatibilityEstablished: true as const,
    normalizedV5DiagnosticPackageAuthority: true as const,
    initializationTransportBound: true as const,
    physicalInverseMassTransportBound: true as const,
    sourceAdmissionAuthority: false as const,
    materialCalibrationAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  record.mappedPositionsPinMask.fill(0);
  record.initialPhysicalPositionsInvMassKg.fill(0);
  record.normalizedTriangles.fill(0);
  record.seamPairs.fill(0);
  record.pinnedWaistVertexIndices.fill(0);
  owners.delete(owner as object);
  return true;
}

export function normalizedV5PackageSealV1(owner: unknown): SimulationPackageV5SealV1 | null {
  const projection = projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(owner);
  return projection ? projection.normalizedV5.seal : null;
}
