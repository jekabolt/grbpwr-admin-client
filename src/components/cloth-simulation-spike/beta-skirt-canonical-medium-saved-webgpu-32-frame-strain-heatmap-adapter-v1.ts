import * as THREE from 'three';

import {
  buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
  type BetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
} from './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerProjectionV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationProjectionV1,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_ADAPTER_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-heatmap-adapter-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_LABEL_V1 =
  'SAVED DXF · 32-FRAME WEBGPU · DIMENSIONLESS STRAIN UTILIZATION · PROVISIONAL / NOT Pa · NOT FAILURE · SELF/SETTLE NOT CLEARED · NOT FIT' as const;

const BODY_VERTEX_COUNT = 13_380 as const;
const BODY_TRIANGLE_COUNT = 26_756 as const;
const GARMENT_VERTEX_COUNT = 580 as const;
const GARMENT_TRIANGLE_COUNT = 912 as const;
const VALUE_STRIDE = 4 as const;
const DISPLAY_CLAMP_MAXIMUM = 2 as const;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA256 = /^[0-9a-f]{64}$/u;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototypeIsPrototypeOf = Object.prototype.isPrototypeOf;
const capturedArrayFrom = Array.from;
const capturedArrayJoin = Array.prototype.join;
const capturedRegExpTest = RegExp.prototype.test;
const capturedStringSlice = String.prototype.slice;
const capturedReflectApply = Reflect.apply;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedDataViewSetFloat32 = objectGetOwnPropertyDescriptor(
  DataView.prototype,
  'setFloat32',
)?.value;
const capturedDataViewSetUint32 = objectGetOwnPropertyDescriptor(
  DataView.prototype,
  'setUint32',
)?.value;
const arrayBufferPrototype = ArrayBuffer.prototype;
const capturedCanvasPrototype =
  typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const HEX = objectFreeze(
  capturedArrayFrom({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_ADAPTER_REPORT_V1;
  status: 'structural-saved-32-frame-visible-strain-heatmap-ready';
  decision: 'RENDERED_EXACT_SAVED_32_FRAME_DIMENSIONLESS_STRAIN_WITH_DOWNSTREAM_BLOCKERS';
  label: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_LABEL_V1;
  renderer: 'three-webgl-exact-saved32-face-owned-strain-heatmap';
  bindings: Readonly<{
    savedRuntimeSourceCanonicalSha256: string;
    runtimeSourceCanonicalSha256: string;
    runtimeReportCanonicalSha256: string;
    runner32FrameCanonicalSha256: string;
    runner32FrameReportCanonicalSha256: string;
    strainStableEvidenceSha256: string;
    strainReportCanonicalSha256: string;
    bodyPositions3MSha256: string;
    bodyTrianglesSha256: string;
    finalPositions3MSha256: string;
    normalizedTopologySha256: string;
    strainValuesFloat32LeSha256: string;
    strainValidityFlagsUint32LeSha256: string;
    strainOutputEnvelopeSha256: string;
    strainKernelSourceSha256: string;
    strainProvisionalLimitsSha256: string;
    strainColorLutSha256: string;
    renderedNonIndexedPositionsFloat32LeSha256: string;
    renderedVertexColorsFloat32LeSha256: string;
  }>;
  counts: Readonly<{
    frameCount: 32;
    bodyVertexCount: typeof BODY_VERTEX_COUNT;
    bodyTriangleCount: typeof BODY_TRIANGLE_COUNT;
    garmentVertexCount: typeof GARMENT_VERTEX_COUNT;
    garmentTriangleCount: typeof GARMENT_TRIANGLE_COUNT;
    renderedFaceVertexCount: 2_736;
    validStrainTriangleCount: typeof GARMENT_TRIANGLE_COUNT;
    invalidStrainTriangleCount: 0;
  }>;
  visualization: Readonly<{
    quantity: 'normalized-green-strain-utilization';
    units: 'dimensionless';
    interpolation: 'linear-srgb-face-owned';
    displayClampMinimum: 0;
    displayClampMaximum: typeof DISPLAY_CLAMP_MAXIMUM;
    topLegendLabel: '≥2 provisional utilization';
    minimumUtilization: number;
    maximumUtilization: number;
    triangleCountAtOrAboveDisplayClamp: number;
    triangleCountAtOrAboveFourTimesProvisionalLimit: number;
    disclaimer: 'Dimensionless provisional strain visualization only; not physical stress, Pa, material failure, or fit.';
  }>;
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesVolatileRunnerAndStrainReportSeals: true;
  }>;
  remainingBlockers: readonly [
    'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
    'post-frame-self-orientation-not-evaluated',
    'material-visualization-thresholds-provisional-and-uncalibrated',
    'physical-stress-and-pa-not-computed',
    'material-failure-not-evaluated',
    'settle-fit-runtime-production-authority-not-established',
  ];
  claims: Readonly<{
    genuineSavedRuntimeWrapperAuthenticated: false;
    privateBaseRuntimeSaved32AndStrainOwnersRequired: true;
    inputOwnersReturnedByAdapter: false;
    allThreeInputOwnersRevalidatedAcrossAsyncBoundaries: true;
    exactSaved32FinalPositionsRendered: true;
    exactSaved32TriangleStrainValuesRendered: true;
    faceOwnedColorsPreventCrossTriangleInterpolation: true;
    copiedThreeResourcesSurviveUpstreamOwnerDisposal: true;
    visibleHeatmapRendered: true;
    dimensionlessStrainUtilizationOnly: true;
    physicalStressOrPaRendered: false;
    materialFailureRendered: false;
    selfCollisionAndOrientationCleared: false;
    settleCleared: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-saved-32-frame-visible-strain-heatmap-only';
  }>;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapSessionV1 = Readonly<{
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterReportV1;
  dispose(): boolean;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterResultV1 =
  | Readonly<{
      ok: true;
      session: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapSessionV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'invalid-canvas'
        | 'source-owner-unavailable'
        | 'runner-owner-unavailable'
        | 'strain-owner-unavailable'
        | 'binding-mismatch'
        | 'sha256-unavailable'
        | 'render-failed';
      detail: string;
    }>;

type AdapterErrorCode = Exclude<
  BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterResultV1,
  { ok: true }
>['code'];

class HeatmapAdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    detail: string,
  ) {
    super(capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string);
  }
}

type LiveInputs = Readonly<{
  runtime: BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1;
  runner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerProjectionV4;
  strain: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationProjectionV1;
  runtimeProjectionCanonicalSha256: string;
  runnerProjectionCanonicalSha256: string;
  strainProjectionCanonicalSha256: string;
}>;

function fail(code: AdapterErrorCode, detail: string): never {
  throw new HeatmapAdapterError(code, detail);
}

function regexTest(pattern: RegExp, value: string): boolean {
  return capturedReflectApply(capturedRegExpTest, pattern, [value]) as boolean;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && regexTest(SHA256, value);
}

function isRealCanvas(value: unknown): value is HTMLCanvasElement {
  return (
    capturedCanvasPrototype !== null &&
    value !== null &&
    typeof value === 'object' &&
    (capturedReflectApply(objectPrototypeIsPrototypeOf, capturedCanvasPrototype, [
      value,
    ]) as boolean)
  );
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function float32LeBytes(values: Float32Array): Uint8Array<ArrayBuffer> {
  if (!capturedDataViewSetFloat32) fail('sha256-unavailable', 'Float32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetFloat32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function uint32LeBytes(values: Uint32Array): Uint8Array<ArrayBuffer> {
  if (!capturedDataViewSetUint32) fail('sha256-unavailable', 'Uint32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetUint32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function outputEnvelope(values: Float32Array, flags: Uint32Array): Uint8Array<ArrayBuffer> {
  const valueBytes = float32LeBytes(values);
  const flagBytes = uint32LeBytes(flags);
  const output = new CapturedUint8Array(valueBytes.byteLength + flagBytes.byteLength);
  capturedReflectApply(capturedUint8Set, output, [valueBytes, 0]);
  capturedReflectApply(capturedUint8Set, output, [flagBytes, valueBytes.byteLength]);
  return output;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    fail('sha256-unavailable', 'Native SHA-256 is unavailable.');
  const copy = new CapturedUint8Array(bytes.byteLength);
  capturedReflectApply(capturedUint8Set, copy, [bytes]);
  const digest = (await capturedReflectApply(capturedDigest, capturedSubtle, [
    'SHA-256',
    copy,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(digest) !== arrayBufferPrototype || digest.byteLength !== 32)
    fail('sha256-unavailable', 'Native SHA-256 returned invalid bytes.');
  const characters = capturedReflectApply(capturedArrayFrom, Array, [
    new CapturedUint8Array(digest),
    (value: number) => HEX[value]!,
  ]) as string[];
  return capturedReflectApply(capturedArrayJoin, characters, ['']) as string;
}

async function digestText(value: string): Promise<string> {
  return digestBytes(
    capturedReflectApply(capturedTextEncode, capturedTextEncoder, [value]) as Uint8Array,
  );
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    fail('sha256-unavailable', 'SHA-256 empty-message KAT failed.');
  if ((await digestText('abc')) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc KAT failed.');
}

async function payloadSha256(domain: string, payload: unknown): Promise<string> {
  return digestText(`${domain}\0${capturedJsonStringify(payload)}`);
}

function projectLiveInputs(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1,
): LiveInputs {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  if (!runtime) fail('source-owner-unavailable', 'A live private base runtime owner is required.');
  const runner = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
  if (!runner) fail('runner-owner-unavailable', 'A live private saved 32F V4 owner is required.');
  const strain = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1(strainOwner);
  if (!strain)
    fail('strain-owner-unavailable', 'A live private saved 32F strain owner is required.');
  return objectFreeze({
    runtime,
    runner,
    strain,
    runtimeProjectionCanonicalSha256: runtime.reportCanonicalSha256,
    runnerProjectionCanonicalSha256: runner.reportCanonicalSha256,
    strainProjectionCanonicalSha256: strain.reportCanonicalSha256,
  });
}

function inputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1,
  witness: LiveInputs,
): boolean {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const runner = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
  const strain = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1(strainOwner);
  return (
    runtime !== null &&
    runner !== null &&
    strain !== null &&
    runtime.reportCanonicalSha256 === witness.runtimeProjectionCanonicalSha256 &&
    runner.reportCanonicalSha256 === witness.runnerProjectionCanonicalSha256 &&
    strain.reportCanonicalSha256 === witness.strainProjectionCanonicalSha256
  );
}

function assertInputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1,
  witness: LiveInputs,
  boundary: string,
): void {
  if (!inputsStillMatch(runtimeOwner, runnerOwner, strainOwner, witness))
    fail('binding-mismatch', `Saved 32F heatmap owners drifted ${boundary}.`);
}

function validateStructuralReports(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1,
  witness: LiveInputs,
): void {
  const runtimeReport = runtimeOwner.report;
  const runnerReport = runnerOwner.report;
  const strainReport = strainOwner.report;
  if (
    runtimeReport.status !== 'diagnostic-source-ready' ||
    runtimeReport.decision !== 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE' ||
    runtimeReport.seal.canonicalSha256 !== witness.runtimeProjectionCanonicalSha256 ||
    runtimeReport.counts.bodyVertexCount !== BODY_VERTEX_COUNT ||
    runtimeReport.counts.bodyTriangleCount !== BODY_TRIANGLE_COUNT ||
    runtimeReport.counts.garmentVertexCount !== GARMENT_VERTEX_COUNT ||
    runtimeReport.counts.garmentTriangleCount !== GARMENT_TRIANGLE_COUNT ||
    runtimeReport.claims.exactActualBodyCollisionInputRetained !== true ||
    runtimeReport.claims.runtimeAuthority !== false ||
    runtimeReport.claims.fitAuthority !== false ||
    runtimeReport.claims.productionAuthority !== false
  )
    fail('binding-mismatch', 'Base runtime report or authority boundary drifted.');
  if (
    runnerReport.decision !==
      'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' ||
    runnerReport.seal.canonicalSha256 !== witness.runnerProjectionCanonicalSha256 ||
    runnerReport.bindings.runtimeSourceCanonicalSha256 !==
      witness.runtimeProjectionCanonicalSha256 ||
    runnerReport.bindings.normalizedV5AggregateSha256 !==
      runtimeReport.bindings.normalizedV5AggregateSha256 ||
    runnerReport.bindings.normalizedTopologySha256 !==
      runtimeReport.bindings.normalizedTopologySha256 ||
    runnerReport.workload.particleCount !== GARMENT_VERTEX_COUNT ||
    runnerReport.workload.triangleCount !== GARMENT_TRIANGLE_COUNT ||
    runnerReport.workload.bodyVertexCount !== BODY_VERTEX_COUNT ||
    runnerReport.workload.bodyTriangleCount !== BODY_TRIANGLE_COUNT ||
    runnerReport.collision.exactActualBodyGateClear !== true ||
    runnerReport.collision.bodyGarmentTriangleIntersectionCount !== 0 ||
    runnerReport.collision.penetratingVertexCount !== 0 ||
    runnerReport.collision.unsafeVertexCount !== 0 ||
    runnerReport.collision.ambiguousSignVertexCount !== 0 ||
    runnerReport.claims.savedLineageAuthenticatedByOuterWrapper !== false ||
    runnerReport.claims.fitAuthority !== false ||
    runnerReport.claims.runtimeAuthority !== false ||
    runnerReport.claims.productionAuthority !== false
  )
    fail('binding-mismatch', 'Saved 32F runner report or authority boundary drifted.');
  if (
    strainReport.status !== 'saved-dxf-32-frame-strain-diagnostic-blocked' ||
    strainReport.decision !==
      'MEASURED_SAVED_32_FRAME_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS' ||
    strainReport.seal.canonicalSha256 !== witness.strainProjectionCanonicalSha256 ||
    strainReport.bindings.savedRuntimeSourceCanonicalSha256 !==
      runnerReport.bindings.savedRuntimeSourceCanonicalSha256 ||
    strainReport.bindings.runtimeSourceCanonicalSha256 !==
      witness.runtimeProjectionCanonicalSha256 ||
    strainReport.bindings.runner32FrameCanonicalSha256 !==
      witness.runnerProjectionCanonicalSha256 ||
    strainReport.bindings.normalizedV5AggregateSha256 !==
      runnerReport.bindings.normalizedV5AggregateSha256 ||
    strainReport.workload.vertexCount !== GARMENT_VERTEX_COUNT ||
    strainReport.workload.triangleCount !== GARMENT_TRIANGLE_COUNT ||
    strainReport.validity.validTriangleCount !== GARMENT_TRIANGLE_COUNT ||
    strainReport.validity.invalidTriangleCount !== 0 ||
    strainReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
    strainReport.claims.exactRetainedSaved32FrameProjectionBound !== true ||
    strainReport.claims.frozenV1KernelPortLimitsAndColorLutReused !== true ||
    strainReport.claims.physicalStressOrPaComputed !== false ||
    strainReport.claims.materialFailureEvaluated !== false ||
    strainReport.claims.fitAuthority !== false ||
    strainReport.claims.runtimeAuthority !== false ||
    strainReport.claims.productionAuthority !== false ||
    witness.strain.physicalStressAuthority !== false ||
    witness.strain.materialFailureAuthority !== false ||
    witness.strain.fitAuthority !== false ||
    witness.strain.runtimeAuthority !== false ||
    witness.strain.productionAuthority !== false
  )
    fail('binding-mismatch', 'Saved 32F strain report or authority boundary drifted.');
}

function validateDimensionsAndTopology(witness: LiveInputs): void {
  const body = witness.runtime.collisionInput;
  if (
    body.bodyPositionsM.length !== BODY_VERTEX_COUNT * 3 ||
    body.bodyTriangles.length !== BODY_TRIANGLE_COUNT * 3 ||
    witness.runner.finalPositions3M.length !== GARMENT_VERTEX_COUNT * 3 ||
    witness.runner.normalizedTriangles.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    witness.strain.triangleValues.length !== GARMENT_TRIANGLE_COUNT * VALUE_STRIDE ||
    witness.strain.validityFlags.length !== GARMENT_TRIANGLE_COUNT ||
    witness.strain.normalizedTopology.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    !bytesEqual(witness.runtime.normalizedTriangles, witness.runner.normalizedTriangles) ||
    !bytesEqual(witness.runner.normalizedTriangles, witness.strain.normalizedTopology)
  )
    fail(
      'binding-mismatch',
      'Saved body, final positions, topology, or strain dimensions drifted.',
    );
}

function indexedGeometry(positions: Float32Array, triangles: Uint32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new CapturedFloat32Array(positions), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(new CapturedUint32Array(triangles), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createThreeSession(
  canvas: HTMLCanvasElement,
  bodyPositions: Float32Array,
  bodyTriangles: Uint32Array,
  finalPositions: Float32Array,
  finalTriangles: Uint32Array,
  heatmap: BetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterReportV1,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapSessionV1 {
  let renderer: THREE.WebGLRenderer | null = null;
  let bodyGeometry: THREE.BufferGeometry | null = null;
  let garmentGeometry: THREE.BufferGeometry | null = null;
  let garmentEdgeGeometry: THREE.BufferGeometry | null = null;
  let bodyMaterial: THREE.MeshStandardMaterial | null = null;
  let garmentMaterial: THREE.MeshPhysicalMaterial | null = null;
  let edgeMaterial: THREE.LineBasicMaterial | null = null;
  let disposed = false;
  const dispose = (): boolean => {
    if (disposed) return false;
    disposed = true;
    renderer?.dispose();
    bodyGeometry?.dispose();
    garmentGeometry?.dispose();
    garmentEdgeGeometry?.dispose();
    bodyMaterial?.dispose();
    garmentMaterial?.dispose();
    edgeMaterial?.dispose();
    return true;
  };
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f2f2f2');
    bodyGeometry = indexedGeometry(bodyPositions, bodyTriangles);
    garmentGeometry = new THREE.BufferGeometry();
    garmentGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new CapturedFloat32Array(heatmap.positions), 3),
    );
    garmentGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new CapturedFloat32Array(heatmap.colors), 3),
    );
    garmentGeometry.computeVertexNormals();
    garmentGeometry.computeBoundingBox();
    garmentGeometry.computeBoundingSphere();
    const indexedGarment = indexedGeometry(finalPositions, finalTriangles);
    garmentEdgeGeometry = new THREE.EdgesGeometry(indexedGarment, 38);
    indexedGarment.dispose();
    bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#bcbcbc',
      roughness: 0.88,
      metalness: 0,
      side: THREE.FrontSide,
    });
    garmentMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.9,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'exact-actual-canonical-measurement-body';
    const garmentMesh = new THREE.Mesh(garmentGeometry, garmentMaterial);
    garmentMesh.name = 'exact-saved-32-frame-dimensionless-strain-utilization-garment';
    garmentMesh.userData.receiptSha256 = report.seal.canonicalSha256;
    scene.add(bodyMesh, garmentMesh);
    edgeMaterial = new THREE.LineBasicMaterial({
      color: '#202020',
      transparent: true,
      opacity: 0.28,
    });
    scene.add(new THREE.LineSegments(garmentEdgeGeometry, edgeMaterial));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x535353, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.8);
    key.position.set(3.2, 4.4, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.2);
    fill.position.set(-3, 1.8, 2.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xb8c4ff, 1.2);
    rim.position.set(1.4, 2.4, -4.4);
    scene.add(rim);

    const bodyBounds = new THREE.Box3().setFromObject(bodyMesh);
    const garmentBounds = new THREE.Box3().setFromObject(garmentMesh);
    const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
    const bodySize = bodyBounds.getSize(new THREE.Vector3());
    const garmentCenter = garmentBounds.getCenter(new THREE.Vector3());
    const width = Math.max(canvas.clientWidth || canvas.width || 960, 640);
    const height = Math.max(canvas.clientHeight || canvas.height || 1_080, 720);
    const aspect = width / height;
    const fovDegrees = 27;
    const halfFov = THREE.MathUtils.degToRad(fovDegrees / 2);
    const distance = Math.max(
      (bodySize.y * 1.06) / (2 * Math.tan(halfFov)),
      (bodySize.x * 1.16) / (2 * Math.tan(halfFov) * aspect),
    );
    const camera = new THREE.PerspectiveCamera(fovDegrees, aspect, 0.01, 12);
    const target = bodyCenter.clone().lerp(garmentCenter, 0.2);
    camera.position.set(target.x + 0.1, target.y + 0.02, target.z + distance * 1.03);
    camera.lookAt(target);

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.render(scene, camera);
    canvas.dataset.strainHeatmapReceiptSha256 = report.seal.canonicalSha256;
    canvas.dataset.strainHeatmapStableEvidenceSha256 = report.stableEvidence.canonicalSha256;
    canvas.dataset.strainHeatmapMaximumUtilization = String(
      report.visualization.maximumUtilization,
    );
    return objectFreeze({ report, dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * Structural adapter only. A genuine saved wrapper must authenticate all three private owners before
 * and after this call and mint the outer genuine receipt. This function never returns an input owner.
 */
export async function createBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterV1(
  canvas: HTMLCanvasElement,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterResultV1> {
  try {
    if (!isRealCanvas(canvas)) fail('invalid-canvas', 'A real HTML canvas is required.');
    const witness = projectLiveInputs(runtimeOwner, runnerOwner, strainOwner);
    validateStructuralReports(runtimeOwner, runnerOwner, strainOwner, witness);
    validateDimensionsAndTopology(witness);
    const heatmap = buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
      positions: witness.runner.finalPositions3M,
      topology: witness.runner.normalizedTriangles,
      triangleValues: witness.strain.triangleValues,
      validityFlags: witness.strain.validityFlags,
    });
    assertInputsStillMatch(
      runtimeOwner,
      runnerOwner,
      strainOwner,
      witness,
      'before digest validation',
    );
    await validateDigestAuthority();
    assertInputsStillMatch(
      runtimeOwner,
      runnerOwner,
      strainOwner,
      witness,
      'during digest validation',
    );
    const body = witness.runtime.collisionInput;
    const [
      bodyPositionsSha,
      bodyTrianglesSha,
      finalPositionsSha,
      topologySha,
      strainValuesSha,
      strainFlagsSha,
      strainEnvelopeSha,
      renderedPositionsSha,
      renderedColorsSha,
    ] = await Promise.all([
      digestBytes(float32LeBytes(body.bodyPositionsM)),
      digestBytes(uint32LeBytes(body.bodyTriangles)),
      digestBytes(float32LeBytes(witness.runner.finalPositions3M)),
      digestBytes(uint32LeBytes(witness.runner.normalizedTriangles)),
      digestBytes(float32LeBytes(witness.strain.triangleValues)),
      digestBytes(uint32LeBytes(witness.strain.validityFlags)),
      digestBytes(outputEnvelope(witness.strain.triangleValues, witness.strain.validityFlags)),
      digestBytes(float32LeBytes(heatmap.positions)),
      digestBytes(float32LeBytes(heatmap.colors)),
    ]);
    assertInputsStillMatch(
      runtimeOwner,
      runnerOwner,
      strainOwner,
      witness,
      'while hashing copied render content',
    );
    const runtimeReport = runtimeOwner.report;
    const runnerReport = runnerOwner.report;
    const strainReport = strainOwner.report;
    if (
      bodyPositionsSha !== runnerReport.bindings.bodyPositions3MSha256 ||
      bodyTrianglesSha !== runnerReport.bindings.bodyTrianglesSha256 ||
      finalPositionsSha !== runnerReport.bindings.finalPositions3MSha256 ||
      finalPositionsSha !== strainReport.bindings.finalPositions3MSha256 ||
      topologySha !== runtimeReport.bindings.normalizedTopologySha256 ||
      topologySha !== runnerReport.bindings.normalizedTopologySha256 ||
      topologySha !== strainReport.bindings.normalizedTopologySha256 ||
      topologySha !== strainReport.bindings.port.normalizedTopologySha256 ||
      strainValuesSha !== strainReport.bindings.outputValuesFloat32LeSha256 ||
      strainFlagsSha !== strainReport.bindings.outputValidityFlagsUint32LeSha256 ||
      strainEnvelopeSha !== strainReport.bindings.outputEnvelopeSha256 ||
      heatmap.minimumUtilization !== strainReport.ranges.normalizedUtilization.minimum ||
      heatmap.maximumUtilization !== strainReport.ranges.normalizedUtilization.maximum ||
      heatmap.triangleCountAtOrAboveFourTimesProvisionalLimit !==
        strainReport.interpretation.triangleCountAtOrAboveFourTimesProvisionalLimit
    )
      fail('binding-mismatch', 'Saved 32F heatmap content hashes or statistics drifted.');
    for (const digest of [
      runtimeReport.seal.canonicalSha256,
      runnerReport.seal.canonicalSha256,
      strainReport.seal.canonicalSha256,
      strainReport.stableEvidence.canonicalSha256,
      strainReport.bindings.frozenV1KernelSourceSha256,
      strainReport.bindings.frozenV1ProvisionalLimitsSha256,
      strainReport.bindings.frozenV1ColorLutSha256,
      bodyPositionsSha,
      bodyTrianglesSha,
      finalPositionsSha,
      topologySha,
      strainValuesSha,
      strainFlagsSha,
      strainEnvelopeSha,
      renderedPositionsSha,
      renderedColorsSha,
    ])
      if (!isSha256(digest)) fail('binding-mismatch', 'A heatmap SHA-256 binding is invalid.');

    const bindings = objectFreeze({
      savedRuntimeSourceCanonicalSha256: strainReport.bindings.savedRuntimeSourceCanonicalSha256,
      runtimeSourceCanonicalSha256: witness.runtimeProjectionCanonicalSha256,
      runtimeReportCanonicalSha256: runtimeReport.seal.canonicalSha256,
      runner32FrameCanonicalSha256: witness.runnerProjectionCanonicalSha256,
      runner32FrameReportCanonicalSha256: runnerReport.seal.canonicalSha256,
      strainStableEvidenceSha256: strainReport.stableEvidence.canonicalSha256,
      strainReportCanonicalSha256: strainReport.seal.canonicalSha256,
      bodyPositions3MSha256: bodyPositionsSha,
      bodyTrianglesSha256: bodyTrianglesSha,
      finalPositions3MSha256: finalPositionsSha,
      normalizedTopologySha256: topologySha,
      strainValuesFloat32LeSha256: strainValuesSha,
      strainValidityFlagsUint32LeSha256: strainFlagsSha,
      strainOutputEnvelopeSha256: strainEnvelopeSha,
      strainKernelSourceSha256: strainReport.bindings.frozenV1KernelSourceSha256,
      strainProvisionalLimitsSha256: strainReport.bindings.frozenV1ProvisionalLimitsSha256,
      strainColorLutSha256: strainReport.bindings.frozenV1ColorLutSha256,
      renderedNonIndexedPositionsFloat32LeSha256: renderedPositionsSha,
      renderedVertexColorsFloat32LeSha256: renderedColorsSha,
    });
    const counts = objectFreeze({
      frameCount: 32 as const,
      bodyVertexCount: BODY_VERTEX_COUNT,
      bodyTriangleCount: BODY_TRIANGLE_COUNT,
      garmentVertexCount: GARMENT_VERTEX_COUNT,
      garmentTriangleCount: GARMENT_TRIANGLE_COUNT,
      renderedFaceVertexCount: 2_736 as const,
      validStrainTriangleCount: GARMENT_TRIANGLE_COUNT,
      invalidStrainTriangleCount: 0 as const,
    });
    const visualization = objectFreeze({
      quantity: 'normalized-green-strain-utilization' as const,
      units: 'dimensionless' as const,
      interpolation: 'linear-srgb-face-owned' as const,
      displayClampMinimum: 0 as const,
      displayClampMaximum: DISPLAY_CLAMP_MAXIMUM,
      topLegendLabel: '≥2 provisional utilization' as const,
      minimumUtilization: heatmap.minimumUtilization,
      maximumUtilization: heatmap.maximumUtilization,
      triangleCountAtOrAboveDisplayClamp: heatmap.triangleCountAtOrAboveDisplayClamp,
      triangleCountAtOrAboveFourTimesProvisionalLimit:
        heatmap.triangleCountAtOrAboveFourTimesProvisionalLimit,
      disclaimer:
        'Dimensionless provisional strain visualization only; not physical stress, Pa, material failure, or fit.' as const,
    });
    const remainingBlockers = objectFreeze([
      'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
      'post-frame-self-orientation-not-evaluated',
      'material-visualization-thresholds-provisional-and-uncalibrated',
      'physical-stress-and-pa-not-computed',
      'material-failure-not-evaluated',
      'settle-fit-runtime-production-authority-not-established',
    ] as const);
    const claims = objectFreeze({
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      privateBaseRuntimeSaved32AndStrainOwnersRequired: true as const,
      inputOwnersReturnedByAdapter: false as const,
      allThreeInputOwnersRevalidatedAcrossAsyncBoundaries: true as const,
      exactSaved32FinalPositionsRendered: true as const,
      exactSaved32TriangleStrainValuesRendered: true as const,
      faceOwnedColorsPreventCrossTriangleInterpolation: true as const,
      copiedThreeResourcesSurviveUpstreamOwnerDisposal: true as const,
      visibleHeatmapRendered: true as const,
      dimensionlessStrainUtilizationOnly: true as const,
      physicalStressOrPaRendered: false as const,
      materialFailureRendered: false as const,
      selfCollisionAndOrientationCleared: false as const,
      settleCleared: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const stablePayload = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_ADAPTER_REPORT_V1,
      status: 'structural-saved-32-frame-visible-strain-heatmap-ready' as const,
      decision:
        'RENDERED_EXACT_SAVED_32_FRAME_DIMENSIONLESS_STRAIN_WITH_DOWNSTREAM_BLOCKERS' as const,
      label: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_LABEL_V1,
      renderer: 'three-webgl-exact-saved32-face-owned-strain-heatmap' as const,
      bindings: objectFreeze({
        ...bindings,
        runner32FrameCanonicalSha256: undefined,
        runner32FrameReportCanonicalSha256: undefined,
        strainReportCanonicalSha256: undefined,
      }),
      counts,
      visualization,
      remainingBlockers,
      claims,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-32-frame-visible-strain-heatmap-stable-evidence-v1',
        stablePayload,
      ),
      excludesVolatileRunnerAndStrainReportSeals: true as const,
    });
    assertInputsStillMatch(
      runtimeOwner,
      runnerOwner,
      strainOwner,
      witness,
      'while sealing stable heatmap evidence',
    );
    const reportWithoutSeal = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_ADAPTER_REPORT_V1,
      status: 'structural-saved-32-frame-visible-strain-heatmap-ready' as const,
      decision:
        'RENDERED_EXACT_SAVED_32_FRAME_DIMENSIONLESS_STRAIN_WITH_DOWNSTREAM_BLOCKERS' as const,
      label: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_HEATMAP_LABEL_V1,
      renderer: 'three-webgl-exact-saved32-face-owned-strain-heatmap' as const,
      bindings,
      counts,
      visualization,
      stableEvidence,
      remainingBlockers,
      claims,
    });
    const report = objectFreeze({
      ...reportWithoutSeal,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-32-frame-visible-strain-heatmap-adapter-report-v1',
          reportWithoutSeal,
        ),
        authority: 'unsigned-structural-saved-32-frame-visible-strain-heatmap-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainHeatmapAdapterReportV1;
    assertInputsStillMatch(
      runtimeOwner,
      runnerOwner,
      strainOwner,
      witness,
      'before creating copied Three resources',
    );
    const session = createThreeSession(
      canvas,
      new CapturedFloat32Array(body.bodyPositionsM),
      new CapturedUint32Array(body.bodyTriangles),
      new CapturedFloat32Array(witness.runner.finalPositions3M),
      new CapturedUint32Array(witness.runner.normalizedTriangles),
      objectFreeze({
        ...heatmap,
        positions: new CapturedFloat32Array(heatmap.positions),
        colors: new CapturedFloat32Array(heatmap.colors),
      }),
      report,
    );
    return objectFreeze({ ok: true as const, session, report });
  } catch (error) {
    if (error instanceof HeatmapAdapterError)
      return objectFreeze({ ok: false as const, code: error.code, detail: error.message });
    const detail =
      error instanceof Error ? error.message : 'Unknown saved 32F heatmap rendering failure.';
    return objectFreeze({
      ok: false as const,
      code: 'render-failed' as const,
      detail: capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string,
    });
  }
}
