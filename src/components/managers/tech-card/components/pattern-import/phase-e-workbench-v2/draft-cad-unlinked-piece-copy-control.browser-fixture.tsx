import { ImportWizard } from '../import-wizard';
import { createRoot } from 'react-dom/client';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSourceV1,
} from './draft-cad-session-v1';
import { createPatternImportDxfPhaseESavedRowRuntimeV1 } from './saved-row-production-runtime-v1';
import {
  PatternImportDxfPhaseEDraftCadWorkspaceV1,
  type PatternImportDxfPhaseEDraftCadWorkspacePropsV1,
} from './draft-cad-workspace-v1';
import type { PrepareSavedCopyReviewV1 } from './draft-cad-unlinked-piece-copy-review-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1 } from './patterns-field-compiled-reimport-owner-v1';
import { cancelSavedCopyReviewFileV1 } from './draft-cad-unlinked-piece-copy-review-v1';
import type { DxfProductSavedRowIdentityV1 as Row } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CardContext } from '../client';
import { applyDirectDxfReviewedDraftV1 } from '../direct-dxf-authoring-capture-v1';
import { draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import { nativePieceCopyVerifier } from 'lib/pattern-import/fabrics/native-piece-copy-review';

export async function mountSavedPieceCopyControl(f: {
  row: Row;
  card: CardContext;
  text: string;
  source: PatternImportDxfPhaseEDraftCadSourceV1;
  selected: PatternImportDxfPhaseEDraftCadWorkspacePropsV1['selection'];
  catalog: Parameters<typeof projectPatternImportDxfProductPhaseEAssemblyV1>[0];
  compileSource: PatternImportDxfPhaseEDraftCadWorkspacePropsV1['compileSource'];
}) {
  const made = createPatternImportDxfPhaseEDraftCadSessionV1(f.source);
  if (!made.ok) throw Error(made.blocker.detail);
  const session = made.session;
  let persisted = f.row,
    handoffs = 0,
    writes = 0,
    file: File | null = null,
    closed: File | null = null,
    manual = false;
  const runtime = createPatternImportDxfPhaseESavedRowRuntimeV1({
    selectedOperationNumber: 10,
    projection: { card: f.card, cardLockVersion: f.row.cardLockVersion },
    snapshot: {
      bridge: { readAuthoritativeRow: async () => ({ row: persisted, downloadUrl: f.row.url }) },
      authorityAdapter: {
        readAuthoritativeAssembly: async () => {
          throw Error('Unexpected assembly read');
        },
      },
    },
    fetch: async () =>
      new Response(f.text, {
        headers: { 'content-length': String(new TextEncoder().encode(f.text).length) },
      }),
  });
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(f.catalog, f.selected);
  if (!projected.ok) throw Error('Missing real saved projection');
  const projection = projected.projection;
  const off = registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
    techCardId: f.row.techCardId,
    readConfirmedImportGeneration: () => 0,
    scopeAvailable: (s) => s === f.row.scopeKey,
    reviewAlreadyOpen: () => file !== null,
    openExistingImportReview: (review) => {
      if (review.savedCopyFile !== review.files[0]) throw Error('Lost exact File handoff');
      file = review.files[0];
      manual = review.requireManualApply === true;
      handoffs++;
      render();
    },
  });
  const prepare: PrepareSavedCopyReviewV1 = (readSelection) =>
    runtime.prepareSavedPieceCopyReview!(f.row, () => {
      const selected = readSelection();
      return selected ? { row: f.row, sizeToken: 'M', generation: 0, session, ...selected } : null;
    });
  const root = createRoot(document.getElementById('root')!);
  function render() {
    root.render(
      <>
        <PatternImportDxfPhaseEDraftCadWorkspaceV1
          session={session}
          projection={projection}
          selection={f.selected}
          compileSource={f.compileSource}
          activeMaterialScopeKey={f.row.scopeKey}
          prepareSavedPieceCopyReview={prepare}
          onSessionChange={() => {
            throw Error('Unexpected Draft command');
          }}
        />
        {file && (
          <ImportWizard
            card={f.card}
            initialFiles={[file]}
            initialScopeKey={f.row.scopeKey}
            requireManualApply={manual}
            savedCopyFile={file}
            namer={async () => []}
            applyDraft={async () => {
              writes++;
              throw Error('Unexpected write');
            }}
            onClose={() => {
              if (file) cancelSavedCopyReviewFileV1(file);
              closed = file;
              file = null;
              render();
            }}
          />
        )}
      </>,
    );
  }
  render();
  return {
    state: () => ({ handoffs, writes, manual }),
    drift: () => {
      persisted = { ...f.row, revision: f.row.revision + 1 };
    },
    async verifyClosed() {
      if (!closed || file)
        throw Error('The actual Patterns Wizard did not close the reviewed File.');
      const held = closed;
      nativePieceCopyVerifier(f.text, 'FP', 'FP_2')(await held.text());
      const draft = await draftThroughWizardStages(held, f.card);
      // A file selected through the wizard picker must never downgrade this run to ordinary Apply.
      const copy = new File([held], held.name, { type: held.type });
      const write = async () => {
        writes++;
        throw Error('Unexpected write');
      };
      try {
        await applyDirectDxfReviewedDraftV1(draft, [copy], undefined, () => true, write, held);
        throw Error('Substituted file accepted');
      } catch (error) {
        if (!(error instanceof Error && error.message.includes('original unlinked copy File')))
          throw error;
      }
      try {
        await applyDirectDxfReviewedDraftV1(draft, [held], undefined, () => true, write, held);
        throw Error('Cancelled review unexpectedly applied');
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    dispose() {
      root.unmount();
      off();
      runtime.dispose();
    },
  };
}
