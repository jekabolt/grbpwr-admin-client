import type { SavedCompleteNativeStitchAnchorV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-complete-assembly-native-stitch-anchors-v1';
import {
  projectSavedNativeStitchRegistrationV1,
  type SavedNativeStitchRegistrationV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-native-stitch-registration-v1';
import { compileSourceCutRegisteredStitchPairsV1 } from 'lib/cloth/compiler/source-cut-registered-stitch-pairs-v1';
import type { SavedWholeAssemblyPlacementLayoutV10 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-whole-assembly-placement-document-v10';
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
    grain?: Readonly<{ angleDegrees: number }> | null;
  }>[];
  operations: readonly Readonly<{ operationNumber: number }>[];
  spans: readonly SavedCompleteNativeStitchAnchorV1[];
  labelAnchors: readonly Readonly<{
    operationOrder: number;
    operationNumber: number;
    pieceLineKey: string;
    geometry?: Readonly<{ outlineMm: readonly (readonly [number, number])[] }> | null;
  }>[];
  unavailable: readonly unknown[];
}>;

const SOURCE_SHA = '8e7cf7e068f19f4ae2a42265f7379c4b0f8388c148bda1e0a7c9973cb7bfa1e0';
const CARRIER_SHA = 'e167a808c2832d2567484f2e2b161a5f17dbe0cc776e0717d848b6c39621d343';
const CANDIDATE_SHA = 'f3c95d5f52f26c93750edaaddfee1ebf03114ae30994d75f57f373195596d368';
const DETACHED_BELT = '01M1M1ZAHFC325NZF44RAG1SM7';
const LABEL = '01M75ACEBB74BMT91RJ7WSTTJY';

type SealedWholeSourceCutFixtureV1 = Readonly<{
  sourceSha256: string;
  carrierSha256: string;
  candidateSha256: string;
  coverage?: 'all-native-cuts';
  exactFabricStitchRegistrations?: Readonly<{
    sampling: Parameters<typeof compileSourceCutRegisteredStitchPairsV1>[1];
    seams: readonly SavedNativeStitchRegistrationV1[];
  }>;
}>;

export type RestoredWholeSourceCutPlacementV1 = Readonly<{
  carrierSha256: string;
  retainedCarrierSha256: string;
  layout: SavedWholeAssemblyPlacementLayoutV10;
}>;

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
    authoredGrainDegrees?: Core['grains'];
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

function labelCorners(outline: readonly (readonly [number, number])[]) {
  return outline.flatMap(([x, y], index) => {
    const [px, py] = outline[(index + outline.length - 1) % outline.length];
    const [nx, ny] = outline[(index + 1) % outline.length];
    const cross = (x - px) * (ny - y) - (y - py) * (nx - x);
    const dot = (x - px) * (nx - x) + (y - py) * (ny - y);
    return cross === 0 && dot > 0 ? [] : [{ x, y }];
  });
}

function replayRegisteredMaterialPairs(
  source: SavedCompleteWholeSourceCutV1,
  candidatePairs: Candidate['pairs'],
  manifest: SealedWholeSourceCutFixtureV1['exactFabricStitchRegistrations'],
  signal?: AbortSignal,
) {
  if (!manifest) return candidatePairs;
  if (!manifest.seams.length)
    throw new RangeError('The diagnostic carrier has an empty fabric stitch registration.');
  const stitches = manifest.seams.map((registration) => {
    const projected = projectSavedNativeStitchRegistrationV1(source.spans, registration);
    if (
      source.operations[projected.operationOrder]?.operationNumber !== registration.operationNumber
    )
      throw new RangeError('The registered stitch no longer belongs to its saved operation.');
    // The staged solver labels the ordered stages with the saved operation numbers.
    return { ...projected, operationOrder: registration.operationNumber };
  });
  stitches.sort((a, b) => a.operationOrder - b.operationOrder);
  const compiled = compileSourceCutRegisteredStitchPairsV1(stitches, manifest.sampling, signal);
  const keys = new Set(stitches.map(({ seamId }) => seamId));
  const retained = candidatePairs.filter(({ seamId }) => keys.has(seamId));
  // Interpolation can differ by a few Float64 units. The projected points are used for the
  // solver, and the exact compiled support bytes are verified below.
  const sameStation = (actual: Pair['sideA'], expected: Pair['sideA']) =>
    actual.pieceId === expected.pieceId &&
    actual.positionMm.every((a, axis) => {
      const b = expected.positionMm[axis];
      return Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
    });
  if (
    compiled.length !== retained.length ||
    compiled.some((pair, index) => {
      const previous = retained[index];
      return (
        pair.operationOrder !== previous.operationOrder ||
        pair.seamId !== previous.seamId ||
        pair.sourcePairIndex !== previous.sourcePairIndex ||
        !sameStation(pair.sideA, previous.sideA) ||
        !sameStation(pair.sideB, previous.sideB)
      );
    })
  )
    throw new RangeError('The diagnostic stations differ from their registered native parts.');
  let index = 0;
  return candidatePairs.map((pair) => (keys.has(pair.seamId) ? compiled[index++] : pair));
}

/** Bind the diagnostic pants placement to the exact saved source before using the existing solver. */
export async function prepareSavedCompleteWholeSourceCutV1(
  input: Readonly<{
    source: SavedCompleteWholeSourceCutV1;
    candidate: ArrayBuffer;
    assertCurrentSource: () => boolean;
    frameCount?: 1 | 4;
    savedPlacement?: RestoredWholeSourceCutPlacementV1;
    fixture?: SealedWholeSourceCutFixtureV1;
  }>,
  signal?: AbortSignal,
) {
  const {
    source,
    candidate,
    assertCurrentSource,
    savedPlacement,
    fixture = {
      sourceSha256: SOURCE_SHA,
      carrierSha256: CARRIER_SHA,
      candidateSha256: CANDIDATE_SHA,
    },
  } = input;
  function requireCurrent() {
    signal?.throwIfAborted();
    if (assertCurrentSource() !== true) throw new Error('The saved garment source has changed.');
  }
  requireCurrent();
  if (
    source.schemaVersion !== 'saved-complete-assembly-native-stitch-anchors/1' ||
    source.cardId !== 2 ||
    source.cardLockVersion !== 1 ||
    source.sourceSha256 !== fixture.sourceSha256 ||
    source.savedCarrier?.sidecarSha256 !==
      (savedPlacement?.carrierSha256 ?? fixture.carrierSha256) ||
    (savedPlacement && savedPlacement.retainedCarrierSha256 !== fixture.carrierSha256) ||
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
  if ((await digest(bytes)) !== fixture.candidateSha256)
    throw new RangeError('The sealed diagnostic pants placement has changed.');
  requireCurrent();
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Candidate;
  const pairs = replayRegisteredMaterialPairs(
    source,
    data.pairs,
    fixture.exactFabricStitchRegistrations,
    signal,
  );
  const cuts = new Map<string, Cut>(
    data.cuts.map(([id, entry]) => [
      id,
      { ...entry, cut: { ...entry.cut, triangles: Uint32Array.from(entry.cut.triangles) } },
    ]),
  );
  const native = new Map(source.sourceCuts.map((cut) => [cut.pieceLineKey, cut]));
  const allNative = fixture.coverage === 'all-native-cuts';
  if (
    native.size !== 24 ||
    !native.has(DETACHED_BELT) ||
    cuts.size !== native.size + (allNative ? 1 : 0) ||
    !cuts.has(LABEL) ||
    cuts.has(DETACHED_BELT) !== allNative ||
    [...cuts].some(
      ([id, { cut }]) =>
        id !== LABEL && !sameCut(native.get(id)?.nativePointsMm ?? [], cut.verticesMm),
    )
  )
    throw new RangeError('A saved native cut differs from the sealed diagnostic placement.');
  const generatedLabel = source.labelAnchors[0].geometry;
  if (
    allNative &&
    (!generatedLabel ||
      !sameCut(labelCorners(generatedLabel.outlineMm), cuts.get(LABEL)!.cut.verticesMm))
  )
    throw new RangeError('The generated label differs from the current original pattern.');
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
  const suppliedGrain = data.sourceScope.authoredGrainDegrees ?? [];
  const grains = allNative ? suppliedGrain : ids.map((pieceId) => ({ pieceId, grainDegrees: 0 }));
  if (
    allNative &&
    (grains.length !== ids.length ||
      new Set(grains.map(({ pieceId }) => pieceId)).size !== ids.length ||
      grains.some(({ pieceId, grainDegrees }) =>
        pieceId === LABEL
          ? grainDegrees !== 0
          : grainDegrees !== native.get(pieceId)?.grain?.angleDegrees,
      ))
  )
    throw new RangeError('The diagnostic cloth grain differs from the original DXF grain.');
  const world = Float32Array.from(data.world);
  const [initialWorldSha256, cutGraphSha256] = await Promise.all([
    digest(world.buffer),
    digest(
      new TextEncoder().encode(
        JSON.stringify({
          mesh: data.mesh,
          cuts: data.cuts,
          pairs,
          profile: data.profile,
          pressedCreases: data.pressedCreases,
          ...(allNative ? { grains } : {}),
          expected: data.expected,
        }),
      ).buffer,
    ),
  ]);
  if (initialWorldSha256 !== data.sourceScope.initialPositionsSha256)
    throw new RangeError('The sealed diagnostic initial coordinates changed.');
  requireCurrent();
  const pieceRanges = mesh.pieceRanges.map(
    ({ pieceId, vertexOffset, vertexCount, triangleOffset, triangleCount }) => ({
      pieceId,
      vertexOffset,
      vertexCount,
      triangleOffset,
      triangleCount,
    }),
  );
  const positionsM = new Float32Array((world.length / 4) * 3);
  if (savedPlacement) {
    const saved = savedPlacement.layout;
    if (
      saved.sizeId !== source.sizeId ||
      saved.sizeToken !== source.sizeToken ||
      saved.runtimeCandidateSha256 !== fixture.candidateSha256 ||
      saved.cutGraphSha256 !== cutGraphSha256 ||
      JSON.stringify(
        saved.pieceRanges.map(
          ({ pieceId, vertexOffset, vertexCount, triangleOffset, triangleCount }) => ({
            pieceId,
            vertexOffset,
            vertexCount,
            triangleOffset,
            triangleCount,
          }),
        ),
      ) !== JSON.stringify(pieceRanges) ||
      saved.positionsM.length !== positionsM.length
    )
      throw new RangeError(
        'The saved whole placement does not match the current material and cut graph.',
      );
    for (let particle = 0; particle < world.length / 4; particle++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = saved.positionsM[3 * particle + axis]!;
        if (!Number.isFinite(value) || Math.abs(value) > 10 || Object.is(value, -0))
          throw new RangeError('The saved whole placement has an invalid coordinate.');
        world[4 * particle + axis] = value;
      }
    }
  }
  for (let particle = 0; particle < world.length / 4; particle++) {
    for (let axis = 0; axis < 3; axis++) {
      const coordinate = world[4 * particle + axis]!;
      positionsM[3 * particle + axis] = coordinate === 0 ? 0 : coordinate;
    }
  }
  const layout: SavedWholeAssemblyPlacementLayoutV10 = {
    sizeId: source.sizeId,
    sizeToken: source.sizeToken,
    runtimeCandidateSha256: fixture.candidateSha256,
    cutGraphSha256,
    pieceRanges,
    positionsM,
  };
  const material = prepareGarmentStagedSourceCutCoreV1(
    {
      mesh,
      grains,
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
  const seams = prepareGarmentStagedSourceCutSeamsV1(material, pairs, {
    maxTriangleTests: 2_000_000,
    maxSupportBytes: 128_000,
  });
  const snapshot = snapshotGarmentStagedSourceCutCoreV1(material);
  const expected = [
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
    layout,
    expectedBody: {
      positionsSha256: data.sourceScope.bodyPositionsSha256,
      trianglesSha256: data.sourceScope.bodyTrianglesSha256,
      outwardSign: data.outwardSign,
    },
    provisionalSourceOperations: data.sourceScope.provisionalSourceOperations,
  };
}
