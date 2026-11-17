import { Buffer } from 'node:buffer';
import { vi } from 'vitest';
import type { withObservedFirstSaveFixtureV3 } from './pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import type { PatternImportDxfProductSavedGarmentMeshIngressRequestV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import { createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-assembly-topology-hash-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-assembly-authority-transport-v1';
import type { PatternImportDxfProductSavedPlacementContextInputV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1';
type Fixture = Parameters<Parameters<typeof withObservedFirstSaveFixtureV3>[0]>[0];
/** Same exact AO/carrier fixture as context integration; only transport is synthetic. */
export async function prepareObservedHostTransportV1(
  f: Fixture,
  source: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
  compiled: PatternImportDxfProductSavedPlacementContextInputV1['compiled'],
) {
  const seed = f.seed;
  const snapshot = compiled.composerSnapshot;
  const selectedOperationNumber = snapshot.assembly.sourceOperationNumber;
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    seed.assembly,
    selectedOperationNumber,
  );
  if (!adapted.ok) throw new Error(adapted.blockers[0].detail);
  const serverTopologySha256 =
    await createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1().computeCanonicalSha256(
      adapted.existingAssembly,
      new AbortController().signal,
    );
  const serverAssemblyRevision = 'assembly:canonical:tx-000007';
  const composition = source.compositionRequest;
  const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
    JSON.parse(
      JSON.stringify({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
        current: {
          row: seed.row,
          serverAssemblyRevision,
          assemblyTopologySha256: serverTopologySha256,
          selectedOperation: {
            sourceOperationNumber: composition.proposal.operation.sourceOperationNumber,
            authoringOperationId: composition.proposal.operation.authoringOperationId,
            seamIds: [...composition.proposal.operation.seamIds],
            localOperationOrder: 0,
          },
          catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
          proposalFingerprint: snapshot.seals.proposalFingerprint,
          phaseEAggregatePlanSha256: snapshot.seals.phaseEPlanSha256,
        },
        catalog: composition.catalog,
        proposal: composition.proposal,
        choices: composition.choices,
      }),
    ),
  );
  if (!exact.ok) throw new Error(`exact: ${exact.blockers[0].detail}`);
  const encodedExact = await encodePatternImportDxfProductExactTopologyComponentV3(exact.owner);
  if (!encodedExact.ok) throw new Error(encodedExact.blocker.detail);
  const outer = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: {
      row: seed.row,
      serverAssemblyRevision,
      assemblyTopologySha256: serverTopologySha256,
    },
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: f.semanticBytes,
    exactTopologyBytes: encodedExact.bytes,
    placementV2Bytes: null,
  });
  if (!outer.ok) throw new Error(`outer: ${outer.blockers[0].detail}`);
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(outer.owner);
  if (!encoded.ok) throw new Error('Outer encoding failed');
  const transport: PatternImportDxfPhaseESavedAssemblyTransportResponseV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
    row: seed.row,
    selectedOperationNumber,
    serverAssemblyRevision,
    serverTopologySha256,
    operations: seed.assembly.ops.map((op) => ({
      operationNumber: op.number,
      work: op.work,
      inputKeys: op.inputKeys,
      outputUnitKey: op.outputUnitKey,
      outputUnitName: op.outputUnitName,
      seamKeys: op.seamKeys ?? [],
    })),
    selectedSeams: seed.assembly.seams.map((seam) => {
      if (!('sideA' in seam)) throw new Error('Exact test seam required');
      const anchors = (values: typeof seam.sideA) =>
        values.map((anchor) => ({
          pieceLineKey: anchor.pieceLineKey,
          edgeHint: anchor.edgeHint,
          rangeFrom: anchor.range[0],
          rangeTo: anchor.range[1],
          lenMm: anchor.lenMm,
          contourSig: anchor.contourSig,
          samples: anchor.samples.map(([u, v]) => ({ u, v })),
          ...(anchor.layer ? { layer: anchor.layer } : {}),
        }));
      return {
        seamKey: seam.seamKey,
        status: 'confirmed',
        stale: seam.stale,
        kind: seam.kind,
        direction: seam.direction,
        source: seam.source,
        anchoredSize: seam.anchoredSize,
        sideA: anchors(seam.sideA),
        sideB: anchors(seam.sideB),
      };
    }),
    sidecar: {
      status: 'composite-v3',
      mediaType: outer.document.mediaType,
      sha256: encoded.canonicalSha256,
      byteLength: encoded.canonicalByteLength,
      bytes: encoded.bytes,
      downloadUrl: null,
    },
  };

  Object.assign(f.storage.stored, {
    sidecarSha256: encoded.canonicalSha256,
    byteLength: encoded.canonicalByteLength,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
  });
  const readSnapshot = vi.fn(async () => {
    const stored = f.storage.stored;
    return structuredClone({
      ...transport,
      sidecar: {
        mediaType: outer.document.mediaType,
        downloadUrl: null,
        status: 'composite-v3' as const,
        sha256: stored.sidecarSha256!,
        byteLength: stored.byteLength!,
        bytes: new Uint8Array(Buffer.from(stored.sidecarBytes!, 'base64')),
      },
    });
  });
  return readSnapshot;
}
