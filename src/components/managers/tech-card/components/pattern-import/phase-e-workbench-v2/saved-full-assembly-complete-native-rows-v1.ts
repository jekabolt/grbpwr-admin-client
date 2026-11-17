import { abortableAdminService } from 'api/api';
import {
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  computeDxfProductSavedSourceFileIdV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1';
import {
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
  createDxfProductSavedForeignNativeReprocessOwnerV1,
  createDxfProductSavedNativeReprocessOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
  type DxfProductSavedNativeReprocessResultV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';

import {
  completeSavedAssemblyRowIdentityV1,
  readCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

/** Prepares one genuine native compiler source per exact scoped row, all from one Assembly seal. */
export async function prepareSavedFullAssemblyCompleteNativeRowsV1(
  source: CompleteSavedAssemblySourceV1,
  cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const hosts = createSavedFullAssemblyCompleteDxfHostsV1(source, cardProjection);
  const members = [];
  for (const member of source.rows) {
    signal.throwIfAborted();
    const row = completeSavedAssemblyRowIdentityV1(member);
    const canonicalHost = hosts.createCanonical();
    const canonicalOwner = createDxfProductSavedNativeReprocessOwnerV1(canonicalHost);
    const cancelCanonical = () => canonicalOwner.cancel();
    signal.addEventListener('abort', cancelCanonical, { once: true });
    let replay: DxfProductSavedNativeReprocessResultV1;
    try {
      replay = await canonicalOwner.run({
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row,
      });
    } finally {
      signal.removeEventListener('abort', cancelCanonical);
      canonicalOwner.dispose();
      canonicalHost.dispose();
    }
    signal.throwIfAborted();

    if (!replay.ok && replay.blockers[0]?.code === 'foreign-saved-dxf-detected') {
      const foreignHost = hosts.createForeign();
      const foreignOwner = createDxfProductSavedForeignNativeReprocessOwnerV1(foreignHost);
      const cancelForeign = () => foreignOwner.cancel();
      signal.addEventListener('abort', cancelForeign, { once: true });
      try {
        replay = await foreignOwner.run({
          schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
          row,
        });
      } finally {
        signal.removeEventListener('abort', cancelForeign);
        foreignOwner.dispose();
        foreignHost.dispose();
      }
    }

    signal.throwIfAborted();
    if (!replay.ok)
      throw new Error(
        `Native source for ${row.scopeKey} was blocked: ${replay.blockers[0]?.detail ?? 'unknown blocker'}`,
      );
    if (
      replay.sourceFileId !== computeDxfProductSavedSourceFileIdV1(row) ||
      !Object.entries(row).every(([key, value]) => replay.row[key as keyof typeof row] === value)
    )
      throw new Error(`Native source for ${row.scopeKey} differs from the current Assembly row.`);
    const sourceRequest = Object.freeze({
      schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
      sourceFileId: replay.sourceFileId,
      sourceSha256: row.sha256,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      patternLineKey: row.patternLineKey,
      cardLockVersion: row.cardLockVersion,
      draft: replay.draft,
    }) satisfies DxfProductSavedNativeCompilerSourceRequestV1;
    members.push(
      Object.freeze({
        row,
        sourceOwner: replay.sourceOwner,
        sourceRequest,
        nativeSewingAvailable: replay.nativeSewingReplay?.replayReady === true,
      }),
    );
  }
  const [first] = members;
  if (!first) throw new Error('The complete Assembly has no saved DXF member rows.');
  await readCompleteSavedAssemblySourceV1(
    abortableAdminService(signal),
    first.row,
    {
      expectedServerAssemblyRevision: source.serverAssemblyRevision,
      expectedCompleteSourceSha256: source.sourceSha256,
    },
    signal,
  );
  signal.throwIfAborted();
  return Object.freeze(members);
}
