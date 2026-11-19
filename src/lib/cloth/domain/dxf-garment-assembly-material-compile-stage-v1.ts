import { compileDxfAssemblyHandoffV1, type DxfAssemblyHandoffV1 } from './dxf-assembly-handoff-v1';
import { createCdt2dConstrainedTriangulatorV1 } from '../mesh/triangulation/cdt2d-adapter-v1';
import {
  samplePhase2BoundariesV1,
  type Phase2BoundarySamplingRequestV1,
} from '../mesh/triangulation/phase2-boundary-sampling-v1';
import {
  compileGarmentPhase1ClothMeshV1,
  GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1,
  type GarmentPhase1SeamProofV1,
} from '../mesh/garment-phase1-cloth-mesh-compiler-v1';
import {
  upgradeGarmentPhase2SampledClothMeshV1,
  GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1,
} from '../mesh/garment-phase2-sampled-cloth-mesh-upgrader-v1';
import {
  createGarmentPhase2BoundaryRecoveryRequestV1,
  recoverGarmentPhase2BoundariesV1,
  GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1,
  type GarmentBoundaryMeshPolicyV1,
} from '../mesh/garment-phase2-boundary-recovery-v1';
import {
  createGarmentPhase2InteriorRefinementRequestV1,
  refineGarmentPhase2InteriorV1,
  evaluateGarmentPhase2InteriorRefinementArtifactV1,
  GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1,
} from '../mesh/garment-phase2-interior-refinement-v1';
import {
  compileSimulationPackageV5,
  type CompileSimulationPackageV5Options,
} from '../compiler/simulation-package';
import { sealSimulationPackageV5V1 } from '../compiler/simulation-package-v5-integrity';

export const DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1 =
  'dxf-garment-assembly-material-compile-stage/1' as const;

/** Plain compiler inputs, NOT a saved-row, reader, topology or runtime capability. */
export type DxfGarmentAssemblyMaterialCompileStageRequestV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1;
  handoff: DxfAssemblyHandoffV1;
  samplingRequest: Phase2BoundarySamplingRequestV1;
  exactSeamToleranceMm: number;
  materialPolicy: GarmentBoundaryMeshPolicyV1;
  materials: CompileSimulationPackageV5Options['materials'];
  continuumMaterials: CompileSimulationPackageV5Options['continuumMaterials'];
  materialSolver: CompileSimulationPackageV5Options['materialSolver'];
}>;

const CLAIMS = Object.freeze({
  contentConsistencyOnly: true,
  nativeEdgeDescriptorsAuthenticated: false,
  savedRowFreshnessAuthenticated: false,
  sourceAuthenticityAccepted: false,
  productAuthority: false,
  runtimeAuthority: false,
  bodyPlacementReady: false,
  assemblyOperationScheduleExecuted: false,
  supportAttachmentPolicy: 'none',
  productionReady: false,
} as const);

type Stage =
  | 'capture'
  | 'handoff'
  | 'binding'
  | 'phase1'
  | 'sampling'
  | 'recovery'
  | 'refinement'
  | 'material'
  | 'seal';
class CompileBlocked extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new CompileBlocked(code, detail);
}

// Capture every caller-owned value before the first digest await. No getters, iterators or
// typed buffers belong in this DTO contract. The downstream compiler owns its output buffers.
function capture(input: unknown): unknown {
  let nodes = 0;
  const active = new Set<object>();
  function copy(value: unknown, depth: number): unknown {
    if (++nodes > 500_000 || depth > 32)
      fail('input-bound-exceeded', 'Input exceeds the compile snapshot bound.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length <= 4096) return value;
    if (!value || typeof value !== 'object' || active.has(value))
      fail('invalid-input', 'Only acyclic plain finite data is accepted.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', 'Input must contain only plain records and arrays.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string'))
      fail('invalid-input', 'Symbol fields are unsupported.');
    active.add(value);
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    if (
      array &&
      (descriptors.length.value > 100_000 ||
        Object.keys(descriptors).length !== descriptors.length.value + 1)
    )
      fail('invalid-input', 'Arrays must be bounded and dense.');
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (
        !('value' in descriptor) ||
        !descriptor.enumerable ||
        key === '__proto__' ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail(
          'invalid-input',
          'Accessors, hidden fields and extra array properties are unsupported.',
        );
      Object.defineProperty(out, key, {
        value: copy(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(value);
    return out;
  }
  return copy(input, 0);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}
function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function freezeData<T>(value: T): T {
  if (
    value &&
    typeof value === 'object' &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof ArrayBuffer)
  ) {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function check(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    fail('aborted', 'Compile was cancelled; no artifact is published.');
}

function bind(
  request: DxfGarmentAssemblyMaterialCompileStageRequestV1,
): readonly GarmentPhase1SeamProofV1[] {
  const { handoff, samplingRequest: sampling } = request;
  if (handoff.pieces.length > 64 || handoff.seams.length > 512)
    fail('profile-bound-exceeded', 'This compiler stage supports at most 64 pieces and 512 seams.');
  if (handoff.pieces.some((piece) => piece.cutCount !== 1))
    fail(
      'unsupported-cut-count',
      'Each exact piece ID must denote one explicit instance; cutCount expansion is not implemented.',
    );
  if (handoff.operations.some((operation) => operation.kind !== 'stitch'))
    fail(
      'unsupported-operation',
      'Only explicit stitch operations are compiled; place/release/nonstitch execution is not implemented.',
    );
  if (handoff.physicalSurface.mode !== 'sewing-surface')
    fail('unsupported-physical-surface', 'Explicit sewing boundaries are required.');
  if (
    !Number.isFinite(request.exactSeamToleranceMm) ||
    request.exactSeamToleranceMm < 0 ||
    request.exactSeamToleranceMm > GARMENT_PHASE1_MAX_EXACT_SEAM_TOLERANCE_MM_V1
  )
    fail('invalid-seam-tolerance', 'Exact seam tolerance exceeds the existing Phase-1 contract.');
  if (
    sampling.pieces.length !== handoff.pieces.length ||
    new Set(sampling.pieces.map(({ input }) => input.pieceId)).size !== sampling.pieces.length
  )
    fail('piece-binding-mismatch', 'Sampling pieces must exactly cover the sealed handoff.');
  const edges = new Map<
    string,
    Phase2BoundarySamplingRequestV1['pieces'][number]['edges'][number]
  >();
  for (const piece of handoff.pieces) {
    const sample = sampling.pieces.find(({ input }) => input.pieceId === piece.id);
    if (!sample) fail('piece-binding-mismatch', `Missing piece ${piece.id}.`);
    const rings = [sample.input.shell, ...sample.input.holes];
    if (sample.input.grainDegrees !== piece.grainDegrees || rings.length !== piece.contours.length)
      fail('piece-binding-mismatch', `Grain or contour set differs for ${piece.id}.`);
    let edgeCount = 0;
    for (const contour of piece.contours) {
      const ring = rings.find(({ id }) => id === contour.id);
      const expected = contour.vertices.map((vertex) => ({
        id: vertex.id,
        positionMm: vertex.positionMm,
        source: {
          contourId: contour.id,
          sourceCurveId: vertex.source.sourceCurveId,
          sourceCurveParameterSpace: vertex.source.parameterSpace,
          sourceCurveT: vertex.source.sourceCurveT,
          normalizedArc: vertex.source.normalizedArc,
        },
      }));
      if (
        !ring ||
        ring.role !== (contour.role === 'hole' ? 'hole' : 'shell') ||
        !same(ring.vertices, expected)
      )
        fail(
          'boundary-binding-mismatch',
          `${piece.id}/${contour.id} differs from exact handoff positions or source provenance.`,
        );
      contour.vertices.forEach((vertex, index) => {
        const matching = sample.edges.filter(
          (edge) => edge.ringId === contour.id && edge.edgeIndex === index,
        );
        if (matching.length !== 1)
          fail(
            'native-edge-binding-mismatch',
            'Every explicit contour edge requires exactly one native descriptor.',
          );
        const edge = matching[0];
        if (
          edge.pieceId !== piece.id ||
          edge.startBoundaryVertexId !== vertex.id ||
          edge.endBoundaryVertexId !== contour.vertices[(index + 1) % contour.vertices.length].id ||
          edge.native.sourceFileId !== sampling.sourceFileId ||
          edge.native.sourceCurveId !== vertex.source.sourceCurveId ||
          edge.native.parameterSpace !== vertex.source.parameterSpace ||
          edge.native.sourceCurveTRange[0] !== vertex.source.sourceCurveT ||
          edges.has(edge.edgeId)
        )
          fail(
            'native-edge-binding-mismatch',
            'Native edge identity, source curve or parameter differs from the sealed boundary.',
          );
        edges.set(edge.edgeId, edge);
        edgeCount++;
      });
    }
    if (edgeCount !== sample.edges.length)
      fail('native-edge-binding-mismatch', 'Extra native edge descriptors are not accepted.');
    const endpoints = handoff.seams.flatMap((seam) =>
      seam.sides.flatMap((side, sideIndex) =>
        side.pieceId === piece.id
          ? side.anchors.map((boundaryVertexId, anchorIndex) => ({
              id: `${seam.id}/side-${sideIndex}/anchor-${anchorIndex}`,
              boundaryVertexId,
            }))
          : [],
      ),
    );
    if (!same(sample.input.seamEndpoints, endpoints))
      fail(
        'endpoint-binding-mismatch',
        'Seam endpoints must retain exact operation-side anchor IDs and order.',
      );
  }
  if (
    sampling.equalSeams.length !== handoff.seams.length ||
    new Set(sampling.equalSeams.map(({ seamId }) => seamId)).size !== handoff.seams.length
  )
    fail('seam-binding-mismatch', 'Sampling seams must exactly cover all authored seams.');
  const used = new Set<string>();
  return handoff.seams.map((seam): GarmentPhase1SeamProofV1 => {
    if (seam.mapping !== 'equal' || seam.lengthRatio !== 1)
      fail(
        'unsupported-seam-mapping',
        `${seam.id}: eased/gathered/non-unit seams are not implemented.`,
      );
    if (seam.sides.length !== 2 || seam.sides[0].pieceId === seam.sides[1].pieceId)
      fail(
        'unsupported-seam-arity',
        `${seam.id}: two explicit distinct-piece sides are required; missing or same-piece partners are not inferred.`,
      );
    const sampled = sampling.equalSeams.find(({ seamId }) => seamId === seam.id);
    if (
      !sampled ||
      sampled.mapping !== 'equal' ||
      sampled.lengthRatio !== 1 ||
      sampled.exactToleranceMm !== request.exactSeamToleranceMm ||
      sampled.sides.length !== 2
    )
      fail('seam-binding-mismatch', `${seam.id}: sampling seam policy differs.`);
    const sides = seam.sides.map((side, sideIndex) => {
      const piece = handoff.pieces.find(({ id }) => id === side.pieceId)!;
      const contour = piece.contours.find(({ id }) => id === side.contourId)!;
      const index = contour.vertices.findIndex(({ id }) => id === side.anchors[0]);
      if (
        index < 0 ||
        side.anchors.length !== 2 ||
        contour.vertices[(index + 1) % contour.vertices.length].id !== side.anchors[1]
      )
        fail(
          'unsupported-seam-span',
          `${seam.id}: only explicit adjacent native edges in contour order are currently supported.`,
        );
      const selected = sampled.sides[sideIndex];
      const edge = edges.get(selected.edgeId);
      if (
        !edge ||
        selected.pieceId !== side.pieceId ||
        selected.direction !== side.direction ||
        edge.pieceId !== side.pieceId ||
        edge.ringId !== side.contourId ||
        edge.startBoundaryVertexId !== side.anchors[0] ||
        edge.endBoundaryVertexId !== side.anchors[1]
      )
        fail(
          'seam-binding-mismatch',
          `${seam.id}/side-${sideIndex}: exact edge/side/direction binding differs.`,
        );
      if (used.has(edge.edgeId))
        fail(
          'reused-seam-span',
          'A native boundary span cannot belong to two simultaneous stitches.',
        );
      used.add(edge.edgeId);
      const start = side.direction === 'forward' ? 0 : 1;
      const a = contour.vertices[index].positionMm;
      const b = contour.vertices[(index + 1) % contour.vertices.length].positionMm;
      return {
        sideIndex: sideIndex as 0 | 1,
        pieceId: side.pieceId,
        contourId: side.contourId,
        sourceCurveId: edge.native.sourceCurveId,
        direction: side.direction,
        startBoundaryVertexId: side.anchors[start],
        endBoundaryVertexId: side.anchors[1 - start],
        startEndpointId: `${seam.id}/side-${sideIndex}/anchor-${start}`,
        endEndpointId: `${seam.id}/side-${sideIndex}/anchor-${1 - start}`,
        expectedLengthMm: Math.hypot(b[0] - a[0], b[1] - a[1]),
      };
    }) as unknown as GarmentPhase1SeamProofV1['sides'];
    return {
      seamId: seam.id,
      operationId: seam.operationId,
      mapping: 'equal',
      lengthRatio: 1,
      exactToleranceMm: request.exactSeamToleranceMm,
      sides,
    };
  });
}

/** Executes the existing generic compiler chain. This historical artifact authenticates no host. */
export async function compileDxfGarmentAssemblyMaterialStageV1(
  input: unknown,
  signal?: AbortSignal,
) {
  let stage: Stage = 'capture';
  try {
    check(signal);
    const request = capture(input) as DxfGarmentAssemblyMaterialCompileStageRequestV1;
    if (
      !request ||
      !same(
        Object.keys(request).sort(),
        [
          'schemaVersion',
          'handoff',
          'samplingRequest',
          'exactSeamToleranceMm',
          'materialPolicy',
          'materials',
          'continuumMaterials',
          'materialSolver',
        ].sort(),
      ) ||
      request.schemaVersion !== DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1
    )
      fail('invalid-input', 'Compile request must have the exact versioned fields.');
    stage = 'handoff';
    const compiled = await compileDxfAssemblyHandoffV1(request.handoff);
    check(signal);
    if (!compiled.ok) fail(`handoff-${compiled.code}`, compiled.errors.join('; '));
    stage = 'binding';
    const seamProofs = bind(request);
    stage = 'phase1';
    const cdt = createCdt2dConstrainedTriangulatorV1();
    const baselineRequest = {
      assembly: compiled.assembly,
      pieces: request.samplingRequest.pieces.map(({ input: piece }) => ({
        pieceId: piece.pieceId,
        result: cdt.triangulate(piece),
      })),
      seamProofs,
    };
    const phase1 = compileGarmentPhase1ClothMeshV1(baselineRequest);
    stage = 'sampling';
    const samplingArtifact = samplePhase2BoundariesV1(request.samplingRequest);
    const phase2UpgradeRequest = {
      baselineRequest,
      samplingRequest: request.samplingRequest,
      samplingArtifact,
      sourceIdentityBinding: {
        schemaVersion: GARMENT_PHASE2_SOURCE_IDENTITY_BINDING_V1,
        assemblyDocumentId: compiled.assembly.source.documentId,
        nativeSamplingSourceFileId: request.samplingRequest.sourceFileId,
      },
    };
    const phase2 = upgradeGarmentPhase2SampledClothMeshV1(phase2UpgradeRequest);
    stage = 'recovery';
    const recoveryRequest = createGarmentPhase2BoundaryRecoveryRequestV1({
      version: GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1,
      phase2UpgradeRequest,
      phase2Artifact: phase2,
      materialPolicy: request.materialPolicy,
    });
    const recovery = recoverGarmentPhase2BoundariesV1(recoveryRequest);
    stage = 'refinement';
    const refinementRequest = createGarmentPhase2InteriorRefinementRequestV1({
      version: GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1,
      boundaryRecoveryRequest: recoveryRequest,
      boundaryRecoveryArtifact: recovery,
    });
    const refined = refineGarmentPhase2InteriorV1(refinementRequest);
    const refinement = evaluateGarmentPhase2InteriorRefinementArtifactV1(
      refinementRequest,
      refined,
    ).canonicalArtifact;
    check(signal);
    stage = 'material';
    const simulation = compileSimulationPackageV5(refinement.mesh, {
      materials: request.materials,
      continuumMaterials: request.continuumMaterials,
      materialSolver: request.materialSolver,
      materialAssignments: compiled.assembly.materials,
      pieceGrains: compiled.assembly.pieces.map(({ id: pieceId, grainDegrees }) => ({
        pieceId,
        grainDegrees,
      })),
    });
    stage = 'seal';
    const sealed = await sealSimulationPackageV5V1(simulation);
    check(signal);
    const inputDigest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          `${DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1}\0${canonical(request)}`,
        ),
      ),
    );
    check(signal);
    const artifact = {
      schemaVersion: DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1,
      assembly: compiled.assembly,
      phase1,
      phase2,
      refinement,
      compiledSimulation: simulation,
      sourceEvidence: {
        inputSha256: Array.from(inputDigest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        handoff: request.handoff,
        samplingRequest: request.samplingRequest,
        materialPolicy: request.materialPolicy,
        materials: request.materials,
        continuumMaterials: request.continuumMaterials,
        materialSolver: request.materialSolver,
      },
      claims: CLAIMS,
    };
    // A laid-out DXF can compile to material constraints while its unplaced rest seams are
    // deliberately ineligible for the existing all-at-once V5 seal. Preserve real output,
    // without changing rest coordinates or treating compile completion as runtime admission.
    if (!sealed.ok)
      return freezeData({
        ok: false as const,
        compiled: true as const,
        sealed: false as const,
        artifact: { ...artifact, sealedSimulation: null },
        blockers: [{ stage, code: `package-${sealed.code}`, detail: sealed.errors.join('; ') }],
        claims: CLAIMS,
      });
    return freezeData({
      ok: true as const,
      compiled: true as const,
      sealed: true as const,
      artifact: { ...artifact, sealedSimulation: sealed.artifact },
      blockers: [] as const,
      claims: CLAIMS,
    });
  } catch (error) {
    return freezeData({
      ok: false as const,
      compiled: false as const,
      sealed: false as const,
      artifact: null,
      blockers: [
        {
          stage,
          code: error instanceof CompileBlocked ? error.code : 'compiler-rejected',
          detail: error instanceof Error ? error.message : 'Compiler rejected input.',
        },
      ],
      claims: CLAIMS,
    });
  }
}
export type DxfGarmentAssemblyMaterialCompileStageResultV1 = Awaited<
  ReturnType<typeof compileDxfGarmentAssemblyMaterialStageV1>
>;
