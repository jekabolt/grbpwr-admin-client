import type { AdminService } from 'api/proto-http/admin';
import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { PatternImportDxfPhaseECalloutV1 } from './callout-session-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
} from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
  type PatternImportDxfProductCompositeSidecarProductionPersistenceV5,
} from './composite-sidecar-persistence-v5';
import {
  PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
  buildPatternImportDxfProductCompositeSidecarV5,
  decodePatternImportDxfProductCompositeSidecarV5,
  derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1,
  encodePatternImportDxfPhaseETopologyAnnotationsV1,
  readPatternImportDxfProductCompositeComponentBytesV5,
  restorePatternImportDxfPhaseETopologyAnnotationsV5,
} from './composite-sidecar-v5';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  decodePatternImportDxfProductCompositeSidecarV6,
} from './composite-sidecar-v6';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  decodePatternImportDxfProductCompositeSidecarV7,
} from './composite-sidecar-v7';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import { resolvePatternImportDxfProductExactNSeamProductionMountV2 } from './exact-n-seam-production-mount-v2';
import {
  resolvePatternImportDxfPhaseEVertexV1,
  type PatternImportDxfPhaseEMeasurementV1,
} from './measurement-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_APPLICATION_TRANSACTION_V5 =
  'pattern-import-dxf-phase-e-topology-annotation-application-transaction/5' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_APPLICATION_TRANSACTION_CLAIMS_V5 =
  Object.freeze({
    exactNAtomicSelectionOwnerRequired: true,
    reconstructedPhaseDProjectionRequired: true,
    currentCompositeV4OrV5FreshReadRequired: true,
    exactSourceAndAssemblyAuthorityRequired: true,
    annotationAnchorsResolvedAgainstCurrentProjection: true,
    explicitUserSaveRequired: true,
    autosaveAllowed: false,
    localStorageAllowed: false,
    existingCompositeV5StorageAdapterReused: true,
    verifiedPutEchoAndAdapterReadbackRequired: true,
    additionalApplicationReadbackRequired: true,
  } as const);

export type PatternImportDxfPhaseETopologyAnnotationSourceV5 = Readonly<{
  identity: string;
  revision: string;
  sha256: string;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}>;

export type PatternImportDxfPhaseETopologyAnnotationReadbackV5 = Readonly<{
  measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
  callouts: readonly PatternImportDxfPhaseECalloutV1[];
  sidecarSha256: string;
}>;

export type PatternImportDxfPhaseETopologyAnnotationApplicationResultV5 =
  | Readonly<{
      ok: true;
      status: 'ready' | 'verified-and-read-back';
      mediaType:
        | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
        | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
        | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
        | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;
      readback: PatternImportDxfPhaseETopologyAnnotationReadbackV5;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      mediaType: null;
      readback: null;
      blockers: readonly [Readonly<{ code: string; detail: string }>];
    }>;

type SidecarService = Pick<AdminService, 'GetTechCardPatternSemanticSidecar'>;

export type PatternImportDxfPhaseETopologyAnnotationApplicationTransactionDepsV5 = Readonly<{
  createClient: (signal: AbortSignal) => SidecarService;
  persistence: PatternImportDxfProductCompositeSidecarProductionPersistenceV5;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 4 * 1024 * 1024;

function blocked(
  code: string,
  detail: string,
): PatternImportDxfPhaseETopologyAnnotationApplicationResultV5 {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    mediaType: null,
    readback: null,
    blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]) as readonly [
      Readonly<{ code: string; detail: string }>,
    ],
  });
}

function sameAuthority(
  left: PatternImportDxfProductCompositeSidecarBindingsV3,
  right: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    left.row.techCardId === right.row.techCardId &&
    left.row.scopeKey === right.row.scopeKey &&
    left.row.patternLineKey === right.row.patternLineKey &&
    left.row.revision === right.row.revision &&
    left.row.cardLockVersion === right.row.cardLockVersion &&
    left.row.url === right.row.url &&
    left.row.sizeBytes === right.row.sizeBytes &&
    left.row.sha256 === right.row.sha256 &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.assemblyTopologySha256 === right.assemblyTopologySha256
  );
}

function sameRowAndRevision(
  left: PatternImportDxfProductCompositeSidecarBindingsV3,
  right: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    left.row.techCardId === right.row.techCardId &&
    left.row.scopeKey === right.row.scopeKey &&
    left.row.patternLineKey === right.row.patternLineKey &&
    left.row.revision === right.row.revision &&
    left.row.cardLockVersion === right.row.cardLockVersion &&
    left.row.url === right.row.url &&
    left.row.sizeBytes === right.row.sizeBytes &&
    left.row.sha256 === right.row.sha256 &&
    left.serverAssemblyRevision === right.serverAssemblyRevision
  );
}

function authorityFromSession(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): PatternImportDxfProductCompositeSidecarBindingsV3 {
  return Object.freeze({
    row: session.current.row,
    serverAssemblyRevision: session.current.serverAssemblyRevision,
    assemblyTopologySha256: session.current.assemblyTopologySha256,
  });
}

function base64Bytes(value: unknown, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    !Number.isSafeInteger(expectedLength) ||
    expectedLength < 1 ||
    expectedLength > MAX_BYTES
  )
    throw new TypeError('Current annotation sidecar envelope is invalid.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new TypeError('Current annotation sidecar bytes are not base64.');
  }
  if (binary.length !== expectedLength)
    throw new TypeError('Current annotation sidecar byte length changed.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sourceMatchesSession(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  source: PatternImportDxfPhaseETopologyAnnotationSourceV5,
): boolean {
  return (
    !!source.identity &&
    !!source.revision &&
    SHA256.test(source.sha256) &&
    source.projection.expectedCatalogCanonicalSha256 === session.current.catalogCanonicalSha256 &&
    source.projection.sizeToken.length > 0
  );
}

function resolvedAnchor(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  anchor: PatternImportDxfPhaseEMeasurementV1['anchors'][number],
) {
  const resolved = resolvePatternImportDxfPhaseEVertexV1(projection, anchor);
  if (!resolved)
    throw new TypeError('An annotation anchor is absent from the current exact projection.');
  return Object.freeze({ ...anchor, pointMm: resolved.pointMm });
}

export function encodePatternImportDxfPhaseETopologyAnnotationDraftV5(
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  source: PatternImportDxfPhaseETopologyAnnotationSourceV5,
  annotations: Readonly<{
    measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
    callouts: readonly PatternImportDxfPhaseECalloutV1[];
  }>,
  crypto?: Pick<Crypto, 'subtle'>,
) {
  return encodePatternImportDxfPhaseETopologyAnnotationsV1(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
      bindings: derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1(authority, {
        identity: source.identity,
        revision: source.revision,
        sha256: source.sha256,
      }),
      measurements: annotations.measurements.map((measurement) => ({
        ...measurement,
        anchors: measurement.anchors.map((anchor) => resolvedAnchor(source.projection, anchor)),
      })),
      callouts: annotations.callouts.map((callout) => ({
        ...callout,
        anchor: resolvedAnchor(source.projection, callout.anchor),
      })),
    },
    crypto,
  );
}

export function createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5(
  deps: PatternImportDxfPhaseETopologyAnnotationApplicationTransactionDepsV5,
) {
  const readCurrent = async (
    session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
    source: PatternImportDxfPhaseETopologyAnnotationSourceV5,
    signal: AbortSignal,
  ) => {
    const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(session, 0);
    if (!resolved.ok) throw new TypeError(resolved.blockers[0].detail);
    if (!sourceMatchesSession(session, source))
      throw new TypeError('The reconstructed projection/source binding is stale.');
    if (signal.aborted) throw new DOMException('Annotation readback cancelled.', 'AbortError');
    const authority = authorityFromSession(session);
    const response = await deps.createClient(signal).GetTechCardPatternSemanticSidecar({
      techCardId: authority.row.techCardId,
      patternLineKey: authority.row.patternLineKey,
    });
    if (signal.aborted) throw new DOMException('Annotation readback cancelled.', 'AbortError');
    const row = response.semanticSidecar;
    if (
      !row ||
      row.techCardId !== authority.row.techCardId ||
      row.patternLineKey !== authority.row.patternLineKey ||
      row.dxfSha256 !== authority.row.sha256 ||
      row.savedRowRevision !== authority.row.revision ||
      row.cardLockVersion !== authority.row.cardLockVersion ||
      typeof row.sidecarSha256 !== 'string' ||
      !SHA256.test(row.sidecarSha256) ||
      !Number.isSafeInteger(row.byteLength) ||
      (row.byteLength as number) < 1 ||
      (row.byteLength as number) > MAX_BYTES
    )
      throw new TypeError('Fresh annotation sidecar readback differs from exact authority.');
    const bytes = base64Bytes(row.sidecarBytes, row.byteLength as number);
    if (row.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4) {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV4(bytes, deps.crypto);
      if (
        !decoded.ok ||
        !sameAuthority(decoded.document.bindings, authority) ||
        decoded.seal.canonicalSha256 !== row.sidecarSha256
      )
        throw new TypeError('Fresh Composite V4 annotation base is invalid.');
      return Object.freeze({
        mediaType: row.mediaType,
        sidecarSha256: row.sidecarSha256,
        nestedV4Bytes: bytes,
        restored: Object.freeze({ measurements: Object.freeze([]), callouts: Object.freeze([]) }),
      });
    }
    let decodedV5: Extract<
      Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV5>>,
      { ok: true }
    >;
    let mediaType:
      | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
      | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
      | typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;
    let outerBindings: PatternImportDxfProductCompositeSidecarBindingsV3;
    let outerCanonicalSha256: string;
    if (row.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5) {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV5(bytes, deps.crypto);
      if (!decoded.ok) throw new TypeError(decoded.blockers[0].detail);
      decodedV5 = decoded;
      mediaType = PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5;
      outerBindings = decoded.document.bindings;
      outerCanonicalSha256 = decoded.seal.canonicalSha256;
    } else if (row.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6) {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV6(bytes, deps.crypto);
      if (!decoded.ok) throw new TypeError(decoded.blockers[0].detail);
      decodedV5 = decoded.nestedCompositeV5;
      mediaType = PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6;
      outerBindings = decoded.document.bindings;
      outerCanonicalSha256 = decoded.seal.canonicalSha256;
    } else if (row.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV7(bytes, deps.crypto);
      if (!decoded.ok) throw new TypeError(decoded.blockers[0].detail);
      decodedV5 = decoded.nestedCompositeV6.nestedCompositeV5;
      mediaType = PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7;
      outerBindings = decoded.document.bindings;
      outerCanonicalSha256 = decoded.seal.canonicalSha256;
    } else {
      throw new TypeError('Current annotation sidecar is not Composite V4–V7.');
    }
    if (
      (mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7
        ? !sameRowAndRevision(outerBindings, authority)
        : !sameAuthority(outerBindings, authority)) ||
      !sameAuthority(decodedV5.document.bindings, authority) ||
      outerCanonicalSha256 !== row.sidecarSha256
    )
      throw new TypeError('Fresh Composite V5–V7 annotation readback is invalid.');
    const nestedV4Bytes = readPatternImportDxfProductCompositeComponentBytesV5(
      decodedV5.owner,
      'composite-v4',
    );
    if (!nestedV4Bytes) throw new TypeError('Composite V5 has no verified V4 base.');
    const restored = restorePatternImportDxfPhaseETopologyAnnotationsV5(decodedV5.owner, {
      bindings: authority,
      sourceIdentity: source.identity,
      sourceRevision: source.revision,
      sourceSha256: source.sha256,
    });
    if (!restored.ok) throw new TypeError(restored.blockers[0].detail);
    return Object.freeze({
      mediaType,
      sidecarSha256: row.sidecarSha256,
      nestedV4Bytes,
      restored: Object.freeze({
        measurements: restored.measurements,
        callouts: restored.callouts,
      }),
    });
  };

  const load = async (
    session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
    source: PatternImportDxfPhaseETopologyAnnotationSourceV5,
    signal: AbortSignal,
  ): Promise<PatternImportDxfPhaseETopologyAnnotationApplicationResultV5> => {
    try {
      const current = await readCurrent(session, source, signal);
      return Object.freeze({
        ok: true as const,
        status: 'ready' as const,
        mediaType: current.mediaType,
        readback: Object.freeze({
          ...current.restored,
          sidecarSha256: current.sidecarSha256,
        }),
        blockers: Object.freeze([]) as readonly [],
      });
    } catch (error) {
      return blocked(
        signal.aborted ? 'cancelled' : 'annotation-readback-blocked',
        error instanceof Error ? error.message : 'Annotation readback failed closed.',
      );
    }
  };

  const save = async (
    session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
    source: PatternImportDxfPhaseETopologyAnnotationSourceV5,
    annotations: Readonly<{
      measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
      callouts: readonly PatternImportDxfPhaseECalloutV1[];
    }>,
    signal: AbortSignal,
    expectedPreviousSidecarSha256?: string,
  ): Promise<PatternImportDxfPhaseETopologyAnnotationApplicationResultV5> => {
    try {
      const current = await readCurrent(session, source, signal);
      if (
        expectedPreviousSidecarSha256 !== undefined &&
        expectedPreviousSidecarSha256 !== current.sidecarSha256
      )
        throw new TypeError('Saved annotations changed. Reload them before saving your edits.');
      if (
        current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 ||
        current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7
      )
        throw new TypeError(
          'Composite V6/V7 annotations require the versioned rewrap lane; the V5 writer will not overwrite arrangement or fullgraph bytes.',
        );
      const authority = authorityFromSession(session);
      const encodedAnnotations = await encodePatternImportDxfPhaseETopologyAnnotationDraftV5(
        authority,
        source,
        annotations,
        deps.crypto,
      );
      if (!encodedAnnotations.ok) throw new TypeError(encodedAnnotations.blocker.detail);
      const next = await buildPatternImportDxfProductCompositeSidecarV5(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
          bindings: authority,
          expectedPreviousSidecarSha256: current.sidecarSha256,
          compositeV4Bytes: current.nestedV4Bytes,
          topologyAnnotationsBytes: encodedAnnotations.bytes,
        },
        deps.crypto,
      );
      if (!next.ok) throw new TypeError(next.blockers[0].detail);
      const persisted = await deps.persistence.adapter.persist(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
          currentAuthority: authority,
          nextOwner: next.owner,
        },
        signal,
      );
      if (!persisted.ok)
        throw new TypeError(persisted.blockers[0]?.detail ?? 'Composite V5 Save failed closed.');
      const readback = await readCurrent(session, source, signal);
      if (
        readback.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 ||
        readback.sidecarSha256 !== persisted.receipt.sidecarSha256
      )
        throw new TypeError('Fresh annotation readback differs from the verified Save receipt.');
      return Object.freeze({
        ok: true as const,
        status: 'verified-and-read-back' as const,
        mediaType: readback.mediaType,
        readback: Object.freeze({
          ...readback.restored,
          sidecarSha256: readback.sidecarSha256,
        }),
        blockers: Object.freeze([]) as readonly [],
      });
    } catch (error) {
      return blocked(
        signal.aborted ? 'cancelled' : 'annotation-save-blocked',
        error instanceof Error ? error.message : 'Annotation Save failed closed.',
      );
    }
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_APPLICATION_TRANSACTION_V5,
    persistence: deps.persistence,
    load,
    save,
    claims: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATION_APPLICATION_TRANSACTION_CLAIMS_V5,
  });
}

export type PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5 = ReturnType<
  typeof createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5
>;
