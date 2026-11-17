import type {
  PatternImportDxfProductCompositeSidecarStorageDepsV3,
  PatternImportDxfProductCompositeSidecarStorageWriterResultV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
  buildPatternImportDxfProductCompositeSidecarV5,
  encodePatternImportDxfProductCompositeSidecarV5,
  readPatternImportDxfProductCompositeComponentBytesV5,
  restorePatternImportDxfPhaseETopologyAnnotationsV5,
} from './composite-sidecar-v5';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
  createPatternImportDxfProductCompositeSidecarStorageAdapterV6,
} from './composite-sidecar-persistence-v6';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
  buildPatternImportDxfProductCompositeSidecarV6,
  decodePatternImportDxfProductCompositeSidecarV6,
  encodePatternImportDxfProductCompositeSidecarV6,
  readPatternImportDxfProductCompositeComponentBytesV6,
} from './composite-sidecar-v6';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
  createPatternImportDxfProductCompositeSidecarAnnotationStorageAdapterV7,
  requireSavedCompositeSidecarTransportAnchorV7,
} from './composite-sidecar-persistence-v7';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
  buildPatternImportDxfProductCompositeSidecarV7,
  decodePatternImportDxfProductCompositeSidecarV7,
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1,
  readPatternImportDxfProductCompositeComponentBytesV7,
  verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority,
} from './composite-sidecar-v7';
import {
  matchesPatternImportDxfProductExactNDesktopGeometryV2,
  matchesPatternImportDxfProductExactNSessionSavedBindingV1,
} from './durable-exact-session-current-v1';
import {
  resolvePatternImportDxfProductExactNSeamProductionMountV2,
  type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  type PatternImportDxfProductExactNDesktopGeometryV2,
} from './exact-n-seam-production-mount-v2';
import {
  SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
  fingerprintSavedFullAssemblyAoContentV1,
} from './saved-full-assembly-physical-component-v1';
import {
  disposeSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  readSavedFullAssemblySnapshotV1,
} from './saved-full-assembly-snapshot-production-v1';
import {
  encodePatternImportDxfPhaseETopologyAnnotationDraftV5,
  type PatternImportDxfPhaseETopologyAnnotationSourceV5,
} from './topology-annotation-application-transaction-v5';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';

type SaveRequest = Readonly<{
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  geometry: PatternImportDxfProductExactNDesktopGeometryV2;
  /** Digest of the annotation envelope used as the edit baseline. */
  expectedPreviousSidecarSha256: string;
  draft: PatternImportDxfPhaseETopologyAnnotationDraftV5;
}>;

type WrappedMediaType =
  | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
  | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;

type StorageBlocked = Extract<
  PatternImportDxfProductCompositeSidecarStorageWriterResultV3<WrappedMediaType, string>,
  { ok: false }
>;

type SaveResult =
  | Readonly<{
      ok: true;
      mediaType: WrappedMediaType;
      sidecarSha256: string;
      readback: PatternImportDxfPhaseETopologyAnnotationDraftV5;
    }>
  | Readonly<{
      ok: false;
      writeOutcome: StorageBlocked['writeOutcome'];
      detail: string;
    }>;

function restoredDraft(
  decoded: Extract<
    Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV6>>,
    { ok: true }
  >,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  source: PatternImportDxfPhaseETopologyAnnotationSourceV5,
) {
  const { current } = session;
  const actual = decoded.nestedCompositeV5.nestedCompositeV4.exactNSeam.carrier.bindings;
  if (
    actual.catalogCanonicalSha256 !== current.catalogCanonicalSha256 ||
    actual.phaseEAggregatePlanSha256 !== current.phaseEAggregatePlanSha256 ||
    actual.selectedOperation.authoringOperationId !==
      current.selectedOperation.authoringOperationId ||
    actual.selectedOperation.localOperationOrder !==
      current.selectedOperation.localOperationOrder ||
    !matchesPatternImportDxfProductExactNSessionSavedBindingV1(
      session,
      actual.row,
      actual.selectedOperation.sourceOperationNumber,
      actual.selectedOperation.seamIds,
    )
  )
    throw new Error('The saved exact operation differs from the annotation edit baseline.');
  const restored = restorePatternImportDxfPhaseETopologyAnnotationsV5(
    decoded.nestedCompositeV5.owner,
    {
      bindings: authority,
      sourceIdentity: source.identity,
      sourceRevision: source.revision,
      sourceSha256: source.sha256,
    },
  );
  if (!restored.ok) throw new Error(restored.blockers[0].detail);
  return Object.freeze({ measurements: restored.measurements, callouts: restored.callouts });
}

/** Reuses the storage strategies over the single conditional semantic-sidecar writer. */
export function createPatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1(
  deps: PatternImportDxfProductCompositeSidecarStorageDepsV3,
) {
  return async (input: SaveRequest, signal: AbortSignal): Promise<SaveResult> => {
    let writeOutcome: StorageBlocked['writeOutcome'] = 'not-attempted';
    try {
      signal.throwIfAborted();
      const { session, geometry, expectedPreviousSidecarSha256 } = input;
      const { current } = session;
      const { row, serverAssemblyRevision, assemblyTopologySha256 } = current;
      const authority = { row, serverAssemblyRevision, assemblyTopologySha256 };
      const selectedOperationNumber = current.selectedOperation.sourceOperationNumber;
      const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(session, 0);
      const { annotationSource, projection } = geometry;
      if (
        session.productionFeed ||
        !resolved.ok ||
        !annotationSource ||
        annotationSource.revision !== String(row.revision) ||
        annotationSource.sha256 !== row.sha256 ||
        !matchesPatternImportDxfProductExactNDesktopGeometryV2(geometry, session)
      )
        throw new Error(
          'The annotation draft belongs to another saved pattern or exact operation.',
        );
      if (!/^[0-9a-f]{64}$/.test(expectedPreviousSidecarSha256))
        throw new Error('An exact saved annotation baseline is required.');
      const source = { ...annotationSource, projection };
      const encodedAnnotations = await encodePatternImportDxfPhaseETopologyAnnotationDraftV5(
        authority,
        source,
        input.draft,
        deps.crypto,
      );
      if (!encodedAnnotations.ok) throw new Error(encodedAnnotations.blocker.detail);

      const readCurrent = async (
        expectedSha256: string,
        readSignal: AbortSignal,
        expectedMediaType?: WrappedMediaType,
      ) => {
        const receipt = await readSavedFullAssemblySnapshotV1(
          { row, seedOperationNumber: selectedOperationNumber },
          readSignal,
        );
        try {
          const snapshot = projectSavedFullAssemblySnapshotV1(receipt);
          const operation = snapshot.operations.find(
            ({ operationNumber }) => operationNumber === selectedOperationNumber,
          );
          const selected = snapshot.selectedTopologyReceipts.find(
            ({ sourceOperationNumber }) => sourceOperationNumber === selectedOperationNumber,
          );
          if (
            !operation ||
            !matchesPatternImportDxfProductExactNSessionSavedBindingV1(
              session,
              snapshot.row,
              selectedOperationNumber,
              operation.seamKeys,
            ) ||
            serverAssemblyRevision !== snapshot.serverAssemblyRevision ||
            assemblyTopologySha256 !== selected?.sha256
          )
            throw new Error('The selected Assembly Order changed during annotation save.');
          const { outer } = snapshot;
          if (
            outer.status !== 'present' ||
            !outer.currentRowBound ||
            (outer.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 &&
              outer.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) ||
            outer.sha256 !== expectedSha256 ||
            (expectedMediaType && outer.mediaType !== expectedMediaType)
          )
            throw new Error('The saved annotation envelope changed. Reload before editing.');
          const aoContentSha256 = await fingerprintSavedFullAssemblyAoContentV1(
            snapshot,
            readSignal,
          );
          if (outer.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) {
            const decoded = await decodePatternImportDxfProductCompositeSidecarV7(
              outer.bytes,
              deps.crypto,
            );
            if (!decoded.ok) throw new Error(decoded.blockers[0].detail);
            const verified = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
              decoded.owner,
              receipt,
            );
            if (!verified.ok) throw new Error(verified.blocker.detail);
            disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(verified.receipt);
            const transportAnchor = requireSavedCompositeSidecarTransportAnchorV7(
              decoded,
              snapshot,
            );
            readSignal.throwIfAborted();
            return {
              mediaType: outer.mediaType,
              aoContentSha256,
              decodedV6: decoded.nestedCompositeV6,
              decodedV7: decoded,
              transportAnchor,
            } as const;
          }
          const decodedV6 = await decodePatternImportDxfProductCompositeSidecarV6(
            outer.bytes,
            deps.crypto,
          );
          if (!decodedV6.ok) throw new Error(decodedV6.blockers[0].detail);
          readSignal.throwIfAborted();
          return { mediaType: outer.mediaType, aoContentSha256, decodedV6 } as const;
        } finally {
          disposeSavedFullAssemblySnapshotV1(receipt);
        }
      };

      const before = await readCurrent(expectedPreviousSidecarSha256, signal);
      restoredDraft(before.decodedV6, authority, session, source);
      const { owner: currentV6, nestedCompositeV5: currentV5 } = before.decodedV6;
      const compositeV4Bytes = readPatternImportDxfProductCompositeComponentBytesV5(
        currentV5.owner,
        'composite-v4',
      );
      const arrangementBytes = readPatternImportDxfProductCompositeComponentBytesV6(
        currentV6,
        'cad-mannequin-arrangement-v1',
      );
      if (!compositeV4Bytes || !arrangementBytes)
        throw new Error('The exact seam or arrangement component is absent.');
      const nextV5 = await buildPatternImportDxfProductCompositeSidecarV5(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
          bindings: authority,
          expectedPreviousSidecarSha256: currentV5.seal.canonicalSha256,
          compositeV4Bytes,
          topologyAnnotationsBytes: encodedAnnotations.bytes,
        },
        deps.crypto,
      );
      if (!nextV5.ok) throw new Error(nextV5.blockers[0].detail);
      const encodedV5 = encodePatternImportDxfProductCompositeSidecarV5(nextV5.owner);
      if (!encodedV5.ok) throw new Error('The edited Composite V5 could not be encoded.');
      const nextV6 = await buildPatternImportDxfProductCompositeSidecarV6(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
          expectedPreviousSidecarSha256: before.decodedV6.seal.canonicalSha256,
          compositeV5Bytes: encodedV5.bytes,
          mannequinArrangementBytes: arrangementBytes,
        },
        deps.crypto,
      );
      if (!nextV6.ok) throw new Error(nextV6.blockers[0].detail);
      const verifyBeforeWrite = async (writeSignal: AbortSignal) => {
        const fresh = await readCurrent(
          expectedPreviousSidecarSha256,
          writeSignal,
          before.mediaType,
        );
        if (fresh.aoContentSha256 !== before.aoContentSha256)
          throw new Error('Complete Assembly Order content changed before annotation save.');
      };
      let saved;
      if (before.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) {
        const physicalBytes = readPatternImportDxfProductCompositeComponentBytesV7(
          before.decodedV7.owner,
          SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
        );
        const encodedV6 = encodePatternImportDxfProductCompositeSidecarV6(nextV6.owner);
        if (!physicalBytes || !encodedV6.ok)
          throw new Error('The V7 physical component or V6 bytes are unavailable.');
        const outerAuthority = before.decodedV7.document.bindings;
        const nextV7 = await buildPatternImportDxfProductCompositeSidecarV7(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
            expectedPreviousSidecarSha256,
            bindings: outerAuthority,
            compositeV6Bytes: encodedV6.bytes,
            fullAssemblyPhysicalBytes: physicalBytes,
          },
          deps.crypto,
        );
        if (!nextV7.ok) throw new Error(nextV7.blockers[0].detail);
        saved = await createPatternImportDxfProductCompositeSidecarAnnotationStorageAdapterV7(
          deps,
          verifyBeforeWrite,
        ).persist(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
            transitionIntent: 'annotations',
            currentAuthority: outerAuthority,
            transportAnchor: before.transportAnchor,
            nextOwner: nextV7.owner,
          },
          signal,
        );
      } else {
        const { scope, source, mannequin } = before.decodedV6.mannequinArrangement.bindings;
        saved = await createPatternImportDxfProductCompositeSidecarStorageAdapterV6(
          deps,
          verifyBeforeWrite,
        ).persist(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
            transitionIntent: 'annotations',
            currentAuthority: authority,
            arrangementTarget: {
              sizeToken: scope.sizeToken,
              catalogCanonicalSha256: source.catalogCanonicalSha256,
              sizeSelectionCanonicalSha256: source.sizeSelectionCanonicalSha256,
              baseModelId: mannequin.baseModelId,
              modelFormRevisionKeyV1: mannequin.modelFormRevisionKeyV1,
              poseCanonicalKey: mannequin.poseBinding.canonicalKey,
            },
            nextOwner: nextV6.owner,
          },
          signal,
        );
      }
      if (!saved.ok)
        return { ok: false, writeOutcome: saved.writeOutcome, detail: saved.blockers[0].detail };
      writeOutcome = 'acknowledged-unverified';
      const after = await readCurrent(saved.receipt.sidecarSha256, signal, before.mediaType);
      if (after.aoContentSha256 !== before.aoContentSha256)
        throw new Error('Complete Assembly Order content changed after annotation save.');
      const readback = restoredDraft(after.decodedV6, authority, session, source);
      return {
        ok: true,
        mediaType: after.mediaType,
        sidecarSha256: saved.receipt.sidecarSha256,
        readback,
      };
    } catch (error) {
      return {
        ok: false,
        writeOutcome,
        detail: error instanceof Error ? error.message : 'Annotation save failed.',
      };
    }
  };
}

export type PatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1 = ReturnType<
  typeof createPatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1
>;
