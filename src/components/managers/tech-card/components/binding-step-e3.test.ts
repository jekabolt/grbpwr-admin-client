import { describe, expect, it } from 'vitest';

import { bindingLinesOfStep, bindingStripTarget, chosenBindingLine } from './binding-step';
import type { CutStrip } from './cut-strip-editor/use-cut-strip';

const strip = (lineKey: string, bomLineKey: string, seamKey = ''): CutStrip =>
  ({
    lineKey,
    bomLineKey,
    placement: '__binding__',
    lengthMode: 'from_seam',
    seamKey,
    fitPct: '100',
    overlapMm: '30',
    qty: 1,
    sizes: [{ sizeId: 1, seamMm: '', manualCutMm: '' }],
  }) as CutStrip;

const operation = {
  work: 'bind_tape_edge',
  inputKeys: ['cloth', 'strip-a', 'strip-b', 'strip-c'],
  bomLineKeys: ['interlining', 'bias', 'piping'],
  seamKeys: ['s-a'],
};
// bias got a second edge after piping was added: strip order is not the order lines were added.
const strips = [
  strip('strip-a', 'bias', 's-a'),
  strip('strip-b', 'piping'),
  strip('strip-c', 'bias', 's-c'),
];

describe('binding E3: two binding lines in one step', () => {
  it('lists the step binding lines once each, in the order they were added', () => {
    expect(bindingLinesOfStep(operation, strips)).toEqual(['bias', 'piping']);
  });

  it('defaults to the last added line and keeps a choice while it is still there', () => {
    const lines = ['bias', 'piping'];
    expect(chosenBindingLine(lines, '')).toBe('piping');
    expect(chosenBindingLine(lines, 'bias')).toBe('bias');
    expect(chosenBindingLine(lines, 'gone')).toBe('piping');
    expect(chosenBindingLine([], 'bias')).toBe('');
  });

  it('a new edge goes to the chosen line', () => {
    expect(bindingStripTarget(operation, strips, [1], 'piping')).toEqual({
      strip: strips[1],
      fresh: false,
    });
    const bias = bindingStripTarget(operation, strips, [1], 'bias');
    expect(bias?.fresh).toBe(true);
    expect(bias?.strip.bomLineKey).toBe('bias');
  });

  it('without a choice the target is the same as before', () => {
    expect(bindingStripTarget(operation, strips, [1])).toEqual({ strip: strips[1], fresh: false });
  });
});
