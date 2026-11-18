import { prepareSourceCutSurfaceProjectionV1 } from 'lib/cloth/runtime/cpu/source-cut-surface-projection-v1';
import {
  prepareGarmentStagedSourceCutCoreV1,
  prepareGarmentStagedSourceCutSeamsV1,
  snapshotGarmentStagedSourceCutCoreV1,
} from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';

type Core = Parameters<typeof prepareGarmentStagedSourceCutCoreV1>[0];
type Cut = NonNullable<ReturnType<Core['cutByPiece']['get']>>;
type Pair = Parameters<typeof prepareGarmentStagedSourceCutSeamsV1>[1][number];
type Stage = ReturnType<typeof prepareGarmentStagedSourceCutSeamsV1>['stages'][number];

export type SavedCompleteWholeSourceCutV1 = Readonly<{
  schemaVersion: 'saved-complete-assembly-native-stitch-anchors/1';
  cardId: number;
  cardLockVersion: number;
  sourceSha256: string;
  savedCarrier: Readonly<{ sidecarSha256: string }> | null;
  sizeId: number;
  sizeToken: string;
  sourceCuts: readonly Readonly<{
    pieceLineKey: string;
    nativePointsMm: readonly Readonly<{ x: number; y: number }>[];
  }>[];
  operations: readonly Readonly<{ operationNumber: number }>[];
  spans: readonly Readonly<{ operationOrder: number; operationNumber: number }>[];
  labelAnchors: readonly Readonly<{
    operationOrder: number;
    operationNumber: number;
    pieceLineKey: string;
  }>[];
  unavailable: readonly unknown[];
}>;

const SOURCE_SHA = '8e7cf7e068f19f4ae2a42265f7379c4b0f8388c148bda1e0a7c9973cb7bfa1e0';
const CARRIER_SHA = 'e167a808c2832d2567484f2e2b161a5f17dbe0cc776e0717d848b6c39621d343';
const CANDIDATE_SHA = 'f3c95d5f52f26c93750edaaddfee1ebf03114ae30994d75f57f373195596d368';
const DETACHED_BELT = '01M1M1ZAHFC325NZF44RAG1SM7';
const LABEL = '01M75ACEBB74BMT91RJ7WSTTJY';

type Candidate = {
  mesh: Omit<Core['mesh'], 'restPositions2Mm' | 'triangles'> & {
    restPositions2Mm: readonly number[];
    triangles: readonly number[];
  };
  cuts: readonly (readonly [
    string,
    Omit<Cut, 'cut'> & {
      cut: Omit<Cut['cut'], 'triangles'> & { triangles: readonly number[] };
    },
  ])[];
  world: readonly number[];
  pairs: readonly Pair[];
  profile: Pick<Core, 'materials' | 'continuumMaterials'> & {
    materialSolver: Core['materialOptions'];
  };
  pressedCreases: Core['pressedCreases'];
  expected: {
    supportRowsSha256: string;
    cutMassSha256: string;
    flatRestSha256: string;
    cutBendRestSha256: string;
    stages: readonly Stage[];
    cutTriangleCount: number;
  };
  sourceScope: {
    initialPositionsSha256: string;
    bodyPositionsSha256: string;
    bodyTrianglesSha256: string;
    provisionalSourceOperations: readonly number[];
  };
  outwardSign: 1 | -1;
};

async function digest(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

function sameCut(
  actual: SavedCompleteWholeSourceCutV1['sourceCuts'][number]['nativePointsMm'],
  expected: Cut['cut']['verticesMm'],
) {
  const count = expected.length;
  if (actual.length !== count || count < 3) return false;
  return expected.some(
    ([x, y], start) =>
      x === actual[0].x &&
      y === actual[0].y &&
      [1, -1].some((direction) =>
        actual.every((point, offset) => {
          const [a, b] = expected[(start + direction * offset + count) % count];
          return a === point.x && b === point.y;
        }),
      ),
  );
}

/** Bind the diagnostic pants placement to the exact saved source before using the existing solver. */
export async function prepareSavedCompleteWholeSourceCutV1(
  input: Readonly<{
    source: SavedCompleteWholeSourceCutV1;
    candidate: ArrayBuffer;
    assertCurrentSource: () => boolean;
    frameCount?: 1 | 4;
  }>,
  signal?: AbortSignal,
) {
  const { source, candidate, assertCurrentSource } = input;
  function requireCurrent() {
    signal?.throwIfAborted();
    if (assertCurrentSource() !== true) throw new Error('The saved garment source has changed.');
  }
  requireCurrent();
  if (
    source.schemaVersion !== 'saved-complete-assembly-native-stitch-anchors/1' ||
    source.cardId !== 2 ||
    source.cardLockVersion !== 1 ||
    source.sourceSha256 !== SOURCE_SHA ||
    source.savedCarrier?.sidecarSha256 !== CARRIER_SHA ||
    source.sizeId !== 58 ||
    source.sizeToken !== 'M' ||
    source.sourceCuts.length !== 24 ||
    source.operations.length !== 71 ||
    source.spans.length !== 70 ||
    source.labelAnchors.length !== 1 ||
    source.labelAnchors[0].pieceLineKey !== LABEL ||
    source.unavailable.length !== 0
  )
    throw new RangeError('This diagnostic pants placement belongs to a different saved source.');
  const bytes = candidate.slice(0);
  if ((await digest(bytes)) !== CANDIDATE_SHA)
    throw new RangeError('The sealed diagnostic pants placement has changed.');
  requireCurrent();
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Candidate;
  const cuts = new Map<string, Cut>(
    data.cuts.map(([id, entry]) => [
      id,
      { ...entry, cut: { ...entry.cut, triangles: Uint32Array.from(entry.cut.triangles) } },
    ]),
  );
  const native = new Map(source.sourceCuts.map((cut) => [cut.pieceLineKey, cut.nativePointsMm]));
  if (
    native.size !== 24 ||
    !native.has(DETACHED_BELT) ||
    cuts.has(DETACHED_BELT) ||
    [...cuts].some(
      ([id, { cut }]) => id !== LABEL && !sameCut(native.get(id) ?? [], cut.verticesMm),
    )
  )
    throw new RangeError('A saved native cut differs from the sealed diagnostic placement.');
  const stages = new Map<number, number>();
  for (const span of [...source.spans, ...source.labelAnchors]) {
    if (source.operations[span.operationOrder]?.operationNumber !== span.operationNumber)
      throw new RangeError('The persisted sewing operation order differs.');
    stages.set(span.operationOrder, span.operationNumber);
  }
  const operationNumbers = [...stages].sort(([a], [b]) => a - b).map(([, operation]) => operation);
  if (
    JSON.stringify(operationNumbers) !==
    JSON.stringify(data.expected.stages.map((s) => s.operationOrder))
  )
    throw new RangeError('The diagnostic placement does not cover the saved sewing operations.');
  const mesh: Core['mesh'] = {
    ...data.mesh,
    restPositions2Mm: Float32Array.from(data.mesh.restPositions2Mm),
    triangles: Uint32Array.from(data.mesh.triangles),
  };
  const ids = mesh.pieceRanges.map(({ pieceId }) => pieceId);
  const { materials, continuumMaterials, materialSolver } = data.profile;
  const world = Float32Array.from(data.world);
  const material = prepareGarmentStagedSourceCutCoreV1(
    {
      mesh,
      grains: ids.map((pieceId) => ({ pieceId, grainDegrees: 0 })),
      assignments: [
        { id: materials[0].id, materialRevision: materials[0].revision, pieceIds: ids },
      ],
      materials,
      continuumMaterials,
      materialOptions: materialSolver,
      cutByPiece: cuts,
      cutTolerances: {
        absoluteAreaToleranceMm2: 1e-6,
        relativeAreaTolerance: 1e-8,
        centroidToleranceMm: 1e-6,
      },
      currentPositionsMInvMass: world,
      pressedCreases: data.pressedCreases,
      parameters: {
        dtS: materialSolver.dtS,
        solverIterations: materialSolver.solverIterations,
        frameCount: input.frameCount ?? 4,
        gravityMps2Y: -9.81,
        windAccelerationMps2Z: 0,
        distanceComplianceMPerN: 2e-7,
        seamComplianceMPerN: 1e-8,
      },
      budgets: {
        maxParticles: 2_000,
        maxTriangles: 5_000,
        maxConstraintCount: 15_000,
        maxGpuBytes: 16_777_216,
        maxDispatches: 120_000,
        maxConstraintInvocations: 50_000_000,
        maxWorkgroupsPerDispatch: 65_535,
      },
    },
    signal,
  );
  const seams = prepareGarmentStagedSourceCutSeamsV1(material, data.pairs, {
    maxTriangleTests: 2_000_000,
    maxSupportBytes: 128_000,
  });
  const snapshot = snapshotGarmentStagedSourceCutCoreV1(material);
  const expected = [
    [world.buffer, data.sourceScope.initialPositionsSha256],
    [snapshot.uploads.restPositions.buffer, data.expected.flatRestSha256],
    [snapshot.uploads.cutBendRest, data.expected.cutBendRestSha256],
    [snapshot.cut.cutParticleMassRecords, data.expected.cutMassSha256],
    [seams.supportRows, data.expected.supportRowsSha256],
  ] as const;
  const values = await Promise.all(expected.map(([buffer]) => digest(buffer)));
  if (
    values.some((value, index) => value !== expected[index][1]) ||
    JSON.stringify(seams.stages) !== JSON.stringify(data.expected.stages)
  )
    throw new RangeError('The diagnostic carrier or sewing stations changed during replay.');
  const surface = prepareSourceCutSurfaceProjectionV1(snapshot.cut, 36_000);
  if (
    surface.drawRanges.reduce((count, range) => count + range.triangleCount, 0) !==
    data.expected.cutTriangleCount
  )
    throw new RangeError('The diagnostic physical surface is incomplete.');
  requireCurrent();
  return {
    material,
    seams,
    surface,
    initialPositionsMInvMass: world,
    expectedBody: {
      positionsSha256: data.sourceScope.bodyPositionsSha256,
      trianglesSha256: data.sourceScope.bodyTrianglesSha256,
      outwardSign: data.outwardSign,
    },
    provisionalSourceOperations: data.sourceScope.provisionalSourceOperations,
  };
}
