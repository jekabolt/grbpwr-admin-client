// PATTERN-IMPORT · ink check (bundled by ink-check.mjs). Question: an open cell of a dxf-shot run —
// is the line missing from the PDF itself, or does the PDF draw ink there that we lose?
//
// Per open cell (outcome ≠ closed, with `leakAt` and the grade prediction `pred`): the stretch of
// `pred` within ±window of the point nearest `leakAt` is sampled every 1 mm. Each sample is asked
// twice, in the frame of every placed page that covers it:
//   ir     — is there an extracted path (page IR, before dedup / chains) within r mm?
//   render — is there a dark pixel within r mm on the page as pdf.js RENDERS it (@napi-rs/canvas)?
// Both are "some ink", not "this size's ink": near a corner where sizes converge every r hits.
// Verdicts per cell (coverage = share of samples with ink, at r = 1.5 mm unless said):
//   reader-loss  render − ir ≥ 0.2       the PDF paints ink our extraction does not have
//   clip-extra   ir − render ≥ 0.2       we have paths the PDF clips away (clips are not applied)
//   ink-present  both ≥ 0.8              the ink is there: lost in chains / rank / link, not in file
//   no-ink       render(3 mm) < 0.3      the file draws nothing there: grade draw or refusal
//   partial      anything else
// Alignment guard: the file's closed cells' outlines must sit on ir ink (median distance ≤ 0.5 mm),
// else this sheet is not the run's sheet and the file is reported `misaligned`, no verdicts.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import {
  applyScale,
  DEFAULT_EXTRACT_OPTS,
  detectScale,
  extractPdf,
  loadPdfjs,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleAllSheets, classifyPages } from 'lib/pattern-import/assemble';
import type { Affine, PagePose, SourceDoc, Style } from 'lib/pattern-import/types';

type Pt = [number, number];
type Cell = {
  size: string;
  outcome: string;
  outer?: Pt[] | null;
  leakAt?: Pt | null;
  pred?: Pt[] | null;
  gap?: { found: boolean; mm?: number; nearEndMm?: number; facing?: boolean } | null;
  refusal?: string | null;
};
type Family = { seed: number; label: string; cells: Cell[] };

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const opt = (a: string[], k: string, d: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);

// ── geometry ────────────────────────────────────────────────────────────────────────────────
const inv = (m: Affine): Affine => {
  const det = m.a * m.d - m.b * m.c;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
};
const ap = (m: Affine, x: number, y: number): Pt => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

/** Segment grid over page-frame segments, 2 mm cells: "any segment within r of p". */
class SegIndex {
  private g = new Map<string, number[]>();
  readonly s: number[] = []; // x0 y0 x1 y1 …
  /** per segment: the pen signature of its path (--pens) */
  readonly tag: string[] = [];
  /** `box` = the page paper (+ margin): segments are clipped to it (the IR keeps a path the PDF
   *  clips — a 1.6 m dashed line on an A4 page is real: MDF453 p. 45 #3454). */
  constructor(
    private box: [number, number, number, number],
    private cell = 2,
  ) {}
  add(a0: Pt, b0: Pt, tag = '') {
    // Liang–Barsky clip to the page box
    const [x0b, y0b, x1b, y1b] = this.box;
    const dx0 = b0[0] - a0[0];
    const dy0 = b0[1] - a0[1];
    let t0 = 0;
    let t1 = 1;
    for (const [pp, qq] of [
      [-dx0, a0[0] - x0b],
      [dx0, x1b - a0[0]],
      [-dy0, a0[1] - y0b],
      [dy0, y1b - a0[1]],
    ]) {
      if (pp === 0) {
        if (qq < 0) return;
      } else {
        const r = qq / pp;
        if (pp < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (t0 > t1) return;
    const a: Pt = [a0[0] + t0 * dx0, a0[1] + t0 * dy0];
    const b: Pt = [a0[0] + t1 * dx0, a0[1] + t1 * dy0];
    const i = this.s.length / 4;
    this.s.push(a[0], a[1], b[0], b[1]);
    this.tag.push(tag);
    const c = this.cell;
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++)
      for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
        const k = `${gx},${gy}`;
        const l = this.g.get(k);
        if (l) l.push(i);
        else this.g.set(k, [i]);
      }
  }
  /** pen signatures of the segments within r of p */
  tagsNear(p: Pt, r: number): Set<string> {
    const out = new Set<string>();
    const c = this.cell;
    for (let gx = Math.floor((p[0] - r) / c); gx <= Math.floor((p[0] + r) / c); gx++)
      for (let gy = Math.floor((p[1] - r) / c); gy <= Math.floor((p[1] + r) / c); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          if (out.has(this.tag[i])) continue;
          const [ax, ay, bx, by] = this.s.slice(i * 4, i * 4 + 4);
          const dx = bx - ax;
          const dy = by - ay;
          const L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)) : 0;
          if (Math.hypot(ax + t * dx - p[0], ay + t * dy - p[1]) <= r) out.add(this.tag[i]);
        }
    return out;
  }
  dist(p: Pt, r: number): number {
    const c = this.cell;
    let best = Infinity;
    for (let gx = Math.floor((p[0] - r) / c); gx <= Math.floor((p[0] + r) / c); gx++)
      for (let gy = Math.floor((p[1] - r) / c); gy <= Math.floor((p[1] + r) / c); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          const [ax, ay, bx, by] = this.s.slice(i * 4, i * 4 + 4);
          const dx = bx - ax;
          const dy = by - ay;
          const L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)) : 0;
          best = Math.min(best, Math.hypot(ax + t * dx - p[0], ay + t * dy - p[1]));
        }
    return best;
  }
}

// ── pens (--pens) ───────────────────────────────────────────────────────────────────────────
let PENS = false;
/** A path's pen: colour, width (0.05 mm), declared dash (0.25 mm), fill. Not its id — styles are
 *  interned per page. A size's marks (beads, triangles) are filled paths with a pen of their own. */
function dashSig(d: number[] | null): string | null {
  if (!d?.length || d.every((v) => v === 0)) return null;
  const per = d.reduce((a, b) => a + b, 0);
  return `${Math.round(Math.log(per) / Math.log(1.1))}:${d.map((v) => Math.round((v / per) * 20)).join('/')}`;
}
function penSig(st: Style | undefined): string {
  if (!st) return '?';
  const q = (v: number, k: number) => Math.round(v / k) * k;
  return [
    st.strokeRgb?.join(',') ?? '-',
    'w' + q(st.widthMm, 0.05).toFixed(2),
    // tile scale moves a dash 3–4 % between pages: keep the motif's SHAPE (each element as a share
    // of the period, 5 % steps) and its period in 10 % log steps
    'd' + (dashSig(st.dash) ?? '-'),
    st.fill ? 'F' : 'S',
  ].join('|');
}
type Covering = (q: Pt) => { x: { idx: SegIndex }; p: Pt }[];
const sigsAt = (covering: Covering, q: Pt, r: number) => {
  const out = new Set<string>();
  for (const { x, p } of covering(q)) for (const t of x.idx.tagsNear(p, r)) out.add(t);
  return out;
};
/**
 * Learn each size's pens from the file's CLOSED outlines (signatures within 0.3 mm of the outline),
 * then read the open cells' prediction stretch: whose pen is the ink there?
 *   own    a pen whose closed-outline mass is ≥ 40 % this size (alike sizes share a pen: then it
 *          is also another's, and counts as own — the probe cannot tell them apart)
 *   shared a pen spread over ≥ half the sizes with no size ≥ 40 % (a common line, drawn once)
 *   other  a pen that belongs to another size
 *   unseen a pen no closed outline uses (guides, labels, or the size has no closed cell)
 */
function pens(fams: Family[], covering: Covering) {
  const cnt = new Map<string, Map<string, number>>();
  const sizes = new Set<string>();
  const closedSamples: { size: string; sigs: Set<string> }[] = [];
  for (const f of fams)
    for (const c of f.cells) {
      sizes.add(c.size);
      if (c.outcome !== 'closed' || !c.outer) continue;
      for (const q of c.outer.filter((_, i) => i % 3 === 0)) {
        const sigs = sigsAt(covering, q, 0.3);
        if (process.env.PEN_DBG && (process.env.PEN_DBG === '*' || f.label.startsWith(process.env.PEN_DBG)) && closedSamples.length % Number(process.env.PEN_DBG_N ?? 4) === 0)
          console.error(f.label.slice(0, 1), c.size, q.map((v) => v.toFixed(0)).join(','), [...sigs].map((t) => t.split('|').slice(1, 3).join('')).join(' '));
        closedSamples.push({ size: c.size, sigs });
        for (const t of sigs) {
          const m = cnt.get(t) ?? new Map<string, number>();
          m.set(c.size, (m.get(c.size) ?? 0) + 1);
          cnt.set(t, m);
        }
      }
    }
  // rate = how often the pen sits on a closed-outline sample OF THIS SIZE: sizes with many closed
  // cells would otherwise own every pen (raw shares were 0.2–0.3 for the true owner on Leah)
  const nOf = new Map<string, number>();
  for (const { size } of closedSamples) nOf.set(size, (nOf.get(size) ?? 0) + 1);
  const rate = (t: string, s: string) => (cnt.get(t)?.get(s) ?? 0) / (nOf.get(s) || Infinity);
  const sampled = [...nOf.keys()];
  // own: this size is (near) the pen's top user and at most 3 sizes are — alike sizes share a pen;
  // a filled pen (marks, letters) is neutral: marks tell sizes apart by SHAPE, not by style
  const kind = (t: string, s: string): 'own' | 'shared' | 'other' | 'unseen' => {
    if (!cnt.has(t)) return 'unseen';
    if (t.endsWith('|F')) return 'shared';
    const mx = Math.max(...sampled.map((k) => rate(t, k)));
    if (sampled.filter((k) => rate(t, k) >= 0.5 * mx).length >= sampled.length / 2) return 'shared';
    const top = sampled.filter((k) => rate(t, k) >= 0.7 * mx);
    if (top.length <= 3 && top.includes(s)) return 'own';
    return 'other';
  };
  const share = (t: string, s: string) => rate(t, s);
  // how well do pens tell sizes apart in this file: closed samples that touch an own pen of their size
  let sep = 0;
  let sepN = 0;
  for (const { size, sigs } of closedSamples) {
    if (!sigs.size) continue;
    sepN++;
    // an own pen of the size that not every size uses
    if ([...sigs].some((t) => kind(t, size) === 'own')) sep++;
  }
  // self-check on closed cells (learned on the same data — optimistic): does the outline carry an
  // own pen of its size at r = 1 mm, and of the NEIGHBOURING size (should not)?
  const check = { trueHit: 0, nbHit: 0, n: 0 };
  for (const f of fams)
    f.cells.forEach((c, i) => {
      const nb = f.cells[i + 1]?.size ?? f.cells[i - 1]?.size;
      if (c.outcome !== 'closed' || !c.outer || !nb) return;
      for (const q of c.outer.filter((_, k) => k % 7 === 0)) {
        const sigs = [...sigsAt(covering, q, 1.0)];
        check.n++;
        if (sigs.some((t) => kind(t, c.size) === 'own')) check.trueHit++;
        if (sigs.some((t) => kind(t, nb) === 'own')) check.nbHit++;
      }
    });
  const selfCheck = {
    trueOwn: check.n ? +(check.trueHit / check.n).toFixed(2) : 0,
    neighbourOwn: check.n ? +(check.nbHit / check.n).toFixed(2) : 0,
  };
  const cells = [];
  for (const f of fams)
    for (const c of f.cells) {
      if (c.outcome === 'closed' || !c.leakAt || !c.pred?.length) continue;
      const win = Math.max(10, Math.min(60, c.gap?.found ? (c.gap.mm ?? 10) : (c.gap?.nearEndMm ?? 30)));
      const fr = { own: 0, shared: 0, other: 0, unseen: 0, none: 0 };
      const pensSeen: Record<string, string> = {};
      let n = 0;
      for (const q of stretch(c.pred, c.leakAt, win)) {
        if (!covering(q).length) continue;
        n++;
        const sigs = sigsAt(covering, q, 1.0);
        if (!sigs.size) {
          fr.none++;
          continue;
        }
        const ks = [...sigs].map((t) => {
          const k = kind(t, c.size);
          pensSeen[t] = k;
          return k;
        });
        // one label per sample, the best news first
        fr[(['own', 'shared', 'other', 'unseen'] as const).find((k) => ks.includes(k))!]++;
      }
      const f2 = Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, n ? +(v / n).toFixed(2) : 0]));
      const verdict =
        n === 0
          ? 'off-page'
          : f2.own >= 0.6
            ? 'own'
            : f2.own + f2.shared >= 0.6
              ? 'own+shared'
              : f2.other >= 0.5
                ? 'other-only'
                : f2.none >= 0.5
                  ? 'none'
                  : 'mixed';
      cells.push({
        piece: f.label,
        size: c.size,
        reason: (c.refusal ?? '').split('|')[0] || null,
        at: c.leakAt.map((v) => +v.toFixed(1)),
        n,
        fr: f2,
        pens: pensSeen,
        verdict,
      });
    }
  const pensOf: Record<string, string[]> = {};
  for (const s of sizes)
    pensOf[s] = nOf.has(s) ? [...cnt.keys()].filter((t) => kind(t, s) === 'own') : ['(no closed cell)'];
  const table = Object.fromEntries(
    [...cnt].map(([t, m]) => [t, Object.fromEntries([...m].sort((a, b) => b[1] - a[1]))]),
  );
  return { separable: sepN ? +(sep / sepN).toFixed(2) : 0, selfCheck, pensOf, table, cells };
}

/** The stretch of `pred` within ±win mm (along it) of the vertex nearest `at`, resampled at 1 mm. */
function stretch(pred: Pt[], at: Pt, win: number): Pt[] {
  const ring = [...pred, pred[0]];
  const cum = [0];
  for (let i = 1; i < ring.length; i++)
    cum.push(cum[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
  const total = cum[cum.length - 1];
  // the point on the ring nearest `at`, as arc length
  let s0 = 0;
  let bd = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1];
    const dx = ring[i][0] - ax;
    const dy = ring[i][1] - ay;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - ay) * dy) / L)) : 0;
    const d = Math.hypot(ax + t * dx - at[0], ay + t * dy - at[1]);
    if (d < bd) [bd, s0] = [d, cum[i - 1] + t * Math.sqrt(L)];
  }
  const at_ = (s: number): Pt => {
    s = ((s % total) + total) % total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [
      ring[i - 1][0] + t * (ring[i][0] - ring[i - 1][0]),
      ring[i - 1][1] + t * (ring[i][1] - ring[i - 1][1]),
    ];
  };
  const out: Pt[] = [];
  const w = Math.min(win, total / 2);
  for (let s = -w; s <= w; s += 1) out.push(at_(s0 + s));
  return out;
}

// ── rendering ───────────────────────────────────────────────────────────────────────────────
type Raster = {
  w: number;
  h: number;
  dark: Uint8Array;
  k: number;
  hMm: number;
  rgba?: Uint8ClampedArray;
};

async function renderer(pdfPath: string, canvasDir: string, pxPerMm: number) {
  const req = createRequire(resolve(canvasDir, 'package.json'));
  const napi = req('@napi-rs/canvas') as {
    createCanvas: (w: number, h: number) => {
      width: number;
      height: number;
      getContext: (t: '2d') => unknown;
    };
  };
  class Factory {
    create(w: number, h: number) {
      const canvas = napi.createCanvas(w, h);
      return { canvas, context: canvas.getContext('2d') };
    }
    reset(cc: { canvas: { width: number; height: number } }, w: number, h: number) {
      cc.canvas.width = w;
      cc.canvas.height = h;
    }
    destroy(cc: { canvas: { width: number; height: number } | null; context: unknown }) {
      if (cc.canvas) cc.canvas.width = cc.canvas.height = 0;
      cc.canvas = null;
      cc.context = null;
    }
  }
  const pdfjs = (await loadPdfjs()) as unknown as {
    getDocument: (o: object) => {
      promise: Promise<{ getPage: (n: number) => Promise<PdfjsPageR> }>;
    };
  };
  type PdfjsPageR = {
    view: number[];
    getViewport: (o: { scale: number; rotation: number }) => { width: number; height: number };
    render: (o: object) => { promise: Promise<void> };
    cleanup: () => void;
  };
  const b = readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(b),
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
    CanvasFactory: Factory,
  }).promise;
  const cache = new Map<number, Raster>();
  return async (page: number): Promise<Raster> => {
    const hit = cache.get(page);
    if (hit) return hit;
    const p = await doc.getPage(page + 1);
    const vp = p.getViewport({ scale: (pxPerMm * 25.4) / 72, rotation: 0 });
    const w = Math.ceil(vp.width);
    const h = Math.ceil(vp.height);
    const canvas = napi.createCanvas(w, h);
    const ctx = canvas.getContext('2d') as {
      fillStyle: string;
      fillRect: (...a: number[]) => void;
      getImageData: (...a: number[]) => { data: Uint8ClampedArray };
    };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    await p.render({ canvasContext: ctx, viewport: vp, background: '#fff' }).promise;
    const px = ctx.getImageData(0, 0, w, h).data;
    const dark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      dark[i] = l < 200 ? 1 : 0;
    }
    p.cleanup();
    const PT = 25.4 / 72;
    const r: Raster = { w, h, dark, k: pxPerMm, hMm: (p.view[3] - p.view[1]) * PT };
    if (process.env.INK_PNG) r.rgba = px;
    cache.set(page, r);
    return r;
  };
}

/** Dark pixel within r mm of page-frame point p (y-up mm → y-down px). */
function inkAt(R: Raster, p: Pt, r: number): boolean {
  const cx = p[0] * R.k;
  const cy = (R.hMm - p[1]) * R.k;
  const rp = r * R.k;
  for (let y = Math.floor(cy - rp); y <= Math.ceil(cy + rp); y++) {
    if (y < 0 || y >= R.h) continue;
    for (let x = Math.floor(cx - rp); x <= Math.ceil(cx + rp); x++) {
      if (x < 0 || x >= R.w) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rp * rp && R.dark[y * R.w + x]) return true;
    }
  }
  return false;
}

/** 80 × 80 mm crop of the rendered page round `at`: our IR segments red, the predicted stretch blue. */
async function dumpPng(out: string, R: Raster, canvasDir: string, at: Pt, segs: number[], pred: Pt[]) {
  const napi = createRequire(resolve(canvasDir, 'package.json'))('@napi-rs/canvas');
  const half = 40 * R.k;
  const cx = at[0] * R.k;
  const cy = (R.hMm - at[1]) * R.k;
  const W = Math.round(2 * half);
  const cvs = napi.createCanvas(W, W);
  const ctx = cvs.getContext('2d');
  const page = napi.createCanvas(R.w, R.h);
  page.getContext('2d').putImageData(new napi.ImageData(R.rgba!, R.w, R.h), 0, 0);
  ctx.drawImage(page, cx - half, cy - half, W, W, 0, 0, W, W);
  const X = (x: number) => x * R.k - cx + half;
  const Y = (y: number) => (R.hMm - y) * R.k - cy + half;
  ctx.strokeStyle = 'rgba(230,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) {
    ctx.moveTo(X(segs[i]), Y(segs[i + 1]));
    ctx.lineTo(X(segs[i + 2]), Y(segs[i + 3]));
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,90,255,0.8)';
  for (const q of pred) ctx.fillRect(X(q[0]) - 2, Y(q[1]) - 2, 4, 4);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, await cvs.encode('png'));
}

// ── per file ────────────────────────────────────────────────────────────────────────────────
const RADII = [0.5, 1.5, 3];

async function oneFile(pdf: string, cellsPath: string, canvasDir: string, pxPerMm: number) {
  const fams = JSON.parse(readFileSync(cellsPath, 'utf8')) as Family[];
  const b = readFileSync(pdf);
  let doc: SourceDoc = await extractPdf(
    {
      id: '0',
      name: pdf.split('/').pop()!,
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
    DEFAULT_EXTRACT_OPTS,
  );
  // the session confirms the top scale candidate (test square) before it assembles
  const sc = detectScale(doc)[0];
  const factor = sc && Math.abs(sc.factor - 1) > 1e-12 ? sc.factor : 1;
  if (factor !== 1)
    doc = applyScale(doc, { factor, method: 'manual', operatorConfirmed: true }) as SourceDoc;
  const docs = [doc];
  const sheet = assembleAllSheets(docs, classifyPages(docs)).sheet;
  const pageOf = new Map(doc.pages.map((p) => [p.page, p]));
  // env INK_DBG="page,x,y" (raw page mm): every IR path with a point within 6 mm of it
  if (process.env.INK_DBG) {
    const [pg, x, y] = process.env.INK_DBG.split(',').map(Number);
    const P = pageOf.get(pg);
    for (const path of P?.paths ?? []) {
      const near = path.pts.filter((q) => Math.hypot(q.x / factor - x, q.y / factor - y) < 6);
      const xs = path.pts.map((q) => q.x / factor);
      const ys = path.pts.map((q) => q.y / factor);
      if (near.length || (Math.min(...xs) < x + 3 && Math.max(...xs) > x - 3 && Math.min(...ys) < y && Math.max(...ys) > y))
        console.error('IR', path.id, 'op', path.src.op, 'n', path.pts.length, 'closed', path.closed, 'bg', path.background ?? '-',
          'style', JSON.stringify(P!.styles[path.style] ?? path.style).slice(0, 160),
          'x', Math.min(...xs).toFixed(1), Math.max(...xs).toFixed(1), 'y', Math.min(...ys).toFixed(1), Math.max(...ys).toFixed(1));
    }
    console.error('poses on page', sheet.poses.filter((q) => q.page === pg).length, 'factor', factor);
  }

  // per pose: page-frame (scaled) segment index + sheet→page affine + paper box
  type PoseX = {
    pose: PagePose;
    toPage: Affine;
    idx: SegIndex;
    w: number;
    h: number;
    /** text boxes (page frame, +0.5 mm): rendered glyphs are not a line */
    texts: [number, number, number, number][];
  };
  const poses: PoseX[] = sheet.poses
    .filter((p) => p.file === '0')
    .map((pose) => {
      const idx = new SegIndex([-5, -5, pose.widthMm + 5, pose.heightMm + 5]);
      const P = pageOf.get(pose.page);
      for (const path of P?.paths ?? []) {
        const pts = path.pts;
        const tag = penSig(P!.styles[path.style]);
        for (let i = 1; i < pts.length; i++)
          idx.add([pts[i - 1].x, pts[i - 1].y], [pts[i].x, pts[i].y], tag);
        if (path.closed && pts.length > 2)
          idx.add([pts[pts.length - 1].x, pts[pts.length - 1].y], [pts[0].x, pts[0].y], tag);
      }
      const texts = (pageOf.get(pose.page)?.texts ?? []).map(
        (t) =>
          [t.bbox.minX - 0.5, t.bbox.minY - 0.5, t.bbox.maxX + 0.5, t.bbox.maxY + 0.5] as [
            number,
            number,
            number,
            number,
          ],
      );
      return { pose, toPage: inv(pose.toSheet), idx, w: pose.widthMm, h: pose.heightMm, texts };
    });
  const covering = (q: Pt) =>
    poses
      .map((x) => ({ x, p: ap(x.toPage, q[0], q[1]) }))
      .filter(({ x, p }) => p[0] >= -1 && p[1] >= -1 && p[0] <= x.w + 1 && p[1] <= x.h + 1);
  const irDist = (q: Pt, r: number) =>
    Math.min(Infinity, ...covering(q).map(({ x, p }) => x.idx.dist(p, r)));

  // alignment guard on closed outlines
  const align: number[] = [];
  for (const f of fams)
    for (const c of f.cells)
      if (c.outcome === 'closed' && c.outer)
        for (const q of c.outer.filter((_, i) => i % 5 === 0)) align.push(irDist(q, 3));
  align.sort((a, b) => a - b);
  const med = align.length ? align[Math.floor(align.length / 2)] : Infinity;
  const base = {
    file: pdf.split('/').pop(),
    factor,
    pages: poses.length,
    alignMedianMm: +med.toFixed(2),
    alignN: align.length,
  };
  if (!(med <= 0.5)) return { ...base, misaligned: true, cells: [] };
  if (PENS) return { ...base, ...pens(fams, covering) };

  const raster = await renderer(pdf, canvasDir, pxPerMm);
  const cells = [];
  for (const f of fams)
    for (const c of f.cells) {
      if (c.outcome === 'closed' || !c.leakAt || !c.pred?.length) continue;
      const win = Math.max(10, Math.min(60, c.gap?.found ? (c.gap.mm ?? 10) : (c.gap?.nearEndMm ?? 30)));
      const samples = stretch(c.pred, c.leakAt, win);
      const cov = { ir: [0, 0, 0], render: [0, 0, 0] };
      let n = 0;
      for (const q of samples) {
        // a sample inside a text box is judged on neither side: the raster there is glyphs
        const cv = covering(q).filter(
          ({ x, p }) =>
            !x.texts.some((b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]),
        );
        if (!cv.length) continue;
        n++;
        // the PDF content at q, scaled frame → raw frame for the raster (applyScale multiplied)
        const rs = await Promise.all(cv.map(({ x }) => raster(x.pose.page)));
        RADII.forEach((r, k) => {
          if (cv.some(({ x, p }) => x.idx.dist(p, r) <= r)) cov.ir[k]++;
          if (cv.some((e, j) => inkAt(rs[j], [e.p[0] / factor, e.p[1] / factor], r)))
            cov.render[k]++;
        });
      }
      const fr = (v: number[]) => v.map((x) => (n ? +(x / n).toFixed(2) : 0));
      const ir = fr(cov.ir);
      const rd = fr(cov.render);
      const verdict =
        n === 0
          ? 'off-page'
          : rd[1] - ir[1] >= 0.2
            ? 'reader-loss'
            : ir[1] - rd[1] >= 0.2
              ? 'clip-extra'
              : ir[1] >= 0.8 && rd[1] >= 0.8
                ? 'ink-present'
                : rd[2] < 0.3
                  ? 'no-ink'
                  : 'partial';
      if (process.env.INK_PNG && verdict !== 'ink-present') {
        const cv = covering(c.leakAt);
        if (cv.length) {
          const { x, p } = cv[0];
          const R = await raster(x.pose.page);
          await dumpPng(
            resolve(process.env.INK_PNG, `${base.file!.slice(0, 24)}-${f.label.slice(0, 12)}-${c.size}-${verdict}.png`),
            R,
            canvasDir,
            [p[0] / factor, p[1] / factor],
            x.idx.s.map((v) => v / factor),
            samples.map((q) => ap(x.toPage, q[0], q[1])).map(([a, b]) => [a / factor, b / factor] as Pt),
          );
        }
      }
      cells.push({
        piece: f.label,
        size: c.size,
        outcome: c.outcome,
        gap: c.gap ?? null,
        reason: (c.refusal ?? '').split('|')[0] || null,
        page: (() => {
          const cv = covering(c.leakAt);
          return cv.length ? { page: cv[0].x.pose.page, at: cv[0].p.map((v) => +(v / factor).toFixed(1)) } : null;
        })(),
        at: c.leakAt.map((v) => +v.toFixed(1)),
        winMm: win,
        n,
        ir,
        render: rd,
        verdict,
      });
    }
  return { ...base, cells };
}

export async function main(argv: string[]): Promise<number> {
  const pdfDir = argv[0];
  const shot = opt(argv, '--shot', '');
  const canvasDir = opt(argv, '--canvas', '');
  const only = opt(argv, '--only', '');
  const pxPerMm = +opt(argv, '--pxmm', '12');
  PENS = argv.includes('--pens');
  if (!pdfDir || !shot || (!canvasDir && !PENS)) {
    console.error('usage: <pdf dir> --shot <dxf-shot out> --canvas <dir with @napi-rs/canvas>');
    return 2;
  }
  // pdf.js polyfills these from @napi-rs/canvas only when IT can resolve the package; ours lives
  // outside the repo, so hand them over before pdf.js loads
  if (!PENS) {
    const napi = createRequire(resolve(canvasDir, 'package.json'))('@napi-rs/canvas');
    const g = globalThis as Record<string, unknown>;
    for (const k of ['Path2D', 'DOMMatrix', 'ImageData']) g[k] ??= napi[k];
  }
  for (const id of readdirSync(shot).sort()) {
    if (only && !id.includes(only)) continue;
    const cellsPath = resolve(shot, id, 'cells.json');
    const pdf = resolve(pdfDir, `${id}.pdf`);
    if (!existsSync(cellsPath) || !existsSync(pdf)) continue;
    const t0 = Date.now();
    try {
      const r = await oneFile(pdf, cellsPath, canvasDir, pxPerMm);
      console.log('@@RESULT ' + JSON.stringify({ ...r, ms: Date.now() - t0 }));
    } catch (e) {
      console.log('@@RESULT ' + JSON.stringify({ file: id, error: String(e).slice(0, 300) }));
    }
  }
  return 0;
}
