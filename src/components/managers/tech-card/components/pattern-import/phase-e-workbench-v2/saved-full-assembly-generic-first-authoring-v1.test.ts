import { describe, expect, it, vi } from 'vitest';

const hostProjector = vi.hoisted(() => ({ project: vi.fn() }));
vi.mock('components/cloth-simulation-spike/saved-generic-observed-physical-host-v1', async () => {
  const actual = await vi.importActual<
    typeof import('components/cloth-simulation-spike/saved-generic-observed-physical-host-v1')
  >('components/cloth-simulation-spike/saved-generic-observed-physical-host-v1');
  return {
    ...actual,
    projectSavedGenericObservedPhysicalHostAuthoringContextV1: hostProjector.project,
  };
});

import { bindSavedFullAssemblyGenericFirstAuthoringV1 } from './saved-full-assembly-generic-first-authoring-v1';

const sha = (character: string) => character.repeat(64);
const identity: [number, number, number, number, number, number, number, number, number] = [
  1, 0, 0, 0, 1, 0, 0, 0, 1,
];

function fixture() {
  const observedTarget = {
    target: { schemaVersion: 'saved-model-observed-placement-target/1' },
    canonicalSha256: sha('c'),
  };
  const context = {
    sourceGeneration: 7,
    graph: {
      pieces: [
        { pieceId: 'front', pieceLineKey: 'line-front' },
        { pieceId: 'back', pieceLineKey: 'line-back' },
      ],
    },
    graphCanonicalSha256: sha('a'),
    compileInputSha256: sha('b'),
    observedTarget,
    sourceGeometry: {
      schemaVersion: 'saved-generic-observed-source-geometry/1',
      convention: { sourceUnits: 'mm', compiledUnits: 'm' },
      pieces: [
        {
          pieceId: 'front',
          pieceLineKey: 'line-front',
          contours: [
            {
              contourId: 'front-shell',
              vertices: [
                {
                  vertexId: 'front-v0',
                  positionMm: [100, 250] as [number, number],
                  positionM: [0.10000000149011612, 0.25, 0] as [number, number, number],
                  globalVertexIndex: 4,
                },
              ],
            },
          ],
        },
        {
          pieceId: 'back',
          pieceLineKey: 'line-back',
          contours: [
            {
              contourId: 'back-shell',
              vertices: [
                {
                  vertexId: 'back-v0',
                  positionMm: [420, 30] as [number, number],
                  positionM: [0.41999998688697815, 0.029999999329447746, 0] as [
                    number,
                    number,
                    number,
                  ],
                  globalVertexIndex: 8,
                },
              ],
            },
          ],
        },
      ],
      claims: { detachedFreshProjection: true },
    },
  };
  hostProjector.project.mockReset();
  hostProjector.project.mockResolvedValue({ ok: true as const, ...context });
  const projectAuthoringContext = hostProjector.project;
  const bindInitialization = vi.fn(async () => ({
    ok: true as const,
    sourceGeneration: 7,
    initializationSha256: sha('d'),
  }));
  const host = { bindInitialization };
  const request = {
    expectedGeneration: 7,
    placements: [
      {
        pieceId: 'back',
        pieceLineKey: 'line-back',
        pivot: {
          contourId: 'back-shell',
          vertexId: 'back-v0',
          positionMm: [420, 30] as [number, number],
          positionM: [0.41999998688697815, 0.029999999329447746, 0] as [number, number, number],
        },
        rotationRowMajor: [...identity] as typeof identity,
        translationM: [0.4, 1, 0] as [number, number, number],
      },
      {
        pieceId: 'front',
        pieceLineKey: 'line-front',
        pivot: {
          contourId: 'front-shell',
          vertexId: 'front-v0',
          positionMm: [100, 250] as [number, number],
          positionM: [0.10000000149011612, 0.25, 0] as [number, number, number],
        },
        rotationRowMajor: [...identity] as typeof identity,
        translationM: [-0.4, 1, 0] as [number, number, number],
      },
    ],
  };
  return {
    host,
    projectAuthoringContext,
    bindInitialization,
    request,
    context,
    observedTarget,
  };
}

describe('saved full assembly generic first authoring', () => {
  it('uses exact fresh compiled Float32 pivot positions in graph order', async () => {
    const f = fixture();
    const result = await bindSavedFullAssemblyGenericFirstAuthoringV1(
      f.host as never,
      f.request,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.placements).toEqual([
      {
        pieceId: 'front',
        sourceOriginM: [0.10000000149011612, 0.25, 0],
        rotationRowMajor: identity,
        translationM: [-0.4, 1, 0],
      },
      {
        pieceId: 'back',
        sourceOriginM: [0.41999998688697815, 0.029999999329447746, 0],
        rotationRowMajor: identity,
        translationM: [0.4, 1, 0],
      },
    ]);
    expect(result.document.observedTarget).toBe(f.observedTarget);
    expect(f.projectAuthoringContext).toHaveBeenCalledWith(f.host, 7, undefined);
    expect(f.bindInitialization).toHaveBeenCalledWith(result.document, 7, undefined);
  });

  it.each([
    [
      'piece line',
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].pieceLineKey = 'line-front'),
    ],
    [
      'contour',
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].pivot.contourId = 'front-shell'),
    ],
    [
      'vertex',
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].pivot.vertexId = 'front-v0'),
    ],
    [
      'millimetre position',
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].pivot.positionMm[0] = 421),
    ],
    [
      'compiled metre position',
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].pivot.positionM[0] = 0.42),
    ],
  ])('fails closed when exact pivot %s differs', async (_name, mutate) => {
    const f = fixture();
    const request = structuredClone(f.request);
    mutate(request);
    const result = await bindSavedFullAssemblyGenericFirstAuthoringV1(
      f.host as never,
      request,
    );
    expect(result.ok).toBe(false);
    expect(f.bindInitialization).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', (request: ReturnType<typeof fixture>['request']) => request.placements.pop()],
    [
      'duplicate',
      (request: ReturnType<typeof fixture>['request']) => {
        request.placements[1] = structuredClone(request.placements[0]);
      },
    ],
    [
      'extra',
      (request: ReturnType<typeof fixture>['request']) =>
        request.placements.push({
          ...structuredClone(request.placements[0]),
          pieceId: 'side',
          pieceLineKey: 'line-side',
        }),
    ],
  ])('rejects %s piece coverage', async (_name, mutate) => {
    const f = fixture();
    const request = structuredClone(f.request);
    mutate(request);
    const result = await bindSavedFullAssemblyGenericFirstAuthoringV1(
      f.host as never,
      request,
    );
    expect(result.ok).toBe(false);
    expect(f.bindInitialization).not.toHaveBeenCalled();
  });

  it('rejects non-finite and non-rigid table transforms before the fresh projection', async () => {
    for (const mutate of [
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].translationM[0] = Number.NaN),
      (request: ReturnType<typeof fixture>['request']) =>
        (request.placements[0].rotationRowMajor[0] = 2),
    ]) {
      const f = fixture();
      const request = structuredClone(f.request);
      mutate(request);
      const result = await bindSavedFullAssemblyGenericFirstAuthoringV1(
        f.host as never,
        request,
      );
      expect(result.ok).toBe(false);
      expect(f.projectAuthoringContext).not.toHaveBeenCalled();
    }
  });

  it('rejects stale context generation and final bind generation', async () => {
    {
      const f = fixture();
      f.projectAuthoringContext.mockResolvedValueOnce({
        ok: true,
        ...f.context, sourceGeneration: 8,
      });
      expect(
        (
          await bindSavedFullAssemblyGenericFirstAuthoringV1(
            f.host as never,
            f.request,
          )
        ).ok,
      ).toBe(false);
      expect(f.bindInitialization).not.toHaveBeenCalled();
    }
    {
      const f = fixture();
      f.bindInitialization.mockResolvedValueOnce({
        ok: false as const,
        detail: 'Stale source generation.',
      } as never);
      expect(
        (
          await bindSavedFullAssemblyGenericFirstAuthoringV1(
            f.host as never,
            f.request,
          )
        ).ok,
      ).toBe(false);
    }
  });

  it('has no input path for presentation arrangement or automatic lane data', async () => {
    const f = fixture();
    const result = await bindSavedFullAssemblyGenericFirstAuthoringV1(
      f.host as never,
      { ...f.request, arrangement: { presentationOnly: true } } as never,
    );
    expect(result.ok).toBe(false);
    expect(f.projectAuthoringContext).not.toHaveBeenCalled();
  });
});
