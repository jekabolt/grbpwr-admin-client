import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui';

import { PatternsField } from 'components/managers/tech-card/components/patterns-field';
import type { TechCardFormData } from 'components/managers/tech-card/components/schema';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
  subscribePatternImportDxfPhaseECadCommandCompiledReimportOwnerV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-geometry-compile-v1';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

const TECH_CARD_ID = 11;
const LINING = 'TECH_CARD_BOM_PURPOSE_LINING';
const SHA = 'a'.repeat(64);

const compiledLining = Object.freeze({
  schemaVersion: 'pattern-import-dxf-phase-e-draft-cad-geometry-compile/1',
  status: 'compiled-reimport-required',
  source: Object.freeze({
    revision: 31,
    sourceFileId: 'card11-LINING.dxf',
    sourceSha256: SHA,
    selectedGeometrySha256: 'b'.repeat(64),
    catalogCanonicalSha256: 'c'.repeat(64),
    sizeSelectionCanonicalSha256: 'd'.repeat(64),
  }),
  scope: Object.freeze({ techCardId: TECH_CARD_ID, scopeKey: LINING, sizeToken: 'M' }),
  compiledJob: Object.freeze({}) as never,
  dxfText: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n',
  manifest: Object.freeze({}) as never,
  warnings: Object.freeze([]),
  compiledFeatures: Object.freeze([]),
  reimport: Object.freeze({
    required: true,
    boundary: 'ordinary-import-semantics-phase-d-phase-e',
    applyEligible: false,
  }),
  claims: Object.freeze({}) as never,
}) as PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;

const defaults = {
  name: 'Card 11 reimport smoke',
  season: 'SS26',
  styleNumber: 'SS26-011',
  sizeIds: [7],
  baseSampleSizeId: 7,
  requiredSeamAllowanceMm: '10',
  patterns: [],
  pieces: [],
  pieceDxfAliases: [],
  operations: [],
  cutStrips: [],
  bomItems: [
    {
      lineKey: 'bom-lining',
      name: 'Lining',
      section: 'TECH_CARD_BOM_SECTION_LINING',
      purpose: LINING,
    },
  ],
} as unknown as TechCardFormData;

function PatternsReimportSmoke() {
  const methods = useForm<TechCardFormData>({ defaultValues: defaults });
  const patterns = useWatch({ control: methods.control, name: 'patterns' }) ?? [];
  const aliases = useWatch({ control: methods.control, name: 'pieceDxfAliases' }) ?? [];
  const [handoffStatus, setHandoffStatus] = useState('idle');
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribePatternImportDxfPhaseECadCommandCompiledReimportOwnerV1(TECH_CARD_ID, listener),
    [],
  );
  const read = useCallback(
    () => readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1(TECH_CARD_ID),
    [],
  );
  const capability = useSyncExternalStore(subscribe, read, read);

  return (
    <FormProvider {...methods}>
      <main
        data-patterns-reimport-smoke=''
        data-owner-available={String(capability.available)}
        data-handoff-status={handoffStatus}
        data-pattern-count={patterns.length}
        data-alias-count={aliases.length}
      >
        <button
          type='button'
          data-open-compiled-lining-review=''
          onClick={() => {
            const result = requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
              schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
              artifact: compiledLining,
              confirmedImportGenerationAtCompile: 0,
              cadSessionCursorAtCompile: 1,
            });
            setHandoffStatus(result.ok ? result.status : result.blocker.code);
          }}
        >
          Open compiled lining review
        </button>
        <PatternsField
          techCardId={TECH_CARD_ID}
          active={false}
          canEdit={false}
          canPublishIndex={false}
          savedSizeIds={[7]}
        />
      </main>
    </FormProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
});
const root = document.getElementById('root');
if (!root) throw new Error('Patterns reimport smoke root is unavailable.');
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <DictionaryProvider>
      <MemoryRouter initialEntries={['/tech-cards/11?tab=assembly-table']}>
        <TooltipProvider>
          <PatternsReimportSmoke />
        </TooltipProvider>
      </MemoryRouter>
    </DictionaryProvider>
  </QueryClientProvider>,
);
