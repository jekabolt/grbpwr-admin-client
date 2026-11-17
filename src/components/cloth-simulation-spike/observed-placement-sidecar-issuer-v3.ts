import {
  projectDxfProductTwoPanelSkirtGarmentSemanticsV1,
  getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1,
  type DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-garment-semantics-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  patternImportDxfProductPlacementWireCodecV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductMultiseamPlacementSidecarV3,
  encodePatternImportDxfProductMultiseamPlacementSidecarV3,
  type PatternImportDxfProductMultiseamPlacementSidecarOwnerV3,
  type PatternImportDxfProductMultiseamPlacementSidecarSealV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v3';
import type { PatternImportDxfProductConfirmedAnnularEvidenceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-confirmed-annular-intent-v1';
import type { PatternImportDxfProductSemanticSidecarDocumentV1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import type { DxfProductTwoPanelSkirtAnnularMappingParametersV1 } from 'lib/cloth/domain/dxf-product-two-panel-skirt-annular-mapping-parameters-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';
const { detachPlain, canonical, sha256 } = patternImportDxfProductPlacementWireCodecV1;
const SCHEMA = 'observed-placement-sidecar-issuer/3' as const;
const claims = Object.freeze({
  genuineBodyFreeD0Revalidated: true,
  genuinePersistedObservedBodyRevalidated: true,
  confirmedStableTargetMatched: true,
  bodyAdmission: false,
  runtimeAdmission: false,
  persisted: false,
} as const);
export type ObservedPlacementSidecarIssueRequestV3 = Readonly<{
  confirmed: true;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  garmentSemanticsOwner: DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  savedRow: DxfProductSavedRowIdentityV1;
  displayedBodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  displayedBodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  confirmedTargetSha256: string;
  annularParameters: DxfProductTwoPanelSkirtAnnularMappingParametersV1;
  readCurrentEvidence: (
    signal?: AbortSignal,
  ) => Promise<PatternImportDxfProductConfirmedAnnularEvidenceV1>;
}>;
declare const brand: unique symbol;
export type ObservedPlacementSidecarIssuedOwnerV3 = Readonly<{
  schemaVersion: typeof SCHEMA;
  seal: PatternImportDxfProductMultiseamPlacementSidecarSealV3;
  claims: typeof claims;
  readonly [brand]: never;
}>;
type State = {
  codec: PatternImportDxfProductMultiseamPlacementSidecarOwnerV3;
  controller: AbortController;
  unlink: () => void;
  fresh: (signal?: AbortSignal) => Promise<void>;
  gate: (signal?: AbortSignal) => void;
};
const owners = new WeakMap<object, State>();
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function signalCheck(signal?: AbortSignal) {
  if (signal !== undefined && nativeAborted.call(signal))
    throw new DOMException('Observed placement cancelled.', 'AbortError');
}
function localWait<T>(work: Promise<T>, signals: readonly (AbortSignal | undefined)[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      signals.forEach((s) => s?.removeEventListener('abort', cancel));
      run();
    };
    const cancel = () =>
      finish(() => reject(new DOMException('Observed placement cancelled.', 'AbortError')));
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    signals.forEach((s) => s?.addEventListener('abort', cancel, { once: true }));
    if (signals.some((s) => s?.aborted)) cancel();
  });
}
function same(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}
async function hash(domain: string, value: unknown) {
  return sha256(new TextEncoder().encode(canonical([domain, value])), globalThis.crypto);
}
/** CardDraft allows undefined; capture own data recursively before any async owner work. */
function detachComposition<T>(value: T): T {
  let nodes = 0;
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > 1_000_000 || depth > 96)
      throw new TypeError('Composition exceeds its plain-data bound.');
    if (
      item === null ||
      item === undefined ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return item;
    if (!item || typeof item !== 'object') throw new TypeError('Composition contains non-data.');
    const array = Array.isArray(item);
    const proto = Object.getPrototypeOf(item);
    if (proto !== (array ? Array.prototype : Object.prototype) && !(proto === null && !array))
      throw new TypeError('Composition requires plain data.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors).filter((k) => !(array && k === 'length'));
    if (
      array &&
      (keys.length !== descriptors.length?.value ||
        keys.some((key, index) => key !== String(index)))
    )
      throw new TypeError('Composition arrays must be dense.');
    const entries = keys.map((key) => {
      const d = typeof key === 'string' ? descriptors[key] : null;
      if (!d?.enumerable || !('value' in d))
        throw new TypeError('Composition contains accessors, hidden fields or symbols.');
      return [key, copy(d.value, depth + 1)] as const;
    });
    return array ? entries.map(([, v]) => v) : Object.fromEntries(entries);
  };
  return copy(value, 0) as T;
}
function exactRequest(input: ObservedPlacementSidecarIssueRequestV3) {
  const keys = [
    'confirmed',
    'composerV2Owner',
    'garmentSemanticsOwner',
    'compositionRequest',
    'savedRow',
    'displayedBodyOwner',
    'displayedBodyBinding',
    'confirmedTargetSha256',
    'annularParameters',
    'readCurrentEvidence',
  ];
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    throw new TypeError('Exact plain observed placement request required.');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length)
    throw new TypeError('Exact observed placement request required.');
  const entries = keys.map((key) => {
    const d = descriptors[key];
    if (!d?.enumerable || !('value' in d))
      throw new TypeError('Observed placement requires own data.');
    return [key, d.value] as const;
  });
  const captured = Object.fromEntries(entries) as ObservedPlacementSidecarIssueRequestV3;
  if (
    captured.confirmed !== true ||
    typeof captured.readCurrentEvidence !== 'function' ||
    !/^[0-9a-f]{64}$/.test(captured.confirmedTargetSha256)
  )
    throw new TypeError('Explicit stable target confirmation and fresh evidence required.');
  return captured;
}
export function disposeObservedPlacementSidecarIssuedV3(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const state = owners.get(candidate);
  if (!state) return false;
  owners.delete(candidate);
  state.controller.abort();
  state.unlink();
  return true;
}
/** Production issuance requires existing genuine owners; low-level codec owners cannot pass this gate. */
export async function issueObservedPlacementSidecarV3(
  input: ObservedPlacementSidecarIssueRequestV3,
  signal?: AbortSignal,
) {
  let cleanup = () => {};
  let controller: AbortController | null = null;
  let issued: ObservedPlacementSidecarIssuedOwnerV3 | null = null;
  try {
    const request = exactRequest(input);
    signalCheck(signal);
    const composer = request.composerV2Owner;
    const d0 = request.garmentSemanticsOwner;
    const body = request.displayedBodyOwner;
    const binding = detachPlain(
      request.displayedBodyBinding,
    ) as SavedModelDisplayedTriangleBodyBindingV2;
    const row = detachPlain(request.savedRow) as DxfProductSavedRowIdentityV1;
    const parameters = detachPlain(
      request.annularParameters,
    ) as DxfProductTwoPanelSkirtAnnularMappingParametersV1;
    const compositionRequest = detachComposition(request.compositionRequest);
    const readEvidence = request.readCurrentEvidence;
    const targetSha = request.confirmedTargetSha256;
    const initial = projectPatternImportDxfProductGarmentMeshComposerV2(composer);
    const semantics = projectDxfProductTwoPanelSkirtGarmentSemanticsV1(d0);
    const d0Life = getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(d0);
    const bodyLife = getSavedModelDisplayedTriangleBodyLifetimeV2(body, binding);
    if (
      !initial ||
      !semantics ||
      !d0Life ||
      !bodyLife ||
      composer.snapshot.origin !== 'verified-saved-row'
    )
      throw new TypeError(
        'Genuine current saved Composer, body-free D0 and persisted observed body required.',
      );
    const snapshot = composer.snapshot;
    if (
      semantics.snapshot.bindings.composerCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
      semantics.snapshot.bindings.phase2ArtifactSha256 !== snapshot.seals.phase2ArtifactSha256
    )
      throw new TypeError('D0 belongs to another Composer.');
    if (
      Object.keys(row).length !== 8 ||
      row.techCardId !== snapshot.row.techCardId ||
      row.scopeKey !== snapshot.row.scopeKey ||
      row.patternLineKey !== snapshot.row.patternLineKey ||
      row.revision !== snapshot.row.patternVersion ||
      row.cardLockVersion !== snapshot.row.cardLockVersion ||
      row.sha256 !== snapshot.row.dxfSha256 ||
      !Number.isSafeInteger(row.sizeBytes) ||
      row.sizeBytes < 1
    )
      throw new TypeError('Exact saved row differs from Composer.');
    controller = new AbortController();
    const life = controller;
    const revoke = () => {
      life.abort();
      if (issued) disposeObservedPlacementSidecarIssuedV3(issued);
    };
    signalCheck(signal);
    const signals = [d0Life, bodyLife, ...(signal ? [signal] : [])];
    cleanup = () =>
      signals.forEach((s) => EventTarget.prototype.removeEventListener.call(s, 'abort', revoke));
    signals.forEach((s) =>
      EventTarget.prototype.addEventListener.call(s, 'abort', revoke, { once: true }),
    );
    if (signals.some((s) => nativeAborted.call(s))) revoke();
    const gate = (local?: AbortSignal) => {
      signalCheck(local);
      signalCheck(life.signal);
      if (
        getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(d0) !== d0Life ||
        getSavedModelDisplayedTriangleBodyLifetimeV2(body, binding) !== bodyLife ||
        !projectPatternImportDxfProductGarmentMeshComposerV2(composer)
      )
        throw new TypeError('Borrowed authoring source changed.');
      signalCheck(life.signal);
    };
    const read = async (local?: AbortSignal) => {
      gate(local);
      const raw = await localWait(readEvidence(local ?? life.signal), [local, life.signal]);
      gate(local);
      const { semanticBytes, ...rest } = raw;
      if (!(semanticBytes instanceof Uint8Array))
        throw new TypeError('Fresh semantic bytes required.');
      const evidence = detachPlain(rest) as Omit<
        PatternImportDxfProductConfirmedAnnularEvidenceV1,
        'semanticBytes'
      >;
      const bytes = semanticBytes.slice();
      const checked = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(bytes);
      gate(local);
      if (
        !checked.ok ||
        checked.compatibility !== 'legacy-v1-no-placement' ||
        checked.legacy.canonicalSha256 !== evidence.semanticSha256
      )
        throw new TypeError('Fresh semantic codec/seal differs.');
      const semantic = JSON.parse(
        new TextDecoder().decode(bytes),
      ) as PatternImportDxfProductSemanticSidecarDocumentV1;
      if (
        !same(evidence.row, row) ||
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
        throw new TypeError('Fresh saved receipt differs.');
      return { evidence, semantic };
    };
    const before = await read();
    gate();
    const composition =
      await buildPatternImportDxfProductMultiseamMappingCompositionV2(compositionRequest);
    gate();
    if (
      !composition.ok ||
      composition.compositionSeal.canonicalSha256 !== snapshot.seals.compositionCanonicalSha256 ||
      composition.aggregateSeal.canonicalSha256 !== snapshot.seals.aggregateCanonicalSha256 ||
      composition.evidence.productExportSha256 !== row.sha256 ||
      composition.evidence.sourceFileSha256 !== snapshot.seals.sourceFileSha256
    )
      throw new TypeError('Exact composition replay differs.');
    const operation = before.evidence.placementOperation;
    const expectedOperation = {
      documentId: snapshot.assembly.documentId,
      revision: snapshot.assembly.revision,
      sourceOperationNumber: snapshot.assembly.sourceOperationNumber,
      pieceIds: snapshot.assembly.pieceIds,
      seamIds: snapshot.assembly.seamIds,
      pieceLineKeys: snapshot.assembly.pieceIds.map(
        (id) => compositionRequest.catalog.pieces.find((p) => p.pieceId === id)?.pieceLineKey,
      ),
      seamKeys: snapshot.assembly.seamIds.map(
        (id) => compositionRequest.proposal.seams.find((s) => s.id === id)?.id,
      ),
    };
    const outer = before.evidence.outerTopology;
    if (
      !same(operation, expectedOperation) ||
      !operation.pieceLineKeys.every((k) =>
        before.semantic.persistence.pieceLineKeys.includes(k),
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
      throw new TypeError('Explicit two-seam context differs; exact-N is a separate operation.');
    const target = await projectSavedModelObservedPlacementTargetV1(body, binding, life.signal);
    gate();
    if (!target.ok || target.canonicalSha256 !== targetSha)
      throw new TypeError('Confirmed observed target changed.');
    const [parametersSha, acceptanceSha] = await Promise.all([
      hash('confirmed-observed-annular-parameters/3', parameters),
      hash('confirmed-observed-annular-acceptance/3', parameters.acceptance),
    ]);
    gate();
    const intentSha = await hash('confirmed-observed-annular-intent/3', {
      garmentSemanticsSha256: semantics.snapshot.seal.canonicalSha256,
      targetSha256: targetSha,
      parametersSha256: parametersSha,
      acceptanceSha256: acceptanceSha,
    });
    gate();
    const built = await buildPatternImportDxfProductMultiseamPlacementSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
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
          schemaVersion: 'dxf-product-two-panel-skirt-garment-semantics-request/1',
          garment: semantics.garment,
          policy: semantics.policy,
          originalCanonicalSha256: semantics.snapshot.seal.canonicalSha256,
        },
        annular: {
          schemaVersion: 'dxf-product-two-panel-skirt-annular-mapping-parameters-request/1',
          parameters,
          originalCanonicalSha256: intentSha,
          originalMappingParametersSha256: parametersSha,
          originalAcceptancePolicySha256: acceptanceSha,
        },
        observedTarget: { target: target.target, canonicalSha256: targetSha },
      },
    });
    gate();
    if (!built.ok) throw new TypeError(built.blockers[0].detail);
    const fresh = async (local?: AbortSignal) => {
      const current = await read(local);
      gate(local);
      if (!same(current, before)) throw new TypeError('Source evidence changed.');
      const currentTarget = await projectSavedModelObservedPlacementTargetV1(
        body,
        binding,
        local ?? life.signal,
      );
      gate(local);
      if (!currentTarget.ok || currentTarget.canonicalSha256 !== targetSha)
        throw new TypeError('Observed target changed.');
      gate(local);
    };
    await fresh();
    gate();
    issued = Object.freeze({
      schemaVersion: SCHEMA,
      seal: built.seal,
      claims,
    }) as ObservedPlacementSidecarIssuedOwnerV3;
    owners.set(issued, { codec: built.owner, controller: life, unlink: cleanup, fresh, gate });
    return Object.freeze({ ok: true as const, owner: issued });
  } catch (error) {
    controller?.abort();
    cleanup();
    return Object.freeze({
      ok: false as const,
      owner: null,
      detail:
        error instanceof Error
          ? error.message.slice(0, 2048)
          : 'Observed placement issuance failed.',
    });
  }
}
/** Save-only projection. Per-read cancellation never disposes borrowed D0/body owners. */
export async function projectObservedPlacementSidecarIssuedV3(
  candidate: unknown,
  signal?: AbortSignal,
) {
  if (!candidate || typeof candidate !== 'object') return null;
  const state = owners.get(candidate);
  if (!state) return null;
  try {
    signalCheck(signal);
    await state.fresh(signal);
    state.gate(signal);
    signalCheck(signal);
    signalCheck(state.controller.signal);
    if (owners.get(candidate) !== state) return null;
    const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV3(state.codec);
    return encoded.ok ? Object.freeze({ ...encoded, document: state.codec.document }) : null;
  } catch {
    if (!signal?.aborted) disposeObservedPlacementSidecarIssuedV3(candidate);
    return null;
  }
}

/** Synchronous private-registry poll used only to bind an existing save operation lifetime. */
export function getObservedPlacementSidecarIssuedLifetimeV3(
  candidate: unknown,
): AbortSignal | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const state = owners.get(candidate);
  if (!state) return null;
  try {
    state.gate();
    return state.controller.signal;
  } catch {
    disposeObservedPlacementSidecarIssuedV3(candidate);
    return null;
  }
}
