import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHOR_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_V1,
  createPatternImportDxfProductPhaseEAuthorityRegistryV1,
  type PatternImportDxfProductPhaseEAuthorResultV1,
  type PatternImportDxfProductPhaseEAuthorRequestV1,
} from './pattern-import-dxf-product-phase-e-authority-registry-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  compilePatternImportDxfProductPhaseEIntentV1,
  type PatternImportDxfProductPhaseEAuthoringCompileResultV1,
  type PatternImportDxfProductPhaseEAuthoringSubmissionV1,
} from './pattern-import-dxf-product-phase-e-authoring-compiler-v1';
import {
  producePatternImportDxfProductPhaseEAuthoringSubmissionV1,
  type PatternImportDxfProductPhaseEAuthoringChoicesV1,
  type PatternImportDxfProductPhaseEAuthoringProduceResultV1,
} from './pattern-import-dxf-product-phase-e-authoring-producer-v1';
import type { PatternImportDxfProductSidecarLiveServiceV1 } from './pattern-import-dxf-product-semantic-sidecar-live-composition-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_V1,
  createPatternImportDxfProductSidecarPostApplyHostV1,
  type PatternImportDxfProductSidecarPostApplyHostOptionsV1,
} from './pattern-import-dxf-product-semantic-sidecar-post-apply-host-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1 =
  'pattern-import-dxf-product-sidecar-card-runtime/1' as const;

export type PatternImportDxfProductSidecarCardRuntimeOptionsV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1;
  service: PatternImportDxfProductSidecarLiveServiceV1;
  onSnapshot?: PatternImportDxfProductSidecarPostApplyHostOptionsV1['onSnapshot'];
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfProductPhaseECompileAndAuthorResultV1 =
  | Readonly<{
      ok: false;
      stage: 'compile';
      compile: Extract<PatternImportDxfProductPhaseEAuthoringCompileResultV1, { ok: false }>;
      author: null;
    }>
  | Readonly<{
      ok: false;
      stage: 'author';
      compile: Extract<PatternImportDxfProductPhaseEAuthoringCompileResultV1, { ok: true }>;
      author: Extract<PatternImportDxfProductPhaseEAuthorResultV1, { ok: false }>;
    }>
  | Readonly<{
      ok: true;
      stage: 'authorized';
      compile: Extract<PatternImportDxfProductPhaseEAuthoringCompileResultV1, { ok: true }>;
      author: Extract<PatternImportDxfProductPhaseEAuthorResultV1, { ok: true }>;
    }>;

export type PatternImportDxfProductPhaseEProduceCompileAndAuthorResultV1 =
  | Readonly<{
      ok: false;
      stage: 'produce';
      produce: Extract<PatternImportDxfProductPhaseEAuthoringProduceResultV1, { ok: false }>;
      compile: null;
      author: null;
    }>
  | Readonly<{
      ok: false;
      stage: 'compile';
      produce: Extract<PatternImportDxfProductPhaseEAuthoringProduceResultV1, { ok: true }>;
      compile: Extract<PatternImportDxfProductPhaseEAuthoringCompileResultV1, { ok: false }>;
      author: null;
    }>
  | Readonly<{
      ok: false;
      stage: 'author';
      produce: Extract<PatternImportDxfProductPhaseEAuthoringProduceResultV1, { ok: true }>;
      compile: Extract<PatternImportDxfProductPhaseEAuthoringCompileResultV1, { ok: true }>;
      author: Extract<PatternImportDxfProductPhaseEAuthorResultV1, { ok: false }>;
    }>
  | Readonly<{
      ok: true;
      stage: 'authorized';
      produce: Extract<PatternImportDxfProductPhaseEAuthoringProduceResultV1, { ok: true }>;
      compile: Extract<PatternImportDxfProductPhaseEAuthoringCompileResultV1, { ok: true }>;
      author: Extract<PatternImportDxfProductPhaseEAuthorResultV1, { ok: true }>;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_CONTRACT_V1 = Object.freeze({
  finiteAuthoringCatalogAvailable: true,
  explicitChoiceProducerAvailable: true,
  catalogBoundAuthoringCompilerAvailable: true,
  explicitPhaseEAuthoringRequiredBeforeApply: true,
  cardRowsUsedAsPhaseEAuthority: false,
  confirmedReceiptRequiredBeforeAttachment: true,
  attachmentFailureChangesApplyResult: false,
  savedDxfRolledBackOnAttachmentFailure: false,
  retryStateOwnedForCardLifetime: true,
  survivesPageReload: false,
  productCardConfigured: false,
  authenticatedBrowserRowObserved: false,
  productionReady: false,
} as const);

/**
 * Composes explicit Phase-E authoring and the confirmed-save attachment owner into one card-lifetime
 * runtime. It is deliberately not instantiated by the product card until an explicit authoring
 * producer and visible attachment state exist.
 */
export function createPatternImportDxfProductSidecarCardRuntimeV1(
  options: PatternImportDxfProductSidecarCardRuntimeOptionsV1,
) {
  if (
    !options ||
    options.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1 ||
    !options.service
  )
    throw new TypeError('Exact product sidecar card-runtime options are required.');
  const authority = createPatternImportDxfProductPhaseEAuthorityRegistryV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_V1,
    crypto: options.crypto,
  });
  const attachment = createPatternImportDxfProductSidecarPostApplyHostV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_POST_APPLY_HOST_V1,
    service: options.service,
    authority: authority.provide,
    onSnapshot: options.onSnapshot,
    crypto: options.crypto,
  });
  let disposed = false;

  const compileAndAuthorPhaseE = async (
    draft: PatternImportDxfProductPhaseEAuthorRequestV1['draft'],
    catalog: Parameters<typeof compilePatternImportDxfProductPhaseEIntentV1>[0],
    submission: PatternImportDxfProductPhaseEAuthoringSubmissionV1,
  ): Promise<PatternImportDxfProductPhaseECompileAndAuthorResultV1> => {
    if (disposed) throw new Error('The product sidecar card runtime is disposed.');
    const compiled = await compilePatternImportDxfProductPhaseEIntentV1(
      catalog,
      submission,
      options.crypto,
    );
    if (!compiled.ok)
      return Object.freeze({
        ok: false as const,
        stage: 'compile' as const,
        compile: compiled,
        author: null,
      });
    const authored = await authority.author({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHOR_REQUEST_V1,
      draft,
      intent: compiled.intent,
    });
    return authored.ok
      ? Object.freeze({
          ok: true as const,
          stage: 'authorized' as const,
          compile: compiled,
          author: authored,
        })
      : Object.freeze({
          ok: false as const,
          stage: 'author' as const,
          compile: compiled,
          author: authored,
        });
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_RUNTIME_V1,
    buildAuthoringCatalog: (
      draft: Parameters<typeof buildPatternImportDxfProductPhaseEAuthoringCatalogV1>[0],
      scopeKey: string,
      sizeToken: string,
    ) =>
      disposed
        ? Promise.reject(new Error('The product sidecar card runtime is disposed.'))
        : buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
            draft,
            scopeKey,
            sizeToken,
            options.crypto,
          ),
    compilePhaseEIntent: (
      catalog: Parameters<typeof compilePatternImportDxfProductPhaseEIntentV1>[0],
      submission: PatternImportDxfProductPhaseEAuthoringSubmissionV1,
    ) =>
      disposed
        ? Promise.reject(new Error('The product sidecar card runtime is disposed.'))
        : compilePatternImportDxfProductPhaseEIntentV1(catalog, submission, options.crypto),
    producePhaseESubmission: (
      catalog: Parameters<typeof producePatternImportDxfProductPhaseEAuthoringSubmissionV1>[0],
      choices: PatternImportDxfProductPhaseEAuthoringChoicesV1,
    ) =>
      disposed
        ? (() => {
            throw new Error('The product sidecar card runtime is disposed.');
          })()
        : producePatternImportDxfProductPhaseEAuthoringSubmissionV1(catalog, choices),
    compileAndAuthorPhaseE,
    produceCompileAndAuthorPhaseE: async (
      draft: PatternImportDxfProductPhaseEAuthorRequestV1['draft'],
      catalog: Parameters<typeof compilePatternImportDxfProductPhaseEIntentV1>[0],
      choices: PatternImportDxfProductPhaseEAuthoringChoicesV1,
    ): Promise<PatternImportDxfProductPhaseEProduceCompileAndAuthorResultV1> => {
      if (disposed) throw new Error('The product sidecar card runtime is disposed.');
      const produced = producePatternImportDxfProductPhaseEAuthoringSubmissionV1(catalog, choices);
      if (!produced.ok)
        return Object.freeze({
          ok: false as const,
          stage: 'produce' as const,
          produce: produced,
          compile: null,
          author: null,
        });
      const result = await compileAndAuthorPhaseE(draft, catalog, produced.submission);
      if (result.ok)
        return Object.freeze({
          ok: true as const,
          stage: 'authorized' as const,
          produce: produced,
          compile: result.compile,
          author: result.author,
        });
      if (result.stage === 'compile')
        return Object.freeze({
          ok: false as const,
          stage: 'compile' as const,
          produce: produced,
          compile: result.compile,
          author: null,
        });
      return Object.freeze({
        ok: false as const,
        stage: 'author' as const,
        produce: produced,
        compile: result.compile,
        author: result.author,
      });
    },
    authorPhaseE: (request: PatternImportDxfProductPhaseEAuthorRequestV1) =>
      disposed
        ? Promise.reject(new Error('The product sidecar card runtime is disposed.'))
        : authority.author(request),
    readPhaseE: (key: string) => (disposed ? null : authority.read(key)),
    removePhaseE: (key: string) => !disposed && authority.remove(key),
    afterConfirmedSave: attachment.afterConfirmedSave,
    retryAttachment: attachment.retry,
    readAttachment: attachment.read,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      attachment.dispose();
      authority.dispose();
    },
  });
}
