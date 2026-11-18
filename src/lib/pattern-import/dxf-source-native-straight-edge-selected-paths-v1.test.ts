import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeDxfSourceNativeStraightEdgesInternalV1 } from './adapters/dxf/extract';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1 as SCHEMA,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_V1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1 as WHOLE_SCHEMA,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1 as project,
  projectDxfSourceNativeStraightEdgeAuthorityV1 as whole,
  readDxfWithSourceNativeStraightEdgeAuthorityV1 as read,
  readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1 as readScoped,
} from './dxf-source-native-straight-edge-authority-v1';

// Genuine native decoder and private one-shot owner. Shapes are explicitly authored ASCII DXF,
// not saved-card/backend acceptance. No decoder/registry mocks are used.
const sourceFileId = 'selected-native-fixture';
function polygon(handle = 'A1', bulge = false) {
  return `0\nLWPOLYLINE\n5\n${handle}\n8\n14\n90\n4\n70\n1\n10\n10\n20\n20\n${bulge ? '42\n0.2\n' : ''}10\n110\n20\n20\n10\n110\n20\n100\n10\n10\n20\n100\n`;
}
function point(i: number) {
  return `0\nPOINT\n5\n${(0x10000 + i).toString(16)}\n8\n4\n10\n${i}\n20\n0\n`;
}
function dxf(entities: string) {
  return new TextEncoder().encode(
    `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`,
  ).buffer;
}
async function fixture(entities = polygon()) {
  const result = await read(
    { id: sourceFileId, name: 'selected.dxf', bytes: dxf(entities) },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId },
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  const request = (sourcePathIds = [0]) => ({
    schemaVersion: SCHEMA,
    sourceFileId,
    sourceSha256: result.value.read.doc.file.sha256,
    sourcePathIds,
  });
  return { ...result.value, request };
}
function success(result: Awaited<ReturnType<typeof project>>) {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.projection;
}
function scopedRead(entities: string, request: unknown) {
  return readScoped(
    { id: sourceFileId, name: 'selected.dxf', bytes: dxf(entities) },
    { sagittaMm: 0.05, keepFills: true },
    request,
  );
}
afterEach(() => vi.restoreAllMocks());

describe('selected native straight paths: genuine decoder scope and coverage', () => {
  it('reopens only the exact selected paths and seals the same covered subset as a whole read', async () => {
    const entities = polygon() + polygon('B1') + polygon('C1', true);
    const f = await fixture(entities);
    const selected = await scopedRead(entities, f.request([0, 1]));
    if (!selected.ok) throw new Error(JSON.stringify(selected));
    expect(selected.value.scope).toEqual({
      kind: 'exact-selected-source-paths',
      sourcePathIds: [0, 1],
      wholeFileCompletenessClaimed: false,
    });
    expect(Object.isFrozen(selected.value.scope?.sourcePathIds)).toBe(true);
    const subset = await project(selected.value.owner, f.request([1]));
    expect(subset).toEqual(await project(f.owner, f.request([1])));
    expect(success(subset).complete).toBe(true);
    expect(await project(selected.value.owner, f.request([1]))).toMatchObject({
      ok: false,
      blockers: [{ code: 'stale-owner' }],
    });
  });

  it('does not widen scoped authority to a different valid path or to the whole file', async () => {
    const entities = polygon() + polygon('B1');
    const f = await fixture(entities);
    const first = await scopedRead(entities, f.request([0]));
    if (!first.ok) throw new Error(JSON.stringify(first));
    expect(await project(first.value.owner, f.request([0, 1]))).toMatchObject({
      ok: false,
      blockers: [{ code: 'source-path-scope-mismatch' }],
    });
    expect(await project(first.value.owner, f.request([0]))).toMatchObject({
      ok: false,
      blockers: [{ code: 'stale-owner' }],
    });
    const second = await scopedRead(entities, f.request([0]));
    if (!second.ok) throw new Error(JSON.stringify(second));
    expect(
      whole(second.value.owner, {
        schemaVersion: WHOLE_SCHEMA,
        sourceFileId,
        sourceSha256: f.request().sourceSha256,
      }),
    ).toMatchObject({ ok: false, blockers: [{ code: 'source-path-scope-mismatch' }] });
  });

  it('refuses changed bytes, unsupported or missing requested paths, and global extraction loss', async () => {
    const entities = polygon() + polygon('B1', true);
    const f = await fixture(entities);
    expect(await scopedRead(polygon('D1') + polygon('B1', true), f.request())).toMatchObject({
      ok: false,
      blockers: [{ code: 'source-identity-mismatch' }],
    });
    expect(await scopedRead(entities, f.request([1]))).toMatchObject({
      ok: false,
      blockers: [{ sourcePathId: 1 }],
    });
    expect(await scopedRead(entities, f.request([100]))).toMatchObject({
      ok: false,
      blockers: [{ sourcePathId: 100 }],
    });
    const missingBlock = polygon() + '0\nINSERT\n5\nE1\n2\nMISSING\n10\n0\n20\n0\n';
    const global = await fixture(missingBlock);
    expect(await scopedRead(missingBlock, global.request())).toMatchObject({
      ok: false,
      blockers: [{ sourcePathId: null }],
    });
  });

  it('seals exact selected path with complete native corner/segment identities and detached immutable output', async () => {
    const f = await fixture(polygon() + polygon('B1'));
    const projected = success(await project(f.owner, f.request([1])));
    expect(projected.complete).toBe(true);
    expect(projected.schemaVersion).toBe(DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_V1);
    expect(projected.scope).toEqual({
      kind: 'exact-selected-source-paths',
      sourcePathIds: [1],
      wholeFileCompletenessClaimed: false,
    });
    expect(projected.descriptors).toHaveLength(4);
    expect(
      projected.descriptors.map((d) => [
        d.path.sourcePathId,
        d.path.startPointIndex,
        d.path.endPointIndex,
      ]),
    ).toEqual([
      [1, 0, 1],
      [1, 1, 2],
      [1, 2, 3],
      [1, 3, 0],
    ]);
    expect(
      projected.descriptors.every(
        (d) => d.primitive.entityHandle === 'B1' && d.native.curveKind === 'line',
      ),
    ).toBe(true);
    expect(projected.claims).toMatchObject({
      productionReady: false,
      wholeFileCompletenessClaimed: false,
      endpointInferenceUsed: false,
    });
    expect(Object.isFrozen(projected.descriptors[0].startMm)).toBe(true);
    expect(Object.isFrozen(projected.scope.sourcePathIds)).toBe(true);
  });

  it('has deterministic scope-bound seals and keeps the legacy whole-file domain distinct', async () => {
    const source = polygon() + polygon('B1');
    const a = await fixture(source),
      b = await fixture(source),
      c = await fixture(source),
      d = await fixture(source);
    const pa = success(await project(a.owner, a.request([0])));
    const pb = success(await project(b.owner, b.request([0])));
    const pc = success(await project(c.owner, c.request([1])));
    const old = whole(d.owner, {
      ...d.request(),
      schemaVersion: WHOLE_SCHEMA,
      sourcePathIds: undefined,
    });
    expect(old.ok).toBe(false); // V1 still rejects additional fields.
    expect(pa.authoritySha256).toBe(pb.authoritySha256);
    expect(pa.authoritySha256).not.toBe(pc.authoritySha256);
    const e = await fixture(source);
    const legacy = whole(e.owner, {
      schemaVersion: WHOLE_SCHEMA,
      sourceFileId,
      sourceSha256: e.request().sourceSha256,
    });
    expect(legacy.ok).toBe(true);
    if (legacy.ok) {
      expect(legacy.projection.complete).toBe(true);
      expect(legacy.projection.authoritySha256).not.toBe(pa.authoritySha256);
    }
  });

  it('admits selected straight geometry despite >4096 unrelated POINT diagnostics; whole V1 remains incomplete', async () => {
    const entities = Array.from({ length: 4100 }, (_, i) => point(i)).join('') + polygon();
    const scoped = await fixture(entities),
      full = await fixture(entities);
    const p = success(await project(scoped.owner, scoped.request([4100])));
    expect(p.complete).toBe(true);
    expect(p.blockers).toEqual([]);
    expect(p.descriptors).toHaveLength(4);
    const old = whole(full.owner, {
      schemaVersion: WHOLE_SCHEMA,
      sourceFileId,
      sourceSha256: full.request().sourceSha256,
    });
    expect(old.ok).toBe(true);
    if (old.ok) {
      expect(old.projection.complete).toBe(false);
      expect(old.projection.blockers).toHaveLength(4096);
      expect(old.projection.blockers.at(-1)?.code).toBe('bounds-exceeded');
    }
  });

  it('retains a selected bulge rejection after the presentation diagnostic cap and refuses a partial line subset', async () => {
    const entities =
      Array.from({ length: 4100 }, (_, i) => point(i)).join('') + polygon('C1', true);
    const f = await fixture(entities);
    const p = success(await project(f.owner, f.request([4100])));
    expect(p.complete).toBe(false);
    expect(p.descriptors).toHaveLength(0);
    expect(p.blockers).toEqual([
      expect.objectContaining({ sourcePathId: 4100, code: 'path-provenance-unavailable' }),
    ]);
  });

  it.each([
    ['selected POINT', point(0)],
    ['selected bulge', polygon('A1', true)],
  ])('rejects %s without guessing line geometry', async (_, entities) => {
    const f = await fixture(entities);
    expect(success(await project(f.owner, f.request())).complete).toBe(false);
  });

  it('refuses unknown selected paths and duplicate entity provenance', async () => {
    const missing = await fixture();
    expect(success(await project(missing.owner, missing.request([100]))).complete).toBe(false);
    const duplicate = await fixture(polygon() + polygon());
    expect(success(await project(duplicate.owner, duplicate.request([0]))).complete).toBe(false);
  });

  it('refuses an unscoped missing INSERT block even if selected polygon is intact', async () => {
    const f = await fixture(polygon() + '0\nINSERT\n5\nE1\n2\nMISSING\n10\n0\n20\n0\n');
    const p = success(await project(f.owner, f.request()));
    expect(p.complete).toBe(false);
    expect(p.blockers).toContainEqual(expect.objectContaining({ sourcePathId: null }));
  });

  it('fails all selected scopes if the independent coverage ledger itself overflows', async () => {
    const f = await fixture(
      polygon() + Array.from({ length: 100001 }, (_, i) => point(i)).join(''),
    );
    const p = success(await project(f.owner, f.request([0])));
    expect(p.complete).toBe(false);
    expect(p.blockers).toContainEqual(expect.objectContaining({ sourcePathId: null }));
  }, 30000);

  it('records descriptor overflow as global even with a complete earlier selected path', async () => {
    const vertices = Array.from(
      { length: 10000 },
      (_, i) => `10\n${i < 5000 ? i : 9999 - i}\n20\n${i < 5000 ? 0 : 100}\n`,
    ).join('');
    const entities = Array.from(
      { length: 11 },
      (_, i) =>
        `0\nLWPOLYLINE\n5\n${(0x200 + i).toString(16)}\n8\n14\n90\n10000\n70\n1\n${vertices}`,
    ).join('');
    // Internal decoder evidence only: this does not mint or replace any authority owner.
    const decoded = await decodeDxfSourceNativeStraightEdgesInternalV1(
      { id: sourceFileId, name: 'descriptor-overflow.dxf', bytes: dxf(entities) },
      { sagittaMm: 0.05, keepFills: true },
      sourceFileId,
    );
    expect(decoded.candidates).toHaveLength(100000);
    expect(decoded.selectedPathCoverage.globalFailure).toBe(true);
    expect(decoded.selectedPathCoverage.paths[0]).toMatchObject({
      sourcePathId: 0,
      pointCount: 10000,
      rejected: false,
    });
    expect(decoded.blockers.some((b) => b.code === 'bounds-exceeded')).toBe(true);
  }, 30000);

  it('admits an exact open LINE with its entire native segment, not a contour closure claim', async () => {
    const f = await fixture('0\nLINE\n5\nD1\n8\n14\n10\n10\n20\n20\n11\n110\n21\n20\n');
    const p = success(await project(f.owner, f.request()));
    expect(p.complete).toBe(true);
    expect(p.descriptors).toHaveLength(1);
    expect(p.descriptors[0].path).toEqual({
      sourcePathId: 0,
      closed: false,
      startPointIndex: 0,
      endPointIndex: 1,
    });
  });

  it('keeps the retained descriptor/coverage independent from mutable public DXF read', async () => {
    const f = await fixture();
    f.read.doc.pages[0].paths.splice(0);
    expect(Object.isFrozen(f.provenance.paths)).toBe(true);
    const p = success(await project(f.owner, f.request()));
    expect(p.complete).toBe(true);
    expect(p.descriptors).toHaveLength(4);
  });
});

describe('selected native projection: one-shot, hostile capture, and async sealing', () => {
  it('rejects forged/copied/proxied owners without reading caller getters', async () => {
    const f = await fixture();
    let calls = 0;
    for (const owner of [
      { ...f.owner },
      new Proxy(f.owner, {
        get() {
          calls++;
          throw new Error();
        },
      }),
      Object.defineProperty({}, 'version', {
        get() {
          calls++;
          throw new Error();
        },
      }),
    ]) {
      expect((await project(owner, f.request())).ok).toBe(false);
    }
    expect(calls).toBe(0);
    expect(success(await project(f.owner, f.request())).complete).toBe(true);
  });

  it.each(
    [[], [1, 0], [0, 0], [-1], [-0], [0.5], [Number.MAX_SAFE_INTEGER + 1], new Array(100001)].map(
      (ids) => ({ ids }),
    ),
  )('rejects malformed or unbounded selection $ids', async ({ ids }) => {
    const f = await fixture();
    expect((await project(f.owner, f.request(ids))).ok).toBe(false);
  });

  it('rejects request and array getters without invoking them', async () => {
    let reads = 0;
    const f = await fixture();
    const request = f.request();
    Object.defineProperty(request, 'sourcePathIds', {
      enumerable: true,
      get() {
        reads++;
        return [0];
      },
    });
    expect((await project(f.owner, request)).ok).toBe(false);
    const g = await fixture();
    const ids = [0];
    Object.defineProperty(ids, '0', {
      enumerable: true,
      get() {
        reads++;
        return 0;
      },
    });
    expect((await project(g.owner, g.request(ids))).ok).toBe(false);
    expect(reads).toBe(0);
  });

  it('captures one-shot ownership before reentrant proxy reflection', async () => {
    const f = await fixture();
    let nested: ReturnType<typeof project> | undefined;
    const request = new Proxy(f.request(), {
      ownKeys(target) {
        nested = project(f.owner, f.request());
        return Reflect.ownKeys(target);
      },
    });
    expect(success(await project(f.owner, request)).complete).toBe(true);
    expect(await nested).toMatchObject({ ok: false, blockers: [{ code: 'stale-owner' }] });
  });

  it('shares one-shot consumption with V1, including malformed request refusal', async () => {
    const f = await fixture();
    expect((await project(f.owner, { ...f.request(), sourceSha256: 'f'.repeat(64) })).ok).toBe(
      false,
    );
    expect(
      whole(f.owner, {
        schemaVersion: WHOLE_SCHEMA,
        sourceFileId,
        sourceSha256: f.request().sourceSha256,
      }),
    ).toMatchObject({ ok: false, blockers: [{ code: 'stale-owner' }] });
    const g = await fixture();
    expect(
      whole(g.owner, {
        schemaVersion: WHOLE_SCHEMA,
        sourceFileId,
        sourceSha256: g.request().sourceSha256,
      }).ok,
    ).toBe(true);
    expect(await project(g.owner, g.request())).toMatchObject({
      ok: false,
      blockers: [{ code: 'stale-owner' }],
    });
  });

  it('captures request paths before async hash and fails closed on unavailable sealing', async () => {
    const f = await fixture(polygon() + polygon('B1'));
    const request = f.request([0]);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      await gate;
      return digest(...args);
    });
    const pending = project(f.owner, request);
    request.sourcePathIds[0] = 1;
    release();
    expect(success(await pending).scope.sourcePathIds).toEqual([0]);
    vi.restoreAllMocks();
    const g = await fixture();
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('unavailable'));
    expect(await project(g.owner, g.request())).toMatchObject({
      ok: false,
      blockers: [{ code: 'sha256-unavailable' }],
    });
  });
});
