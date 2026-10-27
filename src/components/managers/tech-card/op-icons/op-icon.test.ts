import { describe, expect, it } from 'vitest';
import { BAR_BASE, ICONS, ICON_ALIASES, OVERLAYS, type IconKey } from './icons.gen';
import {
  opIcon,
  WORK_ICON,
  WORK_TOKENS,
  WORK_VARIANT_ICON,
  type OpIcon,
  type OpIconInput,
} from './op-icon';
import { CLASS_KIND, SEAM_KINDS, SM_KIND } from './seam-kinds';

const card = { defaultSeamClass: 'TECH_CARD_SEAM_CLASS_SS_FRENCH' };

describe('operation icon registry', () => {
  it('gives every key a drawing and declares every identical alias', () => {
    expect(Object.keys(ICONS)).toHaveLength(201);
    for (const [key, drawing] of Object.entries(ICONS)) {
      expect(drawing.length, key).toBeGreaterThan(0);
    }
    for (const [alias, target] of Object.entries(ICON_ALIASES)) {
      expect(ICONS[alias as IconKey], alias).toEqual(ICONS[target as IconKey]);
    }
  });

  it('covers all seam kinds, catalog works, variants and design-quiz mappings', () => {
    expect(SEAM_KINDS).toHaveLength(38);
    expect(new Set(SEAM_KINDS.map((kind) => kind.token)).size).toBe(38);
    for (const kind of SEAM_KINDS) expect(ICONS[kind.token], kind.token).toBeDefined();
    for (const token of WORK_TOKENS) {
      expect(ICONS[WORK_ICON[token]], token).toBeDefined();
      expect(ICONS[opIcon({ work: token }, card).key], token).toBeDefined();
    }
    for (const [work, variants] of Object.entries(WORK_VARIANT_ICON)) {
      for (const [variant, key] of Object.entries(variants)) {
        expect(ICONS[key], `${work}.${variant}`).toBeDefined();
        expect(opIcon({ work, workVariant: variant }, card).key).toBe(key);
      }
    }
    for (const [seamClass, key] of Object.entries(CLASS_KIND)) {
      if (key) expect(ICONS[key], seamClass).toBeDefined();
    }
    for (const [sm, kind] of Object.entries(SM_KIND)) {
      expect(ICONS[kind], sm).toBeDefined();
    }
  });

  it('keeps overlay data complete', () => {
    expect(Object.keys(OVERLAYS.arrow).sort()).toEqual(['down', 'in', 'out', 'up']);
    expect(Object.keys(OVERLAYS.chip).sort()).toEqual([
      '?',
      'B',
      'BD',
      'F',
      'FC',
      'LN',
      'SH',
      'SL',
    ]);
    expect(Object.keys(BAR_BASE).sort()).toEqual([
      'hem_closed',
      'lapped_raw',
      'seam_one_side',
      'topstitch',
    ]);
    for (const family of Object.values(OVERLAYS.bars)) {
      expect(family[1]).toHaveLength(1);
      expect(family[2]).toHaveLength(2);
      expect(family[3]).toHaveLength(3);
    }
  });
});

describe('opIcon card 38 golden expectations', () => {
  const rows: Array<[number, OpIconInput, OpIcon]> = [
    [
      320,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
        seamClassExplicit: true,
        bindingStyle: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD',
      },
      { key: 'bound_closed', derived: true },
    ],
    [
      330,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
        seamClassExplicit: true,
        bindingStyle: 'TECH_CARD_BINDING_STYLE_SINGLE_FOLD',
      },
      { key: 'bound_open', derived: true },
    ],
    [
      340,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
        seamClassExplicit: true,
        bindingStyle: 'TECH_CARD_BINDING_STYLE_RAW',
      },
      { key: 'bound_tape', derived: true },
    ],
    [
      400,
      { work: 'button_attach', attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X' },
      { key: 'button_cross_x' },
    ],
    [
      410,
      { work: 'button_attach', attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL' },
      { key: 'button_parallel' },
    ],
    [
      420,
      { work: 'button_attach', attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE' },
      { key: 'button_square' },
    ],
    [
      430,
      { work: 'button_attach', attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_U_SHAPE' },
      { key: 'button_u_shape' },
    ],
    [
      440,
      { work: 'button_attach', attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_OTHER' },
      { key: 'button_other' },
    ],
    [450, { work: 'button_attach' }, { key: 'button_not_stated' }],
    [500, { verb: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' }, { key: 'press_open' }],
    [
      510,
      {
        verb: 'TECH_CARD_OPERATION_TYPE_PRESS',
        pressAction: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
        pressToward: 'TECH_CARD_PRESS_TOWARD_BACK',
      },
      { key: 'press_to_one_side', chip: 'B' },
    ],
    [
      520,
      {
        verb: 'TECH_CARD_OPERATION_TYPE_PRESS',
        pressAction: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
        pressToward: 'TECH_CARD_PRESS_TOWARD_UP',
      },
      { key: 'press_to_one_side', arrow: 'up' },
    ],
    [
      530,
      {
        verb: 'TECH_CARD_OPERATION_TYPE_PRESS',
        pressAction: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT',
      },
      { key: 'press_flat' },
    ],
    [
      540,
      {
        verb: 'TECH_CARD_OPERATION_TYPE_PRESS',
        pressAction: 'TECH_CARD_PRESS_ACTION_FINAL',
      },
      { key: 'press_final' },
    ],
    [
      600,
      { work: 'topstitch', topstitchRows: 1, topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE' },
      { key: 'topstitch', bars: 1, at: 'edge' },
    ],
    [
      610,
      { work: 'topstitch', topstitchRows: 2, topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE' },
      { key: 'topstitch', bars: 2, at: 'edge' },
    ],
    [
      620,
      {
        work: 'topstitch',
        topstitchRows: 3,
        topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM',
      },
      { key: 'topstitch', bars: 3, at: 'parallel_to_seam' },
    ],
    [
      650,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_SS_FRENCH',
        seamClassExplicit: true,
      },
      { key: 'french', derived: true },
    ],
    [
      660,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
        seamClassExplicit: true,
      },
      { key: 'felled', derived: true },
    ],
    [
      670,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
        seamClassExplicit: true,
      },
      { key: 'lapped_raw', derived: true },
    ],
    [
      680,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
        seamClassExplicit: true,
      },
      { key: 'hem_closed', derived: true },
    ],
    [
      690,
      {
        work: 'join_lockstitch',
        seamClass: 'TECH_CARD_SEAM_CLASS_EF_FACED',
        seamClassExplicit: true,
      },
      { key: 'faced_kant', derived: true },
    ],
  ];

  it.each(rows)('row %i', (_number, input, expected) => {
    expect(opIcon(input, card)).toEqual(expected);
  });
});

describe('opIcon modifiers and fallbacks', () => {
  it('renders four or more rows as three bars plus the real count', () => {
    expect(opIcon({ work: 'topstitch', topstitchRows: 4 }, card)).toEqual({
      key: 'topstitch',
      bars: 3,
      more: 4,
    });
    expect(
      opIcon(
        {
          seamKind: 'lapped_raw',
          topstitchRows: 7,
          topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
        },
        card,
      ),
    ).toEqual({
      key: 'lapped_raw',
      bars: 3,
      more: 7,
      at: 'edge',
    });
  });

  it('uses the two-hole drawing regardless of the four-hole pattern', () => {
    expect(
      opIcon(
        {
          work: 'button_attach',
          buttonHoles: 2,
          attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X',
        },
        card,
      ),
    ).toEqual({ key: 'button_two_hole' });
  });

  it('does not derive from an inherited class', () => {
    expect(
      opIcon(
        {
          work: 'cut',
          seamClass: 'TECH_CARD_SEAM_CLASS_SS_FRENCH',
          seamClassExplicit: false,
        },
        card,
      ),
    ).toEqual({ key: 'cut' });
  });

  it('applies existing-field variants with API enum spellings', () => {
    expect(
      opIcon(
        {
          work: 'set_zip',
          zipperApplication: 'TECH_CARD_ZIPPER_APPLICATION_INVISIBLE',
        },
        card,
      ),
    ).toEqual({ key: 'zip_invisible' });
    expect(
      opIcon({ work: 'set_zip', zipperApplication: 'TECH_CARD_ZIPPER_APPLICATION_LAPPED' }, card),
    ).toEqual({ key: 'set_zip', chip: 'LAP' });
    expect(
      opIcon(
        {
          work: 'snap_press_stud',
          attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRONG_CLINCH',
        },
        card,
      ),
    ).toEqual({ key: 'snap_prong' });
    expect(
      opIcon(
        {
          verb: 'TECH_CARD_OPERATION_TYPE_PRINT',
          printMethod: 'TECH_CARD_PRINT_METHOD_SCREEN',
        },
        card,
      ),
    ).toEqual({ key: 'screen_print' });
  });

  it('marks a completely unknown operation missing', () => {
    expect(
      opIcon({ work: 'future_work', machineType: 'future_machine', verb: 'future_verb' }, card),
    ).toEqual({
      key: 'sew',
      missing: true,
    });
  });
});
