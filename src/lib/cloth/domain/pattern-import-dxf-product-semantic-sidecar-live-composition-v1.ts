import type { AdminService } from 'api/proto-http/admin';

import {
  buildPatternImportDxfProductMappingCompositionV1,
  type PatternImportDxfProductMappingCompositionInputV1,
} from './pattern-import-dxf-product-mapping-composition-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1,
  readBackPatternImportDxfProductMappingV1,
  type PatternImportDxfProductPostSaveReadbackInputV1,
} from './pattern-import-dxf-product-post-save-readback-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_REQUEST_V1,
  buildPatternImportDxfProductSemanticSidecarV1,
} from './pattern-import-dxf-product-semantic-sidecar-v1';
import {
  persistPatternImportDxfProductSemanticSidecarV1,
  type PatternImportDxfProductSidecarStorageServiceV1,
} from './pattern-import-dxf-product-semantic-sidecar-storage-client-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_V1 =
  'pattern-import-dxf-product-sidecar-live-composition/1' as const;

export type PatternImportDxfProductSidecarLiveServiceV1 = Pick<
  AdminService,
  'GetTechCard' | 'PutTechCardPatternSemanticSidecar' | 'GetTechCardPatternSemanticSidecar'
>;

export type PatternImportDxfProductSidecarLiveCompositionBlockerV1 = Readonly<{
  code:
    | 'product-g4f1-preflight-blocked'
    | 'product-g4f3-preflight-blocked'
    | 'chronology-drift'
    | 'product-g4f4-owner-blocked'
    | 'storage-blocked';
  phase: 'mapping-preflight' | 'readback-preflight' | 'owner-build' | 'storage';
  detail: string;
  writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_CONTRACT_V1 = Object.freeze({
  chronology: Object.freeze([
    'fresh-product-g4f1-composition-preflight-and-seal-derivation',
    'fresh-product-g4f3-post-save-readback-preflight',
    'fresh-product-g4f4-owner-build-with-second-g4f3-and-second-composition',
    'put-product-media-through-admin-service',
    'fresh-narrow-get-through-admin-service',
  ] as const),
  callerSuppliedG4f4OwnerAccepted: false,
  callerSuppliedReceiptMappingOrSealAccepted: false,
  putTransportFailureOutcome: 'unknown',
  savedDxfRollbackClaimedOnAttachFailure: false,
  generatedBrowserClientRequiredForLiveGate: true,
  authenticatedRealRowRequiredForLiveGate: true,
  thisFunctionAloneProvesAuthenticatedTransport: false,
  thisFunctionAloneProvesRealStore: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  freshProductG4f1PreflightCompleted: false as const,
  freshProductG4f3PreflightCompleted: false as const,
  genuineProductG4f4OwnerBuilt: false as const,
  productPutGetDualReadbackVerified: false as const,
  savedDxfRolledBack: false as const,
  retryRequired: true as const,
  authenticatedTransportObserved: false as const,
  realStoreObserved: false as const,
  productionReady: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_CANDIDATE_CLAIMS_V1 =
  Object.freeze({
    freshProductG4f1PreflightCompleted: true as const,
    freshProductG4f3PreflightCompleted: true as const,
    genuineProductG4f4OwnerBuilt: true as const,
    productPutGetDualReadbackVerified: true as const,
    savedDxfRolledBack: false as const,
    retryRequired: false as const,
    authenticatedTransportObserved: false as const,
    realStoreObserved: false as const,
    productionReady: false as const,
  });

export type PatternImportDxfProductSidecarLiveCompositionResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_V1;
      evidence: Readonly<{
        productExportSha256: string;
        phaseEPlanSha256: string;
        sizeSelectionSha256: string;
        mappingSealSha256: string;
        mappingCompositionSealSha256: string;
        postSaveReadbackSealSha256: string;
        sidecarSha256: string;
        canonicalByteLength: number;
        cardLockVersion: number;
      }>;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_CANDIDATE_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_V1;
      evidence: null;
      blockers: readonly [PatternImportDxfProductSidecarLiveCompositionBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const MAX_DETAIL_BYTES = 1_024;
const textEncoder = new TextEncoder();

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function innerDetail(
  blockers: readonly Readonly<{ code: string; detail: string }>[],
  fallback: string,
): string {
  return bounded(blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; ') || fallback);
}

function blocked(
  code: PatternImportDxfProductSidecarLiveCompositionBlockerV1['code'],
  phase: PatternImportDxfProductSidecarLiveCompositionBlockerV1['phase'],
  detail: string,
  writeOutcome: PatternImportDxfProductSidecarLiveCompositionBlockerV1['writeOutcome'] = 'not-attempted',
): PatternImportDxfProductSidecarLiveCompositionResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_V1,
    evidence: null,
    blockers: Object.freeze([
      Object.freeze({ code, phase, detail: bounded(detail), writeOutcome }),
    ]) as readonly [PatternImportDxfProductSidecarLiveCompositionBlockerV1],
    claims: BLOCKED_CLAIMS,
  });
}

/**
 * Product G4F6 composition. It accepts no detached G4F4 owner: every attempt starts with a fresh
 * saved-card readback and rebuilds the product owner before invoking PUT and a fresh narrow GET.
 */
export async function composePatternImportDxfProductSemanticSidecarPersistenceV1(
  service: PatternImportDxfProductSidecarLiveServiceV1,
  compositionInput: PatternImportDxfProductMappingCompositionInputV1,
  crypto: Pick<Crypto, 'subtle'> = globalThis.crypto,
): Promise<PatternImportDxfProductSidecarLiveCompositionResultV1> {
  const composition = await buildPatternImportDxfProductMappingCompositionV1(
    compositionInput,
    crypto,
  );
  if (!composition.ok)
    return blocked(
      'product-g4f1-preflight-blocked',
      'mapping-preflight',
      innerDetail(composition.blockers, 'Product G4F1 composition preflight was blocked.'),
    );
  const postSaveReadbackInput: PatternImportDxfProductPostSaveReadbackInputV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1,
    compositionInput,
    expectedCompositionSealSha256: composition.compositionSeal.canonicalSha256,
  };
  const getTechCard = (techCardId: number) =>
    service.GetTechCard({ id: techCardId, vatCountryCode: undefined });

  const postSave = await readBackPatternImportDxfProductMappingV1(
    postSaveReadbackInput,
    getTechCard,
    crypto,
  );
  if (!postSave.ok)
    return blocked(
      'product-g4f3-preflight-blocked',
      'readback-preflight',
      innerDetail(postSave.blockers, 'Product G4F3 preflight was blocked.'),
    );
  if (
    postSave.receipt.product.mappingCompositionSha256 !==
      composition.compositionSeal.canonicalSha256 ||
    postSave.receipt.product.mappingSha256 !== composition.mappingSeal.canonicalSha256
  )
    return blocked(
      'chronology-drift',
      'readback-preflight',
      'Product G4F3 mapping identities drifted after the fresh composition preflight.',
    );

  const sidecar = await buildPatternImportDxfProductSemanticSidecarV1(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_REQUEST_V1,
      postSaveReadbackInput,
      expected: {
        postSaveReadbackSealSha256: postSave.seal.canonicalSha256,
        mappingCompositionSealSha256: postSave.receipt.product.mappingCompositionSha256,
        mappingSealSha256: postSave.receipt.product.mappingSha256,
      },
    },
    getTechCard,
    crypto,
  );
  if (!sidecar.ok)
    return blocked(
      'product-g4f4-owner-blocked',
      'owner-build',
      innerDetail(sidecar.blockers, 'Product G4F4 owner build was blocked.'),
    );

  const persisted = await persistPatternImportDxfProductSemanticSidecarV1(
    service as PatternImportDxfProductSidecarStorageServiceV1,
    sidecar.owner,
    crypto,
    compositionInput.expectedSavedRow?.firstAttachmentSavedRowRevision,
  );
  if (!persisted.ok)
    return blocked(
      'storage-blocked',
      'storage',
      innerDetail(persisted.blockers, 'Product G4F6 PUT/GET verification was blocked.'),
      persisted.writeOutcome,
    );

  return Object.freeze({
    ok: true as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_V1,
    evidence: Object.freeze({
      productExportSha256: postSave.receipt.product.exportSha256,
      phaseEPlanSha256: postSave.receipt.product.phaseEPlanSha256,
      sizeSelectionSha256: postSave.receipt.product.sizeSelectionSha256,
      mappingSealSha256: postSave.receipt.product.mappingSha256,
      mappingCompositionSealSha256: postSave.receipt.product.mappingCompositionSha256,
      postSaveReadbackSealSha256: postSave.seal.canonicalSha256,
      sidecarSha256: persisted.receipt.sidecarSha256,
      canonicalByteLength: persisted.receipt.canonicalByteLength,
      cardLockVersion: persisted.receipt.cardLockVersion,
    }),
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_LIVE_COMPOSITION_CANDIDATE_CLAIMS_V1,
  });
}
