// F12 · SVG styling: presentation attributes, `style=""`, and simple `<style>` rule sets
// (Illustrator's default "Style Elements" export writes `.st0{fill:none;stroke:#E30613;…}`).
// Supported selectors: `tag`, `.class`, `#id` and compounds of them (`path.st0`), comma lists.
// Combinators (descendant, child, sibling), pseudo-classes and at-rules are skipped.

import type { XNode } from './xml';

export type Rgb = [number, number, number];

/** Properties the importer reads. Values stay strings until used. */
export const PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'display',
  'visibility',
  'font-size',
  'text-anchor',
  'color',
  'clip-path',
] as const;
export type Prop = (typeof PROPS)[number];
export type Props = Partial<Record<Prop, string>>;

const INHERITED: ReadonlySet<Prop> = new Set<Prop>([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'visibility',
  'font-size',
  'text-anchor',
  'color',
]);

type Rule = {
  tag: string | null;
  id: string | null;
  classes: string[];
  spec: number;
  order: number;
  decls: Props;
};

export class StyleSheet {
  private rules: Rule[] = [];

  add(css: string): void {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const sel = src.slice(i, open).trim();
      // Find the matching close (at-rules may nest one level).
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      i = j;
      if (sel.startsWith('@')) continue;
      const decls = parseDecls(body);
      for (const one of sel.split(',')) {
        const s = one.trim();
        const m = /^([A-Za-z][\w-]*|\*)?((?:[.#][\w-]+)*)$/.exec(s);
        if (!m || (!m[1] && !m[2])) continue;
        const tag = m[1] && m[1] !== '*' ? m[1] : null;
        const parts = m[2].match(/[.#][\w-]+/g) ?? [];
        const ids = parts.filter((p) => p[0] === '#').map((p) => p.slice(1));
        const classes = parts.filter((p) => p[0] === '.').map((p) => p.slice(1));
        if (ids.length > 1) continue;
        this.rules.push({
          tag,
          id: ids[0] ?? null,
          classes,
          spec: ids.length * 10000 + classes.length * 100 + (tag ? 1 : 0),
          order: this.rules.length,
          decls,
        });
      }
    }
  }

  get size(): number {
    return this.rules.length;
  }

  /** Declarations matching the element, lowest specificity first (later wins). */
  match(el: XNode): Props {
    if (!this.rules.length) return {};
    const cls = (el.attrs['class'] ?? '').split(/\s+/).filter(Boolean);
    const id = el.attrs['id'];
    const hits = this.rules.filter(
      (r) =>
        (!r.tag || r.tag === el.local) &&
        (!r.id || r.id === id) &&
        r.classes.every((c) => cls.includes(c)),
    );
    hits.sort((a, b) => a.spec - b.spec || a.order - b.order);
    const out: Props = {};
    for (const h of hits) Object.assign(out, h.decls);
    return out;
  }
}

export function parseDecls(body: string): Props {
  const out: Props = {};
  for (const d of body.split(';')) {
    const k = d.indexOf(':');
    if (k < 0) continue;
    const name = d.slice(0, k).trim().toLowerCase() as Prop;
    const val = d
      .slice(k + 1)
      .replace(/!important/i, '')
      .trim();
    if ((PROPS as readonly string[]).includes(name)) out[name] = val;
  }
  return out;
}

/** Computed props: inherited from parent, then attributes < sheet < style="" (CSS cascade order). */
export function computeProps(el: XNode, parent: Props, sheet: StyleSheet): Props {
  const out: Props = {};
  for (const p of PROPS) if (INHERITED.has(p) && parent[p] !== undefined) out[p] = parent[p];
  const own: Props = {};
  for (const p of PROPS) if (el.attrs[p] !== undefined) own[p] = el.attrs[p].trim();
  Object.assign(own, sheet.match(el));
  if (el.attrs['style']) Object.assign(own, parseDecls(el.attrs['style']));
  for (const p of PROPS) {
    const v = own[p];
    if (v === undefined) continue;
    if (v === 'inherit') {
      if (parent[p] !== undefined) out[p] = parent[p];
      else delete out[p];
    } else out[p] = v;
  }
  return out;
}

const NAMED: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  navy: [0, 0, 128],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  orange: [255, 165, 0],
  brown: [165, 42, 42],
  pink: [255, 192, 203],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
};

/** Paint → rgb 0..255, or null for none / gradients / unknown. `currentColor` resolves via color. */
export function parsePaint(v: string | undefined, color?: string): Rgb | null {
  if (v === undefined) return null;
  const s = v.trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return null;
  if (s === 'currentcolor')
    return color && color.trim().toLowerCase() !== 'currentcolor' ? parsePaint(color) : [0, 0, 0];
  if (s.startsWith('url(')) {
    // Gradient/pattern with a fallback colour: `url(#g) #f00`.
    const rest = s.replace(/^url\([^)]*\)\s*/, '');
    return rest ? parsePaint(rest, color) : [0, 0, 0];
  }
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4)
      return [0, 1, 2].map((k) => parseInt(h[k] + h[k], 16)) as Rgb;
    if (h.length === 6 || h.length === 8)
      return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)) as Rgb;
    return null;
  }
  m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length < 3) return null;
    return parts.map((p) => {
      const pct = p.endsWith('%');
      const n = parseFloat(p);
      return Math.max(0, Math.min(255, Math.round(pct ? (n * 255) / 100 : n)));
    }) as Rgb;
  }
  return NAMED[s] ?? null;
}

/** CSS absolute units in USER units (px), SVG/CSS: 96 px per inch. */
const UNIT_PX: Record<string, number> = {
  '': 1,
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
};

/** A length in user units; `pct` resolves `%`, `em` uses `fontSize`. null when unparseable. */
export function lengthUser(v: string | undefined, pct = 0, fontSize = 16): number | null {
  if (v === undefined) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === '%') return (n / 100) * pct;
  if (u === 'em') return n * fontSize;
  if (u === 'ex') return n * fontSize * 0.5;
  const f = UNIT_PX[u];
  return f === undefined ? null : n * f;
}

export function numberList(v: string | undefined): number[] {
  if (!v) return [];
  const out: number[] = [];
  const re = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) out.push(parseFloat(m[0]));
  return out;
}
