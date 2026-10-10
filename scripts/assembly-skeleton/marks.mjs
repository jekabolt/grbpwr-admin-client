#!/usr/bin/env node
// P2 step 0 — internal-marks probe (tmp/plans/assembly-from-pattern/03-P2-DESIGN.md §2).
//
// Runs geometry/marks.ts (through segmentPiece, the product path) over real CLO / Gerber files and
// prints, per piece, the classified marks. Gates — the numbers of the design's §1 evidence:
//   SS26-005  PLCK_L: drill ≥ 11, fold = 5, placement = 0; two drill columns of 6 along its edges;
//             BP: the 10 straight L8 lines across the shoulder corners (ends on the sewing line,
//             parallel to each other but to NO edge — the design's «along the shoulder» was a
//             misreading; ss26.png) are other: vee = 0, placement = 0; no placement on the shirt;
//             the collars' topstitch (3.7 mm in) is parallel;
//   Allsizes  FP_R: seam-copy = 1 (dropped), drill = 6, fold = 2 (the file has TWO full-length
//             lines at 12.5 and 25 mm — the design's «fold = 1» undercounted); no placement on the
//             file (the L8 sewing-line copies are not marks);
//   blazer    6_M: placement ≥ 2 (the patch pocket 141 × 192 mm + the facing line), buttonhole = 2,
//             fold ≥ 2; 3_M: vee = 1 with intake ≈ 194 mm (a vent, NOT a dart);
//             pocket_l: a closed placement 51 × 158 mm (the welt it carries);
//   POCKETS   placement = 0 (nothing but sewing lines);
//   summer    FP: 6 drills.
// NEGATIVE CONTROLS (the probe must go red when a step is removed):
//   seam-copy OFF → Allsizes gets ≥ 9 placements (its sewing-line copies);
//   twins OFF     → blazer 6_M reads > 2 buttonholes / the pocket twice;
//   parallel OFF  → SS26 collars get placements (topstitch becomes «a part on top»);
//   straight OFF  → SS26 BP's straight lines become placements.
//
// Usage: node scripts/assembly-skeleton/marks.mjs   (SKELETON_VERBOSE=1 prints every mark)
// Data:  SKELETON_PLANS (default ../tmp/plans), SKELETON_DOWNLOADS (default ~/Downloads).

import { build } from 'esbuild';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `skeleton-marks-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'marks-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const mod = await import(pathToFileURL(outfile).href);

const plans = process.env.SKELETON_PLANS ?? resolve(here, '../../../tmp/plans');
const downloads = process.env.SKELETON_DOWNLOADS ?? resolve(homedir(), 'Downloads');
const corpus = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo');
const verbose = process.env.SKELETON_VERBOSE === '1';

const FILES = [
  {
    id: 'ss26',
    dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
    size: 'M',
  },
  { id: 'allsizes', dxf: resolve(corpus, 'Allsizes_with_notches.dxf'), size: 'M' },
  { id: 'blazer', dxf: resolve(corpus, 'blazer.dxf'), size: 'M' },
  { id: 'pockets', dxf: resolve(corpus, 'POCKETS.dxf'), size: null },
  { id: 'summer', dxf: resolve(corpus, 'summer men.dxf'), size: null },
  // The rest of the corpus and the owner's Downloads: printed, no gates (a crash is a failure).
  { id: 'allsizes-plain', dxf: resolve(corpus, 'allsizes.dxf'), size: null },
  { id: 'gerber-summer', dxf: resolve(corpus, 'summer men_ganjubas_gerber.dxf'), size: null },
  { id: 'dl-blazer_1', dxf: resolve(downloads, 'blazer_1.dxf'), size: null },
  {
    id: 'dl-summer-outline',
    dxf: resolve(downloads, 'summer men with pattern outline1.dxf'),
    size: null,
  },
  { id: 'dl-pockets-2', dxf: resolve(downloads, 'POCKETS (2).dxf'), size: null },
];

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

// dxf-parser chatters through console.log / warn; keep our own output.
const warn = console.warn;
const log = console.log;
const quiet = async (fn) => {
  console.warn = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    console.log = log;
  }
};

const KINDS = ['drill', 'buttonhole', 'fold', 'parallel', 'placement', 'vee', 'other'];
const count = (marks, kind) => marks.filter((m) => m.kind === kind).length;
const mm = (x) => Math.round(x);

const loaded = new Map();
for (const f of FILES) {
  if (!(await exists(f.dxf))) {
    console.log(`── ${f.id}: ${f.dxf} not found — skipped`);
    continue;
  }
  const buf = await readFile(f.dxf);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const bySize = await quiet(() => mod.loadInputs(bytes));
  // The base size: the one asked for, else the size with the most pieces (ties: first seen).
  const size =
    f.size && bySize.has(f.size)
      ? f.size
      : [...bySize.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const inputs = bySize.get(size) ?? [];
  const pieces = mod.marksOf(inputs);
  loaded.set(f.id, { ...f, size, inputs, pieces });
  const total = pieces.reduce((n, p) => n + p.marks.length, 0);
  const ms = pieces.reduce((n, p) => n + p.ms, 0);
  console.log(
    `\n── ${f.id} (size ${size || '—'}): ${pieces.length} pieces, ${total} marks · ${KINDS.map((k) => `${k} ${pieces.reduce((n, p) => n + count(p.marks, k), 0)}`).join(' · ')} · segment+marks ${ms.toFixed(0)} ms`,
  );
  for (const p of pieces) {
    const d = p.dropped;
    if (!p.marks.length && !d.twins && !d.seamCopies) continue;
    const kinds = KINDS.map((k) => [k, count(p.marks, k)])
      .filter(([, n]) => n)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    console.log(
      `   ${p.key.padEnd(16)} ${kinds || '—'}  (dropped: seam-copy ${d.seamCopies}, twins ${d.twins}, ticks ${d.ticks})`,
    );
    if (!verbose) continue;
    for (const m of p.marks) {
      const extra = m.vee
        ? ` intake ${mm(m.vee.intakeMm)} depth ${mm(m.vee.depthMm)} apex ${mm(m.vee.apexDeg)}° on ${m.vee.edge}`
        : m.nearEdge
          ? ` ${m.nearEdge.edge} +${m.nearEdge.offsetMm.toFixed(1)} @${mm(m.nearEdge.alongMm)}`
          : '';
      console.log(
        `      ${m.id.padEnd(14)} ${m.kind.padEnd(10)} L${m.layer} ${m.closed ? 'closed' : 'open  '} ${mm(m.bbox.w)}×${mm(m.bbox.h)} len ${mm(m.lenMm)}${extra}`,
      );
    }
  }
}

// ── gates ────────────────────────────────────────────────────────────────────────────────────
let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const piece = (id, key) => loaded.get(id)?.pieces.find((p) => p.key === key);
const need = (id, key) => {
  const p = piece(id, key);
  if (!p) check(false, `${id}: piece ${key} present`, 'missing');
  return p ?? { key, marks: [], dropped: { twins: 0, seamCopies: 0, ticks: 0 } };
};
const all = (id) => loaded.get(id)?.pieces.flatMap((p) => p.marks) ?? [];
/** Drill columns: drills grouped by their nearest edge at one offset (±5 mm), ≥ 2 each. */
const columns = (marks) => {
  const out = [];
  for (const m of marks.filter((q) => q.kind === 'drill' && q.nearEdge)) {
    const c = out.find(
      (o) => o.edge === m.nearEdge.edge && Math.abs(o.offset - m.nearEdge.offsetMm) <= 5,
    );
    if (c) c.n++;
    else out.push({ edge: m.nearEdge.edge, offset: m.nearEdge.offsetMm, n: 1 });
  }
  return out.filter((c) => c.n >= 2);
};

console.log('\n── gates');
for (const id of ['ss26', 'allsizes', 'blazer', 'pockets', 'summer']) {
  check(loaded.has(id), `${id}: file read`);
}

// SS26-005
{
  const pl = need('ss26', 'PLCK_L').marks;
  check(count(pl, 'drill') >= 11, 'SS26 PLCK_L: drill ≥ 11', count(pl, 'drill'));
  check(count(pl, 'fold') === 5, 'SS26 PLCK_L: fold = 5', count(pl, 'fold'));
  check(count(pl, 'placement') === 0, 'SS26 PLCK_L: placement = 0', count(pl, 'placement'));
  const cols = columns(pl);
  check(
    cols.length === 2 && cols.every((c) => c.n === 6),
    'SS26 PLCK_L: two drill columns of 6',
    cols.map((c) => `${c.n} @ ${c.offset.toFixed(0)} mm from ${c.edge}`).join('; ') || 'none',
  );
  const bp = need('ss26', 'BP').marks;
  check(
    count(bp, 'other') === 10 && bp.length === 10,
    'SS26 BP: the 10 straight lines across the shoulders are other',
    bp.map((m) => m.kind).join(', '),
  );
  check(count(bp, 'vee') === 0, 'SS26 BP: vee = 0', count(bp, 'vee'));
  check(count(bp, 'placement') === 0, 'SS26 BP: placement = 0', count(bp, 'placement'));
  check(
    count(all('ss26'), 'placement') === 0,
    'SS26: no placement anywhere',
    count(all('ss26'), 'placement'),
  );
}

// Allsizes
{
  const fp = need('allsizes', 'FP_R');
  check(
    fp.dropped.seamCopies === 1,
    'Allsizes FP_R: seam-copy = 1 (dropped)',
    fp.dropped.seamCopies,
  );
  check(count(fp.marks, 'drill') === 6, 'Allsizes FP_R: drill = 6', count(fp.marks, 'drill'));
  check(count(fp.marks, 'fold') === 2, 'Allsizes FP_R: fold = 2', count(fp.marks, 'fold'));
  const pl = count(all('allsizes'), 'placement');
  check(pl === 0, 'Allsizes: no placement (L8 sewing-line copies are not marks)', pl);
}

// blazer
{
  const fr = need('blazer', '6').marks;
  check(count(fr, 'placement') >= 2, 'blazer 6_M: placement ≥ 2', count(fr, 'placement'));
  const pocket = fr.find(
    (m) => m.kind === 'placement' && Math.abs(m.bbox.w - 141) <= 4 && Math.abs(m.bbox.h - 192) <= 4,
  );
  check(
    !!pocket,
    'blazer 6_M: the patch pocket placement 141 × 192 mm',
    pocket ? `${pocket.id} ${mm(pocket.bbox.w)}×${mm(pocket.bbox.h)}` : 'not found',
  );
  check(count(fr, 'buttonhole') === 2, 'blazer 6_M: buttonhole = 2', count(fr, 'buttonhole'));
  check(count(fr, 'fold') >= 2, 'blazer 6_M: fold ≥ 2', count(fr, 'fold'));
  const back = need('blazer', '3').marks;
  const vees = back.filter((m) => m.kind === 'vee');
  check(
    vees.length === 1 && Math.abs(vees[0].vee.intakeMm - 194) <= 6,
    'blazer 3_M: vee = 1 with intake ≈ 194 mm',
    vees
      .map(
        (v) => `intake ${mm(v.vee.intakeMm)} depth ${mm(v.vee.depthMm)} apex ${mm(v.vee.apexDeg)}°`,
      )
      .join('; ') || 'none',
  );
  const pl = need('blazer', 'pocket_l').marks;
  const welt = pl.find(
    (m) =>
      m.kind === 'placement' &&
      m.closed &&
      Math.abs(m.bbox.w - 51) <= 4 &&
      Math.abs(m.bbox.h - 158) <= 4,
  );
  check(!!welt, 'blazer pocket_l: closed placement 51 × 158 mm', welt ? welt.id : 'not found');
}

// POCKETS, summer
{
  const pl = count(all('pockets'), 'placement');
  check(pl === 0, 'POCKETS: placement = 0', pl);
  const fp = loaded.get('summer')?.pieces.filter((p) => count(p.marks, 'drill') === 6) ?? [];
  check(
    fp.length >= 1,
    'summer men: a front with 6 drills',
    fp.map((p) => p.key).join(', ') || 'none',
  );
}

// A valid DXF can carry annotations a metre or two off the piece; classifying must stay cheap.
// MUTATION: SewLine.nearest without a max distance (`limit = Infinity`) → 71 s instead of
// ~15 ms (10.10): the gate goes red; that is the hang Codex found on the CONSTRUCTION tab.
{
  const far = mod.farAnnotation();
  check(
    far.ms < 50,
    'synthetic: annotations 1–2 m off the piece classify in < 50 ms',
    `${far.ms.toFixed(1)} ms`,
  );
  const fold = far.marks.filter((m) => m.kind === 'fold');
  check(
    fold.length === 1,
    'synthetic: the real fold inside is still a fold',
    far.marks.map((m) => m.kind).join(', '),
  );
  const away = far.marks.filter(
    (m) => m.bbox.cx > 1000 || m.bbox.cx < 0 || m.bbox.cy > 1000 || m.bbox.cy < 0,
  );
  check(
    away.length === 21 &&
      away.every((m) => !m.nearEdge && !m.vee && m.kind !== 'fold' && m.kind !== 'parallel'),
    'synthetic: the far annotations are at no edge (no nearEdge, no vee / fold / parallel)',
    away.map((m) => m.kind).join(', '),
  );
}

// ── negative controls ────────────────────────────────────────────────────────────────────────
console.log('\n── negative controls (each must go red)');
{
  const a = loaded.get('allsizes');
  const n = a
    ? count(
        mod.marksOf(a.inputs, { seamCopy: false }).flatMap((p) => p.marks),
        'placement',
      )
    : 0;
  check(n >= 9, 'seam-copy OFF → Allsizes placement ≥ 9 (the gate above would fail)', n);
  const b = loaded.get('blazer');
  const fr = b
    ? mod.marksOf(
        b.inputs.filter((i) => i.pieceKey === '6'),
        { twins: false },
      )[0].marks
    : [];
  const pockets = fr.filter((m) => m.kind === 'placement' && Math.abs(m.bbox.h - 192) <= 4).length;
  check(
    count(fr, 'buttonhole') !== 2 || pockets !== 1,
    'twins OFF → blazer 6_M reads its L8/L85 copies twice',
    `buttonholes ${count(fr, 'buttonhole')}, pocket outlines ${pockets}`,
  );
  const s = loaded.get('ss26');
  const clr = s
    ? mod
        .marksOf(
          s.inputs.filter((i) => /CLR/.test(i.pieceKey)),
          { parallel: false },
        )
        .flatMap((p) => p.marks)
    : [];
  check(
    count(clr, 'placement') > 0,
    'parallel OFF → SS26 collar topstitch becomes placement',
    count(clr, 'placement'),
  );
  const bp = s
    ? mod.marksOf(
        s.inputs.filter((i) => i.pieceKey === 'BP'),
        { straight: false },
      )[0].marks
    : [];
  check(
    count(bp, 'placement') > 0,
    'straight OFF → SS26 BP straight lines become placement',
    count(bp, 'placement'),
  );
}

console.log(failures ? `\n${failures} gate(s) FAILED` : '\nall gates green');
process.exit(failures ? 1 : 0);
