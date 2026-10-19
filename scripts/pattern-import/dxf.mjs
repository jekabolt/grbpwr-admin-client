#!/usr/bin/env node
// F8 — DXF input adapter probe (08-CONTRACT §7). Acceptance of 07-TASKS F8 / reports/F8.md:
//   * every corpus/dxf-clo/* file imports; per file: blocks, sizes, pieces, notches after dedupe,
//     grain per block (CLO arrow), labels decoded, layer-1-ungraded detection, mode, allowance;
//   * zero silently dropped entities: the adapter's tally balances AND matches an independent
//     count of `0 <TYPE>` records taken here from the raw text;
//   * idempotence: DXF → IR → (re-emitted R12) → IR is equal (paths, texts, notches, grain);
//   * K2 golden files: R2000 and R12 goldens decode to the same pieces/notches/grain/labels and
//     match the writer's construction; the manifest is recognised;
//   * mode-A notch transfer measured against CLO's own graded notches (ALLSIZES_DXF);
//   * negative controls: corrupt → typed `corrupt`; binary sentinel → typed `binary-dxf`; DWG,
//     empty, not-DXF → typed.
//   node scripts/pattern-import/dxf.mjs        (PATIMPORT_CORPUS overrides the corpus root)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const PLAN = resolve(CORPUS, '..');
const outfile = resolve(tmpdir(), `patimport-dxf-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'dxf-entry.ts')],
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

let bad = 0;
const checks = [];
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  checks.push({ ok, what, d });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const enc = (s) => new TextEncoder().encode(s).buffer;
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
const OPTS = { sagittaMm: 0.05, keepFills: true };
const load = async (name, bytes) => {
  const read = await m.readDxf({ id: '0', name, bytes }, OPTS);
  return { read, seg: m.segmentDxf(read) };
};

/** Independent record count: `0 <TYPE>` pairs inside BLOCKS / ENTITIES, straight from the text. */
function rawRecordCounts(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const counts = {};
  let section = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const v = lines[i + 1].trim();
    if (code === '999') continue;
    if (code !== '0') {
      if (code === '2' && section === '?') section = v.toUpperCase();
      continue;
    }
    if (v === 'SECTION') {
      section = '?';
      continue;
    }
    if (v === 'ENDSEC') {
      section = null;
      continue;
    }
    if (section === 'BLOCKS' || section === 'ENTITIES')
      counts[v.toUpperCase()] = (counts[v.toUpperCase()] ?? 0) + 1;
  }
  return counts;
}

function summary({ read, seg }) {
  const page = read.doc.pages[0];
  const notchesRaw = seg.pieces.reduce((a, p) => a + p.notchStats.raw, 0);
  const notches = seg.pieces.reduce((a, p) => a + p.notches.length, 0);
  const derived = seg.pieces.reduce((a, p) => a + p.notchStats.derived, 0);
  const grainForms = {};
  for (const p of seg.pieces)
    grainForms[p.grain ? p.grain.form : 'none'] =
      (grainForms[p.grain ? p.grain.form : 'none'] ?? 0) + 1;
  const lbl = (k) => seg.pieces.filter((p) => p.labels[k] != null && p.labels[k] !== '').length;
  return {
    dialect: read.meta.dialect,
    version: read.meta.version,
    producer: read.meta.producer,
    units: `${read.meta.units.source}: ${read.meta.units.evidence}`,
    encoding: read.meta.encoding,
    manifest: read.meta.manifest,
    blocks: read.meta.blockCount,
    inserts: read.meta.insertCount,
    paths: page.paths.length,
    texts: page.texts.length,
    layers: page.layers.join(' '),
    presegmented: seg.presegmented,
    sizes: seg.sizes.map((s) =>
      s.raw.length && s.raw.some((r) => r !== s.token) ? `${s.token}(${s.raw.join('/')})` : s.token,
    ),
    sampleSize: seg.sampleSize ? `${seg.sampleSize.token} (${seg.sampleSize.source})` : null,
    pieces: seg.pieces.length,
    identities: seg.identities.length,
    mode: seg.mode,
    layer1Ungraded: seg.layer1Ungraded,
    ungradedIdentities: seg.identities
      .filter((i) => i.layer1Ungraded === true)
      .map((i) => i.identity),
    allowance: seg.allowance
      ? `${seg.allowance.meaning} ${seg.allowance.allowanceMm} mm (${seg.allowance.origin})`
      : null,
    notchesRaw,
    notches,
    notchesDerived: derived,
    exactDuplicates: seg.pieces.reduce((a, p) => a + p.notchStats.exactDuplicates, 0),
    twins: seg.pieces.reduce((a, p) => a + p.notchStats.twins, 0),
    grain: grainForms,
    drills: seg.pieces.reduce((a, p) => a + p.drills.length, 0),
    labels: {
      pieceName: lbl('pieceName'),
      size: lbl('size'),
      quantity: lbl('quantity'),
      material: lbl('material'),
      annotations: seg.pieces.reduce((a, p) => a + p.labels.annotation.length, 0),
    },
    modelLabels: read.meta.modelLabels.map((l) => `${l.rawKey}: ${l.value}`),
    pairs: seg.pairs.map(
      (p) =>
        `${p.left}/${p.right}${p.geometryConfirmed ? ' ✓geom' : ` ✗geom r=${p.areaRatio.toFixed(3)}`}`,
    ),
    perIdentity: seg.identities.map((id) => ({
      identity: id.identity,
      mode: id.mode,
      sizes: id.sizes.join(','),
      notches: id.pieces.map((i) => seg.pieces[i].notches.length).join(','),
      grain: id.pieces.map((i) => (seg.pieces[i].grain ? seg.pieces[i].grain.form : '-')).join(','),
    })),
    warnings: [...read.doc.warnings, ...seg.warnings],
  };
}

const report = {
  date: new Date().toISOString(),
  corpus: CORPUS,
  files: {},
  golden: {},
  transfer: {},
  negative: {},
  checks,
};

// ── 1. corpus ────────────────────────────────────────────────────────────────────────────────
console.log('\n# corpus/dxf-clo');
const dir = resolve(CORPUS, 'dxf-clo');
const files = readdirSync(dir)
  .filter((f) => /\.dxf$/i.test(f))
  .sort();
const loaded = {};
for (const f of files) {
  console.log(`\n## ${f}`);
  const buf = readFileSync(resolve(dir, f));
  let res;
  const t0 = performance.now();
  try {
    res = await load(f, ab(buf));
  } catch (e) {
    ck(false, `${f} imports`, String(e?.message ?? e));
    continue;
  }
  const ms = performance.now() - t0;
  loaded[f] = res;
  const s = summary(res);
  s.ms = Math.round(ms);
  ck(true, `${f} imports`, `${s.dialect} · ${s.ms} ms · ${s.paths} paths · ${s.texts} texts`);
  // zero silent drops
  const tally = res.read.meta.tally;
  const raw = rawRecordCounts(buf.toString('latin1'));
  const mism = [];
  for (const [t, n] of Object.entries(raw)) {
    const row = tally.rows.find((r) => r.type === t);
    if (!row || row.in !== n) mism.push(`${t} raw ${n} vs tally ${row?.in ?? 0}`);
  }
  for (const r of tally.rows)
    if (raw[r.type] == null) mism.push(`${r.type} tally ${r.in} vs raw 0`);
  ck(
    tally.balanced && mism.length === 0,
    `${f} tally: every record accounted (rendered+structural+dropped=in; in = raw count)`,
    mism.join('; ') || tally.rows.map((r) => `${r.type} ${r.in}`).join(' '),
  );
  const dropped = tally.rows
    .filter((r) => r.dropped)
    .map((r) => `${r.type}×${r.dropped} ${JSON.stringify(r.reasons)}`);
  const unacc = tally.rows.some((r) => r.reasons.UNACCOUNTED);
  ck(!unacc, `${f} no UNACCOUNTED drops`, dropped.join('; ') || 'nothing dropped');
  const emittedP = tally.rows.reduce((a, r) => a + r.emittedPaths, 0);
  const emittedT = tally.rows.reduce((a, r) => a + r.emittedTexts, 0);
  ck(
    emittedP === s.paths && emittedT === s.texts,
    `${f} emitted = IR (${emittedP} paths, ${emittedT} texts)`,
  );
  s.tally = tally.rows.map((r) => ({
    type: r.type,
    in: r.in,
    rendered: r.rendered,
    structural: r.structural,
    dropped: r.dropped,
    reasons: r.reasons,
    paths: r.emittedPaths,
    texts: r.emittedTexts,
  }));
  s.innerComments = tally.innerComments;
  // provenance on every path/text
  const page = res.read.doc.pages[0];
  const prov =
    page.paths.every((p) => p.src && p.src.op >= 0 && p.src.file === '0') &&
    page.texts.every((t) => t.src && t.src.op >= 0);
  const blockProv = res.read.meta.groups
    .filter((g) => g.kind === 'insert')
    .every((g) => g.paths.every((id) => page.paths.find((p) => p.id === id)?.src.block != null));
  ck(prov && blockProv, `${f} provenance: op on every path/text, block on every block path`);
  // the fast path builds contract-typed stage outputs
  if (res.seg.presegmented) {
    const fp = m.dxfFastPath(res.read, res.seg);
    const nCand = fp.families.reduce((a, fam) => a + fam.candidates.length, 0);
    ck(
      nCand === res.seg.pieces.length &&
        fp.chains.chains.length === page.paths.length &&
        fp.run.sizes.length === res.seg.sizes.length,
      `${f} fast path: ${fp.families.length} families / ${nCand} candidates / ${fp.chains.classes.length} classes`,
    );
    s.fastPath = {
      families: fp.families.length,
      candidates: nCand,
      classes: fp.chains.classes.length,
      nonMonotone: fp.families.filter((x) => !x.monotone).length,
      encoding: fp.run.encoding,
      scale: fp.scale.map((c) => `${c.method}×${c.factor} (${c.confidence})`),
    };
  }
  // idempotence: IR → R12 → IR
  const again = await load(f, new TextEncoder().encode(m.reemitR12(res.read)).buffer);
  const pa = page.paths;
  const pb = again.read.doc.pages[0].paths;
  let maxD = 0;
  let geomOk = pa.length === pb.length;
  if (geomOk) {
    for (let i = 0; i < pa.length; i++) {
      const la = page.styles[pa[i].style].layer;
      const lb = again.read.doc.pages[0].styles[pb[i].style].layer;
      if (la !== lb || pa[i].closed !== pb[i].closed || pa[i].pts.length !== pb[i].pts.length) {
        geomOk = false;
        break;
      }
      for (let k = 0; k < pa[i].pts.length; k++)
        maxD = Math.max(
          maxD,
          Math.hypot(pa[i].pts[k].x - pb[i].pts[k].x, pa[i].pts[k].y - pb[i].pts[k].y),
        );
    }
  }
  const ta = page.texts.map((t) => t.text).join('\u0001');
  const tb = again.read.doc.pages[0].texts.map((t) => t.text).join('\u0001');
  const sa = summary(res);
  const sb = summary(again);
  const segSame =
    JSON.stringify([
      sa.sizes,
      sa.mode,
      sa.notches,
      sa.grain,
      sa.perIdentity,
      sa.identities,
      sa.labels,
    ]) ===
    JSON.stringify([
      sb.sizes,
      sb.mode,
      sb.notches,
      sb.grain,
      sb.perIdentity,
      sb.identities,
      sb.labels,
    ]);
  ck(
    geomOk && maxD < 1e-6 && ta === tb && segSame,
    `${f} idempotent DXF→IR→DXF→IR`,
    `paths ${pa.length}/${pb.length} maxΔ ${maxD.toExponential(1)} mm · texts ${ta === tb ? 'equal' : 'DIFFER'} · segmentation ${segSame ? 'equal' : 'DIFFERS'}`,
  );
  report.files[f] = s;
  console.log(
    `   ${s.blocks} blocks · ${s.inserts} inserts · sizes ${s.sizes.join(' ')} · sample ${s.sampleSize} · ${s.identities} identities · mode ${s.mode} · L1 ungraded ${s.layer1Ungraded} · allowance ${s.allowance}`,
  );
  console.log(
    `   notches ${s.notchesRaw} raw → ${s.notches} (dups ${s.exactDuplicates}, twins ${s.twins}, derived ${s.notchesDerived}) · grain ${JSON.stringify(s.grain)} · drills ${s.drills} · labels ${JSON.stringify(s.labels)} · pairs ${s.pairs.join(', ')}`,
  );
}

// file-specific expectations (10-CLO-DXF-FORMAT measurements)
console.log('\n# expectations');
const F = (n) => report.files[n];
const S = (n) => loaded[n]?.seg;
const consistentNotches = (n) =>
  S(n).identities.every(
    (id) => new Set(id.pieces.map((i) => S(n).pieces[i].notches.length)).size === 1,
  );
const allArrows = (n) =>
  S(n).pieces.every((p) => p.grain?.form === 'clo-arrow' && p.grain.directed);
const idOf = (n, block) => S(n).pieces.find((p) => p.block === block);
if (F('ALLSIZES_DXF.dxf')) {
  const n = 'ALLSIZES_DXF.dxf';
  ck(
    F(n).mode === 'A' && F(n).layer1Ungraded && F(n).ungradedIdentities.length === 9,
    `${n}: mode A, layer 1 ungraded on all 9 identities`,
  );
  ck(
    F(n).sampleSize?.startsWith('M') && /seam 10 mm/.test(F(n).allowance ?? ''),
    `${n}: sample M found by geometry, allowance 10 mm`,
    `${F(n).sampleSize} · ${F(n).allowance}`,
  );
  ck(
    F(n).pieces === 45 && F(n).identities === 9 && F(n).sizes.join() === 'XS,S,M,L,XL',
    `${n}: 45 blocks = 9 identities × 5 sizes`,
  );
  ck(allArrows(n), `${n}: CLO 3-vertex grain arrow recognised in 45/45 blocks`);
  ck(consistentNotches(n), `${n}: notch count identical across sizes for every identity`);
  ck(
    idOf(n, 'FP_L_L')?.identity === 'FP_L' && idOf(n, 'FP_L_L')?.size === 'L',
    `${n}: FP_L_L → FP_L / L`,
  );
}
if (F('Allsizes_with_notches.dxf')) {
  const n = 'Allsizes_with_notches.dxf';
  ck(
    F(n).mode === 'B' && !F(n).layer1Ungraded,
    `${n}: mode B (L1 = L14 graded, seam on L8), layer 1 graded`,
  );
  ck(allArrows(n) && consistentNotches(n), `${n}: grain arrows 45/45, notch counts consistent`);
  ck(F(n).exactDuplicates > 0, `${n}: exact duplicate notches folded`, `${F(n).exactDuplicates}`);
}
if (F('allsizes.dxf')) {
  const n = 'allsizes.dxf';
  ck(
    F(n).mode === 'single' && F(n).sizes.join() === 'M' && F(n).identities === 9,
    `${n}: single size M, 9 identities (single-size rule)`,
  );
  ck(
    ['FP_L', 'FP_R', 'SL_L', 'SL_R'].every((x) => S(n).identities.some((i) => i.identity === x)),
    `${n}: FP_L/FP_R/SL_L/SL_R kept as hands, not sizes`,
  );
  const a = S('ALLSIZES_DXF.dxf');
  if (a) {
    const same = S(n).identities.every((id) => {
      const other = a.identities.find((x) => x.identity === id.identity);
      const pm = other && a.pieces[other.pieces[2]];
      return pm && pm.notches.length === S(n).pieces[id.pieces[0]].notches.length;
    });
    ck(same, `${n}: notches per piece = ALLSIZES_DXF size M (same CLO export, different file)`);
  }
}
if (F('POCKETS.dxf')) {
  const n = 'POCKETS.dxf';
  ck(
    S(n).pieces.every((p) => p.uni && p.size === 'M') && F(n).identities === 4,
    `${n}: 4 UNI pieces, base size M kept`,
  );
}
if (F('summer men.dxf')) {
  const n = 'summer men.dxf';
  ck(
    F(n).dialect === 'clo-aama-r12' && F(n).units.startsWith('units-text'),
    `${n}: CLO-AAMA R12, mm from UNITS: METRIC`,
  );
  ck(
    F(n).sizes.includes('S(<S>)') && F(n).sampleSize === 'M (text)',
    `${n}: <S> read as S; SAMPLE SIZE M`,
  );
  ck(
    F(n).labels.pieceName === 45 && F(n).labels.size === 45 && F(n).labels.quantity === 45,
    `${n}: PIECE NAME / SIZE / QUANTITY decoded on 45/45 blocks`,
  );
  ck(
    F(n).notchesRaw === 50 && F(n).notchesDerived > 0 && consistentNotches(n),
    `${n}: 50 POINT notches (sample only) → deduped and transferred to every size`,
    `${F(n).notches} logical incl. ${F(n).notchesDerived} derived`,
  );
  ck(
    S(n).pieces.every((p) => p.grain?.form === 'axis'),
    `${n}: L7 2-point grain on 45/45`,
  );
  const pts = Object.values(loaded[n].read.meta.points).filter((p) => p.layer === '4');
  ck(
    pts.length === 50 && pts.every((p) => p.angleDeg != null && p.z > 0),
    `${n}: POINT code 50 angle and 30 depth kept on all 50 notches`,
  );
}
if (F('summer men_ganjubas_gerber.dxf')) {
  const n = 'summer men_ganjubas_gerber.dxf';
  ck(
    F(n).dialect === 'clo-aama-gerber' &&
      F(n).sizes.join() === 'XS,S,M,L,XL' &&
      F(n).notchesRaw === 58,
    `${n}: Gerber target (plain sizes), 58 raw notches`,
  );
}
if (F('blazer.dxf')) {
  const n = 'blazer.dxf';
  ck(
    F(n).pieces === 46 && F(n).sizes.join() === 'M' && F(n).labels.pieceName === 46,
    `${n}: 46 single-size M blocks, labels on all`,
  );
  ck(
    S(n).pieces.some((p) => p.labels.annotation.some((a) => /кармана/.test(a))),
    `${n}: UTF-8 Cyrillic annotation decoded`,
  );
  const qv = loaded[n].read.doc.pages[0].layers;
  ck(
    ['84', '85', '87', '2', '3'].every((l) => qv.includes(l)),
    `${n}: QV layers 84/85/87 and grade points 2/3 kept in IR`,
  );
}
for (const n of files.filter((f) => f.startsWith('RC28'))) {
  if (F(n))
    ck(
      !F(n).presegmented && F(n).paths > 0,
      `${n}: loose geometry (our marker export) imports; not presegmented`,
    );
}
if (F('allsizes-merged.dxf'))
  ck(
    /ezdxf/.test(F('allsizes-merged.dxf').producer ?? ''),
    'allsizes-merged.dxf: producer ezdxf recognised',
  );

// ── 2. mode-A notch transfer vs CLO's own graded notches ─────────────────────────────────────
console.log('\n# notch transfer (mode A) measured on ALLSIZES_DXF');
if (S('ALLSIZES_DXF.dxf')) {
  const seg = S('ALLSIZES_DXF.dxf');
  let worst = 0;
  let n = 0;
  const methods = {};
  const errs = [];
  const byMethod = {};
  for (const id of seg.identities) {
    const ps = id.pieces.map((i) => seg.pieces[i]);
    const sample = ps.find((p) => p.size === seg.sampleSize.token);
    for (const p of ps) {
      if (p === sample || !p.notches.length) continue;
      const clone = { ...p, notches: [], notchStats: { ...p.notchStats, derived: 0 } };
      m.__internals.transferNotches(sample, clone);
      for (const d of clone.notches) {
        methods[d.from.method] = (methods[d.from.method] ?? 0) + 1;
        const best = Math.min(
          ...p.notches.map((q) => Math.hypot(q.at.x - d.at.x, q.at.y - d.at.y)),
        );
        errs.push(best);
        (byMethod[d.from.method] ??= []).push(best);
        if (process.env.DXF_DEBUG)
          console.log(
            `    ${p.block} ${d.from.method} err ${best.toFixed(2)} seam pts ${sample.seam.pts.length}→${p.seam.pts.length}`,
          );
        worst = Math.max(worst, best);
        n++;
      }
    }
  }
  errs.sort((a, b) => a - b);
  const p95 = errs[Math.floor(errs.length * 0.95)] ?? 0;
  const stat = (xs) => {
    const q = [...xs].sort((a, b) => a - b);
    return { n: q.length, p95: q[Math.floor(q.length * 0.95)] ?? 0, max: q[q.length - 1] ?? 0 };
  };
  const per = Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, stat(v)]));
  report.transfer = { notches: n, methods, p95Mm: p95, maxMm: worst, perMethod: per };
  // Informational, not a gate: derived notches are approximate by construction (see segment.ts).
  console.log(
    `  info transfer sample→other sizes along the graded seam: ${n} notches — ${Object.entries(per)
      .map(([k, v]) => `${k} n=${v.n} p95 ${v.p95.toFixed(2)} max ${v.max.toFixed(2)}`)
      .join(' · ')}`,
  );
  ck(
    n > 0 && p95 <= 6,
    `transfer: ${n} derived notches; regression guard p95 ≤ 6 mm (approximate by construction — not exact)`,
    `${Object.entries(per)
      .map(([k, v]) => `${k} n=${v.n} p95 ${v.p95.toFixed(2)} max ${v.max.toFixed(2)}`)
      .join(' · ')} · all p95 ${p95.toFixed(2)} mm · max ${worst.toFixed(2)} mm`,
  );
}

// ── 3. K2 golden files ───────────────────────────────────────────────────────────────────────
console.log('\n# K2 goldens');
{
  const k2 = resolve(PLAN, 'k2-work');
  const r2000buf = readFileSync(resolve(k2, 'golden-min.dxf'));
  const r12buf = readFileSync(resolve(k2, 'golden-min-r12.dxf'));
  const A = await load('golden-min.dxf', ab(r2000buf));
  const B = await load('golden-min-r12.dxf', ab(r12buf));
  const text = r2000buf.toString('latin1');
  ck(
    m.isOurDxf(text) && m.isOurDxf(r12buf.toString('latin1')) && A.read.meta.dialect === 'grbpwr',
    'goldens: manifest recognised (isOurDxf, dialect grbpwr)',
  );
  ck(
    !m.isOurDxf(readFileSync(resolve(dir, 'allsizes.dxf')).toString('latin1')),
    'a CLO file is not ours (isOurDxf false)',
  );
  const manifestJson = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('GRBPWR-MANIFEST'))
    .map((l) => l.replace(/^GRBPWR-MANIFEST \S+ \d+\/\d+ /, ''))
    .join('');
  const manifest = JSON.parse(manifestJson);
  const blocksA = A.seg.pieces.map((p) => p.block);
  ck(
    JSON.stringify(blocksA) === JSON.stringify(manifest.blocks) &&
      JSON.stringify(B.seg.pieces.map((p) => p.block)) === JSON.stringify(manifest.blocks),
    'goldens: blocks = manifest.blocks (both dialects)',
    blocksA.join(' '),
  );
  for (const [nm, X] of [
    ['R2000', A],
    ['R12', B],
  ]) {
    const ids = X.seg.identities.map((i) => `${i.identity}:${i.sizes.join('/')}`).join(' ');
    ck(ids === 'BP:M/L FP_R:M/L FP_L:M/L', `golden ${nm}: identities × sizes`, ids);
    ck(
      X.seg.pieces.every(
        (p) =>
          p.labels.pieceName === p.identity &&
          p.labels.size === p.size &&
          p.labels.quantity === 1 &&
          p.labels.material === 'shell',
      ),
      `golden ${nm}: PIECE NAME / SIZE / QUANTITY / MATERIAL decoded on 6/6`,
    );
    ck(
      X.seg.mode === 'C' && X.seg.allowance?.allowanceMm === 10 && !X.seg.layer1Ungraded,
      `golden ${nm}: mode C, allowance 10 mm`,
      `${X.seg.mode} ${X.seg.allowance?.allowanceMm}`,
    );
    ck(
      X.seg.pieces.every(
        (p) =>
          p.notches.length === 2 &&
          p.notches.every((n) => n.on === 'cut' && Math.abs(n.depthMm - 5) < 1e-6),
      ),
      `golden ${nm}: 2 notches per block on the cut line, depth 5`,
    );
    const bp = X.seg.pieces.filter((p) => p.identity === 'BP');
    ck(
      bp.every(
        (p) =>
          p.drills.length === 1 &&
          Object.values(p.roles).filter((r) => r === 'internal').length === 1 &&
          p.labels.annotation.includes('golden sample'),
      ),
      `golden ${nm}: BP drill 1, dart 1, annotation`,
    );
    ck(
      X.seg.pairs.length === 1 && X.seg.pairs[0].geometryConfirmed,
      `golden ${nm}: FP_L/FP_R pair confirmed by geometry`,
    );
  }
  // R2000 grain is the CLO arrow, directed; R12 is the bare axis; same segment
  const gA = A.seg.pieces.map((p) => p.grain);
  const gB = B.seg.pieces.map((p) => p.grain);
  ck(
    gA.every((g) => g.form === 'clo-arrow' && g.directed) && gB.every((g) => g.form === 'axis'),
    'goldens: R2000 grain = 3-vertex arrow (directed), R12 = 2-point axis',
  );
  ck(
    gA.every(
      (g, i) =>
        Math.hypot(g.a.x - gB[i].a.x, g.a.y - gB[i].a.y) < 1e-6 &&
        Math.hypot(g.b.x - gB[i].b.x, g.b.y - gB[i].b.y) < 1e-6 &&
        Math.abs(Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) - 180) < 1e-6,
    ),
    'goldens: grain P0→P1 identical across dialects, 180 mm',
  );
  // writer construction: BP_M grain tail at (0,1); first BP notch at the midpoint of cut edge 1
  const bpM = A.seg.pieces.find((p) => p.block === 'BP_M');
  ck(
    Math.hypot(bpM.grain.a.x, bpM.grain.a.y - 1) < 1e-6 && Math.abs(bpM.grain.angleDeg - 90) < 1e-9,
    'golden R2000: BP_M grain tail (0,1), 90°',
  );
  // notches: R2000 LINE and R12 POINT(angle, depth) decode to the same logical notch
  let nd = 0;
  let dd = 0;
  A.seg.pieces.forEach((p, i) => {
    const q = B.seg.pieces[i];
    p.notches.forEach((n) => {
      const best = q.notches.reduce((b, x) =>
        Math.hypot(x.at.x - n.at.x, x.at.y - n.at.y) < Math.hypot(b.at.x - n.at.x, b.at.y - n.at.y)
          ? x
          : b,
      );
      nd = Math.max(nd, Math.hypot(best.at.x - n.at.x, best.at.y - n.at.y));
      dd = Math.max(dd, Math.hypot(best.dir.x - n.dir.x, best.dir.y - n.dir.y));
    });
  });
  ck(
    nd < 1e-5 && dd < 1e-5,
    'goldens: LINE notches (R2000) = POINT notches (R12): position and inward direction',
    `Δpos ${nd.toExponential(1)} mm · Δdir ${dd.toExponential(1)}`,
  );
  // raw POINT attributes (angle in 50, depth in 30) survive — the thing dxf-parser loses
  const pB = Object.values(B.read.meta.points).filter((p) => p.layer === '4');
  ck(
    pB.length === 12 && pB.every((p) => p.angleDeg != null && Math.abs(p.z - 5) < 1e-9),
    'golden R12: 12 POINT notches with code 50 angle and code 30 depth = 5',
  );
  // contours identical across dialects (same vertex lists)
  let cd = 0;
  A.seg.pieces.forEach((p, i) => {
    const q = B.seg.pieces[i];
    for (const [ca, cb] of [
      [p.cut, q.cut],
      [p.seam, q.seam],
    ]) {
      if (ca.pts.length !== cb.pts.length) cd = Infinity;
      else
        ca.pts.forEach(
          (v, k) => (cd = Math.max(cd, Math.hypot(v.x - cb.pts[k].x, v.y - cb.pts[k].y))),
        );
    }
  });
  ck(
    cd < 1e-6,
    'goldens: cut (L1) and seam (L14) contours identical across dialects',
    `max Δ ${cd.toExponential(1)} mm`,
  );
  report.golden = { r2000: summary(A), r12: summary(B), manifestBlocks: manifest.blocks };
}

// ── 3b. foreign DXF features the CLO corpus never uses (synthetic, 10-CLO-DXF-FORMAT §2.5) ──
console.log(
  '\n# foreign DXF (synthetic: ARC/SPLINE weights/ELLIPSE/MTEXT/ATTRIB/HATCH/nested+rotated+mirrored INSERT/LTYPE/units/cp1251)',
);
{
  const T = [];
  const E = (c, v) => T.push(String(c).padStart(3), String(v));
  const ent = (type, layer, ...pairs) => {
    E(0, type);
    E(8, layer);
    for (let i = 0; i < pairs.length; i += 2) E(pairs[i], pairs[i + 1]);
  };
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1015');
  E(9, '$INSUNITS');
  E(70, 4);
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'TABLES');
  E(0, 'TABLE');
  E(2, 'LTYPE');
  E(70, 1);
  E(0, 'LTYPE');
  E(2, 'DASHED');
  E(70, 0);
  E(3, '__ __');
  E(72, 65);
  E(73, 2);
  E(40, 9);
  E(49, 6);
  E(49, -3);
  E(0, 'ENDTAB');
  E(0, 'TABLE');
  E(2, 'LAYER');
  E(70, 2);
  E(0, 'LAYER');
  E(2, '8');
  E(70, 0);
  E(62, 5);
  E(6, 'DASHED');
  E(0, 'LAYER');
  E(2, '1');
  E(70, 0);
  E(62, 1);
  E(6, 'CONTINUOUS');
  E(0, 'ENDTAB');
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  // INNER: a drill hole as a CIRCLE on AAMA layer 13
  E(0, 'BLOCK');
  E(8, '0');
  E(2, 'INNER');
  E(70, 0);
  E(10, 0);
  E(20, 0);
  ent('CIRCLE', '13', 10, 0, 20, 0, 40, 3);
  E(0, 'ENDBLK');
  // FRONT_M: cut line from 4 LINEs + an ARC (chained), grain, notch, nested drill, fold, rational
  // spline + mirrored ARC + ellipse on 8, HATCH, TEXT + MTEXT labels (Valentina-style casing)
  E(0, 'BLOCK');
  E(8, '0');
  E(2, 'FRONT_M');
  E(70, 0);
  E(10, 0);
  E(20, 0);
  ent('LINE', '1', 10, 0, 20, 0, 11, 200, 21, 0);
  ent('LINE', '1', 10, 200, 20, 0, 11, 200, 21, 250);
  ent('ARC', '1', 10, 150, 20, 250, 40, 50, 50, 0, 51, 90);
  ent('LINE', '1', 10, 150, 20, 300, 11, 0, 21, 300);
  ent('LINE', '1', 10, 0, 20, 300, 11, 0, 21, 0);
  ent('LINE', '7', 10, 100, 20, 50, 11, 100, 21, 250);
  ent('LINE', '4', 10, 0, 20, 150, 11, 5, 21, 150);
  ent('INSERT', '0', 2, 'INNER', 10, 100, 20, 150);
  ent('LINE', '6', 10, 200, 20, 0, 11, 200, 21, 250);
  ent(
    'SPLINE',
    '8',
    70,
    4 + 8,
    71,
    2,
    72,
    6,
    73,
    3,
    40,
    0,
    40,
    0,
    40,
    0,
    40,
    1,
    40,
    1,
    40,
    1,
    41,
    1,
    41,
    Math.SQRT1_2,
    41,
    1,
    10,
    150,
    20,
    100,
    10,
    150,
    20,
    200,
    10,
    50,
    20,
    200,
  );
  ent('ARC', '8', 10, -50, 20, 60, 40, 20, 50, 0, 51, 90, 210, 0, 220, 0, 230, -1);
  ent('ELLIPSE', '8', 10, 60, 20, 60, 11, 20, 21, 0, 40, 0.5, 41, 0, 42, 2 * Math.PI);
  ent(
    'HATCH',
    '8',
    2,
    'SOLID',
    70,
    1,
    71,
    0,
    91,
    1,
    92,
    2,
    72,
    0,
    73,
    1,
    93,
    4,
    10,
    20,
    20,
    20,
    10,
    40,
    20,
    20,
    10,
    40,
    20,
    40,
    10,
    20,
    20,
    40,
    97,
    0,
    75,
    0,
    76,
    1,
    98,
    0,
  );
  ent('TEXT', '1', 10, 20, 20, 280, 40, 3, 1, 'Piece Name: Front');
  ent(
    'MTEXT',
    '1',
    10,
    20,
    20,
    270,
    40,
    3,
    71,
    1,
    3,
    '{\\fArial|b1;Quantity: 2}\\PMaterial: Lin',
    1,
    'ing\\PCategory: Body',
  );
  E(0, 'ENDBLK');
  // ROT_M / MIR_M: one LINE each, inserted rotated+scaled and OCS-mirrored
  E(0, 'BLOCK');
  E(8, '0');
  E(2, 'ROT_M');
  E(70, 0);
  E(10, 0);
  E(20, 0);
  ent('LINE', '8', 10, 0, 20, 0, 11, 10, 21, 0);
  E(0, 'ENDBLK');
  E(0, 'BLOCK');
  E(8, '0');
  E(2, 'MIR_M');
  E(70, 0);
  E(10, 0);
  E(20, 0);
  ent('LINE', '8', 10, 0, 20, 0, 11, 10, 21, 0);
  E(0, 'ENDBLK');
  E(0, 'BLOCK');
  E(8, '0');
  E(2, 'UNUSED');
  E(70, 0);
  E(10, 0);
  E(20, 0);
  ent('LINE', '1', 10, 0, 20, 0, 11, 1, 21, 1);
  E(0, 'ENDBLK');
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  ent('INSERT', '1', 66, 1, 2, 'FRONT_M', 10, 1000, 20, 0);
  ent('ATTRIB', '1', 10, 1020, 20, 260, 40, 3, 1, 'M', 2, 'SIZE', 70, 0);
  E(0, 'SEQEND');
  E(8, '1');
  ent('INSERT', '0', 2, 'ROT_M', 10, 0, 20, 1000, 41, 2, 42, 2, 50, 90);
  ent('INSERT', '0', 2, 'MIR_M', 10, 100, 20, 2000, 210, 0, 220, 0, 230, -1);
  ent('VIEWPORT', '0', 10, 0, 20, 0);
  ent('3DSOLID', '0', 1, 'acis');
  ent('TEXT', '0', 10, 0, 20, -50, 40, 2.5, 1, 'UNITS: METRIC');
  E(0, 'ENDSEC');
  E(0, 'EOF');
  const fx = T.join('\r\n') + '\r\n';
  const X = await load('foreign.dxf', enc(fx));
  const pg = X.read.doc.pages[0];
  const t = X.read.meta.tally;
  const reasons = Object.fromEntries(
    t.rows.filter((r) => r.dropped).map((r) => [r.type, r.reasons]),
  );
  ck(
    t.balanced && !t.rows.some((r) => r.reasons.UNACCOUNTED),
    'foreign: tally balanced, every drop explicit',
    JSON.stringify(reasons),
  );
  ck(
    reasons.VIEWPORT &&
      reasons['3DSOLID'] &&
      reasons.LINE?.['inside a block that is never inserted'] === 1,
    'foreign: VIEWPORT / 3DSOLID / unreferenced block reported, not silent',
  );
  const front = X.seg.pieces.find((p) => p.block === 'FRONT_M');
  ck(
    front?.identity === 'Front' &&
      front.size === 'M' &&
      front.sizeSource === 'label' &&
      front.labels.quantity === 2 &&
      front.labels.material === 'Lining' &&
      front.labels.category === 'Body',
    'foreign: TEXT + MTEXT (multi-line, split chunk, formatting) + ATTRIB tag decoded into labels',
    JSON.stringify(front?.labels),
  );
  const expArea = 200 * 300 - (2500 - (Math.PI * 2500) / 4);
  ck(
    front?.cut && Math.abs(front.cut.areaMm2 - expArea) < 3 && front.cut.paths.length === 5,
    'foreign: cut line chained from 4 LINEs + ARC (insert at 1000,0); area within the 0.05 mm chord deficit',
    `area ${front?.cut?.areaMm2.toFixed(2)} vs ${expArea.toFixed(2)}`,
  );
  ck(
    front?.drills.length === 1 &&
      Math.hypot(front.drills[0].at.x - 1100, front.drills[0].at.y - 150) < 1e-6,
    'foreign: nested INSERT drill (CIRCLE on 13) at (1100,150)',
  );
  ck(
    front?.grain?.form === 'axis' &&
      Object.values(front.roles).includes('fold') &&
      front?.notches.length === 1 &&
      front.notches[0].on === 'cut',
    'foreign: grain axis, layer-6 fold kept, notch on the cut line',
  );
  const spline = pg.paths.find((p) => X.read.meta.pathEntity[p.id] === 'SPLINE');
  const rErr = spline
    ? Math.max(...spline.pts.map((q) => Math.abs(Math.hypot(q.x - 1050, q.y - 100) - 100)))
    : Infinity;
  let sag = 0;
  if (spline)
    for (let i = 1; i < spline.pts.length; i++) {
      const a = spline.pts[i - 1],
        b = spline.pts[i];
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      sag = Math.max(sag, 100 - Math.sqrt(Math.max(0, 100 * 100 - (chord / 2) ** 2)));
    }
  ck(
    rErr < 1e-9 && sag <= 0.05 + 1e-9,
    'foreign: rational SPLINE (weights √½) = exact quarter circle, sagitta ≤ 0.05 mm',
    `radius err ${rErr.toExponential(1)} · sagitta ${sag.toFixed(4)} mm · ${spline?.pts.length} pts`,
  );
  const arcM = pg.paths
    .filter((p) => X.read.meta.pathEntity[p.id] === 'ARC')
    .find((p) => pg.styles[p.style].layer === '8');
  ck(
    !!arcM && arcM.pts.every((q) => Math.abs(Math.hypot(q.x - 1050, q.y - 60) - 20) < 1e-9),
    'foreign: ARC with extrusion (0,0,−1) mirrored to x = +50 → page centre (1050,60)',
  );
  const rot = X.read.meta.groups.find((g) => g.block === 'ROT_M');
  const rl = pg.paths.find((p) => p.id === rot.paths[0]);
  ck(
    Math.hypot(rl.pts[1].x - 0, rl.pts[1].y - 1020) < 1e-9,
    'foreign: INSERT rotation 90° × scale 2 → (0,1000)→(0,1020)',
  );
  const mir = X.read.meta.groups.find((g) => g.block === 'MIR_M');
  const ml = pg.paths.find((p) => p.id === mir.paths[0]);
  ck(
    Math.hypot(ml.pts[0].x + 100, ml.pts[0].y - 2000) < 1e-9 &&
      Math.hypot(ml.pts[1].x + 110, ml.pts[1].y - 2000) < 1e-9,
    'foreign: INSERT with extrusion (0,0,−1) mirrors position and geometry → (−100,2000)→(−110,2000)',
  );
  const hatch = pg.paths.find((p) => X.read.meta.pathEntity[p.id] === 'HATCH');
  ck(
    hatch && pg.styles[hatch.style].fill && hatch.closed && hatch.pts.length === 4,
    'foreign: HATCH boundary → closed filled path',
  );
  const ell = pg.paths.find((p) => X.read.meta.pathEntity[p.id] === 'ELLIPSE');
  ck(
    ell && ell.closed && Math.abs(Math.max(...ell.pts.map((q) => q.x)) - 1080) < 1e-9,
    'foreign: full ELLIPSE closed, major axis 20 mm',
  );
  const dashed = pg.paths.find((p) => p.id === rot.paths[0]);
  ck(
    JSON.stringify(pg.styles[dashed.style].dash) === JSON.stringify([12, 6]),
    'foreign: layer LTYPE DASHED → Style.dash in mm × insert scale',
    JSON.stringify(pg.styles[dashed.style].dash),
  );
  const inch = await load(
    'inch.dxf',
    enc(
      [
        '  0',
        'SECTION',
        '  2',
        'HEADER',
        '  9',
        '$INSUNITS',
        ' 70',
        '1',
        '  0',
        'ENDSEC',
        '  0',
        'SECTION',
        '  2',
        'ENTITIES',
        '  0',
        'LINE',
        '  8',
        '1',
        ' 10',
        '0',
        ' 20',
        '0',
        ' 11',
        '1',
        ' 21',
        '0',
        '  0',
        'ENDSEC',
        '  0',
        'EOF',
        '',
      ].join('\r\n'),
    ),
  );
  ck(
    Math.abs(inch.read.doc.pages[0].paths[0].pts[1].x - 25.4) < 1e-12 &&
      inch.read.meta.units.source === 'insunits',
    'foreign: $INSUNITS 1 → 1 unit = 25.4 mm',
  );
  // cp1251 (pattern-maker file, not UTF-8): "Перед"
  const head = new TextEncoder().encode(
    '  0\r\nSECTION\r\n  2\r\nENTITIES\r\n  0\r\nTEXT\r\n  8\r\n15\r\n 10\r\n0\r\n 20\r\n0\r\n 40\r\n5\r\n  1\r\n',
  );
  const cyr = new Uint8Array([0xcf, 0xe5, 0xf0, 0xe5, 0xe4]);
  const tail = new TextEncoder().encode('\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n');
  const cp = new Uint8Array(head.length + cyr.length + tail.length);
  cp.set(head);
  cp.set(cyr, head.length);
  cp.set(tail, head.length + cyr.length);
  const C = await load('cp1251.dxf', cp.buffer);
  ck(
    C.read.doc.pages[0].texts[0]?.text === 'Перед' && C.read.meta.encoding === 'windows-1251',
    'foreign: non-UTF-8 text decoded as cp1251',
    `${C.read.doc.pages[0].texts[0]?.text} (${C.read.meta.encoding})`,
  );
  report.foreign = {
    tally: t.rows,
    front: front && {
      identity: front.identity,
      size: front.size,
      labels: front.labels,
      area: front.cut?.areaMm2,
    },
  };
}

// ── 3c. binary DXF (F17): ASCII → binary (own writer, R12 + R2000 encodings) → identical IR ──
console.log('\n# binary DXF round-trip parity');
report.binary = {};
// Writer independent of the adapter: value type by group code per the DXF reference
// ("Group code value types"), binary widths as AutoCAD/ODA write them.
function binType(c) {
  if (c >= 0 && c <= 9) return 's';
  if (c >= 10 && c <= 59) return 'd';
  if (c >= 60 && c <= 79) return 'h';
  if (c >= 90 && c <= 99) return 'l';
  if (c >= 110 && c <= 149) return 'd';
  if (c >= 160 && c <= 169) return 'q';
  if (c >= 170 && c <= 179) return 'h';
  if (c >= 210 && c <= 239) return 'd';
  if (c >= 270 && c <= 279) return 'h';
  if (c >= 280 && c <= 289) return 'b';
  if (c >= 290 && c <= 299) return 'b';
  if (c >= 310 && c <= 319) return 'x';
  if (c >= 370 && c <= 389) return 'h';
  if (c >= 400 && c <= 409) return 'h';
  if ((c >= 420 && c <= 429) || (c >= 440 && c <= 459)) return 'l';
  if (c >= 460 && c <= 469) return 'd';
  if (c === 1004) return 'x';
  if (c >= 1010 && c <= 1059) return 'd';
  if (c >= 1060 && c <= 1070) return 'h';
  if (c === 1071) return 'l';
  return 's';
}
const CP1251 = (() => {
  const d = new TextDecoder('windows-1251');
  const m = new Map();
  for (let b = 0x80; b <= 0xff; b++) m.set(d.decode(Uint8Array.of(b)), b);
  return m;
})();
function enc1251(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (CP1251.has(ch)) out.push(CP1251.get(ch));
    else return null;
  }
  return Uint8Array.from(out);
}
/** ASCII DXF text → binary DXF bytes. mode 'r12' = 1-byte codes (255-escape), 'r2000' = 2-byte. */
function toBinaryDxf(text, mode, charset) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const chunks = [Buffer.from('AutoCAD Binary DXF\r\n\x1a\0', 'latin1')];
  const issues = [];
  const utf8 = new TextEncoder();
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() === '') break;
    const code = Number(lines[i].trim());
    const v = lines[i + 1];
    if (mode === 'r12') {
      if (code < 255 && code >= 0) chunks.push(Buffer.from([code]));
      else {
        const b = Buffer.alloc(3);
        b[0] = 255;
        b.writeInt16LE(code, 1);
        chunks.push(b);
      }
    } else {
      const b = Buffer.alloc(2);
      b.writeInt16LE(code, 0);
      chunks.push(b);
    }
    const t = binType(code);
    if (t === 's') {
      const sb = charset === 'cp1251' ? enc1251(v) : utf8.encode(v);
      chunks.push(Buffer.from(sb), Buffer.from([0]));
      continue;
    }
    if (t === 'x') {
      const raw = Buffer.from(v.trim(), 'hex');
      chunks.push(Buffer.from([raw.length]), raw);
      continue;
    }
    const n = Number(v.trim());
    if (!Number.isFinite(n)) issues.push(`line ${i + 1}: group ${code} “${v}” is not a number`);
    if (t === 'd') {
      const b = Buffer.alloc(8);
      b.writeDoubleLE(n, 0);
      chunks.push(b);
      continue;
    }
    if (!Number.isInteger(n)) issues.push(`line ${i + 1}: group ${code} “${v}” is not an integer`);
    if (t === 'h') {
      if (n < -32768 || n > 32767) issues.push(`line ${i + 1}: group ${code} ${n} overflows int16`);
      const b = Buffer.alloc(2);
      b.writeInt16LE(n, 0);
      chunks.push(b);
    } else if (t === 'l') {
      const b = Buffer.alloc(4);
      b.writeInt32LE(n, 0);
      chunks.push(b);
    } else if (t === 'q') {
      const b = Buffer.alloc(8);
      b.writeBigInt64LE(BigInt(n), 0);
      chunks.push(b);
    } else if (t === 'b') {
      if (n < 0 || n > 255) issues.push(`line ${i + 1}: group ${code} ${n} overflows a byte`);
      chunks.push(Buffer.from([n & 0xff]));
    }
  }
  return { bytes: Buffer.concat(chunks), issues };
}
/** Everything the import produces, minus what legitimately differs by encoding. */
function irOf(read, seg) {
  const { doc, meta } = read;
  return JSON.stringify({
    pages: doc.pages,
    warnings: doc.warnings.filter((w) => !/not UTF-8/.test(w)),
    groups: meta.groups,
    points: meta.points,
    pathEntity: meta.pathEntity,
    textEntity: meta.textEntity,
    attribTag: meta.attribTag,
    tally: meta.tally,
    units: meta.units,
    dialect: meta.dialect,
    manifest: meta.manifest,
    version: meta.version,
    modelLabels: meta.modelLabels,
    seg,
  });
}
const SYN17 = resolve(CORPUS, 'synthetic/f17');
mkdirSync(SYN17, { recursive: true });
const parityFiles = [
  resolve(PLAN, 'k2-work/golden-min.dxf'),
  resolve(PLAN, 'k2-work/golden-min-r12.dxf'),
  ...readdirSync(resolve(CORPUS, 'dxf-clo'))
    .filter((f) => /\.dxf$/i.test(f))
    .sort()
    .map((f) => resolve(CORPUS, 'dxf-clo', f)),
];
for (const path of parityFiles) {
  const name = path.split('/').pop();
  const buf = readFileSync(path);
  const asciiText = new TextDecoder('utf-8').decode(buf);
  const a = await load(name, ab(buf));
  const ref = irOf(a.read, a.seg);
  const stat = (report.binary[name] = {});
  for (const mode of ['r12', 'r2000']) {
    // R12 strings in the ANSI codepage (as AutoCAD R12 writes them) when they fit cp1251,
    // R2000 in UTF-8 (R2007+ style) — so both decoder branches are exercised.
    const nonAscii = /[^\x00-\x7f]/.test(asciiText);
    const charset =
      mode === 'r12' && nonAscii && enc1251(asciiText.replace(/[\r\n]/g, '')) ? 'cp1251' : 'utf-8';
    const { bytes, issues } = toBinaryDxf(asciiText, mode, charset);
    if (path.includes('k2-work'))
      writeFileSync(resolve(SYN17, name.replace(/\.dxf$/, `.binary-${mode}.dxf`)), bytes);
    const t0 = performance.now();
    let got;
    try {
      const b = await load(name, ab(bytes));
      got = { ir: irOf(b.read, b.seg), meta: b.read.meta };
    } catch (e) {
      got = { err: `${e?.name}: ${e?.kind ?? ''} ${e?.message}` };
    }
    const ms = Math.round(performance.now() - t0);
    const same = got.ir === ref;
    let firstDiff = '';
    if (!same && got.ir) {
      let k = 0;
      while (k < ref.length && ref[k] === got.ir[k]) k++;
      firstDiff = `first diff @${k}: ascii …${ref.slice(Math.max(0, k - 60), k + 60)}… vs binary …${got.ir.slice(Math.max(0, k - 60), k + 60)}…`;
    }
    stat[mode] = {
      bytes: bytes.length,
      charset,
      ms,
      writerIssues: issues.slice(0, 5),
      binaryMode: got.meta?.binary ?? null,
      encoding: got.meta?.encoding ?? null,
      identical: same,
    };
    ck(
      issues.length === 0,
      `binary ${mode} ${name}: every ASCII value fits its binary type`,
      issues.slice(0, 3).join('; '),
    );
    ck(
      got.meta?.binary === (mode === 'r12' ? 'r12' : 'r13+'),
      `binary ${mode} ${name}: read as binary ${mode === 'r12' ? 'R12 (1-byte codes)' : 'R13+ (2-byte codes)'}`,
      got.err ?? `${got.meta?.binary} · ${got.meta?.encoding} · ${bytes.length} B · ${ms} ms`,
    );
    ck(
      same,
      `binary ${mode} ${name}: IR identical to ASCII (paths, texts, groups, POINT attrs, tally, segmentation + features)`,
      got.err ?? firstDiff,
    );
  }
}
// ── 4. negative controls ─────────────────────────────────────────────────────────────────────
console.log('\n# negative controls');
const golden = readFileSync(resolve(PLAN, 'k2-work/golden-min.dxf'));
const gtext = golden.toString('latin1');
const expectKind = async (label, bytes, kind) => {
  try {
    await m.readDxf({ id: '0', name: label, bytes }, OPTS);
    ck(false, `${label} → ${kind}`, 'no error');
    report.negative[label] = 'no error';
  } catch (e) {
    const ok = m.isDxfImportError(e) && e.kind === kind;
    ck(ok, `${label} → typed ${kind}`, `${e?.name}: ${e?.kind} — ${e?.message}`);
    report.negative[label] = `${e?.kind}: ${e?.message}`;
  }
};
await expectKind(
  'truncated (half the golden)',
  enc(gtext.slice(0, Math.floor(gtext.length / 2))),
  'corrupt',
);
await expectKind('garbage group code', enc(gtext.replace(/\r\n 10\r\n/, '\r\nxx\r\n')), 'corrupt');
{
  const at = gtext.indexOf('LWPOLYLINE', gtext.indexOf('BLOCKS'));
  const bad10 = gtext.slice(0, at) + gtext.slice(at).replace(/( 10\r\n)-?\d+\.\d+/, '$1abc');
  await expectKind('non-numeric entity coordinate', enc(bad10), 'corrupt');
  // cut on a pair boundary: every pair is whole, but BLOCKS never closes
  const lines = gtext.split('\r\n');
  const cutAt = lines.indexOf('ENDBLK') - 1;
  await expectKind(
    'truncated on a pair boundary (section never closed)',
    enc(lines.slice(0, cutAt - (cutAt % 2)).join('\r\n') + '\r\n'),
    'corrupt',
  );
}
await expectKind(
  'dangling code at EOF',
  enc(gtext.replace(/  0\r\nEOF\r\n$/, '  0\r\n')),
  'corrupt',
);
const bin = new Uint8Array(64);
bin.set(new TextEncoder().encode('AutoCAD Binary DXF\r\n\x1a\0'));
// F17: binary DXF is read now; a sentinel followed by zeros is a damaged binary file
await expectKind('binary DXF sentinel + zeros', bin.buffer, 'corrupt');
await expectKind('binary DXF sentinel only', bin.buffer.slice(0, 22), 'empty');
await expectKind('DWG magic', enc('AC1015\0\0\0\0\0\0garbage'), 'dwg');
await expectKind('empty file', new ArrayBuffer(0), 'empty');
await expectKind('a PDF', enc('%PDF-1.7\n%âãÏÓ\n1 0 obj\n'), 'not-dxf');

// negative: truncated binary → typed corrupt, never a hang; a flipped group code → corrupt too
{
  const g = readFileSync(resolve(PLAN, 'k2-work/golden-min.dxf'));
  for (const mode of ['r12', 'r2000']) {
    const { bytes } = toBinaryDxf(new TextDecoder().decode(g), mode, 'utf-8');
    for (const frac of [0.003, 0.1, 0.37, 0.5, 0.81, 0.97]) {
      const cut = Math.max(23, Math.floor(bytes.length * frac));
      const t0 = performance.now();
      await expectKind(
        `binary ${mode} truncated at ${cut}/${bytes.length} B`,
        ab(bytes.subarray(0, cut)),
        'corrupt',
      );
      const ms = performance.now() - t0;
      ck(ms < 2000, `binary ${mode} truncated at ${cut}: answers fast`, `${Math.round(ms)} ms`);
    }
    // a string with no terminating NUL at the very end
    const noNul = Buffer.concat([bytes.subarray(0, bytes.length - 1)]);
    await expectKind(`binary ${mode} last string unterminated`, ab(noNul), 'corrupt');
  }
}

// ── report ───────────────────────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
mkdirSync(resolve(PLAN, 'reports'), { recursive: true });
writeFileSync(resolve(PLAN, `reports/F8-${stamp}.json`), JSON.stringify(report, null, 2));
const md = [
  `# F8 probe — ${report.date}`,
  '',
  `${checks.filter((c) => c.ok).length}/${checks.length} checks pass.`,
  '',
  '| file | dialect | blocks | sizes | identities | mode | L1 ungraded | notches raw→logical (derived) | grain | labels (name/size/qty) | dropped | ms |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...Object.entries(report.files).map(
    ([f, s]) =>
      `| ${f} | ${s.dialect} | ${s.blocks} | ${s.sizes.join(' ') || '—'} | ${s.identities} | ${s.mode} | ${s.layer1Ungraded}${s.ungradedIdentities.length ? ` (${s.ungradedIdentities.length})` : ''} | ${s.notchesRaw}→${s.notches}${s.notchesDerived ? ` (${s.notchesDerived})` : ''} | ${Object.entries(
        s.grain,
      )
        .map(([k, v]) => `${k} ${v}`)
        .join(
          ', ',
        )} | ${s.labels.pieceName}/${s.labels.size}/${s.labels.quantity} | ${s.tally.reduce((a, r) => a + r.dropped, 0)} | ${s.ms} |`,
  ),
  '',
  '## checks',
  '',
  ...checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.what}${c.d ? ` — ${c.d}` : ''}`),
  '',
].join('\n');
writeFileSync(resolve(PLAN, `reports/F8-${stamp}.md`), md);
console.log(bad ? `\n${bad} FAILED` : `\nall ${checks.length} ok`);
process.exit(bad ? 1 : 0);
