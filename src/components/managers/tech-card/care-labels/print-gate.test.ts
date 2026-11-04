import { describe, expect, it } from 'vitest';
import { hole, type HoleCode } from './holes';
import { printGate, printSource, runCaption } from './print-gate';
import type { Readiness } from './readiness';

const own = (colorwayId: number, sizeId: number) => ({
  colorwayId,
  sizeId,
  libraryFileId: 5,
  sourceHash: '',
});
const ready = (holes: Record<number, HoleCode[]> = {}, global: HoleCode[] = []): Readiness =>
  ({
    colorways: [1, 2].map((colorwayId) => ({
      colorwayId,
      holes: (holes[colorwayId] ?? []).map((c) => hole(c, c)),
    })),
    global: global.map((c) => hole(c, c)),
  }) as never;
const gate = (over: Partial<Parameters<typeof printGate>[0]>) =>
  printGate({
    choice: 'built',
    files: [],
    readiness: ready(),
    colorwayIds: [1, 2],
    sizeIds: [10, 11],
    ...over,
  });

describe('printGate', () => {
  it('nothing in the way', () => {
    const g = gate({});
    expect(g.reason).toBeNull();
    expect([...g.blocked]).toEqual([]);
  });

  it('a text hole holds its colour only', () => {
    const g = gate({ readiness: ready({ 1: ['no-country'] }) });
    expect(g.reason).toBe('no text');
    expect([...g.blocked]).toEqual([1]);
  });

  it('a colour of own files only prints whatever its text says', () => {
    const g = gate({
      choice: 'cell',
      files: [own(1, 10), own(1, 11)],
      readiness: ready({ 1: ['no-country'] }),
    });
    expect(g.reason).toBeNull();
    expect([...g.blocked]).toEqual([]);
  });

  it('one own size does not free the colour', () => {
    const g = gate({
      choice: 'cell',
      files: [own(1, 10)],
      readiness: ready({ 1: ['no-country'] }),
    });
    expect([...g.blocked]).toEqual([1]);
  });

  it('one file with no file holds everything', () => {
    const g = gate({ choice: 'one' });
    expect(g.reason).toBe('no file');
    expect([...g.blocked]).toEqual([1, 2]);
  });

  it('one file with its file does not read the text at all', () => {
    const g = gate({
      choice: 'one',
      files: [own(0, 0)],
      readiness: ready({ 1: ['no-country'], 2: ['no-country'] }, ['materials-unavailable']),
    });
    expect(g.reason).toBeNull();
    expect([...g.blocked]).toEqual([]);
  });

  it('data that has not arrived is said as data', () => {
    const g = gate({ readiness: ready({}, ['materials-unavailable']) });
    expect(g.reason).toBe('no data');
    expect([...g.blocked]).toEqual([1, 2]);
  });

  it('no fonts holds everything, in every mode', () => {
    for (const choice of ['built', 'one', 'cell'] as const) {
      const g = gate({ choice, files: [own(0, 0)], readiness: ready({}, ['fonts-failed']) });
      expect(g.reason).toBe('no fonts');
    }
  });
});

describe('printSource', () => {
  const plan = { id: 6, label: 'a', lines: [], status: 'PRODUCTION_RUN_STATUS_PLANNED' } as never;
  const closed = { id: 7, label: 'b', lines: [], status: 'PRODUCTION_RUN_STATUS_CLOSED' } as never;

  it('the run asked for, while it exists', () => {
    expect(printSource({ runId: 7 }, [plan, closed], false)).toBe(closed);
  });
  it('else the first that is still a plan', () => {
    expect(printSource({ runId: 99 }, [closed, plan], false)).toBe(plan);
    expect(printSource('manual', [closed, plan], false)).toBe(plan);
  });
  it('else manual', () => {
    expect(printSource('manual', [closed], false)).toBe('manual');
    expect(printSource('manual', [], false)).toBe('manual');
  });
  it('manual chosen now wins', () => {
    expect(printSource({ runId: 6 }, [plan], true)).toBe('manual');
  });
  it('caption counts the pieces', () => {
    const lines = [
      { productId: 1, sizeId: 1, plannedQty: 100 },
      { productId: 1, sizeId: 2, plannedQty: 20 },
    ];
    expect(runCaption({ id: 12, label: '', status: undefined, lines })).toBe('run 12 · 120 pcs');
  });
});
