import type { IconKey } from './icons.gen';

export type SeamKindDefinition = {
  token: string;
  seamClass: string;
  label: string;
  group: string;
};

export const SEAM_KINDS = [
  {
    token: 'bound_tape',
    seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
    label: 'Flat tape binding',
    group: 'Binding',
  },
  {
    token: 'bound_open',
    seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
    label: 'Bound, open fold',
    group: 'Binding',
  },
  {
    token: 'bound_closed',
    seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
    label: 'Bound, double fold',
    group: 'Binding',
  },
  {
    token: 'bound_frame',
    seamClass: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
    label: 'Frame binding',
    group: 'Binding',
  },
  {
    token: 'seam_edge',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Plain seam, on edge',
    group: 'Join',
  },
  {
    token: 'seam_one_side',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Plain seam, pressed to one side',
    group: 'Join',
  },
  {
    token: 'seam_open',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Plain seam, pressed open',
    group: 'Join',
  },
  {
    token: 'lapped_raw',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
    label: 'Lapped, raw edges',
    group: 'Lapped',
  },
  {
    token: 'lapped_one_closed',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
    label: 'Lapped, one edge closed',
    group: 'Lapped',
  },
  {
    token: 'lapped_closed_a',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
    label: 'Lapped, closed edges A',
    group: 'Lapped',
  },
  {
    token: 'lapped_closed_b',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
    label: 'Lapped, closed edges B',
    group: 'Lapped',
  },
  {
    token: 'french',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_FRENCH',
    label: 'French seam',
    group: 'Enclosed',
  },
  {
    token: 'felled',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
    label: 'Flat-felled seam',
    group: 'Enclosed',
  },
  {
    token: 'locked',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
    label: 'Locked seam',
    group: 'Enclosed',
  },
  {
    token: 'open_topstitched',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Open seam, topstitched both sides',
    group: 'Decorative',
  },
  {
    token: 'topstitch_closed',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
    label: 'Closed topstitched seam',
    group: 'Decorative',
  },
  {
    token: 'tucks',
    seamClass: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
    label: 'Tucks',
    group: 'Decorative',
  },
  {
    token: 'piping_lapped',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Lapped piping',
    group: 'Decorative',
  },
  {
    token: 'piping_faced',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Faced piping',
    group: 'Decorative',
  },
  {
    token: 'faced_split',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_FACED',
    label: 'Faced edge, split',
    group: 'Edge',
  },
  {
    token: 'faced_kant',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_FACED',
    label: 'Faced edge with welt',
    group: 'Edge',
  },
  {
    token: 'faced_bias_closed',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_FACED',
    label: 'Closed bias binding',
    group: 'Edge',
  },
  {
    token: 'faced_bias_double',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_FACED',
    label: 'Double bias binding',
    group: 'Edge',
  },
  {
    token: 'moscow_hem',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
    label: 'Rolled hem (Moscow)',
    group: 'Narrow hems',
  },
  {
    token: 'hem_raw',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
    label: 'Hem, raw edge',
    group: 'Narrow hems',
  },
  {
    token: 'hem_closed',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
    label: 'Hem, closed edge',
    group: 'Narrow hems',
  },
  {
    token: 'hem_zigzag',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
    label: 'Zigzag hem',
    group: 'Narrow hems',
  },
  {
    token: 'edge_overlock',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
    label: 'Overlocked edge',
    group: 'Other',
  },
  {
    token: 'flatlock',
    seamClass: 'TECH_CARD_SEAM_CLASS_FS_FLAT',
    label: 'Flatlock seam',
    group: 'Other',
  },
  {
    token: 'blind_hem',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
    label: 'Blind hem',
    group: 'Other',
  },
  {
    token: 'hong_kong',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Hong Kong seam',
    group: 'Other',
  },
  {
    token: 'overcast_plain',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Overcast plain seam',
    group: 'Other',
  },
  {
    token: 'safety_516',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Safety stitch 516',
    group: 'Other',
  },
  {
    token: 'casing',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
    label: 'Casing with cord',
    group: 'Other',
  },
  {
    token: 'taped',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Taped seam',
    group: 'Other',
  },
  {
    token: 'bonded',
    seamClass: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
    label: 'Bonded seam',
    group: 'Other',
  },
  {
    token: 'cover_hem',
    seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
    label: 'Coverstitch hem',
    group: 'Other',
  },
  {
    token: 'piping_cord',
    seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    label: 'Corded piping',
    group: 'Details',
  },
] as const satisfies readonly SeamKindDefinition[];

export type SeamKindToken = (typeof SEAM_KINDS)[number]['token'];

export const CLASS_KIND: Readonly<Record<string, IconKey | undefined>> = {
  TECH_CARD_SEAM_CLASS_SS_PLAIN: 'seam_one_side',
  TECH_CARD_SEAM_CLASS_SS_FRENCH: 'french',
  TECH_CARD_SEAM_CLASS_LS_LAPPED: 'lapped_raw',
  TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED: 'felled',
  TECH_CARD_SEAM_CLASS_EF_HEM_RAW: 'hem_raw',
  TECH_CARD_SEAM_CLASS_EF_HEM_TURNED: 'hem_closed',
  TECH_CARD_SEAM_CLASS_EF_FACED: 'faced_kant',
  TECH_CARD_SEAM_CLASS_BS_BOUND: 'bound_open',
  TECH_CARD_SEAM_CLASS_FS_FLAT: 'flatlock',
  TECH_CARD_SEAM_CLASS_OS_TOPSTITCH: 'topstitch',
};

export const SM_KIND = {
  sm_plain_open: 'seam_open',
  sm_plain_overlock: 'overcast_plain',
  sm_safety: 'safety_516',
  sm_french: 'french',
  sm_flat_felled: 'felled',
  sm_mock_felled: 'topstitch_closed',
  sm_lapped: 'lapped_raw',
  sm_hong_kong: 'hong_kong',
  sm_bound: 'bound_open',
  sm_taped: 'taped',
  sm_bonded: 'bonded',
  sm_flatlock: 'flatlock',
  sm_hem_turned: 'hem_closed',
  sm_hem_blind: 'blind_hem',
  sm_hem_cover: 'cover_hem',
  sm_hem_raw: 'hem_raw',
  sm_hem_bound: 'bound_open',
  sm_hem_faced: 'faced_kant',
  sm_hem_rolled: 'moscow_hem',
  sm_piping: 'piping_cord',
  sm_rib_band: 'bound_open',
  sm_self_band: 'bound_open',
  sm_casing_elastic: 'casing',
  sm_casing_drawcord: 'casing',
  sm_edge_overlocked: 'edge_overlock',
  sm_hem_lettuce: 'hem_zigzag',
} as const satisfies Readonly<Record<string, SeamKindToken>>;
