import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { common_Model } from 'api/proto-http/admin';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  PatternImportDxfPhaseECadMannequinModelPickerV1,
  PatternImportDxfPhaseECadMannequinModelPickerViewV1,
  type PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1,
} from './cad-workbench-mannequin-model-picker-v1';
import type { MeasurementSurfacePatternPieceOverlayV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import {
  createCadMannequinArrangementDocumentV1,
  encodeCadMannequinArrangementDocumentV1,
  parseCadMannequinArrangementDocumentV1,
  type CadMannequinArrangementPieceV1,
} from './cad-mannequin-arrangement-document-v1';

const cardModel = vi.hoisted(() => ({ id: 0, setValue: vi.fn() }));
vi.mock('react-hook-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-hook-form')>()),
  useFormContext: () => ({ control: {}, setValue: cardModel.setValue }),
  useWatch: () => cardModel.id,
}));
vi.mock('components/managers/models/components/useModelQuery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('components/managers/models/components/useModelQuery')>()),
  useAllModels: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('lib/providers/dictionary-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('lib/providers/dictionary-provider')>()),
  useDictionary: () => ({ dictionary: null }),
}));

const globals = globalThis as Record<string, unknown>;
const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
beforeAll(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globals.window ??= Object.assign(globalThis, listeners);
});
function container() {
  const view = { document: { activeElement: null }, HTMLIFrameElement: class {} };
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: { nodeType: 9, defaultView: view, ...listeners },
    ...listeners,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function model(id: number, name: string): common_Model {
  return {
    id,
    model: {
      name,
      comment: '',
      gender: 'GENDER_ENUM_UNKNOWN',
      measurements: [],
      thumbnailId: 0,
      mediaIds: [],
      defaultSizeIds: [],
      bodyMeasurementSchemaVersion: 2,
    },
    createdAt: undefined,
    updatedAt: undefined,
    thumbnail: undefined,
    media: [],
  };
}
function props(): PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1 {
  return {
    models: [model(42, 'Current model')],
    modelId: 42,
    sizeName: String,
    onModelChange: () => undefined,
    poseBinding: {
      canonicalKey: 'pose-a',
    } as PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1['poseBinding'],
    arrangementSourceKey: 'row-3',
    patternPieceScene: {
      activeScopeKey: 'main',
      sources: [
        {
          scopeKey: 'main',
          label: 'Main',
          projection: {
            schemaVersion: 'pattern-import-dxf-product-phase-e-assembly-projection/1',
            expectedCatalogCanonicalSha256: 'b'.repeat(64),
            sizeSelectionCanonicalSha256: 'c'.repeat(64),
            sourceFileId: 'current-dxf',
            sizeToken: 'M',
            joinMode: 'catalog-ordinal-to-phase-d-point',
            geometryPlacementApplied: false,
            pieces: [
              {
                pieceId: 'front',
                pieceLineKey: 'piece-front',
                cameraMm: { minX: 0, minY: 0, maxX: 100, maxY: 100, padding: 0 },
                contours: [
                  {
                    contourId: 'front-boundary',
                    role: 'sewing-boundary',
                    closed: true,
                    vertices: [
                      { ordinal: 0, normalizedArc: 0.0, vertexId: 'v0', pointMm: { x: 0, y: 0 } },
                      {
                        ordinal: 1,
                        normalizedArc: 0.3333333333333333,
                        vertexId: 'v1',
                        pointMm: { x: 100, y: 0 },
                      },
                      {
                        ordinal: 2,
                        normalizedArc: 0.6666666666666666,
                        vertexId: 'v2',
                        pointMm: { x: 100, y: 100 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  };
}
const pieceKey = 'main:front:piece-front';
const stored: readonly CadMannequinArrangementPieceV1[] = [
  {
    pieceKey,
    scopeKey: 'main',
    pieceId: 'front',
    pieceLineKey: 'piece-front',
    transform: { offsetM: [0.4, 0.2, 0], rotationRad: 0.7 },
  },
];

function visit(
  tree: ReactNode,
  predicate: (props: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = visit(child, predicate);
      if (found) return found;
    }
  } else if (isValidElement<Record<string, unknown>>(tree)) {
    if (predicate(tree.props)) return tree.props;
    return visit(tree.props.children as ReactNode, predicate);
  }
  return null;
}
function strings(tree: ReactNode): string {
  if (Array.isArray(tree)) return tree.map(strings).join(' ');
  if (isValidElement<{ children?: ReactNode }>(tree)) return strings(tree.props.children);
  return typeof tree === 'string' ? tree : '';
}

describe('mounted mannequin arrangement lifecycle', () => {
  let root: ReturnType<typeof createRoot>;
  let input: PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1;
  let tree: ReactNode;
  // Mount the real View's hooks/effects. Children are inspected rather than mounted so this
  // regression does not start a Three renderer, GPU, browser, dictionary query or model fetch.
  function Harness() {
    tree = PatternImportDxfPhaseECadMannequinModelPickerViewV1(input);
    return null;
  }
  async function render() {
    await act(async () => {
      root.render(createElement(Harness));
    });
  }
  function overlay() {
    const node = visit(tree, (value) => !!value.patternPieceOverlay);
    expect(node).not.toBeNull();
    return node!.patternPieceOverlay as MeasurementSurfacePatternPieceOverlayV1;
  }
  async function clickSave() {
    const button = visit(tree, (value) => value.children === 'Save arrangement');
    expect(button).not.toBeNull();
    await act(async () => {
      (button!.onClick as () => void)();
    });
  }
  beforeEach(() => {
    input = props();
    root = createRoot(container() as never);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('hydrates current saved transforms through the actual preview overlay', async () => {
    input = { ...input, onReadMannequinArrangement: vi.fn().mockResolvedValue(stored) };
    await render();
    expect(overlay().pieces[0].transform).toEqual(stored[0].transform);
  });
  it('does not overwrite a user move when a deferred saved read finishes', async () => {
    const read = deferred<readonly CadMannequinArrangementPieceV1[]>();
    input = { ...input, onReadMannequinArrangement: () => read.promise };
    await render();
    const moved = { offsetM: [1, 2, 3] as const, rotationRad: 0.2 };
    await act(async () => {
      overlay().onTransformPiece!(pieceKey, moved);
    });
    await act(async () => {
      read.resolve(stored);
    });
    expect(overlay().pieces[0].transform).toEqual(moved);
  });
  it.each(['disabled', 'pose-edit', 'row', 'model'] as const)(
    'revokes a staged rotation turn on %s without changing the native contour or saved angle',
    async (change) => {
      const save = vi.fn().mockResolvedValue(undefined);
      input = {
        ...input,
        onReadMannequinArrangement: vi.fn().mockResolvedValue(stored),
        onSaveMannequinArrangement: save,
      };
      const contours = structuredClone(
        input.patternPieceScene!.sources[0]!.projection.pieces[0]!.contours,
      );
      await render();
      const toolbar = () =>
        visit(tree, (value) => typeof value.onPatternTool === 'function') as {
          onPatternTool: (tool: 'rotate') => void;
          onPoseEditingChange: (next: boolean) => void;
        };
      await act(async () => toolbar().onPatternTool('rotate'));
      expect(overlay().tool).toBe('rotate');
      const oldTurn = overlay().onTransformPiece!;
      const rotation = { ...stored[0].transform, rotationRad: Math.PI / 2 };
      if (change === 'disabled') {
        input = { ...input, disabled: true };
        await render();
      } else if (change === 'pose-edit') {
        await act(async () => toolbar().onPoseEditingChange(true));
      } else if (change === 'row') {
        input = { ...input, arrangementSourceKey: 'row-4' };
        await render();
      } else {
        input = { ...input, models: [model(43, 'Other')], modelId: 43 };
        await render();
      }
      await act(async () => oldTurn(pieceKey, rotation));
      expect(overlay().pieces[0].transform).toEqual(stored[0].transform);
      if (change === 'disabled') {
        expect(overlay().tool).toBe('select');
        expect(overlay().onTransformPiece).toBeUndefined();
        input = { ...input, disabled: false };
        await render();
      } else if (change === 'pose-edit') {
        expect(overlay().tool).toBe('select');
        expect(overlay().onTransformPiece).toBeUndefined();
        await act(async () => toolbar().onPoseEditingChange(false));
      } else if (change === 'row') {
        input = { ...input, arrangementSourceKey: 'row-3' };
        await render();
      } else {
        input = { ...input, models: [model(42, 'Current model')], modelId: 42 };
        await render();
      }
      await act(async () => oldTurn(pieceKey, rotation));
      expect(overlay().pieces[0].transform).toEqual(stored[0].transform);
      await act(async () => overlay().onTransformPiece!(pieceKey, rotation));
      await clickSave();
      expect(save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          pieces: [expect.objectContaining({ pieceKey, transform: rotation })],
        }),
        expect.any(AbortSignal),
      );
      expect(
        overlay().pieces[0].contours[0].vertices.map(({ vertexId, pointMm }) => ({
          vertexId,
          pointMm,
        })),
      ).toEqual(contours[0]!.vertices.map(({ vertexId, pointMm }) => ({ vertexId, pointMm })));
      expect(input.patternPieceScene!.sources[0]!.projection.pieces[0]!.contours).toEqual(contours);
    },
  );
  it('saves and reloads the real projected native piece rotation through the arrangement codec', async () => {
    const { draft, row } = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
    const selection = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
    const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M');
    if (!selection.ok || !catalog.ok) throw new Error('The native placement fixture did not open.');
    const projected = projectPatternImportDxfProductPhaseEAssemblyV1(
      catalog.catalog,
      selection.selection,
    );
    if (!projected.ok) throw new Error('The native placement fixture did not project.');
    const { projection } = projected;
    const native = projection.pieces[0]!;
    const key = `main:${native.pieceId}:${native.pieceLineKey}`;
    const before = structuredClone(projection);
    let persisted: string | null = null;
    input = {
      ...input,
      arrangementSourceKey: row.sha256,
      patternPieceScene: {
        activeScopeKey: 'main',
        sources: [{ scopeKey: 'main', label: 'Main', projection }],
        selection: { scopeKey: 'main', pieceId: native.pieceId, pieceLineKey: native.pieceLineKey },
      },
      onSaveMannequinArrangement: async ({ pieces, mannequin }, signal) => {
        expect(signal.aborted).toBe(false);
        persisted = encodeCadMannequinArrangementDocumentV1(
          createCadMannequinArrangementDocumentV1({
            bindings: {
              card: { techCardId: row.techCardId, cardLockVersion: row.cardLockVersion },
              scope: {
                scopeKey: row.scopeKey,
                patternLineKey: row.patternLineKey,
                sizeToken: projection.sizeToken,
              },
              savedRow: { revision: row.revision, dxfSha256: row.sha256 },
              source: {
                catalogCanonicalSha256: projection.expectedCatalogCanonicalSha256,
                sizeSelectionCanonicalSha256: projection.sizeSelectionCanonicalSha256,
              },
              mannequin,
            },
            pieces,
          }),
        );
      },
      onReadMannequinArrangement: async () =>
        persisted ? parseCadMannequinArrangementDocumentV1(persisted).pieces : null,
    };
    await render();
    const toolbar = visit(tree, (props) => typeof props.onPatternTool === 'function')!;
    await act(async () => (toolbar.onPatternTool as (tool: 'rotate') => void)('rotate'));
    expect(overlay().tool).toBe('rotate');
    const rotation = { offsetM: [0, 0, 0] as const, rotationRad: Math.PI / 2 };
    await act(async () => overlay().onTransformPiece!(key, rotation));
    await clickSave();
    await act(async () => root.unmount());
    root = createRoot(container() as never);
    await render();
    const reloaded = overlay().pieces.find(({ pieceKey }) => pieceKey === key)!;
    expect(reloaded.transform).toEqual(rotation);
    expect(
      reloaded.contours[0]?.vertices.map(({ vertexId, pointMm }) => ({ vertexId, pointMm })),
    ).toEqual(native.contours[0]?.vertices.map(({ vertexId, pointMm }) => ({ vertexId, pointMm })));
    expect(projection).toEqual(before);
    expect(parseCadMannequinArrangementDocumentV1(persisted!).claims).toMatchObject({
      presentationOnly: true,
      clothAuthority: false,
    });
  });
  it.each(['model', 'pose', 'row'] as const)(
    'aborts the in-flight save on %s change and suppresses stale success',
    async (change) => {
      const save = deferred<void>();
      let signal: AbortSignal | undefined;
      input = {
        ...input,
        onSaveMannequinArrangement: (_request, received) => {
          signal = received;
          return save.promise;
        },
      };
      await render();
      await clickSave();
      expect(signal?.aborted).toBe(false);
      if (change === 'model') input = { ...input, models: [model(43, 'Other')], modelId: 43 };
      if (change === 'pose')
        input = { ...input, poseBinding: { ...input.poseBinding!, canonicalKey: 'pose-b' } };
      if (change === 'row') input = { ...input, arrangementSourceKey: 'row-4' };
      await render();
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        save.resolve();
      });
      expect(strings(tree)).not.toContain('Placement saved. Cloth preview is unchanged.');
    },
  );
  it('states that saving visual placement leaves the cloth preview unchanged', async () => {
    input = { ...input, onSaveMannequinArrangement: vi.fn().mockResolvedValue(undefined) };
    await render();
    await clickSave();
    expect(strings(tree)).toContain('Placement saved. Cloth preview is unchanged.');
  });
  it('marks later same-source edits unsaved when the older save completes', async () => {
    const save = deferred<void>();
    input = { ...input, onSaveMannequinArrangement: () => save.promise };
    await render();
    await clickSave();
    await act(async () => {
      overlay().onTransformPiece!(pieceKey, { offsetM: [1, 0, 0], rotationRad: 0 });
    });
    await act(async () => {
      save.resolve();
    });
    expect(strings(tree)).toContain('Current changes are not saved.');
  });
});

describe('mounted Workbench mannequin model selection', () => {
  let root: ReturnType<typeof createRoot>;
  let input: Parameters<typeof PatternImportDxfPhaseECadMannequinModelPickerV1>[0];
  let tree: ReturnType<typeof PatternImportDxfPhaseECadMannequinModelPickerV1>;

  function Harness() {
    tree = PatternImportDxfPhaseECadMannequinModelPickerV1(input);
    return null;
  }
  const render = async () => {
    await act(async () => root.render(createElement(Harness)));
  };
  const choose = async (id: number) => {
    await act(async () => tree.props.onModelChange(id));
  };

  beforeEach(() => {
    root = createRoot(container() as never);
    cardModel.id = 0;
    cardModel.setValue.mockClear();
    input = {};
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('opens a saved arrangement model on a fresh mount with an empty card model', async () => {
    input = {
      arrangementSourceKey: 'row-3',
      onReadSavedMannequinModelId: vi.fn().mockResolvedValue(42),
    };
    await render();
    expect(tree.props.modelId).toBe(42);
    expect(cardModel.setValue).not.toHaveBeenCalled();
  });

  it('keeps Workbench picks out of autosave and gives an explicit pick priority over reload', async () => {
    const saved = deferred<number>();
    input = { arrangementSourceKey: 'row-3', onReadSavedMannequinModelId: () => saved.promise };
    await render();
    expect(tree.props.modelId).toBe(0);
    await choose(43);
    await act(async () => saved.resolve(42));
    expect(tree.props.modelId).toBe(43);
    expect(cardModel.setValue).not.toHaveBeenCalled();
    await choose(0);
    expect(tree.props.modelId).toBe(0);
  });

  it('aborts pending hydration when the current pattern source changes', async () => {
    const stale = deferred<number>();
    const read = vi
      .fn<(signal: AbortSignal) => Promise<number | null>>()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValue(43);
    input = { arrangementSourceKey: 'row-3', onReadSavedMannequinModelId: read };
    await render();
    input = { ...input, arrangementSourceKey: 'row-4' };
    await render();
    expect(read.mock.calls[0][0].aborted).toBe(true);
    await act(async () => stale.resolve(42));
    expect(tree.props.modelId).toBe(43);
  });

  it('keeps the ordinary TechCard picker on its form writer', async () => {
    cardModel.id = 42;
    await render();
    expect(tree.props.modelId).toBe(42);
    await choose(43);
    expect(cardModel.setValue).toHaveBeenCalledWith('baseModelId', 43, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  });
});
