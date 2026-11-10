// Card 6 «starvation» op #700 "Attach label · front": the composition label is sewn into the left
// front panel's side seam (a composite seam) and also carries a pose at the same spot. The panel's
// pocket outline is a `placement` mark, and the label step used to take it as the label's place:
// a second, phantom label on the pocket in the picker, the step result and the PDF.

import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import type { Affine, PieceGeom } from 'lib/assembly-skeleton/types';
import { compose } from 'lib/assembly-skeleton/union/affine';
import { poseRow, type EdgeAnchor, type StoredSeam } from 'lib/seams';

import { buildAssemblyPiecesFromInput } from '../../techpack/assembly-geometry-build';
import { deriveAssembly, type AsmPiece } from '../../techpack/derive-assembly';
import { garmentLabelDrawingsOf } from '../garment-label-pieces';
import { placementPictureGlyphsForStep, type PlacementMarkStep } from './buttonhole-glyph';
import { CARD6_PIECE_KEYS, card6Geoms, card6InnerLines } from './card6.fixture';
import { invert } from './step-picture';
import { placementT } from './step-pose';
import { stepResults, type StepResult } from './step-result';
import type { FormOpLike } from './step-seams-model';

Object.assign(globalThis, { window: { location: { search: '' } } });

const LABEL = 'COMPOSITION';
const PANEL = 'P_L_MAIN';
const SEAM = 'label into side seam';
const POSE = 'label dropped on panel';
const AT = { xMm: 259.8, yMm: 464.06, rotDeg: 0, flip: false };

const [drawing] = garmentLabelDrawingsOf([
  {
    lineKey: LABEL,
    kind: 'composition',
    widthMm: 100,
    heightMm: 30,
    fold: 'loop',
    attachment: 'sewn_into_seam',
  },
]);
const labelPiece: AsmPiece = buildAssemblyPiecesFromInput(
  {
    pieces: [
      { lineKey: LABEL, name: drawing.mark.label, materials: [], garmentLabel: drawing.mark },
    ],
    bomItems: [],
  },
  new Map([[LABEL, drawing.found]]),
).pieces.get(LABEL)!;

const geoms = new Map<string, PieceGeom>([...card6Geoms(), [LABEL, labelPiece.geom]]);
const panel = geoms.get(PANEL)!;

const anchor = (piece: string, edge: number, range: [number, number] = [0, 1]): EdgeAnchor => ({
  piece,
  samples: [
    [0, 0],
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [1, 0],
  ],
  perimShare: 0.25,
  lenMm: 100,
  notches: 0,
  turnDeg: 0,
  range,
  edgeHint: `${piece}#${edge}`,
  contourSig: 'card6',
});

// The prod rows' shape: the panel's edges #2 and #4 (a share of it) against the label's short edge.
const seam: StoredSeam = {
  seamKey: SEAM,
  status: 'confirmed',
  kind: 'composite',
  direction: 'reversed',
  source: 'manual',
  sideA: [anchor(PANEL, 2), anchor(PANEL, 4, [0.1556, 0.2142])],
  sideB: [anchor(LABEL, 3)],
  anchoredSize: '',
  note: '',
};
const pose = poseRow({ seamKey: POSE, piece: labelPiece.geom, host: panel, placement: AT });

const labelOp = (patch: Partial<FormOpLike> = {}): FormOpLike =>
  ({
    operationNumber: 700,
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    work: 'attach_label',
    zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
    inputKeys: [PANEL],
    labelKeys: [LABEL],
    seamKeys: [SEAM],
    poseKeys: [POSE],
    ...patch,
  }) as FormOpLike;

const resultOf = (op: FormOpLike): StepResult =>
  stepResults(
    {
      ops: [op],
      byKey: new Map([[SEAM, seam]]),
      poses: new Map([[POSE, pose]]),
      geoms,
      innerLines: card6InnerLines(),
      pieceKeys: new Set([...CARD6_PIECE_KEYS, LABEL]),
    },
    { manualFit: true },
  )[0];

/** The editor's automatic glyphs: every piece the step's result draws is a host. */
const editorGlyphs = (op: FormOpLike, result: StepResult) => {
  const steps: PlacementMarkStep[] = [
    {
      operation: op,
      hosts: [...result.layout.T.keys()].flatMap((key) => {
        const geom = geoms.get(key);
        return geom ? [{ key, name: geom.name, geom }] : [];
      }),
    },
  ];
  return placementPictureGlyphsForStep(steps, 0);
};

const relative = (result: StepResult): Affine =>
  compose(invert(result.transforms.get(PANEL)!), result.transforms.get(LABEL)!);

const closeAffine = (actual: Affine, expected: Affine) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));

describe('a label sewn into a seam and posed in the same step is drawn once', () => {
  it('the panel pocket outline is a placement mark: an unknown label still takes it', () => {
    const op = labelOp({ labelKeys: [] });
    const glyphs = editorGlyphs(op, resultOf(op));

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]).toMatchObject({ kind: 'label', piece: PANEL });
  });

  it('draws the label piece once and no label glyph on the pocket', () => {
    const op = labelOp();
    const result = resultOf(op);

    expect([...result.layout.T.keys()].filter((key) => key === LABEL)).toHaveLength(1);
    expect(editorGlyphs(op, result).filter((glyph) => glyph.kind === 'label')).toEqual([]);
  });

  it('keeps the label where the pose and the seam agree, as a pose-only label', () => {
    const both = resultOf(labelOp());
    const posed = resultOf(labelOp({ seamKeys: [] }));
    const expected = placementT(panel, labelPiece.geom, AT);

    closeAffine(relative(posed), expected);
    closeAffine(relative(both), expected);
    expect(editorGlyphs(labelOp({ seamKeys: [] }), posed)).toEqual([]);
  });

  it('prints no label position on the PDF assembly page either', () => {
    const panelPiece: AsmPiece = {
      key: PANEL,
      name: 'Left front panel',
      code: PANEL,
      cut: panel.rs.map(([x, y]) => [x, -y]),
      inner: [],
      notch: [],
      pocketing: false,
      area: panel.areaMm2,
      geom: panel,
    };
    const techCard = (labelKeys: string[]) =>
      ({
        id: 6,
        techCard: {
          name: 'starvation',
          pieces: [{ lineKey: PANEL, name: 'Left front panel' }],
          operations: [{ ...labelOp(), labelKeys }],
          bomItems: [],
          patterns: [],
        },
        seams: [],
        colorways: [],
        markers: [],
        resolvedTechnicalMedia: [],
      }) as unknown as common_TechCard;
    const actionOf = (labelKeys: string[]) =>
      deriveAssembly({
        techCard: techCard(labelKeys),
        pieces: new Map([
          [PANEL, panelPiece],
          [LABEL, labelPiece],
        ]),
        grainDeg: new Map(),
      }).rows.find((row) => row.n === 700)?.action;

    expect(actionOf([])?.placements).toEqual([
      expect.objectContaining({ kind: 'label', piece: PANEL }),
    ]);
    const drawn = actionOf([LABEL]);
    expect(drawn?.placements).toEqual([]);
    expect(drawn?.missing).toBeUndefined();
  });
});
