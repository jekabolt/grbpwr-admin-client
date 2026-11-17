import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { SHEET_INK } from '../sheet-viewport';
import {
  activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1,
  createPatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  fitPatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  movePatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1,
  PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
} from './cad-table-zero-connect-canvas-v1';

const REQUIRED_FIELDS = [
  'documentId-and-revision',
  'physical-surface',
  'two-seam-sides-and-anchor-ranges',
  'side-directions',
  'mapping-and-length-ratio',
  'operation-stage-and-order',
  'immutable-material-revisions',
  'tolerances',
] as const;

function fixture(): Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}> {
  const boundaryVertices = (prefix: string) =>
    [
      { ordinal: 0, vertexId: `${prefix}:0`, normalizedArc: 0 },
      { ordinal: 1, vertexId: `${prefix}:1`, normalizedArc: 0.25 },
      { ordinal: 2, vertexId: `${prefix}:2`, normalizedArc: 0.5 },
      { ordinal: 3, vertexId: `${prefix}:3`, normalizedArc: 0.75 },
    ] as const;
  const pieces: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'] = [
    {
      pieceId: 'closed-piece',
      pieceLineKey: 'closed:M',
      contours: [
        {
          contourId: 'closed-cut',
          role: 'cut-boundary',
          geometry: { kind: 'cut' },
          closed: true,
          boundaryVertices: boundaryVertices('closed'),
        },
      ],
    },
    {
      pieceId: 'open-piece',
      pieceLineKey: 'open:M',
      contours: [
        {
          contourId: 'open-cut',
          role: 'cut-boundary',
          geometry: { kind: 'cut' },
          closed: false,
          boundaryVertices: boundaryVertices('open'),
        },
      ],
    },
  ];
  const catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: 6,
    scopeKey: 'main',
    sizeToken: 'M',
    sourceFileId: 'card-6.dxf',
    sizeSelectionCanonicalSha256: 'a'.repeat(64),
    pieces,
    requiredExplicitFields: REQUIRED_FIELDS,
    canonicalSha256: 'b'.repeat(64),
    geometryCoordinatesExposed: false,
    rawDxfExposed: false,
    assemblyInferred: false,
    productionReady: false,
  };
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
    { x: 0, y: 30 },
  ] as const;
  const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
    sourceFileId: catalog.sourceFileId,
    sizeToken: catalog.sizeToken,
    joinMode: 'catalog-ordinal-to-phase-d-point',
    pieces: pieces.map((piece, pieceIndex) => ({
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      contours: piece.contours.map((contour) => ({
        contourId: contour.contourId,
        role: contour.role,
        closed: contour.closed,
        vertices: contour.boundaryVertices.map((vertex, vertexIndex) => ({
          ...vertex,
          pointMm: points[vertexIndex]!,
        })),
      })),
      cameraMm: {
        minX: 0,
        minY: 0,
        maxX: 40,
        maxY: 30,
        padding: pieceIndex,
      },
    })),
    geometryPlacementApplied: false,
  };
  return { catalog, projection };
}

function contourTag(html: string, contourId: string): string {
  const tag = html.match(
    new RegExp(`<polyline[^>]*data-cad-zero-connect-contour="${contourId}"[^>]*>`),
  )?.[0];
  if (!tag) throw new Error(`Missing rendered contour ${contourId}.`);
  return tag;
}

describe('zero-operation CAD table rendering', () => {
  it('keeps the production CAD controls visible without dashing real cut boundaries', () => {
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1 {...fixture()} />,
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Select pieces"');
    expect(html).toContain('aria-label="Move selected pieces"');
    expect(html).toContain('aria-label="Connect edges"');
    expect(html).toContain('aria-label="Fit all pieces"');
    expect(html).toContain('aria-label="closed:M pattern piece"');
    expect(html).toContain(
      'aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight"',
    );
    expect(html).toContain('role="button" tabindex="0" aria-disabled="false" aria-pressed="false"');
  });

  it('fills and closes only contours explicitly declared closed by the saved projection', () => {
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1 {...fixture()} />,
    );
    const closed = contourTag(html, 'closed-cut');
    const open = contourTag(html, 'open-cut');

    expect(closed).toContain('points="0,0 40,0 40,-30 0,-30 0,0"');
    expect(closed).toContain(`fill="${SHEET_INK.fill}"`);
    expect(closed).not.toContain('stroke-dasharray');

    expect(open).toContain('points="0,0 40,0 40,-30 0,-30"');
    expect(open).toContain('fill="none"');
    expect(open).not.toContain('stroke-dasharray');
  });

  it('keeps the viewport frozen while pointer movement updates session-only offsets', () => {
    const { projection } = fixture();
    const initial = createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection);
    const first = initial.layout.pieces[0]!;
    const moved = movePatternImportDxfPhaseECadTableZeroCanvasSessionV1(
      initial,
      first.identity.key,
      { x: 15, y: 5 },
    );

    expect(moved.layout.pieces[0]?.offsetMm).toEqual({
      x: first.offsetMm.x + 15,
      y: first.offsetMm.y + 5,
    });
    expect(moved.viewportBounds).toBe(initial.viewportBounds);

    const fitted = fitPatternImportDxfPhaseECadTableZeroCanvasSessionV1(moved);
    expect(fitted.viewportBounds).not.toEqual(initial.viewportBounds);
  });

  it('maps keyboard arrows to precise and coarse millimetre movement', () => {
    expect(patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1('ArrowLeft', false)).toEqual({
      x: -1,
      y: 0,
    });
    expect(patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1('ArrowUp', true)).toEqual({
      x: 0,
      y: 10,
    });
    expect(patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1('Enter', false)).toBeNull();
  });

  it('selects and Shift-toggles a keyboard-activated piece without changing the viewport', () => {
    const initial = createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(fixture().projection);
    const pieceKey = initial.layout.pieces[0]!.identity.key;
    const selected = activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
      initial,
      pieceKey,
      false,
    );
    const toggled = activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
      selected,
      pieceKey,
      true,
    );

    expect(selected.layout.selectedPieceKeys).toEqual([pieceKey]);
    expect(selected.viewportBounds).toBe(initial.viewportBounds);
    expect(toggled.layout.selectedPieceKeys).toEqual([]);
  });
});
