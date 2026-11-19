import { abortableAdminService } from 'api/api';
import {
  createCompleteSavedAssemblyRowReaderV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import { createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1 } from './foreign-saved-dxf-reprocess-host-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import {
  createPatternImportDxfPhaseESavedRowCardProjectionResolverV1,
  type PatternImportDxfPhaseESavedRowCardProjectionV1,
} from './saved-row-production-runtime-v1';

/** Reuses the saved DXF downloader and worker for verified rows of the same Assembly. */
export function createSavedFullAssemblyCompleteDxfHostsV1(
  source: CompleteSavedAssemblySourceV1,
  cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1,
) {
  const hostInputs = {
    nativeSewingReplay: true,
    readAuthoritativeRow: createCompleteSavedAssemblyRowReaderV1(source, abortableAdminService),
    resolveCard: createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(cardProjection),
  };
  return Object.freeze({
    createCanonical: () => createPatternImportDxfPhaseESavedDxfReprocessHostV1(hostInputs),
    createForeign: () => createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1(hostInputs),
  });
}
