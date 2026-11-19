import type { CardDraft } from 'lib/pattern-import/types';
import type { CardContext } from './client';
import type { common_TechCard } from 'api/proto-http/admin';
import {
  reconstructConfirmedSavedPatternV1,
  resolveConfirmedSavedPatternRowV1,
  type ConfirmedPatternApplyV1,
  type ReadConfirmedPatternCardV1,
} from './confirmed-saved-pattern-reconstruction-v1';
import {
  createPatternImportDxfProductSidecarCardControllerV1,
  PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1,
} from './product-semantic-sidecar-card-controller-v1';
import {
  clearPatternImportDxfPhaseECardSessionV1,
  registerPatternImportDxfPhaseECardSessionV1,
  type PatternImportDxfPhaseECardSessionV1,
} from './phase-e-workbench-card-session-v1';

type ControllerOptions = Parameters<typeof createPatternImportDxfProductSidecarCardControllerV1>[0];

/** Owned by PatternsField. The existing apply and autosave own all DXF writes. */
export function createPatternsConfirmedSessionLifecycleV1(
  input: {
    techCardId: number;
    service: ControllerOptions['service'];
    readCard: ReadConfirmedPatternCardV1;
    buildCardContext: (card: common_TechCard) => CardContext;
  },
  reconstruct = reconstructConfirmedSavedPatternV1,
) {
  const controller = createPatternImportDxfProductSidecarCardControllerV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_CARD_CONTROLLER_V1,
    techCardId: input.techCardId,
    service: input.service,
  });
  let disposed = false;
  let current: AbortController | null = null;

  return {
    async afterConfirmedSave(
      draft: CardDraft,
      result: ConfirmedPatternApplyV1,
      preferredScopeKey?: string,
    ) {
      if (disposed) return;
      current?.abort();
      const { signal } = (current = new AbortController());
      clearPatternImportDxfPhaseECardSessionV1(input.techCardId, controller);
      if (
        result.commitReceipt.techCardId !== input.techCardId ||
        draft.techCardId !== input.techCardId
      )
        throw new Error('Confirmed pattern import belongs to another card.');
      if (!result.uploaded.length) return;
      const apply = structuredClone(result);
      const uploadedScopes = new Set(apply.uploaded.map(({ scopeKey }) => scopeKey));
      const committedScopes = apply.commitReceipt.scopes.filter(({ scopeKey }) =>
        uploadedScopes.has(scopeKey),
      );
      const scopeKey =
        committedScopes.find(({ scopeKey }) => scopeKey === preferredScopeKey)?.scopeKey ??
        (committedScopes.length === 1 ? committedScopes[0].scopeKey : undefined);
      if (!scopeKey) throw new Error('Select one saved material scope for native authoring.');

      try {
        const {
          draft: draftSnapshot,
          row,
          patternVersion,
        } = await reconstruct({
          apply,
          scopeKey,
          readCard: input.readCard,
          buildCardContext: input.buildCardContext,
          signal,
        });
        if (signal.aborted) return;

        const loadDocumentEvidence: PatternImportDxfPhaseECardSessionV1['loadDocumentEvidence'] =
          async (scopeKey) => {
            const refused = (code: string, detail: string) => ({
              ok: false as const,
              evidence: null,
              blocker: { code, detail },
            });
            const stale = () =>
              refused(
                'confirmed-pattern-session-stale',
                'A newer import superseded this confirmed pattern session.',
              );
            if (signal.aborted) return stale();
            if (scopeKey !== row.scopeKey)
              return refused(
                'confirmed-pattern-row-unavailable',
                'This session is bound to another saved material scope.',
              );
            let card: common_TechCard | undefined;
            try {
              card = await input.readCard(signal);
            } catch (error) {
              if (signal.aborted) return stale();
              throw error;
            }
            if (signal.aborted) return stale();
            const saved = resolveConfirmedSavedPatternRowV1(card, apply, scopeKey);
            if (!saved.ok) return refused('confirmed-pattern-row-unavailable', saved.detail);
            if (
              saved.row.revision !== row.revision ||
              saved.patternVersion !== patternVersion ||
              saved.row.cardLockVersion < row.cardLockVersion
            )
              return refused(
                'confirmed-pattern-row-unavailable',
                'The saved pattern changed after this session was reconstructed.',
              );
            return {
              ok: true,
              evidence: {
                techCardId: saved.row.techCardId,
                scopeKey: saved.row.scopeKey,
                patternLineKey: saved.row.patternLineKey,
                dxfSha256: saved.row.sha256,
                patternVersion: saved.patternVersion,
                cardLockVersion: saved.row.cardLockVersion,
              },
              blocker: null,
            };
          };

        if (
          !registerPatternImportDxfPhaseECardSessionV1(
            input.techCardId,
            draftSnapshot,
            apply,
            controller,
            loadDocumentEvidence,
          )
        )
          throw new Error('The confirmed DXF could not expose its exact authoring session.');
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    },
    dispose() {
      disposed = true;
      current?.abort();
      current = null;
      clearPatternImportDxfPhaseECardSessionV1(input.techCardId, controller);
      controller.dispose();
    },
  };
}
