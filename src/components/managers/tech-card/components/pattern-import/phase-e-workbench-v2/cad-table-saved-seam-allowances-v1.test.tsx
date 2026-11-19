import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PieceDTO } from 'lib/nesting/types';
import { DXF_PATH_PROVENANCE_V1 } from 'lib/pattern-import/dxf-path-provenance-v1';
import {
  DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1,
  type DxfPieceSpecProvenanceSourcePathV1,
} from 'lib/pattern-import/dxf-piece-spec-provenance-bridge-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PtMm } from 'lib/pattern-import/types';

import { CadTablePieceFeatureMarks } from './cad-table-piece-feature-marks-v1';
import { hasCadTablePieceFeature, type CadTablePieceFeatures } from './cad-table-piece-features-v1';
import { projectCadTableSavedSeamAllowancesV1 } from './cad-table-saved-seam-allowances-v1';

const line = '01M1M1ZAHF9Y0DR2YD9SD7FY25';
const pieceId = 'BACK_L';
const key = pieceId + '::' + line;
const sourceFileId = 'saved-file-main';
const sourceSha256 = 'a'.repeat(64);
const selectedSha = 'b'.repeat(64);
const ring = (...points: readonly [number, number][]) => points.map(([x, y]) => ({ x, y }));
const rectangle = ring([0, 0], [100, 0], [100, 100], [0, 100]);
const nested = ring([10, 20], [85, 12], [80, 90], [15, 80]);

function path(pathId: number, pointsMm: readonly PtMm[]): DxfPieceSpecProvenanceSourcePathV1 {
  return {
    pathId,
    pointsMm,
    closed: true,
    provenance: {
      schemaVersion: DXF_PATH_PROVENANCE_V1,
      sourceFileId,
      instancePath: ['b/4261636b5f4c5f4d/p/14320/o/0/r/0/c/0'],
      samples: pointsMm.map((_, index) => ({
        vertexId: 'vertex-' + pathId + '-' + index,
        sourceCurveId: 'curve-' + pathId,
        parameterSpace: 'unit',
        sourceCurveT: index / pointsMm.length,
      })),
    },
  };
}

function role(id: number, blockName: string, layer: string, drawing: readonly PtMm[]): PieceDTO {
  const xs = drawing.map(({ x }) => x / 10);
  const ys = drawing.map(({ y }) => y / 10);
  const originX = Math.min(...xs);
  const originY = Math.min(...ys);
  const bboxW = Math.max(...xs) - originX;
  const bboxH = Math.max(...ys) - originY;
  return {
    id,
    blockName,
    layer,
    name: blockName,
    source: 'fixture.dxf',
    originX,
    originY,
    bboxW,
    bboxH,
    areaCm2: bboxW * bboxH,
    poly: drawing.map(({ x, y }) => ({ x: x / 10 - originX, y: y / 10 - originY })),
  };
}

function fixture(
  cut = rectangle,
  sewing = nested,
): Parameters<typeof projectCadTableSavedSeamAllowancesV1>[0] {
  const a = path(4046, cut);
  const b = path(4258, sewing);
  const boundary = {
    contourId: 'current-source-cut',
    role: 'cut-boundary',
    geometry: { kind: 'cut' },
    closed: true,
    pieceId,
    sizeToken: 'M',
    pointsMm: cut,
    lineage: {
      sourcePathIds: [a.pathId],
      uniformPositiveScale: 1,
      cyclicShift: 0,
      direction: 'forward',
      mutations: [],
    },
  } as const;
  const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
    expectedCatalogCanonicalSha256: 'c'.repeat(64),
    sizeSelectionCanonicalSha256: selectedSha,
    sourceFileId,
    sizeToken: 'M',
    joinMode: 'catalog-ordinal-to-phase-d-point',
    geometryPlacementApplied: false,
    pieces: [
      {
        pieceId,
        pieceLineKey: line,
        cameraMm: { minX: 0, minY: 0, maxX: 100, maxY: 100, padding: 20 },
        contours: [
          {
            contourId: boundary.contourId,
            role: boundary.role,
            closed: true,
            vertices: cut.map((pointMm, ordinal) => ({
              ordinal,
              pointMm,
              normalizedArc: ordinal / cut.length,
              vertexId: a.provenance.samples[ordinal].vertexId,
            })),
          },
        ],
      },
    ],
  };
  return {
    projection,
    scopeKey: 'main',
    sourceSha256,
    savedSizeTokens: ['M', 'S'],
    candidates: [
      role(1, 'BACK_L_M', '1', cut),
      role(2, 'BACK_L_M', '14', sewing),
      // The other rank has exactly the same native L1 geometry and sheet origin.
      role(3, 'BACK_L_S', '1', cut),
      role(4, 'BACK_L_S', '14', rectangle),
    ],
    selected: {
      selection: {
        scopeKey: 'main',
        sizeToken: 'M',
        pieceIds: [pieceId],
        canonicalSha256: selectedSha,
        selectedGeometrySha256: 'd'.repeat(64),
        fullSelectedGeometrySha256: 'e'.repeat(64),
      },
      phaseD: {
        sourceSha256,
        contours: [boundary],
        source: {
          schemaVersion: DXF_PIECE_SPEC_PROVENANCE_SOURCE_V1,
          sourceFileId,
          paths: [a, b],
          upstreamBlockerCount: 0,
          productionReady: false,
          heuristicRecoveryUsed: false,
          pieceSpecWireIntegrated: false,
          includesRawDxf: false,
          includesTags: false,
          includesAst: false,
        },
      },
    },
  };
}

describe('saved Workbench seam allowance bands', () => {
  it('uses the exact graded source paths and renders a pointer-transparent even-odd difference', () => {
    const input = fixture();
    const visibleCut = input.projection.pieces[0].contours[0].vertices.map(
      ({ pointMm }) => pointMm,
    );
    const before = structuredClone(input.projection);
    const seamAllowance = projectCadTableSavedSeamAllowancesV1(input).get(key);
    expect(seamAllowance).toEqual({
      cutPathId: 4046,
      sewingPathId: 4258,
      cut: visibleCut,
      sewing: nested,
    });
    expect(seamAllowance?.sewing).toBe(input.selected.phaseD.source.paths[1].pointsMm);
    expect(input.projection).toEqual(before);
    const features: CadTablePieceFeatures = {
      grain: null,
      internal: [],
      fold: null,
      notches: [],
      drills: [],
      pieceLabel: 'BACK_L',
      materialLabel: null,
      quantity: 1,
      seamAllowance,
    };
    expect(hasCadTablePieceFeature(features, 'seamAllowance')).toBe(true);
    const render = (hidden: boolean) =>
      renderToStaticMarkup(
        <svg>
          <CadTablePieceFeatureMarks
            features={features}
            unit={1}
            materialRings={[]}
            hiddenLayers={new Set(hidden ? ['seamAllowance'] : [])}
          />
        </svg>,
      );
    expect(render(false)).toContain('pointer-events="none"');
    expect(render(false)).toContain('data-cad-seam-allowance-cut-path="4046"');
    expect(render(false)).toContain(
      'd="M 0,0 100,0 100,-100 0,-100 Z M 10,-20 85,-12 80,-90 15,-80 Z"',
    );
    expect(render(false)).toContain('fill-rule="evenodd"');
    expect(render(true)).not.toContain('data-cad-zero-connect-seam-allowance');
  });

  it('withholds touching, crossing and self-intersecting rings', () => {
    const notch = ring(
      [0, 0],
      [100, 0],
      [100, 100],
      [70, 100],
      [70, 40],
      [30, 40],
      [30, 100],
      [0, 100],
    );
    expect(
      projectCadTableSavedSeamAllowancesV1(
        fixture(notch, ring([20, 60], [80, 60], [80, 80], [20, 80])),
      ).size,
    ).toBe(0);
    expect(
      projectCadTableSavedSeamAllowancesV1(
        fixture(rectangle, ring([0, 20], [85, 12], [80, 90], [15, 80])),
      ).size,
    ).toBe(0);
    expect(
      projectCadTableSavedSeamAllowancesV1(
        fixture(rectangle, ring([10, 10], [85, 90], [80, 10], [15, 90])),
      ).size,
    ).toBe(0);
  });

  it('withholds same-block holes, duplicate sewing roles and mixed source identity', () => {
    const input = fixture();
    const { selected, candidates } = input;
    const rawHole = path(4260, ring([40, 40], [60, 40], [60, 60], [40, 60]));
    expect(
      projectCadTableSavedSeamAllowancesV1({
        ...input,
        selected: {
          ...selected,
          phaseD: {
            ...selected.phaseD,
            source: {
              ...selected.phaseD.source,
              paths: [...selected.phaseD.source.paths, rawHole],
            },
          },
        },
      }).size,
    ).toBe(0);
    expect(
      projectCadTableSavedSeamAllowancesV1({
        ...input,
        candidates: [...candidates, role(5, 'BACK_L_M', '14', nested)],
      }).size,
    ).toBe(0);
    expect(
      projectCadTableSavedSeamAllowancesV1({ ...input, sourceSha256: 'f'.repeat(64) }).size,
    ).toBe(0);
    expect(projectCadTableSavedSeamAllowancesV1({ ...input, scopeKey: 'lining' }).size).toBe(0);
  });
});
