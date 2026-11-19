import * as THREE from 'three';
import {
  mapTriangleStrainToRenderOrderV1,
  type TriangleStrainRenderOrderReceiptV1,
} from './triangle-strain-render-order-v1';

import {
  BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1,
  projectBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1,
  type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1,
} from './beta-skirt-canonical-medium-strain-utilization-diagnostic-v1';
import {
  validateBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewOwnersV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewReceiptV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-clear-preview-v2';
import type { BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import type { BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_STRAIN_HEATMAP_PREVIEW_V1 =
  'beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_STRAIN_HEATMAP_LABEL_V1 =
  '16-FRAME WEBGPU · STRAIN UTILIZATION · PROVISIONAL / NOT Pa · SELF/SETTLE NOT CLEARED · NOT FIT' as const;

const BODY_VERTEX_COUNT = 13_380;
const BODY_TRIANGLE_COUNT = 26_756;
const GARMENT_VERTEX_COUNT = 580;
const GARMENT_TRIANGLE_COUNT = 912;
const VALUE_STRIDE = 4;
const UTILIZATION_COMPONENT = 3;
const DISPLAY_CLAMP_MAXIMUM = 2;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const capturedDataViewSetFloat32 = DataView.prototype.setFloat32;
const capturedDataViewSetUint32 = DataView.prototype.setUint32;
const capturedReflectApply = Reflect.apply;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const HEX = Object.freeze(
  Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

type Rgb = readonly [number, number, number];

export type BetaSkirtCanonicalMediumStrainHeatmapGeometryV1 = Readonly<{
  positions: Float32Array;
  colors: Float32Array;
  minimumUtilization: number;
  maximumUtilization: number;
  triangleCountAtOrAboveDisplayClamp: number;
  triangleCountAtOrAboveFourTimesProvisionalLimit: number;
}>;

export type BetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapReceiptV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_STRAIN_HEATMAP_PREVIEW_V1;
  status: 'ready-live-contact-clear-strain-diagnostic';
  label: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_STRAIN_HEATMAP_LABEL_V1;
  renderer: 'three-webgl-exact-final-per-triangle-strain-heatmap';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    contactPreviewFinalPositions3MSha256: string;
    normalizedTopologySha256: string;
    strainValuesFloat32LeSha256: string;
    strainValidityFlagsUint32LeSha256: string;
    strainOutputEnvelopeSha256: string;
    strainKernelSourceSha256: string;
    strainProvisionalLimitsSha256: string;
    strainColorLutSha256: string;
    renderedNonIndexedPositionsFloat32LeSha256: string;
    renderedVertexColorsFloat32LeSha256: string;
    renderTriangleOrder: TriangleStrainRenderOrderReceiptV1;
  }>;
  counts: Readonly<{
    frameCount: 16;
    bodyVertexCount: 13_380;
    bodyTriangleCount: 26_756;
    garmentVertexCount: 580;
    garmentTriangleCount: 912;
    validStrainTriangleCount: 912;
  }>;
  visualization: Readonly<{
    quantity: 'normalized-green-strain-utilization';
    units: 'dimensionless';
    interpolation: 'linear-srgb';
    displayClampMinimum: 0;
    displayClampMaximum: 2;
    topLegendLabel: '≥2 provisional utilization';
    minimumUtilization: number;
    maximumUtilization: number;
    triangleCountAtOrAboveDisplayClamp: number;
    triangleCountAtOrAboveFourTimesProvisionalLimit: number;
    disclaimer: 'Provisional strain visualization only; not physical stress, Pa, failure, or fit.';
  }>;
  inheritedContactClearReceipt: BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewReceiptV2;
  remainingBlockers: readonly string[];
  claims: Readonly<{
    exactFinalGpuPositionsRendered: true;
    exactGpuTriangleStrainValuesRendered: true;
    invalidTrianglesRendered: false;
    unclampedUtilizationStatisticsRetained: true;
    physicalStressOrPaRendered: false;
    materialFailureRendered: false;
    selfCollisionCleared: false;
    settleCleared: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-visible-strain-utilization-diagnostic-only';
  }>;
}>;

export type BetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapSessionV1 = Readonly<{
  receipt: BetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapReceiptV1;
  dispose(): void;
}>;

function fail(message: string): never {
  throw new Error(`Strain heatmap preview rejected: ${message}`);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function bytesEqual(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
}

function float32LeBytes(values: Float32Array): Uint8Array<ArrayBuffer> {
  const result = new CapturedUint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetFloat32, view, [index * 4, values[index]!, true]);
  return result;
}

function uint32LeBytes(values: Uint32Array): Uint8Array<ArrayBuffer> {
  const result = new CapturedUint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetUint32, view, [index * 4, values[index]!, true]);
  return result;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!capturedSubtle || !capturedDigest) fail('native SHA-256 is unavailable.');
  const digest = await capturedReflectApply(capturedDigest, capturedSubtle, ['SHA-256', bytes]);
  if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32)
    fail('native SHA-256 returned an invalid digest.');
  return Array.from(new CapturedUint8Array(digest), (value) => HEX[value]!).join('');
}

function hexRgb(value: string): Rgb {
  if (!/^#[0-9a-f]{6}$/iu.test(value)) throw new RangeError('Heatmap LUT color is invalid.');
  const linear = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return Object.freeze([
    linear(Number.parseInt(value.slice(1, 3), 16)),
    linear(Number.parseInt(value.slice(3, 5), 16)),
    linear(Number.parseInt(value.slice(5, 7), 16)),
  ] as const);
}

/** Returns the exact clamped linear-sRGB diagnostic color. It does not classify material failure. */
export function betaSkirtStrainUtilizationColorV1(utilization: number): Rgb {
  if (!Number.isFinite(utilization)) throw new RangeError('Utilization must be finite.');
  const stops = BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.stops;
  const clamped = Math.max(
    BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.clamp.minimum,
    Math.min(BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.clamp.maximum, utilization),
  );
  for (let index = 0; index < stops.length - 1; index += 1) {
    const left = stops[index]!;
    const right = stops[index + 1]!;
    if (clamped > right.utilization) continue;
    const denominator = right.utilization - left.utilization;
    const fraction = denominator === 0 ? 0 : (clamped - left.utilization) / denominator;
    const a = hexRgb(left.color);
    const b = hexRgb(right.color);
    return Object.freeze([
      a[0] + (b[0] - a[0]) * fraction,
      a[1] + (b[1] - a[1]) * fraction,
      a[2] + (b[2] - a[2]) * fraction,
    ] as const);
  }
  return hexRgb(stops.at(-1)!.color);
}

/** Expands indexed cloth into face-owned vertices so adjacent triangles never average heat colors. */
export function buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1(options: {
  positions: Float32Array;
  topology: Uint32Array;
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
}): BetaSkirtCanonicalMediumStrainHeatmapGeometryV1 {
  const triangleCount = options.topology.length / 3;
  const vertexCount = options.positions.length / 3;
  if (
    !Number.isInteger(triangleCount) ||
    triangleCount <= 0 ||
    !Number.isInteger(vertexCount) ||
    vertexCount <= 0 ||
    options.triangleValues.length !== triangleCount * VALUE_STRIDE ||
    options.validityFlags.length !== triangleCount
  )
    throw new RangeError('Heatmap geometry inputs have inconsistent dimensions.');

  const positions = new CapturedFloat32Array(triangleCount * 9);
  const colors = new CapturedFloat32Array(triangleCount * 9);
  let minimumUtilization = Number.POSITIVE_INFINITY;
  let maximumUtilization = Number.NEGATIVE_INFINITY;
  let triangleCountAtOrAboveDisplayClamp = 0;
  let triangleCountAtOrAboveFourTimesProvisionalLimit = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (options.validityFlags[triangle] !== 0)
      throw new RangeError(`Triangle ${triangle} has a nonzero strain validity flag.`);
    const utilization = options.triangleValues[triangle * VALUE_STRIDE + UTILIZATION_COMPONENT]!;
    if (!Number.isFinite(utilization) || utilization < 0)
      throw new RangeError(`Triangle ${triangle} has invalid utilization.`);
    minimumUtilization = Math.min(minimumUtilization, utilization);
    maximumUtilization = Math.max(maximumUtilization, utilization);
    if (utilization >= DISPLAY_CLAMP_MAXIMUM) triangleCountAtOrAboveDisplayClamp += 1;
    if (utilization >= 4) triangleCountAtOrAboveFourTimesProvisionalLimit += 1;
    const color = betaSkirtStrainUtilizationColorV1(utilization);
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = options.topology[triangle * 3 + corner]!;
      if (vertex >= vertexCount) throw new RangeError(`Triangle ${triangle} is out of range.`);
      for (let axis = 0; axis < 3; axis += 1) {
        const position = options.positions[vertex * 3 + axis]!;
        if (!Number.isFinite(position))
          throw new RangeError(`Triangle ${triangle} references a non-finite position.`);
        positions[triangle * 9 + corner * 3 + axis] = position;
        colors[triangle * 9 + corner * 3 + axis] = color[axis]!;
      }
    }
  }
  return Object.freeze({
    positions,
    colors,
    minimumUtilization,
    maximumUtilization,
    triangleCountAtOrAboveDisplayClamp,
    triangleCountAtOrAboveFourTimesProvisionalLimit,
  });
}

async function validateOwners(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  strainOwner: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1,
) {
  const contact = await validateBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewOwnersV2(
    runtimeSourceOwner,
    runnerOwner,
  );
  const strain = projectBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1(strainOwner);
  if (!strain) fail('the strain diagnostic owner is unavailable, forged, cloned, or disposed.');
  const report = strainOwner.report;
  if (
    report.status !== 'diagnostic-completed' ||
    report.decision !== 'PASS_BOUNDED_PER_TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC' ||
    report.bindings.runtimeSourceCanonicalSha256 !==
      contact.receipt.bindings.runtimeSourceCanonicalSha256 ||
    report.bindings.contactRunnerCanonicalSha256 !== runnerOwner.report.seal.canonicalSha256 ||
    report.bindings.finalPositions3MSha256 !== contact.receipt.bindings.finalPositions3MSha256 ||
    report.workload.triangleCount !== GARMENT_TRIANGLE_COUNT ||
    report.validity.validTriangleCount !== GARMENT_TRIANGLE_COUNT ||
    report.validity.invalidTriangleCount !== 0 ||
    report.claims.physicalStressOrPaComputed ||
    report.claims.materialFailureEvaluated ||
    report.claims.fitAuthority ||
    report.claims.runtimeAuthority ||
    report.claims.productionAuthority ||
    strain.physicalStressAuthority ||
    strain.materialFailureAuthority ||
    strain.fitAuthority ||
    strain.runtimeAuthority ||
    strain.productionAuthority
  )
    fail('the diagnostic report or its authority boundary drifted.');
  if (
    contact.bodyPositionsM.length !== BODY_VERTEX_COUNT * 3 ||
    contact.bodyTriangles.length !== BODY_TRIANGLE_COUNT * 3 ||
    contact.finalGarmentPositionsM.length !== GARMENT_VERTEX_COUNT * 3 ||
    contact.normalizedTriangles.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    strain.triangleValues.length !== GARMENT_TRIANGLE_COUNT * VALUE_STRIDE ||
    strain.validityFlags.length !== GARMENT_TRIANGLE_COUNT ||
    !bytesEqual(strain.normalizedTopology, contact.normalizedTriangles)
  )
    fail('the exact body, garment, topology, or strain dimensions drifted.');

  const [
    { projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1: projectRuntime },
    { projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2: projectRunner },
  ] = await Promise.all([
    import('./beta-skirt-canonical-medium-webgpu-runtime-source-v1'),
    import('./beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2'),
  ]);
  const runtime = projectRuntime(runtimeSourceOwner);
  if (
    !runtime ||
    runtime.reportCanonicalSha256 !== contact.receipt.bindings.runtimeSourceCanonicalSha256 ||
    !bytesEqual(runtime.normalizedTriangles, contact.normalizedTriangles)
  )
    fail('the genuine runtime topology is unavailable or stale.');
  const requireCurrent = () => {
    if (
      projectRuntime(runtimeSourceOwner)?.reportCanonicalSha256 !== runtime.reportCanonicalSha256 ||
      projectRunner(runnerOwner)?.reportCanonicalSha256 !==
        report.bindings.contactRunnerCanonicalSha256 ||
      projectBetaSkirtCanonicalMediumStrainUtilizationDiagnosticV1(strainOwner)
        ?.reportCanonicalSha256 !== strain.reportCanonicalSha256
    )
      fail('a borrowed strain preview owner became unavailable.');
  };
  requireCurrent();
  const renderOrder = await mapTriangleStrainToRenderOrderV1({
    normalizedTopology: contact.normalizedTriangles,
    continuumTriangleIndices:
      runtime.normalizedV5.simulation.constraints.continuumStrain.triangleIndices,
    triangleValues: strain.triangleValues,
    validityFlags: strain.validityFlags,
  });
  requireCurrent();
  if (
    renderOrder.receipt.continuumTriangleIndicesSha256 !==
    report.bindings.port.triangleIndicesSha256
  )
    fail('continuum topology differs from the sealed strain source.');
  const heatmap = buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
    positions: contact.finalGarmentPositionsM,
    topology: contact.normalizedTriangles,
    triangleValues: renderOrder.orderedTriangleValues,
    validityFlags: renderOrder.orderedValidityFlags,
  });
  const [topologySha256, valuesSha256, flagsSha256, renderedPositionsSha256, colorsSha256] =
    await Promise.all([
      sha256(uint32LeBytes(contact.normalizedTriangles)),
      sha256(float32LeBytes(strain.triangleValues)),
      sha256(uint32LeBytes(strain.validityFlags)),
      sha256(float32LeBytes(heatmap.positions)),
      sha256(float32LeBytes(heatmap.colors)),
    ]);
  requireCurrent();
  if (
    topologySha256 !== contact.receipt.bindings.normalizedTopologySha256 ||
    topologySha256 !== report.bindings.port.normalizedTopologySha256 ||
    valuesSha256 !== report.bindings.outputValuesFloat32LeSha256 ||
    flagsSha256 !== report.bindings.outputValidityFlagsUint32LeSha256 ||
    heatmap.minimumUtilization !== report.ranges.normalizedUtilization.minimum ||
    heatmap.maximumUtilization !== report.ranges.normalizedUtilization.maximum ||
    heatmap.triangleCountAtOrAboveFourTimesProvisionalLimit !==
      report.interpretation.triangleCountAtOrAboveFourTimesProvisionalLimit
  )
    fail('the projected topology, strain values, statistics, or rendered attributes drifted.');
  for (const digest of [
    strain.reportCanonicalSha256,
    report.bindings.outputEnvelopeSha256,
    report.bindings.kernelSourceSha256,
    report.bindings.provisionalLimitsSha256,
    report.bindings.colorLutSha256,
    topologySha256,
    valuesSha256,
    flagsSha256,
    renderedPositionsSha256,
    colorsSha256,
  ])
    if (!isSha256(digest)) fail('an invalid SHA-256 binding was produced.');

  const receiptWithoutSeal = Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_STRAIN_HEATMAP_PREVIEW_V1,
    status: 'ready-live-contact-clear-strain-diagnostic' as const,
    label: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_STRAIN_HEATMAP_LABEL_V1,
    renderer: 'three-webgl-exact-final-per-triangle-strain-heatmap' as const,
    bindings: Object.freeze({
      runtimeSourceCanonicalSha256: contact.receipt.bindings.runtimeSourceCanonicalSha256,
      contactPreviewFinalPositions3MSha256: contact.receipt.bindings.finalPositions3MSha256,
      normalizedTopologySha256: topologySha256,
      strainValuesFloat32LeSha256: valuesSha256,
      strainValidityFlagsUint32LeSha256: flagsSha256,
      strainOutputEnvelopeSha256: report.bindings.outputEnvelopeSha256,
      strainKernelSourceSha256: report.bindings.kernelSourceSha256,
      strainProvisionalLimitsSha256: report.bindings.provisionalLimitsSha256,
      strainColorLutSha256: report.bindings.colorLutSha256,
      renderedNonIndexedPositionsFloat32LeSha256: renderedPositionsSha256,
      renderedVertexColorsFloat32LeSha256: colorsSha256,
      renderTriangleOrder: renderOrder.receipt,
    }),
    counts: Object.freeze({
      frameCount: 16 as const,
      bodyVertexCount: BODY_VERTEX_COUNT,
      bodyTriangleCount: BODY_TRIANGLE_COUNT,
      garmentVertexCount: GARMENT_VERTEX_COUNT,
      garmentTriangleCount: GARMENT_TRIANGLE_COUNT,
      validStrainTriangleCount: GARMENT_TRIANGLE_COUNT,
    }),
    visualization: Object.freeze({
      quantity: 'normalized-green-strain-utilization' as const,
      units: 'dimensionless' as const,
      interpolation: 'linear-srgb' as const,
      displayClampMinimum: 0 as const,
      displayClampMaximum: DISPLAY_CLAMP_MAXIMUM as 2,
      topLegendLabel: '≥2 provisional utilization' as const,
      minimumUtilization: heatmap.minimumUtilization,
      maximumUtilization: heatmap.maximumUtilization,
      triangleCountAtOrAboveDisplayClamp: heatmap.triangleCountAtOrAboveDisplayClamp,
      triangleCountAtOrAboveFourTimesProvisionalLimit:
        heatmap.triangleCountAtOrAboveFourTimesProvisionalLimit,
      disclaimer:
        'Provisional strain visualization only; not physical stress, Pa, failure, or fit.' as const,
    }),
    inheritedContactClearReceipt: contact.receipt,
    remainingBlockers: Object.freeze([...contact.receipt.remainingBlockers, ...report.blockers]),
    claims: Object.freeze({
      exactFinalGpuPositionsRendered: true as const,
      exactGpuTriangleStrainValuesRendered: true as const,
      invalidTrianglesRendered: false as const,
      unclampedUtilizationStatisticsRetained: true as const,
      physicalStressOrPaRendered: false as const,
      materialFailureRendered: false as const,
      selfCollisionCleared: false as const,
      settleCleared: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    }),
  });
  const canonicalSha256 = await sha256(
    capturedReflectApply(capturedTextEncode, capturedTextEncoder, [
      capturedJsonStringify(receiptWithoutSeal),
    ]) as Uint8Array<ArrayBuffer>,
  );
  const receipt: BetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapReceiptV1 = Object.freeze({
    ...receiptWithoutSeal,
    seal: Object.freeze({
      algorithm: 'SHA-256' as const,
      canonicalSha256,
      authority: 'unsigned-visible-strain-utilization-diagnostic-only' as const,
    }),
  });
  requireCurrent();
  return Object.freeze({ contact, heatmap, receipt });
}

function indexedGeometry(positions: Float32Array, triangles: Uint32Array): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  result.setIndex(new THREE.BufferAttribute(triangles, 1));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export async function createBetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapPreviewV1(
  canvas: HTMLCanvasElement,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  strainOwner: BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOwnerV1,
): Promise<BetaSkirtCanonicalMediumWebgpu16FrameStrainHeatmapSessionV1> {
  if (!(canvas instanceof HTMLCanvasElement))
    throw new TypeError('A real display canvas is required.');
  const validated = await validateOwners(runtimeSourceOwner, runnerOwner, strainOwner);
  let renderer: THREE.WebGLRenderer | null = null;
  let bodyGeometry: THREE.BufferGeometry | null = null;
  let garmentGeometry: THREE.BufferGeometry | null = null;
  let garmentEdgeGeometry: THREE.BufferGeometry | null = null;
  let bodyMaterial: THREE.MeshStandardMaterial | null = null;
  let garmentMaterial: THREE.MeshPhysicalMaterial | null = null;
  let edgeMaterial: THREE.LineBasicMaterial | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer?.dispose();
    bodyGeometry?.dispose();
    garmentGeometry?.dispose();
    garmentEdgeGeometry?.dispose();
    bodyMaterial?.dispose();
    garmentMaterial?.dispose();
    edgeMaterial?.dispose();
  };

  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f2f2f2');
    bodyGeometry = indexedGeometry(
      validated.contact.bodyPositionsM,
      validated.contact.bodyTriangles,
    );
    garmentGeometry = new THREE.BufferGeometry();
    garmentGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(validated.heatmap.positions, 3),
    );
    garmentGeometry.setAttribute('color', new THREE.BufferAttribute(validated.heatmap.colors, 3));
    garmentGeometry.computeVertexNormals();
    garmentGeometry.computeBoundingBox();
    garmentGeometry.computeBoundingSphere();
    const indexedGarment = indexedGeometry(
      validated.contact.finalGarmentPositionsM,
      validated.contact.normalizedTriangles,
    );
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
    garmentMesh.name = 'exact-final-contact-clear-16-frame-strain-utilization-garment';
    garmentMesh.userData.receiptSha256 = validated.receipt.seal.canonicalSha256;
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
    canvas.dataset.strainHeatmapReceiptSha256 = validated.receipt.seal.canonicalSha256;
    canvas.dataset.strainHeatmapMaximumUtilization = String(
      validated.receipt.visualization.maximumUtilization,
    );
    return Object.freeze({ receipt: validated.receipt, dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}
