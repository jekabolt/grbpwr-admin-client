import type { ObservedPlacementSidecarIssuedOwnerV3 } from 'components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
  type PatternImportDxfProductMultiseamPlacementSidecarReadResultV3,
  type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import { abortableAdminService as productionClient } from 'api/api';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3,
  createPatternImportDxfProductCompositeSidecarStorageAdapterV3,
  type PatternImportDxfProductCompositeSidecarStorageDepsV3,
  type PatternImportDxfProductCompositeSidecarStorageResultV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import {
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementBindingsV2,
  type PatternImportDxfProductMultiseamPlacementSidecarOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
  type PatternImportDxfProductMultiseamPlacementSidecarReadResultV2,
  type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';

import {
  readPatternImportDxfProductCompositePlacementV1,
  readPatternImportDxfProductCompositeObservedPlacementV3,
} from './composite-placement-read-v1';
import { createPatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from './composite-sidecar-production-transaction-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4 } from './composite-sidecar-persistence-v4';
import type { PatternImportDxfProductCompositeSidecarRestoreRequestV4 } from './composite-sidecar-restore-authority-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4,
  type PatternImportDxfProductCompositeSidecarTransactionResultV4,
} from './composite-sidecar-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  decodePatternImportDxfProductCompositeSidecarV4,
  readPatternImportDxfProductCompositeComponentBytesV4,
} from './composite-sidecar-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 } from './composite-sidecar-v7';

export type PatternImportDxfProductCompositePlacementSaveCurrentV1 = Readonly<{
  authority: PatternImportDxfProductCompositeSidecarBindingsV3;
  placementBindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
  exactNCurrent: PatternImportDxfProductCompositeSidecarRestoreRequestV4['current'] | null;
}>;

export type PatternImportDxfProductCompositePlacementSaveRequestV1 = Readonly<{
  confirmed: true;
  placementOwner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV2;
  expectedPreviousOuterSha256: string;
  current: PatternImportDxfProductCompositePlacementSaveCurrentV1;
}>;

export type PatternImportDxfProductCompositePlacementSaveHostV1 =
  PatternImportDxfProductCompositeSidecarStorageDepsV3 &
    Readonly<{
      /** Must read current saved row, Assembly and compiled source bindings from their owners. */
      readCurrentEvidence: (
        expected: PatternImportDxfProductCompositePlacementSaveCurrentV1,
        signal: AbortSignal,
      ) => Promise<PatternImportDxfProductCompositePlacementSaveCurrentV1>;
    }>;

type Persistence =
  | PatternImportDxfProductCompositeSidecarStorageResultV3
  | PatternImportDxfProductCompositeSidecarTransactionResultV4;
type PlacementRead =
  | PatternImportDxfProductMultiseamPlacementSidecarReadResultV2
  | PatternImportDxfProductMultiseamPlacementSidecarReadResultV3;

type SaveResultDetails = Readonly<{
  writeOutcome: Persistence['writeOutcome'];
  persistence: Persistence | null;
  readback: PlacementRead | null;
  blockers: readonly Readonly<{ code: string; detail: string }>[];
  uiIntegrated: false;
  runtimeReady: false;
}>;

export type PatternImportDxfProductCompositePlacementSaveResultV1 = SaveResultDetails &
  (
    | Readonly<{
        ok: true;
        owner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
        writeOutcome: 'verified';
      }>
    | Readonly<{ ok: false; owner: null }>
  );

export type PatternImportDxfProductCompositeObservedPlacementSaveRequestV3 = Omit<
  PatternImportDxfProductCompositePlacementSaveRequestV1,
  'placementOwner'
> &
  Readonly<{ placementOwner: ObservedPlacementSidecarIssuedOwnerV3 }>;
export type PatternImportDxfProductCompositeObservedPlacementSaveResultV3 = SaveResultDetails &
  (
    | Readonly<{
        ok: true;
        owner: PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3;
        writeOutcome: 'verified';
      }>
    | Readonly<{ ok: false; owner: null }>
  );
type OldSaver = Readonly<{
  save: (
    request: PatternImportDxfProductCompositePlacementSaveRequestV1,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductCompositePlacementSaveResultV1>;
}>;
type ObservedSaver = Readonly<{
  save: (
    request: PatternImportDxfProductCompositeObservedPlacementSaveRequestV3,
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductCompositeObservedPlacementSaveResultV3>;
}>;
export function createPatternImportDxfProductCompositePlacementSaverV1(
  host: PatternImportDxfProductCompositePlacementSaveHostV1,
): OldSaver {
  return createPlacementSaver(host, false);
}
export function createPatternImportDxfProductCompositeObservedPlacementSaverV3(
  host: PatternImportDxfProductCompositePlacementSaveHostV1,
): ObservedSaver {
  return createPlacementSaver(host, true);
}
const activeScopes = new Set<string>();
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 24 * 1024 * 1024;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function checkSignal(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Placement save cancelled.', 'AbortError');
}

function envelopeBytes(row: TechCardPatternSemanticSidecar): Uint8Array<ArrayBuffer> {
  if (
    !Number.isSafeInteger(row.byteLength) ||
    (row.byteLength as number) < 1 ||
    (row.byteLength as number) > MAX_BYTES ||
    typeof row.sidecarBytes !== 'string' ||
    row.sidecarBytes.length !== 4 * Math.ceil((row.byteLength as number) / 3)
  )
    throw new TypeError('Current Composite byte length is invalid.');
  const binary = atob(row.sidecarBytes);
  if (binary.length !== row.byteLength || btoa(binary) !== row.sidecarBytes)
    throw new TypeError('Current Composite bytes are not canonical base64.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Adds only explicitly confirmed Placement V2 bytes using the existing single storage writers. */
function createPlacementSaver(
  host: PatternImportDxfProductCompositePlacementSaveHostV1,
  observed: false,
): OldSaver;
// eslint-disable-next-line no-redeclare -- TypeScript overloads preserve each fixed version API.
function createPlacementSaver(
  host: PatternImportDxfProductCompositePlacementSaveHostV1,
  observed: true,
): ObservedSaver;
// eslint-disable-next-line no-redeclare -- TypeScript overloads preserve each fixed version API.
function createPlacementSaver(
  host: PatternImportDxfProductCompositePlacementSaveHostV1,
  observed: boolean,
) {
  const createClient = host.createClient;
  const readCurrentEvidence = host.readCurrentEvidence;
  const crypto = host.crypto;
  const v3 = createPatternImportDxfProductCompositeSidecarStorageAdapterV3({
    createClient,
    crypto,
  });
  const v4 = createPatternImportDxfProductCompositeSidecarApplicationTransactionV4({
    createClient,
    crypto,
  });

  return Object.freeze({
    async save(
      request:
        | PatternImportDxfProductCompositePlacementSaveRequestV1
        | PatternImportDxfProductCompositeObservedPlacementSaveRequestV3,
      signal: AbortSignal = new AbortController().signal,
    ): Promise<
      | PatternImportDxfProductCompositePlacementSaveResultV1
      | PatternImportDxfProductCompositeObservedPlacementSaveResultV3
    > {
      let scope: string | null = null;
      let unlinkIssuedLifetime = () => {};
      let persistence: Persistence | null = null;
      let readback: PlacementRead | null = null;
      let writeOutcome: Persistence['writeOutcome'] = 'not-attempted';
      const blocked = (
        code: string,
        detail: string,
      ): PatternImportDxfProductCompositePlacementSaveResultV1 =>
        Object.freeze({
          ok: false,
          owner: null,
          writeOutcome,
          persistence,
          // Never leak an accepted placement owner through diagnostics after cancellation or mismatch.
          readback: readback?.ok ? null : readback,
          blockers: Object.freeze([Object.freeze({ code, detail: detail.slice(0, 2_048) })]),
          uiIntegrated: false,
          runtimeReady: false,
        });
      try {
        checkSignal(signal);
        if (request.confirmed !== true || !SHA256.test(request.expectedPreviousOuterSha256))
          return blocked(
            'confirmation-required',
            'Confirmed placement and previous outer SHA are required.',
          );
        // Capture the complete confirmed save intent before the first observed-owner await.
        const placementOwner = request.placementOwner;
        const current = structuredClone(request.current);
        const expectedPrevious = request.expectedPreviousOuterSha256;
        const issuer = observed
          ? await import('components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3')
          : null;
        if (issuer) {
          const issuerLifetime = issuer.getObservedPlacementSidecarIssuedLifetimeV3(placementOwner);
          if (!issuerLifetime)
            return blocked(
              'invalid-placement-owner',
              'A current genuine observed placement issuer is required.',
            );
          const callerSignal = signal;
          const nativeAborted = Object.getOwnPropertyDescriptor(
            AbortSignal.prototype,
            'aborted',
          )!.get!;
          const wasCallerAborted = nativeAborted.call(callerSignal);
          const operation = new AbortController();
          const cancel = () => operation.abort();
          unlinkIssuedLifetime = () => {
            EventTarget.prototype.removeEventListener.call(callerSignal, 'abort', cancel);
            EventTarget.prototype.removeEventListener.call(issuerLifetime, 'abort', cancel);
          };
          EventTarget.prototype.addEventListener.call(callerSignal, 'abort', cancel, {
            once: true,
          });
          EventTarget.prototype.addEventListener.call(issuerLifetime, 'abort', cancel, {
            once: true,
          });
          if (
            wasCallerAborted ||
            nativeAborted.call(callerSignal) ||
            nativeAborted.call(issuerLifetime)
          )
            operation.abort();
          signal = operation.signal;
        }

        const observedProjection = issuer
          ? await issuer.projectObservedPlacementSidecarIssuedV3(placementOwner, signal)
          : null;
        const placement = observed
          ? observedProjection
          : encodePatternImportDxfProductMultiseamPlacementSidecarV2(placementOwner);
        if (!placement?.ok)
          return blocked(
            'invalid-placement-owner',
            observed
              ? 'A current genuine observed placement issuer is required.'
              : 'A genuine Placement V2 codec owner is required.',
          );
        const placementDocument =
          observedProjection?.document ??
          ('document' in placementOwner ? placementOwner.document : null);
        if (!placementDocument)
          return blocked('invalid-placement-owner', 'Placement document is unavailable.');

        if (canonical(placementDocument.bindings) !== canonical(current.placementBindings))
          return blocked(
            'placement-binding-mismatch',
            'Confirmed placement differs from the current source bindings.',
          );
        const { authority, placementBindings } = current;
        const row = authority.row;
        const placementRow = placementBindings.row;
        if (
          row.techCardId !== placementRow.techCardId ||
          row.patternLineKey !== placementRow.patternLineKey ||
          row.scopeKey !== placementRow.scopeKey ||
          row.revision !== placementRow.revision ||
          row.cardLockVersion !== placementRow.cardLockVersion ||
          row.url !== placementRow.patternUrl ||
          row.sha256 !== placementRow.dxfSha256 ||
          authority.assemblyTopologySha256 !== placementBindings.topology.assemblyTopologySha256
        )
          return blocked(
            'placement-binding-mismatch',
            'Placement and current saved row/Assembly differ.',
          );
        const key = JSON.stringify([row.techCardId, row.patternLineKey]);
        if (activeScopes.has(key))
          return blocked(
            'concurrent-save',
            'A placement save for this saved pattern is already running.',
          );
        activeScopes.add(key);
        scope = key;
        const revalidate = async () => {
          checkSignal(signal);
          if (issuer) {
            const latest = await issuer.projectObservedPlacementSidecarIssuedV3(
              placementOwner,
              signal,
            );
            checkSignal(signal);
            if (!latest || latest.canonicalSha256 !== placement.canonicalSha256)
              throw new TypeError('Confirmed observed target or genuine authoring source changed.');
          }
          const fresh = await readCurrentEvidence(structuredClone(current), signal);
          checkSignal(signal);
          if (canonical(fresh) !== canonical(current))
            throw new TypeError('Current saved row, Assembly or source evidence changed.');
        };
        const get = async () => {
          checkSignal(signal);
          const response = await createClient(signal).GetTechCardPatternSemanticSidecar({
            techCardId: row.techCardId,
            patternLineKey: row.patternLineKey,
          });
          checkSignal(signal);
          if (!response.semanticSidecar)
            throw new TypeError('Current Composite sidecar is absent.');
          return response.semanticSidecar;
        };
        await revalidate();
        const envelope = await get();
        if (envelope.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7)
          return blocked(
            'fullgraph-reissue-required',
            'Placement changed under Composite V7. The nested placement and registered fullgraph must be reissued through the V7 transition lane; the legacy writer will not overwrite them.',
          );
        if (
          envelope.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 &&
          envelope.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
        )
          return blocked(
            'unsupported-current-sidecar',
            'Only an existing Composite V3 or V4 may receive placement.',
          );
        if (envelope.sidecarSha256 !== expectedPrevious)
          return blocked(
            'outer-cas-mismatch',
            'Current Composite differs from the confirmed previous outer SHA.',
          );
        if (
          envelope.techCardId !== row.techCardId ||
          envelope.patternLineKey !== row.patternLineKey ||
          envelope.dxfSha256 !== row.sha256 ||
          envelope.cardLockVersion !== row.cardLockVersion ||
          envelope.patternVersion !== placementRow.patternVersion ||
          envelope.postSaveReceiptSha256 !== placementRow.postSaveReceiptSha256 ||
          (envelope.savedRowRevision !== undefined && envelope.savedRowRevision !== row.revision)
        )
          return blocked(
            'current-envelope-binding-mismatch',
            'Current Composite transport identity differs from the saved row.',
          );
        const bytes = envelopeBytes(envelope);
        const decoded =
          envelope.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
            ? await decodePatternImportDxfProductCompositeSidecarV4(bytes, crypto)
            : await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
        if (
          !decoded.ok ||
          decoded.seal.canonicalSha256 !== expectedPrevious ||
          canonical(decoded.document.bindings) !== canonical(authority)
        )
          return blocked(
            'current-composite-invalid',
            'Current Composite bytes, digest or authority failed verification.',
          );
        const nested = 'nestedCompositeV3' in decoded ? decoded.nestedCompositeV3 : decoded;
        if (!observed && nested.observedPlacementDocument)
          return blocked(
            'newer-placement-active',
            'Existing observed Placement V3 cannot be overwritten by the historical V2 save route.',
          );
        await revalidate();
        const semantic = readPatternImportDxfProductCompositeComponentBytesV3(
          nested.owner,
          'semantic-product-v1',
        );
        if (!semantic)
          return blocked(
            'semantic-component-missing',
            'Current Composite has no semantic V1 bytes.',
          );
        const nextV3 = await buildPatternImportDxfProductCompositeSidecarV3(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
            bindings: authority,
            // Nested V3 retains its own CAS context; only the outer envelope is stored.
            expectedPreviousSidecarSha256:
              'nestedCompositeV3' in decoded
                ? nested.document.writeCas.expectedPreviousSidecarSha256
                : expectedPrevious,
            semanticProductV1Bytes: semantic,
            placementV2Bytes: observed ? null : placement.bytes,
            ...(observed ? { placementV3Bytes: placement.bytes } : {}),
            exactTopologyBytes: readPatternImportDxfProductCompositeComponentBytesV3(
              nested.owner,
              'phase-e-exact-topology-v1',
            ),
          },
          crypto,
        );
        if (!nextV3.ok) return blocked('composite-build-blocked', nextV3.blockers[0].detail);
        if ('nestedCompositeV3' in decoded) {
          if (
            !current.exactNCurrent ||
            canonical(current.exactNCurrent) !== canonical(decoded.exactNSeam.carrier.bindings)
          )
            return blocked(
              'exact-n-current-mismatch',
              'Current exact-N bindings differ from the preserved carrier.',
            );
          const nestedBytes = encodePatternImportDxfProductCompositeSidecarV3(nextV3.owner);
          const exactBytes = readPatternImportDxfProductCompositeComponentBytesV4(
            decoded.owner,
            'phase-e-exact-n-seam-consistency-v2',
          );
          if (!nestedBytes.ok || !exactBytes)
            return blocked('component-unavailable', 'Verified V4 components are unavailable.');
          const nextV4 = await buildPatternImportDxfProductCompositeSidecarV4(
            {
              schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
              bindings: authority,
              expectedPreviousSidecarSha256: expectedPrevious,
              compositeV3Bytes: nestedBytes.bytes,
              exactNSeamConsistencyBytes: exactBytes,
            },
            crypto,
          );
          if (!nextV4.ok) return blocked('composite-build-blocked', nextV4.blockers[0].detail);
          await revalidate();
          writeOutcome = 'unknown';
          persistence = await v4.transaction.execute(
            {
              schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4,
              current: current.exactNCurrent,
              storage: {
                schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
                currentAuthority: authority,
                nextOwner: nextV4.owner,
              },
            },
            signal,
          );
        } else {
          if (current.exactNCurrent)
            return blocked(
              'v4-path-required',
              'Exact-N current authority requires an existing Composite V4.',
            );
          await revalidate();
          writeOutcome = 'unknown';
          persistence = await v3.persist(
            {
              schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3,
              currentAuthority: authority,
              nextOwner: nextV3.owner,
            },
            signal,
          );
        }
        writeOutcome = persistence.writeOutcome;
        if (!persistence.ok)
          return blocked(persistence.blockers[0].code, persistence.blockers[0].detail);
        const receipt =
          'receipt' in persistence ? persistence.receipt : persistence.persistence.receipt;
        const readHost = {
          crypto,
          readCurrentEvidence: async () => {
            await revalidate();
            return {
              row: structuredClone(row),
              topology: structuredClone(placementBindings.topology),
              serverAssemblyRevision: authority.serverAssemblyRevision,
            };
          },
          getSidecar: async () => {
            const latest = await get();
            if (latest.sidecarSha256 !== receipt.sidecarSha256)
              throw new TypeError('Fresh placement read differs from the verified new outer SHA.');
            return { status: 'found' as const, row: latest };
          },
        };
        readback = observed
          ? await readPatternImportDxfProductCompositeObservedPlacementV3(
              {
                schemaVersion:
                  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
                expectedRow: row,
                expectedBindings: placementBindings,
              },
              authority.serverAssemblyRevision,
              readHost,
              signal,
            )
          : await readPatternImportDxfProductCompositePlacementV1(
              {
                schemaVersion:
                  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
                expectedRow: row,
                expectedBindings: placementBindings,
              },
              authority.serverAssemblyRevision,
              readHost,
              signal,
            );
        checkSignal(signal);
        if (
          !readback.ok ||
          ('compatibility' in readback && readback.compatibility !== 'placement-v2') ||
          !readback.owner ||
          readback.owner.seal.canonicalSha256 !== placement.canonicalSha256
        )
          return blocked(
            'placement-readback-unverified',
            readback.ok
              ? 'The confirmed placement was not read back exactly.'
              : readback.blockers[0].detail,
          );
        return Object.freeze({
          ok: true,
          owner: readback.owner,
          writeOutcome: 'verified',
          persistence,
          readback,
          blockers: Object.freeze([]),
          uiIntegrated: false,
          runtimeReady: false,
        });
      } catch (error) {
        return blocked(
          signal.aborted ? 'cancelled' : 'placement-save-failed',
          error instanceof Error ? error.message : 'Placement save failed closed.',
        );
      } finally {
        unlinkIssuedLifetime();
        if (scope !== null) activeScopes.delete(scope);
      }
    },
  });
}

export function createPatternImportDxfProductCompositePlacementProductionSaverV1(
  readCurrentEvidence: PatternImportDxfProductCompositePlacementSaveHostV1['readCurrentEvidence'],
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  return createPatternImportDxfProductCompositePlacementSaverV1({
    readCurrentEvidence,
    crypto,
    createClient: productionClient,
  });
}

/** Uses the same abortable generated client and single CAS/fresh-read transaction as V2. */
export function createPatternImportDxfProductCompositeObservedPlacementProductionSaverV3(
  readCurrentEvidence: PatternImportDxfProductCompositePlacementSaveHostV1['readCurrentEvidence'],
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): ObservedSaver {
  return createPatternImportDxfProductCompositeObservedPlacementSaverV3({
    readCurrentEvidence,
    crypto,
    createClient: productionClient,
  });
}
