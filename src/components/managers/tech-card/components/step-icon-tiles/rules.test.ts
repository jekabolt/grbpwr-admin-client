import { describe, expect, it } from 'vitest';

import type { common_TechCardOperation } from 'api/proto-http/admin';

import { opIcon, opIconInputOf, SEAM_KINDS } from '../../op-icons';
import { mapTechCardToForm } from '../schema';
import {
  articleHoles,
  BIND_KIND_TILES,
  bindTileSelection,
  formRowOpIconInput,
  HEM_KIND_TILES,
  holesDefaultFits,
  JOIN_KIND_TILES,
  kindFitsClass,
  NO_ATTACH_PATTERN,
  NO_BINDING_STYLE,
  NO_SEAM_CLASS,
  patternAfterHoles,
  patternTiles,
  PRESS_TOWARD_TILES,
  SEAM_KIND_BINDING_STYLE,
  seamKindGroups,
  seamKindPick,
  TOPSTITCH_EDGE_KINDS,
  topstitchEdgeOptions,
  topstitchEdgePick,
  topstitchRowIcon,
  topstitchRowTileStates,
} from './rules';

const BOUND = 'TECH_CARD_SEAM_CLASS_BS_BOUND';
const CROSS = 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X';
const PARALLEL = 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL';
const OTHER = 'TECH_CARD_BUTTON_ATTACH_PATTERN_OTHER';

describe('seam kind tiles', () => {
  it('every tile is a known kind; the binding row is exactly the bs_bound kinds', () => {
    const known = new Set<string>(SEAM_KINDS.map((k) => k.token));
    for (const t of [...BIND_KIND_TILES, ...JOIN_KIND_TILES]) expect(known.has(t.token)).toBe(true);
    expect(BIND_KIND_TILES.map((t) => t.token).sort()).toEqual(
      SEAM_KINDS.filter((k) => k.seamClass === BOUND)
        .map((k) => k.token)
        .sort(),
    );
    expect(Object.keys(SEAM_KIND_BINDING_STYLE).sort()).toEqual(
      BIND_KIND_TILES.map((t) => t.token).sort(),
    );
    expect(JOIN_KIND_TILES).toHaveLength(8);
    expect(HEM_KIND_TILES.map((t) => t.token)).toEqual([
      'moscow_hem',
      'hem_raw',
      'hem_closed',
      'hem_zigzag',
      'blind_hem',
      'cover_hem',
    ]);
    expect(seamKindGroups().flatMap((g) => g.kinds)).toHaveLength(SEAM_KINDS.length);
  });

  it('a binding pick sets kind, class and fold together (frame = no fold)', () => {
    const current = { seamKind: '', bindingStyle: NO_BINDING_STYLE };
    expect(seamKindPick('bound_tape', current)).toEqual({
      seamKind: 'bound_tape',
      seamClass: BOUND,
      bindingStyle: 'TECH_CARD_BINDING_STYLE_RAW',
    });
    expect(seamKindPick('bound_closed', current).bindingStyle).toBe(
      'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD',
    );
    expect(seamKindPick('bound_frame', current).bindingStyle).toBe(NO_BINDING_STYLE);
  });

  it('a join pick sets its class and drops a stored fold', () => {
    expect(seamKindPick('french', { seamKind: '', bindingStyle: NO_BINDING_STYLE })).toEqual({
      seamKind: 'french',
      seamClass: 'TECH_CARD_SEAM_CLASS_SS_FRENCH',
    });
    expect(
      seamKindPick('felled', {
        seamKind: 'bound_open',
        bindingStyle: 'TECH_CARD_BINDING_STYLE_SINGLE_FOLD',
      }),
    ).toEqual({
      seamKind: 'felled',
      seamClass: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
      bindingStyle: NO_BINDING_STYLE,
    });
  });

  it('clearing drops the kind, and on a binding row the fold too; the class stays', () => {
    expect(
      seamKindPick('', {
        seamKind: 'bound_open',
        bindingStyle: 'TECH_CARD_BINDING_STYLE_SINGLE_FOLD',
      }),
    ).toEqual({ seamKind: '', bindingStyle: NO_BINDING_STYLE });
    expect(seamKindPick('', { seamKind: 'french', bindingStyle: NO_BINDING_STYLE })).toEqual({
      seamKind: '',
    });
  });

  it('a step saved before kinds shows the kind its fold implies, as derived', () => {
    expect(bindTileSelection('', 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD')).toEqual({
      token: 'bound_closed',
      derived: true,
    });
    expect(bindTileSelection('bound_frame', NO_BINDING_STYLE)).toEqual({
      token: 'bound_frame',
      derived: false,
    });
    expect(bindTileSelection('', NO_BINDING_STYLE)).toEqual({ token: '', derived: false });
  });

  it('a kind fits only its own class; an unknown token is never judged here', () => {
    expect(kindFitsClass('french', 'TECH_CARD_SEAM_CLASS_SS_FRENCH')).toBe(true);
    expect(kindFitsClass('french', 'TECH_CARD_SEAM_CLASS_SS_PLAIN')).toBe(false);
    expect(kindFitsClass('future_kind', 'TECH_CARD_SEAM_CLASS_SS_PLAIN')).toBe(true);
    expect(kindFitsClass('', 'TECH_CARD_SEAM_CLASS_SS_PLAIN')).toBe(true);
  });
});

describe('button holes', () => {
  it('two holes offer one bar only; four (or unset) offer all five', () => {
    expect(patternTiles(2, NO_ATTACH_PATTERN).map((t) => t.value)).toEqual([PARALLEL]);
    expect(patternTiles(2, NO_ATTACH_PATTERN)[0].icon).toBe('button_two_hole');
    expect(patternTiles(2, OTHER).map((t) => t.value)).toEqual([PARALLEL, OTHER]);
    expect(patternTiles(4, NO_ATTACH_PATTERN)).toHaveLength(5);
    expect(patternTiles(0, NO_ATTACH_PATTERN)).toHaveLength(5);
  });

  it('switching to two drops a four-hole pattern, keeps parallel and other', () => {
    expect(patternAfterHoles(2, CROSS)).toBe(NO_ATTACH_PATTERN);
    expect(patternAfterHoles(2, 'TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE')).toBe(NO_ATTACH_PATTERN);
    expect(patternAfterHoles(2, 'TECH_CARD_BUTTON_ATTACH_PATTERN_U_SHAPE')).toBe(NO_ATTACH_PATTERN);
    expect(patternAfterHoles(2, PARALLEL)).toBe(PARALLEL);
    expect(patternAfterHoles(2, OTHER)).toBe(OTHER);
    expect(patternAfterHoles(4, CROSS)).toBe(CROSS);
  });

  it('the article default: one agreed count, only into an unset step, never against the pattern', () => {
    const lines = [
      { lineKey: 'a', materialId: 1 },
      { lineKey: 'b', materialId: 2 },
      { lineKey: 'c', materialId: 3 },
    ];
    const holes: Record<number, number | undefined> = { 1: 4, 2: 2, 3: undefined };
    const of = (id: number) => holes[id];
    expect(articleHoles(['a'], lines, of)).toBe(4);
    expect(articleHoles(['a', 'c'], lines, of)).toBe(4);
    expect(articleHoles(['a', 'b'], lines, of)).toBe(0);
    expect(articleHoles(['c'], lines, of)).toBe(0);
    expect(articleHoles([], lines, of)).toBe(0);
    expect(holesDefaultFits(0, 4, CROSS)).toBe(true);
    expect(holesDefaultFits(0, 2, CROSS)).toBe(false);
    expect(holesDefaultFits(0, 2, PARALLEL)).toBe(true);
    expect(holesDefaultFits(4, 2, PARALLEL)).toBe(false);
    expect(holesDefaultFits(0, 0, PARALLEL)).toBe(false);
  });
});

describe('press toward tiles', () => {
  it('one tile per press.toward value, drawn the way the step icon draws it', () => {
    expect(PRESS_TOWARD_TILES).toHaveLength(12);
    expect(new Set(PRESS_TOWARD_TILES.map((t) => t.value)).size).toBe(12);
    for (const t of PRESS_TOWARD_TILES) {
      const icon = opIcon(
        {
          verb: 'TECH_CARD_OPERATION_TYPE_PRESS',
          pressAction: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
          pressToward: t.value,
        },
        {},
      );
      expect(icon).toEqual(t.icon);
    }
  });
});

describe('topstitch rows', () => {
  it.each([
    { rows: 0, pressed: false, iconRows: 4, nextRows: 4 },
    { rows: 3, pressed: false, iconRows: 4, nextRows: 4 },
    { rows: 4, pressed: true, iconRows: 4, nextRows: 0 },
    { rows: 7, pressed: true, iconRows: 7, nextRows: 0 },
    { rows: 10, pressed: true, iconRows: 10, nextRows: 0 },
  ])('makes 4+ the exact-count toggle at $rows rows', (expected) => {
    const states = topstitchRowTileStates(expected.rows);
    expect(states.filter((tile) => tile.pressed).map((tile) => tile.label)).toEqual([
      expected.pressed ? '4+' : String(expected.rows),
    ]);
    expect(states.at(-1)).toEqual({
      value: 4,
      label: '4+',
      pressed: expected.pressed,
      iconRows: expected.iconRows,
      nextRows: expected.nextRows,
    });
  });

  it('keeps an out-of-range stored count visible for correction', () => {
    expect(topstitchRowTileStates(11).at(-1)).toMatchObject({
      label: '4+',
      pressed: true,
      iconRows: 11,
    });
  });

  it('previews bars up to three, then the count', () => {
    expect(topstitchRowIcon(0, '')).toEqual({ key: 'topstitch' });
    expect(topstitchRowIcon(2, 'TECH_CARD_TOPSTITCH_MODE_EDGE')).toEqual({
      key: 'topstitch',
      bars: 2,
      at: 'edge',
    });
    expect(topstitchRowIcon(4, '')).toEqual({ key: 'topstitch', bars: 3, more: 4 });
  });

  it('draws the bars on the step edge when its kind takes rows', () => {
    expect(topstitchRowIcon(2, '', 'faced_split')).toEqual({ key: 'faced_split', bars: 2 });
    expect(topstitchRowIcon(1, '', 'hem_raw')).toEqual({ key: 'hem_raw', bars: 1 });
    expect(topstitchRowIcon(0, '', 'hem_closed')).toEqual({ key: 'hem_closed' });
    expect(topstitchRowIcon(2, '', 'seam_open')).toEqual({ key: 'topstitch', bars: 2 });
  });

  it('prints a topstitched collar edge with its rows', () => {
    expect(
      opIcon(
        {
          seamKind: 'faced_split',
          topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
          topstitchRows: 2,
        },
        {},
      ),
    ).toEqual({ key: 'faced_split', bars: 2, at: 'edge' });
  });
});

describe('the form row reads as the wire op does', () => {
  it('gives the same icon as opIconInputOf on the saved operation', () => {
    const ops = [
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
        fastening: { attachPattern: CROSS, buttonHoles: 2 },
      },
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        press: {
          action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
          toward: 'TECH_CARD_PRESS_TOWARD_SLEEVE',
        },
      },
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        work: 'join_lockstitch',
        seamClass: BOUND,
        stitching: { bindingStyle: 'TECH_CARD_BINDING_STYLE_RAW' },
      },
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        seamKind: 'lapped_raw',
        seamClass: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
        topstitch: { mode: 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM', rows: 2 },
      },
      {
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING',
        work: 'set_zip',
        workVariant: 'two_way',
      },
    ] as unknown as common_TechCardOperation[];
    const form = mapTechCardToForm({ techCard: { operations: ops } } as never);
    ops.forEach((o, i) => {
      expect(opIcon(formRowOpIconInput(form.operations?.[i] as never), {})).toEqual(
        opIcon(opIconInputOf(o), {}),
      );
    });
  });
});

describe('the edge of a topstitch step', () => {
  const FACED = 'TECH_CARD_SEAM_CLASS_EF_FACED';
  const HEM_RAW = 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW';
  const HEM_TURNED = 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED';
  const EDGE = 'TECH_CARD_TOPSTITCH_MODE_EDGE';
  const step = (over: Partial<Parameters<typeof topstitchEdgePick>[1]> = {}) => ({
    seamKind: '',
    seamClass: NO_SEAM_CLASS,
    bindingStyle: NO_BINDING_STYLE,
    topstitchMode: EDGE,
    ...over,
  });

  it('labels map to seam kinds and back', () => {
    const items = topstitchEdgeOptions('');
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['plain', ''],
      ['turned', 'faced_split'],
      ['hem single', 'hem_raw'],
      ['hem double', 'hem_closed'],
    ]);
    for (const kind of ['faced_split', 'hem_raw', 'hem_closed']) {
      const shown = topstitchEdgeOptions(kind);
      expect(shown).toEqual(items);
      expect(shown.find((i) => i.value === kind)?.label).toBe(
        items.find((i) => i.value === kind)?.label,
      );
    }
  });

  it('shows any other stored kind as it stands', () => {
    expect(topstitchEdgeOptions('seam_open').at(-1)).toEqual({
      value: 'seam_open',
      label: 'pressed open',
    });
    expect(topstitchEdgeOptions('future_kind').at(-1)).toEqual({
      value: 'future_kind',
      label: 'future_kind — unknown to this app version',
    });
  });

  it('writes the class of the edge it picks', () => {
    expect(topstitchEdgePick('faced_split', step())).toEqual({
      seamKind: 'faced_split',
      seamClass: FACED,
    });
    expect(topstitchEdgePick('hem_raw', step())).toEqual({
      seamKind: 'hem_raw',
      seamClass: HEM_RAW,
    });
    expect(topstitchEdgePick('hem_closed', step())).toEqual({
      seamKind: 'hem_closed',
      seamClass: HEM_TURNED,
    });
  });

  it('keeps a step without a mode a topstitch', () => {
    expect(
      topstitchEdgePick('faced_split', step({ topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN' })),
    ).toEqual({ seamKind: 'faced_split', seamClass: FACED, topstitchMode: EDGE });
  });

  it('plain clears the kind and the class it brought, and only that class', () => {
    expect(topstitchEdgePick('', step({ seamKind: 'faced_split', seamClass: FACED }))).toEqual({
      seamKind: '',
      seamClass: NO_SEAM_CLASS,
    });
    expect(
      topstitchEdgePick(
        '',
        step({ seamKind: 'faced_split', seamClass: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH' }),
      ),
    ).toEqual({ seamKind: '' });
  });

  it('a topstitch step on a turned edge with two rows draws the turned glyph', () => {
    expect(topstitchRowIcon(2, EDGE, 'faced_split')).toEqual({
      key: 'faced_split',
      bars: 2,
      at: 'edge',
    });
    expect(
      opIcon(
        formRowOpIconInput({
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
          work: 'topstitch',
          seamKind: 'faced_split',
          seamClass: FACED,
          topstitchMode: EDGE,
          topstitchRows: 2,
        }),
        {},
      ),
    ).toMatchObject({ key: 'faced_split', bars: 2 });
    expect(TOPSTITCH_EDGE_KINDS).toEqual(new Set(['faced_split', 'hem_raw', 'hem_closed']));
  });
});
