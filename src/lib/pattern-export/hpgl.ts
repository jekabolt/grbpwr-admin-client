// DXF geometry → PLT in a DOCUMENTED HP-GL dialect (full spec and vendor notes: ./HPGL.md).
//
// NOT VERIFIED ON A PLOTTER. The output is checked by parsing it back with the import's own
// HP-GL reader (scripts/plt-roundtrip-probe.mjs) — that proves the geometry and the commands are
// what this header says, not that a given Gerber/Lectra/Investronica driver accepts them.
//
// Default dialect ("grbpwr HP-GL/1"):
//   IN;                 initialise, nothing else in the preamble (no IP/SC: plotter units raw)
//   PA;                 absolute coordinates for every PU/PD
//   units               40 plotter units per mm (1 plu = 0.025 mm), integers only
//   frame               y-up, origin = bottom-left corner of the drawing's bounding box
//                       (+ `originMm`); mirror happens before rotate-90, both before the anchor
//   SP2                 drawn / internal lines: seam lines, internal lines, grainlines, drills,
//                       the strip of a marker; also the text pen
//   SP3                 notches — short cut ticks
//   SP1                 cut lines (piece outlines), emitted LAST so the plot is complete before a
//                       cutter frees the piece
//   text                `SI w,h;` (cm) + `DI run,rise;` + `PU x,y;` + `LBtext<ETX>` on the text
//                       pen; ASCII only (Cyrillic transliterated, anything else → '?');
//                       `text: false` drops every label
//   curves              arcs are flattened to PD polylines at a chord tolerance (sagitta,
//                       default 0.1 mm); polylines from the DXF reader arrive already flattened
//   commands            one per line (`;\n`), PD split every `maxPairsPerCommand` points
//   end                 `PU;SP0;` — pen up, pen put away
import type { PieceDTO } from 'lib/nesting/types';
import { plotFromPattern } from './plot-drawing';

/** What a line is FOR on the plotter. Pens are assigned per role (see HPGL_DEFAULTS.pens). */
export type PlotRole = 'cut' | 'draw' | 'notch';

/** Millimetres, y-up (DXF and HP-GL agree on y-up; nothing is flipped anywhere in this module). */
export type PlotPt = { x: number; y: number };

export type PlotPolyline = {
  pts: PlotPt[];
  closed: boolean;
  role: PlotRole;
  /** Source layer, for diagnostics only. */
  layer?: string;
};

/** A circular arc, CCW-positive sweep, flattened at `chordToleranceMm` on output. */
export type PlotArc = {
  center: PlotPt;
  radius: number;
  startDeg: number;
  sweepDeg: number;
  role: PlotRole;
  layer?: string;
};

export type PlotText = {
  text: string;
  at: PlotPt;
  /** Cap height, mm (what HP-GL `SI` calls the character height). */
  heightMm: number;
  rotationDeg?: number;
  /** 'center' (default): `at` is the middle of the label box; 'left': baseline-left. */
  align?: 'left' | 'center';
};

/** Neutral plot input — a single pattern sheet or a marker, already in mm. */
export type PlotDrawing = {
  polylines: PlotPolyline[];
  arcs?: PlotArc[];
  texts?: PlotText[];
  /** What the adapter could not express (e.g. pieces with no file position). */
  warnings?: string[];
};

export type HpglPenMap = { cut: number; draw: number; notch: number; text: number };

export type HpglOptions = {
  /** Plotter units per mm. 40 = HP-GL standard (1016 per inch). */
  unitsPerMm?: number;
  pens?: Partial<HpglPenMap>;
  /** Emit labels (LB). false drops all text. */
  text?: boolean;
  /** Mirror left↔right (x → −x) — for plotting face-down / on the back of the paper. */
  mirror?: boolean;
  /** Rotate the whole drawing 90° CCW (e.g. to plot a long marker along the plotter's long axis). */
  rotate90?: boolean;
  /** Offset added after the bottom-left anchor, mm. */
  originMm?: PlotPt;
  /** Max sagitta when flattening arcs, mm. */
  chordToleranceMm?: number;
  /** 'bbox' (default): bottom-left of the drawing lands on (0,0)+origin; 'none': keep coordinates. */
  anchor?: 'bbox' | 'none';
  /** Coordinate pairs per PD command (plotter input buffers are small). */
  maxPairsPerCommand?: number;
};

export const HPGL_DEFAULTS = {
  unitsPerMm: 40,
  pens: { cut: 1, draw: 2, notch: 3, text: 2 } as HpglPenMap,
  text: true,
  mirror: false,
  rotate90: false,
  originMm: { x: 0, y: 0 },
  chordToleranceMm: 0.1,
  anchor: 'bbox' as 'bbox' | 'none',
  maxPairsPerCommand: 100,
};

/** HP-GL character cell: SI width = 0.76 × cap height (the HP-GL default 0.285 × 0.375 cm). */
const CHAR_W_PER_H = 0.285 / 0.375;
/** Advance per character in HP-GL = 1.5 × SI width (character + inter-character space). */
const ADVANCE_PER_W = 1.5;

/** Width of a label of `n` characters at cap height `h` (mm), as the plotter will draw it. */
export function hpglLabelWidthMm(n: number, h: number): number {
  const w = h * CHAR_W_PER_H;
  return n > 0 ? n * ADVANCE_PER_W * w - (ADVANCE_PER_W - 1) * w : 0;
}

type Resolved = typeof HPGL_DEFAULTS;

function resolve(opts: HpglOptions): Resolved {
  return {
    ...HPGL_DEFAULTS,
    ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    pens: { ...HPGL_DEFAULTS.pens, ...(opts.pens ?? {}) },
    originMm: opts.originMm ?? HPGL_DEFAULTS.originMm,
  } as Resolved;
}

/** Arc → polyline whose sagitta stays ≤ tol (the endpoints are exact). */
export function flattenArc(a: PlotArc, tolMm: number): PlotPt[] {
  const r = Math.abs(a.radius);
  if (!(r > 0) || a.sweepDeg === 0) return [];
  const sweep = (a.sweepDeg * Math.PI) / 180;
  const t = Math.min(Math.max(tolMm, 1e-4), r);
  // Sagitta s of a chord spanning angle θ: s = r(1 − cos θ/2) → θ = 2·acos(1 − s/r).
  const step = 2 * Math.acos(1 - t / r);
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-6)));
  const a0 = (a.startDeg * Math.PI) / 180;
  const pts: PlotPt[] = [];
  for (let i = 0; i <= n; i++) {
    const th = a0 + (sweep * i) / n;
    pts.push({ x: a.center.x + r * Math.cos(th), y: a.center.y + r * Math.sin(th) });
  }
  return pts;
}

/** A label after the transform: baseline-left anchor, direction in degrees, mm. */
export type PlacedText = { text: string; at: PlotPt; heightMm: number; rotationDeg: number };

/** The drawing in its FINAL plot frame (mm, after mirror/rotate/anchor/origin, arcs flattened). */
export type FramedDrawing = {
  polylines: PlotPolyline[];
  texts: PlacedText[];
  widthMm: number;
  heightMm: number;
  warnings: string[];
};

/**
 * Apply the plot frame. Exposed so the PDF path and the round-trip probe see exactly the geometry
 * the PLT carries (before the integer rounding to plotter units).
 */
export function frameDrawing(drawing: PlotDrawing, opts: HpglOptions = {}): FramedDrawing {
  const o = resolve(opts);
  const orient = (p: PlotPt): PlotPt => {
    let { x, y } = p;
    if (o.mirror) x = -x;
    if (o.rotate90) [x, y] = [-y, x];
    return { x, y };
  };
  const rotExtra = o.rotate90 ? 90 : 0;

  const polys: PlotPolyline[] = [];
  for (const pl of drawing.polylines) {
    if (pl.pts.length < 2) continue;
    polys.push({ ...pl, pts: pl.pts.map(orient) });
  }
  for (const a of drawing.arcs ?? []) {
    const pts = flattenArc(a, o.chordToleranceMm);
    if (pts.length >= 2)
      polys.push({ pts: pts.map(orient), closed: false, role: a.role, layer: a.layer });
  }

  const texts: PlacedText[] = [];
  if (o.text) {
    for (const t of drawing.texts ?? []) {
      const s = plotterText(t.text);
      if (!s || !(t.heightMm > 0)) continue;
      // Mirroring moves the label, never mirrors the letters: text must stay readable.
      const rot = (t.rotationDeg ?? 0) + rotExtra;
      const at = orient(t.at);
      let left = at;
      if ((t.align ?? 'center') === 'center') {
        const r = (rot * Math.PI) / 180;
        const u = { x: Math.cos(r), y: Math.sin(r) };
        const v = { x: -u.y, y: u.x };
        const hw = hpglLabelWidthMm(s.length, t.heightMm) / 2;
        const hh = t.heightMm / 2;
        left = { x: at.x - u.x * hw - v.x * hh, y: at.y - u.y * hw - v.y * hh };
      }
      texts.push({ text: s, at: left, heightMm: t.heightMm, rotationDeg: rot });
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (p: PlotPt) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const pl of polys) for (const p of pl.pts) grow(p);
  for (const t of texts) {
    const r = (t.rotationDeg * Math.PI) / 180;
    const w = hpglLabelWidthMm(t.text.length, t.heightMm);
    const u = { x: Math.cos(r), y: Math.sin(r) };
    const v = { x: -u.y, y: u.x };
    for (const [s, q] of [
      [0, 0],
      [w, 0],
      [w, t.heightMm],
      [0, t.heightMm],
    ])
      grow({ x: t.at.x + u.x * s + v.x * q, y: t.at.y + u.y * s + v.y * q });
  }
  if (!Number.isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }
  const dx = (o.anchor === 'bbox' ? -minX : 0) + o.originMm.x;
  const dy = (o.anchor === 'bbox' ? -minY : 0) + o.originMm.y;
  const sh = (p: PlotPt): PlotPt => ({ x: p.x + dx, y: p.y + dy });
  return {
    polylines: polys.map((pl) => ({ ...pl, pts: pl.pts.map(sh) })),
    texts: texts.map((t) => ({ ...t, at: sh(t.at) })),
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    warnings: [...(drawing.warnings ?? [])],
  };
}

const CYR: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
};

/**
 * Label text as a plotter can draw it: printable ASCII only. LB ends at ETX and many drivers end
 * it at ';' or a control character too, so those are replaced; Cyrillic is transliterated (piece
 * names here are often Russian), anything else becomes '?'.
 */
export function plotterText(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const lower = ch.toLowerCase();
    if (CYR[lower] !== undefined) {
      const t = CYR[lower];
      out += ch !== lower ? t.charAt(0).toUpperCase() + t.slice(1) : t;
      continue;
    }
    const c = ch.charCodeAt(0);
    if (ch === ';') out += ',';
    else if (c >= 0x20 && c < 0x7f) out += ch;
    else if (/\s/.test(ch)) out += ' ';
    else out += '?';
  }
  return out.replace(/\s+/g, ' ').trim();
}

const ROLE_ORDER: PlotRole[] = ['draw', 'notch', 'cut'];

/**
 * Write the drawing as PLT. `geometry` is either the neutral PlotDrawing (single sheet or a
 * marker via plotFromMarker) or the parsed DXF pieces of ONE pattern file (PieceDTO[], cm),
 * which go through plotFromPattern with its defaults.
 */
export function dxfToHpgl(
  geometry: PlotDrawing | readonly PieceDTO[],
  opts: HpglOptions = {},
): string {
  const drawing: PlotDrawing = Array.isArray(geometry)
    ? plotFromPattern(geometry as readonly PieceDTO[])
    : (geometry as PlotDrawing);
  const o = resolve(opts);
  const framed = frameDrawing(drawing, o);
  const U = o.unitsPerMm;
  const q = (v: number) => {
    const r = Math.round(v * U);
    return r === 0 ? 0 : r; // no "-0"
  };
  const maxPairs = Math.max(1, Math.floor(o.maxPairsPerCommand));

  const out: string[] = ['IN;', 'PA;', 'PU;'];

  // Pen sequence: draw → (text) → notch → cut. Two roles sharing a pen are emitted together.
  const penOf = (r: PlotRole) => o.pens[r];
  const penOrder = [
    ...new Set([
      o.pens.draw,
      ...(framed.texts.length ? [o.pens.text] : []),
      o.pens.notch,
      o.pens.cut,
    ]),
  ];

  for (const pen of penOrder) {
    const lines = framed.polylines.filter((pl) => penOf(pl.role) === pen);
    // Within a pen, keep role order (drawn lines before notches before cuts).
    lines.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    const texts = pen === o.pens.text ? framed.texts : [];
    if (lines.length === 0 && texts.length === 0) continue;
    out.push(`SP${pen};`);
    for (const pl of lines) {
      const pts: [number, number][] = [];
      for (const p of pl.pts) {
        const xy: [number, number] = [q(p.x), q(p.y)];
        const last = pts[pts.length - 1];
        if (!last || last[0] !== xy[0] || last[1] !== xy[1]) pts.push(xy);
      }
      if (pl.closed && pts.length > 1) {
        const [f, l] = [pts[0], pts[pts.length - 1]];
        if (f[0] !== l[0] || f[1] !== l[1]) pts.push([f[0], f[1]]);
      }
      if (pts.length < 2) continue;
      out.push(`PU${pts[0][0]},${pts[0][1]};`);
      for (let i = 1; i < pts.length; i += maxPairs) {
        out.push(
          `PD${pts
            .slice(i, i + maxPairs)
            .flat()
            .join(',')};`,
        );
      }
      out.push('PU;');
    }
    for (const t of texts) {
      const r = (t.rotationDeg * Math.PI) / 180;
      const hCm = t.heightMm / 10;
      const wCm = hCm * CHAR_W_PER_H;
      out.push(`SI${fx(wCm)},${fx(hCm)};`);
      out.push(`DI${fx(Math.cos(r), 4)},${fx(Math.sin(r), 4)};`);
      out.push(`PU${q(t.at.x)},${q(t.at.y)};`);
      out.push(`LB${t.text}\x03`);
    }
  }
  out.push('PU;', 'SP0;');
  return out.join('\n') + '\n';
}

function fx(v: number, d = 3): string {
  const s = v.toFixed(d).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** The PLT as a downloadable file. ASCII only, so latin1 = utf8 here. */
export function hpglBlob(plt: string): Blob {
  return new Blob([plt], { type: 'application/vnd.hp-hpgl' });
}
