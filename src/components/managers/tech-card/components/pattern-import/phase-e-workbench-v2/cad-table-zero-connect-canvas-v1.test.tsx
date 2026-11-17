import { chromium } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type Plugin } from 'vite';
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

  it('keeps the mounted SVG viewBox byte-identical through a real piece pointer drag', async () => {
    const browserFixture = JSON.stringify(fixture()).replaceAll('<', '\\u003c');
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
          if (request.url !== '/__cad-table-pointer-drag-regression__') {
            next();
            return;
          }
          const html = await server.transformIndexHtml(
            request.url,
            `<!doctype html>
              <html>
                <head>
                  <style>
                    html, body, #root { width: 900px; height: 650px; margin: 0; }
                  </style>
                </head>
                <body>
                  <div id="root"></div>
                  <script>globalThis.__CAD_TABLE_POINTER_FIXTURE__ = ${browserFixture};</script>
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
    const browser = await chromium.launch({ headless: true });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite test server has no port.');
      const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
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
      const hitSurface = piece.locator('rect').first();
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
    } finally {
      await browser.close();
      await server.close();
    }
  }, 30_000);
});
