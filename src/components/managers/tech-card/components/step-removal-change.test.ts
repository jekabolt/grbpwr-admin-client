import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EdgeAnchor, StoredPose, StoredSeam } from 'lib/seams';

import type { SeamChangeInput, SeamChangeResult } from './assembly-seams/seam-change';
import {
  clearStepRemovalOwed,
  hasStepRemovalOwed,
  markStepRemovalOwed,
  owedStepRemovals,
  type OwedStepRemoval,
} from './card-owed';
import {
  runStepRemovalChange,
  runStepRemovalCleanup,
  runStepRemovalRedoChange,
  runStepRemovalUndoChange,
  savedRemovalStillPresent,
  type StepRemovalRows,
  type StepRemovalSnapshot,
} from './step-removal-change';

type Row = {
  historyKey: string;
  operationNumber?: number;
  seamKeys: string[];
  poseKeys: string[];
  inputKeys?: string[];
};

const CARD = 100;

const seam = (seamKey: string): StoredSeam => ({
  seamKey,
  status: 'confirmed',
  kind: 'edge',
  direction: 'same',
  source: 'manual',
  sideA: [{ piece: 'A', edgeHint: seamKey, range: [0, 1] } as unknown as EdgeAnchor],
  sideB: [],
  anchoredSize: '',
  note: '',
});

const pose = (seamKey: string): StoredPose => ({ ...seam(seamKey), kind: 'pose' });

const build = (input: SeamChangeInput) => (typeof input === 'function' ? input() : input);

const changed = (keyMap: ReadonlyMap<string, string> = new Map()): SeamChangeResult => ({
  ok: true,
  keyMap,
  deletedKeys: [],
  lockVersion: 2,
});

const refused = (why: string): SeamChangeResult => ({ ok: false, why });

const middleSnapshot = (
  rows: StepRemovalRows = { seams: [seam('seam-b')], poses: [pose('pose-b')] },
): StepRemovalSnapshot<Row> => ({
  step: { historyKey: 'b' },
  row: {
    historyKey: 'b',
    operationNumber: 20,
    seamKeys: ['seam-b'],
    poseKeys: ['pose-b'],
  },
  rows,
  operationNumber: 20,
  candidateKeys: ['seam-b', 'pose-b'],
});

const owedOf = (snapshot: StepRemovalSnapshot<Row>): OwedStepRemoval => ({
  historyKey: snapshot.step.historyKey,
  operationNumber: snapshot.operationNumber,
  candidateKeys: [...snapshot.candidateKeys],
  at: 10,
});

describe('step removal sequencing', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('1. invalid middle removal, reload before body save: no seam request and debt is dropped', async () => {
    const snapshot = middleSnapshot();
    const form = [
      { historyKey: 'a', operationNumber: 10, seamKeys: [], poseKeys: [] },
      structuredClone(snapshot.row),
      { historyKey: 'c', operationNumber: 30, seamKeys: [], poseKeys: [], inputKeys: ['missing'] },
    ];
    const serverRows = structuredClone(snapshot.rows);
    const seamRequests = vi.fn();
    let history: StepRemovalSnapshot<Row> | null = null;

    await expect(
      runStepRemovalChange({
        settle: async () => true,
        snapshot: () => snapshot,
        cutHistory: () => undefined,
        remove: () => form.splice(1, 1),
        record: (record) => {
          history = record;
        },
        owe: (record) => markStepRemovalOwed(CARD, owedOf(record)),
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    history = null;
    expect(form[1].inputKeys).toEqual(['missing']);
    expect(seamRequests).not.toHaveBeenCalled();
    expect(serverRows).toEqual(snapshot.rows);
    const [reloaded] = owedStepRemovals(CARD);
    expect(savedRemovalStillPresent(reloaded, [snapshot.row])).toBe(true);
    clearStepRemovalOwed(CARD, reloaded.historyKey, reloaded.operationNumber);
    expect(owedStepRemovals(CARD)).toEqual([]);
    expect(history).toBeNull();
  });

  it('2. removes the erroneous step while the form is invalid, with zero seam requests', async () => {
    const snapshot = middleSnapshot();
    const form = [{ ...structuredClone(snapshot.row), inputKeys: ['missing'] }];
    const seamRequests = vi.fn();

    await expect(
      runStepRemovalChange({
        settle: async () => true,
        snapshot: () => snapshot,
        cutHistory: () => undefined,
        remove: () => form.splice(0, 1),
        record: vi.fn(),
        owe: vi.fn(),
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    expect(form).toEqual([]);
    expect(seamRequests).not.toHaveBeenCalled();
  });

  it('3. undo before the body save is a form edit with links and clears the debt', async () => {
    const snapshot = middleSnapshot();
    const form: Row[] = [];
    const change = vi.fn();
    markStepRemovalOwed(CARD, owedOf(snapshot));

    await expect(
      runStepRemovalUndoChange(snapshot, {
        alreadyBack: () => false,
        close: () => undefined,
        validate: () => null,
        settle: async () => true,
        rows: () => snapshot.rows,
        change,
        restore: (row) => {
          form.push(row);
          return 0;
        },
        clearOwed: () => clearStepRemovalOwed(CARD, 'b', 20),
        finishHistory: vi.fn(),
        select: vi.fn(),
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    expect(change).not.toHaveBeenCalled();
    expect(form).toEqual([snapshot.row]);
    expect(hasStepRemovalOwed(CARD, 'b', 20)).toBe(false);
  });

  it('4. undo after save and cleanup upserts once, restores links and moves history to redo', async () => {
    const snapshot = middleSnapshot();
    const form: Row[] = [];
    let history: 'undo' | 'redo' = 'undo';
    const requests: ReturnType<typeof build>[] = [];

    await expect(
      runStepRemovalUndoChange(snapshot, {
        alreadyBack: () => false,
        close: () => undefined,
        validate: () => null,
        settle: async () => true,
        rows: () => ({ seams: [], poses: [] }),
        change: async (input) => {
          requests.push(build(input));
          return changed();
        },
        restore: (row) => {
          form.push(row);
          return 0;
        },
        clearOwed: vi.fn(),
        finishHistory: () => {
          history = 'redo';
        },
        select: vi.fn(),
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0].upsert?.map((row) => row.seamKey)).toEqual(['seam-b', 'pose-b']);
    expect(form).toEqual([snapshot.row]);
    expect(history).toBe('redo');
  });

  it('5. reload after the save cleans once and deletes only rows unlinked in the saved body', async () => {
    const entry: OwedStepRemoval = {
      historyKey: 'b',
      operationNumber: 20,
      candidateKeys: ['own', 'shared'],
      at: 10,
    };
    markStepRemovalOwed(CARD, entry);
    const operations: Row[] = [
      { historyKey: 'c', operationNumber: 20, seamKeys: ['shared'], poseKeys: [] },
    ];
    const rows: StepRemovalRows = { seams: [seam('own'), seam('shared')], poses: [] };
    const requests: string[][] = [];
    const change = async (input: SeamChangeInput) => {
      const deletion = [...(build(input).delete ?? [])];
      requests.push(deletion);
      rows.seams = rows.seams.filter((row) => !deletion.includes(row.seamKey));
      return changed();
    };
    const io = {
      active: () => hasStepRemovalOwed(CARD, 'b', 20),
      cutStrips: () => [],
      operations: () => operations,
      rows: () => rows,
      change,
      clear: () => clearStepRemovalOwed(CARD, 'b', 20),
    };

    await expect(runStepRemovalCleanup(entry, io)).resolves.toBe(true);
    await expect(runStepRemovalCleanup(entry, io)).resolves.toBe(true);

    expect(requests).toEqual([['own']]);
    expect(rows.seams.map((row) => row.seamKey)).toEqual(['shared']);
  });

  it('C1. a link saved while cleanup waits rebuilds to an empty delete and sends no request', async () => {
    const entry: OwedStepRemoval = {
      historyKey: 'b',
      operationNumber: 20,
      candidateKeys: ['shared'],
      at: 10,
    };
    markStepRemovalOwed(CARD, entry);
    const operations: Row[] = [];
    const rows = { seams: [seam('shared')], poses: [] };
    const requests: unknown[] = [];

    await expect(
      runStepRemovalCleanup(entry, {
        active: () => true,
        cutStrips: () => [],
        operations: () => operations,
        rows: () => rows,
        change: async (input) => {
          build(input);
          operations.push({
            historyKey: 'c',
            operationNumber: 20,
            seamKeys: ['shared'],
            poseKeys: [],
          });
          const change = build(input);
          if (change.delete?.length) requests.push(change);
          return refused('not saved');
        },
        clear: () => clearStepRemovalOwed(CARD, 'b', 20),
      }),
    ).resolves.toBe(true);

    expect(requests).toEqual([]);
    expect(hasStepRemovalOwed(CARD, 'b', 20)).toBe(false);
  });

  it('6. a network-refused cleanup stays owed and retries after the next successful save', async () => {
    const entry = owedOf(middleSnapshot());
    markStepRemovalOwed(CARD, entry);
    const answers = [refused('the server did not answer'), changed()];
    const change = vi.fn(async () => answers.shift()!);
    const io = {
      active: () => hasStepRemovalOwed(CARD, 'b', 20),
      cutStrips: () => [],
      operations: () => [] as Row[],
      rows: () => middleSnapshot().rows,
      change,
      clear: () => clearStepRemovalOwed(CARD, 'b', 20),
    };

    await expect(runStepRemovalCleanup(entry, io)).resolves.toBe(false);
    expect(hasStepRemovalOwed(CARD, 'b', 20)).toBe(true);
    await expect(runStepRemovalCleanup(entry, io)).resolves.toBe(true);
    expect(change).toHaveBeenCalledTimes(2);
    expect(hasStepRemovalOwed(CARD, 'b', 20)).toBe(false);
  });

  it('C6. a substantive cleanup refusal is silent work that drops its debt', async () => {
    const entry = owedOf(middleSnapshot());
    markStepRemovalOwed(CARD, entry);

    await expect(
      runStepRemovalCleanup(entry, {
        active: () => true,
        cutStrips: () => [],
        operations: () => [],
        rows: () => middleSnapshot().rows,
        change: async () => refused('contradicts_delete'),
        clear: () => clearStepRemovalOwed(CARD, 'b', 20),
      }),
    ).resolves.toBe(false);

    expect(hasStepRemovalOwed(CARD, 'b', 20)).toBe(false);
  });

  it('7. redo after undo repeats the form edit and records fresh debt', async () => {
    const snapshot = middleSnapshot();
    const form = [structuredClone(snapshot.row)];
    let recorded: StepRemovalSnapshot<Row> | null = null;

    await expect(
      runStepRemovalRedoChange({
        settle: async () => true,
        snapshot: () => structuredClone(snapshot),
        cutHistory: () => undefined,
        remove: () => form.splice(0, 1),
        record: (fresh) => {
          recorded = fresh;
        },
        owe: (fresh) => markStepRemovalOwed(CARD, owedOf(fresh)),
        refuse: vi.fn(),
        unsettled: 'still saving',
      }),
    ).resolves.toBe(true);

    expect(form).toEqual([]);
    expect(recorded).not.toBeNull();
    expect(owedStepRemovals(CARD)).toEqual([owedOf(snapshot)]);
  });

  it('8. binding removal carries its strip through cleanup, undo and redo with the step', async () => {
    type BindingSnapshot = StepRemovalSnapshot<Row> & {
      strip: { lineKey: string; seamKey: string };
      patch: { before: string[]; after: string[] };
    };
    const snapshot: BindingSnapshot = {
      ...middleSnapshot({ seams: [seam('seam-b'), seam('strip-seam')], poses: [] }),
      row: {
        historyKey: 'b',
        operationNumber: 20,
        inputKeys: ['strip'],
        seamKeys: ['seam-b', 'strip-seam'],
        poseKeys: [],
      },
      candidateKeys: ['seam-b', 'strip-seam'],
      strip: { lineKey: 'strip', seamKey: 'strip-seam' },
      patch: { before: ['strip', 'body'], after: ['body'] },
    };
    const form: Row[] = [
      structuredClone(snapshot.row),
      {
        historyKey: 'c',
        seamKeys: ['strip-seam'],
        poseKeys: [],
        inputKeys: [...snapshot.patch.before],
      },
    ];
    let strips = [structuredClone(snapshot.strip)];
    let savedRows = structuredClone(snapshot.rows);
    markStepRemovalOwed(CARD, owedOf(snapshot));

    await runStepRemovalChange({
      settle: async () => true,
      snapshot: () => snapshot,
      cutHistory: () => undefined,
      remove: () => {
        strips = [];
        form[1].inputKeys = [...snapshot.patch.after];
        form[1].seamKeys = [];
        form.splice(0, 1);
      },
      record: vi.fn(),
      owe: vi.fn(),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });
    expect({ form, strips }).toEqual({
      form: [{ historyKey: 'c', seamKeys: [], poseKeys: [], inputKeys: ['body'] }],
      strips: [],
    });

    const bindingDeletes: string[][] = [];
    await runStepRemovalCleanup(owedOf(snapshot), {
      active: () => true,
      operations: () => form,
      cutStrips: () => strips,
      rows: () => savedRows,
      change: async (input) => {
        const gone = build(input).delete ?? [];
        bindingDeletes.push([...gone]);
        savedRows.seams = savedRows.seams.filter((row) => !gone.includes(row.seamKey));
        return changed();
      },
      clear: () => clearStepRemovalOwed(CARD, 'b', 20),
    });
    // The strip left with its binding step: nothing holds its seam, so it is cleaned with the step's.
    expect(bindingDeletes).toEqual([['seam-b', 'strip-seam']]);
    expect(savedRows.seams).toEqual([]);

    const undoUpserts: string[][] = [];
    await runStepRemovalUndoChange(snapshot, {
      alreadyBack: () => false,
      close: () => undefined,
      validate: () => null,
      settle: async () => true,
      rows: () => savedRows,
      change: async (input) => {
        undoUpserts.push((build(input).upsert ?? []).map((row) => row.seamKey));
        return changed();
      },
      restore: (row, keyMap) => {
        strips = [{ ...snapshot.strip, seamKey: keyMap.get('strip-seam') ?? 'strip-seam' }];
        form[0].inputKeys = [...snapshot.patch.before];
        form[0].seamKeys = ['strip-seam'];
        form.unshift(row);
        return 0;
      },
      clearOwed: vi.fn(),
      finishHistory: vi.fn(),
      select: vi.fn(),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });

    expect(undoUpserts).toEqual([['seam-b', 'strip-seam']]);
    expect(strips).toEqual([snapshot.strip]);
    expect(form[0]).toEqual(snapshot.row);
    expect(form[1].inputKeys).toEqual(snapshot.patch.before);

    await runStepRemovalRedoChange({
      settle: async () => true,
      snapshot: () => snapshot,
      cutHistory: () => undefined,
      remove: () => {
        strips = [];
        form[1].inputKeys = [...snapshot.patch.after];
        form[1].seamKeys = [];
        form.splice(0, 1);
      },
      record: vi.fn(),
      owe: (fresh) => markStepRemovalOwed(CARD, owedOf(fresh)),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });
    expect(strips).toEqual([]);
    expect(hasStepRemovalOwed(CARD, 'b', 20)).toBe(true);
  });

  it('9. a shared seam is never cleaned and undo performs no upsert', async () => {
    const shared = seam('shared');
    const snapshot: StepRemovalSnapshot<Row> = {
      ...middleSnapshot({ seams: [shared], poses: [] }),
      row: { historyKey: 'b', operationNumber: 20, seamKeys: ['shared'], poseKeys: [] },
      candidateKeys: ['shared'],
    };
    const entry = owedOf(snapshot);
    const cleanupRequests: unknown[] = [];
    const cleanupChange = vi.fn(async (input: SeamChangeInput) => {
      build(input);
      const afterFlush = build(input);
      if (afterFlush.delete?.length) cleanupRequests.push(afterFlush);
      return refused('not saved');
    });

    await runStepRemovalCleanup(entry, {
      active: () => true,
      cutStrips: () => [],
      operations: () => [
        { historyKey: 'c', operationNumber: 20, seamKeys: ['shared'], poseKeys: [] },
      ],
      rows: () => snapshot.rows,
      change: cleanupChange,
      clear: vi.fn(),
    });
    expect(cleanupChange).not.toHaveBeenCalled();
    expect(cleanupRequests).toEqual([]);

    const undoChange = vi.fn();
    await runStepRemovalUndoChange(snapshot, {
      alreadyBack: () => false,
      close: () => undefined,
      validate: () => null,
      settle: async () => true,
      rows: () => snapshot.rows,
      change: undoChange,
      restore: () => 0,
      clearOwed: vi.fn(),
      finishHistory: vi.fn(),
      select: vi.fn(),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });
    expect(undoChange).not.toHaveBeenCalled();
  });

  it.each([
    'fix 1 field first',
    'lock_version_moved',
    'contradicts_upsert',
    'the server did not answer',
  ])('10. undo refusal %s leaves form and history untouched, then retry succeeds', async (why) => {
    const snapshot = middleSnapshot();
    const form: Row[] = [];
    let history: 'undo' | 'redo' = 'undo';
    const answers: Array<SeamChangeResult | Error> = [
      why === 'the server did not answer' ? new Error(why) : refused(why),
      changed(),
    ];
    const refuse = vi.fn();
    const io = {
      alreadyBack: () => false,
      close: () => undefined,
      validate: () => null,
      settle: async () => true,
      rows: () => ({ seams: [], poses: [] }),
      change: async () => {
        const answer = answers.shift()!;
        if (answer instanceof Error) throw answer;
        return answer;
      },
      restore: (row: Row) => {
        form.push(row);
        return 0;
      },
      clearOwed: vi.fn(),
      finishHistory: () => {
        history = 'redo' as const;
      },
      select: vi.fn(),
      refuse,
      unsettled: 'still saving',
    };

    await expect(runStepRemovalUndoChange(snapshot, io)).resolves.toBe(false);
    expect(form).toEqual([]);
    expect(history).toBe('undo');
    expect(io.clearOwed).not.toHaveBeenCalled();
    expect(refuse).toHaveBeenLastCalledWith(why);

    await expect(runStepRemovalUndoChange(snapshot, io)).resolves.toBe(true);
    expect(form).toEqual([snapshot.row]);
    expect(history).toBe('redo');
  });

  it('C2. server key remapping reaches seam, pose and binding-strip links', async () => {
    const snapshot = middleSnapshot();
    let restored: { row: Row; stripSeamKey: string } | null = null;

    await runStepRemovalUndoChange(snapshot, {
      alreadyBack: () => false,
      close: () => undefined,
      validate: () => null,
      settle: async () => true,
      rows: () => ({ seams: [], poses: [] }),
      change: async () =>
        changed(
          new Map([
            ['seam-b', 'seam-stored'],
            ['pose-b', 'pose-stored'],
          ]),
        ),
      restore: (row, keyMap) => {
        restored = { row, stripSeamKey: keyMap.get('seam-b') ?? 'seam-b' };
        return 0;
      },
      clearOwed: vi.fn(),
      finishHistory: vi.fn(),
      select: vi.fn(),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });

    expect(restored).toEqual({
      row: { ...snapshot.row, seamKeys: ['seam-stored'], poseKeys: ['pose-stored'] },
      stripSeamKey: 'seam-stored',
    });
  });

  it.each([
    ['cleanup succeeds', true, 1],
    ['cleanup refuses', false, 0],
  ])(
    'C3. undo waits while %s, then chooses the observed row state',
    async (_name, gone, writes) => {
      const snapshot = middleSnapshot();
      let rows = structuredClone(snapshot.rows);
      let release!: () => void;
      const cleanup = new Promise<void>((resolve) => {
        release = () => {
          if (gone) rows = { seams: [], poses: [] };
          resolve();
        };
      });
      const change = vi.fn(async () => changed());
      const undo = runStepRemovalUndoChange(snapshot, {
        alreadyBack: () => false,
        close: () => undefined,
        validate: () => null,
        settle: async () => {
          await cleanup;
          return true;
        },
        rows: () => rows,
        change,
        restore: () => 0,
        clearOwed: vi.fn(),
        finishHistory: vi.fn(),
        select: vi.fn(),
        refuse: vi.fn(),
        unsettled: 'still saving',
      });

      expect(change).not.toHaveBeenCalled();
      release();
      await expect(undo).resolves.toBe(true);
      expect(change).toHaveBeenCalledTimes(writes);
    },
  );

  it('C4. a saved removal with cleanup pending still undoes as a zero-request form edit', async () => {
    const snapshot = middleSnapshot();
    const change = vi.fn();
    const form: Row[] = [];

    await runStepRemovalUndoChange(snapshot, {
      alreadyBack: () => false,
      close: () => undefined,
      validate: () => null,
      settle: async () => true,
      rows: () => snapshot.rows,
      change,
      restore: (row) => {
        form.push(row);
        return 0;
      },
      clearOwed: vi.fn(),
      finishHistory: vi.fn(),
      select: vi.fn(),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });

    expect(change).not.toHaveBeenCalled();
    expect(form).toEqual([snapshot.row]);
  });

  it('C5. after-cleanup undo clears debt before restore, so reload cannot clean restored rows', async () => {
    const snapshot = middleSnapshot();
    markStepRemovalOwed(CARD, owedOf(snapshot));
    const order: string[] = [];

    await runStepRemovalUndoChange(snapshot, {
      alreadyBack: () => false,
      close: () => undefined,
      validate: () => null,
      settle: async () => true,
      rows: () => ({ seams: [], poses: [] }),
      change: async () => changed(),
      restore: () => {
        order.push('restore');
        return 0;
      },
      clearOwed: () => {
        order.push('clear');
        clearStepRemovalOwed(CARD, 'b', 20);
      },
      finishHistory: vi.fn(),
      select: vi.fn(),
      refuse: vi.fn(),
      unsettled: 'still saving',
    });

    const reloadCleanup = vi.fn();
    for (const entry of owedStepRemovals(CARD)) await runStepRemovalCleanup(entry, reloadCleanup());
    expect(order).toEqual(['clear', 'restore']);
    expect(reloadCleanup).not.toHaveBeenCalled();
  });
});

// A cut strip names the seam its length is taken from (TechCardCutStrip.seam_key, a soft reference
// the server never guards). That seam is held exactly like a step link: cleanup never deletes it.
describe('step removal cleanup and cut strip seams', () => {
  const entry: OwedStepRemoval = {
    historyKey: 'b',
    operationNumber: 20,
    candidateKeys: ['own', 'strip-seam'],
    at: 10,
  };
  const rows = () => ({ seams: [seam('own'), seam('strip-seam')], poses: [] });

  it('S1. a from_seam strip that outlives a non-binding step keeps its seam; the other own seam goes', async () => {
    const deletes: string[][] = [];
    await expect(
      runStepRemovalCleanup(entry, {
        active: () => true,
        operations: () => [],
        cutStrips: () => [{ seamKey: 'strip-seam' }],
        rows,
        change: async (input) => {
          build(input);
          deletes.push([...(build(input).delete ?? [])]);
          return changed();
        },
        clear: vi.fn(),
      }),
    ).resolves.toBe(true);
    expect(deletes).toEqual([['own']]);
  });

  it('S2. a strip pointed at a candidate while the cleanup waited keeps that seam alive', async () => {
    const strips: { seamKey?: string }[] = [];
    const deletes: string[][] = [];
    await runStepRemovalCleanup(entry, {
      active: () => true,
      operations: () => [],
      cutStrips: () => strips,
      rows,
      change: async (input) => {
        build(input);
        // The body save the flush carries holds the new strip.
        strips.push({ seamKey: 'own' });
        deletes.push([...(build(input).delete ?? [])]);
        return changed();
      },
      clear: vi.fn(),
    });
    expect(deletes).toEqual([['strip-seam']]);
  });

  it('S3. a strip holding the only candidate left sends no request and drops the debt', async () => {
    const change = vi.fn();
    const clear = vi.fn();
    await runStepRemovalCleanup(
      { ...entry, candidateKeys: ['strip-seam'] },
      {
        active: () => true,
        operations: () => [],
        cutStrips: () => [{ seamKey: 'strip-seam' }],
        rows,
        change,
        clear,
      },
    );
    expect(change).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledOnce();
  });
});
