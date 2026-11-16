import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1 } from './callout-session-v1';
import {
  selectPatternImportDxfPhaseEDraftCadTopologyToolV1,
  type PatternImportDxfPhaseEDraftCadTopologySessionV1,
} from './draft-cad-topology-session-v1';
import {
  createPatternImportDxfPhaseEExactNTopologyEditorSessionV1,
  projectPatternImportDxfPhaseEExactNTopologyAnnotationDraftV1,
  selectPatternImportDxfPhaseEExactNTopologyVertexV1,
} from './exact-n-topology-annotation-editor-v1';
import type { PatternImportDxfPhaseEVertexAnchorV1 } from './measurement-v1';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';

const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = Object.freeze({
  schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  expectedCatalogCanonicalSha256: 'a'.repeat(64),
  sizeSelectionCanonicalSha256: 'b'.repeat(64),
  sourceFileId: 'file:front',
  sizeToken: 'M',
  joinMode: 'catalog-ordinal-to-phase-d-point',
  geometryPlacementApplied: false,
  pieces: Object.freeze([
    Object.freeze({
      pieceId: 'piece-front',
      pieceLineKey: 'FRONT:M',
      cameraMm: Object.freeze({ minX: 0, minY: 0, maxX: 40, maxY: 30, padding: 0 }),
      contours: Object.freeze([
        Object.freeze({
          contourId: 'sewing',
          role: 'sewing-boundary' as const,
          closed: true,
          vertices: Object.freeze([
            Object.freeze({
              ordinal: 0,
              vertexId: 'v0',
              normalizedArc: 0,
              pointMm: { x: 0, y: 0 },
            }),
            Object.freeze({
              ordinal: 1,
              vertexId: 'v1',
              normalizedArc: 0.25,
              pointMm: { x: 40, y: 0 },
            }),
            Object.freeze({
              ordinal: 2,
              vertexId: 'v2',
              normalizedArc: 0.5,
              pointMm: { x: 40, y: 30 },
            }),
            Object.freeze({
              ordinal: 3,
              vertexId: 'v3',
              normalizedArc: 0.75,
              pointMm: { x: 0, y: 30 },
            }),
          ]),
        }),
      ]),
    }),
  ]),
});

const anchor = (vertexId: string): PatternImportDxfPhaseEVertexAnchorV1 =>
  Object.freeze({
    pieceId: 'piece-front',
    pieceLineKey: 'FRONT:M',
    contourId: 'sewing',
    vertexId,
  });

const emptyDraft: PatternImportDxfPhaseETopologyAnnotationDraftV5 = Object.freeze({
  measurements: Object.freeze([]),
  callouts: Object.freeze([]),
});

function selectTool(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  tool: 'measure-point' | 'measure-line' | 'measure-edge' | 'callout',
) {
  return selectPatternImportDxfPhaseEDraftCadTopologyToolV1(state, tool);
}

describe('exact-N topology annotation editor', () => {
  it('turns exact projection vertex picks into the caller-owned measurement draft', () => {
    let state = selectTool(
      createPatternImportDxfPhaseEExactNTopologyEditorSessionV1('source:exact', emptyDraft),
      'measure-line',
    );

    state = selectPatternImportDxfPhaseEExactNTopologyVertexV1(projection, state, anchor('v0'));
    expect(state.pendingAnchors).toEqual([anchor('v0')]);
    expect(
      projectPatternImportDxfPhaseEExactNTopologyAnnotationDraftV1(state).measurements,
    ).toEqual([]);

    state = selectPatternImportDxfPhaseEExactNTopologyVertexV1(projection, state, anchor('v2'));
    const draft = projectPatternImportDxfPhaseEExactNTopologyAnnotationDraftV1(state);

    expect(state.pendingAnchors).toEqual([]);
    expect(draft.measurements).toHaveLength(1);
    expect(draft.measurements[0]).toMatchObject({
      id: 'draft-measurement-1',
      kind: 'line',
      anchors: [anchor('v0'), anchor('v2')],
      valueMm: 50,
    });
    expect(draft.callouts).toEqual([]);
  });

  it('keeps edge picking exact and blocks non-adjacent projection vertices', () => {
    let state = selectTool(
      createPatternImportDxfPhaseEExactNTopologyEditorSessionV1('source:exact', emptyDraft),
      'measure-edge',
    );
    state = selectPatternImportDxfPhaseEExactNTopologyVertexV1(projection, state, anchor('v0'));
    state = selectPatternImportDxfPhaseEExactNTopologyVertexV1(projection, state, anchor('v2'));

    expect(state.measurements).toEqual([]);
    expect(state.pendingAnchors).toEqual([anchor('v2')]);
    expect(state.blocker).toContain('adjacent exact vertices');

    state = selectPatternImportDxfPhaseEExactNTopologyVertexV1(projection, state, anchor('v1'));
    expect(state.blocker).toBeNull();
    expect(state.measurements[0]).toMatchObject({ kind: 'edge', valueMm: 30 });
  });

  it('hydrates durable annotations and propagates new callouts without replacing their owner', () => {
    const storedDraft: PatternImportDxfPhaseETopologyAnnotationDraftV5 = Object.freeze({
      measurements: Object.freeze([
        Object.freeze({
          id: 'draft-measurement-7',
          kind: 'point' as const,
          anchors: Object.freeze([anchor('v0')]),
          valueMm: null,
          label: 'x 0.0 · y 0.0 mm',
        }),
      ]),
      callouts: Object.freeze([
        Object.freeze({
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
          id: 'draft-callout-8',
          anchor: anchor('v1'),
          text: 'Existing callout',
        }),
      ]),
    });
    let state = selectTool(
      createPatternImportDxfPhaseEExactNTopologyEditorSessionV1('source:exact', storedDraft),
      'callout',
    );

    state = selectPatternImportDxfPhaseEExactNTopologyVertexV1(projection, state, anchor('v3'));
    const draft = projectPatternImportDxfPhaseEExactNTopologyAnnotationDraftV1(state);

    expect(draft.measurements).toEqual(storedDraft.measurements);
    expect(draft.callouts).toHaveLength(2);
    expect(draft.callouts[1]).toMatchObject({
      id: 'draft-callout-9',
      anchor: anchor('v3'),
      text: 'Callout 9',
    });
  });
});
