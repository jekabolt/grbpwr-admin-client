import type { JSX } from 'react';
import type { common_TechCardSeamClass } from 'api/proto-http/admin';
import { findPantone } from 'components/managers/tech-card/components/pantone-swatches';
import { ACCENT_FILL_OPACITY, LINE, LINE_EMPHASIS } from 'components/shared/icon-line';

/** Open-edge finish keys added by 90-EDGES; their decision lines use `edge:` instead of `seam:`. */
export const EDGE_KINDS = [
  'sm_hem_rolled',
  'sm_piping',
  'sm_rib_band',
  'sm_self_band',
  'sm_casing_elastic',
  'sm_casing_drawcord',
  'sm_edge_overlocked',
  'sm_hem_lettuce',
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Seam and edge-finish part keys shared with the design-quiz resolver (70-SEAMS, 90-EDGES). */
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
  ...EDGE_KINDS,
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
  sm_hem_rolled: 'rolled hem (baby hem)',
  sm_piping: 'piped edge (piping)',
  sm_rib_band: 'rib band',
  sm_self_band: 'self-fabric band',
  sm_casing_elastic: 'elastic casing',
  sm_casing_drawcord: 'drawcord casing',
  sm_edge_overlocked: 'overlocked edge',
  sm_hem_lettuce: 'lettuce edge',
};

export function isSeamKind(value: string): value is SeamKind {
  return (SEAM_KINDS as readonly string[]).includes(value);
}

export function isEdgeKind(value: string): value is EdgeKind {
  return (EDGE_KINDS as readonly string[]).includes(value);
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
  ['sm_hem_rolled', ['rolled hem', 'baby hem', 'narrow hem', 'pin hem', 'rolled edge']],
  ['sm_piping', ['piping', 'piped', 'piped edge', 'cord piping']],
  ['sm_rib_band', ['rib', 'rib band', 'ribbed band', 'rib trim', 'rib cuff', 'ribbing']],
  ['sm_self_band', ['self band', 'self-fabric band', 'neckband', 'fabric band', 'band finish']],
  ['sm_casing_elastic', ['elastic casing', 'elasticated', 'elastic channel', 'elastic waist']],
  ['sm_casing_drawcord', ['drawcord casing', 'drawstring channel', 'drawcord channel', 'tunnel']],
  [
    'sm_edge_overlocked',
    ['overlocked edge', 'serged edge', 'merrow edge', 'overlock edge', 'overlocked hem'],
  ],
  ['sm_hem_lettuce', ['lettuce', 'lettuce edge', 'lettuce hem']],
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
  sm_hem_rolled: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
  sm_piping: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  sm_rib_band: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  sm_self_band: 'TECH_CARD_SEAM_CLASS_BS_BOUND',
  sm_casing_elastic: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
  sm_casing_drawcord: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
  sm_edge_overlocked: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
  sm_hem_lettuce: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
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

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────
// A seam is drawn as a cross-section in a 120-unit space (scaled into the 64 tile below). A ply of
// fabric is an outlined band (GRBPWR line rule 5): its centreline is written by hand, the band
// outline is offset from it here. Stacked plies sit exactly one band apart, so plies pressed
// together share one edge line.

type Pt = readonly [number, number];

/** Band width of one ply, in seam units (120 space). */
const PLY = 10;
const HALF = PLY / 2;
const CURVE_STEPS = 12;

/** Centreline `d` (absolute M/L/H/V/Q, one subpath) → polyline. */
function flatten(d: string): Pt[] {
  const tok = d.match(/[MLHVQ]|-?\d*\.?\d+/g) ?? [];
  const pts: Pt[] = [];
  let at = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  const num = (): number => Number(tok[at++]);
  while (at < tok.length) {
    if (/[MLHVQ]/.test(tok[at])) cmd = tok[at++];
    if (cmd === 'M' || cmd === 'L') {
      x = num();
      y = num();
    } else if (cmd === 'H') x = num();
    else if (cmd === 'V') y = num();
    else if (cmd === 'Q') {
      const cx = num();
      const cy = num();
      const ex = num();
      const ey = num();
      for (let k = 1; k < CURVE_STEPS; k++) {
        const t = k / CURVE_STEPS;
        const u = 1 - t;
        pts.push([
          u * u * x + 2 * u * t * cx + t * t * ex,
          u * u * y + 2 * u * t * cy + t * t * ey,
        ]);
      }
      x = ex;
      y = ey;
    } else break;
    pts.push([x, y]);
  }
  return pts.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6,
  );
}

/** One side of the band: the polyline moved `s` units along its left normal (mitred, capped). */
function offsetSide(pts: Pt[], s: number): Pt[] {
  const normals = pts.slice(1).map((p, i): Pt => {
    const dx = p[0] - pts[i][0];
    const dy = p[1] - pts[i][1];
    const len = Math.hypot(dx, dy);
    return [-dy / len, dx / len];
  });
  return pts.map((p, i): Pt => {
    const a = normals[Math.max(0, i - 1)];
    const b = normals[Math.min(normals.length - 1, i)];
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const len = Math.hypot(mx, my);
    if (len < 1e-6) [mx, my] = b;
    else [mx, my] = [mx / len, my / len];
    const k = s / Math.max(mx * a[0] + my * a[1], 0.5);
    return [p[0] + mx * k, p[1] + my * k];
  });
}

function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + t * rx, a[1] + t * ry] : null;
}

/** Cut the little loops an inner side makes where a fold is tighter than half a band. */
function untangle(poly: Pt[]): Pt[] {
  let out = poly;
  for (let i = 0; i < out.length - 1; i++) {
    for (let j = out.length - 2; j > i + 1; j--) {
      const x = crossing(out[i], out[i + 1], out[j], out[j + 1]);
      if (x) {
        out = [...out.slice(0, i + 1), x, ...out.slice(j + 1)];
        break;
      }
    }
  }
  return out;
}

const bandCache = new Map<string, string>();

/** Closed outline of a ply band around centreline `d`; ends are cut square (a cut fabric edge). */
function bandOf(d: string): string {
  const hit = bandCache.get(d);
  if (hit) return hit;
  const pts = flatten(d);
  const left = untangle(offsetSide(pts, HALF));
  const right = untangle(offsetSide(pts, -HALF)).reverse();
  const fmt = (p: Pt) => `${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`;
  const band = `M${[...left, ...right].map(fmt).join(' L')} Z`;
  bandCache.set(d, band);
  return band;
}

const area = { ...LINE, fill: 'currentColor', fillOpacity: ACCENT_FILL_OPACITY };
const thread = { ...LINE, strokeWidth: LINE_EMPHASIS };
const threadDot = { fill: 'currentColor', stroke: 'none' };
/** Thread end where the needle went through; ≤ 1.5 tile units once scaled. */
const DOT_R = 2.5;

/** One ply of fabric along a centreline. */
function Ply({ d }: { d: string }): JSX.Element {
  return <path {...area} d={bandOf(d)} />;
}

function NeedleV({ x, y1, y2 }: { x: number; y1: number; y2: number }): JSX.Element {
  return (
    <>
      <path {...thread} d={`M${x} ${y1} V${y2}`} />
      <circle {...threadDot} cx={x} cy={y1} r={DOT_R} />
      <circle {...threadDot} cx={x} cy={y2} r={DOT_R} />
    </>
  );
}

function NeedleH({ y, x1, x2 }: { y: number; x1: number; x2: number }): JSX.Element {
  return (
    <>
      <path {...thread} d={`M${x1} ${y} H${x2}`} />
      <circle {...threadDot} cx={x1} cy={y} r={DOT_R} />
      <circle {...threadDot} cx={x2} cy={y} r={DOT_R} />
    </>
  );
}

/** Overlock zigzag wrapping a raw edge at (x, y); `amp` must clear the plies it wraps. */
function Overlock({
  x,
  y,
  dir,
  amp,
  step = 6,
  teeth = 3,
}: {
  x: number;
  y: number;
  dir: 'left' | 'right' | 'up';
  amp: number;
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
  return <path {...thread} d={d} />;
}

/** Binding folded round a raw edge ending at (x, y): a ply band whose two legs touch the edge's
 *  faces and whose fold clears the cut. `dir` is the side the binding legs run to. */
function Binding({
  x,
  y,
  dir,
  width,
}: {
  x: number;
  y: number;
  dir: 'left' | 'right';
  width: number;
}): JSX.Element {
  const sign = dir === 'right' ? 1 : -1;
  const r = PLY;
  const open = x + sign * width;
  const turn = x - sign * r;
  return (
    <Ply
      d={`M${open} ${y - r} H${x} Q${turn} ${y - r} ${turn} ${y} Q${turn} ${y + r} ${x} ${y + r} H${open}`}
    />
  );
}

/** Tape, glue film or elastic: a flat strip, outlined with the accent tint. */
function Strip({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}): JSX.Element {
  return <rect {...area} x={x} y={y} width={width} height={height} rx={1} />;
}

function Cord({ x, y, radius = 7 }: { x: number; y: number; radius?: number }): JSX.Element {
  return <circle {...area} cx={x} cy={y} r={radius} />;
}

function Thread({ d }: { d: string }): JSX.Element {
  return <path {...thread} d={d} />;
}

// Plies: ply 1 comes from the left, ply 2 from the right; the seam line between them is x = 60.
function SeamGlyph({ kind }: { kind: SeamKind }): JSX.Element {
  const plainOpen = (
    <>
      <Ply d='M4 16 H49 Q55 16 55 22 V36 Q55 42 49 42 H26' />
      <Ply d='M116 16 H71 Q65 16 65 22 V36 Q65 42 71 42 H94' />
    </>
  );
  const standing = (bottom: number, top = 18) => (
    <>
      <Ply d={`M4 ${top} H49 Q55 ${top} 55 ${top + 6} V${bottom}`} />
      <Ply d={`M116 ${top} H71 Q65 ${top} 65 ${top + 6} V${bottom}`} />
    </>
  );

  switch (kind) {
    case 'sm_plain_open':
      return (
        <>
          {plainOpen}
          <Overlock x={26} y={42} dir='right' amp={8} step={4} teeth={2} />
          <Overlock x={94} y={42} dir='left' amp={8} step={4} teeth={2} />
          <NeedleH y={28} x1={44} x2={76} />
        </>
      );
    case 'sm_plain_overlock':
      return (
        <>
          {standing(60)}
          <NeedleH y={32} x1={42} x2={78} />
          <Overlock x={60} y={60} dir='up' amp={13} step={5} teeth={3} />
        </>
      );
    case 'sm_safety':
      return (
        <>
          {standing(62)}
          <NeedleH y={30} x1={42} x2={78} />
          <NeedleH y={40} x1={42} x2={78} />
          <Overlock x={60} y={62} dir='up' amp={13} step={5} teeth={3} />
        </>
      );
    case 'sm_french':
      return (
        <>
          <Ply d='M4 18 H39 Q45 18 45 24 V60 Q45 65 50 65 Q55 65 55 60 V38' />
          <Ply d='M116 18 H81 Q75 18 75 24 V60 Q75 65 70 65 Q65 65 65 60 V38' />
          <NeedleH y={30} x1={36} x2={84} />
          <NeedleH y={52} x1={36} x2={84} />
        </>
      );
    case 'sm_flat_felled':
      return (
        <>
          <Ply d='M4 20 H70 Q80 20 80 30 Q80 40 70 40 H44' />
          <Ply d='M116 20 H96 Q90 20 90 26 V44 Q90 50 84 50 H38 Q28 50 28 40 Q28 30 38 30 H66' />
          <NeedleV x={52} y1={8} y2={62} />
          <NeedleV x={64} y1={8} y2={62} />
        </>
      );
    case 'sm_mock_felled':
      return (
        <>
          <Ply d='M4 16 H49 Q55 16 55 22 V30 Q55 36 61 36 H96' />
          <Ply d='M116 16 H70 Q65 16 65 21 Q65 26 70 26 H96' />
          <NeedleH y={24} x1={46} x2={74} />
          <NeedleV x={82} y1={4} y2={48} />
          <Overlock x={96} y={31} dir='left' amp={10} step={5} teeth={2} />
        </>
      );
    case 'sm_lapped':
      return (
        <>
          <Ply d='M4 30 H72' />
          <Ply d='M116 20 H44' />
          <NeedleV x={52} y1={8} y2={42} />
          <NeedleV x={64} y1={8} y2={42} />
        </>
      );
    case 'sm_hong_kong':
      return (
        <>
          {plainOpen}
          <Binding x={26} y={42} dir='right' width={16} />
          <Binding x={94} y={42} dir='left' width={16} />
          <NeedleV x={35} y1={25} y2={59} />
          <NeedleV x={85} y1={25} y2={59} />
          <NeedleH y={28} x1={44} x2={76} />
        </>
      );
    case 'sm_bound':
      return (
        <>
          {standing(52)}
          <NeedleH y={28} x1={44} x2={76} />
          <Ply d='M45 36 V52 Q45 67 60 67 Q75 67 75 52 V36' />
          <NeedleH y={46} x1={36} x2={84} />
        </>
      );
    case 'sm_taped':
      return (
        <>
          <Ply d='M4 16 H49 Q55 16 55 22 V30 Q55 36 61 36 H96' />
          <Ply d='M116 16 H70 Q65 16 65 21 Q65 26 70 26 H96' />
          <NeedleH y={24} x1={46} x2={74} />
          <Strip x={30} y={41} width={74} height={8} />
        </>
      );
    case 'sm_bonded':
      return (
        <>
          <Ply d='M4 36 H72' />
          <Ply d='M116 20 H44' />
          <Strip x={44} y={25} width={28} height={6} />
        </>
      );
    case 'sm_flatlock':
      return (
        <>
          <Ply d='M4 30 H57' />
          <Ply d='M116 30 H63' />
          <NeedleV x={50} y1={18} y2={42} />
          <NeedleV x={70} y1={18} y2={42} />
          <Thread d='M44 30 L50 22 L60 38 L70 22 L76 30' />
        </>
      );
    case 'sm_hem_turned':
      return (
        <>
          <Ply d='M4 18 H88 Q98 18 98 28 Q98 38 88 38 H44 Q39 38 39 33 Q39 28 44 28 H84' />
          <NeedleV x={52} y1={6} y2={50} />
        </>
      );
    case 'sm_hem_blind':
      return (
        <>
          <Ply d='M4 18 H88 Q98 18 98 28 Q98 38 88 38 H40' />
          <Thread d='M46 38 L52 24 L58 38 L64 24 L70 38' />
          <circle {...threadDot} cx={52} cy={20} r={DOT_R} />
        </>
      );
    case 'sm_hem_cover':
      return (
        <>
          <Ply d='M4 18 H90 Q95 18 95 23 Q95 28 90 28 H40' />
          <NeedleV x={50} y1={6} y2={38} />
          <NeedleV x={60} y1={6} y2={38} />
          <Thread d='M46 38 L55 44 L64 38' />
        </>
      );
    case 'sm_hem_raw':
      return (
        <>
          <Ply d='M4 26 H84' />
          <path {...LINE} d='M88 21 L92 26 L88 31' />
        </>
      );
    case 'sm_hem_bound':
      return (
        <>
          <Ply d='M4 26 H84' />
          <Binding x={84} y={26} dir='left' width={18} />
          <NeedleV x={72} y1={8} y2={44} />
        </>
      );
    case 'sm_hem_faced':
      return (
        <>
          <Ply d='M4 18 H88 Q98 18 98 28 Q98 38 88 38 H54' />
          <Ply d='M54 38 H30' />
          <NeedleV x={82} y1={30} y2={46} />
        </>
      );
    case 'sm_hem_rolled':
      return (
        <>
          <Ply d='M4 14 H88 Q103 14 103 29 Q103 44 88 44 H70 Q60 44 60 34 Q60 24 70 24 H86 Q91 24 91 29 Q91 34 86 34 H78' />
          <NeedleV x={80} y1={4} y2={54} />
        </>
      );
    case 'sm_piping':
      return (
        <>
          <Ply d='M4 13 H88 Q109 13 109 34 Q109 55 88 55 H44' />
          <Ply d='M56 45 H88 Q99 45 99 34 Q99 23 88 23 H56' />
          <Cord x={88} y={34} radius={6} />
          <NeedleV x={70} y1={3} y2={65} />
        </>
      );
    case 'sm_rib_band':
      return (
        <>
          <Ply d='M4 20 H49 Q55 20 55 26 V60' />
          <Ply d='M65 60 V24 Q65 10 79 10 H104 Q114 10 114 15 Q114 20 104 20 H85 Q75 20 75 30 V60' />
          <NeedleH y={40} x1={46} x2={84} />
          <Overlock x={65} y={60} dir='up' amp={18} step={5} teeth={2} />
        </>
      );
    case 'sm_self_band':
      return (
        <>
          <Ply d='M4 18 H49 Q55 18 55 24 V38 Q55 44 49 44 H30' />
          <Ply d='M116 12 H73 Q65 12 65 20 V42 Q65 50 73 50 H104' />
          <NeedleH y={31} x1={46} x2={74} />
          <NeedleV x={90} y1={2} y2={60} />
        </>
      );
    case 'sm_casing_elastic':
      return (
        <>
          <Ply d='M4 14 H90 Q102 14 102 26 V36 Q102 48 90 48 H42' />
          <Strip x={58} y={24} width={32} height={14} />
          <NeedleV x={50} y1={4} y2={58} />
        </>
      );
    case 'sm_casing_drawcord':
      return (
        <>
          <Ply d='M4 14 H90 Q102 14 102 26 V36 Q102 48 90 48 H42' />
          <Cord x={76} y={31} radius={8} />
          <NeedleV x={50} y1={4} y2={58} />
        </>
      );
    case 'sm_edge_overlocked':
      return (
        <>
          <Ply d='M4 26 H86' />
          <Overlock x={86} y={26} dir='left' amp={9} step={6} teeth={3} />
        </>
      );
    case 'sm_hem_lettuce':
      return (
        <>
          <Ply d='M4 26 H60 Q68 8 76 26 Q84 44 92 26 Q96 18 102 26' />
          <Overlock x={102} y={26} dir='left' amp={9} step={5} teeth={2} />
        </>
      );
  }
}

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
      {...LINE}
      className={className}
    >
      <g transform='translate(0 12) scale(.5333333333)'>
        <SeamGlyph kind={kind} />
      </g>
    </svg>
  );
}

const stitchDot = { fill: 'currentColor', stroke: 'none' };

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
      {...LINE}
      className={className}
    >
      <path {...LINE} d='M8 19 L37 10 L47 43 L18 52 Z' />
      <circle {...stitchDot} cx='14' cy='23' r='1.5' />
      <path {...LINE} d='M18 14 L49 14 L49 48 L18 48 Z' />
      <circle {...stitchDot} cx='24' cy='20' r='1.5' />
      <path {...area} d='M26 20 L57 27 L50 57 L19 50 Z' />
      <circle {...stitchDot} cx='31' cy='26' r='1.5' />
      <path {...LINE} d='M31 43 L45 46 M33 37 L48 40' />
    </svg>
  );
}
