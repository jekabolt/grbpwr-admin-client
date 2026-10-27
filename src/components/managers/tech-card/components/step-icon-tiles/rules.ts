// Direct modules, not the op-icons barrel: schema.ts imports these rules, and the barrel would
// drag the SVG component into every importer of the schema.
import type { IconKey } from '../../op-icons/icons.gen';
import type { OpIcon, OpIconInput, TopstitchAt } from '../../op-icons/op-icon';
import { SEAM_KINDS } from '../../op-icons/seam-kinds';

// Pure rules behind the step editor's icon tiles. Every write a tile makes is computed here, so the
// same rule the backend enforces (0436) is readable and tested in one place.

export const NO_SEAM_CLASS = 'TECH_CARD_SEAM_CLASS_UNKNOWN';
export const BOUND_SEAM_CLASS = 'TECH_CARD_SEAM_CLASS_BS_BOUND';
export const NO_BINDING_STYLE = 'TECH_CARD_BINDING_STYLE_UNKNOWN';
export const NO_ATTACH_PATTERN = 'TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN';
export const NO_PRESS_TOWARD = 'TECH_CARD_PRESS_TOWARD_UNKNOWN';

// --- seam kind -------------------------------------------------------------------------------

/**
 * A binding kind names its fold outright (backend `SeamKindBindingStyle`): tape = raw, open =
 * single fold, closed = double fold, frame = no fold at all (the server wants it empty).
 */
export const SEAM_KIND_BINDING_STYLE: Readonly<Record<string, string>> = {
  bound_tape: 'TECH_CARD_BINDING_STYLE_RAW',
  bound_open: 'TECH_CARD_BINDING_STYLE_SINGLE_FOLD',
  bound_closed: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD',
  bound_frame: NO_BINDING_STYLE,
};

export type KindTile = { token: string; label: string };

/** The binding row: these replace the old «binding fold» select. */
export const BIND_KIND_TILES: readonly KindTile[] = [
  { token: 'bound_tape', label: 'tape' },
  { token: 'bound_open', label: 'single fold' },
  { token: 'bound_closed', label: 'double fold' },
  { token: 'bound_frame', label: 'frame' },
];

/** The join row before «more»: the eight kinds a join step takes most often. */
export const JOIN_KIND_TILES: readonly KindTile[] = [
  { token: 'seam_edge', label: 'on edge' },
  { token: 'seam_one_side', label: 'one side' },
  { token: 'seam_open', label: 'pressed open' },
  { token: 'french', label: 'French' },
  { token: 'felled', label: 'felled' },
  { token: 'locked', label: 'locked' },
  { token: 'lapped_raw', label: 'raw lap' },
  { token: 'open_topstitched', label: 'open topstitched' },
];

/** Hem-only row: the narrow hems plus the blind and cover variants used on existing cards. */
export const HEM_KIND_TILES: readonly KindTile[] = [
  { token: 'moscow_hem', label: 'rolled' },
  { token: 'hem_raw', label: 'raw' },
  { token: 'hem_closed', label: 'closed' },
  { token: 'hem_zigzag', label: 'zigzag' },
  { token: 'blind_hem', label: 'blind' },
  { token: 'cover_hem', label: 'cover' },
];

export function seamKindDef(token: string) {
  return SEAM_KINDS.find((kind) => kind.token === token);
}

/** The full grid: every kind, in SEAM_KINDS order, grouped by its group. */
export function seamKindGroups(): { group: string; kinds: KindTile[] }[] {
  const groups: { group: string; kinds: KindTile[] }[] = [];
  for (const kind of SEAM_KINDS) {
    let bucket = groups.find((g) => g.group === kind.group);
    if (!bucket) {
      bucket = { group: kind.group, kinds: [] };
      groups.push(bucket);
    }
    bucket.kinds.push({ token: kind.token, label: kind.label });
  }
  return groups;
}

export function seamKindLabel(token: string): string {
  return (
    BIND_KIND_TILES.find((t) => t.token === token)?.label ??
    JOIN_KIND_TILES.find((t) => t.token === token)?.label ??
    seamKindDef(token)?.label ??
    token.replace(/_/g, ' ')
  );
}

/**
 * Does the kind fit this seam class? A token this bundle does not know is left alone: it is
 * newer than the client and the server is the one that judges it.
 */
export function kindFitsClass(token: string, seamClass: string): boolean {
  if (!token) return true;
  const def = seamKindDef(token);
  return !def || def.seamClass === seamClass;
}

const bindingStyleSet = (c: { bindingStyle: string }) =>
  !!c.bindingStyle && c.bindingStyle !== NO_BINDING_STYLE;

export type SeamKindWrite = { seamKind: string; seamClass?: string; bindingStyle?: string };

/**
 * What one tile click writes. Picking sets the kind AND its class explicitly (an inherited card
 * default does not count on the server) and, for binding, the fold. Picking a non-binding kind
 * drops a stored fold: the class is no longer binding, and a fold there is refused. Clearing
 * (token '') clears the kind, and on a binding row also the fold — the tiles are its only control.
 */
export function seamKindPick(
  token: string,
  current: { seamKind: string; bindingStyle: string },
): SeamKindWrite {
  if (!token) {
    const wasBound = current.seamKind in SEAM_KIND_BINDING_STYLE || !!bindingStyleSet(current);
    return wasBound ? { seamKind: '', bindingStyle: NO_BINDING_STYLE } : { seamKind: '' };
  }
  const def = seamKindDef(token);
  if (!def) return { seamKind: token };
  if (token in SEAM_KIND_BINDING_STYLE) {
    return {
      seamKind: token,
      seamClass: def.seamClass,
      bindingStyle: SEAM_KIND_BINDING_STYLE[token],
    };
  }
  return bindingStyleSet(current)
    ? { seamKind: token, seamClass: def.seamClass, bindingStyle: NO_BINDING_STYLE }
    : { seamKind: token, seamClass: def.seamClass };
}

/**
 * Which binding tile reads as selected: the stored kind, or — for a step saved before kinds
 * existed — the one its fold implies (shown, never written until clicked).
 */
export function bindTileSelection(
  seamKind: string,
  bindingStyle: string,
): { token: string; derived: boolean } {
  if (seamKind) return { token: seamKind, derived: false };
  const implied = Object.entries(SEAM_KIND_BINDING_STYLE).find(
    ([, style]) => style !== NO_BINDING_STYLE && style === bindingStyle,
  );
  return implied ? { token: implied[0], derived: true } : { token: '', derived: false };
}

// --- button holes ----------------------------------------------------------------------------

export const FOUR_HOLE_PATTERNS: ReadonlySet<string> = new Set([
  'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X',
  'TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE',
  'TECH_CARD_BUTTON_ATTACH_PATTERN_U_SHAPE',
]);

export type PatternTile = { value: string; label: string; icon: IconKey };

const FOUR_HOLE_TILES: readonly PatternTile[] = [
  { value: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X', label: 'cross', icon: 'button_cross_x' },
  { value: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL', label: 'parallel', icon: 'button_parallel' },
  { value: 'TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE', label: 'square', icon: 'button_square' },
  { value: 'TECH_CARD_BUTTON_ATTACH_PATTERN_U_SHAPE', label: 'U', icon: 'button_u_shape' },
  { value: 'TECH_CARD_BUTTON_ATTACH_PATTERN_OTHER', label: 'other', icon: 'button_other' },
];

const OTHER_PATTERN = 'TECH_CARD_BUTTON_ATTACH_PATTERN_OTHER';

/**
 * Pattern tiles for a hole count. Two holes take one bar only (parallel); «other» stays visible
 * there only while it is the stored value (the server allows it, the mockup does not offer it).
 * Unset holes offer the full four-hole set, as the select did before holes existed.
 */
export function patternTiles(holes: number, pattern: string): readonly PatternTile[] {
  if (holes !== 2) return FOUR_HOLE_TILES;
  const tiles: PatternTile[] = [
    {
      value: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL',
      label: 'one bar',
      icon: 'button_two_hole',
    },
  ];
  if (pattern === OTHER_PATTERN)
    tiles.push({ value: OTHER_PATTERN, label: 'other', icon: 'button_other' });
  return tiles;
}

/** Switching to two holes drops a pattern only four holes can make. */
export function patternAfterHoles(holes: number, pattern: string): string {
  return holes === 2 && FOUR_HOLE_PATTERNS.has(pattern) ? NO_ATTACH_PATTERN : pattern;
}

/**
 * The hole count the linked BOM articles agree on, or 0. Two articles that disagree give no
 * default: picking one of them silently would be a guess.
 */
export function articleHoles(
  bomLineKeys: readonly string[],
  bomLines: readonly { lineKey?: string; materialId?: number }[],
  materialHoles: (materialId: number) => number | undefined,
): number {
  const found = new Set<number>();
  for (const key of bomLineKeys) {
    const line = bomLines.find((l) => (l.lineKey ?? '').trim() === key.trim());
    if (!line?.materialId) continue;
    const holes = materialHoles(line.materialId);
    if (holes === 2 || holes === 4) found.add(holes);
  }
  return found.size === 1 ? [...found][0] : 0;
}

/** May the article's holes be copied onto the step? Only into an unset count, never against a
 *  pattern the copied count would make illegal. */
export function holesDefaultFits(stepHoles: number, articleHoleCount: number, pattern: string) {
  if (stepHoles !== 0 || (articleHoleCount !== 2 && articleHoleCount !== 4)) return false;
  return patternAfterHoles(articleHoleCount, pattern) === pattern;
}

// --- press toward ----------------------------------------------------------------------------

export type PressTile = { value: string; label: string; icon: OpIcon };

const press = (value: string, label: string, mark: Pick<OpIcon, 'arrow' | 'chip'>): PressTile => ({
  value: `TECH_CARD_PRESS_TOWARD_${value}`,
  label,
  icon: { key: 'press_to_one_side', ...mark },
});

/** One tile per `press.toward` value, arrows first, then the named sides (op-icon.ts maps). */
export const PRESS_TOWARD_TILES: readonly PressTile[] = [
  press('UP', 'up', { arrow: 'up' }),
  press('DOWN', 'down', { arrow: 'down' }),
  press('TOWARD_CENTER', 'to centre', { arrow: 'in' }),
  press('AWAY_FROM_CENTER', 'from centre', { arrow: 'out' }),
  press('FRONT', 'front', { chip: 'F' }),
  press('BACK', 'back', { chip: 'B' }),
  press('SLEEVE', 'sleeve', { chip: 'SL' }),
  press('BODY', 'body', { chip: 'BD' }),
  press('FACING', 'facing', { chip: 'FC' }),
  press('SHELL', 'shell', { chip: 'SH' }),
  press('LINING', 'lining', { chip: 'LN' }),
  press('OTHER', 'other', { chip: '?' }),
];

// --- topstitch rows --------------------------------------------------------------------------

/** 0 = unset; the server caps rows at 4 (entity.MaxTopstitchRows). */
export const TOPSTITCH_ROW_TILES = [0, 1, 2, 3, 4] as const;

export function topstitchAtOf(mode: string): TopstitchAt | undefined {
  if (mode === 'TECH_CARD_TOPSTITCH_MODE_EDGE') return 'edge';
  if (mode === 'TECH_CARD_TOPSTITCH_MODE_IN_DITCH') return 'in_ditch';
  if (mode === 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM') return 'parallel_to_seam';
  return undefined;
}

export function topstitchRowIcon(rows: number, mode: string): OpIcon {
  const at = topstitchAtOf(mode);
  if (rows < 1) return { key: 'topstitch' };
  return {
    key: 'topstitch',
    bars: Math.min(rows, 3) as 1 | 2 | 3,
    ...(rows > 3 ? { more: rows } : null),
    ...(at ? { at } : null),
  };
}

// --- the flat form row, read as an icon ------------------------------------------------------

/** The fields of a flat form operation the icon reads; names match the RHF operation row. */
export type IconFormRow = {
  work?: string;
  workVariant?: string;
  seamKind?: string;
  seamClass?: string;
  bindingStyle?: string;
  machineType?: string;
  operationType?: string;
  pressAction?: string;
  pressToward?: string;
  pressEquipment?: string;
  pressCloth?: string;
  topstitchMode?: string;
  topstitchRows?: number;
  needleCount?: number;
  attachPattern?: string;
  buttonHoles?: number;
  attachMethod?: string;
  zipperApplication?: string;
  buttonholeStyle?: string;
  trimAction?: string;
  printMethod?: string;
};

/** Same reading as `opIconInputOf` (adapter.ts), from the flat form row instead of the wire op. */
export function formRowOpIconInput(row: IconFormRow | undefined): OpIconInput {
  const r = row ?? {};
  return {
    work: r.work,
    workVariant: r.workVariant,
    seamKind: r.seamKind,
    seamClass: r.seamClass,
    seamClassExplicit: !!r.seamClass && r.seamClass !== NO_SEAM_CLASS,
    bindingStyle: r.bindingStyle,
    machineType: r.machineType,
    verb: r.operationType,
    pressAction: r.pressAction,
    pressToward: r.pressToward,
    pressEquipment: r.pressEquipment,
    pressCloth: r.pressCloth,
    topstitchMode: r.topstitchMode,
    topstitchRows: r.topstitchRows,
    needleCount: r.needleCount,
    attachPattern: r.attachPattern,
    buttonHoles: r.buttonHoles,
    attachMethod: r.attachMethod,
    zipperApplication: r.zipperApplication,
    buttonholeStyle: r.buttonholeStyle,
    trimAction: r.trimAction,
    printMethod: r.printMethod,
  };
}
