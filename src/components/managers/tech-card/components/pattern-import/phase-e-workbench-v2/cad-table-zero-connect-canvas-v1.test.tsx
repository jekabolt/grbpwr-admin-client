import { chromium } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  projectPatternImportDxfProductPhaseEAssemblyV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';

import { SHEET_INK, vy } from '../sheet-viewport';
import { projectCadTablePieceFeatures } from './cad-table-piece-features-v1';
import {
  createPatternImportDxfPhaseECadTablePieceLayoutSessionV1,
  patternImportDxfPhaseECadTablePieceKeyV1,
  selectPatternImportDxfPhaseECadTablePiecesInBoxV1,
  selectPatternImportDxfPhaseECadTablePiecesInLassoV1,
} from './cad-table-piece-layout-session-v1';
import {
  activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1,
  createPatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  fitPatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  movePatternImportDxfPhaseECadTableZeroCanvasSessionV1,
  patternImportDxfPhaseECadTableZeroKeyboardMoveDeltaV1,
  PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
} from './cad-table-zero-connect-canvas-v1';
import { PatternImportDxfProductPhaseEMultiseamWorkbenchV2 } from './workbench';

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

function overlappingFixture() {
  const { catalog, projection } = fixture();
  const contour = (
    contourId: string,
    role: 'cut-boundary' | 'hole',
    points: readonly (readonly [number, number])[],
  ) => ({
    contourId,
    role,
    closed: true,
    vertices: points.map(([x, y], ordinal) => ({
      ordinal,
      pointMm: { x, y },
      vertexId: `${contourId}:${ordinal}`,
      normalizedArc: ordinal / points.length,
    })),
  });
  const pieces = projection.pieces.map((piece, index) => ({
    ...piece,
    cameraMm: { minX: 0, minY: 0, maxX: 40, maxY: 40, padding: 0 },
    contours:
      index === 0
        ? [
            contour('concave', 'cut-boundary', [
              [0, 0],
              [40, 0],
              [40, 12],
              [12, 12],
              [12, 40],
              [0, 40],
            ]),
            contour('hole', 'hole', [
              [2, 2],
              [6, 2],
              [6, 6],
              [2, 6],
            ]),
          ]
        : [
            contour('rectangle', 'cut-boundary', [
              [0, 0],
              [40, 0],
              [40, 40],
              [0, 40],
            ]),
          ],
  }));
  return {
    projection: { ...projection, pieces },
    catalog: {
      ...catalog,
      pieces: pieces.map(({ pieceId, pieceLineKey, contours }) => ({
        pieceId,
        pieceLineKey,
        contours: contours.map(({ vertices, ...outline }) => ({
          ...outline,
          geometry:
            outline.role === 'hole'
              ? { kind: 'cut-loop' as const, index: 0 }
              : { kind: 'cut' as const },
          boundaryVertices: vertices.map(({ ordinal, normalizedArc, vertexId }) => ({
            ordinal,
            normalizedArc,
            vertexId,
          })),
        })),
      })),
    },
  };
}

function contourTag(html: string, contourId: string): string {
  const tag = html.match(
    new RegExp(`<polyline[^>]*data-cad-zero-connect-contour="${contourId}"[^>]*>`),
  )?.[0];
  if (!tag) throw new Error(`Missing rendered contour ${contourId}.`);
  return tag;
}

function buttonTag(html: string, label: string): string {
  const tag = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Missing rendered tool button ${label}.`);
  return tag;
}

function hasDisabledAttribute(tag: string): boolean {
  return /\sdisabled(?:=""|(?=[\s>]))/u.test(tag);
}

function translated(value: string | null): readonly [number, number] {
  const match = value?.match(/^translate\(([-+\d.eE]+) ([-+\d.eE]+)\)$/);
  if (!match) throw new Error(`Expected translate(x y), received ${String(value)}.`);
  return [Number(match[1]), Number(match[2])];
}

describe('V2 assembly fallback material selection', () => {
  it('mounts full material and hole hit geometry with exact contour and object controls', () => {
    const { catalog, projection } = overlappingFixture();
    const seamKeys = ['join-one', 'join-two'];
    const anchor = (pieceLineKey: string) => ({
      pieceLineKey,
      edgeHint: 'cut',
      range: [0, 0.25] as const,
      lenMm: 40,
      contourSig: 'a'.repeat(64),
    });
    const result = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(catalog, {
      selectedOperationNumber: 5,
      operations: [
        {
          authoringOperationId: 'op-5',
          number: 5,
          work: 'stitch',
          phaseEKind: 'stitch',
          inputKeys: catalog.pieces.map(({ pieceLineKey }) => pieceLineKey),
          outputUnitKey: 'joined',
          outputUnitName: 'Joined pieces',
          seamKeys,
        },
      ],
      seams: seamKeys.map((seamKey) => ({
        seamKey,
        confirmed: true,
        stale: false,
        kind: 'edge',
        direction: 'reversed',
        anchoredSize: catalog.sizeToken,
        sideA: [anchor('closed:M')],
        sideB: [anchor('open:M')],
      })),
    });
    if (!result.ok) throw new Error(result.blockers[0].detail);
    const state = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
      catalog,
      result.proposal,
      { documentId: catalog.sourceFileId, revision: 'rev-1' },
      1,
    );
    const html = renderToStaticMarkup(
      <PatternImportDxfProductPhaseEMultiseamWorkbenchV2
        catalog={catalog}
        projection={projection}
        proposal={result.proposal}
        state={{
          ...state,
          physicalSurface: { mode: 'cut-surface', seamAllowancePhysical: true },
        }}
        materialOptions={[]}
        colorwayOptions={[{ id: 1, label: 'Blue', swatchHex: '#334499' }]}
        activeSeamIndex={0}
        activePieceIndex={0}
        onActiveSeamIndexChange={() => {}}
        onActivePieceIndexChange={() => {}}
        onStateChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    const material = html.match(/<path[^>]*data-v2-piece-hit-area=""[^>]*>/g);
    expect(material).toHaveLength(2);
    expect(material?.[0]).toContain('d="M 0,0 40,0 40,12 12,12 12,40 0,40 Z M 2,2 6,2 6,6 2,6 Z"');
    expect(material?.[0]).toContain('fill-rule="evenodd"');
    expect(material?.[0]).toContain('fill="#334499"');
    expect(material?.[0]).toContain('pointer-events="fill"');
    expect(html).not.toMatch(/<rect[^>]*data-v2-piece-hit-area=/);
    const contour = (id: string) =>
      html.match(
        new RegExp(`<polyline[^>]*aria-label="Select exact contour ${id} for seam join-one"[^>]*>`),
      )?.[0];
    expect(contour('concave')).toContain('pointer-events="stroke"');
    expect(contour('hole')).toContain('pointer-events="none"');
    expect(html).toMatch(/<button[^>]*data-cad-object-piece="closed-piece"/);
    expect(html).toMatch(/<button[^>]*data-cad-object-piece="open-piece"/);
  });
});

describe('zero-operation CAD table rendering', () => {
  it('displays exact retained selected-size features as toggleable, pointer-transparent layers', async () => {
    const { draft } = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
    const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
    if (!selected.ok) throw new Error(selected.blockers[0].detail);
    const built = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(draft, 'main', 'M');
    if (!built.ok) throw new Error(built.blockers[0].detail);
    const { catalog } = built;
    const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog, selected.selection);
    if (!projected.ok) throw new Error(projected.blockers[0].detail);
    const { projection } = projected;
    const first = projection.pieces[0]!;
    const scopes = structuredClone(draft.scopes);
    const writerPiece = scopes[0]!.writerReplay!.job.pieces.find(
      ({ identity }) => identity === first.pieceId,
    )!;
    const size = writerPiece.sizes.find(({ sizeToken }) => sizeToken === projection.sizeToken)!;
    const grain = size.grain!;
    const evidence = { ranges: [], origin: 'operator', confidence: 1 } as const;
    const a = { x: 14, y: 9 };
    const b = { x: 14, y: 11 };
    size.internal.push({ ...evidence, ranges: [], kind: 'internal', pts: [a, b], closed: false });
    size.fold = { ...evidence, ranges: [], kind: 'fold', a, b };
    size.notches.push({ ...evidence, ranges: [], kind: 'notch', seg: [a, b], at: a, depthMm: 2 });
    size.drills.push({ ...evidence, ranges: [], kind: 'drill', at: a, form: 'point' });
    const pieceFeatures = projectCadTablePieceFeatures(catalog, projection, scopes, 'Main fabric');
    expect(pieceFeatures.size).toBe(2);
    const key = patternImportDxfPhaseECadTablePieceKeyV1(first.pieceId, first.pieceLineKey);
    expect(pieceFeatures.get(key)?.grain).toEqual(grain);
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
        catalog={catalog}
        projection={projection}
        pieceFeatures={pieceFeatures}
      />,
    );
    expect(buttonTag(html, 'Show grainlines')).toContain('aria-pressed="true"');
    const lines = html.match(/<line[^>]*data-cad-zero-connect-grainline[^>]*>/g);
    expect(lines).toHaveLength(2);
    expect(lines?.[0]).toContain(
      `x1="${grain.a.x}" y1="${vy(grain.a.y)}" x2="${grain.b.x}" y2="${vy(grain.b.y)}"`,
    );
    expect(lines?.every((line) => line.includes('pointer-events="none"'))).toBe(true);
    for (const [label, mark] of [
      ['Show internal lines', 'internal'],
      ['Show fold lines', 'fold'],
      ['Show notches', 'notch'],
      ['Show drill marks', 'drill'],
      ['Show piece names', 'piece-label'],
      ['Show material names', 'material-label'],
    ]) {
      expect(buttonTag(html, label)).toContain('aria-pressed="true"');
      expect(html).toContain(`data-cad-zero-connect-${mark}=""`);
    }
    expect(html).toContain('>Main fabric</tspan>');
    expect(pieceFeatures.get(key)?.pieceLabel).toBe(writerPiece.displayName);
    const translated = {
      ...projection,
      pieces: [
        {
          ...first,
          contours: first.contours.map((contour) => ({
            ...contour,
            vertices: contour.vertices.map((vertex) => ({
              ...vertex,
              pointMm: { x: vertex.pointMm.x + 2, y: vertex.pointMm.y },
            })),
          })),
        },
      ],
    };
    expect(projectCadTablePieceFeatures(catalog, translated, draft.scopes).size).toBe(0);
  });

  it('keeps the production CAD controls visible without dashing real cut boundaries', () => {
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1 {...fixture()} />,
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('right-2 top-1/2');
    expect(html).toContain('max-h-[calc(100%-1rem)]');
    expect(html).toContain('-translate-y-1/2');
    expect(html).not.toContain('left-2 top-2 z-20 flex flex-col');
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

  it('keeps the full toolbar usable while refusing only Connect for an existing empty operation', () => {
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
        {...fixture()}
        zeroConnectAuthoringHandoff={{
          status: 'unavailable',
          blocker: {
            code: 'zero-connect-authoring-write-refused',
            detail: 'An existing empty operation needs a dedicated attach writer.',
          },
        }}
      />,
    );

    expect(html).toContain('role="toolbar"');
    for (const label of [
      'Select pieces',
      'Pan canvas',
      'Move selected pieces',
      'Fit all pieces',
      'Reset piece layout',
    ])
      expect(hasDisabledAttribute(buttonTag(html, label))).toBe(false);
    expect(hasDisabledAttribute(buttonTag(html, 'Connect edges'))).toBe(true);
  });

  it('fills and closes only contours explicitly declared closed by the saved projection', () => {
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1 {...fixture()} />,
    );
    const closed = contourTag(html, 'closed-cut');
    const open = contourTag(html, 'open-cut');

    expect(closed).toContain('points="0,0 40,0 40,-30 0,-30 0,0"');
    const fills = html.match(/<path[^>]*data-cad-zero-connect-material=""[^>]*>/g);
    expect(fills).toHaveLength(1);
    expect(fills?.[0]).toContain('fill-rule="evenodd"');
    expect(fills?.[0]).toContain(`fill="${SHEET_INK.fill}"`);
    expect(fills?.[0]).toContain('pointer-events="fill"');
    expect(closed).not.toContain('stroke-dasharray');

    expect(open).toContain('points="0,0 40,0 40,-30 0,-30"');
    expect(open).toContain('fill="none"');
    expect(open).not.toContain('stroke-dasharray');
  });

  it('selects filled material and ignores the hole and empty concave part of its bounds', () => {
    const { catalog, projection } = overlappingFixture();
    const piece = projection.pieces[0]!;
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
        catalog={catalog}
        projection={projection}
      />,
    );
    expect(html).toContain('d="M 0,0 40,0 40,-12 12,-12 12,-40 0,-40 Z M 2,-2 6,-2 6,-6 2,-6 Z"');
    expect(contourTag(html, 'hole')).toContain('pointer-events="none"');
    const session = createPatternImportDxfPhaseECadTablePieceLayoutSessionV1([piece]);
    const inBox = (minX: number, minY: number, maxX: number, maxY: number) =>
      selectPatternImportDxfPhaseECadTablePiecesInBoxV1(session, { minX, minY, maxX, maxY })
        .selectedPieceKeys;

    expect(inBox(20, 20, 30, 30)).toEqual([]);
    expect(inBox(3, 3, 5, 5)).toEqual([]);
    expect(inBox(8, 8, 10, 10)).toEqual([session.pieces[0]!.identity.key]);
    expect(
      selectPatternImportDxfPhaseECadTablePiecesInLassoV1(session, [
        { x: -5, y: 30 },
        { x: 15, y: 30 },
        { x: 15, y: 31 },
        { x: -5, y: 31 },
      ]).selectedPieceKeys,
    ).toEqual([session.pieces[0]!.identity.key]);
  });

  it('cycles visible material hits at an overlap while leaving the view and Shift selection intact', () => {
    const { projection } = overlappingFixture();
    const initial = createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection);
    const [back, front] = initial.layout.pieces;
    const coincident = movePatternImportDxfPhaseECadTableZeroCanvasSessionV1(
      initial,
      front!.identity.key,
      { x: back!.offsetMm.x - front!.offsetMm.x, y: back!.offsetMm.y - front!.offsetMm.y },
    );
    const activate = activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1;
    const frontKey = front!.identity.key;
    const backKey = back!.identity.key;
    const cleared = activate(coincident, '', false);
    const point = { x: 9, y: 9 };
    const top = activate(cleared, frontKey, false, point);
    const lower = activate(top, frontKey, false, point);

    expect(top.layout.selectedPieceKeys).toEqual([frontKey]);
    expect(lower.layout.selectedPieceKeys).toEqual([backKey]);
    expect(activate(lower, frontKey, false, point).layout.selectedPieceKeys).toEqual([frontKey]);
    expect(activate(lower, frontKey, true, point).layout.selectedPieceKeys).toEqual([
      backKey,
      frontKey,
    ]);
    expect(activate(top, frontKey, false, { x: 4, y: 4 }).layout.selectedPieceKeys).toEqual([
      frontKey,
    ]);
    expect(activate(top, frontKey, false, { x: 20, y: 20 }).layout.selectedPieceKeys).toEqual([
      frontKey,
    ]);
    expect(lower.viewportBounds).toBe(initial.viewportBounds);
  });

  it('renders saved seam sides on the existing canvas without an editable Connect tool', () => {
    const html = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableZeroConnectCanvasV1
        {...fixture()}
        disabled
        savedSeamSides={[
          {
            pieceId: 'closed-piece',
            pieceLineKey: 'closed:M',
            contourId: 'closed-cut',
            boundaryVertexIds: ['closed:3', 'closed:0'],
          },
          {
            pieceId: 'open-piece',
            pieceLineKey: 'open:M',
            contourId: 'open-cut',
            boundaryVertexIds: ['open:1', 'open:0'],
          },
        ]}
      />,
    );
    expect(html.match(/data-cad-zero-connect-side="[ab]"/g)).toEqual([
      'data-cad-zero-connect-side="a"',
      'data-cad-zero-connect-side="b"',
    ]);
    expect(html).toContain('stroke="var(--color-highlightColor)"');
    expect(html).toContain('aria-label="Fit all pieces"');
    expect(html).not.toContain('aria-label="Connect edges"');
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

  it('keeps the mounted view fixed during drag and picks precise material through the pointer', async () => {
    const ordinaryFixture = JSON.stringify(fixture()).replaceAll('<', '\\u003c');
    const shapedFixture = JSON.stringify(overlappingFixture()).replaceAll('<', '\\u003c');
    const virtualId = 'virtual:cad-table-pointer-drag-regression';
    const resolvedVirtualId = `\0${virtualId}`;
    const uiVirtualId = 'virtual:cad-table-pointer-drag-ui';
    const resolvedUiVirtualId = `\0${uiVirtualId}`;
    const componentPath =
      '/src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-table-zero-connect-canvas-v1.tsx';
    const harnessPlugin: Plugin = {
      name: 'cad-table-pointer-drag-regression',
      resolveId(id) {
        if (id === virtualId) return resolvedVirtualId;
        if (id === uiVirtualId) return resolvedUiVirtualId;
        return null;
      },
      load(id) {
        if (id === resolvedUiVirtualId)
          return `
            import React from 'react';
            export function Button({ size, variant, fullWidth, ...props }) {
              return React.createElement('button', props);
            }
            const Icon = (props) => React.createElement('svg', props);
            export {
              Icon as BorderDashedIcon,
              Icon as BoxIcon,
              Icon as CircleIcon,
              Icon as Component1Icon,
              Icon as Crosshair2Icon,
              Icon as CursorArrowIcon,
              Icon as DimensionsIcon,
              Icon as DrawingPinIcon,
              Icon as EnterFullScreenIcon,
              Icon as EyeOpenIcon,
              Icon as FileTextIcon,
              Icon as HandIcon,
              Icon as LayersIcon,
              Icon as MagicWandIcon,
              Icon as Pencil1Icon,
              Icon as PlusIcon,
              Icon as RulerHorizontalIcon,
              Icon as RulerSquareIcon,
              Icon as ScissorsIcon,
              Icon as SewingPinIcon,
              Icon as TargetIcon,
              Icon as ValueIcon,
            };
          `;
        if (id !== resolvedVirtualId) return null;
        return `
          import React, { useEffect } from 'react';
          import { createRoot } from 'react-dom/client';
          import '/src/global.css';
          import { PatternImportDxfPhaseECadTableZeroConnectCanvasV1 } from '${componentPath}';
          function Harness() {
            useEffect(() => { globalThis.__CAD_TABLE_POINTER_READY__ = true; }, []);
            return React.createElement(
              PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
              globalThis.__CAD_TABLE_POINTER_FIXTURE__,
            );
          }
          createRoot(document.getElementById('root')).render(React.createElement(Harness));
        `;
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://localhost');
          if (url.pathname !== '/__cad-table-pointer-drag-regression__') {
            next();
            return;
          }
          const html = await server.transformIndexHtml(
            url.pathname,
            `<!doctype html>
              <html>
                <head>
                  <style>
                    html, body, #root { width: 900px; height: 650px; margin: 0; }
                  </style>
                </head>
                <body>
                  <div id="root"></div>
                  <script>globalThis.__CAD_TABLE_POINTER_FIXTURE__ = ${url.searchParams.get('scene') === 'shaped' ? shapedFixture : ordinaryFixture};</script>
                  <script type="module">import '${virtualId}';</script>
                </body>
              </html>`,
          );
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html');
          response.end(html);
        });
      },
    };
    const server = await createServer({
      appType: 'custom',
      logLevel: 'error',
      optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
      plugins: [harnessPlugin],
      resolve: { alias: { ui: uiVirtualId } },
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite test server has no port.');
      const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
      page.setDefaultTimeout(5_000);
      await page.addInitScript(() => {
        Object.defineProperties(SVGSVGElement.prototype, {
          setPointerCapture: {
            configurable: true,
            value: () => undefined,
          },
          hasPointerCapture: { configurable: true, value: () => true },
          releasePointerCapture: { configurable: true, value: () => undefined },
        });
      });
      const browserErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      page.on('pageerror', (error) => browserErrors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/__cad-table-pointer-drag-regression__`, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });
      try {
        await page.waitForFunction(
          () =>
            (globalThis as typeof globalThis & { __CAD_TABLE_POINTER_READY__?: boolean })
              .__CAD_TABLE_POINTER_READY__ === true,
          undefined,
          { timeout: 15_000 },
        );
      } catch {
        throw new Error(`CAD browser harness did not mount: ${browserErrors.join(' | ')}`);
      }
      const moveTool = page.locator('[data-cad-zero-connect-move-tool]');
      try {
        await moveTool.click({ timeout: 5_000 });
      } catch {
        throw new Error(`CAD move tool did not mount: ${browserErrors.join(' | ')}`);
      }
      expect(await moveTool.getAttribute('aria-pressed')).toBe('true');

      const viewport = page.locator('[data-sheet-viewport]');
      const piece = page.locator('[data-cad-zero-connect-piece="closed-piece"]');
      const hitSurface = piece.locator('[data-cad-zero-connect-material]');
      await viewport.waitFor({ timeout: 5_000 });
      await piece.waitFor({ timeout: 5_000 });
      expect(await viewport.getAttribute('class')).toContain('cursor-move');
      const viewBoxBefore = await viewport.getAttribute('viewBox');
      const transformAttributeBefore = await piece.getAttribute('transform');
      const transformBefore = translated(transformAttributeBefore);
      if (!viewBoxBefore) throw new Error('Mounted CAD viewport has no viewBox.');
      const [, , viewWidth, viewHeight] = viewBoxBefore.split(' ').map(Number);
      await hitSurface.scrollIntoViewIfNeeded();
      const viewportRect = await viewport.boundingBox();
      const hitRect = await hitSurface.boundingBox();
      if (!viewportRect || !hitRect) throw new Error('Mounted CAD geometry has no browser bounds.');
      const scale = Math.min(viewportRect.width / viewWidth!, viewportRect.height / viewHeight!);
      const startX = hitRect.x + hitRect.width / 2;
      const startY = hitRect.y + hitRect.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 50, startY + 25);
      await page.waitForFunction(
        (before) =>
          document
            .querySelector('[data-cad-zero-connect-piece="closed-piece"]')
            ?.getAttribute('transform') !== before,
        transformAttributeBefore,
        { timeout: 5_000 },
      );
      const transformAfterMove = translated(await piece.getAttribute('transform'));

      expect(await viewport.getAttribute('viewBox')).toBe(viewBoxBefore);
      expect(transformAfterMove[0]).toBeCloseTo(transformBefore[0] + 50 / scale, 10);
      expect(transformAfterMove[1]).toBeCloseTo(transformBefore[1] + 25 / scale, 10);
      await page.mouse.up();
      expect(await viewport.getAttribute('viewBox')).toBe(viewBoxBefore);
      expect(translated(await piece.getAttribute('transform'))).toEqual(transformAfterMove);

      await page.setViewportSize({ width: 900, height: 1600 });
      await page.goto(
        `http://127.0.0.1:${address.port}/__cad-table-pointer-drag-regression__?scene=shaped`,
        { waitUntil: 'domcontentloaded', timeout: 8_000 },
      );
      await piece.waitFor({ timeout: 5_000 });
      const shapedMaterial = piece.locator('[data-cad-zero-connect-material]');
      await shapedMaterial.scrollIntoViewIfNeeded();
      const screen = (pieceId: string, x: number, y: number) =>
        page.evaluate(
          ({ pieceId, x, y }) => {
            const group = document.querySelector<SVGGraphicsElement>(
              `[data-cad-zero-connect-piece="${pieceId}"]`,
            );
            const matrix = group?.getScreenCTM();
            if (!matrix) throw new Error('The shaped piece has no screen transform.');
            const client = new DOMPoint(x, -y).matrixTransform(matrix);
            return { x: client.x, y: client.y };
          },
          { pieceId, x, y },
        );
      const selected = page.locator('[data-cad-zero-connect-piece-selected="true"]');
      const clickAt = async (x: number, y: number) => {
        const point = await screen('closed-piece', x, y);
        await page.mouse.click(point.x, point.y);
      };
      await clickAt(9, 9);
      const clickLocation = await screen('closed-piece', 9, 9);
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 350),
        clickLocation,
      );
      expect(await selected.count(), JSON.stringify({ clickLocation, hit, browserErrors })).toBe(1);
      expect(await selected.getAttribute('data-cad-zero-connect-piece')).toBe('closed-piece');
      await clickAt(4, 4);
      expect(await selected.count()).toBe(0);
      await clickAt(9, 9);
      await clickAt(26, 26);
      expect(await selected.count()).toBe(0);

      await moveTool.click({ timeout: 5_000 });
      await shapedMaterial.scrollIntoViewIfNeeded();
      const origin = await screen('open-piece', 9, 9);
      const target = await screen('closed-piece', 9, 9);
      await page.mouse.move(origin.x, origin.y);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 6 });
      await page.mouse.up();
      const movedSite = await screen('open-piece', 9, 9);
      expect(
        Math.hypot(movedSite.x - target.x, movedSite.y - target.y),
        JSON.stringify({
          origin,
          target,
          movedSite,
        }),
      ).toBeLessThan(2);
      await page.getByRole('button', { name: 'Select pieces' }).click();
      await shapedMaterial.scrollIntoViewIfNeeded();
      await clickAt(9, 9);
      const firstHit = await selected.getAttribute('data-cad-zero-connect-piece');
      await clickAt(9, 9);
      const secondHit = await selected.getAttribute('data-cad-zero-connect-piece');
      expect(new Set([firstHit, secondHit])).toEqual(new Set(['closed-piece', 'open-piece']));
    } finally {
      await browser.close();
      await server.close();
    }
  }, 30_000);
});
