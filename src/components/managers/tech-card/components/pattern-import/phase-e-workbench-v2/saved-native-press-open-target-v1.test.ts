import { describe, expect, it } from 'vitest';
import {
  createDxfCurveSampleV1,
  createDxfInsertInstancePathV1,
  createDxfSourceCurveIdV1,
} from 'lib/pattern-import/dxf-path-provenance-v1';
import { computeDxfProductSavedSourceFileIdV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { SavedCompleteAssemblyNativeStitchAnchorsV1 } from './saved-complete-assembly-native-stitch-anchors-v1';
import { projectSavedNativePressOpenTargetV1 } from './saved-native-press-open-target-v1';

function fixture() {
  const row = {
    techCardId: 7,
    cardLockVersion: 2,
    scopeKey: 'main',
    patternLineKey: 'sheet',
    revision: 5,
    url: 'https://test.invalid/source.dxf',
    sizeBytes: 512,
    sha256: 'b'.repeat(64),
  };
  const sourceFileId = computeDxfProductSavedSourceFileIdV1(row);
  function piece(pieceLineKey: string, n: number) {
    const blockName = pieceLineKey.toUpperCase();
    const path = createDxfInsertInstancePathV1([
      {
        blockName: blockName + '_M',
        insertHandle: null,
        insertOp: n,
        occurrenceIndex: 0,
        mInsertRow: 0,
        mInsertColumn: 0,
      },
    ]);
    if (!path.ok) throw new Error('Invalid test INSERT.');
    const sourceInstancePath = path.value;
    const curve = createDxfSourceCurveIdV1({
      sourceFileId,
      instancePath: sourceInstancePath,
      entityOp: 20 + n,
      entityHandle: null,
      sub: 0,
      primitiveSegmentIndex: 0,
    });
    if (!curve.ok) throw new Error('Invalid test curve.');
    const ids = [0, 1].map((t) => {
      const sample = createDxfCurveSampleV1(curve.value, t, 'unit', t);
      if (!sample.ok) throw new Error('Invalid test vertex.');
      return sample.value.vertexId;
    });
    const startMm = [1, 1 + n],
      endMm = [5, 1 + n];
    return {
      cut: {
        row,
        blockName,
        pieceLineKey,
        sizeToken: 'M',
        nativePathId: 30 + n,
        sourceInstancePath,
        nativePointsMm: [
          { x: 0, y: 0 },
          { x: 0, y: 6 },
          { x: 8, y: 6 },
          { x: 8, y: 0 },
        ],
      },
      anchor: {
        operationNumber: 30,
        operationOrder: 0,
        seamKey: 'sewn',
        pieceLineKey,
        blockName,
        row,
        edgeHint: pieceLineKey + '#1',
        storedAnchor: { pieceLineKey, edgeHint: pieceLineKey + '#1', rangeFrom: 0, rangeTo: 0 },
        sideIndex: n,
        partOrdinal: 0,
        direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
        seamKind: 'TECH_CARD_SEAM_KIND_EDGE',
        kind: 'native-directed-l14',
        anchoredSize: '',
        span: {
          sourceFileId,
          nativePathId: 40 + n,
          fullRunVertexIds: ids,
          fraction: [0, 1],
          start: { positionMm: startMm },
          end: { positionMm: endMm },
          nativeLengthMm: 4,
          intervals: [{ nativeCurveId: curve.value, t0: 0, t1: 1, startMm, endMm }],
        },
      },
    };
  }
  const sides = [piece('left', 0), piece('right', 1)];
  return {
    cardId: 7,
    cardLockVersion: 2,
    sourceSha256: 'c'.repeat(64),
    sizeId: 58,
    sizeToken: 'M',
    rows: [{ ...row, patternVersion: 7 }],
    operations: [
      {
        operationNumber: 30,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        work: 'join_lockstitch',
        inputKeys: ['left', 'right'],
        pieceLineKeys: ['left', 'right'],
        outputUnitKey: 'UNIT',
        seamKeys: ['sewn', 'posed'],
      },
      {
        operationNumber: 40,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
        work: 'press_open',
        pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
        inputKeys: ['UNIT'],
        seamKeys: [],
      },
    ],
    sourceCuts: sides.map((s) => s.cut),
    spans: sides.map((s) => s.anchor),
    poses: [
      {
        operationNumber: 30,
        seamKey: 'posed',
        seam: {
          seamKey: 'posed',
          kind: 'TECH_CARD_SEAM_KIND_POSE',
          status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
          sideA: { parts: [{ pieceLineKey: 'right' }] },
          sideB: { parts: [{ pieceLineKey: 'left' }] },
        },
      },
    ],
    unavailable: [],
  };
}
type Fixture = ReturnType<typeof fixture>;
const project = (s: Fixture) =>
  projectSavedNativePressOpenTargetV1(
    s as unknown as SavedCompleteAssemblyNativeStitchAnchorsV1,
    40,
  );
describe('saved native Press Open', () => {
  it('preserves both original hinge directions and registers the reversed stitch exactly once', () => {
    const s = fixture();
    s.spans.reverse();
    s.sourceCuts.reverse();
    const out = project(s);
    expect(out.producerOperationNumber).toBe(30);
    expect(out.pieces.map((p) => p.pieceId)).toEqual(['left', 'right']);
    expect(out.pieces[0].ringMm).toEqual([
      [0, 0],
      [8, 0],
      [8, 6],
      [0, 6],
    ]);
    expect(out.pieces[1].lineMm).toEqual([
      [1, 2],
      [5, 2],
    ]);
    expect(out.stitch).toEqual({
      operationOrder: 0,
      seamId: 'sewn',
      sections: [
        {
          sideA: { pieceId: 'left', intervals: [{ startMm: [1, 1], endMm: [5, 1] }] },
          sideB: { pieceId: 'right', intervals: [{ startMm: [5, 2], endMm: [1, 2] }] },
        },
      ],
    });
  });
  it('accepts the protobuf default representation of an empty press override', () => {
    const source = fixture();
    Object.assign(source.operations[1]!, {
      press: { action: 'TECH_CARD_PRESS_ACTION_UNKNOWN', toward: 'TECH_CARD_PRESS_TOWARD_UNKNOWN' },
    });
    expect(project(source).producerOperationNumber).toBe(30);
  });
  const cases: [string, (s: Fixture) => void, RegExp][] = [
    [
      'future producer',
      (s) => {
        s.operations.reverse();
      },
      /earlier/,
    ],
    [
      'ambiguous output',
      (s) => {
        s.operations.push({ ...s.operations[0]!, operationNumber: 50 });
      },
      /earlier/,
    ],
    [
      'foreign producer inputs',
      (s) => {
        s.operations[0]!.inputKeys = ['left', 'other'];
      },
      /earlier/,
    ],
    [
      'press to one side',
      (s) => {
        s.operations[1]!.work = 'press_to_one_side';
      },
      /Press Open/,
    ],
    [
      'press override',
      (s) => {
        Object.assign(s.operations[1]!, {
          press: { action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE' },
        });
      },
      /no override/,
    ],
    [
      'own seam',
      (s) => {
        s.operations[1]!.seamKeys = ['sewn'];
      },
      /Press Open/,
    ],
    [
      'duplicated side',
      (s) => {
        s.spans[1]!.sideIndex = 0;
      },
      /two exact material sides/,
    ],
    [
      'pose for other pieces',
      (s) => {
        s.poses[0]!.seam.sideA.parts[0]!.pieceLineKey = 'left';
      },
      /pose/,
    ],
    [
      'stale pose',
      (s) => {
        Object.assign(s.poses[0]!.seam, { stale: true });
      },
      /pose/,
    ],
    [
      'stale cut row',
      (s) => {
        s.sourceCuts[0]!.row = { ...s.rows[0]!, revision: 4 };
      },
      /exact saved row/,
    ],
    [
      'ambiguous cut owner',
      (s) => {
        s.sourceCuts.push(s.sourceCuts[0]!);
      },
      /one current L1/,
    ],
    [
      'wrong rank',
      (s) => {
        s.sourceCuts[1]!.sizeToken = 'L';
      },
      /exact saved row/,
    ],
    [
      'foreign INSERT',
      (s) => {
        s.sourceCuts[0]!.sourceInstancePath = s.sourceCuts[1]!.sourceInstancePath;
      },
      /different native file or block/,
    ],
    [
      'foreign curve',
      (s) => {
        s.spans[0]!.span.intervals[0]!.nativeCurveId = s.spans[1]!.span.intervals[0]!.nativeCurveId;
      },
      /different native file or block/,
    ],
    [
      'partial curve',
      (s) => {
        s.spans[0]!.span.intervals[0]!.t0 = 0.3;
      },
      /complete original straight/,
    ],
    [
      'two material segments',
      (s) => {
        s.spans[0]!.span.intervals.push(s.spans[0]!.span.intervals[0]!);
      },
      /complete original straight/,
    ],
    [
      'changed native position',
      (s) => {
        s.spans[0]!.span.start.positionMm = [7, 8];
      },
      /complete original straight/,
    ],
  ];
  it.each(cases)('refuses %s', (_, change, error) => {
    const source = fixture();
    change(source);
    expect(() => project(source)).toThrow(error);
  });
});
