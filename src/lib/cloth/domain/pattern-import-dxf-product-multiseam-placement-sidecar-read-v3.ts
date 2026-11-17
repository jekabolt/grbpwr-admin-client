import {
  patternImportDxfProductPlacementReadTransportV1,
  type PatternImportDxfProductMultiseamPlacementSidecarReadHostV2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductMultiseamPlacementSidecarV3,
  type PatternImportDxfProductMultiseamPlacementSidecarDocumentV3,
  type PatternImportDxfProductMultiseamPlacementSidecarSealV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v3';
export const PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3 =
  'pattern-import-dxf-product-multiseam-placement-sidecar-read-request/3' as const;
const OWNER =
  'pattern-import-dxf-product-multiseam-placement-sidecar-verified-read-owner/3' as const;
export type PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3 = Omit<
  PatternImportDxfProductMultiseamPlacementSidecarReadRequestV2,
  'schemaVersion'
> &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3;
  }>;
export type PatternImportDxfProductMultiseamPlacementSidecarReadHostV3 =
  PatternImportDxfProductMultiseamPlacementSidecarReadHostV2;
const CLAIMS = Object.freeze({
  freshGetPerformed: true,
  envelopeAndCanonicalBytesVerified: true,
  sourceRowTopologyBindingsVerified: true,
  prePostCurrentEvidenceVerified: true,
  decodedTargetAuthenticatesBody: false,
  bodyAdmission: false,
  runtimeAdmission: false,
  putPerformed: false,
} as const);
export type PatternImportDxfProductMultiseamPlacementSidecarReadReportV3 = Readonly<{
  row: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3['expectedRow'];
  topology: PatternImportDxfProductMultiseamPlacementSidecarReadRequestV3['expectedBindings']['topology'];
  sidecar: Readonly<{
    canonicalSha256: string;
    canonicalByteLength: number;
    mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3;
  }>;
}>;
declare const brand: unique symbol;
export type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3 = Readonly<{
  schemaVersion: typeof OWNER;
  document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3;
  placementAuthoring: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3['placementAuthoring'];
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV3;
  report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV3;
  claims: typeof CLAIMS;
  readonly [brand]: never;
}>;
export type PatternImportDxfProductMultiseamPlacementSidecarReadResultV3 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3;
      report: PatternImportDxfProductMultiseamPlacementSidecarReadReportV3;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      owner: null;
      report: null;
      blockers: readonly [Readonly<{ code: 'read-blocked'; detail: string }>];
    }>;
const owners = new WeakSet<object>();
const t = patternImportDxfProductPlacementReadTransportV1;
export function isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(
  candidate: unknown,
): candidate is PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3 {
  return !!candidate && typeof candidate === 'object' && owners.has(candidate);
}
/** Fresh GET capability only. Remembered codec owners and DTOs never enter this private registry. */
export async function readPatternImportDxfProductMultiseamPlacementSidecarV3(
  candidate: unknown,
  host: PatternImportDxfProductMultiseamPlacementSidecarReadHostV3,
  signal: AbortSignal = new AbortController().signal,
): Promise<PatternImportDxfProductMultiseamPlacementSidecarReadResultV3> {
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  try {
    const request = t.captureRequest(
      candidate,
      PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
    );
    const h = t.captureHost(host);
    const expected = Object.freeze({
      row: request.expectedRow,
      topology: request.expectedBindings.topology,
    });
    await t.requireCurrentEvidence(h.readCurrentEvidence, expected, signal, 'before-get');
    t.checkCancelled(signal);
    const read = t.captureReadback(
      await h.getSidecar(
        {
          techCardId: request.expectedRow.techCardId,
          patternLineKey: request.expectedRow.patternLineKey,
        },
        signal,
      ),
    );
    t.checkCancelled(signal);
    if (read.status !== 'found') throw new TypeError('Observed placement is absent.');
    const envelope = t.captureObservedEnvelope(
      read.row,
      request.expectedBindings.row,
      PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3,
    );
    bytes = t.decodeBase64(envelope.sidecarBytes, envelope.byteLength);
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV3(bytes, h.crypto);
    t.checkCancelled(signal);
    if (!decoded.ok) throw new TypeError(decoded.blockers[0].detail);
    if (
      decoded.seal.canonicalSha256 !== envelope.sidecarSha256 ||
      decoded.seal.canonicalByteLength !== envelope.byteLength ||
      !t.same(decoded.document.bindings, request.expectedBindings)
    )
      throw new TypeError('Observed placement digest, bytes or exact source bindings differ.');
    await t.requireCurrentEvidence(h.readCurrentEvidence, expected, signal, 'after-decode');
    t.checkCancelled(signal);
    const report = t.deepFreeze({
      row: request.expectedRow,
      topology: request.expectedBindings.topology,
      sidecar: {
        canonicalSha256: decoded.seal.canonicalSha256,
        canonicalByteLength: decoded.seal.canonicalByteLength,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_MEDIA_TYPE_V3,
      },
    });
    const owner = Object.freeze({
      schemaVersion: OWNER,
      document: decoded.document,
      placementAuthoring: decoded.document.placementAuthoring,
      seal: decoded.seal,
      report,
      claims: CLAIMS,
    }) as PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3;
    owners.add(owner);
    return Object.freeze({ ok: true, owner, report, blockers: Object.freeze([]) as readonly [] });
  } catch (error) {
    return Object.freeze({
      ok: false,
      owner: null,
      report: null,
      blockers: Object.freeze([
        Object.freeze({
          code: 'read-blocked',
          detail:
            error instanceof Error
              ? error.message.slice(0, 2048)
              : 'Observed placement read failed.',
        }),
      ]) as readonly [Readonly<{ code: 'read-blocked'; detail: string }>],
    });
  } finally {
    bytes?.fill(0);
  }
}
