import { abortableAdminService } from 'api/api';
import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import { isGenerated } from 'lib/fusing-dxf/regenerate';
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
import { bindSavedAssemblyOperationAnchorsV1 } from './saved-assembly-operation-anchors-v1';
import {
  bindSavedFullAssemblyNativeCutPathsV1,
  bindSavedFullAssemblyNativeSewingPathsV1,
} from './saved-full-assembly-native-boundaries-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';
import { replaySavedFullAssemblyGeneratedFusingV1 } from './saved-full-assembly-generated-fusing-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

type GeneratedFusingInputs = Readonly<{
  card: common_TechCard;
  sizeDictionary: readonly common_Size[];
  selectedSizeId: number;
  includeGeneratedCutGeometry?: boolean;
}>;

/** Prepares garment sources and verified generated cut layers from the same saved Assembly seal. */
export async function prepareSavedFullAssemblyCompleteNativeRowsV1(
  source: CompleteSavedAssemblySourceV1,
  cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1,
  signal: AbortSignal,
  generatedFusing?: GeneratedFusingInputs,
) {
  signal.throwIfAborted();
  const fusingInput = generatedFusing ? structuredClone(generatedFusing) : null;
  const generatedPatterns = new Set(
    fusingInput?.card.techCard?.patterns?.filter(isGenerated).map(({ lineKey }) => lineKey),
  );
  const hosts = createSavedFullAssemblyCompleteDxfHostsV1(source, cardProjection);
  const members = [];
  const generatedRows = [];
  for (const member of source.rows) {
    signal.throwIfAborted();
    const row = completeSavedAssemblyRowIdentityV1(member);
    if (generatedPatterns.has(row.patternLineKey)) {
      generatedRows.push(row);
      continue;
    }
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
        sewingCarrier: replay.nativeSewingReplay?.replay?.carrier ?? null,
      }),
    );
  }
  const [first] = members;
  if (!first) throw new Error('The complete Assembly has no native garment member rows.');
  const fusingLayers = [];
  if (fusingInput && generatedRows.length && fusingInput.includeGeneratedCutGeometry !== false) {
    const main = members.find(({ row }) => row.scopeKey === 'main');
    if (!main) throw new Error('Generated fusing requires the exact main garment row.');
    const host = hosts.createCanonical();
    let mainBytes: Uint8Array | undefined;
    try {
      ({ bytes: mainBytes } = await host.readAuthoritativeRow(main.row, signal, () => {}));
      for (const row of generatedRows) {
        signal.throwIfAborted();
        const { bytes: fusingBytes } = await host.readAuthoritativeRow(row, signal, () => {});
        try {
          fusingLayers.push(
            await replaySavedFullAssemblyGeneratedFusingV1(
              {
                source,
                card: fusingInput.card,
                sizeDictionary: fusingInput.sizeDictionary,
                sizeId: fusingInput.selectedSizeId,
                fusingScopeKey: row.scopeKey,
                mainBytes,
                fusingBytes,
                nativeMain: { draft: main.sourceRequest.draft, sizes: cardProjection.card.sizes },
              },
              signal,
            ),
          );
        } finally {
          fusingBytes.fill(0);
        }
      }
    } finally {
      mainBytes?.fill(0);
      host.dispose();
    }
  }
  const selectedSize = fusingInput
    ? cardProjection.card.sizes.find(({ sizeId }) => sizeId === fusingInput.selectedSizeId)
    : undefined;
  if (fusingInput && !selectedSize)
    throw new Error('The current card does not contain the selected size.');
  const nativeBoundaries = selectedSize
    ? await Promise.all(
        members.map(async ({ row, sourceRequest, sewingCarrier }) => {
          const cuts = await bindSavedFullAssemblyNativeCutPathsV1(
            source,
            { row, draft: sourceRequest.draft },
            selectedSize.token,
            signal,
          );
          return {
            cuts,
            sewing: sewingCarrier
              ? bindSavedFullAssemblyNativeSewingPathsV1(sewingCarrier, cuts)
              : [],
          };
        }),
      )
    : [];
  await readCompleteSavedAssemblySourceV1(
    abortableAdminService(signal),
    first.row,
    {
      expectedServerAssemblyRevision: source.serverAssemblyRevision,
      expectedCompleteSourceSha256: source.sourceSha256,
      ...(source.sourceOnly && { sourceOnly: true }),
    },
    signal,
  );
  signal.throwIfAborted();
  const originalSewingPaths = Object.freeze(nativeBoundaries.flatMap(({ sewing }) => sewing));
  return Object.freeze({
    sourceSha256: source.sourceSha256,
    serverAssemblyRevision: source.serverAssemblyRevision,
    nativeRows: Object.freeze(
      members.map(({ sewingCarrier: _sewingCarrier, ...member }) => Object.freeze(member)),
    ),
    fusingLayers: Object.freeze(fusingLayers),
    originalCutPaths: Object.freeze(nativeBoundaries.flatMap(({ cuts }) => cuts)),
    originalSewingPaths,
    operationAnchors: bindSavedAssemblyOperationAnchorsV1(
      source,
      new Set(generatedRows.map(({ scopeKey }) => scopeKey)),
      originalSewingPaths,
    ),
  });
}
