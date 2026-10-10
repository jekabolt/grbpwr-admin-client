// detectScale / applyScale (F1).
//
// detectScale looks for the evidence a printed pattern carries about its own scale and REPORTS it —
// it never rescales anything. Candidates, best first:
//   test-square  an axis-aligned square (one closed path, or four separate sides) whose side
//                matches a dimension written next to it ("10cm x 10cm", "2 inches", "5 cm") and/or
//                a "test square / Kontrollquadrat / Тестовый квадрат …" label;
//   grid         a 1 cm (or 1 inch) ruled grid: ≥ 8 equally spaced parallel lines;
//   none         nothing found (factor 1, confidence 0) — the wizard asks for a manual measure.
// factor = declared / measured: multiply page-frame mm by it to get true mm.

import type {
  ApplyScaleFn,
  BoxMm,
  DetectScaleFn,
  IRPage,
  PageIndex,
  ScaleCandidate,
  SourceDoc,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

type Seg = { x0: number; y0: number; x1: number; y1: number; len: number };

/** A straight side must be axis-aligned within this (mm over its length). */
const AXIS_TOL_MM = 0.05;
/** Corners of one square must meet within this (mm). */
const CORNER_TOL_MM = 0.3;
const MIN_SIDE_MM = 15;
const MAX_SIDE_MM = 260;
/** Reference frames ("19 cm × 28 cm" dimension lines around a box) may span the page. */
const MAX_FRAME_MM = 600;
/** A label belongs to a square when its box is within this distance (mm) of the square's box. */
const LABEL_REACH_MM = 45;
/** declared/measured beyond ±10 % is not a print scaling — most likely the wrong square. */
const MAX_PLAUSIBLE_RATIO_ERR = 0.1;

export const SQUARE_KEYWORD =
  /test\s*(square|box|quadrat)|testquadrat|kontroll\s*quadrat|kontroll?\s*m[åa]ll?|kontrollk(ä|ae)stchen|pr(ü|ue)f\s*quadrat|carr[ée]\s*(de\s*)?(test|contr[ôo]le)|carr[ée]\s*test|cuadrado|quadrato|kwadrat|контрольн|тестов|квадрат|square\s*(above|below|should)|should\s*measure|measure(s)?\s*\d|scale\s*check|massstab|maßstab|масштаб/i;

/** "10cm x 10cm", "10 x 10 cm", "2 inches", "2\"", "5 cm", "50 mm", "8x8 см". */
const UNIT = String.raw`(?:cm|mm|cent[ií]m[eè]tr\w*|mil[ií]m[eè]tr\w*|millimet\w*|in(?:ch(?:es)?)?\b|zoll\b|"|″|”|см|мм|сантиметр\w*|миллиметр\w*)`;
const DIM = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s*(?:(${UNIT})\s*)?(?:[x×х*]\s*(\d+(?:[.,]\d+)?)\s*)?(${UNIT})`,
  'gi',
);

function unitMm(u: string): number {
  const s = u.toLowerCase();
  if (s === 'cm' || s === 'см' || s.startsWith('cent') || s.startsWith('сант')) return 10;
  if (s === 'mm' || s === 'мм' || s.startsWith('mil') || s.startsWith('милл')) return 1;
  if (s.startsWith('in') || s === 'zoll' || s === '"' || s === '″' || s === '”') return 25.4;
  return 0;
}

/** Every length (mm) written in a string. */
export function dimensionsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(DIM)) {
    const u = unitMm(m[4]);
    const u1 = m[2] ? unitMm(m[2]) : u;
    const a = parseFloat(m[1].replace(',', '.')) * u1;
    if (a > 0) out.push(a);
    if (m[3]) {
      const b = parseFloat(m[3].replace(',', '.')) * u;
      if (b > 0 && Math.abs(b - a) > 1e-9) out.push(b);
    }
  }
  return out;
}

function segmentsOf(page: IRPage, maxSide = MAX_SIDE_MM): { h: Seg[]; v: Seg[] } {
  const h: Seg[] = [];
  const v: Seg[] = [];
  for (const p of page.paths) {
    const pts = p.pts;
    const n = pts.length;
    const edges = p.closed ? n : n - 1;
    // Collinear runs of axis-aligned edges become one side.
    let run: { o: 'h' | 'v'; a: { x: number; y: number }; b: { x: number; y: number } } | null =
      null;
    const flush = () => {
      if (!run) return;
      const len = Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y);
      if (len >= MIN_SIDE_MM && len <= maxSide) {
        const s: Seg = {
          x0: Math.min(run.a.x, run.b.x),
          y0: Math.min(run.a.y, run.b.y),
          x1: Math.max(run.a.x, run.b.x),
          y1: Math.max(run.a.y, run.b.y),
          len,
        };
        (run.o === 'h' ? h : v).push(s);
      }
      run = null;
    };
    for (let i = 0; i < edges; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const o: 'h' | 'v' | null =
        Math.abs(dy) <= AXIS_TOL_MM && Math.abs(dx) > AXIS_TOL_MM
          ? 'h'
          : Math.abs(dx) <= AXIS_TOL_MM && Math.abs(dy) > AXIS_TOL_MM
            ? 'v'
            : null;
      const r = run as {
        o: 'h' | 'v';
        a: { x: number; y: number };
        b: { x: number; y: number };
      } | null;
      if (
        o &&
        r &&
        r.o === o &&
        r.b === a &&
        Math.sign(o === 'h' ? b.x - r.a.x : b.y - r.a.y) ===
          Math.sign(o === 'h' ? a.x - r.a.x : a.y - r.a.y)
      ) {
        r.b = b;
      } else {
        flush();
        if (o) run = { o, a, b };
      }
    }
    flush();
  }
  return { h, v };
}

type Rect = { page: PageIndex; box: BoxMm; sideH: number; sideV: number };
type Square = Rect & { side: number };

/** Axis-aligned squares built from horizontal and vertical sides (one path or four). */
export function findSquares(page: IRPage): Square[] {
  return findRects(page, MAX_SIDE_MM)
    .filter((r) => Math.abs(r.sideH - r.sideV) <= 0.03 * r.sideH)
    .map((r) => ({ ...r, side: (r.sideH + r.sideV) / 2 }));
}

/** Axis-aligned rectangles built from horizontal and vertical sides (one path or four). */
export function findRects(page: IRPage, maxSide: number): Rect[] {
  const { h, v } = segmentsOf(page, maxSide);
  const near = (a: number, b: number) => Math.abs(a - b) <= CORNER_TOL_MM;
  h.sort((a, b) => a.len - b.len);
  const out: Rect[] = [];
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    for (let j = i + 1; j < h.length && h[j].len - a.len <= CORNER_TOL_MM; j++) {
      const b = h[j];
      if (!near(a.x0, b.x0) || !near(a.x1, b.x1)) continue;
      const w = (a.len + b.len) / 2;
      if (Math.abs(a.y0 - b.y0) < MIN_SIDE_MM) continue;
      const lo = Math.min(a.y0, b.y0);
      const hi = Math.max(a.y0, b.y0);
      // Best-fitting side, not the first: rings and stroke-over-fill put several within tolerance.
      const side = (x: number) => {
        let best: Seg | null = null;
        let bestE = Infinity;
        for (const s of v) {
          if (!near(s.x0, x) || !near(s.y0, lo) || !near(s.y1, hi)) continue;
          const e = Math.abs(s.x0 - x) + Math.abs(s.y0 - lo) + Math.abs(s.y1 - hi);
          if (e < bestE) {
            bestE = e;
            best = s;
          }
        }
        return best;
      };
      const left = side(a.x0);
      const right = side(a.x1);
      if (!left || !right) continue;
      const sideV = (left.len + right.len) / 2;
      const box = { minX: Math.min(a.x0, b.x0), minY: lo, maxX: Math.max(a.x1, b.x1), maxY: hi };
      // The same square drawn twice (stroke over fill, repeated strokes) is one square; an inner
      // and an outer edge of a ring are two (which one is the nominal side is decided by labels).
      const same = (q: Rect) =>
        Math.abs(q.box.minX - box.minX) < 0.02 &&
        Math.abs(q.box.minY - box.minY) < 0.02 &&
        Math.abs(q.box.maxX - box.maxX) < 0.02 &&
        Math.abs(q.box.maxY - box.maxY) < 0.02;
      if (out.some(same)) continue;
      out.push({ page: page.page, box, sideH: w, sideV });
    }
  }
  return out;
}

const boxDist = (a: BoxMm, b: BoxMm) =>
  Math.hypot(
    Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
    Math.max(0, a.minY - b.maxY, b.minY - a.maxY),
  );

/** Nominal sizes a test square is drawn at, when no text says so (mm). */
const NOMINAL_MM = [25.4, 50, 50.8, 80, 100, 101.6];

function squareCandidates(page: IRPage): ScaleCandidate[] {
  const squares = findSquares(page);
  if (!squares.length) return [];
  const labels = page.texts.map((t) => ({
    t,
    kw: SQUARE_KEYWORD.test(t.text),
    dims: dimensionsIn(t.text),
  }));
  const pageHasKeyword = labels.some((l) => l.kw);
  const out: ScaleCandidate[] = [];
  for (const sq of squares) {
    const nearby = labels.filter((l) => boxDist(l.t.bbox, sq.box) <= LABEL_REACH_MM);
    const kw = nearby.some((l) => l.kw);
    // Declared side: the written dimension closest (by ratio) to the measured side, within ×0.5..×2.
    let declared: number | null = null;
    let declaredText: string | undefined;
    for (const l of nearby) {
      for (const d of l.dims) {
        const r = d / sq.side;
        if (r < 0.5 || r > 2) continue;
        if (declared === null || Math.abs(Math.log(r)) < Math.abs(Math.log(declared / sq.side))) {
          declared = d;
          declaredText = l.t.text;
        }
      }
    }
    const squareness = Math.abs(sq.sideH - sq.sideV);
    let confidence: number;
    if (declared !== null) {
      const ratioErr = Math.abs(declared / sq.side - 1);
      confidence = kw ? 0.97 : 0.9;
      // A real mismatch (print-to-PDF "fit to page" shrinks ~3–6 %) is strong evidence the
      // operator must confirm; beyond ±10 % it is far more likely the wrong square or label.
      if (ratioErr > MAX_PLAUSIBLE_RATIO_ERR) confidence = 0.3;
      else if (ratioErr > PATIMPORT.scaleWarnRatio) confidence = Math.min(confidence, 0.85);
      if (squareness > 0.2) confidence -= 0.1;
    } else if (kw || pageHasKeyword) {
      const nominal = NOMINAL_MM.find((n) => Math.abs(n - sq.side) <= 0.01 * n);
      if (nominal === undefined) continue;
      declared = nominal;
      declaredText = nearby.find((l) => l.kw)?.t.text ?? labels.find((l) => l.kw)?.t.text;
      confidence = kw ? 0.8 : 0.6;
    } else {
      continue;
    }
    out.push({
      method: 'test-square',
      factor: declared / sq.side,
      measuredMm: sq.side,
      declaredMm: declared,
      evidence: {
        page: sq.page,
        bbox: sq.box,
        text: `${declaredText ?? ''} [measured ${sq.sideH.toFixed(3)} × ${sq.sideV.toFixed(3)} mm]`.trim(),
      },
      confidence: Math.max(0, Math.min(1, confidence)),
    });
  }
  return out;
}

/**
 * A reference frame: a rectangle whose side matches, within 1 %, a dimension written next to that
 * side ("19 centímetros" under it, "28 cm" rotated beside it — BLAZER). Weaker than a labelled
 * test square: a size chart's "90 cm" can sit next to any box, hence the tight match.
 */
function frameCandidates(page: IRPage): ScaleCandidate[] {
  const labels = page.texts
    .map((t) => ({
      t,
      dims: dimensionsIn(t.text),
      vertical: Math.abs(Math.abs(t.rotationDeg) - 90) < 5,
    }))
    .filter((l) => l.dims.length);
  if (!labels.length) return [];
  const out: ScaleCandidate[] = [];
  for (const r of findRects(page, MAX_FRAME_MM)) {
    const near = labels.filter((l) => boxDist(l.t.bbox, r.box) <= 12);
    const match = (side: number, wantVertical: boolean) => {
      for (const l of near) {
        if (l.vertical !== wantVertical) continue;
        for (const d of l.dims) if (Math.abs(d / side - 1) <= 0.01) return { d, text: l.t.text };
      }
      return null;
    };
    const mh = match(r.sideH, false);
    const mv = match(r.sideV, true);
    if (!mh && !mv) continue;
    const factors = [mh && mh.d / r.sideH, mv && mv.d / r.sideV].filter((f): f is number => !!f);
    const agree =
      factors.length === 2 && Math.abs(factors[0] / factors[1] - 1) <= PATIMPORT.scaleWarnRatio;
    const use = mh && (!mv || r.sideH >= r.sideV) ? { m: r.sideH, ...mh } : { m: r.sideV, ...mv! };
    out.push({
      method: 'declared',
      factor: use.d / use.m,
      measuredMm: use.m,
      declaredMm: use.d,
      evidence: {
        page: page.page,
        bbox: r.box,
        text: `${[mh?.text, mv?.text].filter(Boolean).join(' · ')} [frame ${r.sideH.toFixed(3)} × ${r.sideV.toFixed(3)} mm]`,
      },
      confidence: agree ? 0.85 : 0.7,
    });
  }
  return out;
}

/** Period of ≥ 8 equally spaced parallel lines, when it is 1 cm or 1 inch (±3 %). */
function gridCandidates(page: IRPage): ScaleCandidate[] {
  const { h, v } = segmentsOf(page);
  const out: ScaleCandidate[] = [];
  for (const [segs, axis] of [
    [h, 'y'],
    [v, 'x'],
  ] as const) {
    const long = segs.filter((s) => s.len >= 60);
    const pos = [
      ...new Set(long.map((s) => Math.round((axis === 'y' ? s.y0 : s.x0) * 1000) / 1000)),
    ].sort((a, b) => a - b);
    if (pos.length < 8) continue;
    for (const nominal of [10, 25.4]) {
      // Longest run of consecutive gaps within 3 % of the nominal period.
      let best: number[] = [];
      let cur: number[] = [];
      for (let i = 1; i < pos.length; i++) {
        const g = pos[i] - pos[i - 1];
        if (Math.abs(g - nominal) <= 0.03 * nominal) cur.push(g);
        else {
          if (cur.length > best.length) best = cur;
          cur = [];
        }
      }
      if (cur.length > best.length) best = cur;
      if (best.length < 7) continue;
      const period = best.reduce((s, g) => s + g, 0) / best.length;
      out.push({
        method: 'grid',
        factor: nominal / period,
        measuredMm: period,
        declaredMm: nominal,
        evidence: {
          page: page.page,
          bbox: { minX: 0, minY: 0, maxX: page.widthMm, maxY: page.heightMm },
          text: `${best.length + 1} lines along ${axis}, period ${period.toFixed(3)} mm`,
        },
        confidence: 0.6,
      });
    }
  }
  return out;
}

export const detectScale: DetectScaleFn = (doc: SourceDoc) => {
  const all: ScaleCandidate[] = [];
  for (const page of doc.pages) all.push(...squareCandidates(page));
  if (!all.some((c) => c.confidence >= 0.9)) {
    const sameBox = (a: BoxMm, b: BoxMm) =>
      Math.abs(a.minX - b.minX) < 0.05 &&
      Math.abs(a.minY - b.minY) < 0.05 &&
      Math.abs(a.maxX - b.maxX) < 0.05 &&
      Math.abs(a.maxY - b.maxY) < 0.05;
    for (const page of doc.pages) {
      for (const c of frameCandidates(page)) {
        // A labelled square already reported as a test square is not also a frame.
        if (
          all.some(
            (q) =>
              q.evidence &&
              c.evidence &&
              q.evidence.page === c.evidence.page &&
              sameBox(q.evidence.bbox, c.evidence.bbox),
          )
        )
          continue;
        all.push(c);
      }
    }
  }
  if (!all.some((c) => c.confidence >= 0.7)) {
    for (const page of doc.pages) all.push(...gridCandidates(page));
  }
  // Collapse repeats (the same square on every tile): one candidate per (declared, measured).
  const seen = new Map<string, ScaleCandidate>();
  for (const c of all) {
    const k = `${c.method}|${c.declaredMm?.toFixed(2)}|${c.measuredMm?.toFixed(2)}`;
    const prev = seen.get(k);
    if (!prev || c.confidence > prev.confidence) seen.set(k, c);
  }
  const logErr = (c: ScaleCandidate) => Math.abs(Math.log(c.factor));
  const out = [...seen.values()].sort(
    (a, b) => b.confidence - a.confidence || logErr(a) - logErr(b),
  );
  if (!out.length) {
    out.push({
      method: 'none',
      factor: 1,
      measuredMm: null,
      declaredMm: null,
      evidence: null,
      confidence: 0,
    });
  }
  return out;
};

/** Style.clip carries its box in page mm (`<kind><op>:x0,y0,x1,y1`, see extract.ts) — scale it too. */
function scaleClip(clip: string | null, f: number): string | null {
  if (!clip) return clip;
  const i = clip.indexOf(':');
  if (i < 0) return clip;
  const nums = clip
    .slice(i + 1)
    .split(',')
    .map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return clip;
  return `${clip.slice(0, i)}:${nums.map((n) => Math.round(n * f * 100) / 100).join(',')}`;
}

export const applyScale: ApplyScaleFn = (doc, decision) => {
  const f = decision.factor;
  if (!(f > 0) || !Number.isFinite(f)) throw new Error(`applyScale: bad factor ${f}`);
  if (f === 1) return doc;
  const box = (b: BoxMm): BoxMm => ({
    minX: b.minX * f,
    minY: b.minY * f,
    maxX: b.maxX * f,
    maxY: b.maxY * f,
  });
  return {
    ...doc,
    warnings: [...doc.warnings],
    pages: doc.pages.map((p) => ({
      ...p,
      widthMm: p.widthMm * f,
      heightMm: p.heightMm * f,
      styles: p.styles.map((s) => ({
        ...s,
        widthMm: s.widthMm * f,
        dash: s.dash ? s.dash.map((d) => d * f) : null,
        clip: scaleClip(s.clip, f),
      })),
      paths: p.paths.map((q) => ({ ...q, pts: q.pts.map((pt) => ({ x: pt.x * f, y: pt.y * f })) })),
      texts: p.texts.map((t) => ({
        ...t,
        anchor: { x: t.anchor.x * f, y: t.anchor.y * f },
        bbox: box(t.bbox),
        fontSizeMm: t.fontSizeMm * f,
      })),
      rasters: p.rasters.map((r) => ({ ...r, bbox: box(r.bbox), dpi: r.dpi / f })),
    })),
  };
};
