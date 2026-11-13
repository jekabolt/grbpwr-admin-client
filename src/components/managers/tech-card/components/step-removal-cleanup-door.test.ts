import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCard,
  common_TechCardSeam,
} from 'api/proto-http/admin';
import { toWire, type StoredRow } from 'lib/seams';

import { CARD6_SEAMS } from './step-seams/card6.fixture';
import { runSeamChange, type SeamChangeDeps } from './assembly-seams/seam-change';
import type { SeamFormBridge } from './assembly-seams/seam-form-bridge';
import { hydrateSeams, resetSeams, rowsOf, useSeamsStore } from './assembly-seams/seams-store';
import type { OwedStepRemoval } from './card-owed';
import {
  cleanupCall,
  forgetStepRemovalDoubts,
  quietCleanupChange,
  readCardForStepUndo,
  runStepRemovalCleanup,
  runStepRemovalUndoChange,
} from './step-removal-change';

// The cleanup through the REAL `runSeamChange` and the real seams store: only the door (bridge) and
// the server call are doubles. A fake `io.change` would hide what the strict door does.

const CARD = 6;
const [a, b] = [...CARD6_SEAMS.values()];
const wire = (rows: readonly StoredRow[]) => rows.map(toWire) as common_TechCardSeam[];

type Op = { historyKey: string; operationNumber: number; seamKeys: string[]; poseKeys: string[] };

const entry: OwedStepRemoval = {
  historyKey: 'gone',
  operationNumber: 20,
  candidateKeys: [a.seamKey, b.seamKey],
  at: 0,
};

const lockMoved = () =>
  Object.assign(new Error('the card moved'), {
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.BadRequest',
        fieldViolations: [{ field: 'expected_lock_version', description: 'lock_version_moved' }],
      },
    ],
  });

const reply = (
  lockVersion: number,
  rows: readonly StoredRow[],
  deletedKeys: string[],
): ChangeTechCardSeamsResponse => ({
  seams: wire(rows),
  links: [],
  lockVersion,
  keyMap: [],
  deletedKeys,
});

function harness(call: SeamChangeDeps['call'], over: Partial<SeamFormBridge> = {}) {
  // The saved body: the removed step is gone, h10 is the step that may take its seams.
  const ops: Op[] = [{ historyKey: 'h10', operationNumber: 10, seamKeys: [], poseKeys: [] }];
  const strips: { seamKey?: string }[] = [];
  let version = 7;
  const log: string[] = [];
  const bridge: SeamFormBridge = {
    flush: async () => ({ ok: true }),
    // Strict hold: no pastInvalidForm, the door either holds or refuses.
    hold: async (o) => {
      log.push(o?.pastInvalidForm ? 'hold:past' : 'hold');
      return { release: () => log.push('release') };
    },
    version: () => version,
    operationNumber: (step) =>
      ops.find((op) => op.historyKey === step.historyKey)?.operationNumber ?? 0,
    adopt: (x) => {
      if (version === x.expected) version = x.lockVersion;
    },
    reread: async () => ({ ok: false, why: 'no read' }),
    ...over,
  };
  const deps: SeamChangeDeps = {
    call: cleanupCall(entry.historyKey, call),
    bridge: (id) => (id === CARD ? bridge : undefined),
  };
  const clear = vi.fn();
  const retryLater = vi.fn();
  const run = () =>
    runStepRemovalCleanup(entry, {
      active: () => true,
      operations: () => ops,
      cutStrips: () => strips,
      cutHistory: () => undefined,
      rows: () => {
        const s = useSeamsStore.getState();
        return { seams: s.server, poses: s.poses };
      },
      change: quietCleanupChange(entry.candidateKeys, (input) =>
        runSeamChange(CARD, input, { verb: 'removal', quiet: true }, deps),
      ),
      clear,
      retryLater,
    });
  return {
    ops,
    retryLater,
    strips,
    log,
    bridge,
    clear,
    run,
    setVersion: (v: number) => {
      version = v;
    },
  };
}

const storeKeys = () => rowsOf(useSeamsStore.getState()).map((row) => row.seamKey);

beforeEach(() => {
  forgetStepRemovalDoubts();
  resetSeams();
  hydrateSeams(CARD, wire([a, b]), 7);
});

describe('step removal cleanup through the real seam door', () => {
  it('a) both candidates linked while the cleanup waited: no request, debt cleared, rows untouched', async () => {
    const call = vi.fn<SeamChangeDeps['call']>();
    const h = harness(call);
    // The body save the flush carries holds the new links.
    h.bridge.flush = async () => {
      h.ops[0].seamKeys = [a.seamKey, b.seamKey];
      return { ok: true };
    };
    await h.run();
    expect(call).not.toHaveBeenCalled();
    expect(h.clear).toHaveBeenCalledOnce();
    const s = useSeamsStore.getState();
    expect(s.pending[a.seamKey]).toBeUndefined();
    expect(s.pending[b.seamKey]).toBeUndefined();
    expect(s.errors[a.seamKey]).toBeUndefined();
    expect(s.errors[b.seamKey]).toBeUndefined();
    expect(storeKeys()).toEqual([a.seamKey, b.seamKey]);
    expect(h.log).not.toContain('hold:past');
  });

  it('b) only one candidate linked: exactly one request deleting the free row', async () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      return reply(8, [a], [b.seamKey]);
    });
    h.bridge.flush = async () => {
      h.ops[0].seamKeys = [a.seamKey];
      return { ok: true };
    };
    await h.run();
    expect(sent).toHaveLength(1);
    expect(sent[0].delete).toEqual([b.seamKey]);
    expect(sent[0].link).toEqual([]);
    expect(sent[0].detach).toEqual([]);
    expect(h.clear).toHaveBeenCalledOnce();
    const s = useSeamsStore.getState();
    expect(s.pending[a.seamKey]).toBeUndefined();
    expect(s.errors[a.seamKey]).toBeUndefined();
    expect(storeKeys()).toEqual([a.seamKey]);
    expect(h.log).toEqual(['hold', 'release']);
  });

  it('c) lock_version_moved: the retry is built from the fresh card and deletes only what is free in it', async () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      if (sent.length === 1) throw lockMoved();
      return reply(10, [a], [b.seamKey]);
    });
    h.bridge.reread = async () => {
      // Another save linked `a` meanwhile; the read brings that body into the form.
      h.ops[0].seamKeys = [a.seamKey];
      h.setVersion(9);
      return {
        ok: true,
        card: { lockVersion: 9, seams: wire([a, b]) } as unknown as common_TechCard,
      };
    };
    await h.run();
    expect(sent.map((req) => req.delete)).toEqual([[a.seamKey, b.seamKey], [b.seamKey]]);
    expect(sent.map((req) => req.expectedLockVersion)).toEqual([7, 9]);
    expect(h.clear).toHaveBeenCalledOnce();
    expect(storeKeys()).toEqual([a.seamKey]);
    const s = useSeamsStore.getState();
    expect(s.pending[a.seamKey]).toBeUndefined();
    expect(s.errors[a.seamKey]).toBeUndefined();
  });

  it('d) a cut strip measured from a candidate keeps that seam: one request deleting only the other', async () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      return reply(8, [b], [a.seamKey]);
    });
    // A non-binding step took the strip as an input; the strip outlives the removed step.
    h.strips.push({ seamKey: b.seamKey });
    await h.run();
    expect(sent).toHaveLength(1);
    expect(sent[0].delete).toEqual([a.seamKey]);
    expect(h.clear).toHaveBeenCalledOnce();
    expect(storeKeys()).toEqual([b.seamKey]);
    const s = useSeamsStore.getState();
    expect(s.pending[b.seamKey]).toBeUndefined();
    expect(s.errors[b.seamKey]).toBeUndefined();
  });
});

describe('a lost cleanup reply, then the step undo', () => {
  const snapshot = {
    step: { historyKey: entry.historyKey },
    row: {
      historyKey: entry.historyKey,
      operationNumber: 20,
      seamKeys: [a.seamKey, b.seamKey],
      poseKeys: [],
    },
    rows: { seams: [a, b], poses: [] },
    operationNumber: 20,
    candidateKeys: entry.candidateKeys,
  };

  async function lostDelete(thrown: () => unknown = () => new Error('Failed to fetch')) {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      // The server applied the delete; the answer never came back.
      throw thrown();
    });
    await h.run();
    return { h, sent };
  }

  function undo(
    h: ReturnType<typeof harness>,
    call: SeamChangeDeps['call'],
    settle = async () => true,
    // A forced read of the card from the server; it fails by default.
    readServer: () => Promise<boolean> = async () => false,
  ) {
    const restored: Array<{ row: unknown; keyMap: ReadonlyMap<string, string> }> = [];
    const refused: string[] = [];
    const deps: SeamChangeDeps = { call, bridge: (id) => (id === CARD ? h.bridge : undefined) };
    const done = runStepRemovalUndoChange(snapshot, {
      validate: () => null,
      alreadyBack: () => false,
      close: () => undefined,
      settle,
      rows: () => {
        const s = useSeamsStore.getState();
        return { seams: s.server, poses: s.poses };
      },
      change: (input) => runSeamChange(CARD, input, { verb: 'restore' }, deps),
      cutHistory: () => undefined,
      restore: (row, keyMap) => restored.push({ row, keyMap }),
      clearOwed: () => undefined,
      finishHistory: () => undefined,
      select: () => undefined,
      refuse: (why) => refused.push(why),
      unsettled: 'still saving',
      readServer,
    });
    return { done, restored, refused };
  }

  it('the rows the store still shows are not trusted: undo restores nothing without a fresh read', async () => {
    const { h, sent } = await lostDelete();
    expect(sent).toHaveLength(1);
    expect(h.clear).not.toHaveBeenCalled();
    // The store still shows both rows; the server dropped them.
    expect(storeKeys()).toEqual([a.seamKey, b.seamKey]);
    const call = vi.fn<SeamChangeDeps['call']>();
    const u = undo(h, call);
    expect(await u.done).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(u.restored).toHaveLength(0);
    expect(u.refused).toEqual(['still saving']);
  });

  it('the retried cleanup rereads the card; the undo then upserts both rows and links the step to them', async () => {
    const { h } = await lostDelete();
    // The retry meets the moved card and reads it: both rows are gone.
    h.bridge.reread = async () => {
      h.setVersion(8);
      return { ok: true, card: { lockVersion: 8, seams: [] } as unknown as common_TechCard };
    };
    const retry: ChangeTechCardSeamsRequest[] = [];
    h.bridge.hold = async () => ({ release: () => undefined });
    const sent: ChangeTechCardSeamsRequest[] = [];
    const call = vi.fn<SeamChangeDeps['call']>(async (req) => {
      sent.push(req);
      if (req.delete?.length) {
        retry.push(req);
        throw lockMoved();
      }
      return reply(9, [a, b], []);
    });
    const u = undo(
      h,
      call,
      async () => {
        await runStepRemovalCleanup(entry, {
          active: () => true,
          operations: () => h.ops,
          cutStrips: () => h.strips,
          cutHistory: () => undefined,
          rows: () => {
            const s = useSeamsStore.getState();
            return { seams: s.server, poses: s.poses };
          },
          change: quietCleanupChange(entry.candidateKeys, (input) =>
            runSeamChange(
              CARD,
              input,
              { verb: 'removal', quiet: true },
              { call: cleanupCall(entry.historyKey, call), bridge: () => h.bridge },
            ),
          ),
          clear: h.clear,
        });
        return true;
      },
      serverRead,
    );
    expect(await u.done).toBe(true);
    expect(retry).toHaveLength(1);
    expect(
      sent
        .at(-1)
        ?.upsert?.map((row) => row.seamKey)
        .sort(),
    ).toEqual([a.seamKey, b.seamKey].sort());
    expect(u.restored).toHaveLength(1);
    expect(u.refused).toEqual([]);
  });
  const status = (code: number, text: string) =>
    Object.assign(new Error(`Error: ${code} - ${text}`), { status: code });

  it.each([
    ['Safari without network', () => new TypeError('Load failed')],
    ['a gateway during a backend restart', () => status(502, 'Bad Gateway')],
    ['an answer cut after the write', () => new SyntaxError('Unexpected end of JSON input')],
  ])('%s: the debt stays and the undo does not trust the rows', async (_, thrown) => {
    const { h } = await lostDelete(thrown);
    expect(h.clear).not.toHaveBeenCalled();
    const call = vi.fn<SeamChangeDeps['call']>();
    const u = undo(h, call);
    expect(await u.done).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(u.restored).toHaveLength(0);
    expect(u.refused).toEqual(['still saving']);
  });

  it.each([
    ['409', () => status(409, 'Conflict')],
    ['400', () => status(400, 'Bad Request')],
  ])(
    'a server refusal %s is a sure outcome: no doubt, the undo plans from the rows',
    async (_, thrown) => {
      const { h } = await lostDelete(thrown);
      const call = vi.fn<SeamChangeDeps['call']>();
      const u = undo(h, call);
      expect(await u.done).toBe(true);
      expect(call).not.toHaveBeenCalled();
      expect(u.refused).toEqual([]);
    },
  );
  // The server after the lost delete: both rows gone, the card one version on.
  const serverRead = async () => {
    hydrateSeams(CARD, wire([]), 8);
    return true;
  };
  const upsertCall = () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const call = vi.fn<SeamChangeDeps['call']>(async (req) => {
      sent.push(req);
      return reply(9, [a, b], []);
    });
    return { sent, call };
  };

  it('codex r10 #1: the form went invalid, the retried cleanup stops at the flush; the undo refuses, then upserts once the form is fixed', async () => {
    const { h } = await lostDelete();
    // The owner cleared the card name: every flush now refuses before any request.
    const flush = h.bridge.flush;
    h.bridge.flush = async () => ({ ok: false, why: 'fix the name', invalid: true });
    const { sent, call } = upsertCall();
    const retry = async () => {
      await h.run();
      return true;
    };
    const first = undo(h, call, retry, serverRead);
    expect(await first.done).toBe(false);
    // Refused with the form's own reason; the step is not back with a link to a gone row.
    expect(first.refused).toEqual(['fix the name']);
    expect(first.restored).toHaveLength(0);
    expect(sent).toHaveLength(0);
    // The form is fixed: the undo upserts both rows and only then restores the step.
    h.bridge.flush = flush;
    const second = undo(h, call, retry, serverRead);
    expect(await second.done).toBe(true);
    expect(second.refused).toEqual([]);
    expect(
      sent
        .at(-1)
        ?.upsert?.map((row) => row.seamKey)
        .sort(),
    ).toEqual([a.seamKey, b.seamKey].sort());
    expect(second.restored).toHaveLength(1);
  });

  it('codex r10 #2: a same-version hydrate from the cached card is no fresh read; the undo still upserts', async () => {
    await lostDelete().then(({ h }) => {
      // The Sizes tab hydrates the store again from the cached card: a new list, same rows.
      hydrateSeams(CARD, wire([a, b]), 7);
      expect(storeKeys()).toEqual([a.seamKey, b.seamKey]);
      const { sent, call } = upsertCall();
      return (async () => {
        const u = undo(h, call, async () => true, serverRead);
        const done = await u.done;
        expect(u.refused).toEqual([]);
        expect(done).toBe(true);
        expect(
          sent
            .at(-1)
            ?.upsert?.map((row) => row.seamKey)
            .sort(),
        ).toEqual([a.seamKey, b.seamKey].sort());
      })();
    });
  });
});

describe('U1 #4: the undo forced read moves the form version with the card', () => {
  const snapshot = {
    step: { historyKey: entry.historyKey },
    row: {
      historyKey: entry.historyKey,
      operationNumber: 20,
      seamKeys: [a.seamKey, b.seamKey],
      poseKeys: [],
    },
    rows: { seams: [a, b], poses: [] },
    operationNumber: 20,
    candidateKeys: entry.candidateKeys,
  };

  it('after a lost cleanup reply the restore upsert claims the read version: one request, no lock_version_moved retry', async () => {
    // The cleanup delete landed at 8; its answer was lost.
    const h = harness(async () => {
      throw new Error('Failed to fetch');
    });
    await h.run();
    let serverVersion = 8;
    h.bridge.reread = async () => {
      // The page's read in chain: the form stands on the card it read.
      h.setVersion(serverVersion);
      return {
        ok: true,
        card: { lockVersion: serverVersion, seams: [] } as unknown as common_TechCard,
      };
    };
    const sent: ChangeTechCardSeamsRequest[] = [];
    const call = vi.fn<SeamChangeDeps['call']>(async (req) => {
      sent.push(req);
      if (req.expectedLockVersion !== serverVersion) throw lockMoved();
      serverVersion += 1;
      return reply(serverVersion, [a, b], []);
    });
    const deps: SeamChangeDeps = { call, bridge: (id) => (id === CARD ? h.bridge : undefined) };
    const refused: string[] = [];
    const restored: unknown[] = [];
    const ok = await runStepRemovalUndoChange(snapshot, {
      validate: () => null,
      alreadyBack: () => false,
      close: () => undefined,
      settle: async () => true,
      rows: () => {
        const s = useSeamsStore.getState();
        return { seams: s.server, poses: s.poses };
      },
      change: (input) => runSeamChange(CARD, input, { verb: 'restore' }, deps),
      cutHistory: () => undefined,
      restore: (row) => restored.push(row),
      clearOwed: () => undefined,
      finishHistory: () => undefined,
      select: () => undefined,
      refuse: (why) => refused.push(why),
      unsettled: 'still saving',
      readServer: () => readCardForStepUndo(CARD, (id) => (id === CARD ? h.bridge : undefined)),
    });
    expect(refused).toEqual([]);
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].expectedLockVersion).toBe(8);
    expect(restored).toHaveLength(1);
  });
});

describe('U1 #5: a failed cleanup asks for its own retry instead of waiting for the next card save', () => {
  const status = (code: number, text: string) =>
    Object.assign(new Error(`Error: ${code} - ${text}`), { status: code });

  it.each([
    ['no network', () => new TypeError('Failed to fetch')],
    ['a gateway during a backend restart', () => status(502, 'Bad Gateway')],
  ])('%s: the debt stays and one retry is asked for', async (_, thrown) => {
    const h = harness(async () => {
      throw thrown();
    });
    expect(await h.run()).toBe(false);
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.retryLater).toHaveBeenCalledTimes(1);
  });

  it('the form cannot be saved yet: the debt stays and one retry is asked for', async () => {
    const h = harness(vi.fn(), { flush: async () => ({ ok: false, why: 'fix the name' }) });
    expect(await h.run()).toBe(false);
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.retryLater).toHaveBeenCalledTimes(1);
  });

  it('a stable server refusal drops the debt: no retry', async () => {
    const h = harness(async () => {
      throw status(400, 'Bad Request');
    });
    expect(await h.run()).toBe(false);
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.retryLater).not.toHaveBeenCalled();
  });

  it('a cleanup that lands asks for nothing', async () => {
    const h = harness(async () => reply(8, [], [a.seamKey, b.seamKey]));
    expect(await h.run()).toBe(true);
    expect(h.retryLater).not.toHaveBeenCalled();
  });
});
