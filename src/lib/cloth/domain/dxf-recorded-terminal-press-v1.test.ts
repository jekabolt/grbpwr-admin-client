import { expect, it } from 'vitest';
import captured from './test-fixtures/recorded-terminal-press-operations.json';
import {
  readRecordedAssemblyOrder,
  equalRecordedAssemblyOrder,
} from './dxf-recorded-terminal-press-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-assembly-topology-hash-v1';

it('binds the complete saved unassigned press including the production note and original relative order', () => {
  const actual = readRecordedAssemblyOrder(captured, canonical(captured));
  expect(actual?.map((step) => step.sourceOperationNumber)).toEqual([10, 20]);
  expect(JSON.parse(actual![1].canonicalSourceOperation)).toEqual(captured[1]);
  const altered = structuredClone(captured);
  altered[1].note = 'new instructions';
  expect(
    equalRecordedAssemblyOrder(actual, readRecordedAssemblyOrder(altered, canonical(altered))),
  ).toBe(false);
  expect(readRecordedAssemblyOrder(captured, canonical([...captured].reverse()))).toBeNull();
  expect(
    readRecordedAssemblyOrder(
      captured,
      canonical([...captured, captured[0]].map((v) => structuredClone(v))),
    ),
  ).toBeNull();
});
it.each(
  Object.entries({
    inputKeys: ['piece'],
    foldKeys: ['fold'],
    seamKeys: ['seam'],
    pieceIds: ['2'],
    pieceLineKeys: ['piece'],
    layerOrder: ['piece'],
    outputUnitKey: 'body',
    labelKeys: ['label'],
    media: [{}],
    press: { action: 'mould' },
    pressDwellSec: 15,
    pressProfileKey: 'new',
    draft: true,
    workVariant: 'other',
    extra: false,
  }),
)(
  'refuses the saved press when %s changes even with a newly canonicalized source',
  (key, value) => {
    const wire = structuredClone(captured);
    Object.assign(wire[1], { [key]: value });
    expect(readRecordedAssemblyOrder(captured, canonical(wire))).toBeNull();
  },
);
it('rejects omitted defaults, a different stitch owner, or a duplicate of the first input', () => {
  const wire = structuredClone(captured);
  const { press, ...missing } = wire[1];
  expect(readRecordedAssemblyOrder(captured, canonical([wire[0], missing]))).toBeNull();
  wire[0].operationType = 'TECH_CARD_OPERATION_TYPE_PRESS';
  expect(readRecordedAssemblyOrder(captured, canonical(wire))).toBeNull();
  wire[0].inputKeys = [wire[0].inputKeys[0], wire[0].inputKeys[0]];
  expect(readRecordedAssemblyOrder(wire, canonical(wire))).toBeNull();
});
