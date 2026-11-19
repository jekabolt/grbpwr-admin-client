import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { abortableAdminService } from 'api/api';
import type {
  GetTechCardSavedAssemblySnapshotRequest,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { fingerprintDxfExactAssemblyGraphV1 } from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import { projectDxfExactAssemblyGraphCompileRequestV1 } from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import {
  createSavedFullAssemblyCompileSessionV1,
  type SavedFullAssemblyCompileIntentV1,
  type SavedFullAssemblyCompileResultV1,
} from './saved-full-assembly-compile-session-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  savedThreePanelCompileRequestV1,
  fullAssemblyFixtureWireV1,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
import {
  readSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  disposeSavedFullAssemblySnapshotV1,
} from './saved-full-assembly-snapshot-production-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
let seed: SavedThreePanelFixtureV1, wireSeed: SavedThreePanelFixtureV1;
let stored: Awaited<ReturnType<typeof encodedOuter>>;
let rpcReads = 0,
  fixtureCasWrites = 0;
const disposers: Array<() => void> = [];

/** Only the persistence envelope is a fixture. This uses the existing real Composite codec;
 * the historical SemanticV1 bytes do not contain or authorize a durable full assembly graph. */
async function encodedOuter(previous: string | null) {
  const initial = await fullAssemblyFixtureWireV1(seed, 10);
  const built = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: {
      row: seed.row,
      serverAssemblyRevision: initial.serverAssemblyRevision,
      assemblyTopologySha256: initial.assemblyTopologySha256,
    },
    expectedPreviousSidecarSha256: previous,
    semanticProductV1Bytes: bytesOf(semanticDocument(seed.row)),
    exactTopologyBytes: null,
    placementV2Bytes: null,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.blockers));
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(built.owner);
  if (!encoded.ok) throw new Error('Composite fixture encoding failed.');
  const decoded = await decodePatternImportDxfProductCompositeSidecarV3(encoded.bytes);
  expect(decoded.ok).toBe(true);
  const envelope: TechCardPatternSemanticSidecar = {
    techCardId: seed.row.techCardId,
    patternLineKey: seed.row.patternLineKey,
    dxfSha256: seed.row.sha256,
    patternVersion: 4,
    cardLockVersion: seed.row.cardLockVersion,
    savedRowRevision: seed.row.revision,
    sidecarSha256: encoded.canonicalSha256,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    byteLength: encoded.bytes.length,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
    postSaveReceiptSha256: undefined,
    createdAt: undefined,
    createdBy: undefined,
  };
  return { envelope, bytes: encoded.bytes, previous };
}
async function fixtureOuterCas() {
  const before = stored;
  const after = await encodedOuter(before.envelope.sidecarSha256!);
  // Fixture-only CAS, not a production registry/writer implementation or product admission.
  expect(stored).toBe(before);
  expect(after.previous).toBe(before.envelope.sidecarSha256);
  expect(after.bytes).not.toEqual(before.bytes);
  expect(after.envelope.sidecarSha256).not.toBe(before.envelope.sidecarSha256);
  stored = after;
  fixtureCasWrites++;
  return { before, after };
}
async function freshAo() {
  const receipt = await readSavedFullAssemblySnapshotV1({ row: seed.row, seedOperationNumber: 10 });
  try {
    const p = projectSavedFullAssemblySnapshotV1(receipt);
    return {
      row: p.row,
      serverAssemblyRevision: p.serverAssemblyRevision,
      operations: p.operations,
      seams: p.seams,
    };
  } finally {
    disposeSavedFullAssemblySnapshotV1(receipt);
  }
}
function genuineCompiled(value: SavedFullAssemblyCompileResultV1) {
  expect(value.compiled, JSON.stringify(value.blockers)).toBe(true);
  if (!value.graph || !value.compileRequest || !value.compileResult?.compiled || !value.evidence)
    throw new Error('Genuine compiled content is absent.');
  expect(value.claims).toMatchObject({
    durableGraphVerified: false,
    productAuthority: false,
    runtimeAuthority: false,
  });
  return {
    ...value,
    graph: value.graph,
    compileRequest: value.compileRequest,
    compileResult: value.compileResult,
    evidence: value.evidence,
  };
}
async function newNativeSession(intent?: SavedFullAssemblyCompileIntentV1) {
  const native = await createSavedThreePanelSourceV1(seed);
  const session = createSavedFullAssemblyCompileSessionV1();
  disposers.push(() => {
    try {
      session.dispose();
    } finally {
      native.dispose();
    }
  });
  const base = await savedThreePanelCompileRequestV1(seed, native);
  const request = intent ? { ...base, intent: structuredClone(intent) } : base;
  return { native, session, request };
}

beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1();
});
beforeEach(async () => {
  wireSeed = seed;
  rpcReads = 0;
  fixtureCasWrites = 0;
  stored = await encodedOuter(null);
  vi.mocked(abortableAdminService).mockImplementation(
    (signal) =>
      ({
        GetTechCardSavedAssemblySnapshot: async (
          request: GetTechCardSavedAssemblySnapshotRequest,
        ) => {
          if (signal.aborted) throw new DOMException('Fixture read cancelled.', 'AbortError');
          const wire = await fullAssemblyFixtureWireV1(wireSeed, request.selectedOperationNumber!);
          rpcReads++;
          return structuredClone({ ...wire, semanticSidecar: stored.envelope });
        },
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
});
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
});

describe('post-CAS fresh native full-source replay; real compiler, fixture storage only', () => {
  it('invalidates the pre-save one-shot source, then a NEW source/session reproduces exact graph and material compile identity', async () => {
    const first = await newNativeSession();
    const persistedIntent = structuredClone(first.request.intent);
    const a = genuineCompiled(await first.session.consume(first.request));
    const graphA = await fingerprintDxfExactAssemblyGraphV1({
      graph: a.graph,
      assemblySnapshot: await freshAo(),
    });
    const { before, after } = await fixtureOuterCas();
    const old = await first.session.projectLatest(a.generation);
    expect(old.compiled).toBe(false);
    expect(first.session.snapshot().hasArtifact).toBe(false);
    expect(old.blockers.map((b) => b.detail).join(';')).toMatch(/snapshot|drift|changed/i);
    const second = await newNativeSession(persistedIntent);
    // Even fresh outer expectations cannot resurrect this genuinely consumed one-shot owner.
    const reuse = createSavedFullAssemblyCompileSessionV1();
    disposers.push(() => {
      reuse.dispose();
    });
    const beforeReuseReads = rpcReads;
    const rejectedReuse = await reuse.consume({
      ...first.request,
      expected: second.request.expected,
    });
    expect(rejectedReuse.compiled).toBe(false);
    expect(rejectedReuse.blockers).toContainEqual({
      code: 'stale-owner',
      detail: 'Saved compiler source owner was already consumed.',
    });
    expect(rpcReads).toBe(beforeReuseReads);
    expect(second.native.native.sourceOwner).not.toBe(first.native.native.sourceOwner);
    expect(second.session).not.toBe(first.session);
    expect(second.request.intent).toEqual(persistedIntent);
    expect(second.request.expected.fullAssemblySnapshotSha256).not.toBe(
      first.request.expected.fullAssemblySnapshotSha256,
    );
    const b = genuineCompiled(await second.session.consume(second.request));
    const graphB = await fingerprintDxfExactAssemblyGraphV1({
      graph: b.graph,
      assemblySnapshot: await freshAo(),
    });
    expect(b.graph).toEqual(a.graph);
    expect(graphB.canonicalSha256).toBe(graphA.canonicalSha256);
    expect(b.graph.source.handoffSource.documentId).toBe(persistedIntent.documentId);
    expect(b.graph.source.handoffSource.revision).toBe(persistedIntent.revision);
    expect(b.graph.source.sizeToken).toBe(persistedIntent.sizeToken);
    expect(b.compileRequest).toEqual(a.compileRequest);
    expect(b.compileResult.artifact.sourceEvidence.inputSha256).toBe(
      a.compileResult.artifact.sourceEvidence.inputSha256,
    );
    expect(b.compileResult.artifact.compiledSimulation).toEqual(
      a.compileResult.artifact.compiledSimulation,
    );
    expect(b.evidence.writerSha256).toBe(a.evidence.writerSha256);
    expect(b.evidence.nativeBinding).toEqual(a.evidence.nativeBinding);
    expect(b.evidence.fullAssemblySnapshotSha256).not.toBe(a.evidence.fullAssemblySnapshotSha256);
    if (a.evidence.outer.status !== 'present' || b.evidence.outer.status !== 'present')
      throw new Error('Expected exact Composite outer evidence.');
    expect(a.evidence.outer.bytes).toEqual(before.bytes);
    expect(b.evidence.outer.bytes).toEqual(after.bytes);
    expect(b.evidence.outer.sha256).not.toBe(a.evidence.outer.sha256);
    expect((await second.session.projectLatest(b.generation)).compileRequest).toEqual(
      b.compileRequest,
    );
    expect((await first.session.projectLatest(a.generation)).compiled).toBe(false);
    expect(fixtureCasWrites).toBe(1);
    expect(rpcReads).toBeGreaterThan(12);
  });

  it.each(['documentId', 'revision'] as const)(
    'regenerating persisted %s fails the existing graph/source-handoff binding instead of reusing prior identity',
    async (field) => {
      const first = await newNativeSession();
      const a = genuineCompiled(await first.session.consume(first.request));
      const persistedGraph = await fingerprintDxfExactAssemblyGraphV1({
        graph: a.graph,
        assemblySnapshot: await freshAo(),
      });
      await fixtureOuterCas();
      const changed = {
        ...structuredClone(first.request.intent),
        [field]: field === 'documentId' ? 'regenerated-document-id' : '2',
      };
      const second = await newNativeSession(changed);
      const b = genuineCompiled(await second.session.consume(second.request));
      const ao = await freshAo(),
        nextGraph = await fingerprintDxfExactAssemblyGraphV1({
          graph: b.graph,
          assemblySnapshot: ao,
        });
      expect(nextGraph.canonicalSha256).not.toBe(persistedGraph.canonicalSha256);
      expect(b.compileResult.artifact.sourceEvidence.inputSha256).not.toBe(
        a.compileResult.artifact.sourceEvidence.inputSha256,
      );
      // Positive control: the existing source-handoff binding accepts the unchanged pair.
      const same = await projectDxfExactAssemblyGraphCompileRequestV1({
        graph: a.graph,
        assemblySnapshot: ao,
        sourceHandoff: a.compileRequest.handoff,
        sourceSampling: a.compileRequest.samplingRequest,
      });
      expect(same.request).toEqual(a.compileRequest);
      // A legitimately new authoring identity can compile, but cannot replay the old persisted
      // graph against this newly issued source handoff. This is the existing binding check.
      await expect(
        projectDxfExactAssemblyGraphCompileRequestV1({
          graph: a.graph,
          assemblySnapshot: ao,
          sourceHandoff: b.compileRequest.handoff,
          sourceSampling: b.compileRequest.samplingRequest,
        }),
      ).rejects.toMatchObject({ code: 'source-binding' });
    },
  );

  it('actual AO output drift refuses the preserved complete intent even with a NEW native owner and fresh outer read', async () => {
    const first = await newNativeSession();
    const a = genuineCompiled(await first.session.consume(first.request));
    const persistedIntent = structuredClone(first.request.intent);
    await fixtureOuterCas();
    // The fixture server really changes an authored operation's output. Its canonical topology
    // payload/hash are regenerated by the same existing transport fixture, not forged independently.
    wireSeed = {
      ...seed,
      operations: seed.operations.map((o) =>
        o.operationNumber === 20 ? { ...o, outputUnitKey: 'different-assembled-output' } : o,
      ),
    };
    const old = await first.session.projectLatest(a.generation);
    expect(old.compiled).toBe(false);
    expect(first.session.snapshot().hasArtifact).toBe(false);
    const second = await newNativeSession(persistedIntent);
    const result = await second.session.consume(second.request);
    expect(result.compiled).toBe(false);
    expect(second.session.snapshot().hasArtifact).toBe(false);
    expect(result.blockers.map((b) => b.detail).join(';')).toMatch(
      /operation|output|AO|snapshot|binding/i,
    );
    expect(result.claims.durableGraphVerified).toBe(false);
  });
});
