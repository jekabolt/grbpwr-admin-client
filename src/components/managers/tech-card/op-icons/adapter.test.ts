import { describe, expect, it } from 'vitest';

import type { common_TechCardInsert, common_TechCardOperation } from 'api/proto-http/admin';

import { opIconCardOf, opIconInputOf } from './adapter';
import { opIcon } from './op-icon';

const insert = {
  construction: { defaultSeamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN' },
} as unknown as common_TechCardInsert;
const card = opIconCardOf(insert);
const op = (o: Partial<common_TechCardOperation> & Record<string, unknown>) =>
  o as unknown as common_TechCardOperation;
const iconOf = (o: common_TechCardOperation) => opIcon(opIconInputOf(o), card);

describe('opIconInputOf', () => {
  it('reads the card default seam class', () => {
    expect(card).toEqual({ defaultSeamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN' });
    expect(opIconCardOf(undefined)).toEqual({ defaultSeamClass: undefined });
  });

  it('binds a double-fold edge from the stored seam class and binding style', () => {
    const o = op({
      operationNumber: 320,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      work: 'join_lockstitch',
      seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
      stitching: { bindingStyle: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD' } as never,
    });
    expect(opIconInputOf(o)).toMatchObject({
      seamClassExplicit: true,
      bindingStyle: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD',
      verb: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    });
    expect(iconOf(o)).toEqual({ key: 'bound_closed', derived: true });
  });

  it('treats an unset seam class as inherited, not stored', () => {
    const o = op({ work: 'join_lockstitch', seamClass: 'TECH_CARD_SEAM_CLASS_UNKNOWN' });
    expect(opIconInputOf(o).seamClassExplicit).toBe(false);
    expect(iconOf(o)).toEqual({ key: 'join_lockstitch' });
  });

  it('sews a button with a cross pattern', () => {
    const o = op({
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
      work: 'button_attach',
      fastening: { attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X' } as never,
    });
    expect(iconOf(o)).toEqual({ key: 'button_cross_x' });
  });

  it('reads the two-hole count from fastening.buttonHoles', () => {
    const o = op({
      work: 'button_attach',
      fastening: {
        attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X',
        buttonHoles: 2,
      } as never,
    });
    expect(opIconInputOf(o).buttonHoles).toBe(2);
    expect(iconOf(o)).toEqual({ key: 'button_two_hole' });
  });

  it('presses seam allowance to the back', () => {
    const o = op({
      operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
      press: {
        action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
        toward: 'TECH_CARD_PRESS_TOWARD_BACK',
      },
    });
    expect(iconOf(o)).toEqual({ key: 'press_to_one_side', chip: 'B' });
  });

  it('presses a seam open', () => {
    const o = op({ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' });
    expect(iconOf(o)).toEqual({ key: 'press_open' });
  });

  it('topstitches two rows at the edge', () => {
    const o = op({
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE',
      work: 'topstitch',
      topstitch: { mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE', rows: 2 } as never,
    });
    expect(iconOf(o)).toEqual({ key: 'topstitch', bars: 2, at: 'edge' });
  });

  it('reads the seam kind and work variant', () => {
    expect(iconOf(op({ work: 'set_zip', workVariant: 'two_way' }))).toEqual({
      key: 'zip_two_way',
    });
    const input = opIconInputOf(op({ seamKind: 'bound_tape', work: 'join_lockstitch' }));
    expect(input.seamKind).toBe('bound_tape');
  });

  it('marks a work the registry does not know as missing', () => {
    const o = op({ work: 'laser_engrave' });
    expect(iconOf(o)).toEqual({ key: 'sew', missing: true });
  });
});
