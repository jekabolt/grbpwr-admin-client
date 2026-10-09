#!/usr/bin/env node
// DXF nested-size guard probe (H1 adversarial fix). The fast path reads one block = one piece ×
// one size. A block that draws several outlines of one look nested (a CLO-like export holding the
// outlines of three sizes) must NOT be reduced to its largest loop — that is a plausible but wrong
// contour labelled as whatever size the block claims. Acceptance:
//   * fixture: a synthetic R12 DXF (built here) with
//       BACK_M   — 3 nested same-layer graded outlines → every candidate 'refused',
//                  gradeRefusal 'sizes-not-distinguished', outer [] (never the largest loop);
//       SLEEVE_M — 2 nested graded outlines → refused the same way;
//       FRONT_M  — control: one outline + a pocket cut-out on the cut layer + drill + internal
//                  line → 'closed' on the outline, the pocket stays a hole;
//       YOKE_M   — control: one outline + its sew line drawn alike at a uniform 10 mm → 'closed';
//   * corpus/dxf-clo: no block is flagged and no candidate is refused (the guard is silent on
//     real CLO exports), and — with --baseline FILE — the canonical fast-path output of every
//     file equals the baseline taken before the change.
//   node scripts/pattern-import/dxf-nested.mjs [--write-baseline FILE] [--baseline FILE]
//   (PATIMPORT_CORPUS overrides the corpus root; nothing is written unless asked)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : null;
};
const writeBaseline = arg('--write-baseline');
const baseline = arg('--baseline');

const outfile = resolve(tmpdir(), `patimport-dxf-nested-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'dxf-nested-entry.ts')],
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
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const enc = (s) => new TextEncoder().encode(s).buffer;
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);

// ── fixture ───────────────────────────────────────────────────────────────────────────────────

/** A bodice-like convex outline with the grade anchor at its first vertex (0,0). */
const BODY = [
  [0, 0],
  [260, 0],
  [280, 180],
  [250, 420],
  [170, 470],
  [60, 460],
  [0, 400],
];
/**
 * Grade step k about the anchor: width +3 %, length +2 % per size — a grade nest like CLO's
 * stacked sizes (they touch at the anchor; the areas grow ≈5 % per size).
 */
const graded = (k, dx, dy) =>
  BODY.map(([x, y]) => [dx + x * (1 + 0.03 * k), dy + y * (1 + 0.02 * k)]);

function fixtureDxf() {
  const out = [];
  const E = (c, v) => out.push(String(c).padStart(3), String(v));
  const poly = (layer, pts, closed = true) => {
    E(0, 'POLYLINE');
    E(8, layer);
    E(66, 1);
    E(70, closed ? 1 : 0);
    for (const [x, y] of pts) {
      E(0, 'VERTEX');
      E(8, layer);
      E(10, x.toFixed(4));
      E(20, y.toFixed(4));
    }
    E(0, 'SEQEND');
  };
  const line = (layer, a, b) => {
    E(0, 'LINE');
    E(8, layer);
    E(10, a[0]);
    E(20, a[1]);
    E(11, b[0]);
    E(21, b[1]);
  };
  const point = (layer, p) => {
    E(0, 'POINT');
    E(8, layer);
    E(10, p[0]);
    E(20, p[1]);
  };
  const rect = (x0, y0, x1, y1) => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const block = (name, body) => {
    E(0, 'BLOCK');
    E(8, '0');
    E(2, name);
    E(70, 0);
    E(10, 0);
    E(20, 0);
    body();
    E(0, 'ENDBLK');
  };
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1009');
  E(9, '$INSUNITS');
  E(70, 4);
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  // three sizes of one piece in ONE block, same layer, same look, nested
  block('BACK_M', () => {
    for (const k of [-1, 0, 1]) poly('1', graded(k, 0, 0));
    line('7', [130, 60], [130, 380]);
  });
  // two sizes in one block
  block('SLEEVE_M', () => {
    for (const k of [0, 1]) poly('1', graded(k, 1000, 0));
    line('7', [1130, 60], [1130, 380]);
  });
  // control: one outline + a pocket cut-out on the cut layer + drill + internal line
  block('FRONT_M', () => {
    poly('1', graded(0, 2000, 0));
    poly('1', rect(2080, 150, 2160, 210)); // pocket opening cut out of the piece
    point('13', [2120, 300]);
    line('8', [2040, 250], [2200, 250]);
    line('7', [2130, 60], [2130, 380]);
  });
  // control: outline + its sew line drawn alike at a uniform 10 mm allowance
  block('YOKE_M', () => {
    poly('1', rect(3000, 0, 3300, 200));
    poly('1', rect(3010, 10, 3290, 190));
    line('7', [3150, 30], [3150, 170]);
  });
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const name of ['BACK_M', 'SLEEVE_M', 'FRONT_M', 'YOKE_M']) {
    E(0, 'INSERT');
    E(8, '0');
    E(2, name);
    E(10, 0);
    E(20, 0);
  }
  E(0, 'ENDSEC');
  E(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

console.log('# fixture: nested sizes in one block');
{
  const { seg, fast } = await m.fastPathOf('nested-sizes.dxf', enc(fixtureDxf()));
  ck(seg.presegmented && !!fast, 'fixture is pre-segmented (blocks → fast path)');
  const byBlock = new Map();
  for (const f of fast?.families ?? [])
    for (const c of f.candidates) byBlock.set(c.dxf.block, { c, f });
  const refused = (name, outlines) => {
    const hit = byBlock.get(name);
    const c = hit?.c;
    ck(
      !!c &&
        c.outcome === 'refused' &&
        c.gradeRefusal === 'sizes-not-distinguished' &&
        c.outer.length === 0 &&
        c.walls.length === 0 &&
        c.areaMm2 === 0 &&
        (c.features ?? []).length === 0 &&
        c.dxf.features.length === 0,
      `${name}: ${outlines} nested outlines → refused, no contour`,
      c
        ? `outcome=${c.outcome} refusal=${c.gradeRefusal} outer=${c.outer.length} — ${c.gradeDetail ?? ''}`
        : 'missing',
    );
    const p = seg.pieces.find((x) => x.block === name);
    ck(
      p?.nested?.outlines === outlines,
      `${name}: segmentation reports ${outlines} outlines`,
      JSON.stringify(p?.nested ?? null),
    );
  };
  refused('BACK_M', 3);
  refused('SLEEVE_M', 2);
  const closed = (name, extra) => {
    const c = byBlock.get(name)?.c;
    const p = seg.pieces.find((x) => x.block === name);
    ck(
      !!c && c.outcome === 'closed' && c.outer.length > 0 && !c.gradeRefusal && !p?.nested,
      `${name}: control closes on its one outline`,
      c
        ? `outcome=${c.outcome} area=${(c.areaMm2 / 100).toFixed(0)} cm² outer=${c.outer.length}`
        : 'missing',
    );
    if (extra) extra(c, p);
  };
  closed('FRONT_M', (c, p) => {
    const roles = Object.values(p?.roles ?? {});
    ck(roles.includes('hole'), 'FRONT_M: pocket cut-out stays a hole', roles.join(' '));
    ck((p?.drills ?? []).length === 1, 'FRONT_M: drill kept', String(p?.drills.length));
    ck(
      Math.abs(c.areaMm2 - Math.abs(area(graded(0, 2000, 0)))) < 1,
      'FRONT_M: outline = the drawn outline',
    );
  });
  closed('YOKE_M', (c, p) =>
    ck(
      Math.abs(c.areaMm2 - 300 * 200) < 1 && Object.values(p.roles).includes('hole'),
      'YOKE_M: outer = the cut line; the uniform sew line is not taken for a size',
    ),
  );
  const fam = fast?.families.find((f) => f.candidates.some((c) => c.dxf.block === 'BACK_M'));
  ck(
    !!fast?.sheet.warnings.some((w) => /several outlines/.test(w)),
    'segmentation warns about the refused blocks',
    fast?.sheet.warnings.find((w) => /several outlines/.test(w)) ?? '',
  );
  ck(!!fam, 'BACK_M family present (refused, not dropped)');
}

function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    s += ax * by - bx * ay;
  }
  return s / 2;
}

// ── corpus ────────────────────────────────────────────────────────────────────────────────────

console.log('\n# corpus/dxf-clo: guard silent, output unchanged');
const dir = resolve(CORPUS, 'dxf-clo');
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => /\.dxf$/i.test(f))
      .sort()
  : [];
ck(files.length > 0, `corpus files found in ${dir}`, String(files.length));
const snap = {};
for (const f of files) {
  const { seg, fast } = await m.fastPathOf(f, ab(readFileSync(resolve(dir, f))));
  const flagged = seg.pieces.filter((p) => p.nested);
  const refusedN = (fast?.families ?? [])
    .flatMap((x) => x.candidates)
    .filter((c) => c.outcome === 'refused').length;
  ck(
    flagged.length === 0 && refusedN === 0,
    `${f}: no nested-size block, nothing refused`,
    `${seg.pieces.length} blocks, ${fast?.families.length ?? 0} families${flagged.length ? `; flagged ${flagged.map((p) => p.block).join(', ')}` : ''}`,
  );
  snap[f] = m.canonical(fast);
}
if (writeBaseline) {
  writeFileSync(writeBaseline, JSON.stringify(snap, null, 1));
  console.log(`  baseline written: ${writeBaseline}`);
}
if (baseline) {
  const before = JSON.parse(readFileSync(baseline, 'utf8'));
  for (const f of new Set([...Object.keys(before), ...Object.keys(snap)])) {
    const a = JSON.stringify(before[f] ?? null);
    const b = JSON.stringify(snap[f] ?? null);
    let where = '';
    if (a !== b) {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      where = `first difference at char ${i}: …${a.slice(Math.max(0, i - 60), i + 60)}… vs …${b.slice(Math.max(0, i - 60), i + 60)}…`;
    }
    ck(a === b, `${f}: fast-path output identical to the baseline`, where);
  }
}

console.log(`\n${bad ? `FAIL: ${bad} check(s)` : 'PASS'}`);
process.exit(bad ? 1 : 0);
