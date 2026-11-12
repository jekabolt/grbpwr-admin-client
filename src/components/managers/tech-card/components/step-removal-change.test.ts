import { describe, expect, it, vi } from 'vitest';

import type { StoredPose, StoredSeam } from 'lib/seams';

import type { SeamChangeInput, SeamChangeResult } from './assembly-seams/seam-change';
import {
  linkedStepRows,
  runStepRemovalChange,
  runStepRemovalRedoChange,
  runStepRemovalUndoChange,
  type StepRemovalRows,
  type StepRemovalSnapshot,
} from './step-removal-change';

type Row = { historyKey: string; seamKeys: string[]; poseKeys: string[] };

const seam = (seamKey: string): StoredSeam => ({
  seamKey,
  status: 'confirmed',
  kind: 'edge',
  direction: 'same',
  source: 'manual',
  sideA: [],
  sideB: [],
  anchoredSize: '',
  note: '',
});

const pose = (seamKey: string): StoredPose => ({ ...seam(seamKey), kind: 'pose' });

const build = (input: SeamChangeInput) => (typeof input === 'function' ? input() : input);

const changed = (deletedKeys: string[] = []): SeamChangeResult => ({
  ok: true,
  keyMap: new Map(),
  deletedKeys,
  lockVersion: 2,
});

const removed = (why: string): SeamChangeResult => ({ ok: false, why });

const middleSnapshot = (
  rows: StepRemovalRows = { seams: [seam('seam-b')], poses: [pose('pose-b')] },
): StepRemovalSnapshot<Row> => ({
  step: { historyKey: 'b' },
  row: { historyKey: 'b', seamKeys: ['seam-b'], poseKeys: ['pose-b'] },
  rows,
});

describe('step removal through one seam change', () => {
  it('undo inserts the invalidating middle step before one upsert and link change', async () => {
    const form: Row[] = [
      { historyKey: 'a', seamKeys: [], poseKeys: [] },
      { historyKey: 'c', seamKeys: [], poseKeys: [] },
    ];
    const order: string[] = [];
    let history: 'undo' | 'redo' = 'undo';
    const changes: ReturnType<typeof build>[] = [];
    const serverRows: Array<StoredSeam | StoredPose> = [];

    await expect(
      runStepRemovalUndoChange(middleSnapshot(), {
        validate: () => null,
        insert: (row) => {
          order.push('insert');
          form.splice(1, 0, row);
          return { at: 1 };
        },
        change: async (input) => {
          order.push('change');
          expect(form[1]).toEqual({ historyKey: 'b', seamKeys: [], poseKeys: [] });
          const change = build(input);
          changes.push(change);
          serverRows.push(...(change.upsert ?? []));
          form[1] = {
            ...form[1],
            seamKeys:
              change.link?.filter((link) => link.seamKey === 'seam-b').map((l) => l.seamKey) ?? [],
            poseKeys:
              change.link?.filter((link) => link.seamKey === 'pose-b').map((l) => l.seamKey) ?? [],
          };
          return changed();
        },
        remove: ({ at }) => form.splice(at, 1),
        finishHistory: () => {
          history = 'redo';
        },
        select: ({ at }) => order.push(`select ${at}`),
        refuse: vi.fn(),
      }),
    ).resolves.toBe(true);

    expect(order).toEqual(['insert', 'change', 'select 1']);
    expect(changes).toHaveLength(1);
    expect(changes[0].upsert?.map((row) => row.seamKey)).toEqual(['seam-b', 'pose-b']);
    expect(changes[0].link?.map((link) => link.seamKey)).toEqual(['seam-b', 'pose-b']);
    expect(form[1]).toEqual({
      historyKey: 'b',
      seamKeys: ['seam-b'],
      poseKeys: ['pose-b'],
    });
    expect(serverRows.map((row) => row.seamKey)).toEqual(['seam-b', 'pose-b']);
    expect(history).toBe('redo');
  });

  it('redo immediately detaches once and records only the row deleted again', async () => {
    const snapshot = middleSnapshot();
    const form = [structuredClone(snapshot.row)];
    let undoRows: StepRemovalRows | null = null;
    const changes: ReturnType<typeof build>[] = [];
    const serverRows: Array<StoredSeam | StoredPose> = [seam('seam-b'), pose('pose-b')];

    await expect(
      runStepRemovalRedoChange({
        settle: async () => true,
        snapshot: () => snapshot,
        change: async (input) => {
          changes.push(build(input));
          serverRows.splice(0, serverRows.length);
          return changed(['seam-b', 'pose-b']);
        },
        remove: () => form.splice(0, 1),
        record: (_, rows) => {
          undoRows = rows;
        },
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      detach: [
        { step: { historyKey: 'b' }, seamKey: 'seam-b' },
        { step: { historyKey: 'b' }, seamKey: 'pose-b' },
      ],
    });
    expect(form).toEqual([]);
    expect(serverRows).toEqual([]);
    expect(undoRows).toEqual({ seams: [seam('seam-b')], poses: [pose('pose-b')] });
  });

  it('remove refuses an unrelated invalid form without removing or recording', async () => {
    const snapshot = middleSnapshot();
    const form = [structuredClone(snapshot.row)];
    const requests: unknown[] = [];
    const flush = vi.fn(() => false);
    const record = vi.fn();
    const refuse = vi.fn();

    await expect(
      runStepRemovalChange({
        settle: async () => true,
        snapshot: () => snapshot,
        change: async (input) => {
          if (!flush()) return removed('unrelated invalid');
          requests.push(build(input));
          return changed();
        },
        remove: () => form.splice(0, 1),
        record,
        refuse,
        unsettled: 'still saving',
      }),
    ).resolves.toBe(false);

    expect(requests).toEqual([]);
    expect(flush).toHaveBeenCalledOnce();
    expect(form).toEqual([snapshot.row]);
    expect(record).not.toHaveBeenCalled();
    expect(refuse).toHaveBeenCalledWith('unrelated invalid');
  });

  it('undo of an unrelated invalid form takes the provisional step back out', async () => {
    const snapshot = middleSnapshot();
    const form: Row[] = [];
    let history: 'undo' | 'redo' = 'undo';
    const requests: unknown[] = [];
    const flush = vi.fn(() => false);
    const refuse = vi.fn();

    await expect(
      runStepRemovalUndoChange(snapshot, {
        validate: () => null,
        insert: (row) => {
          form.push(row);
          return row.historyKey;
        },
        change: async (input) => {
          if (!flush()) return removed('unrelated invalid');
          requests.push(build(input));
          return changed();
        },
        remove: (historyKey) =>
          form.splice(
            form.findIndex((row) => row.historyKey === historyKey),
            1,
          ),
        finishHistory: () => {
          history = 'redo';
        },
        select: vi.fn(),
        refuse,
      }),
    ).resolves.toBe(false);

    expect(form).toEqual([]);
    expect(requests).toEqual([]);
    expect(flush).toHaveBeenCalledOnce();
    expect(history).toBe('undo');
    expect(snapshot.rows).toEqual({ seams: [seam('seam-b')], poses: [pose('pose-b')] });
    expect(refuse).toHaveBeenCalledWith('unrelated invalid');
  });

  it('server undo refusals roll back cleanly and each retained record can be retried', async () => {
    for (const why of ['lock_version_moved', 'contradicts_upsert']) {
      const snapshot = middleSnapshot();
      const form: Row[] = [];
      let history: 'undo' | 'redo' = 'undo';
      const answers = [removed(why), changed()];
      const refuse = vi.fn();
      const io = {
        validate: () => null,
        insert: (row: Row) => {
          form.push(row);
          return row.historyKey;
        },
        change: async (input: SeamChangeInput) => {
          const answer = answers.shift()!;
          if (answer.ok) {
            const change = build(input);
            form[0].seamKeys =
              change.link
                ?.filter((link) => link.seamKey === 'seam-b')
                .map((link) => link.seamKey) ?? [];
            form[0].poseKeys =
              change.link
                ?.filter((link) => link.seamKey === 'pose-b')
                .map((link) => link.seamKey) ?? [];
          }
          return answer;
        },
        remove: (historyKey: string) =>
          form.splice(
            form.findIndex((row) => row.historyKey === historyKey),
            1,
          ),
        finishHistory: () => {
          history = 'redo' as const;
        },
        select: vi.fn(),
        refuse,
      };

      await expect(runStepRemovalUndoChange(snapshot, io)).resolves.toBe(false);
      expect(form).toEqual([]);
      expect(history).toBe('undo');
      expect(refuse).toHaveBeenLastCalledWith(why);

      await expect(runStepRemovalUndoChange(snapshot, io)).resolves.toBe(true);
      expect(form).toEqual([{ historyKey: 'b', seamKeys: ['seam-b'], poseKeys: ['pose-b'] }]);
      expect(history).toBe('redo');
    }
  });

  it('shared seam is detached without a saved row, then linked without an upsert', async () => {
    const shared = seam('shared');
    const removedStep: Row = { historyKey: 'b', seamKeys: ['shared'], poseKeys: [] };
    const form: Row[] = [removedStep, { historyKey: 'c', seamKeys: ['shared'], poseKeys: [] }];
    const serverRows = [shared];
    let undoRows: StepRemovalRows = { seams: [], poses: [] };
    const snapshot = (): StepRemovalSnapshot<Row> => ({
      step: { historyKey: 'b' },
      row: structuredClone(removedStep),
      rows: linkedStepRows(removedStep, { seams: [shared], poses: [] }),
    });

    await expect(
      runStepRemovalChange({
        settle: async () => true,
        snapshot,
        change: async (input) => {
          expect(build(input).detach).toEqual([{ step: { historyKey: 'b' }, seamKey: 'shared' }]);
          return changed([]);
        },
        remove: () => form.splice(0, 1),
        record: (_, rows) => {
          undoRows = rows;
        },
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    expect(undoRows).toEqual({ seams: [], poses: [] });
    expect(serverRows).toEqual([shared]);
    expect(form).toEqual([{ historyKey: 'c', seamKeys: ['shared'], poseKeys: [] }]);

    await expect(
      runStepRemovalUndoChange(
        { ...snapshot(), rows: undoRows },
        {
          validate: () => null,
          insert: (row) => {
            form.unshift(row);
            return 0;
          },
          change: async (input) => {
            const change = build(input);
            expect(change.upsert).toEqual([]);
            expect(change.link).toEqual([{ step: { historyKey: 'b' }, seamKey: 'shared' }]);
            form[0].seamKeys = ['shared'];
            return changed();
          },
          remove: (at) => form.splice(at, 1),
          finishHistory: vi.fn(),
          select: vi.fn(),
          refuse: vi.fn(),
        },
      ),
    ).resolves.toBe(true);

    expect(form[0]).toEqual({ historyKey: 'b', seamKeys: ['shared'], poseKeys: [] });
    expect(form[1]).toEqual({ historyKey: 'c', seamKeys: ['shared'], poseKeys: [] });
  });

  it('binding step: strip seams are deleted in the same change and never saved for undo', async () => {
    const changes: ReturnType<typeof build>[] = [];
    const recorded: StepRemovalRows[] = [];
    const snapshot: StepRemovalSnapshot<Row> = {
      ...middleSnapshot({ seams: [seam('seam-b')], poses: [] }),
      row: { historyKey: 'b', seamKeys: ['seam-b'], poseKeys: [] },
      alsoDelete: ['strip-seam'],
    };
    const ok = await runStepRemovalChange<Row, StepRemovalSnapshot<Row>>({
      settle: async () => true,
      snapshot: () => snapshot,
      change: async (input) => {
        changes.push(build(input));
        return changed(['strip-seam', 'seam-b']);
      },
      remove: () => undefined,
      record: (_, rows) => recorded.push(rows),
      refuse: () => undefined,
      unsettled: 'still saving',
    });
    expect(ok).toBe(true);
    expect(changes).toEqual([
      { delete: ['strip-seam'], detach: [{ step: { historyKey: 'b' }, seamKey: 'seam-b' }] },
    ]);
    expect(recorded).toEqual([{ seams: [seam('seam-b')], poses: [] }]);
  });
});
