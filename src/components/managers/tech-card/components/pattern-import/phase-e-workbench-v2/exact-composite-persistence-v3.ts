import { abortableAdminService } from 'api/api';
import type { AdminService, TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3,
  type PatternImportDxfProductCompositeSidecarStorageAdapterV3,
  type PatternImportDxfProductCompositeSidecarStorageResultV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
  disposePatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
  type PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { decodePatternImportDxfProductMultiseamPlacementSidecarV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import type {
  PatternImportDxfProductPhaseEMultiseamChoicesV2,
  PatternImportDxfProductPhaseEMultiseamProposalV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';

import { createPatternImportDxfPhaseECompositeSidecarProductionPersistenceV3 } from './composite-sidecar-production-persistence-v3';

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_REQUEST_V3 =
  'pattern-import-dxf-phase-e-exact-composite-persistence-request/3' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3 =
  'pattern-import-dxf-phase-e-exact-composite-persistence/3' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3 = Object.freeze({
  narrowCurrentSidecarReadBeforeBuild: true,
  onlyHttp404AcceptedAsAbsence: true,
  absentSidecarInventedAsLegacyV1: false,
  currentBytesDigestAndCodecVerified: true,
  requiredSemanticProductV1BytesPreserved: true,
  optionalPlacementV2BytesPreserved: true,
  existingExactTopologyReplaced: true,
  exactCurrentAssemblyAuthorityBound: true,
  genuineExactTopologyOwnerRequired: true,
  storageAdapterFreshGetBeforeConditionalPut: true,
  rawSidecarBytesReturned: false,
  rawSidecarBytesRetained: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEExactCompositePersistenceRequestV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_REQUEST_V3;
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3;
  selectedOperationNumber: number;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  choices: PatternImportDxfProductPhaseEMultiseamChoicesV2;
}>;

export type PatternImportDxfPhaseEExactCompositePersistenceBlockerV3 = Readonly<{
  code:
    | 'invalid-request'
    | 'cancelled'
    | 'current-get-failed'
    | 'current-sidecar-invalid'
    | 'required-v1-component-unavailable'
    | 'selected-operation-mismatch'
    | 'exact-topology-binding-blocked'
    | 'exact-topology-encoding-blocked'
    | 'composite-build-blocked'
    | 'storage-blocked';
  phase: 'input' | 'current-get' | 'exact-binding' | 'composite-build' | 'storage';
  detail: string;
}>;

type StorageFailureResult = Extract<
  PatternImportDxfProductCompositeSidecarStorageResultV3,
  { ok: false }
>;

export type PatternImportDxfPhaseEExactCompositePersistenceResultV3 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3;
      persistence: 'verified';
      receipt: Extract<
        PatternImportDxfProductCompositeSidecarStorageResultV3,
        { ok: true }
      >['receipt'];
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3;
      persistence: StorageFailureResult['writeOutcome'];
      receipt: null;
      blockers: readonly [PatternImportDxfPhaseEExactCompositePersistenceBlockerV3];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3;
    }>;

type CurrentSidecarService = Pick<AdminService, 'GetTechCardPatternSemanticSidecar'>;

export type PatternImportDxfPhaseEExactCompositePersistenceDepsV3 = Readonly<{
  createClient: (signal: AbortSignal) => CurrentSidecarService;
  storageAdapter: PatternImportDxfProductCompositeSidecarStorageAdapterV3;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfPhaseEExactCompositePersistenceAdapterV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3;
  persist: (
    request: PatternImportDxfPhaseEExactCompositePersistenceRequestV3,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEExactCompositePersistenceResultV3>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3;
}>;

type Blocker = PatternImportDxfPhaseEExactCompositePersistenceBlockerV3;
type BlockerCode = Blocker['code'];
type Phase = Blocker['phase'];

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;

class ExactCompositeFailure extends Error {
  constructor(
    readonly code: BlockerCode,
    readonly phase: Phase,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfPhaseEExactCompositeFailureV3';
  }
}

function fail(code: BlockerCode, phase: Phase, detail: string): never {
  throw new ExactCompositeFailure(code, phase, detail);
}

function blocked(
  error: unknown,
  persistence: StorageFailureResult['writeOutcome'] = 'not-attempted',
): PatternImportDxfPhaseEExactCompositePersistenceResultV3 {
  const failure =
    error instanceof ExactCompositeFailure
      ? error
      : new ExactCompositeFailure(
          'current-sidecar-invalid',
          'current-get',
          'Exact Composite V3 persistence rejected unsafe data.',
        );
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3,
    persistence,
    receipt: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, phase: failure.phase, detail: failure.message }),
    ]) as readonly [PatternImportDxfPhaseEExactCompositePersistenceBlockerV3],
    claims: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3,
  });
}

function checkSignal(signal: AbortSignal, phase: Phase): void {
  if (signal.aborted) fail('cancelled', phase, 'Exact Composite V3 persistence was cancelled.');
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'status');
    return !!descriptor && 'value' in descriptor && descriptor.value === 404;
  } catch {
    return false;
  }
}

function copyCanonicalBase64(value: unknown, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SIDECAR_BYTES * 2 ||
    !Number.isSafeInteger(expectedLength) ||
    expectedLength < 1 ||
    expectedLength > MAX_SIDECAR_BYTES
  )
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar bytes are not bounded.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar bytes are not base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  let canonical = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000)
    canonical += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  if (bytes.byteLength !== expectedLength || btoa(canonical) !== value)
    fail(
      'current-sidecar-invalid',
      'current-get',
      'Current sidecar base64 is noncanonical or has the wrong length.',
    );
  return bytes;
}

async function digest(
  bytes: Uint8Array<ArrayBuffer>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string> {
  if (!crypto?.subtle) fail('current-sidecar-invalid', 'current-get', 'SHA-256 is unavailable.');
  const result = await crypto.subtle.digest('SHA-256', bytes);
  if (result.byteLength !== 32)
    fail('current-sidecar-invalid', 'current-get', 'SHA-256 returned an invalid digest.');
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function currentRow(value: unknown): TechCardPatternSemanticSidecar | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar response is not a record.');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'semanticSidecar');
  if (!descriptor) return null;
  if (!descriptor.enumerable || !('value' in descriptor))
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar response is unstable.');
  if (!descriptor.value || typeof descriptor.value !== 'object' || Array.isArray(descriptor.value))
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar row is invalid.');
  return descriptor.value as TechCardPatternSemanticSidecar;
}

function sameAuthorityRow(
  row: TechCardPatternSemanticSidecar,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
): boolean {
  return (
    row.techCardId === authority.row.techCardId &&
    row.patternLineKey === authority.row.patternLineKey &&
    row.dxfSha256 === authority.row.sha256 &&
    row.cardLockVersion === authority.row.cardLockVersion &&
    row.savedRowRevision === authority.row.revision
  );
}

type PreservedComponents = Readonly<{
  previousSha256: string;
  semanticV1: Uint8Array<ArrayBuffer>;
  placementV2: Uint8Array<ArrayBuffer> | null;
}>;

async function preserveCurrentComponents(
  row: TechCardPatternSemanticSidecar | null,
  authority: PatternImportDxfProductCompositeSidecarBindingsV3,
  selectedOperationNumber: number,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<PreservedComponents> {
  if (!row)
    fail(
      'required-v1-component-unavailable',
      'current-get',
      'No existing semantic-product-v1 sidecar can be preserved for Composite V3.',
    );
  if (!sameAuthorityRow(row, authority))
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar row differs from authority.');
  if (
    typeof row.sidecarSha256 !== 'string' ||
    !SHA256.test(row.sidecarSha256) ||
    !Number.isSafeInteger(row.byteLength)
  )
    fail('current-sidecar-invalid', 'current-get', 'Current sidecar metadata is invalid.');
  const bytes = copyCanonicalBase64(row.sidecarBytes, row.byteLength as number);
  try {
    if ((await digest(bytes, crypto)) !== row.sidecarSha256)
      fail('current-sidecar-invalid', 'current-get', 'Current sidecar digest differs from bytes.');
    if (row.mediaType === PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1) {
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytes, crypto);
      if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
        fail(
          'required-v1-component-unavailable',
          'current-get',
          'Current sidecar is not a verified semantic-product-v1 document.',
        );
      return Object.freeze({
        previousSha256: row.sidecarSha256,
        semanticV1: bytes.slice(),
        placementV2: null,
      });
    }
    if (row.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3)
      fail(
        'required-v1-component-unavailable',
        'current-get',
        'Current sidecar media type cannot supply semantic-product-v1 bytes.',
      );
    const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes, crypto);
    if (!decoded.ok)
      fail('current-sidecar-invalid', 'current-get', 'Current Composite V3 bytes are invalid.');
    if (
      decoded.document.bindings.serverAssemblyRevision !== authority.serverAssemblyRevision ||
      decoded.document.bindings.assemblyTopologySha256 !== authority.assemblyTopologySha256 ||
      !exactSameRow(decoded.document.bindings.row, authority.row)
    )
      fail(
        'current-sidecar-invalid',
        'current-get',
        'Current Composite V3 bindings differ from exact authority.',
      );
    const carrierOperation = decoded.exactTopology?.carrier.bindings.selectedOperation;
    if (!carrierOperation || carrierOperation.sourceOperationNumber !== selectedOperationNumber)
      fail(
        'selected-operation-mismatch',
        'current-get',
        'Current Composite V3 exact topology belongs to another operation.',
      );
    const semanticV1 = readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.owner,
      'semantic-product-v1',
    );
    if (!semanticV1)
      fail(
        'required-v1-component-unavailable',
        'current-get',
        'Current Composite V3 has no verified semantic-product-v1 component.',
      );
    const placementV2 = readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.owner,
      'multiseam-placement-v2',
    );
    return Object.freeze({
      previousSha256: row.sidecarSha256,
      semanticV1,
      placementV2,
    });
  } finally {
    bytes.fill(0);
  }
}

function exactSameRow(
  left: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
  right: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

export function createPatternImportDxfPhaseEExactCompositePersistenceV3(
  deps: PatternImportDxfPhaseEExactCompositePersistenceDepsV3,
): PatternImportDxfPhaseEExactCompositePersistenceAdapterV3 {
  if (
    !deps ||
    typeof deps.createClient !== 'function' ||
    !deps.storageAdapter ||
    typeof deps.storageAdapter.persist !== 'function'
  )
    throw new TypeError('Current-sidecar GET and conditional storage capabilities are required.');
  const crypto = deps.crypto ?? globalThis.crypto;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3,
    async persist(request, signal) {
      if (
        !request ||
        request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_REQUEST_V3
      )
        return blocked(
          new ExactCompositeFailure('invalid-request', 'input', 'Persistence request is invalid.'),
        );
      try {
        checkSignal(signal, 'input');
        if (
          !Number.isSafeInteger(request.selectedOperationNumber) ||
          request.selectedOperationNumber < 1 ||
          request.proposal.operation.sourceOperationNumber !== request.selectedOperationNumber
        )
          fail(
            'selected-operation-mismatch',
            'input',
            'The exact proposal belongs to another Assembly operation.',
          );
        const client = deps.createClient(signal);
        if (!client || typeof client.GetTechCardPatternSemanticSidecar !== 'function')
          fail('current-get-failed', 'current-get', 'Generated current-sidecar client is invalid.');
        let row: TechCardPatternSemanticSidecar | null;
        try {
          const response = await client.GetTechCardPatternSemanticSidecar({
            techCardId: request.currentAuthority.row.techCardId,
            patternLineKey: request.currentAuthority.row.patternLineKey,
          });
          checkSignal(signal, 'current-get');
          row = currentRow(response);
        } catch (error) {
          if (error instanceof ExactCompositeFailure) throw error;
          if (signal.aborted)
            fail('cancelled', 'current-get', 'Current sidecar read was cancelled.');
          if (isNotFound(error)) row = null;
          else fail('current-get-failed', 'current-get', 'Current sidecar GET failed.');
        }
        const preserved = await preserveCurrentComponents(
          row,
          request.currentAuthority,
          request.selectedOperationNumber,
          crypto,
        );
        let exactOwner: PatternImportDxfProductPhaseEExactTopologyBindingOwnerV1;
        const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
            current: {
              row: request.currentAuthority.row,
              serverAssemblyRevision: request.currentAuthority.serverAssemblyRevision,
              assemblyTopologySha256: request.currentAuthority.assemblyTopologySha256,
              selectedOperation: {
                sourceOperationNumber: request.selectedOperationNumber,
                authoringOperationId: request.proposal.operation.authoringOperationId,
                localOperationOrder: request.proposal.operation.order,
                seamIds: [...request.proposal.operation.seamIds],
              },
              catalogCanonicalSha256: request.catalog.canonicalSha256,
              proposalFingerprint: request.proposal.deterministicFingerprint,
              phaseEAggregatePlanSha256: request.choices.aggregatePlanSeal.canonicalSha256,
            },
            catalog: request.catalog,
            proposal: request.proposal,
            choices: request.choices,
          },
          { crypto },
        );
        if (!exact.ok) {
          preserved.semanticV1.fill(0);
          preserved.placementV2?.fill(0);
          fail(
            'exact-topology-binding-blocked',
            'exact-binding',
            `${exact.blockers[0].field}: ${exact.blockers[0].detail}`,
          );
        }
        exactOwner = exact.owner;
        try {
          const encodedExact = await encodePatternImportDxfProductExactTopologyComponentV3(
            exactOwner,
            crypto,
          );
          if (!encodedExact.ok)
            fail(
              'exact-topology-encoding-blocked',
              'exact-binding',
              `${encodedExact.blocker.field}: ${encodedExact.blocker.detail}`,
            );
          try {
            const composite = await buildPatternImportDxfProductCompositeSidecarV3(
              {
                schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
                bindings: request.currentAuthority,
                expectedPreviousSidecarSha256: preserved.previousSha256,
                semanticProductV1Bytes: preserved.semanticV1,
                placementV2Bytes: preserved.placementV2,
                exactTopologyBytes: encodedExact.bytes,
              },
              crypto,
            );
            if (!composite.ok)
              fail(
                'composite-build-blocked',
                'composite-build',
                `${composite.blockers[0].field}: ${composite.blockers[0].detail}`,
              );
            if (!exactSameRow(composite.document.bindings.row, request.currentAuthority.row))
              fail(
                'composite-build-blocked',
                'composite-build',
                'Composite V3 row changed during build.',
              );
            const stored = await deps.storageAdapter.persist(
              {
                schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V3,
                currentAuthority: request.currentAuthority,
                nextOwner: composite.owner,
              },
              signal,
            );
            if (!stored.ok)
              return blocked(
                new ExactCompositeFailure(
                  'storage-blocked',
                  'storage',
                  `${stored.blockers[0].phase}: ${stored.blockers[0].detail}`,
                ),
                stored.writeOutcome,
              );
            return Object.freeze({
              ok: true as const,
              schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_V3,
              persistence: 'verified' as const,
              receipt: stored.receipt,
              blockers: Object.freeze([]) as readonly [],
              claims: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3,
            });
          } finally {
            encodedExact.bytes?.fill(0);
          }
        } finally {
          disposePatternImportDxfProductPhaseEExactTopologyBindingOwnerV1(exactOwner);
          preserved.semanticV1.fill(0);
          preserved.placementV2?.fill(0);
        }
      } catch (error) {
        return blocked(error);
      }
    },
    claims: PATTERN_IMPORT_DXF_PHASE_E_EXACT_COMPOSITE_PERSISTENCE_CLAIMS_V3,
  });
}

/** Production binding: abortable current GET followed by Wave J's verified conditional storage. */
export function createPatternImportDxfPhaseEExactCompositeProductionPersistenceV3(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): PatternImportDxfPhaseEExactCompositePersistenceAdapterV3 {
  const storage = createPatternImportDxfPhaseECompositeSidecarProductionPersistenceV3(crypto);
  return createPatternImportDxfPhaseEExactCompositePersistenceV3({
    createClient: (signal) => abortableAdminService(signal),
    storageAdapter: storage.adapter,
    crypto,
  });
}
