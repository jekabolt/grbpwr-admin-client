import { describe, expect, it } from 'vitest';

import {
  assemblyReleaseCheck,
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyPiece,
} from '../assembly-frontier';
import { operationWriteOrder, type TechCardFormData } from '../schema';
import { STRIP, WAISTBAND } from './strip.fixture';

const POCKET = '01M2R89631POCKET0000000000';
const FRONT = '01M2R89631FRONT00000000000';

const CLOTH = [
  { lineKey: WAISTBAND, name: 'waistband' },
  { lineKey: POCKET, name: 'pocket' },
  { lineKey: FRONT, name: 'front' },
];
const WITH_STRIP: AssemblyPiece[] = [...CLOTH, { lineKey: STRIP, name: 'rubber', strip: true }];

function run(pieces: AssemblyPiece[], steps: readonly [readonly string[], string][]) {
  const keys = new Set(pieces.map((piece) => piece.lineKey));
  const read = steps.map(([inputKeys, output]) => ({
    inputs: classifyAssemblyInputs(keys, [...inputKeys]),
    outputUnitKey: output,
    outputUnitName: output,
    assemblyBlockDetached: false,
  }));
  const result = assemblySweep(pieces, read);
  return { violations: result.violations, release: assemblyReleaseCheck(pieces, read, result) };
}

describe('the sweep reads a strip as a piece, never as a unit', () => {
  const sewn: readonly [readonly string[], string][] = [
    [[WAISTBAND, STRIP], 'belt'],
    [[POCKET, FRONT], 'body'],
    [['belt', 'body'], 'garment'],
  ];

  it('takes it in a step with no violation', () => {
    const { violations, release } = run(WITH_STRIP, sewn);
    expect(violations).toEqual([]);
    expect(release).toEqual([]);
  });

  it('would dangle without its row: the guard is real', () => {
    const { violations } = run(CLOTH, sewn);
    expect(violations.map((violation) => violation.detail)).toContain('unknown-key');
  });

  it('finishes the garment although no step takes it', () => {
    const { violations, release } = run(WITH_STRIP, [
      [[WAISTBAND, POCKET], 'body'],
      [['body', FRONT], 'garment'],
    ]);
    expect(violations).toEqual([]);
    expect(release).toEqual([]);
  });

  it('still names a piece of cloth no step takes, and not the strip', () => {
    const { release } = run(WITH_STRIP, [[[WAISTBAND, POCKET], 'garment']]);
    expect(release.map((violation) => violation.detail)).toEqual(['unreached-pieces']);
    expect(release[0].message).toContain('front');
    expect(release[0].message).not.toContain('rubber');
  });
});

describe('the write order', () => {
  const operations = [
    { inputKeys: [WAISTBAND, STRIP], outputUnitKey: 'belt', outputUnitName: 'belt' },
    { inputKeys: [POCKET, FRONT], outputUnitKey: 'body', outputUnitName: 'body' },
    { inputKeys: ['belt'], outputUnitKey: '', outputUnitName: '' },
    { inputKeys: ['belt', 'body'], outputUnitKey: 'garment', outputUnitName: 'garment' },
  ];
  const data = (cutStrips: { lineKey: string }[]) =>
    ({ operations, pieces: CLOTH, cutStrips }) as unknown as Pick<
      TechCardFormData,
      'operations' | 'pieces'
    >;

  it('keeps a step with a strip with its block, as it does a step of cloth', () => {
    expect(operationWriteOrder(data([{ lineKey: STRIP }]))).toEqual([0, 2, 1, 3]);
  });

  it('falls back to the row order if the strip is not known: the guard is real', () => {
    expect(operationWriteOrder(data([]))).toEqual([0, 1, 2, 3]);
  });
});
