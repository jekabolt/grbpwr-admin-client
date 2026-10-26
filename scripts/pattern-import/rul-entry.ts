// PATTERN-IMPORT · RUL — AAMA/ASTM base DXF + grade rule table, both directions. Bundled by rul.mjs.
//   A  the RUL grammar: the D6673 guide's AccuMark example read; writer → reader round trip
//   B  a hand-written base DXF + that table: every size's coordinates exact (rules, curve-point
//      interpolation, a notch following the boundary, ENGLISH units, a layer-5 grade axis)
//   C  refusals (rul-invalid / rul-alone; the F17 binary .rul stays AccuMark)
//   D  the session: DXF + RUL dropped together, zipped together → a DXF run with every size;
//      then the whole wizard path to write with `storage: 'rul'`
//   E  real exports (corpus/rul-real, local only): CLO, Richpeace graded; Grafis refused
//   F  corpus per-size CLO DXFs → base + RUL → expanded back ≤ 0.1 mm, family by family
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { pathToFileURL } from 'node:url';
import {
  expandRul,
  formatRul,
  looksLikeRul,
  packRul,
  parseRul,
  zipRulPair,
  type RulTable,
} from 'lib/pattern-import/adapters/rul';
import { readDxf, segmentDxf } from 'lib/pattern-import/adapters/dxf';
import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { pieceBlocks } from 'lib/pattern-import/adapters/rul/model';
import { isUnsupportedFormat, sniffFormat } from 'lib/pattern-import/adapters/sniff';
import { ImportError } from 'lib/pattern-import/worker/errors';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import type { CardSize, DraftScopeTarget, StageIO, StageName } from 'lib/pattern-import/types';
import { sectionH, sectionShapeKink } from './rulhook-entry';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const OUT = resolve(CORPUS, 'synthetic/rul');
mkdirSync(OUT, { recursive: true });
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);
setRasterPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

let bad = 0;
const check = (c: string, name: string, ok: boolean, got: unknown = '') => {
  if (!ok) bad++;
  const g = typeof got === 'string' ? got : JSON.stringify(got);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c} · ${name}${g ? ` · ${g}` : ''}`);
};
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const ab = (p: string) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const refusal = (f: () => unknown): string => {
  try {
    f();
    return '';
  } catch (e) {
    if (isUnsupportedFormat(e)) return `${e.code}: ${e.detail ?? e.message}`;
    return `OTHER ${e instanceof Error ? e.message : String(e)}`;
  }
};
const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });

// ── A · grammar: the D6673 guide's AccuMark example (DH Patterns, "ePattern ASTM Standard") ───
export const SPEC_RUL = [
  'ASTM/D13Proposal 1 Version: D 6673-04',
  'AUTHOR: GERBER TECHNOLOGY',
  'PRODUCT: ACCUMARK',
  'VERSION: 8.4.1',
  'CREATION DATE: 26-01-2011',
  'CREATION TIME: 13:59',
  'UNITS: METRIC',
  'GRADE RULE TABLE: B9000',
  'NUMBER OF SIZES: 8',
  'SIZE LIST: 34 36 38 40 42 44 46 48',
  'SAMPLE SIZE: 36',
  'RULE: DELTA 1',
  '0.00, 0.00 0.00, 0.00 0.00, 0.00 0.00, 0.00',
  '0.00, 0.00 0.00, 0.00 0.00, 0.00 0.00, 0.00',
  'RULE: DELTA 2',
  '7.00, 0.00 0.00, 0.00 -7.00, 0.00 -14.00, 0.00',
  '-20.00, 0.00 -25.98, 0.00 -31.98, 0.00 -37.98, 0.00',
  'RULE: DELTA 3',
  '-3.00, 0.00 0.00, 0.00 3.00, 0.00 6.00, 0.00',
  '10.00, 0.00 14.00, 0.00 17.98, 0.00 21.98, 0.00',
  'END',
  '',
].join('\r\n');
const SIZES = ['34', '36', '38', '40', '42', '44', '46', '48'];
const R2 = [7, 0, -7, -14, -20, -25.98, -31.98, -37.98];
const R3 = [-3, 0, 3, 6, 10, 14, 17.98, 21.98];

function sectionA(): RulTable {
  const t = parseRul(enc(SPEC_RUL), 'B9000.rul');
  check(
    'A',
    'spec example: 8 sizes, sample 36 at index 1, 3 rules, METRIC = mm',
    t.sizes.join(' ') === SIZES.join(' ') &&
      t.sampleIndex === 1 &&
      t.rules.size === 3 &&
      t.mmPerUnit === 1,
    `${t.sizes.join(' ')} · sample ${t.sample}@${t.sampleIndex} · ${t.rules.size} rules`,
  );
  check(
    'A',
    'rule 2 read in size order',
    t.rules
      .get(2)!
      .map((d) => d.dx)
      .join(',') === R2.join(','),
    t.rules
      .get(2)!
      .map((d) => d.dx)
      .join(','),
  );
  // CLO writes no commas and 4 pairs a line; Grafis no blank after the colon
  const clo = SPEC_RUL.replace(
    'RULE: DELTA 3\r\n-3.00, 0.00 0.00, 0.00 3.00, 0.00 6.00, 0.00',
    'RULE:DELTA 3\r\n   -3.00     0.00     0.00     0.00     3.00     0.00     6.00     0.00',
  )
    .replace('UNITS: METRIC', 'UNITS:METRIC')
    .replace('ASTM/D13Proposal 1', 'ASTM/D13 Proposal 1');
  const tc = parseRul(enc(clo));
  check(
    'A',
    'CLO / Grafis spellings (no commas, no blank after colon)',
    tc.rules
      .get(3)!
      .map((d) => d.dx)
      .join(',') === R3.join(','),
  );
  check(
    'A',
    'AAMA banner accepted',
    parseRul(enc(SPEC_RUL.replace(/^[^\r]*/, 'ANSI/AAMA VERSION:1.0.0'))).rules.size === 3,
  );
  const w = formatRul({
    product: 'p',
    author: 'a',
    date: new Date(0),
    units: 'metric',
    name: 'B9000',
    sizes: t.sizes,
    sample: t.sample,
    rules: t.rules,
  });
  const t2 = parseRul(enc(w));
  const same = [...t.rules].every(([id, ds]) =>
    t2.rules.get(id)!.every((d, i) => d.dx === ds[i].dx && d.dy === ds[i].dy),
  );
  check(
    'A',
    'writer → reader: the same table',
    same && t2.sample === t.sample && t2.sizes.join() === t.sizes.join(),
  );
  check(
    'A',
    'looksLikeRul: text table yes, DXF no',
    looksLikeRul(enc(SPEC_RUL)) && !looksLikeRul(enc('  0\r\nSECTION\r\n')),
  );
  return t;
}

// ── B · a hand-written base DXF ───────────────────────────────────────────────────────────────
// FRONT, drawn in 36: a 200 × 300 box on layer 1, corners A(0,0) #1, B(200,0) #2, C(200,300) #3,
// D(0,300) #2; a curve vertex E(200,150) on B–C with `# -1`; a notch POINT on layer 4 at (100,0)
// (on A–B, no rule: follows the boundary); a drill on layer 13 at (100,150) with #3; a grain LINE
// on layer 7 without rules (stays as drawn); labels; model-space Units / Sample Size.
const T = (layer: string, x: number, y: number, s: string) =>
  `  0\r\nTEXT\r\n  8\r\n${layer}\r\n 10\r\n${x}\r\n 20\r\n${y}\r\n 30\r\n0.0\r\n 40\r\n0.25\r\n  1\r\n${s}\r\n`;
const P = (layer: string, x: number, y: number) =>
  `  0\r\nPOINT\r\n  8\r\n${layer}\r\n 10\r\n${x}\r\n 20\r\n${y}\r\n 30\r\n0.0\r\n`;
const V = (x: number, y: number) =>
  `  0\r\nVERTEX\r\n  8\r\n1\r\n 10\r\n${x}\r\n 20\r\n${y}\r\n 30\r\n0.0\r\n`;
function baseDxf(
  o: {
    units?: string;
    extra?: string;
    size?: string;
    sample?: string;
    texts?: string;
    drill?: string;
  } = {},
) {
  const pts: [number, number][] = [
    [0, 0],
    [200, 0],
    [200, 150],
    [200, 300],
    [0, 300],
  ];
  return [
    '  0\r\nSECTION\r\n  2\r\nHEADER\r\n  9\r\n$ACADVER\r\n  1\r\nAC1009\r\n  0\r\nENDSEC\r\n',
    '  0\r\nSECTION\r\n  2\r\nBLOCKS\r\n',
    '  0\r\nBLOCK\r\n  8\r\n1\r\n  2\r\nFRONT\r\n 70\r\n0\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n  3\r\nFRONT\r\n',
    '  0\r\nPOLYLINE\r\n  8\r\n1\r\n 66\r\n1\r\n 70\r\n1\r\n',
    ...pts.map(([x, y]) => V(x, y)),
    '  0\r\nSEQEND\r\n  8\r\n1\r\n',
    P('2', 0, 0),
    P('2', 200, 0),
    P('3', 200, 150),
    P('2', 200, 300),
    P('2', 0, 300),
    o.texts ??
      [
        T('1', 0, 0, '# 1'),
        T('1', 200, 0, '# 2'),
        T('1', 200, 150, '# -1'),
        T('1', 200, 300, '# 3'),
        T('1', 0, 300, '# 2'),
      ].join(''),
    P('4', 100, 0),
    P('13', 100, 150),
    o.drill ?? T('13', 100, 150, '# 3'),
    '  0\r\nLINE\r\n  8\r\n7\r\n 10\r\n50\r\n 20\r\n50\r\n 30\r\n0.0\r\n 11\r\n50\r\n 21\r\n250\r\n 31\r\n0.0\r\n',
    o.extra ?? '',
    T('1', 20, 280, 'Piece Name: FRONT'),
    T('1', 20, 270, `Size: ${o.size ?? '36'}`),
    T('1', 20, 260, 'Quantity: 1'),
    '  0\r\nENDBLK\r\n  8\r\n1\r\n',
    '  0\r\nENDSEC\r\n',
    '  0\r\nSECTION\r\n  2\r\nENTITIES\r\n',
    '  0\r\nINSERT\r\n  8\r\n1\r\n  2\r\nFRONT\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n',
    T('1', 0, 0, `Units: ${o.units ?? 'METRIC'}`),
    T('1', 0, 0, `Sample Size: ${o.sample ?? '36'}`),
    T('1', 0, 0, 'Grade Rule Table: B9000'),
    '  0\r\nENDSEC\r\n  0\r\nEOF\r\n',
  ].join('');
}

type Blk = {
  cut: { x: number; y: number }[];
  pts: Record<string, { x: number; y: number }[]>;
  grain: { x: number; y: number }[];
};
function blocksOf(text: string): Map<string, Blk> {
  const raw = buildAst(loadDxf(enc(text)).tok.tags);
  const out = new Map<string, Blk>();
  for (const p of pieceBlocks(raw)) {
    const b: Blk = { cut: [], pts: {}, grain: [] };
    for (const m of p.entities) {
      if (m.kind === 'chain' && m.layer === '1') b.cut = m.slots.map((s) => ({ x: s.x, y: s.y }));
      if (m.kind === 'chain' && m.layer === '7') b.grain = m.slots.map((s) => ({ x: s.x, y: s.y }));
      if (m.kind === 'point') (b.pts[m.layer] ??= []).push({ x: m.slots[0].x, y: m.slots[0].y });
    }
    out.set(p.block.name, b);
  }
  return out;
}
const near = (a: { x: number; y: number }, x: number, y: number, tol = 1e-6) =>
  Math.abs(a.x - x) <= tol && Math.abs(a.y - y) <= tol;

async function sectionB(t: RulTable) {
  const dxf = baseDxf();
  writeFileSync(resolve(OUT, 'B9000-FRONT.dxf'), dxf);
  writeFileSync(resolve(OUT, 'B9000-FRONT.rul'), SPEC_RUL);
  const ex = expandRul({ dxf: enc(dxf), dxfName: 'FRONT.dxf', rul: t, rulName: 'B9000.rul' });
  const blocks = blocksOf(ex.text);
  check(
    'B',
    'one block per size, named FRONT_<size>',
    SIZES.every((s) => blocks.has(`FRONT_${s}`)) && blocks.size === 8,
    [...blocks.keys()].join(' '),
  );
  let exact = true;
  let why = '';
  SIZES.forEach((s, i) => {
    const b = blocks.get(`FRONT_${s}`)!;
    const want: [number, number][] = [
      [0, 0],
      [200 + R2[i], 0],
      [200 + (R2[i] + R3[i]) / 2, 150],
      [200 + R3[i], 300],
      [R2[i], 300],
    ];
    want.forEach(([x, y], k) => {
      if (!near(b.cut[k], x, y)) {
        exact = false;
        why ||= `${s} vertex ${k}: ${b.cut[k].x},${b.cut[k].y} ≠ ${x},${y}`;
      }
    });
    // the notch at the middle of A–B follows the boundary: half of B's delta
    if (!near(b.pts['4'][0], 100 + R2[i] / 2, 0)) {
      exact = false;
      why ||= `${s} notch ${JSON.stringify(b.pts['4'][0])}`;
    }
    if (!near(b.pts['13'][0], 100 + R3[i], 150)) {
      exact = false;
      why ||= `${s} drill ${JSON.stringify(b.pts['13'][0])}`;
    }
    if (!near(b.grain[0], 50, 50) || !near(b.grain[1], 50, 250)) {
      exact = false;
      why ||= `${s} grain moved`;
    }
  });
  check(
    'B',
    'every size exact: ruled corners, curve point E interpolated, notch follows A–B, drill by its rule, grain as drawn',
    exact,
    why || `stats ${JSON.stringify(ex.stats)}`,
  );
  check(
    'B',
    'warnings say what was interpolated / left',
    ex.warnings.some((w) => /interpolation/.test(w)),
    ex.warnings.join(' | '),
  );
  writeFileSync(resolve(OUT, 'B9000-FRONT.expanded.dxf'), ex.text);
  // the importer's own reader sees 8 sizes of one piece
  const read = await readDxf(
    { id: '0', name: 'FRONT.dxf', bytes: enc(ex.text) },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  check(
    'B',
    'readDxf + segmentDxf: presegmented, 8 sizes, 1 identity',
    seg.presegmented && seg.sizes.length === 8 && seg.identities.length === 1,
    `${seg.sizes.map((s) => s.token).join(' ')} · ${seg.identities.length} identities · units ${read.meta.units.evidence}`,
  );

  // ENGLISH: the same table in inches against a DXF in inches
  const eng = parseRul(enc(SPEC_RUL.replace('UNITS: METRIC', 'UNITS: ENGLISH')));
  const exE = expandRul({
    dxf: enc(baseDxf({ units: 'ENGLISH' })),
    dxfName: 'FRONT-in.dxf',
    rul: eng,
    rulName: 'B9000-in.rul',
  });
  const bE = blocksOf(exE.text).get('FRONT_48')!;
  check(
    'B',
    'ENGLISH table on an ENGLISH DXF: deltas in drawing units',
    near(bE.cut[1], 200 - 37.98, 0),
    JSON.stringify(bE.cut[1]),
  );
  // METRIC table on an inch DXF: deltas converted (mm → inch)
  const exM = expandRul({
    dxf: enc(baseDxf({ units: 'ENGLISH' })),
    dxfName: 'FRONT-in.dxf',
    rul: t,
    rulName: 'B9000.rul',
  });
  const bM = blocksOf(exM.text).get('FRONT_48')!;
  check(
    'B',
    'METRIC table on an inch DXF: mm deltas → inches',
    near(bM.cut[1], 200 - 37.98 / 25.4, 0),
    JSON.stringify(bM.cut[1]),
  );
  // a layer-5 grade reference line pointing +y: the table's dx runs along +y
  const L5 =
    '  0\r\nLINE\r\n  8\r\n5\r\n 10\r\n-10\r\n 20\r\n0\r\n 30\r\n0.0\r\n 11\r\n-10\r\n 21\r\n100\r\n 31\r\n0.0\r\n';
  const exR = expandRul({
    dxf: enc(baseDxf({ extra: L5 })),
    dxfName: 'FRONT-axis.dxf',
    rul: t,
    rulName: 'B9000.rul',
  });
  const bR = blocksOf(exR.text).get('FRONT_48')!;
  check(
    'B',
    'layer-5 grade axis at 90°: dx is applied along +y',
    near(bR.cut[1], 200, -37.98),
    JSON.stringify(bR.cut[1]),
  );
}

// ── C · refusals ───────────────────────────────────────────────────────────────────────────────
function sectionC(t: RulTable) {
  const R = (s: string) => () => parseRul(enc(s), 'x.rul');
  const cases: [string, () => unknown, RegExp][] = [
    ['no banner', R(SPEC_RUL.replace(/^[^\r]*\r\n/, '')), /banner/],
    ['no UNITS', R(SPEC_RUL.replace('UNITS: METRIC\r\n', '')), /UNITS/],
    [
      'unknown UNITS',
      R(SPEC_RUL.replace('UNITS: METRIC', 'UNITS: CM')),
      /neither METRIC nor ENGLISH/,
    ],
    [
      'NUMBER OF SIZES ≠ list',
      R(SPEC_RUL.replace('NUMBER OF SIZES: 8', 'NUMBER OF SIZES: 7')),
      /NUMBER OF SIZES says 7/,
    ],
    [
      'sample not in list',
      R(SPEC_RUL.replace('SAMPLE SIZE: 36', 'SAMPLE SIZE: 50')),
      /not in the SIZE LIST/,
    ],
    [
      'rule with 7 pairs',
      R(SPEC_RUL.replace('-37.98, 0.00\r\nRULE: DELTA 3', '\r\nRULE: DELTA 3')),
      /rule 2 has 7 dx,dy pairs/,
    ],
    [
      'odd number count',
      R(SPEC_RUL.replace('-37.98, 0.00\r\nRULE: DELTA 3', '-37.98\r\nRULE: DELTA 3')),
      /odd count/,
    ],
    [
      'garbage in a rule',
      R(SPEC_RUL.replace('7.00, 0.00 0.00', '7.00, abc 0.00')),
      /not a list of dx,dy/,
    ],
    ['rule defined twice', R(SPEC_RUL.replace('RULE: DELTA 3', 'RULE: DELTA 2')), /defined twice/],
    [
      'sample row not 0,0 (Grafis-like)',
      R(SPEC_RUL.replace('7.00, 0.00 0.00, 0.00 -7.00', '7.00, 0.00 1.00, 0.00 -7.00')),
      /moves the sample size/,
    ],
    [
      'a non-sample size listed twice',
      R(SPEC_RUL.replace('SIZE LIST: 34 36 38 40', 'SIZE LIST: 34 36 38 38')),
      /twice/,
    ],
    [
      'binary bytes',
      () => parseRul(new Uint8Array([1, 2, 3, 0, 200]).buffer as ArrayBuffer, 'x.rul'),
      /binary/,
    ],
    [
      'rule missing from the table',
      () =>
        expandRul({
          dxf: enc(
            baseDxf({
              texts: [
                T('1', 0, 0, '# 1'),
                T('1', 200, 0, '# 9'),
                T('1', 200, 300, '# 3'),
                T('1', 0, 300, '# 2'),
              ].join(''),
            }),
          ),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /#9 that B9000.rul does not define/,
    ],
    [
      'rule text at no point',
      () =>
        expandRul({
          dxf: enc(
            baseDxf({
              texts: [T('1', 0, 0, '# 1'), T('1', 201, 0, '# 2'), T('1', 200, 300, '# 3')].join(''),
            }),
          ),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /is at no point/,
    ],
    [
      'two rules at one point',
      () =>
        expandRul({
          dxf: enc(
            baseDxf({
              texts: [T('1', 0, 0, '# 1'), T('1', 0, 0, '# 2'), T('1', 200, 300, '# 3')].join(''),
            }),
          ),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /sit at one point/,
    ],
    [
      'no rule texts at all',
      () =>
        expandRul({
          dxf: enc(baseDxf({ texts: '', drill: '' })),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /no grade-rule numbers/,
    ],
    [
      'DXF drawn in another size',
      () =>
        expandRul({
          dxf: enc(baseDxf({ size: '40' })),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /drawn in size 40/,
    ],
    [
      'DXF says another sample',
      () =>
        expandRul({
          dxf: enc(baseDxf({ sample: '38' })),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /SAMPLE SIZE: 38/,
    ],
    [
      'non-integer rule id',
      () =>
        expandRul({
          dxf: enc(baseDxf({ texts: [T('1', 0, 0, '# A1'), T('1', 200, 300, '# 3')].join('') })),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /does not name an integer rule/,
    ],
    [
      'two layer-5 axes disagree',
      () =>
        expandRul({
          dxf: enc(
            baseDxf({
              extra:
                '  0\r\nLINE\r\n  8\r\n5\r\n 10\r\n0\r\n 20\r\n0\r\n 11\r\n0\r\n 21\r\n10\r\n  0\r\nLINE\r\n  8\r\n5\r\n 10\r\n0\r\n 20\r\n0\r\n 11\r\n10\r\n 21\r\n0\r\n',
            }),
          ),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /point different ways/,
    ],
  ];
  cases.push(
    [
      'DXF names another grade rule table',
      () =>
        expandRul({
          dxf: enc(baseDxf().replace('Grade Rule Table: B9000', 'Grade Rule Table: SLEEVES')),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /not one export/,
    ],
    [
      'table defines rule -1',
      () =>
        expandRul({
          dxf: enc(baseDxf()),
          dxfName: 'f.dxf',
          rul: parseRul(enc(SPEC_RUL.replace('RULE: DELTA 1', 'RULE: DELTA -1'))),
          rulName: 'B9000.rul',
        }),
      /defines rule -1/,
    ],
    [
      'label-less blocks in two sizes',
      () =>
        expandRul({
          dxf: enc(
            baseDxf()
              .replace(/Size: 36/, 'Note: x')
              .replace(/FRONT/g, 'FRONT_36')
              .replace(
                '  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nENTITIES',
                (m) =>
                  baseDxf()
                    .split('  0\r\nSECTION\r\n  2\r\nBLOCKS\r\n')[1]
                    .split('  0\r\nENDSEC\r\n')[0]
                    .replace(/Size: 36/, 'Note: x')
                    .replace(/FRONT/g, 'FRONT_38') + m,
              )
              .replace(
                '  0\r\nENDSEC\r\n  0\r\nEOF',
                '  0\r\nINSERT\r\n  8\r\n1\r\n  2\r\nFRONT_38\r\n 10\r\n0\r\n 20\r\n0\r\n  0\r\nENDSEC\r\n  0\r\nEOF',
              ),
          ),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /names sizes/,
    ],
    [
      'unruled point on two graded lines that disagree',
      () =>
        expandRul({
          // two layer-8 lines cross at (100,100): one graded by #2 (x), one by #3 (x, other row)
          dxf: enc(
            baseDxf({
              extra:
                '  0\r\nLINE\r\n  8\r\n8\r\n 10\r\n0\r\n 20\r\n100\r\n 11\r\n200\r\n 21\r\n100\r\n' +
                T('8', 0, 100, '# 2') +
                T('8', 200, 100, '# 2') +
                '  0\r\nLINE\r\n  8\r\n8\r\n 10\r\n100\r\n 20\r\n0\r\n 11\r\n100\r\n 21\r\n200\r\n' +
                T('8', 100, 200, '# 3') +
                P('13', 100, 100),
              drill: '',
            }).replace(T('8', 100, 200, '# 3'), T('8', 100, 200, '# 3') + T('8', 100, 0, '# 2')),
          ),
          dxfName: 'f.dxf',
          rul: t,
          rulName: 'B9000.rul',
        }),
      /move it differently/,
    ],
  );
  for (const [what, f, re] of cases) {
    const r = refusal(f);
    check('C', `refused: ${what}`, r.startsWith('rul-invalid') && re.test(r), r.slice(0, 160));
  }
  // a DXF that already holds several sizes
  const two = baseDxf()
    .replace(
      '  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nENTITIES',
      baseDxf({ size: '38' })
        .split('  0\r\nSECTION\r\n  2\r\nBLOCKS\r\n')[1]
        .split('  0\r\nENDSEC\r\n')[0]
        .replace(/FRONT/g, 'FRONT_38') + '  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nENTITIES',
    )
    .replace(
      '  0\r\nENDSEC\r\n  0\r\nEOF',
      '  0\r\nINSERT\r\n  8\r\n1\r\n  2\r\nFRONT_38\r\n 10\r\n0\r\n 20\r\n0\r\n  0\r\nENDSEC\r\n  0\r\nEOF',
    );
  const r2 = refusal(() =>
    expandRul({ dxf: enc(two), dxfName: 'two.dxf', rul: t, rulName: 'B9000.rul' }),
  );
  check(
    'C',
    'refused: a DXF that already holds 2 sizes',
    /already holds 2 sizes/.test(r2),
    r2.slice(0, 140),
  );
  // F17: the AccuMark binary rule table keeps its refusal; a text table alone is told what to add
  const f17 = resolve(CORPUS, 'synthetic/f17/GRADE.rul');
  if (existsSync(f17)) {
    const sn = sniffFormat(ab(f17), 'GRADE.rul');
    check(
      'C',
      'binary GRADE.rul (F17) stays gerber-accumark, not a text table',
      sn.route === null && sn.refusal === 'gerber-accumark' && !looksLikeRul(ab(f17)),
      sn.route === null ? sn.refusal : sn.route,
    );
  }
  const sn = sniffFormat(enc(SPEC_RUL), 'B9000.rul');
  check(
    'C',
    'a text RUL alone sniffs as rul-alone',
    sn.route === null && sn.refusal === 'rul-alone',
    sn.route === null ? sn.refusal : sn.route,
  );
}

// ── D · the session ────────────────────────────────────────────────────────────────────────────
const crcT = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(entries: [string, string][]): ArrayBuffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of entries) {
    const body = Buffer.from(text, 'latin1');
    const data = deflateRawSync(body);
    const nm = Buffer.from(name, 'utf8');
    const crc = crc32(body);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(body.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(body.length, 24);
    ch.writeUInt16LE(nm.length, 28);
    ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data);
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(off, 16);
  const b = Buffer.concat([...locals, cd, eocd]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
const MAIN: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: '',
  label: 'main',
  isInterlining: false,
};
const card = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));
/** extract → scale → assemble → chains → sizes, as the wizard runs a DXF. */
async function toSizes(s: Session, tokens: string[]) {
  const c = ctx();
  const ex = await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, c);
  await s.runStage(
    'scale',
    {
      decision: {
        factor: ex.scale[0]?.factor ?? 1,
        method: ex.scale[0]?.method ?? 'declared',
        operatorConfirmed: false,
      },
    },
    c,
  );
  await s.runStage('assemble', { sheet: 0 }, c);
  await s.runStage('chains', { opts: { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 } }, c);
  const sz = await s.runStage('sizes', { card: card(tokens) }, c);
  return { ex, sz };
}
const sessionErr = (files: { name: string; bytes: ArrayBuffer }[]) => {
  try {
    new Session(1, files);
    return '';
  } catch (e) {
    return e instanceof ImportError ? `${e.code}: ${e.message}` : String(e);
  }
};

async function sectionD() {
  const dxf = baseDxf();
  const pair = [
    { name: 'FRONT.dxf', bytes: enc(dxf) },
    { name: 'B9000.rul', bytes: enc(SPEC_RUL) },
  ];
  for (const [what, files] of [
    ['DXF + RUL dropped together', pair],
    ['RUL first, then the DXF', [pair[1], pair[0]]],
    [
      'one ZIP holding both',
      [
        {
          name: 'front.zip',
          bytes: zip([
            ['FRONT/FRONT.dxf', dxf],
            ['FRONT/B9000.rul', SPEC_RUL],
            ['__MACOSX/._x', 'x'],
          ]),
        },
      ],
    ],
  ] as const) {
    const s = new Session(1, [...files]);
    const run = <S extends StageName>(st: S, input: StageIO[S]['in']) =>
      s.runStage(st, input, ctx());
    const { ex, sz } = await toSizes(s, SIZES);
    const mapped = sz.map.entries.filter((e) => e.card).map((e) => e.card!.token);
    check(
      'D',
      `${what}: a DXF run, presegmented, all 8 sizes mapped`,
      ex.presegmented === true && mapped.length === 8,
      `${mapped.join(' ')} · ${ex.warnings.filter((w) => /graded by/.test(w)).join('')}`,
    );
    if (what !== 'DXF + RUL dropped together') {
      s.close();
      continue;
    }
    // the wizard path to the write stage, with the RUL storage option
    await run('pieces', { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } });
    const sem = await run('semantics', {
      fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
      pieceOverrides: {},
      operatorGrain: {},
    });
    const w = await run('write', {
      techCardId: 1,
      scopes: [MAIN],
      assignment: {
        byPurpose: { [MAIN.scopeKey]: [...new Set(sem.pieces.map((p) => p.seed))] },
        interliningInBom: false,
        proposals: [],
      },
      sizes: sz.map.entries.flatMap((e) =>
        e.card
          ? [
              {
                token: e.card.token,
                sizeId: e.card.sizeId,
                name: e.card.name,
                sourceLabel: e.source.label,
                rank: e.source.rank,
              },
            ]
          : [],
      ),
      dialect: 'r12',
      generator: 'probe',
      storage: 'rul',
    });
    const r = w.scopes[0]?.rul;
    check(
      'D',
      'write storage rul: per-size DXF stays the file, base + RUL packed and proved',
      !!r && r.ok && /SIZE|Size/.test(w.scopes[0].dxfText),
      r
        ? r.ok
          ? `base ${r.base} · ${r.rules} rules · max ${r.maxErrMm.toExponential(1)} mm · ${r.dxfFilename} + ${r.rulFilename}`
          : r.reasons.join(' | ')
        : 'no rul',
    );
    if (r?.ok) {
      writeFileSync(resolve(OUT, 'roundtrip-' + r.dxfFilename), r.dxfText);
      writeFileSync(resolve(OUT, 'roundtrip-' + r.rulFilename), r.rulText);
      // our own package imports again: the same 8 sizes
      const s2 = new Session(2, [
        { name: r.dxfFilename, bytes: enc(r.dxfText) },
        { name: r.rulFilename, bytes: enc(r.rulText) },
      ]);
      const { ex: ex2, sz: sz2 } = await toSizes(s2, SIZES);
      check(
        'D',
        'our base + RUL reads back as 8 sizes',
        ex2.presegmented === true && sz2.map.entries.filter((e) => e.card).length === 8,
        sz2.map.entries.map((e) => e.source.label).join(' '),
      );
      s2.close();
    }
    const w2 = await run('write', {
      techCardId: 1,
      scopes: [MAIN],
      assignment: {
        byPurpose: { [MAIN.scopeKey]: [...new Set(sem.pieces.map((p) => p.seed))] },
        interliningInBom: false,
        proposals: [],
      },
      sizes: sz.map.entries.flatMap((e) =>
        e.card
          ? [
              {
                token: e.card.token,
                sizeId: e.card.sizeId,
                name: e.card.name,
                sourceLabel: e.source.label,
                rank: e.source.rank,
              },
            ]
          : [],
      ),
      dialect: 'r12',
      generator: 'probe',
    });
    check(
      'D',
      'write without storage: no rul package',
      w2.scopes.every((x) => x.rul === undefined),
    );
    s.close();
  }
  const e1 = sessionErr([{ name: 'B9000.rul', bytes: enc(SPEC_RUL) }]);
  check(
    'D',
    'a RUL alone: refused, says to add its DXF',
    /unsupported-format/.test(e1) && /base-size DXF/.test(e1),
    e1.slice(0, 160),
  );
  const e2 = sessionErr([...pair, { name: 'other.dxf', bytes: enc(dxf) }]);
  check(
    'D',
    'a RUL with two DXFs: refused',
    /unsupported-format/.test(e2) && /grade rule table/.test(e2),
    e2.slice(0, 160),
  );
  const e3 = sessionErr([pair[1], { name: 'x.rul', bytes: enc(SPEC_RUL) }, pair[0]]);
  check(
    'D',
    'two RULs: refused',
    /one grade rule table grades one base DXF/.test(e3),
    e3.slice(0, 120),
  );
  const s4 = new Session(1, [
    pair[0],
    { name: 'B9000.rul', bytes: enc(SPEC_RUL.replace('RULE: DELTA 3', 'RULE: DELTA 4')) },
  ]);
  let e4 = '';
  try {
    await s4.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx());
  } catch (e) {
    e4 = e instanceof ImportError ? `${e.code}: ${e.message}` : String(e);
  }
  check(
    'D',
    'a rule the table lacks: the read stage refuses the run (no partial grade)',
    /unsupported-format/.test(e4) && /#3/.test(e4),
    e4.slice(0, 200),
  );
  // the DXF alone: today's behaviour, one size
  const s5 = new Session(1, [pair[0]]);
  const { sz: sz5 } = await toSizes(s5, SIZES);
  check(
    'D',
    'the base DXF alone: one size, as before',
    sz5.map.entries.length === 1,
    sz5.map.entries.map((e) => e.source.label).join(' '),
  );
}

// ── E · real exports (local only) ──────────────────────────────────────────────────────────────
async function sectionE() {
  const dir = resolve(CORPUS, 'rul-real');
  if (!existsSync(dir)) {
    console.log('skip  E · corpus/rul-real not present');
    return;
  }
  const cases: [string, string, string, number | null][] = [
    ['CLO', 'W_SS_Graded.dxf', 'W_SS_Graded.rul', 6],
    ['Richpeace (ENGLISH)', 'S350.dxf', 'S350.rul', 9],
    ['Grafis (repeated sample breakpoint)', 'neay.dxf', 'neay.rul', 14],
  ];
  for (const [who, d, r, n] of cases) {
    const go = async () => {
      const t = parseRul(ab(resolve(dir, r)), r);
      const ex = expandRul({ dxf: ab(resolve(dir, d)), dxfName: d, rul: t, rulName: r });
      const read = await readDxf(
        { id: '0', name: d, bytes: enc(ex.text) },
        { sagittaMm: 0.05, keepFills: true },
      );
      const seg = segmentDxf(read);
      return { ex, seg };
    };
    if (n === null) {
      let msg = '';
      try {
        await go();
      } catch (e) {
        msg = isUnsupportedFormat(e) ? `${e.code}: ${e.detail}` : String(e);
      }
      check('E', `${who}: refused`, msg.startsWith('rul-invalid'), msg.slice(0, 160));
      continue;
    }
    try {
      const { ex, seg } = await go();
      check(
        'E',
        `${who}: graded, read as ${n} sizes`,
        seg.presegmented && seg.sizes.length === n,
        `${seg.sizes.map((s) => s.token).join(' ')} · ${seg.identities.length} identities · ${JSON.stringify({ ...ex.stats, ungradedPieces: ex.stats.ungradedPieces.length })} · ${ex.warnings.join(' | ').slice(0, 300)}`,
      );
      if (who.startsWith('Grafis')) {
        check(
          'E',
          `${who}: every piece expands in every logical size`,
          ex.blocks.length === ex.stats.pieces * ex.sizes.length,
          `${ex.blocks.length}/${ex.stats.pieces * ex.sizes.length} piece-size blocks`,
        );
        continue;
      }
      // areas grow away from the sample (sign sanity on real data)
      const area = (pts: { x: number; y: number }[]) =>
        Math.abs(
          pts.reduce((a, p, i) => {
            const q = pts[(i + 1) % pts.length];
            return a + p.x * q.y - q.x * p.y;
          }, 0) / 2,
        );
      const blocks = blocksOf(ex.text);
      const sizes = ex.sizes;
      let mono = 0;
      let tot = 0;
      for (const stem of new Set(Object.values(ex.pieces))) {
        const a = sizes
          .map((s) => blocks.get(`${stem}_${s.replace(/[\s_]+/g, '-')}`)?.cut ?? [])
          .map((c) => (c.length > 2 ? area(c) : 0));
        if (a.some((x) => !x)) continue;
        tot++;
        if (a.every((x, i) => i === 0 || x >= a[i - 1] - 1e-6)) mono++;
      }
      check(
        'E',
        `${who}: cut areas grow with the size (sign / units sanity)`,
        tot > 0 && mono === tot,
        `${mono}/${tot} pieces monotone`,
      );
    } catch (e) {
      check(
        'E',
        `${who}: graded`,
        false,
        isUnsupportedFormat(e) ? `${e.code}: ${e.detail}` : String(e),
      );
    }
  }
}

// ── F · corpus per-size DXFs → base + RUL → back ───────────────────────────────────────────────
async function sectionF() {
  const files: [string, string[]][] = [
    ['dxf-clo/summer men.dxf', ['XS', 'S', 'M', 'L', 'XL']],
    ['dxf-clo/summer men_ganjubas_gerber.dxf', ['XS', 'S', 'M', 'L', 'XL']],
    ['dxf-clo/ALLSIZES_DXF.dxf', ['XS', 'S', 'M', 'L', 'XL']],
    ['dxf-clo/Allsizes_with_notches.dxf', ['XS', 'S', 'M', 'L', 'XL']],
  ];
  const summary: string[] = [];
  for (const [rel, sizes] of files) {
    const bytes = ab(resolve(CORPUS, rel));
    const all = packRul(bytes, { sizes, name: 'probe', now: new Date(0) });
    const refusedPieces = new Set(
      all.ok ? [] : all.reasons.map((r) => r.split(':')[0].split(' ')[0]),
    );
    const raw = buildAst(loadDxf(bytes).tok.tags);
    const stems = [
      ...new Set(pieceBlocks(raw).map((p) => p.block.name.split('_').slice(0, -1).join('_'))),
    ];
    const okStems = stems.filter((s) => !refusedPieces.has(s) && !/^Space/i.test(s));
    let line = `${rel}: ${stems.length} families, whole file ${all.ok ? 'PACKED' : `refused (${all.reasons.length} reasons, e.g. "${all.reasons[0]}")`}`;
    if (okStems.length) {
      const part = packRul(bytes, {
        sizes,
        name: 'probe',
        now: new Date(0),
        pick: (p) => okStems.includes(p),
      });
      line += ` · gradable families ${okStems.length}: ${part.ok ? `packed, ${part.rules} rules, max ${part.maxErrMm.toExponential(1)} mm` : `REFUSED ${part.reasons.slice(0, 2).join(' | ')}`}`;
      check(
        'F',
        `${rel}: the point-for-point families pack and expand back ≤ 0.1 mm`,
        part.ok && part.maxErrMm <= 0.1,
        part.ok
          ? `${okStems.join(',')} · ${part.rules} rules`
          : part.reasons.slice(0, 3).join(' | '),
      );
      if (part.ok) {
        const stem = rel
          .split('/')
          .pop()!
          .replace(/\.dxf$/, '')
          .replace(/\s+/g, '-');
        writeFileSync(resolve(OUT, `${stem}.base.dxf`), part.baseDxf);
        writeFileSync(resolve(OUT, `${stem}.rul`), part.rulText);
        // and the package imports through the session as every size
        const s = new Session(1, [
          { name: `${stem}.base.dxf`, bytes: enc(part.baseDxf) },
          { name: `${stem}.rul`, bytes: enc(part.rulText) },
        ]);
        const { ex, sz } = await toSizes(s, sizes);
        check(
          'F',
          `${rel}: base + RUL imports as ${sizes.length} sizes`,
          ex.presegmented === true && sz.map.entries.filter((e) => e.card).length === sizes.length,
          sz.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}`).join(' '),
        );
        s.close();
      }
    } else line += ' · no family is point-for-point';
    if (!all.ok) for (const r of all.reasons.slice(0, 12)) line += `\n      - ${r}`;
    summary.push(line);
  }
  // the product path: the per-size DXF imported, written by our writer with `storage: 'rul'`
  for (const [rel, sizes] of files) {
    const s = new Session(1, [{ name: rel.split('/').pop()!, bytes: ab(resolve(CORPUS, rel)) }]);
    const { sz } = await toSizes(s, sizes);
    await s.runStage(
      'pieces',
      { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } },
      ctx(),
    );
    const sem = await s.runStage(
      'semantics',
      {
        fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
        pieceOverrides: {},
        operatorGrain: {},
      },
      ctx(),
    );
    const w = await s.runStage(
      'write',
      {
        techCardId: 1,
        scopes: [MAIN],
        assignment: {
          byPurpose: { [MAIN.scopeKey]: [...new Set(sem.pieces.map((p) => p.seed))] },
          interliningInBom: false,
          proposals: [],
        },
        sizes: sz.map.entries.flatMap((e) =>
          e.card
            ? [
                {
                  token: e.card.token,
                  sizeId: e.card.sizeId,
                  name: e.card.name,
                  sourceLabel: e.source.label,
                  rank: e.source.rank,
                },
              ]
            : [],
        ),
        dialect: 'r12',
        generator: 'probe',
        storage: 'rul',
      },
      ctx(),
    );
    const r = w.scopes[0]?.rul;
    const line = `${rel} → our writer → rul: ${!r ? 'none' : r.ok ? `PACKED base ${r.base}, ${r.rules} rules, max ${r.maxErrMm.toExponential(1)} mm` : `refused (${r.reasons.length}): ${r.reasons.slice(0, 4).join(' | ')}`}`;
    summary.push(line);
    // a refusal is a correct answer when it names why; a package must be proved
    check(
      'F',
      `${rel}: write storage rul answers (package ≤ 0.1 mm or reasons)`,
      !!r && (r.ok ? r.maxErrMm <= 0.1 : r.reasons.length > 0),
      line.slice(0, 220),
    );
    if (r?.ok) {
      const stem = rel
        .split('/')
        .pop()!
        .replace(/\.dxf$/, '')
        .replace(/\s+/g, '-');
      writeFileSync(resolve(OUT, `${stem}.written-base.dxf`), r.dxfText);
      writeFileSync(resolve(OUT, `${stem}.written.rul`), r.rulText);
    }
    s.close();
  }
  console.log('\nF · per-file summary');
  for (const l of summary) console.log(`  ${l}`);
}

export async function main(): Promise<number> {
  const t = sectionA();
  await sectionB(t);
  sectionC(t);
  await sectionD();
  await sectionE();
  await sectionF();
  // RULHOOK: the storage choice through the real wizard hook
  await sectionH({
    check,
    dxf: baseDxf(),
    rul: SPEC_RUL,
    sizes: SIZES,
    kombinezon: process.env.RULHOOK_KOMBINEZON ?? resolve(CORPUS, 'rul-real/kombinezon-main.dxf'),
  });
  // SHAPE-KINK: the check step's fixShape / dropSize through the real hook (automatic repairs off)
  if (!process.env.RUL_SKIP_SHAPEKINK) {
    const env = {
      PLACE_MARKS_OFF: process.env.PLACE_MARKS_OFF,
      SHAPE_KINK_OFF: process.env.SHAPE_KINK_OFF,
    };
    process.env.PLACE_MARKS_OFF = '1';
    process.env.SHAPE_KINK_OFF = '1';
    try {
      await sectionShapeKink({ check, pdf: resolve(CORPUS, 'pdf/kombinezon.pdf') });
    } finally {
      for (const [k, v] of Object.entries(env))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  }
  // zip helper sanity (a ZIP of a DXF + a binary .rul is not a pair)
  check(
    'Z',
    'ZIP with an AccuMark binary .rul is not a pair',
    zipRulPair(
      zip([
        ['a.dxf', baseDxf()],
        ['a.rul', '\u0001\u0002binary'],
      ]),
    ) === null,
  );
  console.log(`\nrul: ${bad ? `${bad} FAIL` : 'all PASS'}`);
  return bad ? 1 : 0;
}
