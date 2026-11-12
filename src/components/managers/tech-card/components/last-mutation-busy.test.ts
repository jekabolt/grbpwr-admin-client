import { describe, expect, it, vi } from 'vitest';

import {
  dropRedoTop,
  emptyHistory,
  finishUndo,
  issueStepWrite,
  peekRedo,
  peekUndo,
  pushUndo,
  record,
  runRemovalSequence,
  runStepMutation,
  runStepWrite,
  undoStep,
  waitForIdle,
  type HistoryEntry,
} from './last-mutation';

describe('runStepMutation', () => {
  it('ignores a second gesture until the first async history change settles', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = { current: false };
    const rendered: boolean[] = [];
    const gesture = vi.fn(async () => {
      expect(transaction.current).toBe(true);
      await pending;
      return true;
    });

    const first = runStepMutation(transaction, (active) => rendered.push(active), gesture);
    expect(transaction.current).toBe(true);
    await expect(
      runStepMutation(transaction, (active) => rendered.push(active), gesture),
    ).resolves.toBeUndefined();
    expect(gesture).toHaveBeenCalledTimes(1);

    release();
    await expect(first).resolves.toBe(true);
    expect(transaction.current).toBe(false);
    expect(rendered).toEqual([true, false]);
    await expect(
      runStepMutation(
        transaction,
        () => undefined,
        async () => false,
      ),
    ).resolves.toBe(false);
  });

  it('releases the guard after a failed gesture', async () => {
    const transaction = { current: false };

    await expect(
      runStepMutation(
        transaction,
        () => undefined,
        async () => {
          throw new Error('failed');
        },
      ),
    ).rejects.toThrow('failed');
    await expect(
      runStepMutation(
        transaction,
        () => undefined,
        async () => 'next',
      ),
    ).resolves.toBe('next');
  });

  it('keeps the redo record while an ordinary edit is blocked by the transaction ref', async () => {
    type Row = { historyKey: string };
    const entry: HistoryEntry<Row> = {
      kind: 'append',
      index: 0,
      fieldId: 'field-a',
      row: { historyKey: 'step-a' },
      label: 'append step',
    };
    let history = undoStep(record(emptyHistory<Row>(), entry));
    const transaction = { current: false };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const redo = runStepMutation(
      transaction,
      () => undefined,
      async () => {
        await pending;
        history = pushUndo(dropRedoTop(history), entry);
      },
    );
    const ordinaryEdit = () => {
      if (transaction.current) return;
      history = emptyHistory<Row>();
    };

    ordinaryEdit();
    expect(peekRedo(history)).toBe(entry);
    release();
    await redo;
    expect(peekUndo(history)).toBe(entry);
  });
});

describe('step transaction write gate', () => {
  it('refuses ordinary writes while the owner can issue the transaction write', async () => {
    const transaction = { current: true };
    const owner = { current: false };
    const write = vi.fn(async () => true);
    const onRefused = vi.fn();
    const guarded = () => runStepWrite({ transaction, owner, write, refused: false, onRefused });

    await expect(guarded()).resolves.toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledOnce();

    await expect(issueStepWrite(owner, guarded)).resolves.toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(owner.current).toBe(false);
  });
});

describe('waitForIdle', () => {
  it('settles from the subscription and cleans it up', async () => {
    let active = true;
    let notify: () => void = () => undefined;
    const unsubscribe = vi.fn();
    const waiting = waitForIdle({
      busy: () => active,
      subscribe: (next) => {
        notify = next;
        return unsubscribe;
      },
      timeoutMs: 20_000,
    });

    active = false;
    notify();
    await expect(waiting).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('times out and releases its subscription', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const waiting = waitForIdle({
      busy: () => true,
      subscribe: () => unsubscribe,
      timeoutMs: 20_000,
    });

    await vi.advanceTimersByTimeAsync(20_000);
    await expect(waiting).resolves.toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('runRemovalSequence', () => {
  it('validates before teardown and reads ownership immediately before deletion', async () => {
    const order: string[] = [];

    await expect(
      runRemovalSequence({
        prepare: () => {
          order.push('validate');
          return { key: 'step' };
        },
        teardown: async () => {
          order.push('teardown');
          return true;
        },
        settle: async () => {
          order.push('settle');
        },
        prepareDeletion: () => {
          order.push('ownership');
          return ['seam'];
        },
        deleteRows: async (_, settled) => {
          expect(settled).toBe(true);
          order.push('delete');
          return true;
        },
        finish: () => order.push('finish'),
      }),
    ).resolves.toBe(true);
    expect(order).toEqual(['validate', 'teardown', 'settle', 'ownership', 'delete', 'finish']);
  });

  it('does no destructive work when validation refuses', async () => {
    const teardown = vi.fn(async () => true);
    const deleteRows = vi.fn(async () => true);
    const finish = vi.fn();

    await expect(
      runRemovalSequence({
        prepare: () => null,
        teardown,
        prepareDeletion: () => [],
        deleteRows,
        finish,
      }),
    ).resolves.toBe(false);
    expect(teardown).not.toHaveBeenCalled();
    expect(deleteRows).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it('waits for in-flight writers after teardown and then finishes one-way', async () => {
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const order: string[] = [];
    const sequence = runRemovalSequence({
      prepare: () => {
        order.push('validate');
        return { key: 'step' };
      },
      teardown: async () => {
        order.push('teardown');
        return true;
      },
      settle: async () => {
        order.push('settle');
        await pending;
      },
      prepareDeletion: () => {
        order.push('ownership');
        return ['seam'];
      },
      deleteRows: async (_, settled) => {
        expect(settled).toBe(true);
        order.push('delete refused');
        return false;
      },
      finish: () => order.push('finish'),
    });

    await Promise.resolve();
    expect(order).toEqual(['validate', 'teardown', 'settle']);
    settle();
    await expect(sequence).resolves.toBe(true);
    expect(order).toEqual([
      'validate',
      'teardown',
      'settle',
      'ownership',
      'delete refused',
      'finish',
    ]);
  });

  it('continues one-way after the settle timeout result', async () => {
    const deleteRows = vi.fn(async () => false);
    const finish = vi.fn();

    await expect(
      runRemovalSequence({
        prepare: () => ({ key: 'step' }),
        teardown: async () => true,
        settle: async () => false,
        prepareDeletion: () => ['seam'],
        deleteRows,
        finish,
      }),
    ).resolves.toBe(true);
    expect(deleteRows).toHaveBeenCalledWith(['seam'], false);
    expect(finish).toHaveBeenCalledOnce();
  });
});

describe('finishUndo', () => {
  type Row = { historyKey: string };
  type RemoveEntry = Extract<HistoryEntry<Row>, { kind: 'remove' }>;
  const removal = (historyKey: string): RemoveEntry => ({
    kind: 'remove',
    historyKey,
    row: { historyKey },
    before: [historyKey],
    issues: [],
    pieceKeys: [],
    seamKeys: [],
    bomLineKeys: [],
    label: `remove ${historyKey}`,
  });

  it('keeps the undo record on refusal and never moves an unrelated top record', () => {
    const expected = removal('a');
    const history = record(emptyHistory<Row>(), expected);
    expect(finishUndo(history, expected, false)).toBe(history);
    expect(peekUndo(history)).toBe(expected);

    const unrelated = removal('b');
    const changed = record(history, unrelated);
    expect(finishUndo(changed, expected, true)).toBe(changed);
    expect(peekUndo(changed)).toBe(unrelated);
  });
});

describe('runRemovalSequence delete timeout', () => {
  it('finishes the removal when the seam delete never answers', async () => {
    vi.useFakeTimers();
    const finish = vi.fn();
    const done = runRemovalSequence({
      deleteTimeoutMs: 1000,
      prepare: () => 'step',
      teardown: async () => true,
      prepareDeletion: () => 'rows',
      deleteRows: () => new Promise<boolean>(() => undefined),
      finish,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toBe(true);
    expect(finish).toHaveBeenCalledWith('step', 'rows');
    vi.useRealTimers();
  });

  it('finishes the removal when the seam delete throws', async () => {
    const finish = vi.fn();
    await expect(
      runRemovalSequence({
        prepare: () => 'step',
        teardown: async () => true,
        prepareDeletion: () => 'rows',
        deleteRows: () => Promise.reject(new Error('network')),
        finish,
      }),
    ).resolves.toBe(true);
    expect(finish).toHaveBeenCalledOnce();
  });
});
