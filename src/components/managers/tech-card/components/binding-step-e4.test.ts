import type { StoredSeam } from 'lib/seams';
import { describe, expect, it } from 'vitest';

import {
  bindingUndoLinks,
  nextBindingStrip,
  removeBindingStripsForSeam,
  runBindingTeardown,
  teardownBindingStrips,
} from './binding-step';
import type { CutStrip } from './cut-strip-editor/use-cut-strip';
import { removeUndoRefusal } from './last-mutation';

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

const row = (seamKey: string, stripKey: string) =>
  ({ seamKey, sideA: [{ piece: 'cloth' }], sideB: [{ piece: stripKey }] }) as StoredSeam;

describe('binding E4', () => {
  it('the last edge of a line going drops the step link to that line', () => {
    const operation = {
      work: 'bind_tape_edge',
      inputKeys: ['cloth', 'strip-a', 'strip-b'],
      bomLineKeys: ['bias', 'piping', 'interlining'],
      seamKeys: ['s-a', 's-b'],
    };
    const strips = [strip('strip-a', 'bias', 's-a'), strip('strip-b', 'piping', 's-b')];
    const result = removeBindingStripsForSeam(operation, strips, 's-a');
    expect(result?.bomLineKeys).toEqual(['piping', 'interlining']);
  });

  it('a line keeps its link while another edge of it stays', () => {
    const operation = {
      work: 'bind_tape_edge',
      inputKeys: ['strip-a', 'strip-a2'],
      bomLineKeys: ['bias'],
    };
    const strips = [strip('strip-a', 'bias', 's-a'), strip('strip-a2', 'bias', 's-a2')];
    expect(removeBindingStripsForSeam(operation, strips, 's-a')?.bomLineKeys).toEqual(['bias']);
  });

  it('later edges keep the fit % set on the first edge', () => {
    const base = { ...strip('strip-a', 'bias', 's-a'), fitPct: '95' };
    expect(nextBindingStrip(base, [1]).fitPct).toBe('95');
    expect(nextBindingStrip({ ...base, fitPct: '' }, [1]).fitPct).toBe('100');
  });

  it('undo of a deleted B1 step is not refused because of its own binding strips', () => {
    const operations = [
      {
        work: 'bind_tape_edge',
        inputKeys: ['cloth', 'strip-a'],
        bomLineKeys: ['bias', 'thread'],
        seamKeys: ['s-a', 's-plain'],
      },
    ];
    const cutStrips = [strip('strip-a', 'bias', 's-a')];
    const seamRows = [row('s-a', 'strip-a'), row('s-plain', 'other')];
    const links = bindingUndoLinks({ cutStrips, operations, seamRows }, 0);
    expect(links).toEqual({ inputKeys: ['cloth'], seamKeys: ['s-plain'], bomLineKeys: ['thread'] });

    // What the card holds after the teardown ran.
    const plan = teardownBindingStrips({ cutStrips, operations, seamRows }, { stepIndexes: [0] });
    const after = {
      rowKeys: [],
      pieceKeys: new Set(['cloth', ...plan.strips.map((s) => s.lineKey ?? '')]),
      seamKeys: new Set(['s-plain']),
      bomLineKeys: new Set(['bias', 'thread']),
    };
    const rec = {
      kind: 'remove' as const,
      historyKey: 'h1',
      row: {},
      before: ['h1'],
      issues: [],
      pieceKeys: links.inputKeys,
      seamKeys: links.seamKeys,
      bomLineKeys: links.bomLineKeys,
      label: 'remove',
    };
    expect(removeUndoRefusal(rec, after)).toBeNull();
  });

  it('teardown writes a plan read after the seam RPC, not before it', async () => {
    let cutStrips: CutStrip[] = [strip('strip-a', 'bias', 's-a'), strip('plain', 'fabric')];
    let operations = [
      { work: 'bind_tape_edge', inputKeys: ['cloth', 'strip-a'], seamKeys: ['s-a'] },
    ];
    const ok = await runBindingTeardown(
      {
        read: () => ({ cutStrips, operations }),
        seamRows: [row('s-a', 'strip-a')],
        seamReady: true,
        // Another writer edits a strip while the seam delete is in flight.
        removeRows: async () => {
          cutStrips = cutStrips.map((s) => (s.lineKey === 'plain' ? { ...s, widthMm: '12' } : s));
          return true;
        },
        write: (plan) => {
          cutStrips = plan.strips;
          for (const patch of plan.operations) {
            operations = operations.map((op, i) =>
              i === patch.index
                ? { ...op, inputKeys: patch.inputKeys, seamKeys: patch.seamKeys }
                : op,
            );
          }
        },
      },
      { stepIndexes: [0] },
    );
    expect(ok).toBe(true);
    expect(cutStrips.map((s) => [s.lineKey, s.widthMm])).toEqual([['plain', '12']]);
    expect(operations[0]).toMatchObject({ inputKeys: ['cloth'], seamKeys: [] });
  });

  it('a refused seam RPC writes nothing', async () => {
    let wrote = false;
    const ok = await runBindingTeardown(
      {
        read: () => ({
          cutStrips: [strip('strip-a', 'bias', 's-a')],
          operations: [{ work: 'bind_tape_edge', inputKeys: ['strip-a'], seamKeys: ['s-a'] }],
        }),
        seamRows: [row('s-a', 'strip-a')],
        seamReady: true,
        removeRows: async () => false,
        write: () => {
          wrote = true;
        },
      },
      { stepIndexes: [0] },
    );
    expect(ok).toBe(false);
    expect(wrote).toBe(false);
  });
});
