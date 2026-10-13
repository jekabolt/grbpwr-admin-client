// PATTERN-IMPORT · LEGEND probe (MOOD-F1, auto/MOOD-DIAG.md §4 Ф1) — the drawing's own size key
// read whole: every printed label, one pen sample per label, the samples drawn alike told apart.
//   1 crafted tokens (R8): «00» one step below «0», «000» below it; paired sizes «0/2» «00-0»
//     «28/30» «30-32» keep their spelling and take the lower value; inch fractions and ranges are
//     no size; a printed key «SIZE 00 … SIZE 32» is one run of 18 in order
//   1b paired sizes onto the card (archive run 13.10, «4/6» → 46): a paired sheet size never meets
//     the single card size its digits concatenate to (4/6 ≠ 46, 2-4 ≠ 24, 10/12 ≠ 1012, 00-0 ≠ 000)
//     nor its lower half; it meets the same pair spelled either way (4/6 ↔ 4-6); the DXF size tail
//     keeps the pair; a partial map with card sizes still free is the sizes step's question
//   2 the Mood sample through the worker session (extract → clean → scale → assemble → chains): the
//     size rows read == the printed key, label for label, in order (R1: the key printed in two
//     columns is one key); every label has its pen sample in the key (R6: a sample that starts
//     with a dot, or is a row of separate filled marks, too) at ≤ 2 mm from its label; keys whose
//     samples look alike (S / L: one rhythm of triangles and dots) are told apart by element order
//     or dot size on ≥ half their lines (R7) — or asked, never silently
// The PDFs are read from the archive (never written); a file not there is reported and skipped.
//   node scripts/pattern-import/legend.mjs [sample ids]      (yarn patimport:legend)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { parseSizeToken, runsInText } from 'lib/pattern-import/sizes';
import {
  crossKindQuestion,
  defaultTokensOf,
  sizeKindOf,
  drawnUnmapped,
  partialSizeMapQuestion,
  proposeSizeMap,
  sizeKey,
} from 'lib/pattern-import/sizes/map';
import { bareSize } from 'lib/pattern-import/adapters/dxf';
import { applyLegend, mergeSameSize, splitRows } from 'lib/pattern-import/chains';
import {
  PATIMPORT,
  type CardSize,
  type ChainSet,
  type ClassEvidence,
  type SizeRun,
  type StageIO,
  type StageName,
} from 'lib/pattern-import/types';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const ARCHIVE = process.env.PATIMPORT_ARCHIVE ?? '/Users/jekabolt/Downloads/archive 600 pcs/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadGuarded = () => (import(LEGACY) as Promise<PdfjsModule>).then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) fails++;
};

// ── 1 · tokens ──────────────────────────────────────────────────────────────────────────────
function tokens() {
  const t = (s: string) => parseSizeToken(s, true);
  const v = (s: string) => t(s)?.value ?? null;
  check('«00» is one step below «0»', v('00') === -2 && v('0') === 0, `${v('00')} / ${v('0')}`);
  check('«000» is below «00»', v('000') === -4, String(v('000')));
  check('«SIZE 00» reads 00', parseSizeToken('SIZE 00')?.label === '00');
  for (const [s, label, value] of [
    ['0/2', '0/2', 0],
    ['00-0', '00-0', -2],
    ['28/30', '28/30', 28],
    ['30-32', '30-32', 30],
    ['2-4', '2-4', 2],
    ['48/50', '48/50', 48],
  ] as const) {
    const k = t(s);
    check(
      `paired «${s}» = one size, label as printed, value the lower`,
      k?.label === label && k.value === value && k.kind === 'num',
      JSON.stringify(k),
    );
  }
  for (const s of ['1/2', '3/4', '5/8', '1/4', '36-46', '1-3', '0/4', '4/2'])
    check(`«${s}» is no size`, t(s) === null, JSON.stringify(t(s)));
  // no two of a key collide
  const key = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String(2 + 2 * i))];
  const vals = key.map(v);
  check(
    'key 00 … 32: 18 distinct values in order',
    new Set(vals).size === 18 && vals.every((x, i) => !i || x! > vals[i - 1]!),
  );
  const paired = ['00-0', '2-4', '6-8', '10-12', '14-16', '18-20', '22-24', '26-28', '30-32'];
  const pv = paired.map(v);
  check(
    'paired key 00-0 … 30-32: 9 distinct values in order',
    pv.every((x, i) => x != null && (!i || x > pv[i - 1]!)),
    pv.join(','),
  );
  const legend = runsInText(key.map((k) => `SIZE ${k}`)).find((r) => r.kind === 'legend');
  check(
    'printed «SIZE 00 … SIZE 32» = one run of 18, 00 first',
    legend?.labels.join(',') === key.join(','),
    legend?.labels.join(','),
  );
}

// ── 1b · paired sizes onto the card ─────────────────────────────────────────────────────────
function pairedOntoCard() {
  for (const [a, b] of [
    ['4/6', '46'],
    ['2-4', '24'],
    ['10/12', '1012'],
    ['00-0', '000'],
    ['28/30', '2830'],
    ['1/2', '12'],
    ['36.5', '365'],
    ['3-4Y', '34Y'],
  ])
    check(`key «${a}» ≠ «${b}»`, sizeKey(a) !== sizeKey(b), `${sizeKey(a)} / ${sizeKey(b)}`);
  for (const [a, b] of [
    ['4/6', '4/6'],
    ['4-6', '4/6'],
    ['4 – 6', '4/6'],
    ['00-0', '00/0'],
    ['<M>', 'm'],
    ['2XL', '2xl'],
  ])
    check(`key «${a}» = «${b}»`, sizeKey(a) === sizeKey(b), `${sizeKey(a)} / ${sizeKey(b)}`);
  check(
    '«4/6» ≠ «4» as a token',
    !!parseSizeToken('4/6', true)?.paired && !parseSizeToken('4', true)?.paired,
  );
  check('DXF tail «<4-6>» keeps the pair', bareSize('<4-6>') === '4/6', bareSize('<4-6>'));
  check('DXF tail «36,5» stays', bareSize('36,5') === '36,5', bareSize('36,5'));
  check('DXF tail «<S>» → S', bareSize('<S>') === 'S', bareSize('<S>'));
  check(
    'card display name «4/6 [x]» spells 4/6, not 4 and 6',
    (() => {
      const t = defaultTokensOf({ sizeId: 1, name: '4/6 [x]', token: 'K46', rank: 0 });
      return t.includes('4/6') && !t.includes('4') && !t.includes('6');
    })(),
    defaultTokensOf({ sizeId: 1, name: '4/6 [x]', token: 'K46', rank: 0 }).join(','),
  );

  const card = (tokens: string[]): CardSize[] =>
    tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i }));
  const run = (labels: string[]): SizeRun => ({
    encoding: 'declared-dash',
    sizes: labels.map((label, rank) => ({ label, rank, classId: null, file: null })),
    evidence: [],
  });
  // the archive's neutral card: letters XXS–5XL and numbers 00–60 (no paired sizes)
  const NEUTRAL = card([
    'XXS',
    'XS',
    'S',
    'M',
    'L',
    'XL',
    'XXL',
    '3XL',
    '4XL',
    '5XL',
    '00',
    '0',
    ...Array.from({ length: 30 }, (_, i) => String(2 + 2 * i)),
  ]);
  const tok = (m: ReturnType<typeof proposeSizeMap>) =>
    m.entries.map((e) => `${e.source.label}→${e.card?.token ?? '·'}`).join(' ');
  // G0 «0/2 … 28/30» (Mimosa: «4/6» went onto 46 at 1.0)
  const g0 = ['0/2', '4/6', '8/10', '12/14', '16/18', '20/22', '24/26', '28/30'];
  let m = proposeSizeMap(run(g0), NEUTRAL);
  check(
    'G0 paired run on the neutral card: no size reaches a plain card size',
    !m.entries.some((e) => e.card),
    tok(m),
  );
  // G2p «00-0 … 30-32» («2-4» went onto 24)
  const g2p = ['00-0', '2-4', '6-8', '10-12', '14-16', '18-20', '22-24', '26-28', '30-32'];
  m = proposeSizeMap(run(g2p), card([...NEUTRAL.map((c) => c.token), '1012', '000']));
  check(
    'G2p paired run: 2-4 ≠ 24, 10-12 ≠ 1012, 00-0 ≠ 000',
    !m.entries.some((e) => e.card),
    tok(m),
  );
  // the same pair, spelled either way, does map
  m = proposeSizeMap(run(['4/6', '8/10', '12/14']), card(['46', '4-6', '8/10', '810', '12', '14']));
  check(
    'card «4-6» takes «4/6», «8/10» takes «8/10»; «12/14» meets neither 12 nor 14',
    tok(m) === '4/6→4-6 8/10→8/10 12/14→·' &&
      m.entries.slice(0, 2).every((e) => e.confidence === 1),
    tok(m),
  );
  // a single sheet size never meets a paired card size by its lower half or its digits
  m = proposeSizeMap(run(['4', '46', '10']), card(['4/6', '10/12', 'M', 'L']));
  check(
    '«4» ≠ card 4/6, «46» ≠ card 4/6, «10» ≠ card 10/12',
    !m.entries.some((e) => e.card),
    tok(m),
  );

  // every DXF spelling has a kind (a guess across kinds is never confirmed past the Ф6 stop)
  for (const [l, k] of [
    ['4XS', 'letter'],
    ['XXXXXL', 'letter'],
    ['6XL', 'letter'],
    ['36,5', 'num'],
    ['38', 'num'],
    ['4/6', 'paired'],
    ['00-0', 'paired'],
  ] as const)
    check(`kind of «${l}» = ${k}`, sizeKindOf(l) === k, String(sizeKindOf(l)));
  // Ф6: no order-based map across size kinds — the question instead
  m = proposeSizeMap(run(g0), NEUTRAL);
  const kq = crossKindQuestion(m, NEUTRAL);
  check(
    'Ф6: G0 paired run on a card without pairs → the question, not an order',
    !!kq && kq.includes('0/2…28/30') && kq.includes('XXS…60'),
    kq ?? 'null',
  );
  m = proposeSizeMap(run(['36', '38', '40']), card(['S', 'M', 'L']));
  check(
    'Ф6: numbers on a letter card of the same length are not aligned by rank; asked',
    !m.entries.some((e) => e.card) && !!crossKindQuestion(m, card(['S', 'M', 'L'])),
    tok(m),
  );
  m = proposeSizeMap(run(['XS', 'S', 'M']), card(['44', '46', '48']));
  check(
    'Ф6: letters on a numeric card are not aligned by rank; asked',
    !m.entries.some((e) => e.card) && !!crossKindQuestion(m, card(['44', '46', '48'])),
    tok(m),
  );
  m = proposeSizeMap(run(['1', '3', '5']), card(['2', '4', '6']));
  check(
    'Ф6: same kind (numbers on numbers) keeps the rank alignment as a 0.3 guess, no question',
    tok(m) === '1→2 3→4 5→6' &&
      m.entries.every((e) => e.confidence === 0.3) &&
      crossKindQuestion(m, card(['2', '4', '6'])) === null,
    tok(m),
  );

  // partial map: some drawn sizes on the card, others off it, card sizes still free → the question
  m = proposeSizeMap(run(['XS', 'S', 'M', 'L', 'XL']), card(['S', 'M', 'L', 'XXL']));
  const q = partialSizeMapQuestion(m);
  check(
    'partial map with a free card size (XXL) is a question naming the drawn sizes left out',
    !!q && q.includes('XS') && q.includes('XL') && q.includes('XXL'),
    q ?? 'null',
  );
  m = proposeSizeMap(run(['XS', 'S', 'M', 'L', 'XL']), card(['S', 'M', 'L']));
  check(
    'card run full: no question, the two past it are listed (said, not asked)',
    partialSizeMapQuestion(m) === null &&
      drawnUnmapped(m)
        .map((e) => e.source.label)
        .join(',') === 'XS,XL',
    tok(m),
  );
  // the operator's "not exported" closes it
  m = proposeSizeMap(run(['XS', 'S', 'M', 'L', 'XL']), card(['S', 'M', 'L', 'XXL']));
  const said = {
    ...m,
    entries: m.entries.map((e) => (e.card ? e : { ...e, origin: 'operator' as const })),
  };
  check('the operator leaving them out closes the question', partialSizeMapQuestion(said) === null);
}

// ── 2 · the Mood sample ─────────────────────────────────────────────────────────────────────
const NUM = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String(2 + 2 * i))];
const SAMPLES: { id: string; file: string; key: string[]; note: string }[] = [
  {
    id: 'vixen',
    file: 'dresses/MDF371-The-Vixen-Slip-Dress-Sizes-00-32-A4-Letter-Patterns.pdf',
    key: NUM,
    note: 'G1 motif, key in 2 columns',
  },
  {
    id: 'paris',
    file: 'dresses/MDF387-The-Paris-Mini-Dress-Sizes-00-32-A4-Letter-Patterns.pdf',
    key: NUM,
    note: 'G1 motif, 2 columns; 10 drawn in another pen',
  },
  {
    id: 'margaux',
    file: 'dresses/MDF415-The-Margaux-Bodycon-Dress-Sizes-00-32-A4-Letter-Patterns-1.pdf',
    key: NUM,
    note: 'G1 motif, 2 columns',
  },
  {
    id: 'hilde',
    file: 'dresses/MDF392-The-Hilde-Ruffled-Dress-Sizes-XXS-4XL-A4-Letter-Patterns.pdf',
    key: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
    note: 'G2 letters, S / L alike',
  },
  {
    id: 'marostica',
    file: 'dresses/MDF417-The-Marostica-Midi-Dress-Sizes-XXS-4XL-A4-Letter-Patterns.pdf',
    key: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
    note: 'G2 letters',
  },
  {
    id: 'tropea',
    file: 'dresses/MDF449-Tropea-High-Slit-Slip-Dress-Free-Sewing-Pattern-Sizes-XS-5XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
    key: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
    note: 'G2 letters XS–5XL',
  },
];

const ctx: StageCtx = { checkCancel: () => {}, progress: () => {} };
type Sample = Extract<ClassEvidence, { kind: 'legend-sample' }>;

async function sample(s: (typeof SAMPLES)[number]) {
  const path = resolve(ARCHIVE, s.file);
  if (!existsSync(path)) {
    console.log(`SKIP  ${s.id}: ${path} not found`);
    return null;
  }
  const b = readFileSync(path);
  const ses = new Session(1, [
    {
      name: s.file.split('/').pop()!,
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
  ]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => ses.runStage(st, input, ctx);
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const cl = await run('clean', { edits: [] });
  const best = cl.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  const ch = await run('chains', {
    opts: {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    },
  });
  const rows = ch.classes.filter((c) => c.role === 'size');
  const labels = rows.map((c) => c.sizeLabel ?? '?');
  const sampleOf = (l: string): Sample | null => {
    const r = rows.find((c) => c.sizeLabel === l);
    for (const e of r?.evidence ?? []) if (e.kind === 'legend-sample') return e;
    return null;
  };
  check(
    `${s.id}: size rows == printed key (${s.key.length})`,
    labels.join(' ') === s.key.join(' '),
    labels.join(' '),
  );
  const missing = s.key.filter((l) => !sampleOf(l));
  check(
    `${s.id}: a pen sample in the key for every label`,
    !missing.length,
    missing.length ? `no sample: ${missing.join(' ')}` : '',
  );
  const far = s.key
    .map((l) => [l, sampleOf(l)?.distanceMm ?? Infinity] as const)
    .filter(([, d]) => d > 2);
  check(
    `${s.id}: every sample ≤ 2 mm from its label`,
    !far.length,
    far.map(([l, d]) => `${l}:${d}`).join(' '),
  );
  check(
    `${s.id}: every key sample has its own swatch`,
    s.key.every((l) => {
      const k = sampleOf(l);
      return !!k && !!ch.keySwatches?.[k.chain];
    }),
  );
  const withLines = rows.filter((c) => c.chains.length);
  check(
    `${s.id}: every size row has a swatch`,
    withLines.every((c) => !!ch.swatches?.[c.id]),
    withLines
      .filter((c) => !ch.swatches?.[c.id])
      .map((c) => c.sizeLabel)
      .join(' '),
  );
  // samples drawn alike: told apart by order / dot size, or asked — never silently by nesting
  const alike = s.key.filter((l) => (sampleOf(l)?.alike.length ?? 0) > 0);
  for (const l of alike) {
    const k = sampleOf(l)!;
    const row = rows.find((c) => c.sizeLabel === l)!;
    const asked = k.nestingOnly && row.confidence < 0.6;
    check(
      `${s.id}: ${l} (key alike ${k.alike.join(',')}) told apart by a 2nd evidence or asked`,
      asked || k.second >= 0.5,
      `second ${k.second}, nesting only ${k.nestingOnly}, ${row.chains.length} lines`,
    );
  }
  // the row answers: two alike sizes merged into one row (the operator's label), split back by
  // nesting — each part is one of the two sizes again
  for (const [a, b] of s.key.includes('S') && s.key.includes('L') ? [['S', 'L']] : []) {
    const set = (ses as unknown as { chains: ChainSet }).chains;
    const ra = set.classes.find((c) => c.sizeLabel === a);
    const rb = set.classes.find((c) => c.sizeLabel === b);
    if (!ra || !rb || !ra.chains.length || !rb.chains.length) continue;
    const merged = mergeSameSize(
      applyLegend(set, [{ classId: rb.id, role: 'size', sizeLabel: a, sig: rb.sig }]),
    );
    const one = merged.classes.find((c) => c.sizeLabel === a)!;
    const split = splitRows(merged, [
      { classId: one.id, role: 'size', sizeLabel: a, sig: one.sig, split: 'nesting' },
    ]);
    const parts = split.classes.filter(
      (c) => c.id === one.id || c.sig === `${one.sig}/split-nesting`,
    );
    const lenIn = (ids: number[], of: number[]) => {
      const o = new Set(of);
      const L = (x: number[]) => x.reduce((t, i) => t + (set.chains[i]?.lengthMm ?? 0), 0);
      return L(ids.filter((i) => o.has(i))) / Math.max(1, L(ids));
    };
    const pure = parts.map((p) => Math.max(lenIn(p.chains, ra.chains), lenIn(p.chains, rb.chains)));
    const both =
      parts.length === 2 &&
      lenIn(parts[0].chains, ra.chains) > 0.5 !== lenIn(parts[1].chains, ra.chains) > 0.5;
    check(
      `${s.id}: ${a}+${b} merged into one row, split by nesting → ${a} and ${b} again`,
      // an operator tool: its parts are named and looked at by the operator — ≥ 80 % pure each
      both && pure.every((x) => x >= 0.8),
      `${parts.length} rows, purity ${pure.map((x) => x.toFixed(2)).join('/')}`,
    );
  }
  const unmatched = s.key.filter((l) => (sampleOf(l)?.score ?? 0) === 0);
  const moved = (ch.ambiguities ?? [])
    .filter((a) => /look run where/.test(a.message))
    .map((a) => a.message);
  console.log(
    `info  ${s.id} (${s.note}): ${labels.length} sizes · no line like its sample: ${unmatched.join(' ') || '—'} · alike: ${alike.join(' ') || '—'}`,
  );
  for (const m of moved) console.log(`info  ${s.id}: ${m}`);
  return {
    id: s.id,
    labels,
    key: s.key,
    samples: Object.fromEntries(
      s.key.map((l) => {
        const k = sampleOf(l);
        return [
          l,
          k
            ? {
                d: k.distanceMm,
                score: k.score,
                second: k.second,
                alike: k.alike,
                nestingOnly: k.nestingOnly,
              }
            : null,
        ];
      }),
    ),
    unmatched,
    moved,
  };
}

export async function main(args: string[]): Promise<number> {
  tokens();
  pairedOntoCard();
  const pick = SAMPLES.filter((s) => !args.length || args.includes(s.id));
  const report = [];
  for (const s of pick) report.push(await sample(s));
  try {
    mkdirSync(REPORTS, { recursive: true });
    writeFileSync(resolve(REPORTS, 'LEGEND-probe.json'), JSON.stringify(report, null, 1));
  } catch {
    /* the report is a courtesy */
  }
  console.log(fails ? `${fails} FAILED` : 'legend: all PASS');
  return fails ? 1 : 0;
}
