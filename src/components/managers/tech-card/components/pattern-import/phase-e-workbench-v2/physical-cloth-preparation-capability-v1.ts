import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';

import {
  PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1,
  type PatternImportDxfPhysicalClothPackageRequestV1,
} from './physical-cloth-package-adapter-v1';

export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_V1 =
  'pattern-import-dxf-physical-cloth-preparation-capability/1' as const;

export const PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_CLAIMS_V1 = Object.freeze({
  genuineGarmentMeshOwnerRequired: true,
  prebuiltExactV5RequestRequired: true,
  syntheticRequestCreated: false,
  materialValuesInferred: false,
  secondOwnerCreated: false,
  packageCompiled: false,
  solverExecuted: false,
  previewAuthorityGranted: false,
} as const);

export type PatternImportDxfPhysicalClothPreparationOwnerOutputV1 = Readonly<{
  garmentMeshOwner: unknown;
  exactV5Request: PatternImportDxfPhysicalClothPackageRequestV1;
}>;

export type PatternImportDxfPhysicalClothPreparationCapabilityInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_V1;
  current: Readonly<{
    techCardId: number | null;
    selectedOperationNumber: number;
  }>;
  /** Must come from one already-existing owner. Omission is reported, never synthesized. */
  ownerOutput?: Partial<PatternImportDxfPhysicalClothPreparationOwnerOutputV1> | null;
}>;

export type PatternImportDxfPhysicalClothPreparationMissingOutputV1 =
  | 'current-tech-card-identity'
  | 'current-selected-operation-identity'
  | 'genuine-garment-mesh-composer-v2-owner'
  | 'garment-mesh-owner-current-card-operation-binding'
  | 'prebuilt-simulation-package-v5-request'
  | 'composer-and-phase2-digest-binding'
  | 'source-assembly-fingerprint-binding'
  | 'exact-piece-and-seam-binding'
  | 'cloth-material-catalog'
  | 'material-assignments'
  | 'piece-grains'
  | 'material-solver-policy'
  | 'continuum-material-catalog';

export type PatternImportDxfPhysicalClothPreparationCapabilityBlockerV1 = Readonly<{
  code:
    | 'current-card-binding-unavailable'
    | 'garment-mesh-owner-unavailable'
    | 'garment-mesh-owner-binding-mismatch'
    | 'exact-v5-request-unavailable'
    | 'exact-v5-request-incomplete'
    | 'owner-request-binding-mismatch';
  detail: string;
  missingOwnerOutputs: readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[];
}>;

export type PatternImportDxfPhysicalClothPreparationCapabilityResultV1 =
  | Readonly<{
      ok: true;
      status: 'available';
      physicalClothPreparation: PatternImportDxfPhysicalClothPreparationOwnerOutputV1;
      missingOwnerOutputs: readonly [];
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      physicalClothPreparation: null;
      missingOwnerOutputs: readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[];
      blockers: readonly PatternImportDxfPhysicalClothPreparationCapabilityBlockerV1[];
      claims: typeof PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_CLAIMS_V1;
    }>;

export type PatternImportDxfPhysicalClothPreparationCapabilityDependenciesV1 = Readonly<{
  projectGarmentMeshOwner?: (
    owner: unknown,
  ) => PatternImportDxfProductGarmentMeshComposerProjectionV2 | null;
}>;

const REQUEST_OUTPUTS = Object.freeze([
  'prebuilt-simulation-package-v5-request',
  'composer-and-phase2-digest-binding',
  'source-assembly-fingerprint-binding',
  'exact-piece-and-seam-binding',
  'cloth-material-catalog',
  'material-assignments',
  'piece-grains',
  'material-solver-policy',
  'continuum-material-catalog',
] as const satisfies readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[]);

function unique(
  values: readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[],
): readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[] {
  return Object.freeze([...new Set(values)]);
}

function blocked(
  code: PatternImportDxfPhysicalClothPreparationCapabilityBlockerV1['code'],
  detail: string,
  missingOwnerOutputs: readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[],
): PatternImportDxfPhysicalClothPreparationCapabilityResultV1 {
  const missing = unique(missingOwnerOutputs);
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    physicalClothPreparation: null,
    missingOwnerOutputs: missing,
    blockers: Object.freeze([Object.freeze({ code, detail, missingOwnerOutputs: missing })]),
    claims: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_CLAIMS_V1,
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requestMissingOutputs(
  request: PatternImportDxfPhysicalClothPackageRequestV1,
): readonly PatternImportDxfPhysicalClothPreparationMissingOutputV1[] {
  const missing: PatternImportDxfPhysicalClothPreparationMissingOutputV1[] = [];
  if (
    request.schemaVersion !== PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PACKAGE_ADAPTER_V1 ||
    !request.expected.composerCanonicalSha256 ||
    !request.expected.phase2ArtifactSha256
  )
    missing.push('composer-and-phase2-digest-binding');
  if (!request.expected.sourceAssemblyFingerprint)
    missing.push('source-assembly-fingerprint-binding');
  if (!request.expected.pieceIds.length || !request.expected.seams.length)
    missing.push('exact-piece-and-seam-binding');
  if (!request.compileOptions.materials.length) missing.push('cloth-material-catalog');
  if (!request.compileOptions.materialAssignments.length) missing.push('material-assignments');
  if (!request.compileOptions.pieceGrains.length) missing.push('piece-grains');
  if (!request.compileOptions.materialSolver) missing.push('material-solver-policy');
  if (!request.compileOptions.continuumMaterials.length) missing.push('continuum-material-catalog');
  return unique(missing);
}

function ownerRequestMatches(
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  request: PatternImportDxfPhysicalClothPackageRequestV1,
): boolean {
  const meshPieceIds = projection.mesh.pieceRanges.map((piece) => piece.pieceId);
  const meshSeams = projection.mesh.seams.map((seam) => ({
    seamId: seam.seamId,
    vertexPairCount: seam.vertexPairs.length / 2,
  }));
  return (
    request.expected.composerCanonicalSha256 === projection.composerCanonicalSha256 &&
    request.expected.phase2ArtifactSha256 === projection.phase2ArtifactSha256 &&
    request.expected.sourceAssemblyFingerprint === projection.mesh.sourceAssemblyFingerprint &&
    sameStrings(request.expected.pieceIds, meshPieceIds) &&
    request.expected.seams.length === meshSeams.length &&
    request.expected.seams.every(
      (seam, index) =>
        seam.seamId === meshSeams[index].seamId &&
        seam.vertexPairCount === meshSeams[index].vertexPairCount,
    )
  );
}

/**
 * Resolves an already-existing owner output into the UI adapter capability. It projects the opaque
 * owner and checks bindings, but deliberately neither constructs a request nor compiles a package.
 */
export function resolvePatternImportDxfPhysicalClothPreparationCapabilityV1(
  input: PatternImportDxfPhysicalClothPreparationCapabilityInputV1,
  dependencies: PatternImportDxfPhysicalClothPreparationCapabilityDependenciesV1 = {},
): PatternImportDxfPhysicalClothPreparationCapabilityResultV1 {
  const identityGaps: PatternImportDxfPhysicalClothPreparationMissingOutputV1[] = [];
  if (!Number.isSafeInteger(input.current.techCardId) || (input.current.techCardId ?? 0) <= 0)
    identityGaps.push('current-tech-card-identity');
  if (
    !Number.isSafeInteger(input.current.selectedOperationNumber) ||
    input.current.selectedOperationNumber <= 0
  )
    identityGaps.push('current-selected-operation-identity');
  if (identityGaps.length)
    return blocked(
      'current-card-binding-unavailable',
      'The current TechCard and selected Assembly operation identity are required.',
      identityGaps,
    );

  const output = input.ownerOutput;
  if (!output?.garmentMeshOwner)
    return blocked(
      'garment-mesh-owner-unavailable',
      'The TechCard preparation owner does not expose a genuine garment-mesh-composer/2 owner.',
      [
        'genuine-garment-mesh-composer-v2-owner',
        'garment-mesh-owner-current-card-operation-binding',
        ...(output?.exactV5Request ? [] : REQUEST_OUTPUTS),
      ],
    );

  const projector =
    dependencies.projectGarmentMeshOwner ?? projectPatternImportDxfProductGarmentMeshComposerV2;
  let projection: PatternImportDxfProductGarmentMeshComposerProjectionV2 | null = null;
  try {
    projection = projector(output.garmentMeshOwner);
  } catch {
    projection = null;
  }
  if (!projection)
    return blocked(
      'garment-mesh-owner-unavailable',
      'The supplied garment mesh value is not a live opaque garment-mesh-composer/2 owner.',
      ['genuine-garment-mesh-composer-v2-owner'],
    );

  const publicOwner = output.garmentMeshOwner as PatternImportDxfProductGarmentMeshComposerOwnerV2;
  if (
    publicOwner.snapshot.row.techCardId !== input.current.techCardId ||
    publicOwner.snapshot.assembly.sourceOperationNumber !== input.current.selectedOperationNumber
  )
    return blocked(
      'garment-mesh-owner-binding-mismatch',
      'The genuine garment mesh owner belongs to another TechCard or Assembly operation.',
      ['garment-mesh-owner-current-card-operation-binding'],
    );

  if (!output.exactV5Request)
    return blocked(
      'exact-v5-request-unavailable',
      'The same owner path does not expose a prebuilt exact SimulationPackageV5 request.',
      REQUEST_OUTPUTS,
    );
  const requestGaps = requestMissingOutputs(output.exactV5Request);
  if (requestGaps.length)
    return blocked(
      'exact-v5-request-incomplete',
      'The prebuilt V5 request is missing exact material, grain, continuum or source bindings.',
      requestGaps,
    );
  if (!ownerRequestMatches(projection, output.exactV5Request))
    return blocked(
      'owner-request-binding-mismatch',
      'The prebuilt V5 request does not match the genuine garment mesh owner projection.',
      [
        'composer-and-phase2-digest-binding',
        'source-assembly-fingerprint-binding',
        'exact-piece-and-seam-binding',
      ],
    );

  return Object.freeze({
    ok: true as const,
    status: 'available' as const,
    physicalClothPreparation: Object.freeze({
      garmentMeshOwner: output.garmentMeshOwner,
      exactV5Request: output.exactV5Request,
    }),
    missingOwnerOutputs: Object.freeze([]) as readonly [],
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PHYSICAL_CLOTH_PREPARATION_CAPABILITY_CLAIMS_V1,
  });
}
