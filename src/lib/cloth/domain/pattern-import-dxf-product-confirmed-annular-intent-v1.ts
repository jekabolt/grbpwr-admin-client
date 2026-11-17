import type { DxfProductSavedRowIdentityV1 } from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { DxfProductTwoPanelSkirtAnnularMappingParametersV1 } from './dxf-product-two-panel-skirt-annular-mapping-parameters-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtPlacementSemanticsV1,
  disposeDxfProductTwoPanelSkirtPlacementSemanticsV1,
  projectDxfProductTwoPanelSkirtPlacementSemanticsV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsRequestV1,
} from './dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementBindingsV2,
  type PatternImportDxfProductMultiseamPlacementSidecarOwnerV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import type { PatternImportDxfProductSemanticSidecarDocumentV1 } from './pattern-import-dxf-product-semantic-sidecar-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_CONFIRMED_ANNULAR_INTENT_V1 =
  'pattern-import-dxf-product-confirmed-annular-intent/1' as const;

type Operation = Omit<
  PatternImportDxfProductMultiseamPlacementBindingsV2['topology'],
  'assemblyTopologySha256' | 'localOperationOrder'
>;

/** The host freshly reads the row, AO and current outer V3/V4, then extracts its V1 bytes.
 * This is a host capability, not a replacement storage authority: the existing saver still
 * verifies the complete outer envelope and its CAS immediately before writing. */
export type PatternImportDxfProductConfirmedAnnularEvidenceV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  semanticBytes: Uint8Array;
  semanticSha256: string;
  assemblyTopologySha256: string;
  serverAssemblyRevision: string;
  placementOperation: Operation;
  outerTopology:
    | Readonly<{ kind: 'composite-v3-two-seam' }>
    | Readonly<{
        kind: 'composite-v4-exact-n';
        sourceOperationNumber: number;
        seamCount: number;
      }>;
}>;

export type PatternImportDxfProductConfirmedAnnularIntentV1 = Readonly<{
  confirmed: true;
  garment: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['garment'];
  body: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['body'];
  policy: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['policy'];
  annularParameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
  /** A requested target only. It does not describe or authenticate a displayed mesh's pose. */
  bodyIntent: Readonly<{
    kind: 'confirmed-neutral-A-target';
    confirmed: true;
    displayedBodyAdmission: false;
  }>;
  operation: Pick<Operation, 'sourceOperationNumber' | 'pieceIds' | 'seamIds'>;
}>;

export type PatternImportDxfProductConfirmedAnnularRequestV1 =
  PatternImportDxfProductConfirmedAnnularIntentV1 &
    Readonly<{
      readCurrentEvidence: (
        signal?: AbortSignal,
      ) => Promise<PatternImportDxfProductConfirmedAnnularEvidenceV1>;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_CONFIRMED_ANNULAR_INTENT_CLAIMS_V1 = Object.freeze({
  liveComposerOwnerStayedPrivate: true,
  originalSemanticsSealFromGenuineD0: true,
  originalAnnularSealIsConfirmedIntentAuditOnly: true,
  analyticalBodyAdmissionSealIssued: false,
  displayedPoseAdmitted: false,
  placementAdmitted: false,
  sidecarPersisted: false,
  runtimeAuthority: false,
  productionAuthority: false,
} as const);

export type PatternImportDxfProductConfirmedAnnularBlockerCodeV1 =
  | 'invalid-input'
  | 'session-disposed'
  | 'session-busy'
  | 'session-not-ready'
  | 'session-cancelled'
  | 'stale-generation'
  | 'composer-owner-unavailable'
  | 'composition-rebuild-blocked'
  | 'source-binding-mismatch'
  | 'semantic-component-blocked'
  | 'operation-binding-mismatch'
  | 'fresh-evidence-unavailable'
  | 'fresh-evidence-changed'
  | 'sha256-unavailable'
  | 'semantics-blocked'
  | 'placement-codec-blocked';

export type PatternImportDxfProductConfirmedAnnularResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV2;
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_CONFIRMED_ANNULAR_INTENT_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      blocker: Readonly<{
        code: PatternImportDxfProductConfirmedAnnularBlockerCodeV1;
        detail: string;
      }>;
    }>;

class IntentFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductConfirmedAnnularBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2048));
  }
}
function fail(code: IntentFailure['code'], detail: string): never {
  throw new IntentFailure(code, detail);
}

// Reject accessors and detach before awaiting the host. These are authoring data, not owners.
function canonical(value: unknown, depth = 0): string {
  if (depth > 48) fail('invalid-input', 'Authoring data exceeds nesting bounds.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0))
    return JSON.stringify(value);
  if (!value || typeof value !== 'object') fail('invalid-input', 'Plain authoring data required.');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null)
    fail('invalid-input', 'Plain authoring data required.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
  if (keys.length > 300_000 || (array && descriptors.length?.value !== keys.length))
    fail('invalid-input', 'Dense bounded authoring data required.');
  const values = keys.map((key, index) => {
    if (typeof key !== 'string' || (array && key !== String(index)))
      fail('invalid-input', 'Only own plain fields are accepted.');
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !('value' in descriptor))
      fail('invalid-input', 'Accessors and hidden fields are not accepted.');
    return [key, canonical(descriptor.value, depth + 1)] as const;
  });
  return array
    ? `[${values.map(([, value]) => value).join(',')}]`
    : `{${values
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${JSON.stringify(key)}:${value}`)
        .join(',')}}`;
}
function detached<T>(value: T): T {
  const text = canonical(value);
  if (text.length > 16 * 1024 * 1024) fail('invalid-input', 'Authoring data exceeds bounds.');
  return JSON.parse(text) as T;
}
const encoder = new TextEncoder();
const subtle = globalThis.crypto?.subtle;
const digestSha256 = subtle?.digest;
async function hash(domain: string, value: unknown): Promise<string> {
  if (!subtle || !digestSha256) fail('sha256-unavailable', 'SHA-256 is unavailable.');
  const digest = await Reflect.apply(digestSha256, subtle, [
    'SHA-256',
    encoder.encode(`${domain}\0${canonical(value)}`),
  ]);
  if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32)
    fail('sha256-unavailable', 'SHA-256 did not return one digest.');
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Produces the existing V2 document; this is NOT a D2a analytical-body admission producer.
 * The V2 originalAnnular audit slot contains a real domain-separated confirmed intent hash.
 * No body-admission seal is manufactured, and all physics/admission gates remain downstream. */
export async function buildPatternImportDxfProductConfirmedAnnularIntentV1(
  input: Readonly<{
    composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
    compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
    savedRow: DxfProductSavedRowIdentityV1;
    request: PatternImportDxfProductConfirmedAnnularRequestV1;
  }>,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductConfirmedAnnularResultV1> {
  let semanticsOwner: DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1 | null = null;
  try {
    const owner = input.composerV2Owner;
    const projection = projectPatternImportDxfProductGarmentMeshComposerV2(owner);
    if (!projection || owner.snapshot.origin !== 'verified-saved-row')
      fail('composer-owner-unavailable', 'A live saved Composer V2 is required.');
    const snapshot = owner.snapshot;
    const row = detached(input.savedRow);
    const { readCurrentEvidence, ...rawIntent } = input.request;
    const intent = detached(rawIntent);
    const compositionRequest = structuredClone(input.compositionRequest);
    if (
      typeof readCurrentEvidence !== 'function' ||
      intent.confirmed !== true ||
      !equal(intent.bodyIntent, {
        kind: 'confirmed-neutral-A-target',
        confirmed: true,
        displayedBodyAdmission: false,
      }) ||
      intent.body.poseKind !== 'A'
    )
      fail(
        'invalid-input',
        'Explicit confirmed neutral A target intent and a fresh host reader are required.',
      );
    const gate = () => {
      if (signal?.aborted) fail('session-cancelled', 'Placement authoring was cancelled.');
      if (!projectPatternImportDxfProductGarmentMeshComposerV2(owner))
        fail('composer-owner-unavailable', 'Saved Composer V2 was revoked during authoring.');
    };
    gate();
    if (
      Object.keys(row).length !== 8 ||
      row.techCardId !== snapshot.row.techCardId ||
      row.scopeKey !== snapshot.row.scopeKey ||
      row.patternLineKey !== snapshot.row.patternLineKey ||
      row.revision !== snapshot.row.patternVersion ||
      row.cardLockVersion !== snapshot.row.cardLockVersion ||
      row.sha256 !== snapshot.row.dxfSha256 ||
      !Number.isSafeInteger(row.sizeBytes) ||
      row.sizeBytes <= 0
    )
      fail('source-binding-mismatch', 'Retained saved row differs from the genuine Composer.');
    const read = async () => {
      gate();
      let raw: PatternImportDxfProductConfirmedAnnularEvidenceV1;
      try {
        raw = await readCurrentEvidence(signal);
      } catch {
        fail('fresh-evidence-unavailable', 'Fresh saved row/AO/semantic component read failed.');
      }
      gate();
      const { semanticBytes: suppliedBytes, ...context } = raw;
      if (!(suppliedBytes instanceof Uint8Array) || suppliedBytes.byteLength > 4 * 1024 * 1024)
        fail('semantic-component-blocked', 'Bounded raw semantic V1 bytes are required.');
      const bytes = new Uint8Array(suppliedBytes);
      const evidence = detached(context);
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytes);
      gate();
      if (
        !decoded.ok ||
        decoded.compatibility !== 'legacy-v1-no-placement' ||
        decoded.legacy.canonicalSha256 !== evidence.semanticSha256
      )
        fail(
          'semantic-component-blocked',
          'Fresh semantic V1 bytes or their canonical hash are invalid.',
        );
      // Parsing is safe only after the existing strict canonical legacy codec has accepted bytes.
      const semantic = JSON.parse(
        new TextDecoder().decode(bytes),
      ) as PatternImportDxfProductSemanticSidecarDocumentV1;
      if (
        !equal(evidence.row, row) ||
        !/^[0-9a-f]{64}$/.test(evidence.assemblyTopologySha256) ||
        !evidence.serverAssemblyRevision ||
        semantic.product.exportSha256 !== row.sha256 ||
        semantic.product.byteLength !== row.sizeBytes ||
        semantic.product.scopeKey !== row.scopeKey ||
        semantic.persistence.card.techCardId !== row.techCardId ||
        semantic.persistence.card.observedLockVersion > row.cardLockVersion ||
        semantic.persistence.pattern.lineKey !== row.patternLineKey ||
        semantic.persistence.pattern.url !== row.url ||
        semantic.persistence.pattern.scopeKey !== row.scopeKey ||
        semantic.persistence.pattern.sha256 !== row.sha256
      )
        fail(
          'source-binding-mismatch',
          'Fresh row/semantic product receipt differs from the saved source.',
        );
      return { evidence, semantic, fingerprint: canonical(evidence) };
    };
    const before = await read();
    const composition =
      await buildPatternImportDxfProductMultiseamMappingCompositionV2(compositionRequest);
    gate();
    if (!composition.ok) fail('composition-rebuild-blocked', composition.blockers[0].detail);
    if (
      composition.compositionSeal.canonicalSha256 !== snapshot.seals.compositionCanonicalSha256 ||
      composition.aggregateSeal.canonicalSha256 !== snapshot.seals.aggregateCanonicalSha256 ||
      composition.evidence.productExportSha256 !== row.sha256 ||
      composition.evidence.sourceFileSha256 !== snapshot.seals.sourceFileSha256 ||
      projection.phase2ArtifactSha256 !== snapshot.seals.phase2ArtifactSha256
    )
      fail('source-binding-mismatch', 'Fresh composition differs from the private saved Composer.');
    const operation = before.evidence.placementOperation;
    const expectedOperation = {
      documentId: snapshot.assembly.documentId,
      revision: snapshot.assembly.revision,
      sourceOperationNumber: snapshot.assembly.sourceOperationNumber,
      pieceIds: snapshot.assembly.pieceIds,
      seamIds: snapshot.assembly.seamIds,
      pieceLineKeys: snapshot.assembly.pieceIds.map(
        (id) =>
          compositionRequest.catalog.pieces.find((piece) => piece.pieceId === id)?.pieceLineKey,
      ),
      seamKeys: snapshot.assembly.seamIds.map(
        (id) => compositionRequest.proposal.seams.find((seam) => seam.id === id)?.id,
      ),
    };
    const outer = before.evidence.outerTopology;
    if (
      !equal(operation, expectedOperation) ||
      !equal(intent.operation, {
        sourceOperationNumber: operation.sourceOperationNumber,
        pieceIds: operation.pieceIds,
        seamIds: operation.seamIds,
      }) ||
      !operation.pieceLineKeys.every((key) =>
        before.semantic.persistence.pieceLineKeys.includes(key),
      ) ||
      (outer.kind !== 'composite-v3-two-seam' && outer.kind !== 'composite-v4-exact-n') ||
      (outer.kind === 'composite-v4-exact-n' &&
        (!Number.isSafeInteger(outer.seamCount) ||
          outer.seamCount < 1 ||
          outer.seamCount === 2 ||
          !Number.isSafeInteger(outer.sourceOperationNumber) ||
          outer.sourceOperationNumber < 0 ||
          outer.sourceOperationNumber === operation.sourceOperationNumber))
    )
      fail(
        'operation-binding-mismatch',
        'An explicit two-seam placement operation is required; V4 selected exact-N is a separate operation.',
      );
    const semantics = await buildDxfProductTwoPanelSkirtPlacementSemanticsV1({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
      origin: snapshot.origin,
      expectedComposerCanonicalSha256: snapshot.seal.canonicalSha256,
      composerOwner: owner,
      garment: intent.garment,
      body: intent.body,
      policy: intent.policy,
    });
    if (!semantics.ok) fail('semantics-blocked', semantics.blockers[0].detail);
    semanticsOwner = semantics.owner;
    gate();
    const authored = projectDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner);
    if (!authored) fail('semantics-blocked', 'Genuine D0 semantics could not be projected.');
    const originalMappingParametersSha256 = await hash(
      'dxf-product-two-panel-skirt-confirmed-annular-parameters/1',
      intent.annularParameters,
    );
    const originalAcceptancePolicySha256 = await hash(
      'dxf-product-two-panel-skirt-confirmed-annular-acceptance/1',
      intent.annularParameters.acceptance,
    );
    const originalCanonicalSha256 = await hash(
      PATTERN_IMPORT_DXF_PRODUCT_CONFIRMED_ANNULAR_INTENT_V1,
      {
        composerCanonicalSha256: snapshot.seal.canonicalSha256,
        semanticsCanonicalSha256: semantics.owner.snapshot.seal.canonicalSha256,
        bodyIntent: intent.bodyIntent,
        originalMappingParametersSha256,
        originalAcceptancePolicySha256,
      },
    );
    gate();
    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV2({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V2,
      bindings: {
        row: {
          techCardId: row.techCardId,
          cardLockVersion: row.cardLockVersion,
          scopeKey: row.scopeKey,
          patternLineKey: row.patternLineKey,
          patternUrl: row.url,
          patternVersion: before.semantic.persistence.pattern.version,
          revision: row.revision,
          sizeId: before.semantic.persistence.pattern.sizeId,
          sizeToken: compositionRequest.catalog.sizeToken,
          dxfSha256: row.sha256,
          postSaveReceiptSha256: before.semantic.persistence.receiptSealSha256,
        },
        source: {
          sourceFileSha256: snapshot.seals.sourceFileSha256,
          writerExportSha256: snapshot.seals.productExportSha256,
          handoffSourceAggregateSha256: snapshot.seals.handoffSourceAggregateSha256,
          selectedGeometrySha256: composition.aggregate.sourceBinding.baseFinalCoordinateSha256,
          sizeSelectionSha256: snapshot.seals.sizeSelectionSha256,
          catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
          proposalFingerprint: snapshot.seals.proposalFingerprint,
          phaseEPlanSha256: snapshot.seals.phaseEPlanSha256,
          mappingCompositionSha256: snapshot.seals.compositionCanonicalSha256,
          handoffCanonicalSha256: snapshot.seals.handoffCanonicalSha256,
          aggregateCanonicalSha256: snapshot.seals.aggregateCanonicalSha256,
          phase2ArtifactSha256: snapshot.seals.phase2ArtifactSha256,
        },
        topology: {
          ...operation,
          localOperationOrder: 0,
          assemblyTopologySha256: before.evidence.assemblyTopologySha256,
        },
      },
      placementAuthoring: {
        authoredOrigin: snapshot.origin,
        authoredImportGeneration: snapshot.row.importGeneration,
        semantics: {
          schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
          garment: authored.garment,
          body: authored.body,
          policy: authored.policy,
          originalCanonicalSha256: semantics.owner.snapshot.seal.canonicalSha256,
        },
        annular: {
          schemaVersion: 'dxf-product-two-panel-skirt-annular-mapping-parameters-request/1',
          parameters: intent.annularParameters,
          originalCanonicalSha256,
          originalMappingParametersSha256,
          originalAcceptancePolicySha256,
        },
      },
    });
    gate();
    if (!built.ok) fail('placement-codec-blocked', built.blockers[0].detail);
    const after = await read();
    if (after.fingerprint !== before.fingerprint)
      fail('fresh-evidence-changed', 'Saved row, semantic bytes, or AO changed during authoring.');
    gate();
    return Object.freeze({
      ok: true,
      owner: built.owner,
      claims: PATTERN_IMPORT_DXF_PRODUCT_CONFIRMED_ANNULAR_INTENT_CLAIMS_V1,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      owner: null,
      blocker: Object.freeze({
        code: signal?.aborted
          ? 'session-cancelled'
          : error instanceof IntentFailure
            ? error.code
            : 'invalid-input',
        detail:
          error instanceof Error
            ? error.message.slice(0, 2048)
            : 'Placement authoring failed closed.',
      }),
    });
  } finally {
    if (semanticsOwner) disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(semanticsOwner);
  }
}
