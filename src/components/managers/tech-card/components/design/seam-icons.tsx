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

const plyStyle = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const threadStyle = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const threadDot = { fill: 'currentColor', stroke: 'none' };
const sleeveStyle = {
  fill: 'currentColor',
  fillOpacity: 0.25,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Ply1({ d }: { d: string }): JSX.Element {
  return <path {...plyStyle} d={d} />;
}

function Ply2({ d }: { d: string }): JSX.Element {
  return <path {...plyStyle} d={d} strokeOpacity={0.42} />;
}

function NeedleV({ x, y1, y2 }: { x: number; y1: number; y2: number }): JSX.Element {
  return (
    <>
      <path {...threadStyle} d={`M${x} ${y1} V${y2}`} />
      <circle {...threadDot} cx={x} cy={y1} r={2} />
      <circle {...threadDot} cx={x} cy={y2} r={2} />
    </>
  );
}

function NeedleH({ y, x1, x2 }: { y: number; x1: number; x2: number }): JSX.Element {
  return (
    <>
      <path {...threadStyle} d={`M${x1} ${y} H${x2}`} />
      <circle {...threadDot} cx={x1} cy={y} r={2} />
      <circle {...threadDot} cx={x2} cy={y} r={2} />
    </>
  );
}

function Overlock({
  x,
  y,
  dir,
  amp = 6,
  step = 6,
  teeth = 3,
}: {
  x: number;
  y: number;
  dir: 'left' | 'right' | 'up';
  amp?: number;
  step?: number;
  teeth?: number;
}): JSX.Element {
  let d = '';
  if (dir === 'up') {
    d = `M${x - amp} ${y - teeth * step}`;
    for (let i = teeth; i > 0; i--) {
      d += ` L${x + amp} ${y - i * step + step / 2} L${x - amp} ${y - (i - 1) * step}`;
    }
    d += ` Q${x - amp} ${y + 5} ${x} ${y + 5} Q${x + amp} ${y + 5} ${x + amp} ${y}`;
  } else {
    const sign = dir === 'right' ? 1 : -1;
    d = `M${x + sign * teeth * step} ${y - amp}`;
    for (let i = teeth; i > 0; i--) {
      d += ` L${x + sign * (i * step - step / 2)} ${y + amp} L${x + sign * (i - 1) * step} ${y - amp}`;
    }
    d += ` Q${x - sign * 5} ${y - amp} ${x - sign * 5} ${y} Q${x - sign * 5} ${y + amp} ${x} ${y + amp}`;
  }
  return <path {...threadStyle} d={d} />;
}

function Sleeve({
  x,
  y,
  dir,
  width = 14,
  height = 12,
  d,
}: {
  x?: number;
  y?: number;
  dir?: 'left' | 'right';
  width?: number;
  height?: number;
  d?: string;
}): JSX.Element {
  if (d) return <path {...sleeveStyle} d={d} />;
  const edgeX = x ?? 0;
  const edgeY = y ?? 0;
  const sign = dir === 'right' ? 1 : -1;
  const turnX = edgeX - sign * 5;
  const openX = edgeX + sign * width;
  const path = `M${openX} ${edgeY - height / 2} H${turnX + sign * 4} Q${turnX} ${edgeY - height / 2} ${turnX} ${edgeY} Q${turnX} ${edgeY + height / 2} ${turnX + sign * 4} ${edgeY + height / 2} H${openX}`;
  return <path {...sleeveStyle} d={path} />;
}

function Bar({
  x,
  y,
  width,
  height = 7,
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
}) {
  return <rect x={x} y={y} width={width} height={height} rx={1} fill='currentColor' />;
}

function Thread({ d }: { d: string }): JSX.Element {
  return <path {...threadStyle} d={d} />;
}

function SeamGlyph({ kind }: { kind: SeamKind }): JSX.Element {
  const plainOpen = (
    <>
      <Ply1 d='M4 16 H55 Q58 16 58 19 V39 Q58 42 55 42 H26' />
      <Ply2 d='M116 16 H65 Q62 16 62 19 V39 Q62 42 65 42 H94' />
    </>
  );
  const plainStanding = (
    <>
      <Ply1 d='M4 18 H54 Q58 18 58 22 V58' />
      <Ply2 d='M116 18 H66 Q62 18 62 22 V58' />
    </>
  );

  switch (kind) {
    case 'sm_plain_open':
      return (
        <>
          {plainOpen}
          <Overlock x={26} y={42} dir='right' amp={4} step={4} teeth={2} />
          <Overlock x={94} y={42} dir='left' amp={4} step={4} teeth={2} />
          <NeedleH y={28} x1={50} x2={70} />
        </>
      );
    case 'sm_plain_overlock':
      return (
        <>
          {plainStanding}
          <NeedleH y={32} x1={48} x2={72} />
          <Overlock x={60} y={58} dir='up' amp={7} step={6} teeth={3} />
        </>
      );
    case 'sm_safety':
      return (
        <>
          {plainStanding}
          <NeedleH y={32} x1={48} x2={72} />
          <NeedleH y={44} x1={50} x2={70} />
          <Overlock x={60} y={58} dir='up' amp={7} step={6} teeth={3} />
        </>
      );
    case 'sm_french':
      return (
        <>
          <Ply1 d='M4 18 H48 Q52 18 52 22 V56 Q52 62 57 60 V42' />
          <Ply2 d='M116 18 H72 Q68 18 68 22 V56 Q68 62 63 60 V42' />
          <NeedleH y={30} x1={44} x2={76} />
          <NeedleH y={54} x1={46} x2={74} />
        </>
      );
    case 'sm_flat_felled':
      return (
        <>
          <Ply1 d='M4 20 H64 Q69 20 69 26 Q69 32 64 32 H46' />
          <Ply2 d='M116 20 H74 Q69 20 69 26 V38 Q69 44 63 44 H42 Q36 44 36 38 Q36 26 42 26 H58' />
          <NeedleV x={50} y1={12} y2={50} />
          <NeedleV x={62} y1={12} y2={50} />
        </>
      );
    case 'sm_mock_felled':
      return (
        <>
          <Ply1 d='M4 18 H54 Q58 18 58 22 V34 Q58 38 62 38 H90' />
          <Ply2 d='M116 18 H66 Q62 18 62 22 V38 Q62 42 66 42 H90' />
          <NeedleH y={28} x1={50} x2={70} />
          <NeedleV x={78} y1={12} y2={46} />
          <Overlock x={90} y={40} dir='left' amp={5} step={5} teeth={2} />
        </>
      );
    case 'sm_lapped':
      return (
        <>
          <Ply1 d='M4 20 H70' />
          <Ply2 d='M116 18 H44' />
          <NeedleV x={52} y1={10} y2={30} />
          <NeedleV x={64} y1={10} y2={30} />
        </>
      );
    case 'sm_hong_kong':
      return (
        <>
          {plainOpen}
          <Sleeve x={26} y={42} dir='right' width={14} height={12} />
          <Sleeve x={94} y={42} dir='left' width={14} height={12} />
          <NeedleV x={34} y1={32} y2={52} />
          <NeedleV x={86} y1={32} y2={52} />
          <NeedleH y={28} x1={50} x2={70} />
        </>
      );
    case 'sm_bound':
      return (
        <>
          <Ply1 d='M4 18 H54 Q58 18 58 22 V50' />
          <Ply2 d='M116 18 H66 Q62 18 62 22 V50' />
          <NeedleH y={32} x1={48} x2={72} />
          <Sleeve d='M48 40 V56 Q48 62 60 62 Q72 62 72 56 V40' />
          <NeedleH y={50} x1={44} x2={76} />
        </>
      );
    case 'sm_taped':
      return (
        <>
          <Ply1 d='M4 16 H55 Q58 16 58 19 V35 Q58 38 62 38 H94' />
          <Ply2 d='M116 16 H65 Q62 16 62 19 V40 Q62 44 66 44 H94' />
          <NeedleH y={28} x1={50} x2={70} />
          <Bar x={34} y={49} width={68} />
        </>
      );
    case 'sm_bonded':
      return (
        <>
          <Ply1 d='M4 20 H70' />
          <Ply2 d='M116 20 H44' />
          <Bar x={44} y={26} width={26} height={4} />
        </>
      );
    case 'sm_flatlock':
      return (
        <>
          <Ply1 d='M4 20 H58' />
          <Ply2 d='M116 20 H62' />
          <NeedleV x={54} y1={12} y2={30} />
          <NeedleV x={66} y1={12} y2={30} />
          <Thread d='M48 20 L54 15 L60 25 L66 15 L72 20' />
        </>
      );
    case 'sm_hem_turned':
      return (
        <>
          <Ply1 d='M4 18 H90 Q94 18 94 22 V30 Q94 34 90 34 H40 Q36 34 36 30 V28 Q36 26 40 26 H84' />
          <NeedleV x={46} y1={10} y2={40} />
        </>
      );
    case 'sm_hem_blind':
      return (
        <>
          <Ply1 d='M4 18 H90 Q94 18 94 22 V30 Q94 34 90 34 H40' />
          <Thread d='M46 34 L52 24 L58 34 L64 24' />
          <circle {...threadDot} cx={52} cy={18} r={2} />
        </>
      );
    case 'sm_hem_cover':
      return (
        <>
          <Ply1 d='M4 18 H90 Q94 18 94 22 V30 Q94 34 90 34 H40' />
          <NeedleV x={48} y1={10} y2={40} />
          <NeedleV x={58} y1={10} y2={40} />
          <Thread d='M44 40 L53 46 L62 40' />
        </>
      );
    case 'sm_hem_raw':
      return (
        <>
          <Ply1 d='M4 20 H84' />
          <Ply1 d='M84 16 L88 20 L84 24' />
        </>
      );
    case 'sm_hem_bound':
      return (
        <>
          <Ply1 d='M4 20 H84' />
          <Sleeve x={84} y={20} dir='left' width={16} height={14} />
          <NeedleV x={76} y1={10} y2={30} />
        </>
      );
    case 'sm_hem_faced':
      return (
        <>
          <Ply1 d='M4 18 H90 Q96 18 96 24 Q96 30 90 30 H52' />
          <Ply2 d='M52 30 H38' />
          <NeedleV x={80} y1={24} y2={36} />
        </>
      );
  }
}

const stroke = { vectorEffect: 'non-scaling-stroke' as const };
const accent = { ...stroke, fill: 'currentColor', fillOpacity: 0.14 };
const stitchDot = { ...stroke, fill: 'currentColor', stroke: 'none' };

export function SeamIcon({
  kind,
  className,
  size = 64,
  band = false,
}: {
  kind: SeamKind;
  className?: string;
  size?: number;
  /** Crop to the drawn band (y 12–52): a cross-section is wide and flat, a square frame wastes
   *  its height — option chips use the band so the icon reads big without a tall chip. */
  band?: boolean;
}): JSX.Element {
  return (
    <svg
      aria-hidden
      focusable='false'
      data-seam-kind={kind}
      viewBox={band ? '0 12 64 40' : '0 0 64 64'}
      width={size}
      height={band ? Math.round((size * 40) / 64) : size}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
    >
      <g transform='translate(0 12) scale(.5333333333)'>
        <SeamGlyph kind={kind} />
      </g>
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
