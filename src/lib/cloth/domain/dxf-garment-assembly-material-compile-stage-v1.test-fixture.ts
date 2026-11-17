import {
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
  projectDxfSourceNativeStraightEdgeAuthorityV1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
} from '../../pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  DXF_ASSEMBLY_HANDOFF_V1,
  buildDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffCandidateV1,
  type DxfSeamV1,
} from './dxf-assembly-handoff-v1';
import {
  PHASE2_BOUNDARY_SAMPLING_V1,
  type Phase2BoundarySamplingPieceV1,
} from '../mesh/triangulation/phase2-boundary-sampling-v1';
import { GARMENT_BOUNDARY_MESH_POLICY_V1 } from '../mesh/garment-phase2-boundary-recovery-v1';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from '../material/presets';
import {
  DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1,
  type DxfGarmentAssemblyMaterialCompileStageRequestV1,
} from './dxf-garment-assembly-material-compile-stage-v1';

/** Actual DXF decoder + its one-shot native projection. The cloth is an explicitly synthetic
 * three-panel straight-edge fixture. Adjoining layout is authored in the DXF itself,
 * not a placement transformation or a source-inference fallback. Never a saved product or actual body qualification. */
export async function createThreePanelDxfMaterialCompileFixtureV1(
  layout: 'adjoining' | 'separated' = 'adjoining',
) {
  const ids = ['panel-a', 'panel-b', 'panel-c'] as const;
  const handles = ['A1', 'B1', 'C1'] as const;
  const line = (handle: string, x: number) =>
    `0\nLWPOLYLINE\n5\n${handle}\n8\n1\n90\n4\n70\n1\n10\n${x}\n20\n0\n10\n${x + 100}\n20\n0\n10\n${x + 100}\n20\n100\n10\n${x}\n20\n100`;
  const bytes = new TextEncoder().encode(
    `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${handles.map((handle, i) => line(handle, i * (layout === 'adjoining' ? 100 : 200))).join('\n')}\n0\nENDSEC\n0\nEOF\n`,
  );
  const sourceFileId = 'three-panel-fixture-source';
  const read = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    { id: sourceFileId, name: 'three-explicit-panels.dxf', bytes: bytes.buffer },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId },
  );
  if (!read.ok) throw new Error(JSON.stringify(read.blockers));
  const native = projectDxfSourceNativeStraightEdgeAuthorityV1(read.value.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
    sourceFileId,
    sourceSha256: read.value.read.doc.file.sha256,
  });
  if (!native.ok || !native.projection.complete)
    throw new Error('Fixture native DXF projection was not complete.');
  const rings = handles.map((handle) =>
    native.projection.descriptors
      .filter((edge) => edge.primitive.entityHandle === handle)
      .sort((a, b) => a.primitive.primitiveSegmentIndex - b.primitive.primitiveSegmentIndex),
  );
  if (rings.some((ring) => ring.length !== 4))
    throw new Error('Fixture handles must yield exactly four native edges.');
  const side = (pieceIndex: number, edgeIndex: number, direction: 'forward' | 'reverse') => ({
    pieceId: ids[pieceIndex],
    contourId: `${ids[pieceIndex]}-shell`,
    anchors: [
      rings[pieceIndex][edgeIndex].startVertexId,
      rings[pieceIndex][edgeIndex].endVertexId,
    ] as const,
    direction,
  });
  // Explicit AO choices: A right → B left, B right → C left. Nothing is selected by XY.
  const seams: DxfSeamV1[] = [
    {
      id: 'ao-10-stitch',
      operationId: 'ao-10',
      mapping: 'equal',
      lengthRatio: 1,
      sides: [side(0, 1, 'forward'), side(1, 3, 'reverse')],
    },
    {
      id: 'ao-20-stitch',
      operationId: 'ao-20',
      mapping: 'equal',
      lengthRatio: 1,
      sides: [side(1, 1, 'forward'), side(2, 3, 'reverse')],
    },
  ];
  const medium = VISUAL_UNCALIBRATED_CLOTH_PRESETS[1];
  const light = VISUAL_UNCALIBRATED_CLOTH_PRESETS[0];
  const candidate: DxfAssemblyHandoffCandidateV1 = {
    schemaVersion: DXF_ASSEMBLY_HANDOFF_V1,
    source: {
      format: 'DXF',
      documentId: 'three-panel-explicit-ao-fixture',
      revision: '1',
      units: 'mm',
      sourceSha256: native.projection.sourceSha256,
      exportSha256: native.projection.sourceSha256,
      exporterId: 'test-actual-dxf-reader',
      exporterVersion: '1',
      provenanceKind: 'synthetic-fixture',
      corpusEntryId: null,
    },
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    pieces: ids.map((id, i) => ({
      id,
      name: id,
      cutCount: 1,
      grainDegrees: [90, 0, 45][i],
      contours: [
        {
          id: `${id}-shell`,
          role: 'sewing-boundary',
          closed: true,
          vertices: rings[i].map((edge, index) => ({
            id: edge.startVertexId,
            positionMm: edge.startMm,
            source: {
              sourceCurveId: edge.sourceCurveId,
              parameterSpace: edge.native.parameterSpace,
              sourceCurveT: edge.native.sourceCurveTRange[0],
              normalizedArc: index / 4,
            },
          })),
        },
      ],
    })),
    seams,
    operations: seams.map((seam, i) => ({
      id: seam.operationId,
      stage: 10 + i * 10,
      order: i,
      kind: 'stitch',
      seamIds: [seam.id],
    })),
    materials: [
      { id: medium.id, materialRevision: medium.revision, pieceIds: [ids[0], ids[2]] },
      { id: light.id, materialRevision: light.revision, pieceIds: [ids[1]] },
    ],
  };
  const handoff = await buildDxfAssemblyHandoffV1(candidate);
  if (!handoff.ok) throw new Error(JSON.stringify(handoff));
  const pieces: Phase2BoundarySamplingPieceV1[] = handoff.value.pieces.map((piece) => {
    const ring = piece.contours[0];
    const index = ids.indexOf(piece.id as (typeof ids)[number]);
    return {
      input: {
        pieceId: piece.id,
        shell: {
          id: ring.id,
          role: 'shell',
          vertices: ring.vertices.map((v) => ({
            id: v.id,
            positionMm: v.positionMm,
            source: {
              contourId: ring.id,
              sourceCurveId: v.source.sourceCurveId,
              sourceCurveParameterSpace: v.source.parameterSpace,
              sourceCurveT: v.source.sourceCurveT,
              normalizedArc: v.source.normalizedArc,
            },
          })),
        },
        holes: [],
        grainDegrees: piece.grainDegrees,
        seamEndpoints: handoff.value.seams.flatMap((seam) =>
          seam.sides.flatMap((s, si) =>
            s.pieceId === piece.id
              ? s.anchors.map((boundaryVertexId, ai) => ({
                  id: `${seam.id}/side-${si}/anchor-${ai}`,
                  boundaryVertexId,
                }))
              : [],
          ),
        ),
        options: {
          targetEdgeMm: 10,
          minInputEdgeMm: 1e-6,
          minTriangleAngleDegrees: 0.01,
          maxEdgeRatio: 1e9,
          maxRadiusEdgeRatio: 1e9,
          maxBoundaryErrorMm: 1e-9,
          collinearSinTolerance: 1e-12,
        },
      },
      edges: rings[index].map((edge, edgeIndex) => ({
        edgeId: `${piece.id}/edge-${edgeIndex}`,
        pieceId: piece.id,
        ringId: ring.id,
        edgeIndex,
        startBoundaryVertexId: edge.startVertexId,
        endBoundaryVertexId: edge.endVertexId,
        native: { sourceFileId, ...edge.native },
      })),
    };
  });
  const request: DxfGarmentAssemblyMaterialCompileStageRequestV1 = {
    schemaVersion: DXF_GARMENT_ASSEMBLY_MATERIAL_COMPILE_STAGE_V1,
    handoff: handoff.value,
    samplingRequest: {
      version: PHASE2_BOUNDARY_SAMPLING_V1,
      sourceFileId,
      targetEdgeMm: 40,
      pieces,
      equalSeams: handoff.value.seams.map((seam) => ({
        seamId: seam.id,
        mapping: 'equal',
        lengthRatio: 1,
        exactToleranceMm: 1e-6,
        sides: seam.sides.map((s) => ({
          pieceId: s.pieceId,
          edgeId: pieces
            .find((p) => p.input.pieceId === s.pieceId)!
            .edges.find(
              (edge) =>
                edge.startBoundaryVertexId === s.anchors[0] &&
                edge.endBoundaryVertexId === s.anchors[1],
            )!.edgeId,
          direction: s.direction,
        })) as unknown as readonly [
          { pieceId: string; edgeId: string; direction: 'forward' | 'reverse' },
          { pieceId: string; edgeId: string; direction: 'forward' | 'reverse' },
        ],
      })),
    },
    exactSeamToleranceMm: 1e-6,
    materialPolicy: {
      version: GARMENT_BOUNDARY_MESH_POLICY_V1,
      policyId: 'explicit-fixture-material-range',
      revision: '1',
      minEdgeMm: 10,
      maxEdgeMm: 50,
    },
    materials: [medium, light],
    continuumMaterials: [medium, light].map((material) => ({
      materialId: material.id,
      materialRevision: material.revision,
      complianceMPerN: { warp: 8e-11, weft: 1.2e-10, shear: 5e-10 },
      provenance: {
        calibrationStatus: 'uncalibrated-visual',
        sourceId: 'explicit-three-panel-cpu-fixture',
      },
    })),
    materialSolver: { dtS: 1 / 120, solverIterations: 8, allowUncalibratedVisual: true },
  };
  return { request, candidate, nativeProjection: native.projection, dxfBytes: bytes };
}
