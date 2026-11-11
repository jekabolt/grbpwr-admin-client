import { describe, expect, it } from 'vitest';
import { createFormControl } from 'react-hook-form';

import type { common_TechCard } from 'api/proto-http/admin';

import type { TechCardFormData } from '../schema';
import type { CardBase } from '../useTechCardAutosave';
import {
  adoptStepLinks,
  baseAfterSeamChange,
  serializeSeamWrite,
  stepNumberOf,
  stepNumbersAgree,
} from './seam-form-bridge';

type Op = { historyKey: string; operationNumber: number; seamKeys: string[]; poseKeys: string[] };

/** A form as the card page holds it: a baseline (the card read) and live values tracked for dirt. */
function cardForm(ops: Op[]) {
  const form = createFormControl<TechCardFormData>({
    defaultValues: { styleNumber: 'S-1', operations: ops } as unknown as TechCardFormData,
  });
  // A mounted useForm subscribes to these; the bare control tracks dirt only when asked.
  form.control._state.mount = true;
  form.control._proxyFormState.isDirty = true;
  form.control._proxyFormState.dirtyFields = true;
  return form;
}

const dirty = (form: ReturnType<typeof cardForm>, name: Parameters<typeof form.getFieldState>[0]) =>
  form.getFieldState(name).isDirty;

const op = (n: number, seamKeys: string[] = [], poseKeys: string[] = []): Op => ({
  historyKey: `h${n}`,
  operationNumber: n,
  seamKeys,
  poseKeys,
});

describe('adoptStepLinks — the committed links into the form (C7, invariant 2)', () => {
  it('a link the server wrote is clean: baseline and value both carry it', () => {
    const form = cardForm([op(10, ['a']), op(20, ['b'])]);
    const touched = adoptStepLinks(
      form,
      new Map([[10, { seamKeys: ['a', 'n'], poseKeys: ['p'] }]]),
    );
    expect(touched).toBe(1);
    expect(form.getValues('operations.0.seamKeys')).toEqual(['a', 'n']);
    expect(form.getValues('operations.0.poseKeys')).toEqual(['p']);
    expect(dirty(form, 'operations.0.seamKeys')).toBe(false);
    expect(dirty(form, 'operations.0.poseKeys')).toBe(false);
    expect(form.control._getDirty()).toBe(false);
  });

  it('a field edited while ACCEPT flew stays dirty with its value — the next write carries it', () => {
    const form = cardForm([op(10, ['a']), op(20, ['b'])]);
    form.setValue('styleNumber', 'S-2', { shouldDirty: true });
    adoptStepLinks(form, new Map([[10, { seamKeys: ['a', 'n'], poseKeys: [] }]]));
    expect(form.getValues('styleNumber')).toBe('S-2');
    expect(dirty(form, 'styleNumber')).toBe(true);
    expect(dirty(form, 'operations.0.seamKeys')).toBe(false);
  });

  it('a link edit of the operator on the same step stays on top of the server change', () => {
    const form = cardForm([op(10, ['a', 'x'])]);
    // The operator took x off meanwhile (unsaved); the server added n.
    form.setValue('operations.0.seamKeys', ['a'], { shouldDirty: true });
    adoptStepLinks(form, new Map([[10, { seamKeys: ['a', 'x', 'n'], poseKeys: [] }]]));
    expect(form.getValues('operations.0.seamKeys')).toEqual(['a', 'n']);
    // Against the new baseline (a, x, n) the removal of x is still the operator's unsaved edit.
    expect(dirty(form, 'operations.0.seamKeys')).toBe(true);
  });

  it('finds the step by identity when the list moved, and skips a number two steps share', () => {
    const form = cardForm([op(10, ['a']), op(20, ['b']), { ...op(20, ['c']), historyKey: 'twin' }]);
    // A step inserted on top meanwhile: the baseline row is found by its historyKey.
    form.setValue(
      'operations',
      [op(0), op(10, ['a']), op(20, ['b']), { ...op(20, ['c']), historyKey: 'twin' }] as never,
      { shouldDirty: true },
    );
    adoptStepLinks(
      form,
      new Map([
        [10, { seamKeys: ['a', 'n'], poseKeys: [] }],
        [20, { seamKeys: ['zzz'], poseKeys: [] }],
      ]),
    );
    expect(form.getValues('operations.1.seamKeys')).toEqual(['a', 'n']);
    expect(form.getValues('operations.2.seamKeys')).toEqual(['b']);
    expect(form.getValues('operations.3.seamKeys')).toEqual(['c']);
  });

  it('stepNumberOf: the stored number by identity, 0 when gone or never saved', () => {
    const form = cardForm([op(10), op(0)]);
    expect(stepNumberOf(form, { historyKey: 'h10' })).toBe(10);
    expect(stepNumberOf(form, { historyKey: 'h0' })).toBe(0);
    expect(stepNumberOf(form, { historyKey: 'gone' })).toBe(0);
  });
});

describe('serializeSeamWrite — one seam write of a card at a time', () => {
  it('runs in the order asked; a failure does not stop the next', async () => {
    const log: string[] = [];
    let release!: () => void;
    const first = serializeSeamWrite(5, async () => {
      log.push('1 start');
      await new Promise<void>((r) => (release = r));
      log.push('1 end');
      throw new Error('refused');
    });
    const second = serializeSeamWrite(5, async () => {
      log.push('2 start');
      return 2;
    });
    const other = serializeSeamWrite(6, async () => {
      log.push('other card');
      return 6;
    });
    await other;
    expect(log).toEqual(['1 start', 'other card']);
    release();
    await expect(first).rejects.toThrow('refused');
    await expect(second).resolves.toBe(2);
    expect(log).toEqual(['1 start', 'other card', '1 end', '2 start']);
  });
});

describe('baseAfterSeamChange — the card the page stands on after the change', () => {
  const card = {
    id: 7,
    lockVersion: 41,
    techCard: { operations: [{ operationNumber: 10, seamKeys: [] }] },
  } as unknown as common_TechCard;
  const adoption = {
    expected: 41,
    lockVersion: 42,
    links: [{ operationNumber: 10, seamKeys: ['n'] }],
    seams: [],
  };

  it('moves the version and the links of the card it read', () => {
    const next = baseAfterSeamChange({ version: 41, card }, adoption);
    expect(next?.version).toBe(42);
    expect(next?.card?.lockVersion).toBe(42);
    expect(next?.card?.techCard?.operations?.[0].seamKeys).toEqual(['n']);
  });

  it('moves the body it sent when no card was read back', () => {
    const base: CardBase = {
      version: 41,
      card: null,
      sent: { body: { operations: [{ operationNumber: 10, seamKeys: [] }] }, echo: undefined },
    };
    const next = baseAfterSeamChange(base, adoption);
    expect(next?.card).toBeNull();
    expect(next?.sent?.body.operations).toEqual([{ operationNumber: 10, seamKeys: ['n'] }]);
  });

  it('a page no longer on the version the request claimed builds on nothing', () => {
    expect(baseAfterSeamChange({ version: 43, card }, adoption)).toBeNull();
  });
});

describe('stepNumbersAgree — the form addresses the steps the card holds', () => {
  const card = {
    techCard: { operations: [{ operationNumber: 10 }, { operationNumber: 20 }] },
  } as unknown as common_TechCard;

  it('same numbers in order; steps not stored yet are left out', () => {
    expect(
      stepNumbersAgree(
        [{ operationNumber: 10 }, { operationNumber: 0 }, { operationNumber: 20 }],
        card,
      ),
    ).toBe(true);
  });

  it('numbers from before a save never read back do not agree', () => {
    expect(stepNumbersAgree([{ operationNumber: 20 }, { operationNumber: 30 }], card)).toBe(false);
    expect(stepNumbersAgree([{ operationNumber: 10 }], card)).toBe(false);
  });
});
