import {
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
} from '../../pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1,
  buildPatternImportDxfProductGarmentMeshNativeIngressV1,
  type PatternImportDxfProductGarmentMeshNativeIngressReportV1,
} from './pattern-import-dxf-product-garment-mesh-native-ingress-v1';
import type { PatternImportDxfProductGarmentMeshComposerRequestV2 } from './pattern-import-dxf-product-garment-mesh-composer-v2';
import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
  type PatternImportDxfProductMultiseamSavedRowEvidenceV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1 =
  'pattern-import-dxf-product-saved-garment-mesh-ingress-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1 =
  'pattern-import-dxf-product-saved-garment-mesh-ingress/1' as const;

const MAXIMUM_TARGET_EDGE_MM = 1_000;

export type PatternImportDxfProductSavedGarmentMeshIngressRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1;
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  targetEdgeMm: number;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1 = Object.freeze({
  savedSourceOwnerConsumedOnce: true,
  savedDraftIdentityBound: true,
  savedRowCommonIdentityBound: true,
  compositionFreshRebuilt: true,
  tableCompositionRequestReused: true,
  callerSuppliedCompositionResultTrusted: false,
  secondTopologyAuthorityCreated: false,
  existingCompositionResultObjectReused: false,
  rawDxfReturned: false,
  rawDxfRetained: false,
  physicalPackageCompiled: false,
  solverRuntimeImported: false,
  productionReady: false,
} as const);

type SavedGarmentMeshIngressClaimsV1 = Readonly<{
  savedSourceOwnerConsumedOnce: boolean;
  savedDraftIdentityBound: boolean;
  savedRowCommonIdentityBound: boolean;
  compositionFreshRebuilt: boolean;
  tableCompositionRequestReused: boolean;
  callerSuppliedCompositionResultTrusted: false;
  secondTopologyAuthorityCreated: false;
  existingCompositionResultObjectReused: false;
  rawDxfReturned: false;
  rawDxfRetained: false;
  physicalPackageCompiled: false;
  solverRuntimeImported: false;
  productionReady: false;
}>;

export type PatternImportDxfProductSavedGarmentMeshIngressResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1;
      request: PatternImportDxfProductGarmentMeshComposerRequestV2;
      /** Present on production ingress; injected test ingress cannot authenticate a saved row. */
      sourceRow?: DxfProductSavedRowIdentityV1;
      report: PatternImportDxfProductGarmentMeshNativeIngressReportV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1;
      request: null;
      report: null;
      blockers: readonly [
        Readonly<{
          code:
            | 'invalid-input'
            | 'saved-row-binding-mismatch'
            | 'saved-source-owner-blocked'
            | 'native-ingress-blocked';
          detail: string;
        }>,
      ];
      claims: SavedGarmentMeshIngressClaimsV1;
    }>;

function blocked(
  code: Extract<
    PatternImportDxfProductSavedGarmentMeshIngressResultV1,
    { ok: false }
  >['blockers'][0]['code'],
  detail: string,
  progress: Partial<SavedGarmentMeshIngressClaimsV1> = {},
): PatternImportDxfProductSavedGarmentMeshIngressResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
    request: null,
    report: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
    claims: Object.freeze({
      savedSourceOwnerConsumedOnce: false,
      savedDraftIdentityBound: false,
      savedRowCommonIdentityBound: false,
      compositionFreshRebuilt: false,
      tableCompositionRequestReused: false,
      callerSuppliedCompositionResultTrusted: false as const,
      secondTopologyAuthorityCreated: false as const,
      existingCompositionResultObjectReused: false as const,
      rawDxfReturned: false as const,
      rawDxfRetained: false as const,
      physicalPackageCompiled: false as const,
      solverRuntimeImported: false as const,
      productionReady: false as const,
      ...progress,
    }),
  });
}

function sameRow(
  left: PatternImportDxfProductMultiseamSavedRowEvidenceV2,
  right: PatternImportDxfProductMultiseamSavedRowEvidenceV2,
): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.dxfSha256 === right.dxfSha256 &&
    left.patternVersion === right.patternVersion &&
    left.cardLockVersion === right.cardLockVersion
  );
}

/**
 * Consumes the saved-row source capability and emits the existing Composer V2 request. The table's
 * composition request remains the sole authoring/topology input; this adapter creates no second
 * assembly representation and imports no physical package or runtime.
 */
export async function buildPatternImportDxfProductSavedGarmentMeshIngressV1(
  input: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductSavedGarmentMeshIngressResultV1> {
  if (
    !input ||
    input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1 ||
    !input.sourceOwner ||
    input.compositionRequest?.schemaVersion !==
      PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2 ||
    !Number.isFinite(input.targetEdgeMm) ||
    input.targetEdgeMm <= 0 ||
    input.targetEdgeMm > MAXIMUM_TARGET_EDGE_MM
  )
    return blocked(
      'invalid-input',
      'Exact saved source, composition and target edge are required.',
    );

  const composition = input.compositionRequest;
  if (!sameRow(composition.prepared.row, composition.current.row))
    return blocked(
      'saved-row-binding-mismatch',
      'Prepared and current composition rows do not exact-match.',
    );
  const current = composition.current.row;
  const source = consumeDxfProductSavedNativeCompilerSourceV1(input.sourceOwner, {
    schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
    sourceFileId: composition.catalog.sourceFileId,
    sourceSha256: current.dxfSha256,
    techCardId: current.techCardId,
    scopeKey: current.scopeKey,
    patternLineKey: current.patternLineKey,
    cardLockVersion: current.cardLockVersion,
    draft: composition.draft,
  });
  if (!source.ok)
    return blocked(
      'saved-source-owner-blocked',
      `${source.blockers[0].code}: ${source.blockers[0].detail}`,
    );
  const native = await buildPatternImportDxfProductGarmentMeshNativeIngressV1(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1,
      origin: 'verified-saved-row',
      compositionRequest: composition,
      nativeRead: source.value.nativeRead,
      targetEdgeMm: input.targetEdgeMm,
    },
    crypto,
  );
  if (!native.ok)
    return blocked(
      'native-ingress-blocked',
      `${native.blockers[0].code}: ${native.blockers[0].detail}`,
      {
        savedSourceOwnerConsumedOnce: true,
        savedDraftIdentityBound: true,
        savedRowCommonIdentityBound: true,
      },
    );

  return Object.freeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_V1,
    request: native.request,
    sourceRow: source.value.row,
    report: native.report,
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_CLAIMS_V1,
  });
}
