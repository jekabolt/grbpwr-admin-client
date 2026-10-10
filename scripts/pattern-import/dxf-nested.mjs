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
//       YOKE_M   — control: one outline + its sew line drawn alike at a uniform 10 mm → 'closed'
//                  (reported as a seam pair; it closes because the drawing names ONE size, M);
//       STACK_M  — 3 nested same-look rectangles at a uniform 8 mm step → refused (three alike are
//                  sizes, however uniform);
//       WIDE_M   — an outline + one alike 25 mm inside (more than an allowance) → refused;
//     and a second fixture whose blocks name exactly two sizes (PANEL_S, PANEL_M, each an outline
//     + a uniform 10 mm sew line alike) → refused: with two sizes, the pair may be the sizes; and a
//     third with no size named (POCKET, graded +4 mm = an exact 2 mm inner loop) → refused until the
//     count is one (settleSeamPair restores the cut + sew reading);
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

function fixtureDxf(kind = 'main') {
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
  if (kind === 'main') {
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
  }
  const names = [];
  if (kind === 'no-size') {
    // no size token anywhere: a patch pocket graded +4 mm all round = an exact 2 mm inner loop
    block('POCKET', () => {
      poly('1', rect(8000, 0, 8164, 184));
      poly('1', rect(8002, 2, 8162, 182));
      line('7', [8082, 30], [8082, 150]);
    });
    names.push('POCKET');
  } else if (kind === 'two-sizes') {
    // the drawing names exactly two sizes; each block: an outline + one alike 10 mm inside
    for (const [i, z] of ['S', 'M'].entries()) {
      const x = 5000 + i * 1000;
      block(`PANEL_${z}`, () => {
        poly('1', rect(x, 0, x + 300 + 6 * i, 200 + 4 * i));
        poly('1', rect(x + 10, 10, x + 290 + 6 * i, 190 + 4 * i));
        line('7', [x + 150, 30], [x + 150, 170]);
      });
      names.push(`PANEL_${z}`);
    }
  } else {
    names.push('BACK_M', 'SLEEVE_M', 'FRONT_M', 'YOKE_M', 'STACK_M', 'WIDE_M');
    // control: outline + its sew line drawn alike at a uniform 10 mm allowance
    block('YOKE_M', () => {
      poly('1', rect(3000, 0, 3300, 200));
      poly('1', rect(3010, 10, 3290, 190));
      line('7', [3150, 30], [3150, 170]);
    });
    // three alike, a uniform 8 mm apart: sizes, not a cut line with its sew line
    block('STACK_M', () => {
      for (const k of [0, 8, 16]) poly('1', rect(4000 + k, k, 4300 - k, 200 - k));
      line('7', [4150, 30], [4150, 170]);
    });
    // one alike 25 mm inside: farther than an allowance
    block('WIDE_M', () => {
      poly('1', rect(7000, 0, 7300, 200));
      poly('1', rect(7025, 25, 7275, 175));
      line('7', [7150, 30], [7150, 170]);
    });
  }
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const name of names) {
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
  closed('YOKE_M', (c, p) => {
    ck(
      Math.abs(c.areaMm2 - 300 * 200) < 1 && Object.values(p.roles).includes('hole'),
      'YOKE_M: outer = the cut line; the uniform sew line is not taken for a size',
    );
    ck(
      p?.seamPair?.offsetMm === 10 && c.dxf.seamPairMm === 10,
      'YOKE_M: reported as a cut line + sew line pair (10 mm)',
      JSON.stringify(p?.seamPair ?? null),
    );
    ck(seg.sizes.length === 1, 'YOKE_M closes because the drawing names ONE size (M)');
  });
  refused('STACK_M', 3);
  refused('WIDE_M', 2);
  const fam = fast?.families.find((f) => f.candidates.some((c) => c.dxf.block === 'BACK_M'));
  ck(
    !!fast?.sheet.warnings.some((w) => /several outlines/.test(w)),
    'segmentation warns about the refused blocks',
    fast?.sheet.warnings.find((w) => /several outlines/.test(w)) ?? '',
  );
  ck(!!fam, 'BACK_M family present (refused, not dropped)');
}

console.log('\n# fixture: an outline + a sew line alike, the drawing names two sizes');
{
  const { seg, fast } = await m.fastPathOf('two-sizes.dxf', enc(fixtureDxf('two-sizes')));
  ck(seg.sizes.length === 2, 'the blocks name two sizes', seg.sizes.map((z) => z.token).join(' '));
  const cs = (fast?.families ?? []).flatMap((f) => f.candidates);
  ck(
    cs.length === 2 && cs.every((c) => c.outcome === 'refused' && c.outer.length === 0),
    'PANEL_S / PANEL_M: refused (the pair may be the two sizes)',
    cs.map((c) => `${c.dxf.block}=${c.outcome}`).join(' '),
  );
}

console.log('\n# fixture: a centred pocket graded +4 mm (2 mm all round), no size named');
{
  const { seg, fast } = await m.fastPathOf('no-size.dxf', enc(fixtureDxf('no-size')));
  const c = (fast?.families ?? [])
    .flatMap((f) => f.candidates)
    .find((x) => x.dxf.block === 'POCKET');
  const p = seg.pieces.find((x) => x.block === 'POCKET');
  ck(
    !!c && c.outcome === 'refused' && c.outer.length === 0,
    'POCKET: refused while the count is unknown (cut + sew line, or two sizes)',
    `${c?.outcome} seamPair=${JSON.stringify(p?.seamPair ?? null)} nested=${JSON.stringify(p?.nested ?? null)}`,
  );
  const one = c && m.settleSeamPair(c, true);
  const many = c && m.settleSeamPair(c, false);
  ck(
    !!p?.seamPair && one?.outcome === 'closed' && Math.abs(one.areaMm2 - 164 * 184) < 1,
    'POCKET: answered "1 size" → the outer loop with its sew line',
    `${one?.outcome} ${one ? Math.round(one.areaMm2) : '-'} mm²`,
  );
  ck(many?.outcome === 'refused', 'POCKET: any other count → stays refused', many?.outcome);
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
  const pairs = seg.pieces.filter((p) => p.seamPair).length;
  if (pairs)
    console.log(
      `        ${f}: ${pairs} block(s) read as an outline + a sew line alike (sizes: ${seg.sizes.length})`,
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
