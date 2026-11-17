// ANSUR II check of the model-form mannequin: one subject in, the production body out, measured back.
//
// The build chain is the one the model-form preview runs (model-open-reference-preview.tsx, BUILD
// PREVIEW of the full-body editor): form fields -> resolveModelOpenReferencePreviewInputV1 ->
// basis per gender -> body frame (A pose) -> uniform height display -> waist/hip runtime -> beta
// shape runtime -> measurement application (represented / limited / not applied). The two thin
// preview wrappers (`buildModelOpenReferenceProxyRuntimeV1`, `buildModelOpenReferenceBetaShapeRuntimeV1`)
// are inlined with their exact catch semantics because importing the React component file would
// drag the whole viewer into a node bundle. Nothing here is product code; the CLI is ansur.mjs.
import type { common_GenderEnum } from 'api/proto-http/admin';
import { modelOpenReferenceMeasurementApplicationV1 } from 'components/managers/model/components/model-open-reference-measurement-application-v1';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { loadMakeHumanLimbCircumferenceDeltaBundleV1 } from 'lib/cloth/body/makehuman-limb-circumference-delta-bundle-v1';
import { createMakeHumanLimbCircumferenceUniformModesV1 } from 'lib/cloth/body/makehuman-limb-circumference-uniform-modes-v1';
import { loadMakeHumanTorsoShapeDeltaBundleV1 } from 'lib/cloth/body/makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformChestShoulderModesResearchV1 } from 'lib/cloth/body/makehuman-uniform-chest-shoulder-modes-research-v1';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import {
  createMeasurementOpenReferenceBetaShapeRuntimeV1,
  MeasurementOpenReferenceBetaShapeSafetyErrorV1,
  type MeasurementOpenReferenceBetaShapeRuntimeResultV1,
} from 'lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  loadMakeHumanOpenReferenceBasisV1,
} from 'lib/cloth/body/measurement-open-reference-display-v1';
import type { OpenReferenceLimbCircumferenceModeV1 } from 'lib/cloth/body/measurement-open-reference-limb-circumference-solver-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from 'lib/cloth/body/measurement-open-reference-limb-section-station-v1';
import {
  createMeasurementOpenReferenceUniformWaistHipRuntimeV1,
  type MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
} from 'lib/cloth/body/measurement-open-reference-uniform-waist-hip-runtime-v1';
import { SURFACE_ANCHOR_TABLE_V1 } from 'lib/cloth/body/measurement-surface-anchors-v1';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
} from 'lib/cloth/body/mesh-plane-section-perimeter-v1';
import { computeMeshSurfaceGeodesicV1 } from 'lib/cloth/body/mesh-surface-geodesic-v1';
import {
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePointV1,
  type MeshSurfacePointV1,
} from 'lib/cloth/body/mesh-surface-path-v1';
import { createMeshSurfaceTopologyV1 } from 'lib/cloth/body/mesh-surface-topology-v1';

type Vec3 = readonly [number, number, number];

export type AnsurBasisKind = 'female' | 'male' | 'neutral';

export interface AnsurSubjectRequest {
  readonly gender: common_GenderEnum;
  /** Wire-name form fields in mm, exactly as the model form would send them. */
  readonly fields: Readonly<Record<string, number>>;
  readonly sourceRevision: string;
}

/** Everything is in mm; null = could not be measured on this body. */
export interface AnsurMeasuredBody {
  statureMm: number | null;
  chestCircMm: number | null;
  chestCircEngineStationMm: number | null;
  chestDepthMm: number | null;
  chestBreadthMm: number | null;
  waistCircMm: number | null;
  waistDepthMm: number | null;
  waistBreadthMm: number | null;
  waistHeightMm: number | null;
  hipCircMm: number | null;
  hipDepthMm: number | null;
  hipBreadthMm: number | null;
  cervicaleHeightMm: number | null;
  acromialHeightMm: number | null;
  crotchHeightMm: number | null;
  shoulderBreadthMm: number | null;
  shoulderLengthMm: number | null;
  neckCircMm: number | null;
  neckBaseCircMm: number | null;
  sleeveLengthMm: number | null;
  wristCircMm: number | null;
  thighCircMm: number | null;
  calfCircMm: number | null;
  ankleCircMm: number | null;
  /** Diagnostics: plane heights (mm above floor) and engine-station loop size. */
  chestGuideYMm: number | null;
  chestEngineYMm: number | null;
  apexYMm: number | null;
  underarmYMm: number | null;
  chestEngineBreadthMm: number | null;
  shoulderBreadthEngineMm: number | null;
  chestEngineDepthMm: number | null;
  maxAsymmetryMm: number | null;
}

export interface AnsurSubjectResult {
  readonly basisKind: AnsurBasisKind | null;
  /** input-rejected | waist-hip-error | beta-throw | safety-error | ok */
  readonly outcome: string;
  readonly message: string;
  readonly adapterErrors: readonly string[];
  readonly adapterWarnings: readonly string[];
  readonly applied: readonly string[];
  readonly limited: readonly string[];
  readonly notApplied: readonly string[];
  readonly betaStatus: string | null;
  readonly waistHipStatus: string | null;
  readonly rollbacks: readonly string[];
  readonly qualitySafe: boolean | null;
  readonly qualityReasons: readonly string[];
  readonly measured: AnsurMeasuredBody | null;
  readonly implausible: readonly string[];
  readonly anchorFailure: string;
  /** Neck stage codes from the beta runtime, to explain a notApplied neck. */
  readonly neckCodes?: readonly string[];
  readonly elapsedMs: number;
}

const ROLLBACK_PATTERN =
  /rollback|fallback|halved|removed|beta-final-|quality-unsafe|self-intersection/;

const basisCache = new Map<AnsurBasisKind, ReturnType<typeof loadMakeHumanOpenReferenceBasisV1>>();
function basisFor(kind: AnsurBasisKind) {
  let cached = basisCache.get(kind);
  if (!cached) {
    cached = loadMakeHumanOpenReferenceBasisV1(kind);
    basisCache.set(kind, cached);
  }
  return cached;
}

/** The engine's own shoulder-breadth chord vertices (fixed per base; see chest-shoulder research). */
const shoulderVertexCache = new Map<AnsurBasisKind, { negative: number; positive: number } | null>();
let torsoBundlePromise: ReturnType<typeof loadMakeHumanTorsoShapeDeltaBundleV1> | null = null;
async function engineShoulderVertices(
  kind: AnsurBasisKind,
  basis: Awaited<ReturnType<typeof loadMakeHumanOpenReferenceBasisV1>>,
  heightMm: number,
) {
  if (!shoulderVertexCache.has(kind)) {
    torsoBundlePromise ??= loadMakeHumanTorsoShapeDeltaBundleV1();
    const modes = createMakeHumanUniformChestShoulderModesResearchV1({
      basis,
      heightMm,
      bundle: await torsoBundlePromise,
    }).modes;
    const pair = modes.find(({ measurementKey }) => measurementKey === 'shoulderBreadthMm')
      ?.shoulderVertices;
    shoulderVertexCache.set(kind, pair ? { negative: pair.negative, positive: pair.positive } : null);
  }
  return shoulderVertexCache.get(kind) ?? null;
}

let limbBundlePromise: ReturnType<typeof loadMakeHumanLimbCircumferenceDeltaBundleV1> | null =
  null;

/** Exact copy of the preview's `buildModelOpenReferenceProxyRuntimeV1` catch contract. */
async function buildProxyRuntime(options: {
  basis: Awaited<ReturnType<typeof loadMakeHumanOpenReferenceBasisV1>>;
  measurements: Parameters<typeof createMeasurementBodyFrameV2>[0]['measurements'];
  openReference: ReturnType<typeof createMeasurementOpenReferenceUniformHeightDisplayV1>;
}): Promise<{ runtime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 | null; error: string }> {
  try {
    return {
      runtime: await createMeasurementOpenReferenceUniformWaistHipRuntimeV1(options),
      error: '',
    };
  } catch (reason: unknown) {
    // The preview substitutes `failedProxyRuntime` (the height-only mesh, status error).
    return { runtime: null, error: reason instanceof Error ? reason.message : String(reason) };
  }
}

function section(mesh: MeasurementSurfaceMeshV1, originM: Vec3, normal: Vec3, seedM?: Vec3) {
  const result = measureMeshPlaneSectionPerimetersV1({
    positionsM: mesh.positions,
    triangleIndices: mesh.indices,
    planeOriginM: originM,
    planeNormal: normal,
    selection: { kind: 'nearest-seed', seedM: seedM ?? originM },
    policy: { weldToleranceM: 0.00002 },
  });
  return result.ok && result.selectedLoop ? result.selectedLoop : null;
}

function horizontal(mesh: MeasurementSurfaceMeshV1, yM: number | null | undefined) {
  if (yM == null || !Number.isFinite(yM)) return null;
  return section(mesh, [0, yM, 0], [0, 1, 0]);
}

function extent(loop: MeshPlaneSectionLoopV1 | null, axis: 0 | 2): number | null {
  if (!loop || loop.pointsM.length < 3) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const point of loop.pointsM) {
    min = Math.min(min, point[axis]);
    max = Math.max(max, point[axis]);
  }
  return (max - min) * 1000;
}

const mm = (valueM: number | null | undefined) =>
  valueM == null || !Number.isFinite(valueM) ? null : valueM * 1000;

function pointPosition(point: MeshSurfacePointV1, positionsM: Float32Array): Vec3 {
  if (point.kind === 'vertex') {
    const o = point.vertex * 3;
    return [positionsM[o], positionsM[o + 1], positionsM[o + 2]];
  }
  const a = point.a * 3;
  const b = point.b * 3;
  return [
    positionsM[a] + (positionsM[b] - positionsM[a]) * point.t,
    positionsM[a + 1] + (positionsM[b + 1] - positionsM[a + 1]) * point.t,
    positionsM[a + 2] + (positionsM[b + 2] - positionsM[a + 2]) * point.t,
  ];
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The guide builder's midline snap (topology mirror map needs exact symmetry). */
function midlineSnapped(positionsM: Float32Array): Float32Array {
  let snapped: Float32Array | null = null;
  for (let o = 0; o < positionsM.length; o += 3) {
    const x = positionsM[o];
    if (x !== 0 && Math.abs(x) < 0.00005) {
      snapped ??= Float32Array.from(positionsM);
      snapped[o] = 0;
    }
  }
  return snapped ?? positionsM;
}

const anchorTemplate = (id: string) =>
  SURFACE_ANCHOR_TABLE_V1.find((anchor) => anchor.id === id)?.template ?? null;

/**
 * What the product guide would get: `createMeshSurfaceTopologyV1` on the shaped body itself. The
 * topology module caches by triangle indices only, so in a live session the result depends on
 * whether any exactly symmetric HM08 mesh was built earlier. Recorded per run, never fatal here.
 */
function exactMirrorFailure(positionsM: Float32Array): string {
  const snapped = midlineSnapped(positionsM);
  const key = (x: number, y: number, z: number) => `${x === 0 ? 0 : x},${y},${z}`;
  const all = new Set<string>();
  for (let o = 0; o < snapped.length; o += 3) all.add(key(snapped[o], snapped[o + 1], snapped[o + 2]));
  let missing = 0;
  let first = -1;
  for (let o = 0; o < snapped.length; o += 3) {
    if (!all.has(key(-snapped[o], snapped[o + 1], snapped[o + 2]))) {
      missing += 1;
      if (first < 0) first = o / 3;
    }
  }
  return missing ? `no-exact-mirror:${missing}-vertices:first-${first}` : '';
}

/**
 * Same anchors and template points as measurement-surface-active-measurement-guide-v1.ts. The
 * topology (connectivity + mirror map, index-only) comes from the symmetric uniform display of the
 * same base, so anchors are available even when the shaped body is not bit-exact symmetric;
 * geodesics are traced on the shaped positions, as the guide does.
 */
function anchorsOf(mesh: MeasurementSurfaceMeshV1, symmetricMesh: MeasurementSurfaceMeshV1) {
  const created = createMeshSurfaceTopologyV1({
    positionsM: midlineSnapped(symmetricMesh.positions),
    triangleIndices: symmetricMesh.indices,
  });
  if (!created.ok) return null;
  const topology = created.topology;
  const ids = ['ssn', 'c7', 'hps-l', 'hps-r', 'underarm-l', 'crotch'] as const;
  const points: Record<string, MeshSurfacePointV1> = {};
  for (const id of ids) {
    const template = anchorTemplate(id);
    if (!template) return null;
    points[id] = template;
  }
  points['acromion-l'] = meshSurfaceVertexPointV1(8280);
  points['acromion-r'] = mirrorMeshSurfacePointV1(points['acromion-l'], topology);
  points['apex-l'] = meshSurfaceVertexPointV1(8454);
  points['apex-r'] = mirrorMeshSurfacePointV1(points['apex-l'], topology);
  const at = (id: string) => pointPosition(points[id], mesh.positions);
  const geodesicM = (start: string, end: string) => {
    const result = computeMeshSurfaceGeodesicV1({
      topology,
      positionsM: mesh.positions,
      triangleIndices: mesh.indices,
      start: points[start],
      end: points[end],
    });
    return result.ok ? result.geodesicLengthM : null;
  };
  let maxAsymmetryM = 0;
  for (let vertex = 0; vertex < topology.vertexCount; vertex += 1) {
    const a = vertex * 3;
    const b = topology.mirrorVertexMap[vertex] * 3;
    maxAsymmetryM = Math.max(
      maxAsymmetryM,
      Math.abs(mesh.positions[a] + mesh.positions[b]),
      Math.abs(mesh.positions[a + 1] - mesh.positions[b + 1]),
      Math.abs(mesh.positions[a + 2] - mesh.positions[b + 2]),
    );
  }
  return { at, geodesicM, maxAsymmetryM };
}

function limbStationCirc(
  mesh: MeasurementSurfaceMeshV1,
  modes: readonly OpenReferenceLimbCircumferenceModeV1[],
  key: string,
): { circMm: number | null; originM: Vec3 | null } {
  const mode = modes.find((candidate) => candidate.measurementKey === key);
  if (!mode) return { circMm: null, originM: null };
  try {
    const station = deriveOpenReferenceLimbSectionStationsV1({
      positionsM: mesh.positions,
      mode,
    }).find(({ side }) => side === 'positive');
    if (!station) return { circMm: null, originM: null };
    const origin = station.originM as Vec3;
    const loop = section(mesh, origin, station.normal as Vec3, origin);
    return { circMm: mm(loop?.perimeterM), originM: origin };
  } catch {
    return { circMm: null, originM: null };
  }
}

function measureBody(options: {
  mesh: MeasurementSurfaceMeshV1;
  beta: MeasurementOpenReferenceBetaShapeRuntimeResultV1 | null;
  waistHip: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  limbModes: readonly OpenReferenceLimbCircumferenceModeV1[];
  symmetricMesh: MeasurementSurfaceMeshV1;
  shoulderVertices: { negative: number; positive: number } | null;
}): AnsurMeasuredBody {
  const { mesh, beta, waistHip } = options;
  let maxY = -Infinity;
  let minY = Infinity;
  for (let o = 1; o < mesh.positions.length; o += 3) {
    maxY = Math.max(maxY, mesh.positions[o]);
    minY = Math.min(minY, mesh.positions[o]);
  }
  const floorY = Number.isFinite(minY) ? Math.min(0, minY) : 0;
  const anchors = anchorsOf(mesh, options.symmetricMesh);

  // Chest: the guide's plane (bust apex level, at least 3 cm under the underarm).
  const chestY = anchors
    ? Math.min((anchors.at('apex-l')[1] + anchors.at('apex-r')[1]) / 2, anchors.at('underarm-l')[1] - 0.03)
    : beta?.torsoSectionStations?.chest?.[1];
  const chestLoop = horizontal(mesh, chestY);
  const chestEngineLoop = horizontal(mesh, beta?.torsoSectionStations?.chest?.[1]);

  const stationOf = (key: 'waistCircumferenceMm' | 'hipCircumferenceMm') =>
    waistHip.sectionModes?.find(({ measurementKey }) => measurementKey === key)?.stationOriginM;
  const waistY =
    beta?.torsoSectionStations?.waist?.[1] ?? stationOf('waistCircumferenceMm')?.[1] ?? null;
  const hipY = beta?.torsoSectionStations?.hip?.[1] ?? stationOf('hipCircumferenceMm')?.[1] ?? null;
  const waistLoop = horizontal(mesh, waistY);
  const hipLoop = horizontal(mesh, hipY);

  const neckStation = beta?.neckSectionStation;
  const neckLoop = neckStation
    ? section(mesh, neckStation.originM as Vec3, neckStation.normal as Vec3, neckStation.originM as Vec3)
    : null;

  const modes = beta?.limbSectionModes?.length ? beta.limbSectionModes : options.limbModes;
  const wrist = limbStationCirc(mesh, modes, 'wristCircumferenceMm');

  let neckBaseM: number | null = null;
  let shoulderLengthM: number | null = null;
  if (anchors) {
    const back = anchors.geodesicM('c7', 'hps-l');
    const front = anchors.geodesicM('hps-l', 'ssn');
    // The guide mirrors the left half; the HM08 shaped body is left/right exact.
    neckBaseM = back != null && front != null ? 2 * (back + front) : null;
    shoulderLengthM = anchors.geodesicM('hps-l', 'acromion-l');
  }
  const height = (id: string) => (anchors ? (anchors.at(id)[1] - floorY) * 1000 : null);

  return {
    statureMm: Number.isFinite(maxY) ? (maxY - floorY) * 1000 : null,
    chestCircMm: mm(chestLoop?.perimeterM),
    chestCircEngineStationMm: mm(chestEngineLoop?.perimeterM),
    chestDepthMm: extent(chestLoop, 2),
    chestBreadthMm: extent(chestLoop, 0),
    waistCircMm: mm(waistLoop?.perimeterM),
    waistDepthMm: extent(waistLoop, 2),
    waistBreadthMm: extent(waistLoop, 0),
    waistHeightMm: waistY == null ? null : (waistY - floorY) * 1000,
    hipCircMm: mm(hipLoop?.perimeterM),
    hipDepthMm: extent(hipLoop, 2),
    hipBreadthMm: extent(hipLoop, 0),
    cervicaleHeightMm: height('c7'),
    acromialHeightMm: anchors
      ? ((anchors.at('acromion-l')[1] + anchors.at('acromion-r')[1]) / 2 - floorY) * 1000
      : null,
    crotchHeightMm: height('crotch'),
    shoulderBreadthMm: anchors
      ? distance(anchors.at('acromion-l'), anchors.at('acromion-r')) * 1000
      : null,
    shoulderLengthMm: mm(shoulderLengthM),
    neckCircMm: mm(neckLoop?.perimeterM),
    neckBaseCircMm: mm(neckBaseM),
    sleeveLengthMm:
      anchors && wrist.originM ? distance(anchors.at('acromion-l'), wrist.originM) * 1000 : null,
    wristCircMm: wrist.circMm,
    thighCircMm: limbStationCirc(mesh, modes, 'thighCircumferenceMm').circMm,
    calfCircMm: limbStationCirc(mesh, modes, 'calfCircumferenceMm').circMm,
    ankleCircMm: limbStationCirc(mesh, modes, 'ankleCircumferenceMm').circMm,
    chestGuideYMm: chestY == null ? null : (chestY - floorY) * 1000,
    chestEngineYMm:
      beta?.torsoSectionStations?.chest == null
        ? null
        : (beta.torsoSectionStations.chest[1] - floorY) * 1000,
    apexYMm: anchors ? ((anchors.at('apex-l')[1] + anchors.at('apex-r')[1]) / 2 - floorY) * 1000 : null,
    underarmYMm: anchors ? (anchors.at('underarm-l')[1] - floorY) * 1000 : null,
    chestEngineBreadthMm: extent(chestEngineLoop, 0),
    shoulderBreadthEngineMm: options.shoulderVertices
      ? distance(
          pointPosition(meshSurfaceVertexPointV1(options.shoulderVertices.negative), mesh.positions),
          pointPosition(meshSurfaceVertexPointV1(options.shoulderVertices.positive), mesh.positions),
        ) * 1000
      : null,
    chestEngineDepthMm: extent(chestEngineLoop, 2),
    maxAsymmetryMm: anchors ? anchors.maxAsymmetryM * 1000 : null,
  };
}

/** Plausibility of the produced body, independent of any ANSUR value. */
function implausibleChecks(body: AnsurMeasuredBody, heightMm: number): string[] {
  const out: string[] = [];
  const need: (keyof AnsurMeasuredBody)[] = [
    'statureMm',
    'chestCircMm',
    'waistCircMm',
    'hipCircMm',
    'cervicaleHeightMm',
    'crotchHeightMm',
    'shoulderBreadthMm',
  ];
  for (const key of need) if (body[key] == null) out.push(`missing:${key}`);
  if (body.statureMm != null && Math.abs(body.statureMm - heightMm) > 2) out.push('stature-off');
  const s = body.statureMm ?? heightMm;
  if (body.crotchHeightMm != null && (body.crotchHeightMm < 0.35 * s || body.crotchHeightMm > 0.56 * s))
    out.push('crotch-height');
  if (
    body.cervicaleHeightMm != null &&
    (body.cervicaleHeightMm < 0.78 * s || body.cervicaleHeightMm > 0.9 * s)
  )
    out.push('cervicale-height');
  if (
    body.waistCircMm != null &&
    body.chestCircMm != null &&
    body.hipCircMm != null &&
    (body.waistCircMm > 1.3 * body.chestCircMm || body.waistCircMm > 1.3 * body.hipCircMm)
  )
    out.push('waist-dominates');
  for (const key of ['chestDepthMm', 'waistDepthMm', 'hipDepthMm'] as const) {
    const depth = body[key];
    if (depth != null && (depth < 80 || depth > 600)) out.push(`depth:${key}`);
  }
  return out;
}

export async function runAnsurSubject(request: AnsurSubjectRequest): Promise<AnsurSubjectResult> {
  const startedAt = performance.now();
  const resolution = resolveModelOpenReferencePreviewInputV1({
    gender: request.gender,
    measurements: request.fields,
  });
  const basisKind = resolution.basis.basisKind as AnsurBasisKind;
  const adapterErrors = resolution.diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => `${diagnostic.code}:${diagnostic.canonicalKey ?? ''}`);
  const adapterWarnings = resolution.diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'error')
    .map((diagnostic) => `${diagnostic.code}:${diagnostic.canonicalKey ?? ''}`);
  const base = {
    basisKind,
    adapterErrors,
    adapterWarnings,
    applied: [] as string[],
    limited: [] as string[],
    notApplied: [] as string[],
    betaStatus: null,
    waistHipStatus: null,
    rollbacks: [] as string[],
    qualitySafe: null,
    qualityReasons: [] as string[],
    measured: null,
    implausible: [] as string[],
    anchorFailure: '',
  };
  const done = (fields: Partial<AnsurSubjectResult> & { outcome: string; message: string }) =>
    Object.freeze({ ...base, ...fields, elapsedMs: performance.now() - startedAt });
  if (!resolution.ok) {
    return done({ outcome: 'input-rejected', message: adapterErrors.join(' ') });
  }
  const measurements = resolution.measurements;
  const basis = await basisFor(basisKind);
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: request.sourceRevision,
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const proxy = await buildProxyRuntime({ basis, measurements, openReference });
  if (!proxy.runtime) {
    return done({ outcome: 'waist-hip-error', message: proxy.error });
  }

  // Exact copy of the preview's `buildModelOpenReferenceBetaShapeRuntimeV1` catch contract.
  let beta: MeasurementOpenReferenceBetaShapeRuntimeResultV1 | null = null;
  let betaError = '';
  try {
    beta = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      basis,
      measurements,
      waistHipRuntime: proxy.runtime,
    });
  } catch (reason: unknown) {
    if (reason instanceof MeasurementOpenReferenceBetaShapeSafetyErrorV1) {
      // The preview rethrows: the build fails and no body is shown.
      return done({
        outcome: 'safety-error',
        message: reason.message,
        waistHipStatus: proxy.runtime.status,
      });
    }
    betaError = reason instanceof Error ? reason.message : String(reason);
  }

  const fkProxyRuntime = beta?.fkProxyRuntime ?? proxy.runtime;
  const application = beta
    ? modelOpenReferenceMeasurementApplicationV1({
        measurements,
        rawMeasurements: request.fields,
        beta,
      })
    : null;
  limbBundlePromise ??= loadMakeHumanLimbCircumferenceDeltaBundleV1();
  const limbModes = createMakeHumanLimbCircumferenceUniformModesV1({
    basis,
    heightMm: measurements.heightMm,
    bundle: await limbBundlePromise,
  }).modes;
  const measured = measureBody({
    mesh: fkProxyRuntime.displayMesh,
    beta,
    waistHip: proxy.runtime,
    limbModes,
    symmetricMesh: openReference.mesh,
    shoulderVertices: await engineShoulderVertices(basisKind, basis, measurements.heightMm),
  });
  const quality = fkProxyRuntime.qualityGate;
  const rollbacks = [
    ...(beta?.chestShoulderDiagnostics ?? []).filter((code) => ROLLBACK_PATTERN.test(code)),
    ...fkProxyRuntime.diagnostics
      .filter(({ code }) => ROLLBACK_PATTERN.test(code))
      .map(({ code, measurementKey }) => `${measurementKey ?? 'waistHip'}:${code}`),
  ];
  return done({
    outcome: beta ? 'ok' : 'beta-throw',
    message: betaError,
    applied: application ? [...application.applied] : [],
    limited: application ? [...application.limitedBySafeRange] : [],
    notApplied: application ? [...application.notApplied] : [],
    betaStatus: beta?.status ?? null,
    waistHipStatus: proxy.runtime.status,
    rollbacks: [...new Set(rollbacks)],
    qualitySafe: quality ? quality.safe : null,
    qualityReasons: quality ? [...quality.reasons] : [],
    measured,
    implausible: implausibleChecks(measured, measurements.heightMm),
    anchorFailure: exactMirrorFailure(fkProxyRuntime.displayMesh.positions),
    neckCodes: (beta?.chestShoulderDiagnostics ?? []).filter((code) =>
      code.startsWith('neckCircumferenceMm:'),
    ),
  });
}
