// A6 PROBE ENTRY — bundled by count-evidence.mjs. "How many sizes are drawn on this sheet" from
// independent evidences (sizes/count-evidence.ts), and the size map prefill of a one-size sheet.
//
// 1 · unit: countEvidence over hand-made evidence (agreement, disagreement, the card as a tie-break
//     only, seam lines, a measure that is not a size, file-per-size names);
// 2 · pipeline: the REAL worker Session (extract → clean → scale → assemble → chains → sizes) over
//     the live smoke's inkscape-pieces-mm.svg and variants of it made in memory:
//       SIZE 38 + 2 one-line outlines  → 1 inferred (label + nests), S/M/L card: 38 → M suggested
//                                        (a guess the operator confirms), 34–46 card: 38 → 38 auto
//       SIZE: M                        → 1 inferred, M → M (same token, no question)
//       SIZES 36-46 (legend) + 1 nest  → NOT inferred (the text disagrees with the outlines) → ask
//       no size text                   → NOT inferred (one evidence)
//       "size 4 cm"                    → not a size label
//     plus the operator's side: 0 takes AUTO back (asked again), his own answer wins.
// Exit 1 on any failed check.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CardSize, StageIO, StageName } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import {
  countEvidence,
  sizeLabelsIn,
  type NestBlob,
} from 'lib/pattern-import/sizes/count-evidence';
import { proposeSizeMap } from 'lib/pattern-import/sizes/map';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';

let bad = 0;
const check = (ok: boolean, what: string, got?: unknown) => {
  if (!ok) bad++;
  console.log(
    `${ok ? '✓' : '✗'} ${what}${ok || got === undefined ? '' : ` — got ${JSON.stringify(got)}`}`,
  );
};

const card = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));
const nests = (...depths: number[]): NestBlob[] =>
  depths.map((d, i) => ({ areaMm2: 100_000 - i * 1000, depth: d, junk: null }));
const T = (...xs: string[]) => xs.map((text) => ({ text }));

// ── 1 · unit ──────────────────────────────────────────────────────────────────────────────
function unit() {
  console.log('\n· unit');
  let r = countEvidence({ sheetTexts: T('FRONT', 'SIZE 38'), blobs: nests(1, 1) });
  check(r.n === 1 && r.label === '38', 'SIZE 38 + two one-line outlines → 1, label 38', r);
  r = countEvidence({ sheetTexts: T('ID: 1 PRZÓD SIZE: M'), blobs: nests(1, 1, 1, 2) });
  check(r.n === 1 && r.label === 'M', '"ID: 1 PRZÓD SIZE: M" + depth 1 on 3 of 4 → 1, M', r);
  r = countEvidence({ sheetTexts: T('Gr. 40'), blobs: nests(1, 1, 1) });
  check(r.n === 1 && r.label === '40', 'Gr. 40 → 1, 40', r);
  r = countEvidence({ sheetTexts: T('SIZES 36-46'), blobs: nests(1, 1, 1) });
  check(r.n === null, 'legend 36–46 + one-line outlines → NOT inferred (disagree)', r);
  r = countEvidence({ sheetTexts: T('SIZES 36-46'), blobs: nests(6, 6, 6, 5, 6) });
  check(r.n === 6, 'legend 36–46 (6 or 11) + depth 6 → 6', r);
  r = countEvidence({ sheetTexts: T('FRONT'), blobs: nests(1, 1, 1) });
  check(r.n === null && r.evidence.length === 1, 'nests alone → NOT inferred (one evidence)', r);
  r = countEvidence({ sheetTexts: T('SIZE 38'), blobs: null });
  check(r.n === null, 'a label alone → NOT inferred', r);
  r = countEvidence({ sheetTexts: T('SIZE 38'), blobs: nests(1, 2, 3) });
  check(r.n === null, 'no depth shared by two thirds → no nest evidence → not inferred', r);
  r = countEvidence({ sheetTexts: T('SIZE 38'), blobs: nests(1, 1, 2, 3, 4) });
  check(r.n === null, 'depth 1 on 2 of 5 (< two thirds) → no nest evidence → not inferred', r);
  r = countEvidence({ sheetTexts: T('SIZE 38'), blobs: nests(1, 1, 1), ai: { sizesDrawn: 3 } });
  check(r.n === null, 'label 1 + nests 1 + AI 3 → NOT inferred (one disagrees)', r);
  r = countEvidence({ sheetTexts: T('SIZE 38'), blobs: nests(2, 2, 2), seamLines: true });
  check(r.n === 1, 'depth 2 with a seam-line class allows 1 (cut + seam line) → 1', r);
  r = countEvidence({ sheetTexts: T('SIZE 38'), blobs: nests(2, 2, 2) });
  check(r.n === null, 'depth 2 without a seam line disagrees with SIZE 38 → ask', r);
  // the card breaks a tie only — never an evidence of its own
  r = countEvidence({ sheetTexts: T('Size 36-46'), blobs: null, cardCount: 6 });
  check(
    r.n === null,
    'text run + card of 6, nothing else → NOT inferred (the card is no evidence)',
    r,
  );
  r = countEvidence({
    sheetTexts: T('Size 36-46'),
    blobs: null,
    ai: { sizesDrawn: 6 },
    cardCount: 11,
  });
  check(r.n === 6, 'text 6/11 + AI 6 → 6 (card 11 does not move it)', r);
  // two counts both evidences allow (runs 36–46 and 36–48; depth 7 over a seam line = 6 or 7)
  const tie = { sheetTexts: T('Size 36-46', 'Size 36-48'), blobs: nests(7, 7, 7), seamLines: true };
  r = countEvidence(tie);
  check(r.n === null, 'evidences allow 6 and 7, no card → NOT inferred', r);
  r = countEvidence({ ...tie, cardCount: 7 });
  check(r.n === 7, 'the same with a card of 7 → 7 (the card breaks the tie)', r);
  r = countEvidence({ ...tie, cardCount: 5 });
  check(r.n === null, 'a card of 5 breaks no tie between 6 and 7', r);
  r = countEvidence({
    sheetTexts: T('Size 36-46', 'Size 36-46'),
    blobs: null,
    files: [{ name: 'x.pdf' }],
    ai: null,
  });
  check(r.n === null, 'one file names no size → no file evidence', r);
  r = countEvidence({
    sheetTexts: T('Size 44-54'),
    blobs: null,
    files: ['44', '46', '48', '50', '52', '54'].map((n) => ({ name: `coat_${n}.pdf` })),
  });
  check(r.n === 6, 'text 44–54 + six files named 44…54 → 6', r);
  check(
    sizeLabelsIn(['seam allowance size 4 cm']).length === 0,
    '"size 4 cm" is a measure, not a size',
  );
  check(
    sizeLabelsIn(['Size 36/38', 'size 36-46']).length === 0,
    '"Size 36/38", "size 36-46" are not one size',
  );
  check(sizeLabelsIn(['размер 48']).join() === '48', '"размер 48" names 48');
  // the map prefill
  const run1 = (label: string) => ({
    encoding: 'single' as const,
    sizes: [{ label, rank: 0, classId: null, file: null }],
    evidence: [],
  });
  let m = proposeSizeMap(run1('38'), card(['S', 'M', 'L']));
  check(
    m.entries[0].card?.token === 'M' && (m.entries[0].confidence ?? 1) < 0.9,
    '38 on an S/M/L card → M suggested (a guess: < 0.9)',
    m.entries[0],
  );
  m = proposeSizeMap(run1('38'), card(['S', 'M', 'L', 'XL']));
  check(m.entries[0].card?.token === 'M', '38 on S/M/L/XL → M (lower middle)', m.entries[0].card);
  m = proposeSizeMap(run1('M'), card(['S', 'M', 'L']));
  check(
    m.entries[0].card?.token === 'M' && m.entries[0].confidence === 1,
    'M on S/M/L → M auto (same token)',
    m.entries[0],
  );
  m = proposeSizeMap(run1(''), card(['S', 'M', 'L']));
  check(
    m.entries[0].card == null,
    'an unnamed size is not prefilled (nothing named)',
    m.entries[0],
  );
}

// ── 2 · pipeline ──────────────────────────────────────────────────────────────────────────
const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const SVG = readFileSync(resolve(CORPUS, 'synthetic/inkscape-pieces-mm.svg'), 'utf8');

async function sheetOf(svg: string, name = 'pieces.svg') {
  const b = Buffer.from(svg, 'utf8');
  const s = new Session(1, [
    { name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer },
  ]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const cl = await run('clean', { edits: [] });
  const best = cl.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  await run('chains', {
    opts: {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    },
  });
  return (input: StageIO['sizes']['in']) => run('sizes', input);
}

const summary = (o: StageIO['sizes']['out']) => ({
  expected: o.expected,
  auto: o.countAsk?.auto && {
    n: o.countAsk.auto.n,
    applied: o.countAsk.auto.applied,
    ev: o.countAsk.auto.evidence.map((e) => `${e.kind}:${e.n.join('/')}`),
  },
  map: o.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}@${e.confidence}`),
});

async function pipeline() {
  console.log('\n· pipeline (worker Session, inkscape-pieces-mm.svg and variants)');
  const SML = card(['S', 'M', 'L']);
  // the live smoke as given
  let sizes = await sheetOf(SVG);
  let o = await sizes({ card: SML });
  check(
    o.expected?.from === 'inferred' &&
      o.expected.n === 1 &&
      !!o.countAsk?.auto?.applied &&
      o.countAsk.auto.evidence.map((e) => e.kind).join('+') === 'label+nests',
    'smoke SIZE 38: sizes drawn = 1 inferred (label + nests)',
    summary(o),
  );
  const e = o.map.entries[0];
  check(
    o.map.entries.length === 1 &&
      e.source.label === '38' &&
      e.card?.token === 'M' &&
      e.origin === 'auto' &&
      (e.confidence ?? 1) < 0.9,
    'smoke: 38 → M prefilled as a suggestion to confirm',
    summary(o),
  );
  // the operator confirms it (one click: operatorMap with the shown entry)
  o = await sizes({ card: SML, operatorMap: [{ ...e, origin: 'operator' }] });
  check(
    o.map.entries[0].card?.token === 'M' && o.map.entries[0].origin === 'operator',
    'smoke: one confirm → 38 → M set',
    summary(o),
  );
  // the operator takes AUTO back: asked as before (expected unknown), the count one click away
  o = await sizes({ card: SML, drawnSizes: 0 });
  check(
    o.expected === null && o.countAsk?.auto?.n === 1 && o.countAsk.auto.applied === false,
    'AUTO taken back (drawnSizes 0) → asked, AUTO offered as a quick answer',
    summary(o),
  );
  o = await sizes({ card: SML, drawnSizes: 2 });
  check(
    o.expected?.from === 'operator' && o.expected.n === 2 && o.run.sizes.length === 2,
    "the operator's own answer (2) wins over AUTO",
    summary(o),
  );
  o = await sizes({ card: card(['34', '36', '38', '40', '42', '44', '46']) });
  check(
    o.map.entries[0]?.card?.token === '38' && o.map.entries[0].confidence === 1,
    'smoke on a 34–46 card: 38 → 38 auto (same token)',
    summary(o),
  );
  // SIZE: M (the wm label) — same token on the card, no question
  sizes = await sheetOf(SVG.replace('SIZE 38', 'SIZE: M'));
  o = await sizes({ card: SML });
  check(
    o.expected?.from === 'inferred' &&
      o.expected.n === 1 &&
      o.map.entries[0]?.card?.token === 'M' &&
      o.map.entries[0].confidence === 1,
    'SIZE: M → 1 inferred, M → M auto',
    summary(o),
  );
  // negatives
  sizes = await sheetOf(SVG.replace('SIZE 38', 'SIZES 36-46'));
  o = await sizes({ card: SML });
  check(
    o.expected === null && o.countAsk?.auto?.n === null,
    'legend 36–46 + one nest per piece → NOT inferred (asked)',
    summary(o),
  );
  sizes = await sheetOf(SVG.replace('SIZE 38', 'FRONT PIECE'));
  o = await sizes({ card: SML });
  check(o.expected === null, 'no size text → NOT inferred (nests alone)', summary(o));
  sizes = await sheetOf(SVG.replace('SIZE 38', 'size 4 cm'));
  o = await sizes({ card: SML });
  check(o.expected === null, '"size 4 cm" → no label → NOT inferred', summary(o));
  // a file name naming its size stays 'source' (H1): A6 is not asked
  sizes = await sheetOf(SVG, 'front-back_M.svg');
  o = await sizes({ card: SML });
  check(
    o.expected?.from === 'source' && o.countAsk === null,
    'a file named …_M stays source (not asked, A6 not run)',
    summary(o),
  );
}

export async function main() {
  unit();
  await pipeline();
  console.log(bad ? `\n✗ ${bad} check(s) failed` : '\n✓ all A6 checks pass');
  return bad ? 1 : 0;
}
