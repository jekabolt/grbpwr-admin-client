import {
  readPatternImportDxfProductMultiseamPlacementSidecarV3,
  type PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  readPatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadHostV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
} from './composite-sidecar-v4';

type Evidence = PatternImportDxfProductMultiseamPlacementSidecarReadCurrentEvidenceV2 &
  Readonly<{ serverAssemblyRevision: string }>;

export type PatternImportDxfProductCompositePlacementReadHostV1 = Readonly<{
  getSidecar: PatternImportDxfProductMultiseamPlacementSidecarReadHostV2['getSidecar'];
  readCurrentEvidence: (expected: Evidence, signal: AbortSignal) => Promise<Evidence>;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

const MAX_BYTES = 24 * 1024 * 1024;

function data(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor))
    throw new TypeError(`Composite GET ${key} is not a data property.`);
  return descriptor.value;
}

function decodeBytes(value: unknown, length: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    !Number.isSafeInteger(length) ||
    (length as number) < 1 ||
    (length as number) > MAX_BYTES ||
    value.length !== 4 * Math.ceil((length as number) / 3)
  )
    throw new TypeError('Composite GET byte length is invalid.');
  const binary = atob(value);
  if (binary.length !== length || btoa(binary) !== value)
    throw new TypeError('Composite GET base64 is not canonical.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Reads the persisted placement component through the existing V2 verified-read owner. The
 * actual GET returns the Composite V3/V4 envelope; only its verified embedded component is
 * adapted to V2. This neither writes a sidecar nor turns exact-N consistency into authority.
 */
function createCompositePlacementReadHost(
  request:
    | PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2
    | PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3,
  serverAssemblyRevision: string,
  host: PatternImportDxfProductCompositePlacementReadHostV1,
  observed: boolean,
) {
  // Capture caller intent before the first asynchronous host call.
  const captured = structuredClone(request);
  const revision = serverAssemblyRevision;
  const getSidecar = host.getSidecar;
  const readCurrentEvidence = host.readCurrentEvidence;
  const crypto = host.crypto;
  return {
    captured,
    host: {
      crypto,
      readCurrentEvidence: async (expected, currentSignal) => {
        if (typeof revision !== 'string' || !revision || revision.length > 512)
          throw new TypeError('The current server Assembly Order revision is required.');
        const current = await readCurrentEvidence(
          { ...expected, serverAssemblyRevision: revision },
          currentSignal,
        );
        if (data(current, 'serverAssemblyRevision') !== revision)
          throw new TypeError('The server Assembly Order revision changed during placement read.');
        return {
          row: data(current, 'row') as Evidence['row'],
          topology: data(current, 'topology') as Evidence['topology'],
        };
      },
      getSidecar: async (expected, currentSignal) => {
        const read = await getSidecar(expected, currentSignal);
        if (read.status === 'absent') return read;
        const envelope = read.row;
        const mediaType = data(envelope, 'mediaType');
        if (
          mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 &&
          mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
        )
          return read;
        const bytes = decodeBytes(data(envelope, 'sidecarBytes'), data(envelope, 'byteLength'));
        const decoded =
          mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
            ? await decodePatternImportDxfProductCompositeSidecarV4(bytes, crypto)
            : await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
        if (!decoded.ok) throw new TypeError(decoded.blockers[0].detail);
        if (
          decoded.seal.canonicalSha256 !== data(envelope, 'sidecarSha256') ||
          decoded.seal.canonicalByteLength !== bytes.byteLength
        )
          throw new TypeError('The Composite GET digest differs from the canonical bytes.');
        const { bindings } = decoded.document;
        const row = captured.expectedRow;
        if (
          bindings.serverAssemblyRevision !== revision ||
          bindings.assemblyTopologySha256 !==
            captured.expectedBindings.topology.assemblyTopologySha256 ||
          Object.keys(row).some(
            (key) => bindings.row[key as keyof typeof row] !== row[key as keyof typeof row],
          )
        )
          throw new TypeError('The Composite GET no longer matches the saved row and Assembly.');
        const nested = 'nestedCompositeV3' in decoded ? decoded.nestedCompositeV3 : decoded;
        const placement = observed ? nested.observedPlacementDocument : nested.placementDocument;
        const kind = observed ? 'multiseam-placement-v3' : 'multiseam-placement-v2';
        const placementBytes = readPatternImportDxfProductCompositeComponentBytesV3(
          nested.owner,
          kind,
        );
        const component = nested.document.components.find((candidate) => candidate.kind === kind);
        if (!placement || !placementBytes || !component)
          throw new TypeError('The saved Composite contains no confirmed placement.');
        // Check the original transport identity before adapting embedded component metadata.
        const identity = placement.bindings.row;
        const transportFields = {
          techCardId: identity.techCardId,
          patternLineKey: identity.patternLineKey,
          dxfSha256: identity.dxfSha256,
          patternVersion: identity.patternVersion,
          postSaveReceiptSha256: identity.postSaveReceiptSha256,
          cardLockVersion: identity.cardLockVersion,
        };
        if (
          Object.entries(transportFields).some(([key, value]) => data(envelope, key) !== value) ||
          (Object.hasOwn(envelope, 'savedRowRevision') &&
            data(envelope, 'savedRowRevision') !== undefined &&
            data(envelope, 'savedRowRevision') !== identity.revision)
        )
          throw new TypeError('The Composite transport identity differs from its placement.');
        const embedded: TechCardPatternSemanticSidecar = {
          ...transportFields,
          savedRowRevision: identity.revision,
          sidecarSha256: component.sha256,
          byteLength: component.byteLength,
          sidecarBytes: encodeBytes(placementBytes),
          mediaType: component.mediaType,
          createdAt: undefined,
          createdBy: undefined,
        };
        return { status: 'found', row: embedded };
      },
    } satisfies PatternImportDxfProductMultiseamPlacementSidecarReadHostV2,
  };
}

export function readPatternImportDxfProductCompositePlacementV1(
  request: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
  serverAssemblyRevision: string,
  host: PatternImportDxfProductCompositePlacementReadHostV1,
  signal?: AbortSignal,
) {
  const captured = createCompositePlacementReadHost(request, serverAssemblyRevision, host, false);
  return readPatternImportDxfProductMultiseamPlacementSidecarV2(
    captured.captured,
    captured.host,
    signal,
  );
}
/** Fixed V3 dispatcher: verified observed-target bytes enter only the V3 fresh-read registry. */
export function readPatternImportDxfProductCompositeObservedPlacementV3(
  request: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3,
  serverAssemblyRevision: string,
  host: PatternImportDxfProductCompositePlacementReadHostV1,
  signal?: AbortSignal,
) {
  const captured = createCompositePlacementReadHost(request, serverAssemblyRevision, host, true);
  return readPatternImportDxfProductMultiseamPlacementSidecarV3(
    captured.captured,
    captured.host,
    signal,
  );
}

/** Uses the existing abortable generated GET; the Assembly host supplies fresh row/AO evidence. */
export function createPatternImportDxfProductCompositePlacementProductionReaderV1(
  readCurrentEvidence: PatternImportDxfProductCompositePlacementReadHostV1['readCurrentEvidence'],
) {
  const host: PatternImportDxfProductCompositePlacementReadHostV1 = {
    readCurrentEvidence,
    getSidecar: async (request, signal) => {
      const { abortableAdminService } = await import('api/api');
      if (signal.aborted) throw new DOMException('Placement read cancelled.', 'AbortError');
      try {
        const response =
          await abortableAdminService(signal).GetTechCardPatternSemanticSidecar(request);
        if (!response.semanticSidecar)
          throw new TypeError('Placement GET did not return a sidecar envelope.');
        return { status: 'found', row: response.semanticSidecar };
      } catch (error) {
        const status =
          error && typeof error === 'object'
            ? Object.getOwnPropertyDescriptor(error, 'status')
            : null;
        if (status && 'value' in status && status.value === 404) return { status: 'absent' };
        throw error;
      }
    },
  };
  return Object.freeze({
    readObserved: (
      request: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3,
      serverAssemblyRevision: string,
      signal?: AbortSignal,
    ) =>
      readPatternImportDxfProductCompositeObservedPlacementV3(
        request,
        serverAssemblyRevision,
        host,
        signal,
      ),
    read: (
      request: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
      serverAssemblyRevision: string,
      signal?: AbortSignal,
    ) =>
      readPatternImportDxfProductCompositePlacementV1(
        request,
        serverAssemblyRevision,
        host,
        signal,
      ),
  });
}
