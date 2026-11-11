import { describe, expect, it } from 'vitest';

import type { BindingOperation } from '../binding-step';
import type { CutStrip } from '../cut-strip-editor/use-cut-strip';
import { stepBindingNorm } from './step-norm';

const BASE_SIZE_ID = 7;
const BOM_LINE_KEY = '01JSTEPBINDINGLINE000000001';

const operation = (stripKey: string): BindingOperation => ({
  work: 'bind_tape_edge',
  inputKeys: [stripKey],
  bomLineKeys: [BOM_LINE_KEY],
});

const strip = ({
  lineKey,
  seamMm,
  manualCutMm = '',
  widthMm = '30',
}: {
  lineKey: string;
  seamMm?: string;
  manualCutMm?: string;
  widthMm?: string;
}): CutStrip =>
  ({
    placement: '__binding__',
    lineKey,
    bomLineKey: BOM_LINE_KEY,
    lengthMode: 'from_seam',
    seamKey: `seam-${lineKey}`,
    fitPct: '100',
    overlapMm: '0',
    widthMm,
    qty: 1,
    sizes: [{ sizeId: BASE_SIZE_ID, seamMm: seamMm ?? '', manualCutMm }],
  }) as CutStrip;

const tapeLine = {
  lineKey: BOM_LINE_KEY,
  section: 'TECH_CARD_BOM_SECTION_TRIM',
  unit: 'm',
};

const rollLine = {
  lineKey: BOM_LINE_KEY,
  section: 'TECH_CARD_BOM_SECTION_LINING',
  purpose: 'TECH_CARD_BOM_PURPOSE_BINDING',
  unit: 'm',
  fabricWidth: '145',
};

describe('a binding step norm', () => {
  it("counts only this B1 step's strips when two steps use the same tape line", () => {
    const first = strip({ lineKey: 'strip-a', seamMm: '1200' });
    const second = strip({ lineKey: 'strip-b', seamMm: '600' });

    expect(
      stepBindingNorm({
        operation: operation('strip-a'),
        strips: [first, second],
        line: tapeLine,
        baseSizeId: BASE_SIZE_ID,
      }),
    ).toEqual({ kind: 'metres', m: 1.2 });
    expect(
      stepBindingNorm({
        operation: operation('strip-b'),
        strips: [first, second],
        line: tapeLine,
        baseSizeId: BASE_SIZE_ID,
      }),
    ).toEqual({ kind: 'metres', m: 0.6 });
  });

  it('divides a roll strip by the whole lanes in the usable width', () => {
    expect(
      stepBindingNorm({
        operation: operation('strip-a'),
        strips: [strip({ lineKey: 'strip-a', seamMm: '1200', widthMm: '30' })],
        line: rollLine,
        baseSizeId: BASE_SIZE_ID,
      }),
    ).toEqual({ kind: 'metres', m: 0.025 });
  });

  it('reports no width for a roll strip without a strip width', () => {
    expect(
      stepBindingNorm({
        operation: operation('strip-a'),
        strips: [strip({ lineKey: 'strip-a', seamMm: '1200', widthMm: '' })],
        line: rollLine,
        baseSizeId: BASE_SIZE_ID,
      }),
    ).toEqual({ kind: 'no_width' });
  });

  it('is unknown when the base size has neither a seam length nor a manual cut', () => {
    expect(
      stepBindingNorm({
        operation: operation('strip-a'),
        strips: [strip({ lineKey: 'strip-a' })],
        line: tapeLine,
        baseSizeId: BASE_SIZE_ID,
      }),
    ).toEqual({ kind: 'unknown' });
  });

  it('uses a manual cut instead of the seam-derived cut', () => {
    expect(
      stepBindingNorm({
        operation: operation('strip-a'),
        strips: [strip({ lineKey: 'strip-a', seamMm: '1200', manualCutMm: '700' })],
        line: tapeLine,
        baseSizeId: BASE_SIZE_ID,
      }),
    ).toEqual({ kind: 'metres', m: 0.7 });
  });
});
