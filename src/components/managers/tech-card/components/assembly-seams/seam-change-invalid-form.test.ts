import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFormControl } from 'react-hook-form';

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCard,
  common_TechCardSeam,
} from 'api/proto-http/admin';
import { toWire, type StoredPose, type StoredRow } from 'lib/seams';

import type { FlushResult } from '../design/autosave-contract';
import { CARD6_SEAMS } from '../step-seams/card6.fixture';
import type { TechCardFormData } from '../schema';
import { createAutosaveMachine, type SaveResult } from '../useTechCardAutosave';
import { linksByOperation, type SeamChange } from './seam-change-plan';
import { NOT_SAVED, runSeamChange, type SeamChangeDeps } from './seam-change';
import {
  adoptStepLinks,
  seamFlushAnswer,
  seamStepsAgreeOf,
  stepNumberOf,
  type SeamAdoption,
  type SeamFormBridge,
} from './seam-form-bridge';
import { hydrateSeams, resetSeams, useSeamsStore } from './seams-store';

/**
 * C9 (owner, 12.11: «писать отдельно»): a user's seam gesture is written while the form cannot save
 * only because it does not validate. Everything else that stops a body save still stops the seam.
 */

const CARD = 6;
const [a, b, c] = [...CARD6_SEAMS.values()];
const step = { historyKey: 'h10' };
const wire = (rows: readonly StoredRow[]) => rows.map(toWire) as common_TechCardSeam[];
const keys = () => useSeamsStore.getState().server.map((r) => r.seamKey);
const pose = (seamKey: string): StoredPose =>
  ({ ...a, seamKey, kind: 'pose', status: 'confirmed' }) as unknown as StoredPose;
const INVALID = seamFlushAnswer('invalid', 2);

const reply = (
  lockVersion: number,
  rows: readonly StoredRow[],
  links: { operationNumber: number; seamKeys: string[] }[] = [],
): ChangeTechCardSeamsResponse => ({
  seams: wire(rows),
  links,
  lockVersion,
  keyMap: [],
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

function fakeBridge(over: Partial<SeamFormBridge> = {}, start = 7) {
  let version = start;
  const log: string[] = [];
  const adopted: SeamAdoption[] = [];
  const bridge: SeamFormBridge = {
    flush: async () => {
      log.push('flush');
      return INVALID;
    },
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
  return { bridge, log, adopted, setVersion: (v: number) => (version = v) };
}

const depsOf = (bridge: SeamFormBridge, call: SeamChangeDeps['call']): SeamChangeDeps => ({
  call,
  bridge: (id) => (id === CARD ? bridge : undefined),
});

beforeEach(() => {
  resetSeams();
  hydrateSeams(CARD, wire([a]), 7);
});

describe('seamFlushAnswer: only «does not validate» is marked as passable', () => {
  it('ok / nothing / off run; invalid refuses with the same words and the mark', () => {
    for (const r of ['ok', 'nothing', 'off'] as FlushResult[]) {
      expect(seamFlushAnswer(r)).toEqual({ ok: true });
    }
    expect(seamFlushAnswer('invalid', 2)).toEqual({
      ok: false,
      why: 'fix 2 fields first — the card saves itself once it validates',
      invalid: true,
    });
  });

  it('every other refusal carries no mark', () => {
    for (const r of ['error', 'busy', 'conflict', 'needs-confirm'] as FlushResult[]) {
      const ans = seamFlushAnswer(r, 0, 'bad body');
      expect(ans.ok).toBe(false);
      expect('invalid' in ans).toBe(false);
    }
  });
});

describe('a form that does not validate + a user gesture: the seam is written alone', () => {
  it('ACCEPT: one request at the saved version; the form adopts the new one', async () => {
    const f = fakeBridge();
    const sent: ChangeTechCardSeamsRequest[] = [];
    const res = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step, seamKey: b.seamKey }] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, async (req) => {
        sent.push(req);
        return reply(8, [a, b], [{ operationNumber: 10, seamKeys: [b.seamKey] }]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].expectedLockVersion).toBe(7);
    expect(sent[0].link).toEqual([{ operationNumber: 10, seamKey: b.seamKey }]);
    expect(f.log).toEqual(['flush', 'hold', 'adopt', 'release']);
    expect(f.adopted[0]).toMatchObject({ expected: 7, lockVersion: 8 });
    expect(keys()).toEqual([a.seamKey, b.seamKey]);
    expect(useSeamsStore.getState().serverVersion).toBe(8);
  });

  it('DETACH: the link goes, the row stays', async () => {
    const f = fakeBridge();
    const sent: ChangeTechCardSeamsRequest[] = [];
    const res = await runSeamChange(
      CARD,
      { detach: [{ step, seamKey: a.seamKey }] },
      { verb: 'removal', pastInvalidForm: true, gone: [a.seamKey] },
      depsOf(f.bridge, async (req) => {
        sent.push(req);
        return reply(8, [a]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(sent[0].detach).toEqual([{ operationNumber: 10, seamKey: a.seamKey }]);
    expect(f.log).toEqual(['flush', 'hold', 'adopt', 'release']);
  });

  it('POSE: placed poses go out the same way', async () => {
    const f = fakeBridge();
    const sent: ChangeTechCardSeamsRequest[] = [];
    const res = await runSeamChange(
      CARD,
      { upsert: [pose('P')], link: [{ step, seamKey: 'P' }] },
      { verb: 'placement', pastInvalidForm: true },
      depsOf(f.bridge, async (req) => {
        sent.push(req);
        return reply(8, [a, pose('P')], [{ operationNumber: 10, seamKeys: ['P'] }]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(f.adopted).toHaveLength(1);
  });

  it('MIRROR: a change built by a function, with rows it replaces', async () => {
    resetSeams();
    hydrateSeams(CARD, wire([a, b]), 7);
    const f = fakeBridge();
    const put = { ...c, seamKey: 'mirror-c' };
    const change = (): SeamChange => ({
      upsert: [put],
      link: [{ step, seamKey: put.seamKey }],
      detach: [{ step, seamKey: b.seamKey }],
    });
    const sent: ChangeTechCardSeamsRequest[] = [];
    const res = await runSeamChange(
      CARD,
      change,
      { verb: 'decisions (2)', gone: [b.seamKey], pastInvalidForm: true },
      depsOf(f.bridge, async (req) => {
        sent.push(req);
        return reply(8, [a, b, put], [{ operationNumber: 10, seamKeys: [put.seamKey] }]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(sent[0].expectedLockVersion).toBe(7);
    expect(useSeamsStore.getState().serverVersion).toBe(8);
  });
});

describe('what still refuses, with the option on', () => {
  it('a step never saved (number 0): «not saved», nothing sent, the optimistic row goes back', async () => {
    const f = fakeBridge();
    const call = vi.fn();
    const res = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step: { historyKey: 'new' }, seamKey: b.seamKey }] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, call),
    );
    expect(res).toEqual({ ok: false, why: NOT_SAVED });
    expect(call).not.toHaveBeenCalled();
    expect(useSeamsStore.getState().pending).toEqual({});
    expect(keys()).toEqual([a.seamKey]);
  });

  it('the touched step deleted in the form: «not saved»', async () => {
    const form = createFormControl<TechCardFormData>({
      defaultValues: {
        operations: [{ historyKey: 'h10', operationNumber: 10, seamKeys: [], poseKeys: [] }],
      } as unknown as TechCardFormData,
    });
    form.control._state.mount = true;
    form.setValue('operations', [] as unknown as TechCardFormData['operations']);
    expect(stepNumberOf(form, step)).toBe(0);
    const f = fakeBridge({ operationNumber: (s) => stepNumberOf(form, s) });
    const call = vi.fn();
    const res = await runSeamChange(
      CARD,
      { detach: [{ step, seamKey: a.seamKey }] },
      { verb: 'removal', pastInvalidForm: true },
      depsOf(f.bridge, call),
    );
    expect(res).toEqual({ ok: false, why: NOT_SAVED });
    expect(call).not.toHaveBeenCalled();
  });

  it.each(['error', 'busy', 'conflict', 'needs-confirm'] as FlushResult[])(
    'flush «%s»: refused as before, nothing held',
    async (r) => {
      const f = fakeBridge({ flush: async () => seamFlushAnswer(r) });
      const call = vi.fn();
      const res = await runSeamChange(
        CARD,
        { upsert: [b] },
        { verb: 'decision', pastInvalidForm: true },
        depsOf(f.bridge, call),
      );
      expect(res).toEqual({
        ok: false,
        why: seamFlushAnswer(r).ok ? '' : (seamFlushAnswer(r) as { why: string }).why,
      });
      expect(call).not.toHaveBeenCalled();
      expect(f.log).toEqual([]);
    },
  );

  it('without the option a form that does not validate refuses as now', async () => {
    const f = fakeBridge();
    const call = vi.fn();
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision' },
      depsOf(f.bridge, call),
    );
    expect(res).toEqual({ ok: false, why: (INVALID as { why: string }).why });
    expect(call).not.toHaveBeenCalled();
    expect(f.log).toEqual(['flush']);
  });
});

describe('a form that validates: the option changes nothing', () => {
  it('the same flush / hold / request with and without it', async () => {
    const run = async (pastInvalidForm?: boolean) => {
      resetSeams();
      hydrateSeams(CARD, wire([a]), 7);
      const f = fakeBridge({
        flush: async () => {
          f.log.push('flush');
          return { ok: true };
        },
      });
      const sent: ChangeTechCardSeamsRequest[] = [];
      const res = await runSeamChange(
        CARD,
        { upsert: [b], link: [{ step, seamKey: b.seamKey }] },
        { verb: 'decision', ...(pastInvalidForm ? { pastInvalidForm } : {}) },
        depsOf(f.bridge, async (req) => {
          sent.push(req);
          return reply(8, [a, b], [{ operationNumber: 10, seamKeys: [b.seamKey] }]);
        }),
      );
      return { res, log: f.log, sent, adopted: f.adopted };
    };
    expect(await run(true)).toEqual(await run());
  });
});

describe('a form that does not validate + lock_version_moved', () => {
  it('a version-only read: one retry at the version read', async () => {
    const f = fakeBridge();
    f.bridge.reread = async () => {
      f.setVersion(9);
      return { ok: true, card: { lockVersion: 9, seams: wire([a]) } as unknown as common_TechCard };
    };
    const claimed: (number | undefined)[] = [];
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, async (req) => {
        claimed.push(req.expectedLockVersion);
        if (claimed.length === 1) throw lockMoved();
        return reply(10, [a, b]);
      }),
    );
    expect(res.ok).toBe(true);
    expect(claimed).toEqual([7, 9]);
  });

  it('a read that would wipe unsaved edits (conflict): refused, no retry', async () => {
    const f = fakeBridge();
    f.bridge.reread = async () => ({
      ok: false,
      why: 'decide the conflict first — someone else saved this card meanwhile',
    });
    const call = vi.fn(async () => {
      throw lockMoved();
    });
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, call),
    );
    expect(res.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(useSeamsStore.getState().pending).toEqual({});
  });
});

describe('the real autosave machine: seam now, the body after the fix (the bridge comment’s worry)', () => {
  it('the seam lands on v+1, the error stays; the fixed body saves on v+1 and keeps the link', async () => {
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
    // The edit that does not validate: an empty style number.
    const valid = () => (form.getValues('styleNumber') ?? '') !== '';
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
      validate: async () => ({ ok: valid(), errors: valid() ? 0 : 1 }),
      countErrors: () => (valid() ? 0 : 1),
      onState: () => undefined,
      save: async () => {
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
    const bridge: SeamFormBridge = {
      flush: async (reason) => seamFlushAnswer(await machine.flush(reason), 1),
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

    // The operator breaks a field: the body cannot save.
    form.setValue('styleNumber', '', { shouldDirty: true });
    machine.notifyChange();
    await fire();
    expect(saves).toEqual([]);

    const res = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step, seamKey: b.seamKey }] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(bridge, async (req) => {
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
    expect(server).toEqual({ version: 8, styleNumber: 'S-1', links: [b.seamKey] });
    expect(base.version).toBe(8);
    expect(form.getValues('operations.0.seamKeys')).toEqual([b.seamKey]);
    expect(form.getFieldState('styleNumber').isDirty).toBe(true);
    await fire();
    expect(saves).toEqual([]); // still invalid: nothing written

    // The operator fixes the field: the body goes on version 8 and carries the link.
    form.setValue('styleNumber', 'S-2', { shouldDirty: true });
    machine.notifyChange();
    await fire();
    expect(saves).toEqual([{ version: 8, outcome: 'complete' }]);
    expect(server).toEqual({ version: 9, styleNumber: 'S-2', links: [b.seamKey] });
    machine.dispose();
  });
});

describe('the door judges the steps by the baseline past a form that does not validate', () => {
  const ops = (...ns: number[]) =>
    ns.map((n) => ({ historyKey: `h${n}`, operationNumber: n, seamKeys: [], poseKeys: [] }));
  const cardOf = (...ns: number[]) =>
    ({
      techCard: { operations: ns.map((n) => ({ operationNumber: n })) },
    }) as unknown as common_TechCard;
  const formOf = (base: number[], values: ReturnType<typeof ops>) => {
    const form = createFormControl<TechCardFormData>({
      defaultValues: { operations: ops(...base) } as unknown as TechCardFormData,
    });
    form.control._state.mount = true;
    form.setValue('operations', values as unknown as TechCardFormData['operations']);
    return form;
  };
  const PAST = { pastInvalidForm: true };

  it('a middle step deleted: strict refuses the whole card, the gesture path does not', () => {
    const form = formOf([10, 20, 30], ops(10, 30));
    expect(seamStepsAgreeOf(form, cardOf(10, 20, 30))).toBe(false);
    expect(seamStepsAgreeOf(form, cardOf(10, 20, 30), PAST)).toBe(true);
  });

  it('steps moved, or a new step added: the gesture path goes on', () => {
    expect(seamStepsAgreeOf(formOf([10, 20, 30], ops(30, 10, 20)), cardOf(10, 20, 30), PAST)).toBe(
      true,
    );
    const added = formOf([10, 20], [...ops(10), { ...ops(1)[0], operationNumber: 0 }, ...ops(20)]);
    expect(seamStepsAgreeOf(added, cardOf(10, 20), PAST)).toBe(true);
  });

  it('numbers older than the card (a save never read back): refused on both paths', () => {
    const form = formOf([10, 20], ops(10, 20));
    expect(seamStepsAgreeOf(form, cardOf(10, 20, 30))).toBe(false);
    expect(seamStepsAgreeOf(form, cardOf(10, 20, 30), PAST)).toBe(false);
  });

  it('a save landed while the steps moved back: live numbers name other server steps — refused', () => {
    // Server A10,B20; [B,A] saved as B10,A20 while the operator moved them back to [A,B].
    const form = createFormControl<TechCardFormData>({
      defaultValues: {
        operations: [
          { historyKey: 'hB', operationNumber: 10, seamKeys: [], poseKeys: [] },
          { historyKey: 'hA', operationNumber: 20, seamKeys: [], poseKeys: [] },
        ],
      } as unknown as TechCardFormData,
    });
    form.control._state.mount = true;
    form.setValue('operations', [
      { historyKey: 'hA', operationNumber: 10, seamKeys: [], poseKeys: [] },
      { historyKey: 'hB', operationNumber: 20, seamKeys: [], poseKeys: [] },
    ] as unknown as TechCardFormData['operations']);
    expect(seamStepsAgreeOf(form, cardOf(10, 20), PAST)).toBe(false);
  });

  it('runSeamChange asks the door for the baseline only when it passes an invalid form', async () => {
    const seen: unknown[] = [];
    const f = fakeBridge();
    const hold = f.bridge.hold;
    f.bridge.hold = (o) => {
      seen.push(o);
      return hold(o);
    };
    const call = async () => reply(8, [a, b]);
    await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, call),
    );
    f.bridge.flush = async () => ({ ok: true });
    resetSeams();
    hydrateSeams(CARD, wire([a]), 8);
    await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, call),
    );
    expect(seen).toEqual([{ pastInvalidForm: true }, undefined]);
  });

  it('a middle step deleted, the form invalid: accept on another step, detach a shared seam, then the fix saves both', async () => {
    // Steps 10, 20, 30; seam a is shared by 20 and 30. The operator deletes 20 (the form breaks).
    const server = {
      version: 7,
      steps: [
        { no: 10, links: [] as string[] },
        { no: 20, links: [a.seamKey] },
        { no: 30, links: [a.seamKey] },
      ],
    };
    const linksOut = () =>
      server.steps.map((s) => ({ operationNumber: s.no, seamKeys: [...s.links] }));
    const form = createFormControl<TechCardFormData>({
      defaultValues: {
        styleNumber: 'S-1',
        operations: [
          { historyKey: 'h10', operationNumber: 10, seamKeys: [], poseKeys: [] },
          { historyKey: 'h20', operationNumber: 20, seamKeys: [a.seamKey], poseKeys: [] },
          { historyKey: 'h30', operationNumber: 30, seamKeys: [a.seamKey], poseKeys: [] },
        ],
      } as unknown as TechCardFormData,
    });
    form.control._state.mount = true;
    const card = () =>
      ({
        techCard: { operations: server.steps.map((s) => ({ operationNumber: s.no })) },
      }) as unknown as common_TechCard;
    const base = { version: 7 };
    const door: SeamFormBridge = {
      flush: async () => INVALID,
      hold: async (o) => ({
        release: () => undefined,
        ...(seamStepsAgreeOf(form, card(), o) ? {} : { refused: NOT_SAVED }),
      }),
      version: () => base.version,
      operationNumber: (s) => stepNumberOf(form, s),
      adopt: (x) => {
        if (base.version === x.expected) base.version = x.lockVersion;
        adoptStepLinks(form, linksByOperation(x.links, x.seams));
      },
      reread: async () => ({ ok: false, why: 'unused' }),
    };
    const call = async (req: ChangeTechCardSeamsRequest) => {
      if (req.expectedLockVersion !== server.version) throw lockMoved();
      for (const l of req.link ?? [])
        server.steps.find((s) => s.no === l.operationNumber)!.links.push(l.seamKey!);
      for (const l of req.detach ?? []) {
        const st = server.steps.find((s) => s.no === l.operationNumber)!;
        st.links = st.links.filter((k) => k !== l.seamKey);
      }
      server.version += 1;
      return reply(server.version, [a, b], linksOut());
    };
    form.setValue(
      'operations',
      [
        form.getValues('operations.0'),
        form.getValues('operations.2'),
      ] as TechCardFormData['operations'],
      { shouldDirty: true },
    );

    // Strict: refused on the whole card.
    expect(
      await runSeamChange(
        CARD,
        { upsert: [b], link: [{ step: { historyKey: 'h10' }, seamKey: b.seamKey }] },
        { verb: 'decision' },
        depsOf(door, call),
      ),
    ).toMatchObject({ ok: false });

    // The gesture: accept b on step 10.
    const r1 = await runSeamChange(
      CARD,
      { upsert: [b], link: [{ step: { historyKey: 'h10' }, seamKey: b.seamKey }] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(door, call),
    );
    expect(r1.ok).toBe(true);
    // Detach the shared seam a from the live step 30.
    const r2 = await runSeamChange(
      CARD,
      { detach: [{ step: { historyKey: 'h30' }, seamKey: a.seamKey }] },
      { verb: 'removal', pastInvalidForm: true },
      depsOf(door, call),
    );
    expect(r2.ok).toBe(true);
    // A seam on the deleted step itself: refused.
    const r3 = await runSeamChange(
      CARD,
      { detach: [{ step: { historyKey: 'h20' }, seamKey: a.seamKey }] },
      { verb: 'removal', pastInvalidForm: true },
      depsOf(door, call),
    );
    expect(r3).toEqual({ ok: false, why: NOT_SAVED });

    expect(server.version).toBe(9);
    expect(base.version).toBe(9);
    expect(server.steps).toEqual([
      { no: 10, links: [b.seamKey] },
      { no: 20, links: [a.seamKey] },
      { no: 30, links: [] },
    ]);
    // The form: the deleted step still gone, the live ones carry the server's links.
    const vals = form.getValues('operations') as unknown as {
      historyKey: string;
      seamKeys: string[];
    }[];
    expect(vals.map((o) => [o.historyKey, o.seamKeys])).toEqual([
      ['h10', [b.seamKey]],
      ['h30', []],
    ]);

    // The fix: the body save renumbers positionally and sends each row's links — on version 9.
    const body = vals.map((o, i) => ({ no: (i + 1) * 10, links: [...o.seamKeys] }));
    expect(base.version).toBe(server.version);
    server.steps = body;
    expect(server.steps).toEqual([
      { no: 10, links: [b.seamKey] },
      { no: 20, links: [] },
    ]);
  });
});

describe('a body write that fails while the gesture waits (Codex review)', () => {
  it('the queued pass says «invalid» over the failure; the door says the failure and the seam stays home', async () => {
    const form = createFormControl<TechCardFormData>({
      defaultValues: { styleNumber: 'S-1' } as unknown as TechCardFormData,
    });
    form.control._state.mount = true;
    form.control._proxyFormState.isDirty = true;
    form.control._proxyFormState.dirtyFields = true;
    const valid = () => (form.getValues('styleNumber') ?? '') !== '';
    let failSave!: () => void;
    const machine = createAutosaveMachine({
      debounceMs: 10,
      retryDelaysMs: [],
      setTimer: (fn) => fn,
      clearTimer: () => undefined,
      now: () => Date.now(),
      isEnabled: () => true,
      isPaused: () => false,
      hasWork: () => form.control._getDirty(),
      validate: async () => ({ ok: valid(), errors: valid() ? 0 : 1 }),
      countErrors: () => (valid() ? 0 : 1),
      onState: () => undefined,
      save: () =>
        new Promise<SaveResult>((res) => {
          failSave = () => res({ outcome: 'error', message: 'network' });
        }),
    });
    // A valid edit goes on the wire.
    form.setValue('styleNumber', 'S-2', { shouldDirty: true });
    const first = machine.flush('typing');
    await new Promise((r) => setTimeout(r, 0));
    expect(machine.state().status).toBe('saving');
    // The operator breaks the form, then makes a seam gesture: the door as index.tsx wires it.
    form.setValue('styleNumber', '', { shouldDirty: true });
    const settled = new Promise<void>((r) => {
      const t = setInterval(() => {
        if (machine.state().status !== 'saving') {
          clearInterval(t);
          r();
        }
      }, 0);
    });
    const door = (async () => {
      await settled;
      const failed = machine.state().status === 'error';
      return seamFlushAnswer(await machine.flush('seam'), 1, undefined, failed);
    })();
    failSave();
    await first;
    const ans = await door;
    // The bare machine answers «invalid» for the queued pass…
    expect(await machine.flush('again')).toBe('invalid');
    // …but the door refuses as a failed save: no `invalid` mark, nothing a gesture may pass.
    expect(ans).toEqual({ ok: false, why: 'the card is not saved yet — the last save failed' });
    const f = fakeBridge({ flush: async () => ans });
    const call = vi.fn();
    const res = await runSeamChange(
      CARD,
      { upsert: [b] },
      { verb: 'decision', pastInvalidForm: true },
      depsOf(f.bridge, call),
    );
    expect(res.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
    machine.dispose();
  });

  it('seamFlushAnswer: «invalid» after a failed save is the failure', () => {
    expect(seamFlushAnswer('invalid', 1, undefined, true)).toEqual({
      ok: false,
      why: 'the card is not saved yet — the last save failed',
    });
    expect(seamFlushAnswer('invalid', 1, 'bad body', true)).toEqual({
      ok: false,
      why: 'the card is not saved — bad body',
    });
    expect(seamFlushAnswer('ok', 0, undefined, true)).toEqual({ ok: true });
  });
});
