import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2,
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  compileSimulationPackageV5,
  validateSimulationPackageV5,
  type CompileSimulationPackageV5Options,
  type SimulationPackageV5,
} from 'lib/cloth/compiler/simulation-package';

export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1 =
  'pattern-import-dxf-physical-cloth-package-adapter/1' as const;

export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_CLAIMS_V1 = Object.freeze({
  genuineGarmentMeshOwnerRequired: true,
  simulationPackageV5CompilerReused: true,
  exactMeshSeamsCompiled: true,
  explicitMaterialInputsRequired: true,
  bodyRelativeCandidateCreated: false,
  bodyRelativeArtifactCreated: false,
  physicalSolverExecuted: false,
  previewRendered: false,
  runtimeAuthorityGranted: false,
  productionReady: false,
  fakeStitchedResultAllowed: false,
} as const);

export type PatternImportDxfPhysicalClothExpectedSeamV1 = Readonly<{
  seamId: string;
  vertexPairCount: number;
}>;

/**
 * All expected values come from the caller-owned draft/composition receipt. They are checked
 * against a fresh projection of the opaque composer owner before compilation.
 */
export type PatternImportDxfPhysicalClothPackageRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1;
  expected: Readonly<{
    composerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    sourceAssemblyFingerprint: string;
    pieceIds: readonly string[];
    seams: readonly PatternImportDxfPhysicalClothExpectedSeamV1[];
  }>;
  compileOptions: CompileSimulationPackageV5Options;
}>;

export type PatternImportDxfPhysicalClothPackageBlockerCodeV1 =
  | 'invalid-input'
  | 'garment-mesh-owner-unavailable'
  | 'garment-mesh-owner-contract-drift'
  | 'composer-binding-mismatch'
  | 'mesh-binding-mismatch'
  | 'exact-seam-binding-mismatch'
  | 'simulation-package-v5-compilation-failed'
  | 'simulation-package-v5-validation-failed'
  | 'compiled-package-binding-mismatch';

export type PatternImportDxfPhysicalClothPackageBlockerV1 = Readonly<{
  code: PatternImportDxfPhysicalClothPackageBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhysicalClothBodyRelativeMissingInputV1 =
  | 'sealed-body-relative-run-initialization-for-exact-mesh'
  | 'current-body-artifact'
  | 'closed-tube-embedding-policy'
  | 'expected-closed-tube-fixture-tier'
  | 'body-relative-placement-admission';

export type PatternImportDxfPhysicalClothPackageCandidateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1;
  status: 'simulation-package-v5-candidate';
  readiness: 'compiled-unsealed-non-runnable';
  runnable: false;
  simulation: SimulationPackageV5;
  bindings: Readonly<{
    composerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    sourceAssemblyFingerprint: string;
    pieceIds: readonly string[];
    seams: readonly PatternImportDxfPhysicalClothExpectedSeamV1[];
    materialKeys: readonly string[];
    continuumMaterialKeys: readonly string[];
    particleCount: number;
    triangleCount: number;
    seamConstraintCount: number;
  }>;
  bodyRelativeAdmission: Readonly<{
    status: 'not-admitted';
    nextConstructor: 'buildBodyRelativeV5RunCandidateV1';
    acceptsThisPackageDirectly: false;
    reason: 'constructor-recompiles-sealed-fixture-mesh';
    missingInputs: readonly PatternImportDxfPhysicalClothBodyRelativeMissingInputV1[];
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_CLAIMS_V1;
}>;

export type PatternImportDxfPhysicalClothPackageAdapterResultV1 =
  | Readonly<{
      ok: true;
      candidate: PatternImportDxfPhysicalClothPackageCandidateV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      candidate: null;
      blockers: readonly [PatternImportDxfPhysicalClothPackageBlockerV1];
      claims: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_CLAIMS_V1;
    }>;

export type PatternImportDxfPhysicalClothPackageAdapterDependenciesV1 = Readonly<{
  /** Tests may inject the same narrow opaque-owner projection boundary. */
  projectGarmentMeshOwner?: (
    owner: unknown,
  ) => PatternImportDxfProductGarmentMeshComposerProjectionV2 | null;
}>;

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const MAX_PIECES = 1_024;
const MAX_SEAMS = 4_096;
export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1 = Object.freeze([
  'sealed-body-relative-run-initialization-for-exact-mesh',
  'current-body-artifact',
  'closed-tube-embedding-policy',
  'expected-closed-tube-fixture-tier',
  'body-relative-placement-admission',
] as const satisfies readonly PatternImportDxfPhysicalClothBodyRelativeMissingInputV1[]);

function blocked(
  code: PatternImportDxfPhysicalClothPackageBlockerCodeV1,
  detail: string,
): PatternImportDxfPhysicalClothPackageAdapterResultV1 {
  return Object.freeze({
    ok: false as const,
    candidate: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      PatternImportDxfPhysicalClothPackageBlockerV1,
    ],
    claims: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_CLAIMS_V1,
  });
}

function hasUniqueStableIds(values: readonly string[], maximum: number): boolean {
  return (
    values.length > 0 &&
    values.length <= maximum &&
    values.every((value) => STABLE_ID.test(value)) &&
    new Set(values).size === values.length
  );
}

function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function validRequest(value: unknown): value is PatternImportDxfPhysicalClothPackageRequestV1 {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<PatternImportDxfPhysicalClothPackageRequestV1>;
  const expected = request.expected;
  if (
    request.schemaVersion !== PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1 ||
    !expected ||
    typeof expected !== 'object' ||
    !SHA256_HEX.test(String(expected.composerCanonicalSha256)) ||
    !SHA256_HEX.test(String(expected.phase2ArtifactSha256)) ||
    typeof expected.sourceAssemblyFingerprint !== 'string' ||
    expected.sourceAssemblyFingerprint.length === 0 ||
    expected.sourceAssemblyFingerprint.length > 1_024 ||
    !Array.isArray(expected.pieceIds) ||
    !hasUniqueStableIds(expected.pieceIds, MAX_PIECES) ||
    !Array.isArray(expected.seams) ||
    expected.seams.length === 0 ||
    expected.seams.length > MAX_SEAMS ||
    !request.compileOptions ||
    typeof request.compileOptions !== 'object'
  )
    return false;

  const seamIds: string[] = [];
  for (const seam of expected.seams) {
    if (
      !seam ||
      typeof seam !== 'object' ||
      !STABLE_ID.test(String(seam.seamId)) ||
      !Number.isSafeInteger(seam.vertexPairCount) ||
      seam.vertexPairCount <= 0
    )
      return false;
    seamIds.push(seam.seamId);
  }
  return new Set(seamIds).size === seamIds.length;
}

function projectionContractIsCurrent(
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2,
): boolean {
  return (
    PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2.staticPreviewReady === false &&
    PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2.placementReady === false &&
    PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2.runtimeReady === false &&
    projection.callerOwnedMutableCopies === true &&
    projection.staticPreviewAuthority === false &&
    projection.placementAuthority === false &&
    projection.runtimeAuthority === false &&
    projection.productionAuthority === false
  );
}

function exactSeams(
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2,
): readonly PatternImportDxfPhysicalClothExpectedSeamV1[] | null {
  const seams: PatternImportDxfPhysicalClothExpectedSeamV1[] = [];
  const ids = new Set<string>();
  for (const seam of projection.mesh.seams) {
    if (
      !STABLE_ID.test(seam.seamId) ||
      ids.has(seam.seamId) ||
      seam.vertexPairs.length === 0 ||
      seam.vertexPairs.length % 2 !== 0
    )
      return null;
    ids.add(seam.seamId);
    seams.push(
      Object.freeze({ seamId: seam.seamId, vertexPairCount: seam.vertexPairs.length / 2 }),
    );
  }
  return Object.freeze(seams);
}

function errorDetail(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown SimulationPackageV5 compilation failure.';
}

/**
 * Compiles the caller-owned copy exposed by the genuine composer through the existing V5 compiler.
 * This function deliberately stops before body-relative admission: the current constructor accepts
 * a sealed V1 initialization and recompiles its fixture mesh; it cannot consume this package alone.
 */
export function createPatternImportDxfPhysicalClothPackageCandidateV1(
  value: unknown,
  garmentMeshOwner: unknown,
  dependencies: PatternImportDxfPhysicalClothPackageAdapterDependenciesV1 = {},
): PatternImportDxfPhysicalClothPackageAdapterResultV1 {
  if (!validRequest(value))
    return blocked('invalid-input', 'The physical-cloth package request is malformed.');
  const request = value;
  const projector =
    dependencies.projectGarmentMeshOwner ?? projectPatternImportDxfProductGarmentMeshComposerV2;
  let projection: PatternImportDxfProductGarmentMeshComposerProjectionV2 | null = null;
  try {
    projection = projector(garmentMeshOwner);
  } catch {
    projection = null;
  }
  if (!projection)
    return blocked(
      'garment-mesh-owner-unavailable',
      'A genuine, live garment-mesh-composer/2 owner is required.',
    );
  if (!projectionContractIsCurrent(projection))
    return blocked(
      'garment-mesh-owner-contract-drift',
      'The garment mesh projection authority contract has changed and must be re-admitted.',
    );
  if (
    projection.composerCanonicalSha256 !== request.expected.composerCanonicalSha256 ||
    projection.phase2ArtifactSha256 !== request.expected.phase2ArtifactSha256
  )
    return blocked(
      'composer-binding-mismatch',
      'Composer or Phase-2 artifact digest does not match the caller-owned draft receipt.',
    );

  const pieceIds = projection.mesh.pieceRanges.map((piece) => piece.pieceId);
  if (
    projection.mesh.sourceAssemblyFingerprint !== request.expected.sourceAssemblyFingerprint ||
    !exactStrings(pieceIds, request.expected.pieceIds)
  )
    return blocked(
      'mesh-binding-mismatch',
      'Source assembly fingerprint or exact ordered piece IDs do not match.',
    );
  const seams = exactSeams(projection);
  if (
    !seams ||
    seams.length !== request.expected.seams.length ||
    seams.some(
      (seam, index) =>
        seam.seamId !== request.expected.seams[index].seamId ||
        seam.vertexPairCount !== request.expected.seams[index].vertexPairCount,
    )
  )
    return blocked(
      'exact-seam-binding-mismatch',
      'Mesh seam IDs or exact distributed vertex-pair counts do not match the draft receipt.',
    );

  let simulation: SimulationPackageV5;
  try {
    simulation = compileSimulationPackageV5(projection.mesh, request.compileOptions);
  } catch (error) {
    return blocked('simulation-package-v5-compilation-failed', errorDetail(error));
  }
  const validationErrors = validateSimulationPackageV5(simulation);
  if (validationErrors.length > 0)
    return blocked(
      'simulation-package-v5-validation-failed',
      validationErrors.join(' ').slice(0, 2_048),
    );

  const compiledSeamIds = sorted(simulation.constraints.seam.seamIds);
  const expectedSeamIds = sorted(seams.map((seam) => seam.seamId));
  const materialKeys = Object.freeze([...simulation.material.materialKeys]);
  const continuumMaterialKeys = Object.freeze([
    ...simulation.constraints.continuumStrain.materialKeys,
  ]);
  if (
    simulation.manifest.sourceAssemblyFingerprint !== request.expected.sourceAssemblyFingerprint ||
    !exactStrings(compiledSeamIds, expectedSeamIds) ||
    !exactStrings(materialKeys, continuumMaterialKeys)
  )
    return blocked(
      'compiled-package-binding-mismatch',
      'The compiled package did not preserve exact assembly, seam or material-key continuity.',
    );

  const candidate: PatternImportDxfPhysicalClothPackageCandidateV1 = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1,
    status: 'simulation-package-v5-candidate' as const,
    readiness: 'compiled-unsealed-non-runnable' as const,
    runnable: false as const,
    simulation,
    bindings: Object.freeze({
      composerCanonicalSha256: projection.composerCanonicalSha256,
      phase2ArtifactSha256: projection.phase2ArtifactSha256,
      sourceAssemblyFingerprint: simulation.manifest.sourceAssemblyFingerprint,
      pieceIds: Object.freeze([...pieceIds]),
      seams,
      materialKeys,
      continuumMaterialKeys,
      particleCount: simulation.manifest.particleCount,
      triangleCount: simulation.manifest.triangleCount,
      seamConstraintCount: simulation.manifest.seamConstraintCount,
    }),
    bodyRelativeAdmission: Object.freeze({
      status: 'not-admitted' as const,
      nextConstructor: 'buildBodyRelativeV5RunCandidateV1' as const,
      acceptsThisPackageDirectly: false as const,
      reason: 'constructor-recompiles-sealed-fixture-mesh' as const,
      missingInputs: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_BODY_RELATIVE_MISSING_INPUTS_V1,
    }),
    claims: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_CLAIMS_V1,
  });
  return Object.freeze({
    ok: true as const,
    candidate,
    blockers: Object.freeze([]) as readonly [],
  });
}
