import { describe, expect, it } from 'vitest';

import type { common_TechCard, common_TechCardOperation } from 'api/proto-http/admin';

import { mapFormToTechCardInsert, mapTechCardToForm, techCardSchema } from './schema';

// 0436: seamKind, workVariant and fastening.buttonHoles. The save is a full replace of the
// operations, so a field the mappers forget is deleted on the next save of the card.

const op = (o: Record<string, unknown>) => o as unknown as common_TechCardOperation;

const card = (operations: common_TechCardOperation[]) =>
  ({
    id: 38,
    techCard: { operations },
  }) as unknown as common_TechCard;

const button = op({
  operationNumber: 10,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
  work: 'button_attach',
  fastening: {
    attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X',
    buttonHoles: 4,
  } as never,
});
const zip = op({
  operationNumber: 20,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING',
  work: 'set_zip',
  workVariant: 'two_way',
});
const bind = op({
  operationNumber: 30,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  work: 'bind_tape_edge',
  seamKind: 'bound_open',
  seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  stitching: { bindingStyle: 'TECH_CARD_BINDING_STYLE_SINGLE_FOLD' } as never,
});
// Tokens newer than this bundle ride back untouched.
const future = op({
  operationNumber: 40,
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  work: 'join_lockstitch',
  seamKind: 'future_kind',
  workVariant: 'future_variant',
  seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
});

describe('op icon fields round-trip card → form → payload', () => {
  const form = mapTechCardToForm(card([button, zip, bind, future]));
  const payload = mapFormToTechCardInsert(form);
  const ops = payload.operations ?? [];

  it('reads all three onto the flat form', () => {
    expect(form.operations?.[0]?.buttonHoles).toBe(4);
    expect(form.operations?.[1]?.workVariant).toBe('two_way');
    expect(form.operations?.[2]?.seamKind).toBe('bound_open');
  });

  it('writes them back exactly', () => {
    expect(ops[0]?.fastening?.buttonHoles).toBe(4);
    expect(ops[0]?.fastening?.attachPattern).toBe('TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X');
    expect(ops[1]?.work).toBe('set_zip');
    expect(ops[1]?.workVariant).toBe('two_way');
    expect(ops[2]?.seamKind).toBe('bound_open');
    expect(ops[2]?.seamClass).toBe('TECH_CARD_SEAM_CLASS_BS_BOUND');
    expect(ops[2]?.stitching?.bindingStyle).toBe('TECH_CARD_BINDING_STYLE_SINGLE_FOLD');
    expect(ops[3]?.seamKind).toBe('future_kind');
    expect(ops[3]?.workVariant).toBe('future_variant');
  });

  it('declares the payload aware, so the server takes the fields instead of refusing', () => {
    expect(payload.operationSeamKindAware).toBe(true);
    expect(payload.operationWorkAware).toBe(true);
  });

  it('a topstitch step keeps its edge across a save', () => {
    const turned = op({
      operationNumber: 50,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      work: 'topstitch',
      seamKind: 'faced_split',
      seamClass: 'TECH_CARD_SEAM_CLASS_EF_FACED',
      topstitch: { mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE', rows: 2 } as never,
    });
    const back = mapTechCardToForm(card([turned]));
    expect(back.operations?.[0]?.seamKind).toBe('faced_split');
    const out = mapFormToTechCardInsert(back).operations?.[0];
    expect(out?.seamKind).toBe('faced_split');
    expect(out?.seamClass).toBe('TECH_CARD_SEAM_CLASS_EF_FACED');
    expect(out?.topstitch?.mode).toBe('TECH_CARD_TOPSTITCH_MODE_EDGE');
    expect(out?.topstitch?.rows).toBe(2);
  });

  it('sends a cleared value as cleared', () => {
    const cleared = mapTechCardToForm(card([bind]));
    cleared.operations![0]!.seamKind = '';
    cleared.operations![0]!.workVariant = '';
    const out = mapFormToTechCardInsert(cleared).operations?.[0];
    expect(out?.seamKind).toBe('');
    expect(out?.workVariant).toBe('');
  });

  it('a step with no holes sends none (0 = unset, never a fact)', () => {
    const plain = mapFormToTechCardInsert(
      mapTechCardToForm(
        card([
          op({
            ...button,
            fastening: { attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL' },
          }),
        ]),
      ),
    ).operations?.[0];
    expect(plain?.fastening?.buttonHoles ?? 0).toBe(0);
    expect(plain?.fastening?.attachPattern).toBe('TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL');
  });
});

describe('op icon field checks mirror the server', () => {
  const issuesAt = (operations: common_TechCardOperation[]) => {
    const result = techCardSchema.safeParse(mapTechCardToForm(card(operations)));
    if (result.success) return [];
    return result.error.issues
      .filter((issue) => issue.path[0] === 'operations')
      .map((issue) => issue.path.slice(2).join('.'));
  };

  it('accepts consistent fields', () => {
    const issues = issuesAt([button, zip, bind]);
    expect(issues).not.toContain('seamKind');
    expect(issues).not.toContain('buttonHoles');
    expect(issues).not.toContain('attachPattern');
    expect(issues).not.toContain('workVariant');
  });

  it('refuses a kind of another class, and a binding kind with the wrong fold', () => {
    expect(issuesAt([op({ ...bind, seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN' })])).toContain(
      'seamKind',
    );
    expect(
      issuesAt([
        op({ ...bind, stitching: { bindingStyle: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD' } }),
      ]),
    ).toContain('seamKind');
    // A token newer than the bundle is the server's to judge.
    expect(issuesAt([future])).not.toContain('seamKind');
  });

  it('refuses two holes with a four-hole pattern, and holes off a button machine', () => {
    expect(
      issuesAt([op({ ...button, fastening: { ...button.fastening, buttonHoles: 2 } })]),
    ).toContain('attachPattern');
    expect(
      issuesAt([
        op({
          ...button,
          machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
          fastening: { buttonHoles: 2 },
        }),
      ]),
    ).toContain('buttonHoles');
  });

  it('refuses a type without its work', () => {
    expect(issuesAt([op({ ...zip, work: '' })])).toContain('workVariant');
  });
});
