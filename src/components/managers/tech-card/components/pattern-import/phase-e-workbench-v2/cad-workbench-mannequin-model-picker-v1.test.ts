import type {
  MeasurementSurfacePatternPieceOverlayV1,
  MeasurementSurfacePatternPieceV1,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import { describe, expect, it } from 'vitest';

import { layoutPatternImportDxfPhaseECadMannequinUnboundStageV1 } from './cad-workbench-mannequin-model-picker-v1';

function piece(pieceKey: string, width: number, height: number): MeasurementSurfacePatternPieceV1 {
  return {
    pieceKey,
    scopeKey: 'scope-main',
    pieceId: pieceKey,
    pieceLineKey: pieceKey,
    lane: 'front',
    laneIndex: 0,
    contours: [
      {
        contourId: `${pieceKey}:outer`,
        role: 'cut-boundary',
        vertices: [
          { vertexId: `${pieceKey}:0`, pointMm: { x: 0, y: 0 } },
          { vertexId: `${pieceKey}:1`, pointMm: { x: width, y: 0 } },
          { vertexId: `${pieceKey}:2`, pointMm: { x: width, y: height } },
          { vertexId: `${pieceKey}:3`, pointMm: { x: 0, y: height } },
        ],
      },
    ],
    selected: false,
    swatchCss: null,
    transform: null,
    seams: [],
  };
}

function overlay(pieces: readonly MeasurementSurfacePatternPieceV1[]) {
  return {
    revision: 'exact-revision',
    pieces,
    tool: 'select',
    visibility: { pieces: true, edges: true, seams: true, pins: true, thread: true },
  } satisfies MeasurementSurfacePatternPieceOverlayV1;
}

describe('model-free mannequin pattern stage', () => {
  it('keeps exact contour coordinates and one common scale across staged pieces', () => {
    const result = layoutPatternImportDxfPhaseECadMannequinUnboundStageV1(
      overlay([piece('front', 200, 400), piece('collar', 300, 80)]),
    );

    expect(result).not.toBeNull();
    expect(result?.pieces).toHaveLength(2);
    expect(result?.pieces[0].fillPathD).toBe('M 0 0 L 200 0 L 200 400 L 0 400 Z');
    expect(result?.pieces[0].strokePathD).toBe('M 0 0 L 200 0 L 200 400 L 0 400 Z');
    expect(result?.pieces[1].fillPathD).toBe('M 0 0 L 300 0 L 300 80 L 0 80 Z');
    expect(result?.viewBox).toBe('0 0 1024 512');
  });

  it('fills the cut shell and holes without treating a sewing boundary as another hole', () => {
    const nested = piece('front', 200, 400);
    const result = layoutPatternImportDxfPhaseECadMannequinUnboundStageV1(
      overlay([
        {
          ...nested,
          contours: [
            ...nested.contours,
            {
              contourId: 'front:sewing',
              role: 'sewing-boundary',
              vertices: [
                { vertexId: 'sewing:0', pointMm: { x: 10, y: 10 } },
                { vertexId: 'sewing:1', pointMm: { x: 190, y: 10 } },
                { vertexId: 'sewing:2', pointMm: { x: 190, y: 390 } },
                { vertexId: 'sewing:3', pointMm: { x: 10, y: 390 } },
              ],
            },
            {
              contourId: 'front:hole',
              role: 'hole',
              vertices: [
                { vertexId: 'hole:0', pointMm: { x: 80, y: 180 } },
                { vertexId: 'hole:1', pointMm: { x: 120, y: 180 } },
                { vertexId: 'hole:2', pointMm: { x: 120, y: 220 } },
                { vertexId: 'hole:3', pointMm: { x: 80, y: 220 } },
              ],
            },
          ],
        },
      ]),
    );

    expect(result?.pieces[0].fillPathD).toContain('M 0 0 L 200 0 L 200 400 L 0 400 Z');
    expect(result?.pieces[0].fillPathD).toContain('M 80 180 L 120 180 L 120 220 L 80 220 Z');
    expect(result?.pieces[0].fillPathD).not.toContain('M 10 10');
    expect(result?.pieces[0].strokePathD).toContain('M 10 10 L 190 10 L 190 390 L 10 390 Z');
  });

  it('fails closed when no renderable exact contour is available', () => {
    expect(layoutPatternImportDxfPhaseECadMannequinUnboundStageV1(overlay([]))).toBeNull();
  });
});
