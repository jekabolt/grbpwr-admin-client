import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PatternImportDxfPhaseECadMannequinModelPickerViewV1,
  type PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1,
} from './cad-workbench-mannequin-model-picker-v1';
import type { MeasurementSurfacePatternPieceOverlayV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import type { CadMannequinArrangementPieceV1 } from './cad-mannequin-arrangement-document-v1';

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
function props(): PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1 {
  return {
    models: [{ id: 42, model: { name: 'Current model' } }],
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
    input.onReadMannequinArrangement = vi.fn().mockResolvedValue(stored);
    await render();
    expect(overlay().pieces[0].transform).toEqual(stored[0].transform);
  });
  it('does not overwrite a user move when a deferred saved read finishes', async () => {
    const read = deferred<readonly CadMannequinArrangementPieceV1[]>();
    input.onReadMannequinArrangement = () => read.promise;
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
  it.each(['model', 'pose', 'row'] as const)(
    'aborts the in-flight save on %s change and suppresses stale success',
    async (change) => {
      const save = deferred<void>();
      let signal: AbortSignal | undefined;
      input.onSaveMannequinArrangement = (_request, received) => {
        signal = received;
        return save.promise;
      };
      await render();
      await clickSave();
      expect(signal?.aborted).toBe(false);
      if (change === 'model')
        input = { ...input, models: [{ id: 43, model: { name: 'Other' } }], modelId: 43 };
      if (change === 'pose')
        input = { ...input, poseBinding: { ...input.poseBinding!, canonicalKey: 'pose-b' } };
      if (change === 'row') input = { ...input, arrangementSourceKey: 'row-4' };
      await render();
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        save.resolve();
      });
      expect(strings(tree)).not.toContain('Arrangement saved.');
    },
  );
  it('marks later same-source edits unsaved when the older save completes', async () => {
    const save = deferred<void>();
    input.onSaveMannequinArrangement = () => save.promise;
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
