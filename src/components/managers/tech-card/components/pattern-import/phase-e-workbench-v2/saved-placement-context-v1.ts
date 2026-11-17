import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PatternImportDxfProductGarmentMeshComposerSnapshotV2 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import type { PatternImportDxfProductConfirmedAnnularEvidenceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-confirmed-annular-intent-v1';
import {
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
  type PatternImportDxfProductMultiseamPlacementBindingsV2,
  type PatternImportDxfProductMultiseamPlacementSidecarDocumentV2,
  type PatternImportDxfProductMultiseamPlacementSidecarOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  decodePatternImportDxfProductMultiseamPlacementSidecarV3,
  type PatternImportDxfProductMultiseamPlacementSidecarDocumentV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v3';
import type { ObservedPlacementSidecarIssuedOwnerV3 } from 'components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3';
import type { PatternImportDxfProductSemanticSidecarDocumentV1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import type { PatternImportDxfProductCompositePlacementSaveCurrentV1 } from './composite-placement-save-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
  createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
} from './saved-assembly-authority-transport-v1';
import type { PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1 } from './saved-assembly-snapshot-rpc-bridge-v1';
import {
  createPatternImportDxfPhaseESavedAssemblyProductionCompositeCodecV1,
  createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1,
} from './saved-assembly-snapshot-production-rpc-v1';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical,
  createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1,
} from './saved-assembly-topology-hash-v1';

export type PatternImportDxfProductSavedPlacementSessionIdentityV1 = Readonly<{
  generation: number;
  disposed: boolean;
  composerCanonicalSha256: string | null;
}>;

export type PatternImportDxfProductSavedPlacementContextInputV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  /** Must come from the accepted compile result of the current private session. */
  compiled: Readonly<{
    generation: number;
    composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  }>;
  readCurrentSession: () => PatternImportDxfProductSavedPlacementSessionIdentityV1;
}>;

export type PatternImportDxfProductSavedPlacementContextV1 = Readonly<{
  authority: PatternImportDxfProductCompositeSidecarBindingsV3;
  evidence: PatternImportDxfProductConfirmedAnnularEvidenceV1;
  expectedPreviousOuterSha256: string;
  /** Persisted component metadata only; its existence is not placement/body admission. */
  existingPlacement: Readonly<{
    document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV2;
    canonicalSha256: string;
  }> | null;
}>;

/** Decoded V3 metadata only. A subsequent fresh verified reader supplies restore authority. */
export type PatternImportDxfProductSavedObservedPlacementContextV3 = Omit<
  PatternImportDxfProductSavedPlacementContextV1,
  'existingPlacement'
> &
  Readonly<{
    existingObservedPlacement: Readonly<{
      document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3;
      canonicalSha256: string;
    }> | null;
  }>;

type ReadEvidence = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  topology: PatternImportDxfProductMultiseamPlacementBindingsV2['topology'];
  serverAssemblyRevision: string;
}>;
type InternalContext = PatternImportDxfProductSavedPlacementContextV1 &
  PatternImportDxfProductSavedObservedPlacementContextV3 &
  Readonly<{
    semantic: PatternImportDxfProductSemanticSidecarDocumentV1;
    exactCarrierSha256: string;
    existingPlacementBytes: Uint8Array | null;
    existingObservedPlacementBytes: Uint8Array | null;
  }>;

const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const aborted = (signal: AbortSignal) => nativeAborted.call(signal) as boolean;
const cancelled = () => new DOMException('Saved placement context read cancelled.', 'AbortError');

/** Operation cancellation does not revoke a borrowed issuer or its pending fresh read. */
function localWait<T>(work: () => Promise<T>, signals: readonly AbortSignal[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const linked: AbortSignal[] = [];
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      for (const signal of linked) nativeRemove.call(signal, 'abort', cancel);
      run();
    };
    const cancel = () => finish(() => reject(cancelled()));
    try {
      for (const signal of signals) {
        if (aborted(signal)) {
          cancel();
          return;
        }
        linked.push(signal);
        nativeAdd.call(signal, 'abort', cancel, { once: true });
        if (aborted(signal)) {
          cancel();
          return;
        }
      }
      Promise.resolve(work()).then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const detached = <T>(value: T): T => JSON.parse(canonical(value)) as T;
function refuse(detail: string): never {
  throw new TypeError(detail);
}

/** Read-only qualified two-seam V3 host. No raw seam coordinates become topology authority.
 * The existing adapter verifies the server AO hash and exact carrier from the same RPC bytes.
 * The current private session seal/generation remains the compile-context authority. */
export function createPatternImportDxfProductSavedPlacementContextV1(
  input: PatternImportDxfProductSavedPlacementContextInputV1,
  host: Readonly<{
    readSavedAssemblySnapshot: PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1['readSavedAssemblySnapshot'];
    crypto?: Pick<Crypto, 'subtle'>;
  }>,
) {
  const row = detached(input.row);
  const compiled = detached(input.compiled);
  const snapshot = compiled.composerSnapshot;
  const readCurrentSession = input.readCurrentSession;
  const readSnapshot = host.readSavedAssemblySnapshot;
  const crypto = host.crypto;
  const topologyHashContract =
    createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1(crypto);
  const compositeCodecContract =
    createPatternImportDxfPhaseESavedAssemblyProductionCompositeCodecV1(crypto);
  let disposed = false;
  const lifetime = new AbortController();
  let latest: InternalContext | null = null;
  let bound: Readonly<{
    bindings: PatternImportDxfProductMultiseamPlacementBindingsV2;
    semanticSha256: string;
    exactCarrierSha256: string;
    observed: Readonly<{
      canonicalSha256: string;
      target: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3['placementAuthoring']['observedTarget'];
    }> | null;
  }> | null = null;

  const terminal = (signal?: AbortSignal) => {
    if (disposed) refuse('Saved placement context is disposed.');
    if (signal && aborted(signal)) throw cancelled();
  };
  const gate = (signal?: AbortSignal) => {
    terminal(signal);
    const current = readCurrentSession();
    if (
      !current ||
      current.disposed ||
      current.generation !== compiled.generation ||
      current.composerCanonicalSha256 !== snapshot.seal.canonicalSha256
    )
      refuse('Saved placement compile generation or owner changed.');
    // The host callback can synchronously cancel or dispose this context.
    terminal(signal);
  };
  const wait = <T>(work: () => Promise<T>, signal?: AbortSignal) =>
    localWait(work, [lifetime.signal, ...(signal ? [signal] : [])]);
  if (
    !Number.isSafeInteger(compiled.generation) ||
    compiled.generation <= 0 ||
    snapshot.origin !== 'verified-saved-row' ||
    snapshot.mesh.pieceCount !== 2 ||
    snapshot.mesh.seamCount !== 2 ||
    snapshot.row.techCardId !== row.techCardId ||
    snapshot.row.scopeKey !== row.scopeKey ||
    snapshot.row.patternLineKey !== row.patternLineKey ||
    snapshot.row.patternVersion !== row.revision ||
    snapshot.row.cardLockVersion !== row.cardLockVersion ||
    snapshot.row.dxfSha256 !== row.sha256
  )
    refuse('A current genuine two-panel saved compilation and exact source row are required.');
  gate();

  const readInternal = async (signal?: AbortSignal): Promise<InternalContext> => {
    const currentSignal = signal ?? new AbortController().signal;
    gate(currentSignal);
    const raw = await wait(
      () =>
        readSnapshot(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
            techCardId: row.techCardId,
            scopeKey: row.scopeKey,
            patternLineKey: row.patternLineKey,
            expectedSavedRowRevision: row.revision,
            expectedCardLockVersion: row.cardLockVersion,
            expectedUrl: row.url,
            expectedSizeBytes: row.sizeBytes,
            expectedSha256: row.sha256,
            selectedOperationNumber: snapshot.assembly.sourceOperationNumber,
          },
          currentSignal,
        ),
      currentSignal,
    );
    gate(currentSignal);
    // The generated bridge already detaches transport. Capture it once again before both consumers
    // so injected test transports cannot race the adapter and the semantic-component extraction.
    const captured = structuredClone(raw);
    if (captured.sidecar?.status !== 'composite-v3')
      refuse(
        'Qualified placement authoring requires current Composite V3; V4 exact-N is not admitted here.',
      );
    const adapter = createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1({
      readSavedAssemblySnapshot: async () => captured,
      topologyHashContract,
      compositeCodecContract,
    });
    const authority = await adapter.readAuthoritativeAssembly(
      {
        row,
        selectedOperationNumber: snapshot.assembly.sourceOperationNumber,
      },
      currentSignal,
    );
    gate(currentSignal);
    const decoded = await decodePatternImportDxfProductCompositeSidecarV3(
      captured.sidecar.bytes,
      crypto,
    );
    gate(currentSignal);
    if (
      !decoded.ok ||
      !decoded.exactTopology ||
      decoded.seal.canonicalSha256 !== authority.exactTopology.compositeSha256 ||
      decoded.seal.canonicalSha256 !== captured.sidecar.sha256 ||
      decoded.seal.canonicalByteLength !== captured.sidecar.byteLength
    )
      refuse('Current Composite V3 exact bytes differ from the verified transactional snapshot.');
    const carrier = authority.exactTopology.carrier;
    const selected = carrier.bindings.selectedOperation;
    if (
      carrier.bindings.catalogCanonicalSha256 !== snapshot.seals.catalogCanonicalSha256 ||
      carrier.bindings.proposalFingerprint !== snapshot.seals.proposalFingerprint ||
      carrier.bindings.phaseEAggregatePlanSha256 !== snapshot.seals.phaseEPlanSha256 ||
      selected.sourceOperationNumber !== snapshot.assembly.sourceOperationNumber ||
      selected.localOperationOrder !== snapshot.assembly.localOperationOrder ||
      !equal([...selected.seamIds].sort(), [...snapshot.assembly.seamIds].sort())
    )
      refuse(
        'Durable exact topology catalog, proposal, plan or selected seams differ from the private compilation.',
      );
    const pieceLineKeys = snapshot.assembly.pieceIds.map((pieceId) => {
      const sides = carrier.sides.filter((side) => side.pieceId === pieceId);
      const keys = [...new Set(sides.map((side) => side.pieceLineKey))];
      if (
        sides.length !== 2 ||
        keys.length !== 1 ||
        !sides.every((side) => snapshot.assembly.seamIds.includes(side.seamId))
      )
        refuse('Each compiled piece needs two exact carrier sides with one durable line identity.');
      return keys[0]!;
    }) as [string, string];
    if (
      new Set(pieceLineKeys).size !== 2 ||
      carrier.sides.some((side) => !snapshot.assembly.pieceIds.includes(side.pieceId))
    )
      refuse('Durable carrier piece identities differ from the private compilation.');
    const semanticBytes = readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.owner,
      'semantic-product-v1',
    );
    const semanticComponent = decoded.document.components.find(
      (component) => component.kind === 'semantic-product-v1',
    );
    if (!semanticBytes || !semanticComponent)
      refuse('Verified historical semantic V1 component is unavailable.');
    const semantic = JSON.parse(
      new TextDecoder().decode(semanticBytes),
    ) as PatternImportDxfProductSemanticSidecarDocumentV1;
    const context: InternalContext = {
      authority: detached(decoded.document.bindings),
      expectedPreviousOuterSha256: decoded.seal.canonicalSha256,
      existingPlacement: decoded.placementDocument
        ? {
            document: decoded.placementDocument,
            canonicalSha256: decoded.document.components.find(
              (component) => component.kind === 'multiseam-placement-v2',
            )!.sha256,
          }
        : null,
      existingPlacementBytes: readPatternImportDxfProductCompositeComponentBytesV3(
        decoded.owner,
        'multiseam-placement-v2',
      ),
      existingObservedPlacement: decoded.observedPlacementDocument
        ? {
            document: decoded.observedPlacementDocument,
            canonicalSha256: decoded.document.components.find(
              (component) => component.kind === 'multiseam-placement-v3',
            )!.sha256,
          }
        : null,
      existingObservedPlacementBytes: readPatternImportDxfProductCompositeComponentBytesV3(
        decoded.owner,
        'multiseam-placement-v3',
      ),
      evidence: {
        row: detached(row),
        semanticBytes: semanticBytes.slice(),
        semanticSha256: semanticComponent.sha256,
        assemblyTopologySha256: authority.serverTopologySha256,
        serverAssemblyRevision: authority.serverAssemblyRevision,
        placementOperation: {
          documentId: snapshot.assembly.documentId,
          revision: snapshot.assembly.revision,
          sourceOperationNumber: selected.sourceOperationNumber,
          pieceIds: [...snapshot.assembly.pieceIds],
          pieceLineKeys,
          seamIds: [...snapshot.assembly.seamIds],
          seamKeys: [...snapshot.assembly.seamIds],
        },
        outerTopology: { kind: 'composite-v3-two-seam' },
      },
      semantic,
      exactCarrierSha256: authority.exactTopology.seal.canonicalSha256,
    };
    gate(currentSignal);
    latest = structuredClone(context);
    return context;
  };

  const validateBindings = (
    bindings: PatternImportDxfProductMultiseamPlacementBindingsV2,
    context: InternalContext,
  ) => {
    const expectedRow: PatternImportDxfProductMultiseamPlacementBindingsV2['row'] = {
      techCardId: row.techCardId,
      cardLockVersion: row.cardLockVersion,
      scopeKey: row.scopeKey,
      patternLineKey: row.patternLineKey,
      patternUrl: row.url,
      revision: row.revision,
      patternVersion: context.semantic.persistence.pattern.version,
      sizeId: context.semantic.persistence.pattern.sizeId,
      sizeToken: bindings.row.sizeToken,
      dxfSha256: row.sha256,
      postSaveReceiptSha256: context.semantic.persistence.receiptSealSha256,
    };
    // selectedGeometrySha256 and sizeToken are carried from the private producer's V2 owner;
    // Composer's detached snapshot does not contain them. We never infer them from coordinates.
    // Their immutable full bindings stay pinned to this exact live composer generation/seal.
    const expectedSource: typeof bindings.source = {
      sourceFileSha256: snapshot.seals.sourceFileSha256,
      writerExportSha256: snapshot.seals.productExportSha256,
      handoffSourceAggregateSha256: snapshot.seals.handoffSourceAggregateSha256,
      selectedGeometrySha256: bindings.source.selectedGeometrySha256,
      sizeSelectionSha256: snapshot.seals.sizeSelectionSha256,
      catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
      proposalFingerprint: snapshot.seals.proposalFingerprint,
      phaseEPlanSha256: snapshot.seals.phaseEPlanSha256,
      mappingCompositionSha256: snapshot.seals.compositionCanonicalSha256,
      handoffCanonicalSha256: snapshot.seals.handoffCanonicalSha256,
      aggregateCanonicalSha256: snapshot.seals.aggregateCanonicalSha256,
      phase2ArtifactSha256: snapshot.seals.phase2ArtifactSha256,
    };
    if (
      !equal(bindings.row, expectedRow) ||
      !equal(bindings.source, expectedSource) ||
      !equal(bindings.topology, {
        ...context.evidence.placementOperation,
        localOperationOrder: 0,
        assemblyTopologySha256: context.authority.assemblyTopologySha256,
      })
    )
      refuse(
        'Confirmed placement does not bind the current compiled source, saved row and exact topology.',
      );
  };

  const bindPlacement = (
    owner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV2,
    context: InternalContext,
  ) => {
    gate();
    if (!encodePatternImportDxfProductMultiseamPlacementSidecarV2(owner).ok)
      refuse('A genuine Placement V2 codec owner from the private confirmed producer is required.');
    const bindings = detached(owner.document.bindings);
    validateBindings(bindings, context);
    bound = {
      bindings,
      semanticSha256: context.evidence.semanticSha256,
      exactCarrierSha256: context.exactCarrierSha256,
      observed: null,
    };
    return detached({
      authority: context.authority,
      placementBindings: bindings,
      exactNCurrent: null,
      expectedPreviousOuterSha256: context.expectedPreviousOuterSha256,
    });
  };

  const bindObserved = (
    document: PatternImportDxfProductMultiseamPlacementSidecarDocumentV3,
    canonicalSha256: string,
    context: InternalContext,
    atStart: typeof bound,
    signal?: AbortSignal,
    issuedCurrent?: () => boolean,
  ) => {
    gate(signal);
    if (bound !== atStart) refuse('Confirmed placement binding changed during context read.');
    const bindings = detached(document.bindings);
    validateBindings(bindings, context);
    if (issuedCurrent && !issuedCurrent())
      refuse('Observed Placement V3 issuer changed during context binding.');
    terminal(signal);
    if (bound !== atStart) refuse('Confirmed placement binding changed during context read.');
    bound = {
      bindings,
      semanticSha256: context.evidence.semanticSha256,
      exactCarrierSha256: context.exactCarrierSha256,
      observed: { canonicalSha256, target: detached(document.placementAuthoring.observedTarget) },
    };
    return detached({
      authority: context.authority,
      placementBindings: bindings,
      exactNCurrent: null,
      expectedPreviousOuterSha256: context.expectedPreviousOuterSha256,
    });
  };

  const freshBound = async (signal: AbortSignal) => {
    gate(signal);
    const atStart = bound;
    if (!atStart) refuse('Bind one confirmed placement owner before saving or restoring it.');
    const context = await readInternal(signal);
    gate(signal);
    if (bound !== atStart) refuse('Confirmed placement binding changed during context read.');
    validateBindings(atStart.bindings, context);
    if (
      context.evidence.semanticSha256 !== atStart.semanticSha256 ||
      context.exactCarrierSha256 !== atStart.exactCarrierSha256
    )
      refuse('Historical semantic bytes or exact carrier changed during placement persistence.');
    return { context, bindings: atStart.bindings, binding: atStart };
  };

  return Object.freeze({
    async read(signal?: AbortSignal): Promise<PatternImportDxfProductSavedPlacementContextV1> {
      const context = await readInternal(signal);
      gate(signal);
      return {
        authority: context.authority,
        evidence: context.evidence,
        expectedPreviousOuterSha256: context.expectedPreviousOuterSha256,
        existingPlacement: context.existingPlacement,
      };
    },
    async readObserved(
      signal?: AbortSignal,
    ): Promise<PatternImportDxfProductSavedObservedPlacementContextV3> {
      const context = await readInternal(signal);
      gate(signal);
      return {
        authority: context.authority,
        evidence: context.evidence,
        expectedPreviousOuterSha256: context.expectedPreviousOuterSha256,
        existingObservedPlacement: context.existingObservedPlacement,
      };
    },
    readCurrentEvidence: async (signal?: AbortSignal) => {
      const context = await readInternal(signal);
      gate(signal);
      return context.evidence;
    },
    async bindConfirmedObservedPlacement(
      owner: ObservedPlacementSidecarIssuedOwnerV3,
      signal?: AbortSignal,
    ) {
      gate(signal);
      const atStart = bound;
      const issuer = await wait(
        () => import('components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3'),
        signal,
      );
      gate(signal);
      const issuedLifetime = issuer.getObservedPlacementSidecarIssuedLifetimeV3(owner);
      if (!issuedLifetime || aborted(issuedLifetime))
        refuse('A genuine live observed Placement V3 issued owner is required.');
      const projected = await wait(
        () => issuer.projectObservedPlacementSidecarIssuedV3(owner),
        signal,
      );
      gate(signal);
      if (!projected) refuse('Observed Placement V3 issuer is no longer current.');
      const context = await readInternal(signal);
      gate(signal);
      const fresh = await wait(() => issuer.projectObservedPlacementSidecarIssuedV3(owner), signal);
      gate(signal);
      if (
        !fresh ||
        fresh.canonicalSha256 !== projected.canonicalSha256 ||
        !equal(fresh.document, projected.document) ||
        issuer.getObservedPlacementSidecarIssuedLifetimeV3(owner) !== issuedLifetime ||
        aborted(issuedLifetime)
      )
        refuse('Observed Placement V3 issuer changed during context binding.');
      gate(signal);
      return bindObserved(
        fresh.document,
        fresh.canonicalSha256,
        context,
        atStart,
        signal,
        () =>
          issuer.getObservedPlacementSidecarIssuedLifetimeV3(owner) === issuedLifetime &&
          !aborted(issuedLifetime),
      );
    },
    async bindExistingObservedPlacement(signal?: AbortSignal) {
      gate(signal);
      const atStart = bound;
      const context = await readInternal(signal);
      gate(signal);
      if (!context.existingObservedPlacement || !context.existingObservedPlacementBytes)
        return null;
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV3(
        context.existingObservedPlacementBytes,
        crypto,
      );
      gate(signal);
      if (
        !decoded.ok ||
        decoded.seal.canonicalSha256 !== context.existingObservedPlacement.canonicalSha256
      )
        refuse('Persisted observed placement component could not be verified for reload.');
      return bindObserved(decoded.document, decoded.seal.canonicalSha256, context, atStart, signal);
    },
    bindConfirmedPlacement(owner: PatternImportDxfProductMultiseamPlacementSidecarOwnerV2) {
      gate();
      if (!latest) refuse('Read current transactional placement context before binding authoring.');
      return bindPlacement(owner, latest);
    },
    async bindExistingPlacement(signal?: AbortSignal) {
      const context = await readInternal(signal);
      gate(signal);
      if (!context.existingPlacement || !context.existingPlacementBytes) return null;
      const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
        context.existingPlacementBytes,
        crypto,
      );
      gate(signal);
      if (
        !decoded.ok ||
        decoded.compatibility !== 'placement-v2' ||
        decoded.seal.canonicalSha256 !== context.existingPlacement.canonicalSha256
      )
        refuse('Persisted placement component could not be verified for reload.');
      return bindPlacement(decoded.owner, context);
    },
    async readSaveCurrent(
      expected: PatternImportDxfProductCompositePlacementSaveCurrentV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfProductCompositePlacementSaveCurrentV1> {
      const capturedExpected = detached(expected);
      const current = await freshBound(signal);
      gate(signal);
      if (bound !== current.binding)
        refuse('Confirmed placement binding changed during context read.');
      const result = {
        authority: current.context.authority,
        placementBindings: current.bindings,
        exactNCurrent: null,
      };
      if (!equal(capturedExpected, result))
        refuse('Placement saver context differs from the confirmed current binding.');
      return detached(result);
    },
    async readPlacementCurrent(expected: ReadEvidence, signal: AbortSignal): Promise<ReadEvidence> {
      const capturedExpected = detached(expected);
      const current = await freshBound(signal);
      gate(signal);
      if (bound !== current.binding)
        refuse('Confirmed placement binding changed during context read.');
      const observed = current.binding.observed;
      if (
        observed &&
        (current.context.existingObservedPlacement?.canonicalSha256 !== observed.canonicalSha256 ||
          !equal(
            current.context.existingObservedPlacement?.document.placementAuthoring.observedTarget,
            observed.target,
          ))
      )
        refuse('Persisted observed placement or target changed after binding.');
      const result = {
        row: current.context.authority.row,
        topology: current.bindings.topology,
        serverAssemblyRevision: current.context.authority.serverAssemblyRevision,
      };
      if (!equal(capturedExpected, result))
        refuse('Placement reader context differs from the confirmed current binding.');
      return detached(result);
    },
    dispose() {
      disposed = true;
      latest = null;
      bound = null;
      lifetime.abort();
    },
  });
}

/** Generated transactional snapshot RPC only; this adapter owns no storage writer. */
export function createPatternImportDxfProductSavedPlacementProductionContextV1(
  input: PatternImportDxfProductSavedPlacementContextInputV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  const production = createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
    input.compiled.composerSnapshot.assembly.sourceOperationNumber,
    crypto,
  );
  return createPatternImportDxfProductSavedPlacementContextV1(input, {
    readSavedAssemblySnapshot: production.bridge.readSavedAssemblySnapshot,
    crypto,
  });
}
