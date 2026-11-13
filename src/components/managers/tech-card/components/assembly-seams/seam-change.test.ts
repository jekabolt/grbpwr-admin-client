import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFormControl } from 'react-hook-form';

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCard,
  common_TechCardSeam,
} from 'api/proto-http/admin';
import { toWire, type StoredPose, type StoredRow } from 'lib/seams';

import { CARD6_SEAMS } from '../step-seams/card6.fixture';
import type { TechCardFormData } from '../schema';
import { createAutosaveMachine, type SaveResult } from '../useTechCardAutosave';
import { linksByOperation, type SeamChange } from './seam-change-plan';
import { NOT_SAVED, runSeamChange, type SeamChangeDeps } from './seam-change';
import {
  adoptStepLinks,
  stepNumberOf,
  type SeamAdoption,
  type SeamFormBridge,
} from './seam-form-bridge';
import { hydrateSeams, resetSeams, useSeamsStore } from './seams-store';

const CARD = 6;
const [a, b, c] = [...CARD6_SEAMS.values()];
const step = { historyKey: 'h10' };
const wire = (rows: readonly StoredRow[]) => rows.map(toWire) as common_TechCardSeam[];
const keys = () => useSeamsStore.getState().server.map((r) => r.seamKey);
const pose = (seamKey: string): StoredPose =>
  ({ ...a, seamKey, kind: 'pose', status: 'confirmed' }) as unknown as StoredPose;

const reply = (
  lockVersion: number,
  rows: readonly StoredRow[],
  links: { operationNumber: number; seamKeys: string[] }[] = [],
  keyMap: [string, string][] = [],
): ChangeTechCardSeamsResponse => ({
  seams: wire(rows),
  links,
  lockVersion,
  keyMap: keyMap.map(([sent, stored]) => ({ sent, stored })),
  deletedKeys: [],
});

const lockMoved = () =>
  Object.assign(new Error('the card moved'), {
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.BadRequest',
        fieldViolations: [{ field: 'expected_lock_version', description: 'lock_version_moved' }],
      },
    ],
  });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The card page's door as a test double: a version, a log, and its parts replaceable. */
function fakeBridge(over: Partial<SeamFormBridge> = {}, start = 7) {
  let version = start;
  const log: string[] = [];
  const adopted: SeamAdoption[] = [];
  const bridge: SeamFormBridge = {
    flush: async () => ({ ok: true }),
    hold: async () => {
      log.push('hold');
      return { release: () => log.push('release') };
    },
    version: () => version,
    operationNumber: (s) => (s.historyKey === 'h10' ? 10 : 0),
    adopt: (x) => {
      log.push('adopt');
      adopted.push(x);
      if (version === x.expected) version = x.lockVersion;
    },
    reread: async () => ({ ok: false, why: 'no read' }),
    ...over,
  };
  return {
    bridge,
    log,
    adopted,
    setVersion: (v: number) => {
      version = v;
    },
  };
}

const depsOf = (
  bridge: SeamFormBridge | (() => SeamFormBridge | undefined),
  call: SeamChangeDeps['call'],
  extra: Partial<SeamChangeDeps> = {},
): SeamChangeDeps => ({
  call,
  bridge: (id) => (id !== CARD ? undefined : typeof bridge === 'function' ? bridge() : bridge),
  ...extra,
});

beforeEach(() => {
  resetSeams();
  hydrateSeams(CARD, wire([a]), 7);
});

describe('one gesture, one ChangeTechCardSeams', () => {
  it('ACCEPT: one request at the form version; the form adopts, then the store settles, then release', async () => {
    const f = fakeBridge();
    const sent: ChangeTechCardSeamsRequest[] = [];
    const res = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step, seamKey: b.seamKey }] },
      { verb: 'decision' },
      depsOf(
        f.bridge,
        async (req) => {
          sent.push(req);
          // Optimistic while the request flies.
          expect(useSeamsStore.getState().pending[b.seamKey]?.kind).toBe('upsert');
          return reply(8, [a, b], [{ operationNumber: 10, seamKeys: [b.seamKey] }]);
        },
        { settled: () => f.log.push('settled') },
      ),
    );
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].expectedLockVersion).toBe(7);
    expect(sent[0].link).toEqual([{ operationNumber: 10, seamKey: b.seamKey }]);
    expect(f.log).toEqual(['hold', 'adopt', 'settled', 'release']);
    expect(f.adopted[0]).toMatchObject({ expected: 7, lockVersion: 8 });
    expect(keys()).toEqual([a.seamKey, b.seamKey]);
    expect(useSeamsStore.getState().serverVersion).toBe(8);
    expect(useSeamsStore.getState().pending).toEqual({});
  });

  it('the key the row was stored under comes back in keyMap', async () => {
    const f = fakeBridge();
    const res = await runSeamChange(
      CARD,
      { upsert: [{ ...b, seamKey: 'sent' }] },
      { verb: 'decision' },
      depsOf(f.bridge, async () => reply(8, [a, b], [], [['sent', b.seamKey]])),
    );
    expect(res.ok && res.keyMap.get('sent')).toBe(b.seamKey);
  });
});

describe('lists that arrive out of order (C7, invariant 3)', () => {
  it('an echo older than a read that answered first lifts its pending and nothing else', async () => {
    const f = fakeBridge();
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, async () => {
        // A card read at v9 lands while the write (v8) is out.
        hydrateSeams(CARD, wire([a, b, c]), 9);
        return reply(8, [a, b]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(keys()).toEqual([a, b, c].map((r) => r.seamKey));
    expect(useSeamsStore.getState().serverVersion).toBe(9);
    expect(useSeamsStore.getState().pending).toEqual({});
  });

  it('a GetTechCard older than the echo changes nothing; an equal one only when it agrees', async () => {
    const f = fakeBridge();
    await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, async () => reply(8, [a, b])),
    );
    expect(hydrateSeams(CARD, wire([a]), 7)).toBe(false);
    expect(hydrateSeams(CARD, wire([a, c]), 8)).toBe(false);
    expect(keys()).toEqual([a.seamKey, b.seamKey]);
    expect(useSeamsStore.getState().serverVersion).toBe(8);
  });
});

describe('the card leaves while the request flies', () => {
  it('another card in the store and no door: nothing of this write lands there', async () => {
    const f = fakeBridge();
    let open = true;
    const res = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step, seamKey: b.seamKey }] },
      { verb: 'decision' },
      depsOf(
        () => (open ? f.bridge : undefined),
        async () => {
          open = false;
          hydrateSeams(99, wire([c]), 3);
          return reply(8, [a, b], [{ operationNumber: 10, seamKeys: [b.seamKey] }]);
        },
      ),
    );
    // The server committed it; the next read of that card shows it.
    expect(res.ok).toBe(true);
    expect(f.adopted).toEqual([]);
    expect(useSeamsStore.getState().cardId).toBe(99);
    expect(keys()).toEqual([c.seamKey]);
    expect(useSeamsStore.getState().pending).toEqual({});
    expect(f.log).toEqual(['hold', 'release']);
  });
});

describe('a refused change is refused whole', () => {
  it('MIRROR / poses: no row, no link — the optimistic rows go back and the form is untouched', async () => {
    resetSeams();
    hydrateSeams(CARD, wire([a, b]), 7);
    const f = fakeBridge();
    const refused = vi.fn();
    const put = { ...c, seamKey: 'mirror-c' };
    const change: SeamChange = {
      upsert: [put, pose('P')],
      link: [
        { step, seamKey: put.seamKey },
        { step, seamKey: 'P' },
      ],
      detach: [{ step, seamKey: b.seamKey }],
    };
    const res = await runSeamChange(
      CARD,
      change,
      { verb: 'decisions (2)', gone: [b.seamKey] },
      depsOf(
        f.bridge,
        async () => {
          const s = useSeamsStore.getState();
          expect(Object.keys(s.pending).sort()).toEqual([b.seamKey, put.seamKey].sort());
          expect(Object.keys(s.posePending)).toEqual(['P']);
          throw new Error('contradicts_upsert');
        },
        { refused },
      ),
    );
    expect(res).toEqual({ ok: false, why: 'contradicts_upsert' });
    const s = useSeamsStore.getState();
    expect(s.pending).toEqual({});
    expect(s.posePending).toEqual({});
    expect(keys()).toEqual([a.seamKey, b.seamKey]);
    expect(s.serverVersion).toBe(7);
    expect(s.errors[put.seamKey]).toBe('contradicts_upsert');
    expect(f.adopted).toEqual([]);
    expect(refused).toHaveBeenCalledWith('decisions (2)', 'contradicts_upsert');
    expect(f.log).toEqual(['hold', 'release']);
  });

  it('a form that cannot be saved first: nothing is sent and nothing held', async () => {
    const f = fakeBridge({ flush: async () => ({ ok: false, why: '2 fields need attention' }) });
    const call = vi.fn();
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, call),
    );
    expect(res).toEqual({ ok: false, why: '2 fields need attention' });
    expect(call).not.toHaveBeenCalled();
    expect(f.log).toEqual([]);
    expect(useSeamsStore.getState().pending).toEqual({});
  });

  it('the conflict decision open: refused, and the hold given back', async () => {
    const f = fakeBridge();
    f.bridge.hold = async () => {
      f.log.push('hold');
      return { release: () => f.log.push('release'), refused: 'another editor saved this card' };
    };
    const call = vi.fn();
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, call),
    );
    expect(res.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(f.log).toEqual(['hold', 'release']);
  });

  it('no form for the card, or a step never saved: «not saved», nothing sent', async () => {
    const call = vi.fn();
    expect(
      await runSeamChange(
        CARD,
        { upsert: [b] },
        { verb: 'decision' },
        depsOf(() => undefined, call),
      ),
    ).toEqual({ ok: false, why: NOT_SAVED });
    const f = fakeBridge();
    expect(
      await runSeamChange(
        CARD,
        { link: [{ step: { historyKey: 'unsaved' }, seamKey: a.seamKey }] },
        { verb: 'decision' },
        depsOf(f.bridge, call),
      ),
    ).toEqual({ ok: false, why: NOT_SAVED });
    expect(call).not.toHaveBeenCalled();
    expect(f.log).toEqual(['hold', 'release']);
  });

  it('a row already in flight: the second intent is dropped, never raced', async () => {
    const f = fakeBridge();
    const gate = deferred<ChangeTechCardSeamsResponse>();
    const first = runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, () => gate.promise),
    );
    const call = vi.fn();
    const second = await runSeamChange(
      CARD,
      { delete: [b.seamKey] },
      { verb: 'removal' },
      depsOf(f.bridge, call),
    );
    expect(second).toEqual({ ok: false, why: 'still saving' });
    gate.resolve(reply(8, [a, b]));
    expect((await first).ok).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('lock_version_moved', () => {
  it('reads the card once and tries once more at the version read', async () => {
    const f = fakeBridge();
    const read = { lockVersion: 9, seams: wire([a, c]) } as unknown as common_TechCard;
    f.bridge.reread = async () => {
      f.setVersion(9);
      return { ok: true, card: read };
    };
    const reread = vi.spyOn(f.bridge, 'reread');
    const claimed: (number | undefined)[] = [];
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, async (req) => {
        claimed.push(req.expectedLockVersion);
        if (claimed.length === 1) throw lockMoved();
        // The read's rows are in the store before the retry goes out.
        expect(keys()).toEqual([a.seamKey, c.seamKey]);
        return reply(10, [a, b, c]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(claimed).toEqual([7, 9]);
    expect(reread).toHaveBeenCalledTimes(1);
    expect(useSeamsStore.getState().serverVersion).toBe(10);
  });

  it('a change given as a function is built again for the retry, after the read', async () => {
    const f = fakeBridge();
    f.bridge.reread = async () => {
      f.setVersion(9);
      return { ok: true, card: { lockVersion: 9, seams: wire([a]) } as unknown as common_TechCard };
    };
    let detachKey = a.seamKey;
    const sentDetach: (string | undefined)[] = [];
    const res = await runSeamChange(
      CARD,
      () => ({ upsert: [b], detach: [{ step, seamKey: detachKey }] }),
      { verb: 'decision' },
      depsOf(f.bridge, async (req) => {
        sentDetach.push(req.detach?.[0]?.seamKey);
        if (sentDetach.length === 1) {
          detachKey = c.seamKey;
          throw lockMoved();
        }
        return reply(10, [a, b]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(sentDetach).toEqual([a.seamKey, c.seamKey]);
  });

  it('a second refusal is said as it is', async () => {
    const f = fakeBridge();
    f.bridge.reread = async () => ({
      ok: true,
      card: { lockVersion: 9, seams: [] } as unknown as common_TechCard,
    });
    const reread = vi.spyOn(f.bridge, 'reread');
    const call = vi.fn(async () => {
      throw lockMoved();
    });
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, call),
    );
    expect(res).toEqual({ ok: false, why: 'the card moved' });
    expect(call).toHaveBeenCalledTimes(2);
    expect(reread).toHaveBeenCalledTimes(1);
    expect(useSeamsStore.getState().pending).toEqual({});
  });
});

describe('two quick gestures', () => {
  it('the second waits for the first and claims the version the first left', async () => {
    const f = fakeBridge();
    const gate = deferred<void>();
    const claimed: (number | undefined)[] = [];
    const call = async (req: ChangeTechCardSeamsRequest) => {
      claimed.push(req.expectedLockVersion);
      if (claimed.length === 1) await gate.promise;
      return reply((req.expectedLockVersion ?? 0) + 1, [a]);
    };
    const first = runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, call),
    );
    const second = runSeamChange(
      CARD,
      { upsert: [c] },
      { verb: 'decision' },
      depsOf(f.bridge, call),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(claimed).toEqual([7]);
    gate.resolve();
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(claimed).toEqual([7, 8]);
  });
});

describe('a field edited while ACCEPT flies (the card page door over the real autosave machine)', () => {
  it('is neither lost nor 409s: the held cycle writes it after the release, on the adopted version', async () => {
    // The server: one card row with a lock_version, the body it holds, a step's links.
    const server = { version: 7, styleNumber: 'S-1', links: [] as string[] };
    const form = createFormControl<TechCardFormData>({
      defaultValues: {
        styleNumber: 'S-1',
        operations: [{ historyKey: 'h10', operationNumber: 10, seamKeys: [], poseKeys: [] }],
      } as unknown as TechCardFormData,
    });
    form.control._state.mount = true;
    form.control._proxyFormState.isDirty = true;
    form.control._proxyFormState.dirtyFields = true;
    const base = { version: 7 };
    let holds = 0;
    const timers: (() => void)[] = [];
    const saves: { version: number; outcome: SaveResult['outcome'] }[] = [];
    const machine = createAutosaveMachine({
      debounceMs: 10,
      retryDelaysMs: [],
      setTimer: (fn) => {
        timers.push(fn);
        return fn;
      },
      clearTimer: (h) => {
        const i = timers.indexOf(h as () => void);
        if (i >= 0) timers.splice(i, 1);
      },
      now: () => Date.now(),
      isEnabled: () => true,
      isPaused: () => holds > 0,
      hasWork: () => form.control._getDirty(),
      validate: async () => ({ ok: true, errors: 0 }),
      countErrors: () => 0,
      onState: () => undefined,
      save: async () => {
        // The body write: refused with 409 unless it claims the version the card is at.
        if (base.version !== server.version) {
          saves.push({ version: base.version, outcome: 'conflict' });
          return { outcome: 'conflict' };
        }
        const values = form.getValues();
        server.styleNumber = values.styleNumber ?? '';
        server.links = [...(values.operations?.[0]?.seamKeys ?? [])];
        server.version += 1;
        saves.push({ version: base.version, outcome: 'complete' });
        base.version = server.version;
        form.reset(values);
        return { outcome: 'complete' };
      },
    });
    const fire = async () => {
      for (const fn of timers.splice(0)) fn();
      for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
    };
    // The door as index.tsx wires it: flush, hold (the machine's pause), the base version, adopt.
    const bridge: SeamFormBridge = {
      flush: async (reason) => {
        const r = await machine.flush(reason);
        return r === 'ok' || r === 'nothing' ? { ok: true } : { ok: false, why: r };
      },
      hold: async () => {
        holds += 1;
        return {
          release: () => {
            holds -= 1;
            if (holds === 0) machine.resume();
          },
        };
      },
      version: () => base.version,
      operationNumber: (s) => stepNumberOf(form, s),
      adopt: (x) => {
        if (base.version === x.expected) base.version = x.lockVersion;
        adoptStepLinks(form, linksByOperation(x.links, x.seams));
      },
      reread: async () => ({ ok: false, why: 'unused' }),
    };

    const res = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step, seamKey: b.seamKey }] },
      { verb: 'decision' },
      depsOf(bridge, async (req) => {
        // The operator types while the seam request is on the wire; the debounce falls due.
        form.setValue('styleNumber', 'S-2', { shouldDirty: true });
        machine.notifyChange();
        await fire();
        expect(saves).toEqual([]); // held: no body write races the seam write
        if (req.expectedLockVersion !== server.version) throw lockMoved();
        server.links.push(b.seamKey);
        server.version += 1;
        return reply(
          server.version,
          [a, b],
          [{ operationNumber: 10, seamKeys: [...server.links] }],
        );
      }),
    );
    expect(res.ok).toBe(true);
    // The link the server wrote is in the form, clean; the typed field is still dirty.
    expect(form.getValues('operations.0.seamKeys')).toEqual([b.seamKey]);
    expect(form.getFieldState('operations.0.seamKeys').isDirty).toBe(false);
    expect(form.getFieldState('styleNumber').isDirty).toBe(true);
    expect(base.version).toBe(8);

    // The release re-armed the skipped cycle: it writes the edit on version 8 — no 409.
    await fire();
    expect(saves).toEqual([{ version: 8, outcome: 'complete' }]);
    expect(server).toEqual({ version: 9, styleNumber: 'S-2', links: [b.seamKey] });
    expect(form.control._getDirty()).toBe(false);
    machine.dispose();
  });
});

describe('U1 #3: a change rebuilt to nothing', () => {
  it('after the read every key is held: no second request, the pending rows are lifted', async () => {
    const f = fakeBridge();
    f.bridge.reread = async () => {
      f.setVersion(9);
      return { ok: true, card: { lockVersion: 9, seams: wire([a]) } as unknown as common_TechCard };
    };
    let owed = [a.seamKey];
    let calls = 0;
    const res = await runSeamChange(
      CARD,
      () => ({ delete: owed }),
      { verb: 'removal', quiet: true },
      depsOf(f.bridge, async () => {
        calls += 1;
        owed = [];
        throw lockMoved();
      }),
    );
    expect(res).toMatchObject({ ok: true, deletedKeys: [] });
    expect(calls).toBe(1);
    expect(useSeamsStore.getState().pending[a.seamKey]).toBeUndefined();
    expect(keys()).toEqual([a.seamKey]);
  });
});
