#!/usr/bin/env node
// PATTERN-IMPORT · F12 — PLT/HPGL + SVG adapters and AI/EPS routing against synthetic truth.
//   node scripts/pattern-import/f12-fixtures.mjs   (once: writes corpus/synthetic/* + f12-truth.json)
//   node scripts/pattern-import/f12-vector.mjs     (this probe; exit 1 on any failure)
//
// Geometry: two-sided distance between the extracted polyline and the ANALYTIC truth (lines,
// circular arcs, cubics) ≤ 0.05 mm (flattening sagitta) — truth sampled every 0.02 mm, plus every
// extracted vertex within 0.03 mm of the truth (plotter quantisation 0.0177 mm max). Labels:
// text, baseline-left anchor ±0.05 mm, rotation ±0.5°, cap/font size ±0.05 mm. Styles, layers,
// dashes, units, warnings and every refusal path. Report → reports/F12-<yyyymmdd>.json.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const SYN = resolve(CORPUS, 'synthetic');
const REPORTS = resolve(CORPUS, '../reports');

const outfile = resolve(tmpdir(), `f12-vector-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'f12-vector-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const m = await import(pathToFileURL(outfile).href);

const OPTS = { sagittaMm: 0.05, keepFills: true };
const SAG = 0.05;
const VERTEX_TOL = 0.03;
const results = [];
let failures = 0;
const check = (fixture, what, ok, got, expected) => {
  results.push({ fixture, what, ok: !!ok, got, expected });
  if (!ok) failures++;
};
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// ── analytic truth ──────────────────────────────────────────────────────────────────────────
const rad = (d) => (d * Math.PI) / 180;
function sampleTruth(segs, step = 0.02) {
  const out = [];
  for (const s of segs) {
    if (s.t === 'L') {
      const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const n = Math.max(1, Math.ceil(L / step));
      for (let i = 0; i <= n; i++)
        out.push([s.a[0] + ((s.b[0] - s.a[0]) * i) / n, s.a[1] + ((s.b[1] - s.a[1]) * i) / n]);
    } else if (s.t === 'A') {
      const n = Math.max(1, Math.ceil((Math.abs(rad(s.a1 - s.a0)) * s.r) / step));
      for (let i = 0; i <= n; i++) {
        const a = rad(s.a0 + ((s.a1 - s.a0) * i) / n);
        out.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]);
      }
    } else {
      const n = 20000;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        out.push(
          [0, 1].map(
            (k) =>
              u * u * u * s.p[0][k] +
              3 * u * u * t * s.p[1][k] +
              3 * u * t * t * s.p[2][k] +
              t * t * t * s.p[3][k],
          ),
        );
      }
    }
  }
  return out;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
/** max over pts of distance to polyline (closed or open); grid-accelerated. */
function maxDistToPolyline(pts, poly, closed) {
  const segs = [];
  const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++)
    segs.push([poly[i][0], poly[i][1], poly[(i + 1) % n][0], poly[(i + 1) % n][1]]);
  const C = 5;
  const grid = new Map();
  const key = (x, y) => `${Math.floor(x / C)},${Math.floor(y / C)}`;
  segs.forEach((s, k) => {
    const x0 = Math.floor(Math.min(s[0], s[2]) / C) - 1;
    const x1 = Math.floor(Math.max(s[0], s[2]) / C) + 1;
    const y0 = Math.floor(Math.min(s[1], s[3]) / C) - 1;
    const y1 = Math.floor(Math.max(s[1], s[3]) / C) + 1;
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const kk = `${gx},${gy}`;
        if (!grid.has(kk)) grid.set(kk, []);
        grid.get(kk).push(k);
      }
  });
  let worst = 0;
  for (const p of pts) {
    const cand = grid.get(key(p[0], p[1]));
    let best = Infinity;
    for (const k of cand ?? segs.map((_, i) => i)) {
      const s = segs[k];
      const d = segDist(p[0], p[1], s[0], s[1], s[2], s[3]);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
}
const bboxOf = (pts) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    if (p[0] < b[0]) b[0] = p[0];
    if (p[1] < b[1]) b[1] = p[1];
    if (p[0] > b[2]) b[2] = p[0];
    if (p[1] > b[3]) b[3] = p[1];
  }
  return b;
};
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const arrNear = (a, b, tol) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((v, i) => near(v, b[i], tol));

function checkStyle(name, label, page, path, exp) {
  const st = page.styles[path.style];
  if (exp.layer !== undefined)
    check(name, `${label}: layer`, st.layer === exp.layer, st.layer, exp.layer);
  if (exp.rgb !== undefined)
    check(name, `${label}: stroke rgb`, arrNear(st.strokeRgb, exp.rgb, 0.5), st.strokeRgb, exp.rgb);
  if (exp.widthMm !== undefined)
    check(
      name,
      `${label}: width mm`,
      near(st.widthMm, exp.widthMm, 0.005),
      r(st.widthMm),
      exp.widthMm,
    );
  if (exp.dash !== undefined)
    check(
      name,
      `${label}: dash mm`,
      exp.dash === null ? st.dash === null : arrNear(st.dash, exp.dash, 0.01),
      st.dash?.map(r) ?? null,
      exp.dash?.map(r) ?? null,
    );
  if (exp.clip !== undefined)
    check(name, `${label}: clip`, st.clip === exp.clip, st.clip, exp.clip);
}
const r = (v) => Math.round(v * 1e4) / 1e4;

async function geometryFixture(name, t) {
  const bytes = readFileSync(resolve(SYN, name));
  const extract = t.adapter === 'hpgl' ? m.extractHpgl : m.extractSvg;
  const doc = await extract({ id: '0', name, bytes: ab(bytes) }, OPTS);
  const page = doc.pages[0];
  check(name, 'file kind', doc.file.kind === t.adapter, doc.file.kind, t.adapter);
  check(
    name,
    'sha256 present',
    /^[0-9a-f]{64}$/.test(doc.file.sha256),
    doc.file.sha256.slice(0, 12),
    'hex64',
  );
  check(
    name,
    'provenance on every path/text',
    [...page.paths, ...page.texts].every(
      (x) => x.src && x.src.file === '0' && x.src.page === 0 && Number.isInteger(x.src.op),
    ),
    'ok',
    'ok',
  );
  if (t.page) {
    check(name, 'page width mm', near(page.widthMm, t.page.w, 0.01), r(page.widthMm), r(t.page.w));
    check(
      name,
      'page height mm',
      near(page.heightMm, t.page.h, 0.01),
      r(page.heightMm),
      r(t.page.h),
    );
  }
  const used = new Set();
  for (const pc of t.pieces ?? []) {
    const truthPts = sampleTruth(pc.segs);
    const tb = bboxOf(truthPts);
    let best = null;
    for (const p of page.paths) {
      if (!p.closed || used.has(p.id)) continue;
      const pts = p.pts.map((q) => [q.x, q.y]);
      const b = bboxOf(pts);
      const bd = Math.max(...b.map((v, i) => Math.abs(v - tb[i])));
      if (!best || bd < best.bd) best = { p, pts, bd };
    }
    if (!best || best.bd > 1) {
      check(
        name,
        `${pc.name}: found`,
        false,
        best ? `bbox off ${r(best.bd)}` : 'no closed path',
        'closed path',
      );
      continue;
    }
    used.add(best.p.id);
    const dT = maxDistToPolyline(truthPts, best.pts, true);
    const dV = maxDistToPolyline(best.pts, truthPts, true);
    check(name, `${pc.name}: truth→path max mm (≤ ${SAG})`, dT <= SAG + 1e-6, r(dT), `≤ ${SAG}`);
    check(
      name,
      `${pc.name}: path vertices→truth max mm (≤ ${VERTEX_TOL})`,
      dV <= VERTEX_TOL,
      r(dV),
      `≤ ${VERTEX_TOL}`,
    );
    checkStyle(name, pc.name, page, best.p, pc);
  }
  for (const pl of t.polylines ?? []) {
    const [a, b] = [pl.pts[0], pl.pts[pl.pts.length - 1]];
    const hit = page.paths.find((p) => {
      if (p.closed) return false;
      const s = p.pts[0];
      const e = p.pts[p.pts.length - 1];
      const fwd =
        Math.hypot(s.x - a[0], s.y - a[1]) <= SAG && Math.hypot(e.x - b[0], e.y - b[1]) <= SAG;
      const rev =
        Math.hypot(s.x - b[0], s.y - b[1]) <= SAG && Math.hypot(e.x - a[0], e.y - a[1]) <= SAG;
      return fwd || rev;
    });
    check(
      name,
      `${pl.name}: endpoints ±${SAG}`,
      !!hit,
      hit ? `path ${hit.id}` : 'missing',
      `${a} → ${b}`,
    );
    if (hit) checkStyle(name, pl.name, page, hit, pl);
  }
  for (const c of t.circles ?? []) {
    let best = null;
    for (const p of page.paths) {
      if (!p.closed) continue;
      const cx = p.pts.reduce((s, q) => s + q.x, 0) / p.pts.length;
      const cy = p.pts.reduce((s, q) => s + q.y, 0) / p.pts.length;
      const d = Math.hypot(cx - c.c[0], cy - c.c[1]);
      if (!best || d < best.d) best = { p, d };
    }
    const radErr = best
      ? Math.max(...best.p.pts.map((q) => Math.abs(Math.hypot(q.x - c.c[0], q.y - c.c[1]) - c.r)))
      : Infinity;
    check(
      name,
      `${c.name}: centre ±${SAG}, radius ±${SAG}`,
      best && best.d <= SAG && radErr <= SAG,
      best ? `centre ${r(best.d)}, radius ${r(radErr)}` : 'missing',
      c,
    );
    if (best) checkStyle(name, c.name, page, best.p, c);
  }
  // Truth sizes are what the source sets: SVG font-size = em, HPGL SI = CAP height. The contract
  // pins IRText.fontSizeMm = em size (HPGL converts cap / 0.7, 89653d57), so compare like with like.
  const capOf = (tx) => (doc.file.kind === 'hpgl' ? tx.fontSizeMm * 0.7 : tx.fontSizeMm);
  for (const L of t.labels ?? []) {
    const tx = page.texts.find((x) => x.text === L.text);
    if (!tx) {
      check(
        name,
        `label "${L.text}"`,
        false,
        page.texts.map((x) => x.text),
        L.text,
      );
      continue;
    }
    if (L.anchor) {
      const d = Math.hypot(tx.anchor.x - L.anchor[0], tx.anchor.y - L.anchor[1]);
      check(
        name,
        `label "${L.text}": anchor ±${L.tolMm}`,
        d <= L.tolMm,
        [r(tx.anchor.x), r(tx.anchor.y)],
        L.anchor,
      );
    } else if (L.center) {
      // LO5: the glyph box middle = the label origin.
      const w = tx.bbox.maxX - tx.bbox.minX;
      const c = [tx.anchor.x + w / 2, tx.anchor.y + capOf(tx) / 2];
      const d = Math.hypot(c[0] - L.center[0], c[1] - L.center[1]);
      check(name, `label "${L.text}": centred (LO5) ±${L.tolMm}`, d <= L.tolMm, c.map(r), L.center);
    }
    const dr = Math.abs(((((tx.rotationDeg - L.rot) % 360) + 540) % 360) - 180);
    check(name, `label "${L.text}": rotation`, dr <= 0.5, r(tx.rotationDeg), L.rot);
    check(
      name,
      `label "${L.text}": size mm${doc.file.kind === 'hpgl' ? ' (cap height = em × 0.7)' : ''}`,
      near(capOf(tx), L.size, 0.05),
      r(capOf(tx)),
      L.size,
    );
    if (L.layer !== undefined)
      check(name, `label "${L.text}": layer`, tx.layer === L.layer, tx.layer, L.layer);
  }
  for (const a of t.absent ?? []) {
    const bad = page.paths.find((p) => {
      const b = bboxOf(p.pts.map((q) => [q.x, q.y]));
      return b[2] - b[0] >= a.minWidthMm;
    });
    check(name, `absent: ${a.name}`, !bad, bad ? `path ${bad.id}` : 'absent', 'absent');
  }
  if (t.layers)
    check(
      name,
      'layers present',
      t.layers.every((l) => page.layers.includes(l)),
      page.layers,
      t.layers,
    );
  if (t.warning)
    check(
      name,
      `warning ~ /${t.warning}/`,
      doc.warnings.some((w) => new RegExp(t.warning, 'i').test(w)),
      doc.warnings,
      t.warning,
    );
  if (t.noWarning)
    check(
      name,
      `no warning ~ /${t.noWarning}/`,
      !doc.warnings.some((w) => new RegExp(t.noWarning, 'i').test(w)),
      doc.warnings,
      `none`,
    );
  if (t.producer)
    check(
      name,
      'producer',
      new RegExp(t.producer).test(doc.file.producer ?? ''),
      doc.file.producer,
      t.producer,
    );
  if (t.styleCount)
    check(
      name,
      `≥ ${t.styleCount.min} style classes`,
      page.styles.length >= t.styleCount.min,
      page.styles.length,
      t.styleCount.min,
    );
  return {
    paths: page.paths.length,
    texts: page.texts.length,
    styles: page.styles.length,
    layers: page.layers,
    warnings: doc.warnings,
  };
}

async function expectRefusal(name, fn, code) {
  try {
    await fn();
    check(name, `refused with ${code}`, false, 'no error', code);
  } catch (e) {
    check(
      name,
      `refused with ${code}`,
      m.isUnsupportedFormat(e) && e.code === code,
      m.isUnsupportedFormat(e) ? e.code : String(e),
      code,
    );
  }
}

// ── corpus fixtures ─────────────────────────────────────────────────────────────────────────
const truth = JSON.parse(readFileSync(resolve(SYN, 'f12-truth.json'), 'utf8'));
const summary = {};
const stubPdfCalls = [];
const stubPdf = async (file) => {
  const head = Buffer.from(file.bytes.slice(0, 5)).toString('latin1');
  stubPdfCalls.push({ name: file.name, head, bytes: file.bytes.byteLength });
  return {
    file: {
      id: file.id,
      name: file.name,
      bytes: file.bytes.byteLength,
      sha256: 'stub',
      kind: 'pdf',
      pages: 1,
    },
    pages: [
      {
        file: file.id,
        page: 0,
        widthMm: 210,
        heightMm: 297,
        styles: [],
        paths: [
          {
            id: 0,
            pts: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            closed: false,
            style: 0,
            src: { file: file.id, page: 0, op: 0, sub: 0 },
          },
        ],
        texts: [],
        rasters: [],
        layers: [],
      },
    ],
    warnings: [],
  };
};

for (const [name, t] of Object.entries(truth.fixtures)) {
  const bytes = readFileSync(resolve(SYN, name));
  const sn = m.sniffFormat(ab(bytes), name);
  if (t.sniff === null)
    check(name, 'sniff → refusal', sn.route === null, sn.route ?? sn.refusal, 'refusal');
  else
    check(
      name,
      `sniff → ${t.sniff}`,
      sn.route === t.sniff,
      sn.route ?? `refused ${sn.refusal}`,
      t.sniff,
    );

  if (t.refusal) {
    if (t.adapter === 'hpgl')
      await expectRefusal(
        name,
        () => m.extractHpgl({ id: '0', name, bytes: ab(bytes) }, OPTS),
        t.refusal,
      );
    else if (t.adapter === 'svg')
      await expectRefusal(
        name,
        () => m.extractSvg({ id: '0', name, bytes: ab(bytes) }, OPTS),
        t.refusal,
      );
    else {
      check(
        name,
        `sniff refusal code ${t.refusal}`,
        sn.route === null && sn.refusal === t.refusal,
        sn.refusal,
        t.refusal,
      );
      await expectRefusal(
        name,
        async () =>
          m.pickExtractor(ab(bytes), name, { pdf: stubPdf })(
            { id: '0', name, bytes: ab(bytes) },
            OPTS,
          ),
        t.refusal,
      );
      await expectRefusal(
        name,
        () => m.makeExtractAi(stubPdf)({ id: '0', name, bytes: ab(bytes) }, OPTS),
        t.refusal,
      );
    }
    continue;
  }
  if (t.routeAi) {
    check(
      name,
      `sniff kind ${t.kind}, pdfOffset ${t.pdfOffset}`,
      sn.kind === t.kind && sn.pdfOffset === t.pdfOffset,
      `${sn.kind}@${sn.pdfOffset}`,
      `${t.kind}@${t.pdfOffset}`,
    );
    const before = stubPdfCalls.length;
    const fn = m.pickExtractor(ab(bytes), name, { pdf: stubPdf });
    const doc = await fn({ id: '0', name, bytes: ab(bytes) }, OPTS);
    const call = stubPdfCalls[before];
    check(
      name,
      'routed to the PDF adapter with bytes starting %PDF-',
      call && call.head === '%PDF-',
      call?.head,
      '%PDF-',
    );
    check(
      name,
      'doc kind ai, size and sha of the ORIGINAL file',
      doc.file.kind === 'ai' &&
        doc.file.bytes === bytes.length &&
        /^[0-9a-f]{64}$|^stub$/.test(doc.file.sha256) &&
        (t.pdfOffset === 0 || doc.file.sha256 !== 'stub'),
      `${doc.file.kind} ${doc.file.bytes} ${doc.file.sha256.slice(0, 8)}`,
      `ai ${bytes.length}`,
    );
    continue;
  }
  summary[name] = await geometryFixture(name, t);
}

// "Saved without PDF Content" placeholder: PDF part with only Adobe's placeholder text.
{
  const name = 'pdf-compatible.ai (placeholder)';
  const bytes = readFileSync(resolve(SYN, 'pdf-compatible.ai'));
  const placeholder = async (file) => {
    const d = await stubPdf(file);
    d.pages[0].paths = [];
    d.pages[0].texts = [
      {
        id: 0,
        text: 'This is an Adobe® Illustrator® File that was saved without PDF Content.',
        anchor: { x: 0, y: 0 },
        bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        fontSizeMm: 4,
        rotationDeg: 0,
        layer: null,
        src: { file: '0', page: 0, op: 0, sub: 0 },
      },
    ];
    return d;
  };
  await expectRefusal(
    name,
    () => m.makeExtractAi(placeholder)({ id: '0', name: 'x.ai', bytes: ab(bytes) }, OPTS),
    'ai-no-pdf-content',
  );
}

// ── in-memory unit cases (units, scaling, syntax edges) ───────────────────────────────────────
const enc = (s) => ab(Buffer.from(s, 'latin1'));
const hp = async (s, o) =>
  (
    await (o ? m.makeExtractHpgl(o) : m.extractHpgl)(
      { id: '0', name: 'u.plt', bytes: enc(s) },
      OPTS,
    )
  ).pages[0];
const sv = async (s, o) => {
  const doc = await (o ? m.makeExtractSvg(o) : m.extractSvg)(
    { id: '0', name: 'u.svg', bytes: enc(s) },
    OPTS,
  );
  return { page: doc.pages[0], doc };
};
const pts = (p) => p.pts.map((q) => [r(q.x), r(q.y)]);
const same = (a, b, tol = 1e-3) =>
  a.length === b.length && a.every((q, i) => near(q[0], b[i][0], tol) && near(q[1], b[i][1], tol));
{
  const U = 'unit';
  let pg = await hp('IN;SP1;PU0,0;PD400,0,400,400,0,400,0,0;');
  check(
    U,
    'HPGL 40 u/mm square → 10 mm, closed',
    pg.paths.length === 1 &&
      pg.paths[0].closed &&
      same(pts(pg.paths[0]), [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    pts(pg.paths[0] ?? { pts: [] }),
    '10 mm square',
  );

  pg = await hp('IN;SP1;PU0,0;PD400,0,400,400,0,400,0,0;', { unitsPerMm: 1016 / 25.4 });
  check(
    U,
    'HPGL unitsPerMm option (1016/in == 40/mm)',
    same(pts(pg.paths[0]), [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]),
    pts(pg.paths[0]),
    '10 mm square',
  );

  pg = await hp('IN;IP0,0,4000,2000;SC0,100,0,100,1;SP1;PU0,0;PD100,0;');
  // isotropic: scale = min(40, 20) = 20 pu/unit; x centred: (4000 − 2000)·0.5 = 1000 pu offset
  check(
    U,
    'HPGL SC isotropic (type 1) centres the short axis',
    same(pts(pg.paths[0]), [
      [25, 0],
      [75, 0],
    ]),
    pts(pg.paths[0]),
    [
      [25, 0],
      [75, 0],
    ],
  );

  pg = await hp('IN;IP400,400;SC0,40,0,40,2;SP1;PA;PU0,0;PD10,0;PR0,5;');
  check(
    U,
    'HPGL SC point-factor (type 2) + IP origin + PR',
    same(pts(pg.paths[0]), [
      [10, 10],
      [20, 10],
      [20, 15],
    ]),
    pts(pg.paths[0]),
    [
      [10, 10],
      [20, 10],
      [20, 15],
    ],
  );

  pg = await hp('IN;SP1;PU0,0;PD;AT400,400,800,0;PU;');
  const okAt =
    pg.paths[0] &&
    pg.paths[0].pts.every((q) => Math.abs(Math.hypot(q.x - 10, q.y) - 10) < 1e-6) &&
    near(pg.paths[0].pts.at(-1).x, 20, 1e-9);
  check(
    U,
    'HPGL AT three-point arc lies on its circle, ends exactly',
    okAt,
    pg.paths[0]?.pts.length,
    'on circle r=10',
  );

  pg = await hp('IN;SP1;PU400,400;EA800,800;RR40,40;');
  check(
    U,
    'HPGL EA edge rect + RR filled rect as separate ops',
    pg.paths.length === 2 &&
      pg.paths[0].closed &&
      pg.styles[pg.paths[1].style].fill === true &&
      pg.paths[0].src.op !== pg.paths[1].src.op,
    pg.paths.map((p) => p.src.op),
    'two ops, second filled',
  );

  pg = await hp('IN;SP1;PU0,0;PD400,0;PD400,400;PU;PD;PU800,0;PD1200,0;');
  check(
    U,
    'HPGL two pen-down runs → two ops',
    pg.paths.length === 2 && pg.paths[0].src.op !== pg.paths[1].src.op,
    pg.paths.map((p) => p.src.op),
    'distinct ops',
  );

  pg = await hp('IN;SP1;PU0,0;PD400,0;SP2;PD400,400;');
  check(
    U,
    'HPGL pen change mid-run splits the run (style per pen)',
    pg.paths.length === 2 && pg.paths[0].style !== pg.paths[1].style,
    pg.paths.length,
    2,
  );

  const doc = await m.extractHpgl(
    { id: '0', name: 'r.plt', bytes: enc('IN;RO90;SP1;PU0,0;PD400,0;') },
    OPTS,
  );
  check(
    U,
    'HPGL RO is warned, not silently applied',
    doc.warnings.some((w) => /RO/.test(w)),
    doc.warnings,
    'RO warning',
  );

  let s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10cm" height="5cm" viewBox="0 0 100 50"><path d="M0,0 L100,50" stroke="#000"/></svg>',
  );
  check(
    U,
    'SVG cm + viewBox, y-flip',
    same(pts(s.page.paths[0]), [
      [0, 50],
      [100, 0],
    ]) && !s.doc.warnings.some((w) => /px/.test(w)),
    pts(s.page.paths[0]),
    [
      [0, 50],
      [100, 0],
    ],
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 2 1"><line x1="0" y1="0" x2="2" y2="0" stroke="red" stroke-width="0.01"/></svg>',
  );
  check(
    U,
    'SVG inches: 1 user unit = 25.4 mm',
    same(pts(s.page.paths[0]), [
      [0, 25.4],
      [50.8, 25.4],
    ]) && near(s.page.styles[0].widthMm, 0.254, 1e-6),
    pts(s.page.paths[0]),
    [
      [0, 25.4],
      [50.8, 25.4],
    ],
  );

  // A0.1 · units in the file → the scale step's 'declared' at confidence 1 (no tick to give);
  // anything that does not prove 1 user unit = the same mm on both axes stays with the test square
  {
    const declared = async (svg) => {
      const q = await sv(svg);
      const c = m.detectScale(q.doc)[0];
      return { u: q.doc.declaredUnits ?? null, c: `${c.method}/${c.confidence}/${c.factor}` };
    };
    const head = (attrs) =>
      `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><path d="M0,0 L10,10" stroke="#000"/></svg>`;
    for (const [what, attrs, unit, uu] of [
      ['mm + viewBox 1:1', 'width="1000mm" height="700mm" viewBox="0 0 1000 700"', 'mm', 1],
      ['cm + viewBox', 'width="10cm" height="5cm" viewBox="0 0 100 50"', 'cm', 1],
      ['in + viewBox', 'width="2in" height="1in" viewBox="0 0 2 1"', 'in', 25.4],
      [
        'mm at 96 dpi (Seamly2D)',
        'width="297mm" height="210mm" viewBox="0 0 1122.5197 793.7008"',
        'mm',
        25.4 / 96,
      ],
    ]) {
      const d = await declared(head(attrs));
      check(
        U,
        `A0.1 SVG ${what} → declared ${unit}, 1 unit = ${uu.toFixed(4)} mm, scale declared/1/1`,
        d.u?.unit === unit && near(d.u.userUnitMm, uu, 1e-4) && d.c === 'declared/1/1',
        { unit: d.u?.unit, userUnitMm: d.u?.userUnitMm, best: d.c },
        { unit, userUnitMm: uu, best: 'declared/1/1' },
      );
    }
    for (const [what, attrs] of [
      ['px size', 'width="800px" height="600px" viewBox="0 0 800 600"'],
      ['unitless size', 'width="800" height="600" viewBox="0 0 800 600"'],
      ['no size', 'viewBox="0 0 800 600"'],
      ['mm size, no viewBox', 'width="100mm" height="100mm"'],
      ['width only', 'width="100mm" viewBox="0 0 100 100"'],
      ['mixed units', 'width="100mm" height="10cm" viewBox="0 0 100 100"'],
      ['pt size', 'width="72pt" height="72pt" viewBox="0 0 72 72"'],
      ['aspect differs (letterboxed)', 'width="100mm" height="100mm" viewBox="0 0 200 100"'],
      [
        'aspect differs (stretched)',
        'width="100mm" height="100mm" viewBox="0 0 200 100" preserveAspectRatio="none"',
      ],
    ]) {
      const d = await declared(head(attrs));
      check(
        U,
        `A0.1 SVG ${what} → not declared (the test square decides)`,
        d.u === null && !d.c.startsWith('declared'),
        { unit: d.u?.unit ?? null, best: d.c },
        { unit: null, best: 'not declared' },
      );
    }
  }

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 200 100" preserveAspectRatio="none"><line x1="0" y1="0" x2="200" y2="100" stroke="#000"/></svg>',
  );
  check(
    U,
    'SVG preserveAspectRatio=none → anisotropic',
    same(pts(s.page.paths[0]), [
      [0, 100],
      [100, 0],
    ]),
    pts(s.page.paths[0]),
    [
      [0, 100],
      [100, 0],
    ],
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 200 100"><line x1="0" y1="0" x2="200" y2="100" stroke="#000"/></svg>',
  );
  check(
    U,
    'SVG xMidYMid meet letterboxes (y offset 25 mm)',
    same(pts(s.page.paths[0]), [
      [0, 75],
      [100, 25],
    ]),
    pts(s.page.paths[0]),
    [
      [0, 75],
      [100, 25],
    ],
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="100mm" viewBox="0 0 100 100"><defs><rect id="r" width="10" height="10" fill="none" stroke="#000"/></defs><use xlink:href="#r" x="5" y="5"/><use href="#r" x="50" y="50" transform="scale(2)"/></svg>',
  );
  check(
    U,
    'SVG <use> (xlink and plain href) with x/y + transform',
    s.page.paths.length === 2 && same(pts(s.page.paths[1]).slice(0, 1), [[100, 0]]),
    s.page.paths.map(pts),
    '2 rects',
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path d="M10-20L.5.5l1e1-1E1" stroke="#000"/></svg>',
  );
  check(
    U,
    'SVG path numbers: implicit separators, leading dots, exponents',
    same(pts(s.page.paths[0]), [
      [10, 120],
      [0.5, 99.5],
      [10.5, 109.5],
    ]),
    pts(s.page.paths[0]),
    [
      [10, 120],
      [0.5, 99.5],
      [10.5, 109.5],
    ],
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><g visibility="hidden"><path d="M0,0H10" stroke="#000"/><path d="M0,5H10" stroke="#000" visibility="visible"/></g><path d="M0 0 H 10" fill="#000"/></svg>',
  );
  check(
    U,
    'SVG visibility inheritance + override; fill-only kept as fill',
    s.page.paths.length === 2 && s.page.styles[s.page.paths[1].style].fill === true,
    s.page.paths.map(pts),
    '2 paths',
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path d="M10,50 A40,40 0 1 1 90,50 A40,40 0 1 1 10,50 Z" fill="none" stroke="#000"/></svg>',
  );
  const circ = s.page.paths[0];
  const circErr = Math.max(...circ.pts.map((q) => Math.abs(Math.hypot(q.x - 50, q.y - 50) - 40)));
  const n = circ.pts.length;
  let sag = 0;
  for (let i = 0; i < n; i++) {
    const a = circ.pts[i];
    const b = circ.pts[(i + 1) % n];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    sag = Math.max(sag, 40 - Math.hypot(mx - 50, my - 50));
  }
  check(
    U,
    'SVG large-arc circle: vertices on circle, chord sagitta ≤ 0.05 mm',
    circErr < 1e-9 && sag <= SAG + 1e-9,
    `vertex ${circErr.toExponential(1)}, sagitta ${r(sag)}, ${n} pts`,
    '≤ 0.05',
  );

  s = await sv(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><path d="M0,0 H10" stroke="#000"/></svg>',
    { pxPerInch: 72 },
  );
  check(
    U,
    'SVG px basis override (72 dpi)',
    near(s.page.paths[0].pts[1].x, 10 * (25.4 / 72), 1e-9),
    r(s.page.paths[0].pts[1].x),
    r(10 * (25.4 / 72)),
  );

  await expectRefusal(
    U,
    () => m.extractHpgl({ id: '0', name: 'e.plt', bytes: enc('IN;SP1;PU0,0;PU;') }, OPTS),
    'hpgl-no-geometry',
  );
  await expectRefusal(
    U,
    () => m.extractSvg({ id: '0', name: 'e.svg', bytes: new ArrayBuffer(0) }, OPTS),
    'empty',
  );
}

// ── C4 · bounded work (negative controls) ──────────────────────────────────────────────────
{
  const B = 'C4 bounded work';
  const { gzipSync } = await import('node:zlib');
  const reg = {
    pdf: async () => {
      throw new Error('no pdf here');
    },
    svg: m.extractSvg,
    hpgl: m.extractHpgl,
  };
  /** Through pickExtractor (the session's path): budget + finite boundary + file name. */
  const run = async (name, bytes, opts = OPTS) => {
    const t0 = performance.now();
    try {
      const doc = await m.pickExtractor(bytes, name, reg)({ id: '0', name, bytes }, opts);
      return { doc, ms: performance.now() - t0 };
    } catch (e) {
      return { err: e, ms: performance.now() - t0 };
    }
  };
  const refused = (res, errName) =>
    !!res.err && res.err.name === errName && String(res.err.message).length > 20;
  const svg = (body) =>
    enc(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="100mm" viewBox="0 0 100 100">${body}</svg>`,
    );

  let res = await run('inf.svg', svg('<path d="M0,0 L1e309,5" stroke="#000"/>'));
  check(
    B,
    '1e309 path coordinate → refused as corrupt (named, with the file name)',
    refused(res, 'CorruptInput') && res.err.message.startsWith('inf.svg'),
    res.err ? `${res.err.name}: ${res.err.message.slice(0, 90)}` : 'accepted',
    'CorruptInput',
  );
  res = await run('infc.svg', svg('<circle cx="50" cy="50" r="1e309" stroke="#000" fill="none"/>'));
  check(
    B,
    'circle r=1e309 → bounded flattening, refused as corrupt',
    refused(res, 'CorruptInput') && res.ms < 2000,
    `${res.err?.name ?? 'accepted'} in ${Math.round(res.ms)} ms`,
    'CorruptInput < 2 s',
  );
  res = await run(
    'infw.svg',
    enc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1e309mm" height="100mm"><path d="M0,0 L10,5" stroke="#000"/></svg>',
    ),
  );
  check(
    B,
    'page width 1e309mm → refused as corrupt',
    refused(res, 'CorruptInput'),
    res.err?.name ?? 'accepted',
    'CorruptInput',
  );

  res = await run(
    'huge-r.svg',
    svg(
      '<ellipse cx="50" cy="50" rx="1e12" ry="1e12" stroke="#000" fill="none"/><path d="M0,0 A1e12,1e12 0 1 1 1,0" stroke="#000" fill="none"/>',
    ),
  );
  const maxPts = res.doc ? Math.max(...res.doc.pages[0].paths.map((p) => p.pts.length)) : -1;
  check(
    B,
    'ellipse / arc with radius 1e12 → at most 4096 segments per curve, < 1 s',
    !!res.doc && maxPts <= 4097 && res.ms < 1000,
    `${maxPts} pts max, ${Math.round(res.ms)} ms${res.err ? ` ${res.err.name}` : ''}`,
    '≤ 4097 pts',
  );
  res = await run('huge-ci.plt', enc('IN;SP1;PA0,0;PD;CI100000000;PU;'));
  const ciPts = res.doc ? Math.max(...res.doc.pages[0].paths.map((p) => p.pts.length)) : -1;
  check(
    B,
    'HPGL circle of a 2.5 km radius → at most 4096 segments',
    !!res.doc && ciPts <= 4097,
    `${ciPts} pts${res.err ? ` ${res.err.name}: ${res.err.message}` : ''}`,
    '≤ 4097 pts',
  );

  // <use> fan-out: 9 levels, each using the one below 10 times → 10^9 copies
  let defs = '<path id="u0" d="M0,0 L1,1" stroke="#000"/>';
  for (let k = 1; k <= 9; k++)
    defs += `<g id="u${k}">${Array.from({ length: 10 }, () => `<use href="#u${k - 1}"/>`).join('')}</g>`;
  res = await run('fanout.svg', svg(`<defs>${defs}</defs><use href="#u9"/>`));
  check(
    B,
    '<use> fan-out (10^9 copies) → refused as too large, < 5 s',
    refused(res, 'InputTooLarge') && res.ms < 5000,
    `${res.err?.name ?? 'accepted'} in ${Math.round(res.ms)} ms: ${res.err?.message.slice(0, 80) ?? ''}`,
    'InputTooLarge',
  );

  // svgz bomb: 96 MB of spaces inside an <svg> → ~100 kB gzip
  const bomb = gzipSync(
    Buffer.concat([
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'),
      Buffer.alloc(96 * 1048576, 0x20),
      Buffer.from('</svg>'),
    ]),
    { level: 9 },
  );
  res = await run('bomb.svgz', ab(bomb));
  check(
    B,
    `svgz bomb (${Math.round(bomb.length / 1024)} kB → 96 MB) → refused as too large, < 5 s`,
    refused(res, 'InputTooLarge') && res.ms < 5000,
    `${res.err?.name ?? 'accepted'} in ${Math.round(res.ms)} ms`,
    'InputTooLarge',
  );

  // one budget across files: two files of 600 points each against a budget of 1000
  const lines = (n) =>
    svg(
      `<path d="M0,0 ${Array.from({ length: n }, (_, i) => `L${i % 100},${(i * 7) % 100}`).join(' ')}" stroke="#000"/>`,
    );
  const shared = { ...OPTS, budget: new m.WorkBudget(1000) };
  const r1 = await run('a.svg', lines(600), shared);
  const r2 = await run('b.svg', lines(600), shared);
  check(
    B,
    'the run budget is shared by the files of a run (2nd file refused)',
    !!r1.doc && refused(r2, 'InputTooLarge'),
    `${r1.err?.name ?? 'ok'} / ${r2.err?.name ?? 'ok'}`,
    'ok / InputTooLarge',
  );

  // PDF operators: a constructPath with 100 000 curves of 4096 points each is paid as it is made
  const OPS = {
    constructPath: 91,
    moveTo: 13,
    lineTo: 14,
    curveTo: 15,
    curveTo2: 16,
    curveTo3: 17,
    closePath: 18,
    rectangle: 19,
    stroke: 20,
  };
  const N = 100000;
  const pathOps = new Uint8Array(N + 1).fill(OPS.curveTo);
  pathOps[0] = OPS.moveTo;
  const flat = new Float32Array(2 + N * 6);
  for (let k = 0; k < N; k++) flat.set([0, 1e7, 1e7, -1e7, 1, 0], 2 + k * 6);
  const t0 = performance.now();
  let walkErr = null;
  try {
    m.walkOperatorList(
      { fnArray: [OPS.constructPath, OPS.stroke], argsArray: [[pathOps, flat, null], []] },
      {
        ops: OPS,
        file: '0',
        page: 0,
        base: [1, 0, 0, 1, 0, 0],
        sagittaMm: 0.05,
        keepFills: true,
        ocName: () => null,
        budget: new m.WorkBudget(2_000_000),
      },
    );
  } catch (e) {
    walkErr = e;
  }
  const wms = performance.now() - t0;
  check(
    B,
    'PDF walk: 100 000 wild curves (4·10^8 points) → refused by the budget, < 5 s',
    walkErr?.name === 'InputTooLarge' && wms < 5000,
    `${walkErr?.name ?? 'accepted'} in ${Math.round(wms)} ms`,
    'InputTooLarge',
  );
}

// ── report ──────────────────────────────────────────────────────────────────────────────────
const pass = results.filter((x) => x.ok).length;
console.log(`\nF12 vector adapters — ${pass}/${results.length} checks pass\n`);
let last = '';
for (const x of results) {
  if (x.fixture !== last) {
    console.log(`\n${x.fixture}`);
    last = x.fixture;
  }
  console.log(
    `  ${x.ok ? 'PASS' : 'FAIL'}  ${x.what}  — got ${JSON.stringify(x.got)}${x.ok ? '' : `, expected ${JSON.stringify(x.expected)}`}`,
  );
}
console.log('\nper fixture:', JSON.stringify(summary, null, 1));
mkdirSync(REPORTS, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
writeFileSync(
  resolve(REPORTS, `F12-${stamp}.json`),
  JSON.stringify({ pass, total: results.length, results, summary }, null, 1),
);
process.exit(failures ? 1 : 0);
