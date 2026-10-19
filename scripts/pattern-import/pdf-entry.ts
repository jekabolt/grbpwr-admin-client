// PATTERN-IMPORT · F1 probe entry (bundled by pdf.mjs). Modes:
//   synthetic  hand-written PDF with known geometry (100 mm square, Bézier circle, nested form
//              XObjects with transforms, OCG inside q/Q, ExtGState LW/D, clip, text, inline image)
//              + the same run with CTM handling broken on purpose (must FAIL — negative control)
//   corpus     every PDF of $PATIMPORT_CORPUS/pdf: extract, counts vs the Ф0 probe, OCG names,
//              scale candidates vs the expected test squares
//   perf       one file in this process: time and peak RSS (spawned per file by `all`)
//   all        synthetic + corpus + perf(palto, polupalto) → reports/F1-<date>.json
//   scale | inspect   diagnostics

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  applyScale,
  detectScale,
  detectScaleSet,
  extractPdf,
  extractPdfSet,
  extractPdfWith,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import type { IRPage, ScaleCandidate, SourceDoc } from 'lib/pattern-import/types';

import probeCounts from './fixtures/f0-probe-counts.json';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadLegacy = () => import(LEGACY) as Promise<PdfjsModule>;
setPdfjsLoader(loadLegacy);

const ab = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const base = (p: string) => p.split('/').pop() ?? p;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Synthetic PDF
// ─────────────────────────────────────────────────────────────────────────────────────────────

const K = 72 / 25.4; // mm → pt
const f = (v: number) => (Math.round(v * 1e6) / 1e6).toString();
/** View box origin (pt) — not 0,0, so the page-frame shift is exercised. */
const VX = 10;
const VY = 20;
const pt = (xMm: number, yMm: number) => `${f(VX + xMm * K)} ${f(VY + yMm * K)}`;

type M = [number, number, number, number, number, number];
/** Independent of the adapter's geom.ts: p · n then · m (PDF row-vector order, n applied first). */
const cat = (m: M, n: M): M => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
];
const on = (m: M, x: number, y: number) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});
/** user pt → page mm. */
const TO_MM: M = [1 / K, 0, 0, 1 / K, -VX / K, -VY / K];

const C30 = Math.cos(Math.PI / 6);
const S30 = Math.sin(Math.PI / 6);
/** Page `cm` before the outer form, FA's /Matrix, FB's /Matrix. */
const CM_PAGE: M = [1, 0, 0, 1, VX + 140 * K, VY + 20 * K];
const FA_M: M = [C30, S30, -S30, C30, 30, 10];
const FB_M: M = [2, 0, 0, 0.5, 5, 7];
const NESTED_RECT_PT = [0, 0, 20, 40]; // x y w h inside FB (pt)

const CIRCLE = { cx: 80, cy: 200, r: 50 };
const KAPPA = 0.5522847498307936;

function circleBeziers(): { x: number; y: number }[][] {
  const { cx, cy, r } = CIRCLE;
  const k = KAPPA * r;
  return [
    [
      { x: cx + r, y: cy },
      { x: cx + r, y: cy + k },
      { x: cx + k, y: cy + r },
      { x: cx, y: cy + r },
    ],
    [
      { x: cx, y: cy + r },
      { x: cx - k, y: cy + r },
      { x: cx - r, y: cy + k },
      { x: cx - r, y: cy },
    ],
    [
      { x: cx - r, y: cy },
      { x: cx - r, y: cy - k },
      { x: cx - k, y: cy - r },
      { x: cx, y: cy - r },
    ],
    [
      { x: cx, y: cy - r },
      { x: cx + k, y: cy - r },
      { x: cx + r, y: cy - k },
      { x: cx + r, y: cy },
    ],
  ];
}

function syntheticPdf(): ArrayBuffer {
  const bz = circleBeziers();
  const page = [
    // 1. 100 mm square, stroked 0.5 pt, label below it.
    `q 0.5 w 0 0 1 RG ${pt(20, 20)} m ${pt(120, 20)} l ${pt(120, 120)} l ${pt(20, 120)} l h S Q`,
    `BT /F1 12 Tf 1 0 0 1 ${pt(20, 8)} Tm (Test square 10 cm) Tj ET`,
    // 2. Bézier circle.
    `q 0.3 w ${pt(bz[0][0].x, bz[0][0].y)} m ` +
      bz
        .map((s) => `${pt(s[1].x, s[1].y)} ${pt(s[2].x, s[2].y)} ${pt(s[3].x, s[3].y)} c`)
        .join(' ') +
      ` S Q`,
    // 3. Nested form XObjects with transforms.
    `q ${CM_PAGE.map(f).join(' ')} cm /FA Do Q`,
    // 4. OCG opened INSIDE q…Q, path stroked after Q but before EMC; ExtGState LW + D.
    `q /OC /OC1 BDC Q /GS1 gs 1 0 0 RG ${pt(10, 250)} m ${pt(150, 250)} l S EMC`,
    // 5. Clip recorded, not applied: the line runs beyond the 30 mm clip box.
    `q ${pt(150, 150)} ${f(30 * K)} ${f(30 * K)} re W n 0.2 w ${pt(140, 160)} m ${pt(200, 160)} l S Q`,
    // 6. Fill (letters-as-curves stand-in).
    `q 0 g ${pt(160, 230)} m ${pt(170, 230)} l ${pt(165, 240)} l f Q`,
    // 7. Inline image 4×2 px placed 40 × 20 mm.
    `q ${f(40 * K)} 0 0 ${f(20 * K)} ${pt(150, 100)} cm BI /W 4 /H 2 /BPC 8 /CS /G /F /AHx ID 00FF00FF00FF00FF> EI Q`,
  ].join('\n');
  const fb = `0.4 w ${NESTED_RECT_PT[0]} ${NESTED_RECT_PT[1]} ${NESTED_RECT_PT[2]} ${NESTED_RECT_PT[3]} re S`;
  const fa = `q /FB Do Q`;
  const objs: string[] = [];
  const stream = (dict: string, body: string) =>
    `<< ${dict} /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
  objs[1] = `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [7 0 R] /D << /Order [7 0 R] >> >> >>`;
  objs[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objs[3] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [${VX} ${VY} ${f(VX + 210 * K)} ${f(VY + 297 * K)}] /Contents 4 0 R ` +
    `/Resources << /Font << /F1 8 0 R >> /XObject << /FA 5 0 R >> /Properties << /OC1 7 0 R >> ` +
    `/ExtGState << /GS1 << /LW 2 /D [[6 3] 0] >> >> >> >>`;
  objs[4] = stream('', page);
  objs[5] = stream(
    `/Type /XObject /Subtype /Form /BBox [-100 -100 200 200] /Matrix [${FA_M.map(f).join(' ')}] /Resources << /XObject << /FB 6 0 R >> >>`,
    fa,
  );
  objs[6] = stream(
    `/Type /XObject /Subtype /Form /BBox [-10 -10 60 60] /Matrix [${FB_M.map(f).join(' ')}]`,
    fb,
  );
  objs[7] = `<< /Type /OCG /Name (SIZE-44) >>`;
  objs[8] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let out = '%PDF-1.5\n';
  const offs: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offs[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const b = Buffer.from(out, 'latin1');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

type Check = { name: string; ok: boolean; got: string; want: string };

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const fmt = (v: number) => v.toFixed(4);

function bezierAt(s: { x: number; y: number }[], t: number) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x,
    y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y,
  };
}
function distToPolyline(
  p: { x: number; y: number },
  pts: { x: number; y: number }[],
  closed: boolean,
) {
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y));
  }
  return best;
}

function rectMatches(page: IRPage, want: { x: number; y: number }[], tol: number) {
  let bestErr = Infinity;
  for (const p of page.paths) {
    if (p.pts.length !== want.length) continue;
    // Match as a cyclic sequence starting anywhere.
    for (let s = 0; s < want.length; s++) {
      let e = 0;
      for (let i = 0; i < want.length; i++) {
        const q = p.pts[(i + s) % want.length];
        e = Math.max(e, Math.hypot(q.x - want[i].x, q.y - want[i].y));
      }
      bestErr = Math.min(bestErr, e);
    }
  }
  return { ok: bestErr <= tol, err: bestErr };
}

async function syntheticChecks(): Promise<Check[]> {
  const bytes = syntheticPdf();
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, got: string, want: string) =>
    checks.push({ name, ok, got, want });
  const sunk: { w: number; h: number; px: number }[] = [];
  const doc = await extractPdfWith(
    { id: '0', name: 'synthetic.pdf', bytes },
    DEFAULT_EXTRACT_OPTS,
    undefined,
    {
      rasterSink: (r, px) => {
        sunk.push({ w: r.widthPx, h: r.heightPx, px: px?.data?.length ?? -1 });
      },
    },
  );
  const page = doc.pages[0];
  add(
    'page size',
    near(page.widthMm, 210, 1e-6) && near(page.heightMm, 297, 1e-6),
    `${fmt(page.widthMm)}×${fmt(page.heightMm)}`,
    '210×297',
  );

  // 1. square
  const sq = rectMatches(
    page,
    [
      { x: 20, y: 20 },
      { x: 120, y: 20 },
      { x: 120, y: 120 },
      { x: 20, y: 120 },
    ],
    0.05,
  );
  add('100 mm square corners ±0.05', sq.ok, `max err ${sq.err.toExponential(2)} mm`, '≤ 0.05');
  const sqPath = page.paths.find(
    (p) => p.pts.length === 4 && near(p.pts[0].x, 20, 0.05) && near(p.pts[0].y, 20, 0.05),
  );
  add(
    'square closed, provenance',
    !!sqPath &&
      sqPath.closed &&
      sqPath.src.file === '0' &&
      sqPath.src.page === 0 &&
      sqPath.src.sub === 0,
    JSON.stringify(sqPath?.src),
    'closed, src {file 0, page 0, sub 0}',
  );
  add(
    'square stroke width 0.5 pt',
    !!sqPath && near(page.styles[sqPath.style].widthMm, 0.5 / K, 1e-6),
    sqPath ? fmt(page.styles[sqPath.style].widthMm) : '-',
    fmt(0.5 / K),
  );

  // 2. circle
  const circle = page.paths.find(
    (p) =>
      p.pts.length > 20 &&
      p.pts.every((q) => near(Math.hypot(q.x - CIRCLE.cx, q.y - CIRCLE.cy), CIRCLE.r, 1)),
  );
  if (!circle) add('circle found', false, 'none', 'one path');
  else {
    let maxDev = 0;
    for (const s of circleBeziers())
      for (let i = 0; i <= 2000; i++)
        maxDev = Math.max(maxDev, distToPolyline(bezierAt(s, i / 2000), circle.pts, circle.closed));
    // Distance of each vertex to the exact cubic: coarse sample, then ternary refinement of t.
    let onCurve = 0;
    for (const q of circle.pts) {
      let d = Infinity;
      for (const s of circleBeziers()) {
        const dist = (t: number) => {
          const b = bezierAt(s, t);
          return Math.hypot(b.x - q.x, b.y - q.y);
        };
        let bi = 0;
        for (let i = 1; i <= 200; i++) if (dist(i / 200) < dist(bi / 200)) bi = i;
        let lo = Math.max(0, (bi - 1) / 200);
        let hi = Math.min(1, (bi + 1) / 200);
        for (let k = 0; k < 80; k++) {
          const m1 = lo + (hi - lo) / 3;
          const m2 = hi - (hi - lo) / 3;
          if (dist(m1) < dist(m2)) hi = m2;
          else lo = m1;
        }
        d = Math.min(d, dist((lo + hi) / 2));
      }
      onCurve = Math.max(onCurve, d);
    }
    const radii = circle.pts.map((q) => Math.hypot(q.x - CIRCLE.cx, q.y - CIRCLE.cy));
    add(
      'circle: Bézier→polyline sagitta ≤ 0.05 mm',
      maxDev <= 0.05,
      `${fmt(maxDev)} mm, ${circle.pts.length} pts`,
      '≤ 0.05',
    );
    add(
      'circle: vertices on the curve',
      onCurve <= 1e-6,
      `${onCurve.toExponential(2)} mm`,
      '≤ 1e-6',
    );
    add(
      'circle: radius 50 ± 0.05',
      radii.every((r) => near(r, 50, 0.05)),
      `${fmt(Math.min(...radii))}…${fmt(Math.max(...radii))}`,
      '49.95…50.05',
    );
  }

  // 3. nested forms: FB rect through FB_M, FA_M, page cm, then user → mm.
  const total = cat(TO_MM, cat(CM_PAGE, cat(FA_M, FB_M)));
  const [rx, ry, rw, rh] = NESTED_RECT_PT;
  const want = [
    on(total, rx, ry),
    on(total, rx + rw, ry),
    on(total, rx + rw, ry + rh),
    on(total, rx, ry + rh),
  ];
  const nested = rectMatches(page, want, 0.05);
  add(
    'nested form XObject rect ±0.05 (cm · FA · FB)',
    nested.ok,
    `max err ${nested.err === Infinity ? '∞ (not found)' : nested.err.toExponential(2)} mm`,
    '≤ 0.05',
  );
  const nestedPath = page.paths.find(
    (p) =>
      p.pts.length === 4 && near(p.pts[0].x, want[0].x, 0.05) && near(p.pts[0].y, want[0].y, 0.05),
  );
  const sc = Math.sqrt(Math.abs(total[0] * total[3] - total[1] * total[2])) * K; // linear scale of the form chain
  add(
    'nested stroke width scales with CTM',
    !!nestedPath && near(page.styles[nestedPath.style].widthMm, (0.4 / K) * sc, 1e-6),
    nestedPath ? fmt(page.styles[nestedPath.style].widthMm) : '-',
    fmt((0.4 / K) * sc),
  );
  add(
    'nested path clip = form BBox recorded',
    !!nestedPath && /^f\d+:/.test(page.styles[nestedPath.style].clip ?? ''),
    nestedPath ? String(page.styles[nestedPath.style].clip) : '-',
    'f<op>:…',
  );

  // 4. OCG + ExtGState
  const ocg = page.paths.find((p) => near(p.pts[0].y, 250, 0.01));
  const st = ocg && page.styles[ocg.style];
  add(
    'OCG name across q/Q (BDC inside q, stroke after Q)',
    st?.layer === 'SIZE-44',
    String(st?.layer),
    'SIZE-44',
  );
  add(
    'ExtGState LW 2 pt',
    !!st && near(st.widthMm, 2 / K, 1e-6),
    st ? fmt(st.widthMm) : '-',
    fmt(2 / K),
  );
  add(
    'ExtGState D [6 3] pt',
    !!st?.dash && near(st.dash[0], 6 / K, 1e-6) && near(st.dash[1], 3 / K, 1e-6),
    JSON.stringify(st?.dash?.map(fmt)),
    `[${fmt(6 / K)},${fmt(3 / K)}]`,
  );
  add(
    'page.layers',
    JSON.stringify(page.layers) === '["SIZE-44"]',
    JSON.stringify(page.layers),
    '["SIZE-44"]',
  );

  // 5. clip recorded, not applied
  const clipped = page.paths.find(
    (p) => near(p.pts[0].y, 160, 0.01) && near(p.pts[0].x, 140, 0.01),
  );
  const cst = clipped && page.styles[clipped.style];
  add(
    'clip recorded, geometry not cut',
    !!clipped &&
      near(clipped.pts[1].x, 200, 0.01) &&
      /^c\d+:150,150,180,180$/.test(cst?.clip ?? ''),
    `${clipped ? fmt(clipped.pts[1].x) : '-'} ${cst?.clip}`,
    '200, c<op>:150,150,180,180',
  );

  // 6. fill
  const fill = page.paths.find((p) => page.styles[p.style].fill);
  add(
    'fill path kept as fill:true',
    !!fill && fill.closed && fill.pts.length === 3,
    fill ? `${fill.pts.length} pts` : 'none',
    '3 pts, closed',
  );

  // 7. raster
  const r = page.rasters[0];
  add(
    'inline raster metadata',
    !!r &&
      r.widthPx === 4 &&
      r.heightPx === 2 &&
      near(r.bbox.minX, 150, 1e-6) &&
      near(r.bbox.maxX, 190, 1e-6) &&
      near(r.dpi, 4 / (40 / 25.4), 1e-6),
    r
      ? `${r.widthPx}×${r.heightPx} ${fmt(r.dpi)} dpi [${fmt(r.bbox.minX)},${fmt(r.bbox.maxX)}] cover ${fmt(r.pageCover)}`
      : 'none',
    `4×2 ${fmt(4 / (40 / 25.4))} dpi [150,190]`,
  );
  add(
    'raster sink got pixels',
    sunk.length === 1 && sunk[0].px > 0,
    JSON.stringify(sunk),
    '1 call, data',
  );

  // 8. text
  const t = page.texts.find((x) => x.text.includes('Test square'));
  add(
    'text anchor (mm, y-up) and size',
    !!t &&
      near(t.anchor.x, 20, 1e-3) &&
      near(t.anchor.y, 8, 1e-3) &&
      near(t.fontSizeMm, 12 / K, 1e-3),
    t ? `${fmt(t.anchor.x)},${fmt(t.anchor.y)} fs ${fmt(t.fontSizeMm)}` : 'none',
    `20,8 fs ${fmt(12 / K)}`,
  );

  // 9. scale
  const cands = detectScale(doc);
  const c0 = cands[0];
  add(
    'detectScale: test square 100 mm, factor 1',
    c0?.method === 'test-square' &&
      near(c0.measuredMm ?? 0, 100, 1e-3) &&
      near(c0.factor, 1, 1e-5) &&
      c0.confidence >= 0.9,
    `${c0?.method} ${c0?.measuredMm} f=${c0?.factor} conf ${c0?.confidence}`,
    'test-square 100 f=1 conf ≥ 0.9',
  );
  const F = 1.02;
  const scaled = applyScale(doc, { factor: F, method: 'manual', operatorConfirmed: true });
  const sq2 = rectMatches(
    scaled.pages[0],
    [
      { x: 20 * F, y: 20 * F },
      { x: 120 * F, y: 20 * F },
      { x: 120 * F, y: 120 * F },
      { x: 20 * F, y: 120 * F },
    ],
    1e-6,
  );
  const c2 = detectScale(scaled)[0];
  const sst = scaled.pages[0].styles[ocg?.style ?? 0];
  add(
    'applyScale ×1.02 (pure): square 102 mm, dash/width/dpi scaled, re-detected',
    sq2.ok &&
      near(c2.measuredMm ?? 0, 102, 1e-3) &&
      near(c2.factor, 100 / 102, 1e-6) &&
      near(sst.widthMm, (2 / K) * F, 1e-9) &&
      near(scaled.pages[0].rasters[0].dpi, r.dpi / F, 1e-9) &&
      near(page.paths[0].pts[0].x, 20, 1e-6),
    `${sq2.err.toExponential(2)}; measured ${c2.measuredMm?.toFixed(4)} f=${c2.factor.toFixed(6)} conf ${c2.confidence}; original x ${fmt(page.paths[0].pts[0].x)}`,
    '102 mm, f=0.980392, original unchanged',
  );
  return checks;
}

/** Same synthetic run with CTM handling broken on purpose — must FAIL the geometry checks. */
async function negativeControl(): Promise<{ name: string; failed: string[] }[]> {
  const breaks: [string, Record<string, number>][] = [
    ['form XObject /Matrix ignored', { paintFormXObjectBegin: -101, paintFormXObjectEnd: -102 }],
    ['cm ignored', { transform: -103 }],
  ];
  const out: { name: string; failed: string[] }[] = [];
  for (const [name, patch] of breaks) {
    setPdfjsLoader(async () => {
      const m = await loadLegacy();
      return { ...m, OPS: { ...m.OPS, ...patch } } as PdfjsModule;
    });
    try {
      const checks = await syntheticChecks();
      out.push({ name, failed: checks.filter((c) => !c.ok).map((c) => c.name) });
    } finally {
      setPdfjsLoader(loadLegacy);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Corpus
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Expected test squares (Ф0 + this probe's inspection): declared side, mm. */
const EXPECTED_SQUARE: Record<string, { declared: number; note: string }> = {
  'reef.pdf': { declared: 50.8, note: '2 in TEST BOX p4' },
  'kombinezon.pdf': { declared: 100, note: '10 cm p1' },
  'viola.pdf': { declared: 100, note: '10 × 10 cm p1' },
  'robe.pdf': { declared: 100, note: '10 × 10 cm p12 (ring: outer edge 100.000)' },
  'palto.pdf': { declared: 100, note: 'Kontrollquadrat 10 cm p36' },
  'zhaket.pdf': { declared: 100, note: 'Kontrollquadrat 10 cm p5' },
  'polupalto.pdf': { declared: 100, note: 'Kontrollquadrat 10 cm' },
  'r4454.pdf': { declared: 30, note: '30×30 мм p1' },
  '44.pdf': { declared: 80, note: '8×8 см' },
  'leonie.pdf': { declared: 50, note: '5 cm square is INSIDE the raster → F11' },
};

type PageCount = { strokes: number; fills: number; images: number; text: number };

function countsOf(page: IRPage): PageCount {
  const s = new Set<number>();
  const fl = new Set<number>();
  for (const p of page.paths) {
    const st = page.styles[p.style];
    if (!st.fill || st.widthMm > 0) s.add(p.src.op);
    if (st.fill) fl.add(p.src.op);
  }
  return { strokes: s.size, fills: fl.size, images: page.rasters.length, text: page.texts.length };
}

type FileRow = {
  file: string;
  ok: boolean;
  error?: string;
  ms: number;
  pages: number;
  paths: number;
  texts: number;
  rasters: number;
  layers: string[];
  pathsPerLayer: Record<string, number>;
  textsPerLayer?: Record<string, number>;
  probe?: {
    pagesCompared: number;
    strokeOpsGot: number;
    strokeOpsProbe: number;
    fillOpsGot: number;
    fillOpsProbe: number;
    imagesGot: number;
    imagesProbe: number;
    textGot: number;
    textProbe: number;
    worstPage: string;
  };
  scale: ScaleCandidate[];
  square?: {
    declared: number;
    got: number | null;
    measured: number | null;
    errMm: number | null;
    ok: boolean;
    note: string;
  };
  warnings: string[];
};

async function corpusRows(files: string[]): Promise<FileRow[]> {
  const rows: FileRow[] = [];
  for (const path of files) {
    const name = base(path);
    const t0 = performance.now();
    let doc: SourceDoc;
    try {
      doc = await extractPdf({ id: '0', name, bytes: ab(path) }, DEFAULT_EXTRACT_OPTS);
    } catch (e) {
      rows.push({
        file: name,
        ok: false,
        error: String(e),
        ms: 0,
        pages: 0,
        paths: 0,
        texts: 0,
        rasters: 0,
        layers: [],
        pathsPerLayer: {},
        scale: [],
        warnings: [],
      });
      continue;
    }
    const ms = performance.now() - t0;
    const textsPerLayer: Record<string, number> = {};
    for (const pg of doc.pages)
      for (const t of pg.texts)
        textsPerLayer[t.layer ?? '—'] = (textsPerLayer[t.layer ?? '—'] ?? 0) + 1;
    const pathsPerLayer: Record<string, number> = {};
    const layers: string[] = [];
    for (const pg of doc.pages) {
      for (const l of pg.layers) if (!layers.includes(l)) layers.push(l);
      for (const p of pg.paths) {
        const l = pg.styles[p.style].layer ?? '—';
        pathsPerLayer[l] = (pathsPerLayer[l] ?? 0) + 1;
      }
    }
    const row: FileRow = {
      file: name,
      ok: true,
      ms: Math.round(ms),
      pages: doc.pages.length,
      paths: doc.pages.reduce((s, p) => s + p.paths.length, 0),
      texts: doc.pages.reduce((s, p) => s + p.texts.length, 0),
      rasters: doc.pages.reduce((s, p) => s + p.rasters.length, 0),
      layers,
      pathsPerLayer,
      textsPerLayer,
      scale: detectScale(doc).slice(0, 4),
      warnings: doc.warnings,
    };
    const probe = (probeCounts as Record<string, { pages: (PageCount & { page: number })[] }>)[
      name
    ];
    if (probe) {
      const sum = { sg: 0, sp: 0, fg: 0, fp: 0, ig: 0, ip: 0, tg: 0, tp: 0 };
      let worst = { d: 0, s: '' };
      for (const pp of probe.pages) {
        const pg = doc.pages[pp.page - 1];
        if (!pg) continue;
        const c = countsOf(pg);
        sum.sg += c.strokes;
        sum.sp += pp.strokes;
        sum.fg += c.fills;
        sum.fp += pp.fills;
        sum.ig += c.images;
        sum.ip += pp.images;
        sum.tg += c.text;
        sum.tp += pp.text;
        const d =
          Math.abs(c.strokes - pp.strokes) +
          Math.abs(c.fills - pp.fills) +
          Math.abs(c.images - pp.images) +
          Math.abs(c.text - pp.text);
        if (d > worst.d)
          worst = {
            d,
            s: `p${pp.page}: got ${c.strokes}/${c.fills}/${c.images}/${c.text} probe ${pp.strokes}/${pp.fills}/${pp.images}/${pp.text}`,
          };
      }
      row.probe = {
        pagesCompared: probe.pages.length,
        strokeOpsGot: sum.sg,
        strokeOpsProbe: sum.sp,
        fillOpsGot: sum.fg,
        fillOpsProbe: sum.fp,
        imagesGot: sum.ig,
        imagesProbe: sum.ip,
        textGot: sum.tg,
        textProbe: sum.tp,
        worstPage: worst.s || 'all equal',
      };
    }
    const exp =
      EXPECTED_SQUARE[name] ?? (/^\d\d\.pdf$/.test(name) ? EXPECTED_SQUARE['44.pdf'] : undefined);
    if (exp) {
      const c = row.scale.find(
        (k) =>
          k.method === 'test-square' &&
          k.declaredMm !== null &&
          Math.abs(k.declaredMm - exp.declared) < 1e-6,
      );
      const best = row.scale[0];
      row.square = {
        declared: exp.declared,
        got: c?.declaredMm ?? null,
        measured: c?.measuredMm ?? null,
        errMm: c?.measuredMm != null ? c.measuredMm - exp.declared : null,
        ok: !!c && best === c,
        note: exp.note,
      };
    }
    rows.push(row);
    console.log(
      `${name.padEnd(30)} ${String(row.pages).padStart(3)}p ${String(row.ms).padStart(6)}ms paths=${row.paths} texts=${row.texts} rasters=${row.rasters} layers=${layers.slice(0, 12).join('|')}`,
    );
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

function perfSelf(path: string) {
  const t0 = performance.now();
  return extractPdf({ id: '0', name: base(path), bytes: ab(path) }, DEFAULT_EXTRACT_OPTS).then(
    (doc) => {
      const ms = performance.now() - t0;
      const mem = process.memoryUsage();
      const ru = process.resourceUsage();
      const pts = doc.pages.reduce((s, p) => s + p.paths.reduce((a, q) => a + q.pts.length, 0), 0);
      return {
        file: base(path),
        pages: doc.pages.length,
        ms: Math.round(ms),
        maxRssMB: Math.round(ru.maxRSS / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1048576),
        points: pts,
      };
    },
  );
}

function perfSpawn(path: string) {
  const r = spawnSync(
    process.execPath,
    [resolve(REPO, 'scripts/pattern-import/pdf.mjs'), 'perf', path],
    { encoding: 'utf8' },
  );
  const line = r.stdout.split('\n').find((l) => l.startsWith('{'));
  return line ? JSON.parse(line) : { file: base(path), error: r.stderr.slice(0, 400) };
}

export async function main(argv: string[]): Promise<number> {
  const mode = argv[0] ?? 'all';
  const args = argv.slice(1);
  const corpusFiles = () =>
    args.length
      ? args
      : readdirSync(resolve(CORPUS, 'pdf'))
          .filter((x) => x.endsWith('.pdf'))
          .sort()
          .map((x) => resolve(CORPUS, 'pdf', x));

  if (mode === 'perf') {
    console.log(JSON.stringify(await perfSelf(args[0])));
    return 0;
  }
  if (mode === 'scale') {
    for (const file of corpusFiles()) {
      const doc = await extractPdf({ id: '0', name: file, bytes: ab(file) }, DEFAULT_EXTRACT_OPTS);
      console.log(`# ${base(file)}`);
      for (const k of detectScale(doc).slice(0, 5)) {
        const b = k.evidence?.bbox;
        console.log(
          `   ${k.method} f=${k.factor.toFixed(5)} meas=${k.measuredMm?.toFixed(3)} decl=${k.declaredMm} conf=${k.confidence.toFixed(2)} p${(k.evidence?.page ?? -1) + 1} [${b ? [b.minX, b.minY, b.maxX, b.maxY].map((v) => v.toFixed(1)).join(',') : ''}] ${k.evidence?.text?.slice(0, 90) ?? ''}`,
        );
      }
    }
    return 0;
  }
  if (mode === 'inspect') {
    const [file, pg, x0, y0, x1, y1] = args;
    const doc = await extractPdf(
      { id: '0', name: file, bytes: ab(file) },
      { ...DEFAULT_EXTRACT_OPTS, pages: [Number(pg) - 1] },
    );
    const page = doc.pages[0];
    const inb = (x: number, y: number) => x >= +x0 && x <= +x1 && y >= +y0 && y <= +y1;
    for (const p of page.paths) {
      if (!p.pts.some((q) => inb(q.x, q.y))) continue;
      const st = page.styles[p.style];
      console.log(
        `path ${p.id} op${p.src.op}/${p.src.sub} n=${p.pts.length}${p.closed ? 'c' : ''} ${st.fill ? 'F' : 'S'} w=${st.widthMm.toFixed(3)} rgb=${st.strokeRgb} dash=${st.dash?.map((d) => d.toFixed(2))} L=${st.layer} clip=${st.clip} :: ${p.pts
          .slice(0, 8)
          .map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`)
          .join(' ')}`,
      );
    }
    for (const t of page.texts)
      if (inb(t.anchor.x, t.anchor.y))
        console.log(
          `text "${t.text}" @${t.anchor.x.toFixed(1)},${t.anchor.y.toFixed(1)} fs=${t.fontSizeMm.toFixed(2)} rot=${t.rotationDeg.toFixed(0)} L=${t.layer}`,
        );
    return 0;
  }

  let failed = 0;
  const report: Record<string, unknown> = { date: new Date().toISOString() };
  if (mode === 'synthetic' || mode === 'all') {
    const checks = await syntheticChecks();
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.got} (want ${c.want})`);
    const neg = await negativeControl();
    for (const n of neg)
      console.log(
        `NEGATIVE CONTROL «${n.name}»: ${n.failed.length ? `fails as it must — ${n.failed.join('; ')}` : 'DID NOT FAIL — the test is blind to it'}`,
      );
    failed += checks.filter((c) => !c.ok).length + neg.filter((n) => !n.failed.length).length;
    report.synthetic = { checks, negativeControl: neg };
  }
  if (mode === 'corpus' || mode === 'all') {
    const rows = await corpusRows(corpusFiles());
    failed += rows.filter((r) => !r.ok).length;
    // File-per-size set: the Redcafe 44…54 files as ONE session.
    const set = corpusFiles().filter((x) => /\/\d\d\.pdf$/.test(x));
    if (set.length > 1) {
      const docs = await extractPdfSet(
        set.map((x) => ({ name: base(x), bytes: ab(x) })),
        DEFAULT_EXTRACT_OPTS,
      );
      const s = detectScaleSet(docs);
      report.fileSet = {
        files: docs.map((d) => `${d.file.id}:${d.file.name}`),
        consistent: s.consistent,
        factors: s.perFile.map((c) => c.factor),
        warnings: s.warnings,
      };
      console.log(
        `file set ${set.length}: ids ${docs.map((d) => d.file.id).join(',')} scale consistent=${s.consistent}`,
      );
    }
    report.corpus = rows;
  }
  if (mode === 'all') {
    report.perf = ['palto.pdf', 'polupalto.pdf'].map((x) => perfSpawn(resolve(CORPUS, 'pdf', x)));
    console.log(JSON.stringify(report.perf));
  }
  if (mode === 'all' || mode === 'corpus') {
    mkdirSync(REPORTS, { recursive: true });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const out = resolve(REPORTS, `F1-${day}.json`);
    writeFileSync(out, JSON.stringify(report, null, 1));
    console.log(`report → ${out}`);
  }
  return failed ? 1 : 0;
}
