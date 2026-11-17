import { Buffer } from 'node:buffer';
import { candidate } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-seam-consistency-carrier-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductCompositeSidecarV4,
  decodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
  readPatternImportDxfProductCompositeComponentBytesV4,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v4';
import { describe, it, expect, vi } from 'vitest';
import {
  createModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from '../body/model-mannequin-pose-document-v2';
import { sha256Hex } from 'lib/features/sha256';
import {
  placementRequest,
  baseRow,
  baseBindings,
  semanticDocument,
  bytesOf,
  canonical,
} from './observed-placement-v3-port.test-fixture';
import {
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import legacyByteBaseline from './observed-placement-v3.legacy-byte-baseline.json';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductMultiseamPlacementSidecarV3,
  encodePatternImportDxfProductMultiseamPlacementSidecarV3,
  decodePatternImportDxfProductMultiseamPlacementSidecarV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from './pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
  readPatternImportDxfProductMultiseamPlacementSidecarV3,
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';

/** Synthetic storage metadata only; this helper has no observed-body or D0 authority. */
export async function requestV3() {
  const old = placementRequest();
  const arm = {
    shoulderRaiseDegrees: 0,
    shoulderForwardDegrees: 0,
    elbowBendDegrees: 0,
    wristBendDegrees: 0,
  };
  const leg = { hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 };
  const document = createModelMannequinPoseDocumentV2({
    bodyFlexionDegrees: 0,
    bodySideBendDegrees: 0,
    bodyTwistDegrees: 0,
    armMode: 'linked',
    leftArm: arm,
    rightArm: arm,
    legMode: 'linked',
    leftLeg: leg,
    rightLeg: leg,
    headPitchDeg: 0,
    headSideDeg: 0,
    headYawDeg: 5,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    shoulderProtractionDeg: 0,
  });
  const target = {
    kind: 'saved-model-observed-direct-pose/v1' as const,
    persistedModel: {
      id: 731,
      updatedAt: '2026-11-17T00:00:00Z',
      revision: 'common-model/v1;id=731;updatedAt=2026-11-17T00%3A00%3A00Z',
    },
    displayedModel: {
      modelId: 'tech-card-base-model:731',
      modelContentRevision: 'form:current',
      basisKind: 'female' as const,
      inputFingerprint: 'input:exact',
      bodyBuildFingerprint: 'build:exact',
      runtimeSourceRevision: 'runtime:exact',
    },
    canonicalMeasurementsSha256: 'a'.repeat(64),
    pose: {
      document,
      canonicalSha256: (await fingerprintModelMannequinPoseDocumentV2(document)).slice(7),
    },
    geometry: {
      positionsFloat32LeSha256: 'b'.repeat(64),
      trianglesUint32LeSha256: 'c'.repeat(64),
      vertexCount: 3,
      triangleCount: 1,
      byteLength: 48,
    },
    frame: {
      version: 'measurement-body-frame/v2' as const,
      id: 'measurement-body-frame-v2' as const,
      revision: 'measurement-body-frame-v2.0.1' as const,
      sourceRevision: 'runtime:exact',
      units: 'm' as const,
      coordinateSystem: {
        handedness: 'right' as const,
        up: '+Y' as const,
        front: '+Z' as const,
        subjectLeft: '+X' as const,
        origin: 'ground-projection-between-ankles' as const,
      },
      canonicalSha256: 'd'.repeat(64),
    },
  };
  const { body: _body, ...semantics } = old.placementAuthoring.semantics;
  void _body;
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
    bindings: old.bindings,
    placementAuthoring: {
      ...old.placementAuthoring,
      semantics: {
        ...semantics,
        schemaVersion: 'dxf-product-two-panel-skirt-garment-semantics-request/1' as const,
      },
      observedTarget: { target, canonicalSha256: await sha256Hex(bytesOf([target.kind, target])) },
    },
  };
}
async function built() {
  const request = await requestV3();
  const result = await buildPatternImportDxfProductMultiseamPlacementSidecarV3(request);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV3(result.owner);
  if (!encoded.ok) throw new Error('encode');
  return { request, result, encoded };
}
const compositeRequest = (placementV2Bytes: Uint8Array | null, placementV3Bytes?: Uint8Array) => ({
  schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  bindings: baseBindings,
  expectedPreviousSidecarSha256: '9'.repeat(64),
  semanticProductV1Bytes: bytesOf(semanticDocument(baseRow)),
  placementV2Bytes,
  ...(placementV3Bytes ? { placementV3Bytes } : {}),
  exactTopologyBytes: null,
});

describe('isolated observed Placement V3 storage contract', () => {
  it('preserves exact historical V2 placement and Composite bytes against unchanged baseline', async () => {
    const next = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(placementRequest());
    if (!next.ok) throw new Error('v2');
    const placement = encodePatternImportDxfProductMultiseamPlacementSidecarV2(next.owner);
    if (!placement.ok) throw new Error('placement bytes');
    expect(placement.canonicalSha256).toBe(legacyByteBaseline.placement.sha256);
    expect(Buffer.from(placement.bytes).toString('base64')).toBe(
      legacyByteBaseline.placement.base64,
    );
    const composite = await buildPatternImportDxfProductCompositeSidecarV3(
      compositeRequest(placement.bytes),
    );
    if (!composite.ok) throw new Error('composite');
    const outer = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
    if (!outer.ok) throw new Error('outer bytes');
    expect(outer.canonicalSha256).toBe(legacyByteBaseline.composite.sha256);
    expect(Buffer.from(outer.bytes).toString('base64')).toBe(legacyByteBaseline.composite.base64);
  });
  it('roundtrips exact posed metadata without transient IDs, A relabeling or authority', async () => {
    const { result, encoded } = await built();
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV3(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.seal).toEqual(result.seal);
    expect(
      decoded.document.placementAuthoring.observedTarget.target.pose.document.pose.headYawDeg,
    ).toBe(5);
    expect(decoded.document.placementAuthoring.semantics).not.toHaveProperty('body');
    expect(decoded.document.claims).toMatchObject({
      decodedTargetAuthenticatesBody: false,
      bodyAdmission: false,
      runtimeAdmission: false,
    });
    expect(canonical(decoded.document)).not.toMatch(
      /observationId|displayPositionSource|sessionGeneration|poseKind/,
    );
  });
  it('rejects cloned and proxy codec owners', async () => {
    const { result } = await built();
    expect(encodePatternImportDxfProductMultiseamPlacementSidecarV3({ ...result.owner }).ok).toBe(
      false,
    );
    expect(
      encodePatternImportDxfProductMultiseamPlacementSidecarV3(new Proxy(result.owner, {})).ok,
    ).toBe(false);
  });
  it.each(['positionsFloat32LeSha256', 'trianglesUint32LeSha256'] as const)(
    'rejects changed %s with stale target seal',
    async (field) => {
      const request = await requestV3();
      request.placementAuthoring.observedTarget.target.geometry[field] = 'f'.repeat(64);
      expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV3(request)).ok).toBe(
        false,
      );
    },
  );
  it.each(['observationId', 'displayPositionSource', 'generation', 'poseKind'])(
    'rejects forbidden observed target field %s',
    async (field) => {
      const request = await requestV3();
      Object.assign(request.placementAuthoring.observedTarget.target, { [field]: 'invented' });
      expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV3(request)).ok).toBe(
        false,
      );
    },
  );
  it('rejects body A injection, disconnected role IDs and mismatched annular policy', async () => {
    for (const change of [
      (r: Awaited<ReturnType<typeof requestV3>>) =>
        Object.assign(r.placementAuthoring.semantics, { body: { poseKind: 'A' } }),
      (r: Awaited<ReturnType<typeof requestV3>>) =>
        Object.assign(r.placementAuthoring.semantics.garment, { frontPieceId: 'foreign' }),
      (r: Awaited<ReturnType<typeof requestV3>>) =>
        Object.assign(r.placementAuthoring.annular.parameters, { id: 'foreign' }),
    ]) {
      const r = await requestV3();
      change(r);
      expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV3(r)).ok).toBe(false);
    }
  });
  it('refuses getters without invocation and detaches before async target hashing', async () => {
    const r = await requestV3();
    const getter = vi.fn(() => r.bindings);
    Object.defineProperty(r, 'bindings', { get: getter, enumerable: true });
    expect((await buildPatternImportDxfProductMultiseamPlacementSidecarV3(r)).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const next = await requestV3();
    const pending = buildPatternImportDxfProductMultiseamPlacementSidecarV3(next);
    Object.assign(next.placementAuthoring.observedTarget.target.geometry, {
      positionsFloat32LeSha256: 'f'.repeat(64),
    });
    expect((await pending).ok).toBe(true);
  });
  it('preserves required semantic bytes and uses one active component inside unchanged Composite V3', async () => {
    const { encoded } = await built();
    const composite = await buildPatternImportDxfProductCompositeSidecarV3(
      compositeRequest(null, encoded.bytes),
    );
    expect(composite.ok).toBe(true);
    if (!composite.ok) return;
    expect(composite.placementDocument).toBeNull();
    expect(composite.observedPlacementDocument?.mediaType).toContain('.v3+json');
    expect(
      readPatternImportDxfProductCompositeComponentBytesV3(composite.owner, 'semantic-product-v1'),
    ).toEqual(bytesOf(semanticDocument(baseRow)));
    const wire = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
    if (!wire.ok) throw new Error('wire');
    expect((await decodePatternImportDxfProductCompositeSidecarV3(wire.bytes)).ok).toBe(true);
    const old = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(placementRequest());
    if (!old.ok) throw new Error('old');
    const bytes = encodePatternImportDxfProductMultiseamPlacementSidecarV2(old.owner);
    if (!bytes.ok) throw new Error('oldbytes');
    expect(
      (
        await buildPatternImportDxfProductCompositeSidecarV3(
          compositeRequest(bytes.bytes, encoded.bytes),
        )
      ).ok,
    ).toBe(false);
    const duplicate = structuredClone(composite.document);
    const oldComposite = await buildPatternImportDxfProductCompositeSidecarV3(
      compositeRequest(bytes.bytes),
    );
    if (!oldComposite.ok) throw new Error('oldComposite');
    (duplicate.components as unknown[]).splice(1, 0, oldComposite.document.components[1]);
    expect((await decodePatternImportDxfProductCompositeSidecarV3(bytesOf(duplicate))).ok).toBe(
      false,
    );
  });
  it('rejects fresh Composite source/row drift despite valid target and component seal', async () => {
    const { encoded } = await built();
    const r = compositeRequest(null, encoded.bytes);
    expect(
      (
        await buildPatternImportDxfProductCompositeSidecarV3({
          ...r,
          bindings: { ...r.bindings, assemblyTopologySha256: '0'.repeat(64) },
        })
      ).ok,
    ).toBe(false);
  });
  it('mints verified read owner only after fresh pre/post row/topology checks', async () => {
    const { request, result, encoded } = await built();
    const r = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
      expectedRow: baseRow,
      expectedBindings: request.bindings,
    };
    const row = {
      patternVersion: request.bindings.row.patternVersion,
      postSaveReceiptSha256: request.bindings.row.postSaveReceiptSha256,
      cardLockVersion: request.bindings.row.cardLockVersion,
      savedRowRevision: request.bindings.row.revision,
      techCardId: 7,
      patternLineKey: baseRow.patternLineKey,
      dxfSha256: baseRow.sha256,
      mediaType: result.document.mediaType,
      byteLength: encoded.bytes.length,
      sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
      sidecarSha256: encoded.canonicalSha256,
      createdAt: undefined,
      createdBy: undefined,
    };
    let calls = 0;
    const host = {
      getSidecar: async () => ({ status: 'found' as const, row }),
      readCurrentEvidence: async (expected: {
        row: typeof baseRow;
        topology: typeof request.bindings.topology;
      }) => {
        calls++;
        return structuredClone(expected);
      },
    };
    const read = await readPatternImportDxfProductMultiseamPlacementSidecarV3(r, host);
    expect(read.ok).toBe(true);
    expect(calls).toBe(2);
    if (!read.ok) return;
    expect(isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(read.owner)).toBe(
      true,
    );
    expect(
      isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3({ ...read.owner }),
    ).toBe(false);
    expect(
      isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(result.owner),
    ).toBe(false);
    calls = 0;
    host.readCurrentEvidence = async (expected) => {
      calls++;
      return {
        ...expected,
        row: { ...expected.row, cardLockVersion: calls === 2 ? 99 : expected.row.cardLockVersion },
      };
    };
    expect((await readPatternImportDxfProductMultiseamPlacementSidecarV3(r, host)).ok).toBe(false);
  });
});

it('preserves a separate exact-N selected operation in unchanged outer V4 around nested Placement V3', async () => {
  const { encoded } = await built();
  const inner = await buildPatternImportDxfProductCompositeSidecarV3(
    compositeRequest(null, encoded.bytes),
  );
  if (!inner.ok) throw new Error(JSON.stringify(inner));
  const innerBytes = encodePatternImportDxfProductCompositeSidecarV3(inner.owner);
  if (!innerBytes.ok) throw new Error('inner');
  const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(candidate(1));
  if (!exact.ok) throw new Error(JSON.stringify(exact));
  const exactBytes = await encodePatternImportDxfProductExactNSeamComponentV4({
    carrier: exact.carrier,
    seal: exact.seal,
  });
  if (!exactBytes.ok) throw new Error('exact');
  const outer = await buildPatternImportDxfProductCompositeSidecarV4({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
    bindings: baseBindings,
    expectedPreviousSidecarSha256: '9'.repeat(64),
    compositeV3Bytes: innerBytes.bytes,
    exactNSeamConsistencyBytes: exactBytes.bytes,
  });
  expect(outer, JSON.stringify(outer)).toMatchObject({ ok: true });
  if (!outer.ok) return;
  const wire = encodePatternImportDxfProductCompositeSidecarV4(outer.owner);
  if (!wire.ok) throw new Error('wire');
  const read = await decodePatternImportDxfProductCompositeSidecarV4(wire.bytes);
  if (!read.ok) throw new Error(JSON.stringify(read));
  expect(
    read.nestedCompositeV3.observedPlacementDocument?.placementAuthoring.observedTarget.target.pose
      .document.pose.headYawDeg,
  ).toBe(5);
  expect(
    readPatternImportDxfProductCompositeComponentBytesV4(
      read.owner,
      'phase-e-exact-n-seam-consistency-v2',
    ),
  ).toEqual(exactBytes.bytes);
});
