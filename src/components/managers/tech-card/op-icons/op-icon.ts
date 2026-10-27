import { BAR_BASE, ICONS, type IconKey } from './icons.gen';
import { CLASS_KIND } from './seam-kinds';

export type TopstitchAt = 'edge' | 'in_ditch' | 'parallel_to_seam';
export type PressArrow = 'up' | 'down' | 'in' | 'out';
export type IconChip =
  | 'F'
  | 'B'
  | 'SL'
  | 'BD'
  | 'FC'
  | 'SH'
  | 'LN'
  | '?'
  | 'CTR'
  | 'LAP'
  | 'EXP'
  | 'FLY';

export type OpIcon = {
  key: IconKey;
  bars?: 0 | 1 | 2 | 3;
  more?: number;
  at?: TopstitchAt;
  arrow?: PressArrow;
  chip?: IconChip;
  derived?: true;
  missing?: true;
};

/** Plain adapter boundary. Values are the generated protobuf strings exactly as the API emits them. */
export type OpIconInput = {
  work?: string | null;
  workVariant?: string | null;
  seamKind?: string | null;
  seamClass?: string | null;
  seamClassExplicit?: boolean;
  bindingStyle?: string | null;
  machineType?: string | null;
  verb?: string | null;
  pressAction?: string | null;
  pressToward?: string | null;
  pressEquipment?: string | null;
  pressCloth?: string | null;
  topstitchMode?: string | null;
  topstitchRows?: number | null;
  needleCount?: number | null;
  attachPattern?: string | null;
  buttonHoles?: number | null;
  attachMethod?: string | null;
  zipperApplication?: string | null;
  buttonholeStyle?: string | null;
  trimAction?: string | null;
  printMethod?: string | null;
};

export type OpIconCard = { defaultSeamClass?: string | null };

export const WORK_TOKENS = [
  'join_lockstitch',
  'chainstitch',
  'coverstitch',
  'coverlock',
  'zigzag',
  'blindhem',
  'moscow_hem',
  'hem_turned',
  'overlock_serge',
  'tape_seam_hot_air',
  'ultrasonic_weld',
  'gather',
  'gather_ease',
  'ease_in',
  'attach_elastic',
  'attach_label',
  'slit_overcast',
  'bartack',
  'embroidery',
  'amf_handstitch_imitation',
  'machine_other',
  'patch_pocket_automat',
  'welt_pocket_automat',
  'template_automat',
  'collar_cuff_automat',
  'sleeve_setting_automat',
  'waistband_automat',
  'set_hardware',
  'snap_press_stud',
  'rivet_burr',
  'eyelet_grommet',
  'buckle_slider',
  'hardware_sewn',
  'set_zip',
  'print_transfer',
  'wet_process',
  'trim_allowance',
  'thread_trim',
  'clean',
  'inspect_inline',
  'quality_control_final',
  'fold',
  'pack',
  'hand_work',
  'other',
  'press_flat',
  'press_steam',
  'press_final',
  'press_ease_in',
  'press_stretch',
  'press_mould',
  'press_open',
  'press_to_one_side',
  'fuse',
  'topstitch',
  'bind_tape_edge',
  'button_attach',
  'buttonhole',
  'set_magnet',
  'attach_hook',
  'cord_stopper',
  'aglet',
  'd_ring',
  'zip_puller',
  'hood_adjuster',
  'enclose_magnet',
  'attach_hook_loop',
  'snap_tape',
  'cord_loop',
  'buttonhole_bound',
  'eyelet_handsewn',
  'toggle_button',
  'frog_closure',
  'lacing',
  'insert_cord',
  'cord_knot_end',
  'dart',
  'pleat',
  'staystitch',
  'set_collar',
  'gusset',
  'pocket_inseam',
  'pocket_welt',
  'pocket_patch',
  'attach_lining',
  'bag_out',
  'interlining_sewn',
  'shirring',
  'set_sleeve',
  'set_cuff',
  'attach_hood',
  'attach_rib',
  'stay_tape_shoulder',
  'quilting',
  'smocking',
  'french_tack',
  'shoulder_pad',
  'understitch',
  'rib_binding',
  'applique',
  'attach_patch',
  'reflective_tape',
  'print_dtg',
  'belt_loop',
  'hanger_loop',
  'tag_attach',
  'needle_detect',
  'preshrink',
  'adhesive_bond',
  'cut',
  'mark',
  'laser_cut',
] as const satisfies readonly IconKey[];

export type WorkToken = (typeof WORK_TOKENS)[number];

export const WORK_ICON = Object.fromEntries(WORK_TOKENS.map((token) => [token, token])) as Readonly<
  Record<WorkToken, IconKey>
>;

export const WORK_VARIANT_ICON = {
  set_zip: {
    open_end: 'zip_open_end',
    two_way: 'zip_two_way',
    magnetic: 'zip_magnetic',
    faced: 'zip_faced',
  },
  snap_press_stud: { ring: 'snap_ring', spring_s: 'snap_spring_s' },
  eyelet_grommet: { small: 'eyelet_small', washer: 'grommet_washer' },
  attach_elastic: {
    casing: 'elastic_casing',
    exposed: 'elastic_exposed',
    gripper: 'gripper_elastic',
    picot: 'elastic_picot',
    buttonhole: 'buttonhole_elastic',
    loop: 'elastic_loop',
  },
  fuse: {
    full: 'fuse_full',
    partial: 'fuse_partial',
    edge_tape: 'fuse_edge_tape',
    tack: 'fuse_tack',
  },
  attach_hook: { eye: 'hook_eye', trouser_bar: 'hook_bar_trouser' },
  attach_hook_loop: { tape: 'hook_loop_tape', dot: 'hook_loop_dot' },
  enclose_magnet: { pocket: 'magnet_sewn', hem: 'magnet_hem' },
  insert_cord: { round: 'cord_round', flat: 'cord_flat' },
  pleat: { knife: 'pleat_knife', box: 'pleat_box' },
  pocket_welt: { single: 'pocket_welt_single', double: 'pocket_welt_double' },
  attach_patch: { plain: 'patch', embroidered: 'embroidered_patch' },
} as const satisfies Readonly<Record<string, Readonly<Record<string, IconKey>>>>;

const SEAM_CARRIER = new Set([
  'join_lockstitch',
  'topstitch',
  'overlock_serge',
  'coverstitch',
  'coverlock',
  'chainstitch',
  'blindhem',
  'moscow_hem',
  'hem_turned',
  'zigzag',
  'bind_tape_edge',
  'machine_other',
]);

const MACHINE_ICON: Readonly<Record<string, IconKey>> = {
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH: 'join_lockstitch',
  TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE: 'join_lockstitch',
  TECH_CARD_MACHINE_TYPE_OVERLOCK: 'edge_overlock',
  TECH_CARD_MACHINE_TYPE_COVERSTITCH: 'coverstitch',
  TECH_CARD_MACHINE_TYPE_COVERLOCK: 'coverlock',
  TECH_CARD_MACHINE_TYPE_CHAINSTITCH: 'chainstitch',
  TECH_CARD_MACHINE_TYPE_BLINDSTITCH: 'blindhem',
  TECH_CARD_MACHINE_TYPE_ZIGZAG: 'zigzag',
  TECH_CARD_MACHINE_TYPE_BARTACK: 'bartack',
  TECH_CARD_MACHINE_TYPE_BUTTONHOLE: 'buttonhole_straight',
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: 'button_not_stated',
  TECH_CARD_MACHINE_TYPE_EMBROIDERY: 'embroidery',
  TECH_CARD_MACHINE_TYPE_HANDSTITCH_IMITATION: 'amf_handstitch_imitation',
  TECH_CARD_MACHINE_TYPE_ELASTIC_ATTACH: 'attach_elastic',
  TECH_CARD_MACHINE_TYPE_BINDING_TAPING: 'bound_open',
  TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING: 'set_zip',
  TECH_CARD_MACHINE_TYPE_GATHERING: 'gather',
  TECH_CARD_MACHINE_TYPE_PATCH_POCKET_AUTO: 'patch_pocket_automat',
  TECH_CARD_MACHINE_TYPE_WELT_POCKET_AUTO: 'welt_pocket_automat',
  TECH_CARD_MACHINE_TYPE_TEMPLATE_AUTO: 'template_automat',
  TECH_CARD_MACHINE_TYPE_COLLAR_CUFF_AUTO: 'collar_cuff_automat',
  TECH_CARD_MACHINE_TYPE_SLEEVE_SETTING_AUTO: 'sleeve_setting_automat',
  TECH_CARD_MACHINE_TYPE_WAISTBAND_AUTO: 'waistband_automat',
  TECH_CARD_MACHINE_TYPE_OTHER: 'machine_other',
  TECH_CARD_MACHINE_TYPE_SEAM_TAPING: 'tape_seam_hot_air',
  TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER: 'ultrasonic_weld',
};

const VERB_ICON: Readonly<Record<string, IconKey>> = {
  TECH_CARD_OPERATION_TYPE_LOCKSTITCH: 'join_lockstitch',
  TECH_CARD_OPERATION_TYPE_DOUBLE_NEEDLE: 'join_lockstitch',
  TECH_CARD_OPERATION_TYPE_OVERLOCK: 'edge_overlock',
  TECH_CARD_OPERATION_TYPE_COVERSTITCH: 'coverstitch',
  TECH_CARD_OPERATION_TYPE_CHAINSTITCH: 'chainstitch',
  TECH_CARD_OPERATION_TYPE_BLINDHEM: 'blindhem',
  TECH_CARD_OPERATION_TYPE_BARTACK: 'bartack',
  TECH_CARD_OPERATION_TYPE_BUTTONHOLE: 'buttonhole_straight',
  TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH: 'button_not_stated',
  TECH_CARD_OPERATION_TYPE_MACHINE: 'sew',
  TECH_CARD_OPERATION_TYPE_PRESS: 'press_flat',
  TECH_CARD_OPERATION_TYPE_PRESS_OPEN: 'press_open',
  TECH_CARD_OPERATION_TYPE_FUSING: 'fuse',
  TECH_CARD_OPERATION_TYPE_HANDWORK: 'hand_work',
  TECH_CARD_OPERATION_TYPE_HARDWARE_SET: 'set_hardware',
  TECH_CARD_OPERATION_TYPE_PRINT: 'print_transfer',
  TECH_CARD_OPERATION_TYPE_TRIM: 'trim_allowance',
  TECH_CARD_OPERATION_TYPE_THREAD_TRIM: 'thread_trim',
  TECH_CARD_OPERATION_TYPE_CLEAN: 'clean',
  TECH_CARD_OPERATION_TYPE_INSPECT: 'inspect_inline',
  TECH_CARD_OPERATION_TYPE_FOLD: 'fold',
  TECH_CARD_OPERATION_TYPE_PACK: 'pack',
  TECH_CARD_OPERATION_TYPE_WET_PROCESS: 'wet_process',
  TECH_CARD_OPERATION_TYPE_OTHER: 'other',
};

const PRESS_ACTION_ICON: Readonly<Record<string, IconKey>> = {
  TECH_CARD_PRESS_ACTION_PRESS_FLAT: 'press_flat',
  TECH_CARD_PRESS_ACTION_TO_ONE_SIDE: 'press_to_one_side',
  TECH_CARD_PRESS_ACTION_STEAM: 'press_steam',
  TECH_CARD_PRESS_ACTION_FINAL: 'press_final',
  TECH_CARD_PRESS_ACTION_EASE_IN: 'press_ease_in',
  TECH_CARD_PRESS_ACTION_STRETCH: 'press_stretch',
  TECH_CARD_PRESS_ACTION_MOULD: 'press_mould',
};

const PRESS_TOWARD_ARROW: Readonly<Record<string, PressArrow>> = {
  TECH_CARD_PRESS_TOWARD_UP: 'up',
  TECH_CARD_PRESS_TOWARD_DOWN: 'down',
  TECH_CARD_PRESS_TOWARD_TOWARD_CENTER: 'in',
  TECH_CARD_PRESS_TOWARD_AWAY_FROM_CENTER: 'out',
};

const PRESS_TOWARD_CHIP: Readonly<Record<string, IconChip>> = {
  TECH_CARD_PRESS_TOWARD_FRONT: 'F',
  TECH_CARD_PRESS_TOWARD_BACK: 'B',
  TECH_CARD_PRESS_TOWARD_SLEEVE: 'SL',
  TECH_CARD_PRESS_TOWARD_BODY: 'BD',
  TECH_CARD_PRESS_TOWARD_FACING: 'FC',
  TECH_CARD_PRESS_TOWARD_SHELL: 'SH',
  TECH_CARD_PRESS_TOWARD_LINING: 'LN',
  TECH_CARD_PRESS_TOWARD_OTHER: '?',
};

const BUTTON_PATTERN_ICON: Readonly<Record<string, IconKey>> = {
  TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X: 'button_cross_x',
  TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL: 'button_parallel',
  TECH_CARD_BUTTON_ATTACH_PATTERN_SQUARE: 'button_square',
  TECH_CARD_BUTTON_ATTACH_PATTERN_U_SHAPE: 'button_u_shape',
  TECH_CARD_BUTTON_ATTACH_PATTERN_OTHER: 'button_other',
};

const ZIPPER_CHIP: Readonly<Record<string, IconChip>> = {
  TECH_CARD_ZIPPER_APPLICATION_CENTERED: 'CTR',
  TECH_CARD_ZIPPER_APPLICATION_LAPPED: 'LAP',
  TECH_CARD_ZIPPER_APPLICATION_EXPOSED: 'EXP',
  TECH_CARD_ZIPPER_APPLICATION_FLY: 'FLY',
};

const clean = (value: string | null | undefined): string => value?.trim() ?? '';
const known = (value: string): boolean => !!value && !value.endsWith('_UNKNOWN');
const hasIcon = (key: string): key is IconKey => Object.prototype.hasOwnProperty.call(ICONS, key);

function bindingKind(style: string): IconKey {
  if (style === 'TECH_CARD_BINDING_STYLE_RAW') return 'bound_tape';
  if (style === 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD') return 'bound_closed';
  return 'bound_open';
}

function classIcon(op: OpIconInput): IconKey | undefined {
  const seamClass = clean(op.seamClass);
  if (seamClass === 'TECH_CARD_SEAM_CLASS_BS_BOUND') return bindingKind(clean(op.bindingStyle));
  return CLASS_KIND[seamClass];
}

function workVariantIcon(work: string, variant: string): IconKey | undefined {
  const variants = WORK_VARIANT_ICON[work as keyof typeof WORK_VARIANT_ICON];
  if (!variants) return undefined;
  return (variants as Readonly<Record<string, IconKey>>)[variant];
}

function positiveRows(value: number | null | undefined): number | undefined {
  if (!Number.isFinite(value) || !value || value < 1) return undefined;
  return Math.floor(value);
}

function topstitchAt(value: string): TopstitchAt | undefined {
  if (value === 'TECH_CARD_TOPSTITCH_MODE_EDGE') return 'edge';
  if (value === 'TECH_CARD_TOPSTITCH_MODE_IN_DITCH') return 'in_ditch';
  if (value === 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM') return 'parallel_to_seam';
  return undefined;
}

export function opIcon(op: OpIconInput, card: OpIconCard): OpIcon {
  // The card default is intentionally not a resolution input: deriving from an inherited class
  // would make an unchosen kind look stored. Keeping it in the signature makes that boundary clear.
  void card.defaultSeamClass;

  const work = clean(op.work);
  const seamKind = clean(op.seamKind);
  let key: IconKey | undefined;
  let source: 'seam' | 'work' | 'machine' | 'verb' | undefined;
  let derived: true | undefined;

  if (seamKind) {
    if (hasIcon(seamKind)) {
      key = seamKind;
      source = 'seam';
    }
  } else if (op.seamClassExplicit && (!work || SEAM_CARRIER.has(work))) {
    key = classIcon(op);
    if (key) {
      source = 'seam';
      derived = true;
    }
  }

  if (!key && work) {
    key = WORK_ICON[work as WorkToken];
    if (key) {
      source = 'work';
      key = workVariantIcon(work, clean(op.workVariant)) ?? key;
    }
  }
  if (!key) {
    key = MACHINE_ICON[clean(op.machineType)];
    if (key) source = 'machine';
  }
  if (!key) {
    key = VERB_ICON[clean(op.verb)];
    if (key) source = 'verb';
  }
  if (!key) return { key: 'sew', missing: true };

  let arrow: PressArrow | undefined;
  let chip: IconChip | undefined;

  if (!work && (source === 'verb' || key.startsWith('press_'))) {
    if (clean(op.pressEquipment) === 'TECH_CARD_PRESS_EQUIPMENT_STEAM_DUMMY') {
      key = 'steam_form';
    } else {
      key = PRESS_ACTION_ICON[clean(op.pressAction)] ?? key;
    }
  }
  if (
    key === 'press_flat' &&
    known(clean(op.pressCloth)) &&
    clean(op.pressCloth) !== 'TECH_CARD_PRESS_CLOTH_NONE'
  ) {
    key = 'press_cloth';
  }
  if (key === 'press_to_one_side') {
    arrow = PRESS_TOWARD_ARROW[clean(op.pressToward)];
    chip = PRESS_TOWARD_CHIP[clean(op.pressToward)];
  }

  const buttonFamily =
    work === 'button_attach' ||
    clean(op.machineType) === 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH' ||
    key === 'button_attach' ||
    key === 'button_not_stated';
  if (buttonFamily) {
    key =
      op.buttonHoles === 2
        ? 'button_two_hole'
        : BUTTON_PATTERN_ICON[clean(op.attachPattern)] ?? 'button_not_stated';
  }

  if (work === 'set_zip' || key === 'set_zip') {
    const zipper = clean(op.zipperApplication);
    if (zipper === 'TECH_CARD_ZIPPER_APPLICATION_INVISIBLE') key = 'zip_invisible';
    else chip = ZIPPER_CHIP[zipper];
  }

  if (source === 'work' && work === 'snap_press_stud' && key === 'snap_press_stud') {
    const method = clean(op.attachMethod);
    if (method === 'TECH_CARD_HARDWARE_ATTACH_METHOD_SEW') key = 'snap_sewn';
    if (method === 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRONG_CLINCH') key = 'snap_prong';
  }
  if (source === 'work' && work === 'set_magnet' && key === 'set_magnet') {
    const method = clean(op.attachMethod);
    if (method === 'TECH_CARD_HARDWARE_ATTACH_METHOD_SEW') key = 'magnet_sewn';
    if (method === 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRONG_CLINCH') key = 'magnet_prong';
  }

  const buttonholeFamily =
    work === 'buttonhole' ||
    clean(op.machineType) === 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE' ||
    key === 'buttonhole' ||
    key === 'buttonhole_straight';
  if (buttonholeFamily) {
    if (clean(op.buttonholeStyle) === 'TECH_CARD_BUTTONHOLE_STYLE_EYELET') {
      key = 'buttonhole_keyhole';
    } else {
      key = 'buttonhole_straight';
    }
  }

  if (key === 'trim_allowance' || clean(op.verb) === 'TECH_CARD_OPERATION_TYPE_TRIM') {
    const action = clean(op.trimAction);
    if (
      action === 'TECH_CARD_TRIM_ACTION_CLIP_CONCAVE' ||
      action === 'TECH_CARD_TRIM_ACTION_NOTCH_CONVEX'
    ) {
      key = 'clip_notch';
    } else if (action === 'TECH_CARD_TRIM_ACTION_TURN_AND_SHAPE') {
      key = 'turn_out';
    }
  }

  if (
    (key === 'print_transfer' || clean(op.verb) === 'TECH_CARD_OPERATION_TYPE_PRINT') &&
    clean(op.printMethod) === 'TECH_CARD_PRINT_METHOD_SCREEN'
  ) {
    key = 'screen_print';
  }

  const at = topstitchAt(clean(op.topstitchMode));
  const topstitchRequested =
    !!at ||
    work === 'topstitch' ||
    (op.seamClassExplicit && clean(op.seamClass) === 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH');
  if (topstitchRequested && BAR_BASE[key]) {
    const rows = positiveRows(op.topstitchRows) ?? positiveRows(op.needleCount) ?? 1;
    return {
      key,
      bars: Math.min(rows, 3) as 1 | 2 | 3,
      ...(rows > 3 ? { more: rows } : null),
      ...(at ? { at } : null),
      ...(arrow ? { arrow } : null),
      ...(chip ? { chip } : null),
      ...(derived ? { derived } : null),
    };
  }

  return {
    key,
    ...(arrow ? { arrow } : null),
    ...(chip ? { chip } : null),
    ...(derived ? { derived } : null),
  };
}
