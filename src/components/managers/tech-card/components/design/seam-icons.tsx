import type { JSX } from 'react';
import type { common_TechCardSeamClass } from 'api/proto-http/admin';
import { findPantone } from 'components/managers/tech-card/components/pantone-swatches';

/** Seam and edge-finish part keys shared with the design-quiz resolver (70-SEAMS). */
export const SEAM_KINDS = [
  'sm_plain_open',
  'sm_plain_overlock',
  'sm_safety',
  'sm_french',
  'sm_flat_felled',
  'sm_mock_felled',
  'sm_lapped',
  'sm_hong_kong',
  'sm_bound',
  'sm_taped',
  'sm_bonded',
  'sm_flatlock',
  'sm_hem_turned',
  'sm_hem_blind',
  'sm_hem_cover',
  'sm_hem_raw',
  'sm_hem_bound',
  'sm_hem_faced',
] as const;

export type SeamKind = (typeof SEAM_KINDS)[number];

export const SEAM_LABEL: Record<SeamKind, string> = {
  sm_plain_open: 'plain seam pressed open, edges overlocked',
  sm_plain_overlock: 'plain seam overlocked together',
  sm_safety: 'safety stitch 516',
  sm_french: 'French seam',
  sm_flat_felled: 'flat-felled',
  sm_mock_felled: 'mock flat-fell (topstitched to one side)',
  sm_lapped: 'lapped seam',
  sm_hong_kong: 'Hong Kong finish (bias-bound edges)',
  sm_bound: 'bound seam',
  sm_taped: 'taped seam (seam-sealed)',
  sm_bonded: 'bonded (welded)',
  sm_flatlock: 'flatlock 607',
  sm_hem_turned: 'hem turned twice, 301',
  sm_hem_blind: 'blind hem 103',
  sm_hem_cover: 'coverstitch hem 406/602',
  sm_hem_raw: 'raw edge',
  sm_hem_bound: 'bound edge (binding)',
  sm_hem_faced: 'faced edge',
};

export function isSeamKind(value: string): value is SeamKind {
  return (SEAM_KINDS as readonly string[]).includes(value);
}

/** Backend `designQuizSingular`: "edges" → "edge", "patches" → "patch"; short or non-s words stay. */
const singular = (w: string): string => {
  if (w.length < 3 || !w.endsWith('s')) return w;
  if (/(?:sses|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('ss')) return w;
  return w.slice(0, -1);
};

/** Backend `designQuizAliasWords`: `[a-z0-9]+` words (digits count), singularised. */
const aliasWords = (value: string): string[] =>
  (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(singular);

// Same table, same order as backend `designQuizSeams` (design_quiz.go) — the sort below is stable,
// so within one word count the table order decides, exactly like the server.
const SEAM_ALIASES: ReadonlyArray<readonly [SeamKind, readonly string[]]> = [
  ['sm_hong_kong', ['hong kong', 'hong kong finish', 'bias-bound edges', 'bias bound edges']],
  ['sm_flat_felled', ['flat-felled', 'flat felled', 'felled seam', 'run and fell']],
  [
    'sm_mock_felled',
    ['mock flat-fell', 'mock felled', 'mock fell', 'welt seam', 'topstitched to one side'],
  ],
  ['sm_french', ['french seam', 'french seams']],
  ['sm_safety', ['safety stitch', '5-thread', '516']],
  [
    'sm_plain_overlock',
    ['plain seam overlocked', 'overlocked together', '4-thread overlock', '514', 'serged seam'],
  ],
  ['sm_plain_open', ['pressed open', 'plain seam pressed open', 'open seam overlocked']],
  ['sm_lapped', ['lapped seam', 'lapped']],
  ['sm_bound', ['bound seam', 'bound together', 'binding tape seam']],
  ['sm_taped', ['taped seam', 'seam tape', 'seam-sealed', 'seam sealing', 'sealed seam', 'taped']],
  ['sm_bonded', ['bonded', 'welded', 'ultrasonic', 'glued seam', 'no-sew']],
  ['sm_flatlock', ['flatlock', 'flatseam', 'flat seam 607', '607']],
  ['sm_hem_cover', ['coverstitch', 'coverstitched', '406', '602', '605']],
  ['sm_hem_blind', ['blind hem', 'blind-hemmed', 'blindstitch', '103']],
  [
    'sm_hem_turned',
    ['turned twice', 'double-turned hem', 'turned and topstitched', 'clean-finished hem'],
  ],
  ['sm_hem_raw', ['raw edge', 'raw hem', 'cut edge', 'unfinished edge', 'pinked']],
  [
    'sm_hem_bound',
    [
      'bound hem',
      'bound neckline',
      'bound edge',
      'binding',
      'bias binding',
      'bias tape',
      'self-fabric binding',
    ],
  ],
  ['sm_hem_faced', ['faced', 'facing', 'understitched']],
];

/** Backend `designQuizSeamAliases`: the "seam allowance" blocker, then longest first by WORD count. */
const SORTED_ALIASES: ReadonlyArray<{ kind: SeamKind | null; words: string[] }> = [
  { kind: null, words: aliasWords('seam allowance') },
  ...SEAM_ALIASES.flatMap(([kind, aliases]) =>
    aliases.map((alias) => ({ kind: kind as SeamKind | null, words: aliasWords(alias) })),
  ).sort((a, b) => b.words.length - a.words.length),
];

const containsRun = (haystack: readonly string[], needle: readonly string[]): boolean => {
  for (let at = 0; at + needle.length <= haystack.length; at++) {
    if (needle.every((w, i) => haystack[at + i] === w)) return true;
  }
  return false;
};

/** Backend `designQuizSeamOf`, one to one: the first alias found as a complete word run. */
export function seamOf(label: string): SeamKind | null {
  const haystack = aliasWords(label);
  for (const { kind, words } of SORTED_ALIASES) {
    if (containsRun(haystack, words)) return kind;
  }
  return null;
}

const SEAM_CLASS: Record<SeamKind, common_TechCardSeamClass> = {
  sm_plain_open: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
  sm_plain_overlock: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
  sm_safety: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
  sm_french: 'TECH_CARD_SEAM_CLASS_SS_FRENCH',
  sm_flat_felled: 'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
  sm_mock_felled: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
  sm_lapped: 'TECH_CARD_SEAM_CLASS_LS_LAPPED',
  sm_hong_kong: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  sm_bound: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  sm_taped: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
  sm_bonded: 'TECH_CARD_SEAM_CLASS_OTHER',
  sm_flatlock: 'TECH_CARD_SEAM_CLASS_FS_FLAT',
  sm_hem_turned: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
  sm_hem_blind: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
  sm_hem_cover: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
  sm_hem_raw: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
  sm_hem_bound: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  sm_hem_faced: 'TECH_CARD_SEAM_CLASS_EF_FACED',
};

export function seamClassOf(kind: SeamKind): common_TechCardSeamClass {
  return SEAM_CLASS[kind];
}

const CSS_COLOUR_FALLBACK = new Set([
  'aqua',
  'beige',
  'black',
  'blue',
  'brown',
  'coral',
  'crimson',
  'cyan',
  'fuchsia',
  'gold',
  'gray',
  'green',
  'grey',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lime',
  'magenta',
  'maroon',
  'navy',
  'olive',
  'olivedrab',
  'orange',
  'orchid',
  'pink',
  'plum',
  'purple',
  'red',
  'salmon',
  'silver',
  'tan',
  'teal',
  'tomato',
  'turquoise',
  'violet',
  'white',
  'yellow',
]);

const supportsColour = (colour: string): boolean => {
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', colour);
  }
  return (
    CSS_COLOUR_FALLBACK.has(colour) ||
    /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(colour) ||
    /^(?:rgb|rgba|hsl|hsla)\([^)]*\)$/i.test(colour)
  );
};

/** Return a browser colour for a colour-option label, or null when the label has no colour. */
/**
 * Fashion colour words whose CSS keyword means something else (CSS `indigo` is violet; in clothing it
 * is denim blue) or that CSS lacks. Checked before CSS.
 */
const FASHION_COLOUR: Record<string, string> = {
  indigo: '#2e3b5e',
  denim: '#4a6285',
  ecru: '#e8dfc8',
  stone: '#b8ad9a',
  sand: '#c9b48f',
  camel: '#b8895a',
  oatmeal: '#d8ccb4',
  charcoal: '#3a3a3a',
  bone: '#e3dccb',
  cream: '#f1e8d2',
  rust: '#a5512b',
  sage: '#9caf88',
  mustard: '#c79a2b',
  burgundy: '#6d1f2c',
  taupe: '#8b7d6b',
};

export function swatchOf(label: string): string | null {
  const clean = label.trim().toLowerCase();
  if (!clean) return null;
  const parts = clean.split(/\s+/);
  for (const word of [...parts].reverse()) {
    const fashion = FASHION_COLOUR[word.replace(/[^a-z]/g, '')];
    if (fashion) return fashion;
  }
  const candidates = [clean, parts.at(-1) ?? '', parts.slice(-2).join('')];
  for (const candidate of candidates) {
    if (candidate && supportsColour(candidate)) return candidate;
  }

  const pantoneCode = label.match(/\b(?:\d{2}-\d{4}\s*TCX|\d{2,4}\s*C)\b/i)?.[0];
  const pantone = findPantone(pantoneCode ?? label);
  return pantone?.hex ?? null;
}

export function isPaletteKey(part: string): boolean {
  return part === 'col_palette';
}

const stroke = { vectorEffect: 'non-scaling-stroke' as const };
const accent = { ...stroke, fill: 'currentColor', fillOpacity: 0.14 };
const stitchDot = { ...stroke, fill: 'currentColor', stroke: 'none' };

function Stitch({ x, y1, y2 }: { x: number; y1: number; y2: number }): JSX.Element {
  return (
    <>
      <path {...stroke} d={`M${x} ${y1} V${y2}`} />
      <circle {...stitchDot} cx={x} cy={y1} r='.9' />
      <circle {...stitchDot} cx={x} cy={y2} r='.9' />
    </>
  );
}

function SeamGlyph({ kind }: { kind: SeamKind }): JSX.Element {
  switch (kind) {
    case 'sm_plain_open':
      return (
        <>
          <path
            {...accent}
            d='M5 24 H29 Q32 24 32 28 Q32 24 35 24 H59 V30 H35 L34 34 H59 V40 H33 L32 31 L31 40 H5 V34 H30 L29 30 H5 Z'
          />
          <Stitch x={32} y1={22} y2={33} />
          <path {...stroke} d='M5 33 Q1 37 5 41 M59 33 Q63 37 59 41' />
        </>
      );
    case 'sm_plain_overlock':
      return (
        <>
          <path
            {...accent}
            d='M5 22 H29 Q32 22 32 27 Q32 22 35 22 H59 V28 H35 L34 33 H53 V45 H30 L31 28 H5 Z'
          />
          <path {...accent} d='M31 35 H53 V41 H31 Z' />
          <Stitch x={32} y1={20} y2={34} />
          <path {...stroke} d='M48 32 Q58 32 58 39 Q58 46 48 46 M50 32 Q55 39 50 46' />
        </>
      );
    case 'sm_safety':
      return (
        <>
          <path
            {...accent}
            d='M5 21 H29 Q32 21 32 26 Q32 21 35 21 H59 V27 H35 L34 32 H54 V45 H29 L31 27 H5 Z'
          />
          <path {...accent} d='M30 35 H54 V41 H30 Z' />
          <Stitch x={32} y1={19} y2={34} />
          <Stitch x={43} y1={30} y2={44} />
          <path {...stroke} d='M49 31 Q59 32 59 38 Q59 45 49 46 M50 31 Q56 38 50 46' />
        </>
      );
    case 'sm_french':
      return (
        <>
          <path
            {...accent}
            d='M5 21 H29 Q32 21 32 26 Q32 21 35 21 H59 V27 H36 Q36 34 43 34 H49 V47 H39 Q26 47 27 34 L29 27 H5 Z'
          />
          <path {...accent} d='M33 29 Q31 40 40 41 H45 V35 H41 Q35 35 35 29 Z' />
          <Stitch x={32} y1={19} y2={30} />
          <Stitch x={42} y1={32} y2={44} />
        </>
      );
    case 'sm_flat_felled':
      return (
        <>
          <path {...accent} d='M5 23 H43 V29 H28 V35 H5 Z' />
          <path {...accent} d='M59 35 H21 V29 H36 V23 H59 Z' />
          <path {...stroke} d='M21 35 V29 H28 M43 23 V29 H36' />
          <Stitch x={26} y1={21} y2={37} />
          <Stitch x={39} y1={21} y2={37} />
        </>
      );
    case 'sm_mock_felled':
      return (
        <>
          <path
            {...accent}
            d='M5 20 H29 Q32 20 32 25 Q32 20 35 20 H59 V26 H35 L34 31 H53 V43 H29 L31 26 H5 Z'
          />
          <path {...accent} d='M30 33 H53 V39 H30 Z' />
          <Stitch x={32} y1={18} y2={32} />
          <Stitch x={41} y1={18} y2={42} />
          <path {...stroke} d='M48 30 Q58 31 58 37 Q58 43 48 44 M50 30 Q55 37 50 44' />
        </>
      );
    case 'sm_lapped':
      return (
        <>
          <path {...accent} d='M6 23 H40 V30 H58 V38 H24 V31 H6 Z' />
          <path {...stroke} d='M40 23 V30 M24 31 V38' />
          <Stitch x={31} y1={21} y2={40} />
          <Stitch x={37} y1={21} y2={40} />
        </>
      );
    case 'sm_hong_kong':
      return (
        <>
          <path
            {...accent}
            d='M5 20 H29 Q32 20 32 25 Q32 20 35 20 H59 V26 H35 L34 31 H55 V37 H33 L32 28 L31 37 H9 V31 H30 L29 26 H5 Z'
          />
          <path {...accent} d='M4 28 H13 V40 H4 Q1 34 4 28 Z M51 28 H60 Q63 34 60 40 H51 Z' />
          <Stitch x={32} y1={18} y2={30} />
          <Stitch x={9} y1={27} y2={41} />
          <Stitch x={55} y1={27} y2={41} />
        </>
      );
    case 'sm_bound':
      return (
        <>
          <path
            {...accent}
            d='M5 19 H29 Q32 19 32 24 Q32 19 35 19 H59 V25 H35 L34 30 H50 V42 H29 L31 25 H5 Z'
          />
          <path {...accent} d='M30 32 H50 V38 H30 Z' />
          <path
            {...accent}
            d='M46 27 H55 Q62 27 62 35 Q62 43 55 47 H46 V41 H53 Q56 38 56 35 Q56 32 53 33 H46 Z'
          />
          <Stitch x={32} y1={17} y2={31} />
          <Stitch x={50} y1={26} y2={46} />
        </>
      );
    case 'sm_taped':
      return (
        <>
          <path
            {...accent}
            d='M5 28 H29 Q32 28 32 33 Q32 28 35 28 H59 V34 H35 L34 40 H47 V46 H30 L31 34 H5 Z'
          />
          <path {...accent} d='M16 18 H48 V27 H16 Z' />
          <path {...stroke} strokeDasharray='2 2' d='M19 22.5 H45' />
          <Stitch x={32} y1={26} y2={41} />
        </>
      );
    case 'sm_bonded':
      return (
        <>
          <path {...accent} d='M6 21 H43 V28 H58 V35 H21 V28 H6 Z' />
          <path {...accent} d='M21 28 H43 V35 H21 Z' />
          <path {...stroke} d='M22 34 L28 28 M28 35 L35 28 M35 35 L42 28' />
        </>
      );
    case 'sm_flatlock':
      return (
        <>
          <path {...accent} d='M5 27 H29 V35 H5 Z M35 27 H59 V35 H35 Z' />
          <path
            {...stroke}
            d='M25 24 Q32 30 39 24 M25 38 Q32 32 39 38 M27 24 L37 38 M37 24 L27 38'
          />
          <Stitch x={28} y1={25} y2={37} />
          <Stitch x={36} y1={25} y2={37} />
        </>
      );
    case 'sm_hem_turned':
      return (
        <>
          <path {...accent} d='M7 18 H56 V24 H51 V31 H27 V37 H49 V43 H21 V30 H45 V24 H7 Z' />
          <path {...stroke} d='M56 18 Q59 21 56 24 M51 24 V31 M27 31 V37' />
          <Stitch x={43} y1={16} y2={45} />
        </>
      );
    case 'sm_hem_blind':
      return (
        <>
          <path {...accent} d='M7 17 H57 V23 H53 V37 H23 V43 H17 V31 H47 V23 H7 Z' />
          <path {...stroke} d='M57 17 Q60 20 57 23 M23 37 V43' />
          <path {...stroke} d='M22 35 Q28 29 34 35 Q40 41 46 35 L50 31' />
          <path {...stroke} d='M34 35 L34 23' />
          <circle {...stitchDot} cx='34' cy='23' r='.9' />
        </>
      );
    case 'sm_hem_cover':
      return (
        <>
          <path {...accent} d='M7 19 H57 V25 H53 V38 H22 V44 H16 V32 H47 V25 H7 Z' />
          <path {...stroke} d='M57 19 Q60 22 57 25 M22 38 V44' />
          <Stitch x={34} y1={17} y2={40} />
          <Stitch x={43} y1={17} y2={40} />
          <path {...stroke} d='M30 40 Q34 35 38 40 Q43 45 47 39' />
        </>
      );
    case 'sm_hem_raw':
      return (
        <>
          <path {...accent} d='M7 27 H49 L54 23 L58 27 L54 31 L58 35 L53 39 L49 35 H7 Z' />
          <path {...stroke} d='M49 27 L54 23 L58 27 L54 31 L58 35 L53 39 L49 35' />
        </>
      );
    case 'sm_hem_bound':
      return (
        <>
          <path {...accent} d='M6 28 H48 V36 H6 Z' />
          <path
            {...accent}
            d='M43 21 H52 Q59 21 59 28 V36 Q59 43 52 43 H43 V37 H50 Q53 37 53 34 V30 Q53 27 50 27 H43 Z'
          />
          <Stitch x={47} y1={20} y2={44} />
        </>
      );
    case 'sm_hem_faced':
      return (
        <>
          <path {...accent} d='M7 19 H52 Q58 19 58 25 Q58 31 52 34 H28 V28 H49 Q52 27 52 25 H7 Z' />
          <path {...accent} d='M48 34 H24 V41 H53 Q59 37 58 29 Q57 34 48 34 Z' />
          <path {...stroke} d='M52 19 Q58 19 58 25 Q58 31 52 34 M28 28 V34 M24 34 V41' />
          <Stitch x={45} y1={26} y2={42} />
        </>
      );
  }
}

export function SeamIcon({
  kind,
  className,
  size = 64,
}: {
  kind: SeamKind;
  className?: string;
  size?: number;
}): JSX.Element {
  return (
    <svg
      aria-hidden
      focusable='false'
      data-seam-kind={kind}
      viewBox='0 0 64 64'
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      <SeamGlyph kind={kind} />
    </svg>
  );
}

export function PaletteIcon({
  className,
  size = 64,
}: {
  className?: string;
  size?: number;
}): JSX.Element {
  return (
    <svg
      aria-hidden
      focusable='false'
      data-palette-key='col_palette'
      viewBox='0 0 64 64'
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      <path {...stroke} d='M8 19 L37 10 L47 43 L18 52 Z' />
      <circle {...stitchDot} cx='14' cy='23' r='2' />
      <path {...stroke} d='M18 14 L49 14 L49 48 L18 48 Z' />
      <circle {...stitchDot} cx='24' cy='20' r='2' />
      <path {...accent} d='M26 20 L57 27 L50 57 L19 50 Z' />
      <circle {...stitchDot} cx='31' cy='26' r='2' />
      <path {...stroke} d='M31 43 L45 46 M33 37 L48 40' />
    </svg>
  );
}
