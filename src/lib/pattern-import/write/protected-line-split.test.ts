import { beforeAll, expect, it } from 'vitest';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { sha256Hex } from '../adapters/vector/builder';
import { readManifest, validateManifest } from '../manifest';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
} from '../dxf-source-native-straight-edge-authority-v1';
import type { PtMm, WriteJob } from '../types';
import { applyAffine } from './geom';
import { writeDxfDetailed, writeDxfWithAuthoredLineSplit } from './index';
import type { AuthoredLineSplitInput } from './protected-line-split';

const clock = { now: () => new Date(0) };
const bytes = (text: string) => new TextEncoder().encode(text).buffer;
let source: WriteJob;
beforeAll(async () => {
  const seed = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
  source = seed.draft.scopes[0]!.writerReplay!.job;
});

async function decoded(file: AuthoredLineSplitInput['file'], block: string, role: 'cut' | 'seam') {
  const native = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    file,
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId: file.id },
  );
  if (!native.ok) throw Error(JSON.stringify(native.blockers));
  const doc = native.value.read.doc,
    page = doc.pages[0]!;
  const paths = page.paths.filter(
    (p) =>
      p.closed &&
      p.src.block === block &&
      page.styles.find((s) => s.id === p.style)?.layer === (role === 'cut' ? '1' : '14'),
  );
  expect(paths).toHaveLength(1);
  const pathId = paths[0]!.id;
  const selected = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(native.value.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId: file.id,
    sourceSha256: doc.file.sha256,
    sourcePathIds: [pathId],
  });
  if (!selected.ok) throw Error(JSON.stringify(selected.blockers));
  expect(selected.projection.complete).toBe(true);
  return { sha: doc.file.sha256, pathId, segments: selected.projection.descriptors };
}

async function editedJob(role: 'cut' | 'seam', nativeIndex = 0) {
  const job = structuredClone(source),
    original = writeDxfDetailed(source, clock);
  const file = { id: 'saved', name: 'source.dxf', bytes: bytes(original.dxfText) };
  const piece = job.pieces.find((p) => p.identity === 'BACK')!;
  const size = piece.sizes[0]!,
    block = original.plan.blocks.find((b) => b.identity === piece.identity)!;
  const { sha, pathId, segments } = await decoded(file, block.name, role);
  const edge = segments.find((s) => s.path.startPointIndex === nativeIndex)!;
  const ring = size[role]!;
  const pair = (p: PtMm, xy: readonly number[]) => p.x === xy[0] && p.y === xy[1];
  const i = ring.findIndex((p, i) => {
    const a = applyAffine(block.transform, p),
      b = applyAffine(block.transform, ring[(i + 1) % ring.length]!);
    return (
      (pair(a, edge.startMm) && pair(b, edge.endMm)) ||
      (pair(b, edge.startMm) && pair(a, edge.endMm))
    );
  });
  expect(i).toBeGreaterThanOrEqual(0);
  const a = ring[i]!,
    b = ring[(i + 1) % ring.length]!;
  ring.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const input: AuthoredLineSplitInput = {
    file,
    sourceSha256: sha,
    scopeKey: job.scope.scopeKey,
    identity: piece.identity,
    sizeId: size.sizeId,
    sizeToken: size.sizeToken,
    rank: size.rank,
    role,
    sourcePathId: pathId,
    sourceCurveId: edge.sourceCurveId,
    startVertexId: edge.startVertexId,
    endVertexId: edge.endVertexId,
    jobPointIndex: i + 1,
    progress: 0.5,
    entityId: 'authored-vertex-1',
  };
  return {
    job,
    input,
    block,
    edge,
    ring,
    otherRole: role === 'cut' ? ('seam' as const) : ('cut' as const),
  };
}

it.each([
  [
    'r12',
    '8e2bbdcc0c31db44e1a415e7a505d21e9647c70070e276601656e9a378d3c442',
    '7db1366d8c39b95cf7e1b550b93840354b9df0086598c9a9a7aa93a7da9aa33d',
  ],
  [
    'r2000',
    '90eb3320b9ab47f7453a242ff85e6a3971f2190e4865840b1c82569644bf1850',
    '474164851b0e804c4d7fe08cfac5ab8464d65b88b2dee15170ee302458158f83',
  ],
] as const)(
  'preserves pre-change %s bytes for unprotected jobs',
  async (dialect, bare, embedded) => {
    const result = writeDxfDetailed({ ...source, dialect }, clock);
    expect(await sha256Hex(bytes(result.bareText))).toBe(bare);
    expect(await sha256Hex(bytes(result.dxfText))).toBe(embedded);
  },
);

it.each([
  ['cut', 'r12', 0],
  ['cut', 'r2000', 3],
  ['seam', 'r12', 3],
  ['seam', 'r2000', 0],
] as const)(
  'preserves the exact %s interval in %s at native segment %i',
  async (role, dialect, start) => {
    const { job, input, block, edge, otherRole } = await editedJob(role, start);
    const before = structuredClone(job);
    const result = await writeDxfWithAuthoredLineSplit({ ...job, dialect }, input, clock);
    expect(job).toEqual(before);
    const manifest = readManifest(result.dxfText)!;
    expect(manifest).toEqual(JSON.parse(JSON.stringify(result.manifest)));
    const record = manifest.blocks.find((b) => b.block === block.name)!.protectedLineSplit!;
    expect(record).toMatchObject({
      role,
      sourceSha256: input.sourceSha256,
      sourcePathId: input.sourcePathId,
      pointIndex: start + 1,
      sourceStartPointIndex: start,
      entityId: input.entityId,
      fromMm: edge.startMm,
      toMm: edge.endMm,
      ringPointCount: 5,
      progress: 0.5,
    });
    const file = { ...input.file, bytes: bytes(result.dxfText) };
    const { segments } = await decoded(file, block.name, role);
    const a = segments.find((s) => s.path.startPointIndex === start)!,
      b = segments.find((s) => s.path.startPointIndex === start + 1)!;
    expect(a.endMm).toEqual(record.pointMm);
    expect(a.endMm).toEqual(b.startMm);
    expect(a.startMm).toEqual(record.fromMm);
    expect(b.endMm).toEqual(record.toMm);
    expect(a.path.endPointIndex).toBe(b.path.startPointIndex);
    const ordered = segments
      .slice()
      .sort((a, b) => a.path.startPointIndex - b.path.startPointIndex);
    expect(segments.length).toBe(record.ringPointCount);
    expect(await sha256Hex(bytes(JSON.stringify(ordered.map((s) => s.startMm))))).toBe(
      record.ringSha256,
    );
    expect((await decoded(file, block.name, otherRole)).segments).toHaveLength(4);
  },
);

it('rejects stale selection, peer layer, wrong rank, ambiguous geometry, or imprecise split', async () => {
  const { job, input, ring } = await editedJob('seam');
  for (const changes of [
    { sourceSha256: 'a'.repeat(64) },
    { scopeKey: 'other' },
    { sizeToken: 'L' },
    { rank: 99 },
    { role: 'cut' as const },
    { sourcePathId: input.sourcePathId + 1 },
    { sourceCurveId: 'other' },
    { startVertexId: input.endVertexId, endVertexId: input.startVertexId },
    { jobPointIndex: 0 },
    { progress: 0.25 },
    { progress: 1 },
    { entityId: '' },
  ])
    await expect(
      writeDxfWithAuthoredLineSplit(job, { ...input, ...changes }, clock),
    ).rejects.toThrow();
  const twin = structuredClone(job);
  const twinRing = twin.pieces.find((p) => p.identity === 'BACK')!.sizes[0]!.cut;
  twinRing.splice(1, 0, {
    x: (twinRing[0]!.x + twinRing[1]!.x) / 2,
    y: (twinRing[0]!.y + twinRing[1]!.y) / 2,
  });
  await expect(writeDxfWithAuthoredLineSplit(twin, input, clock)).rejects.toThrow(
    'other boundary also changed',
  );
  const shifted = structuredClone(job);
  shifted.pieces.find((p) => p.identity === 'BACK')!.sizes[0]!.seam![3]!.x += 1;
  await expect(writeDxfWithAuthoredLineSplit(shifted, input, clock)).rejects.toThrow();
  const duplicate = structuredClone(job);
  duplicate.pieces.push(structuredClone(duplicate.pieces.find((p) => p.identity === 'BACK')!));
  await expect(writeDxfWithAuthoredLineSplit(duplicate, input, clock)).rejects.toThrow();
  ring[input.jobPointIndex]!.x += 0.00000001;
  await expect(writeDxfWithAuthoredLineSplit(job, input, clock)).rejects.toThrow();
});

it('rejects a transformed original DXF instance even with its current file digest', async () => {
  const { job, input, block } = await editedJob('seam');
  const lines = new TextDecoder().decode(input.file.bytes).split('\r\n');
  let changed = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i]!.trim() !== '0' || lines[i + 1] !== 'INSERT') continue;
    let end = i + 2;
    while (end + 1 < lines.length && lines[end]!.trim() !== '0') end += 2;
    let name = '',
      x = -1;
    for (let j = i + 2; j < end; j += 2) {
      if (lines[j]!.trim() === '2') name = lines[j + 1]!;
      if (lines[j]!.trim() === '10') x = j + 1;
    }
    if (name === block.name && x > 0) {
      lines[x] = String(Number(lines[x]) + 1);
      changed = true;
      break;
    }
  }
  expect(changed).toBe(true);
  const file = { ...input.file, bytes: bytes(lines.join('\r\n')) };
  await expect(
    writeDxfWithAuthoredLineSplit(
      job,
      { ...input, file, sourceSha256: await sha256Hex(file.bytes) },
      clock,
    ),
  ).rejects.toThrow();
});

it('rejects malformed or repeated embedded records and pre-existing protected sheets', async () => {
  const { job, input, block } = await editedJob('cut');
  const { manifest, dxfText } = await writeDxfWithAuthoredLineSplit(job, input, clock);
  for (const change of [
    { pointIndex: 8 },
    { pointMm: [0, 0] },
    { pointMm: [1.00000008, 0] },
    { role: 'internal' },
    { progress: 1 },
    { ringSha256: 'corrupt' },
    { sourceStartPointIndex: 99 },
  ]) {
    const bad = structuredClone(manifest);
    Object.assign(bad.blocks.find((b) => b.block === block.name)!.protectedLineSplit!, change);
    expect(() => validateManifest(bad)).toThrow();
  }
  const two = structuredClone(manifest);
  two.blocks.find((b) => b.block !== block.name)!.protectedLineSplit = two.blocks.find(
    (b) => b.block === block.name,
  )!.protectedLineSplit;
  expect(() => validateManifest(two)).toThrow();
  await expect(
    writeDxfWithAuthoredLineSplit(
      job,
      {
        ...input,
        file: { ...input.file, bytes: bytes(dxfText) },
        sourceSha256: await sha256Hex(bytes(dxfText)),
      },
      clock,
    ),
  ).rejects.toThrow('already carries');
});
