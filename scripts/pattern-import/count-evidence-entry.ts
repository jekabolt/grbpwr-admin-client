// A6 PROBE ENTRY — bundled by count-evidence.mjs. "How many sizes are drawn on this sheet" from
// independent evidences (sizes/count-evidence.ts), and the size map prefill of a one-size sheet.
//
// 1 · unit: countEvidence over hand-made evidence — two GROUPS needed (text / files / geometry /
//     ai), one disagreeing counting evidence → ask; a lone "SIZE 38" counts only where the
//     geometry proves one size (one line around every outline, no outline at two scales); deeper
//     nests and scaled copies are suggestions only; a file's own printed size and its name are one
//     fact; several models → never; Hu shapes of a scaled copy match, of another piece do not.
// 2 · pipeline: the REAL worker Session (extract → clean → scale → assemble → chains → sizes) over
//     the live smoke's inkscape-pieces-mm.svg and variants of it made in memory:
//       SIZE 38 + 2 one-line outlines   → 1 inferred (label + nests); S/M/L card: 38 → M suggested
//                                         (a guess the operator confirms); 34–46 card: 38 → 38
//       SIZE: M                         → 1 inferred, M → M (same token, no question)
//       + the front again at ×1.05/×1.2 → NOT inferred (sizes side by side?); 38 only names
//       STYLE A / STYLE B               → NOT inferred (two models on the sheet)
//       SIZES 36-46 over one nest/piece → NOT inferred (the text disagrees with the outlines)
//       no size text, "size 4 cm"       → NOT inferred
//     plus the operator's side: 0 takes AUTO back (asked again), his own answer wins.
// Exit 1 on any failed check.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CardSize, StageIO, StageName } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import {
  blobShapes,
  countEvidence,
  scaledCopy,
  sheetFeed,
  sizeLabelsIn,
  type BlobShape,
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
  depths.map((d, i) => ({ id: i, areaMm2: 100_000 - i * 1000, depth: d, junk: null }));
/** Shapes of blobs 0…n−1, all different (no scaled copy). */
const apart = (n = 12): Map<number, BlobShape> =>
  new Map(Array.from({ length: n }, (_, i) => [i, { px: 10_000 - i * 50, hu: [i, -i, i, -i] }]));
/** …with blob 1 a ×1.1 copy of blob 0. */
const copy01 = (): Map<number, BlobShape> => {
  const m = apart();
  m.set(1, { px: 10_000 / 1.21, hu: [...m.get(0)!.hu] });
  return m;
};
const T = (...xs: string[]) => xs.map((text) => ({ text, file: null }));

/** A tiny face raster: one blob per polygon (px coordinates), for the Hu shape check. */
function raster(polys: { id: number; pts: [number, number][] }[], W = 900, H = 400) {
  const blobAt = new Int32Array(W * H).fill(-1);
  for (const { id, pts } of polys)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) blobAt[y * W + x] = id;
      }
  return { g: { W, H }, blobAt };
}
const at = (pts: [number, number][], k: number, dx: number, dy = 10): [number, number][] =>
  pts.map(([x, y]) => [dx + x * k, dy + y * k]);

// ── 1 · unit ──────────────────────────────────────────────────────────────────────────────
function unit() {
  console.log('\n· unit');
  const ev = (o: Partial<Parameters<typeof countEvidence>[0]>) =>
    countEvidence({ texts: [], blobs: nests(1, 1), shapes: apart(), ...o });
  const kinds = (r: ReturnType<typeof countEvidence>) =>
    r.evidence
      .filter((e) => e.counts)
      .map((e) => e.kind)
      .join('+');
  let r = ev({ texts: T('FRONT', 'SIZE 38') });
  check(
    r.n === 1 && r.label === '38' && kinds(r) === 'label+nests',
    'SIZE 38 + two one-line outlines, no scaled copy → 1 (label + nests)',
    r,
  );
  r = ev({ texts: T('ID: 1 PRZÓD SIZE: M'), blobs: nests(1, 1, 1) });
  check(r.n === 1 && r.label === 'M', '"ID: 1 PRZÓD SIZE: M" + three one-line outlines → 1, M', r);
  // 3 · a lone label counts only where the geometry proves one size
  r = ev({ texts: T('SIZE 38'), shapes: copy01() });
  check(
    r.n === null && r.label === '38' && kinds(r) === '',
    'SIZE 38 + an outline drawn at two scales → NOT inferred, 38 only names',
    r,
  );
  r = ev({ texts: T('SIZE 38'), shapes: null });
  check(r.n === null, 'SIZE 38 + scaled copies not checked → NOT inferred', r);
  r = ev({
    texts: T('SIZE 38'),
    blobs: [
      ...nests(1, 1),
      { id: 9, areaMm2: 90_000, depth: 2, junk: 'seam-line', aside: true, inside: 0 },
    ],
  });
  check(r.n === null, 'SIZE 38 + a seam/inner ring inside one outline → NOT inferred', r);
  r = ev({
    texts: T('SIZE 38'),
    blobs: [
      ...nests(1, 1),
      { id: 9, areaMm2: 6600, depth: 2, junk: 'other-pen', aside: true, inside: 0 },
    ],
  });
  check(r.n === 1, 'SIZE 38 + a label box inside one outline (other pen, not a ring) → 1', r);
  r = ev({ texts: T('SIZE 38'), ai: { sizesDrawn: 1 }, blobs: null });
  check(
    r.n === null && kinds(r) === 'ai',
    'SIZE 38 + AI 1, no geometry → the label does not count → NOT inferred',
    r,
  );
  r = ev({ ai: { sizesDrawn: 1 } });
  check(r.n === 1 && kinds(r) === 'nests+ai', 'one-line outlines + AI 1 → 1 (geometry + ai)', r);
  // 4 · rings are a suggestion until proven to be sizes
  r = ev({ texts: T('SIZES 36-46'), blobs: nests(6, 6, 6, 5, 6) });
  check(
    r.n === null && r.evidence.find((e) => e.kind === 'nests')?.counts === false,
    'legend 36–46 + depth 6 → NOT inferred (rings not proven sizes)',
    r,
  );
  r = ev({ texts: T('SIZE 38'), blobs: nests(2, 2, 2) });
  check(r.n === null, 'SIZE 38 + depth 2 (cut + seam?) → NOT inferred', r);
  r = ev({ texts: T('SIZES 36-46') });
  check(
    r.n === null && kinds(r) === 'text-run+nests',
    'legend 36–46 + one-line outlines → NOT inferred (they disagree)',
    r,
  );
  r = ev({ texts: T('FRONT') });
  check(r.n === null && kinds(r) === 'nests', 'outlines alone → NOT inferred (one group)', r);
  r = ev({ texts: T('SIZE 38'), ai: { sizesDrawn: 3 } });
  check(r.n === null, 'label 1 + nests 1 + AI 3 → NOT inferred (one disagrees)', r);
  r = ev({ texts: T('Size 36-46'), blobs: null, ai: { sizesDrawn: 6 } });
  check(r.n === 6, 'text 6/11 + AI 6 → 6', r);
  // 2 · one fact counts once: each file's own printed size = its name
  const F = ['44', '46', '48'].map((n, i) => ({ id: `f${i}`, name: `coat_${n}.pdf` }));
  r = ev({
    blobs: null,
    files: F,
    texts: F.map((f, i) => ({ text: `Size ${44 + 2 * i}`, file: f.id })),
  });
  check(
    r.n === null && r.evidence.every((e) => e.group === 'files'),
    'three files 44/46/48 each printing its size → one fact (files) → NOT inferred',
    r,
  );
  r = ev({
    blobs: null,
    files: F,
    texts: ['Size 44', 'Size 46', 'Size 48'].map((text) => ({ text, file: 'f0' })),
  });
  check(
    r.n === 3 && kinds(r) === 'text-run+files',
    'the same files + a legend printed in one file → text + files → 3',
    r,
  );
  r = ev({
    blobs: null,
    files: [
      { id: 'f0', name: 'x.pdf' },
      { id: 'f1', name: 'y.pdf' },
    ],
    texts: T('Size 36-46'),
  });
  check(r.n === null, 'files naming no size → no file evidence', r);
  // 2 · only what feeds the selected sheet: its files, its texts, its files' instruction texts
  const fed = sheetFeed(
    { poses: [{ file: 'f1' }], texts: [{ text: 'SIZE 40', src: { file: 'f1' } }] },
    [0, 1, 2].map((i) => ({ id: `f${i}`, name: `coat_${40 + 2 * i}.pdf` })),
    [
      { file: 'f0', text: 'SIZE 38' },
      { file: 'f1', text: 'Sizes 40' },
    ],
  );
  check(
    fed.files.map((f) => f.id).join() === 'f1' &&
      fed.texts.map((t) => t.text).join('|') === 'SIZE 40|Sizes 40',
    "sheet fed by file 1 only: files [1], its own and its file's instruction texts",
    fed,
  );
  // 1 · several models: never
  r = ev({ texts: T('SIZE 38'), models: 2 });
  check(r.n === null && !!r.blocked, 'two models on the sheet → NOT inferred', r);
  // the scaled-copy check on real pixels
  const L: [number, number][] = [
    [0, 0],
    [120, 0],
    [120, 60],
    [50, 60],
    [50, 200],
    [0, 200],
  ];
  const R: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 230],
    [0, 230],
  ];
  const fr = raster([
    { id: 0, pts: at(L, 1, 10) },
    { id: 1, pts: at(L, 1.05, 200) },
    { id: 2, pts: at(L, 1.2, 400) },
    { id: 3, pts: at(R, 1, 620) },
    { id: 4, pts: at(L, 1, 760) },
  ]);
  const sh = blobShapes(fr, new Set([0, 1, 2, 3, 4]));
  const B = (id: number): NestBlob => ({ id, areaMm2: sh.get(id)!.px, depth: 1, junk: null });
  check(!!scaledCopy([B(0), B(1)], sh), 'Hu: an L and the same L ×1.05 → one shape at two scales');
  check(!!scaledCopy([B(0), B(2)], sh), 'Hu: an L and the same L ×1.2 → one shape at two scales');
  check(!scaledCopy([B(0), B(3)], sh), 'Hu: an L and a rectangle → not a copy');
  check(!scaledCopy([B(0), B(4)], sh), 'Hu: the same L twice at ×1 (a pair) → not sizes');
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

async function sheetOf(
  svg: string,
  name = 'pieces.svg',
  more: { name: string; svg: string }[] = [],
) {
  const file = (n: string, x: string) => {
    const b = Buffer.from(x, 'utf8');
    return {
      name: n,
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    };
  };
  const s = new Session(1, [file(name, svg), ...more.map((m) => file(m.name, m.svg))]);
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
    blocked: o.countAsk.auto.blocked,
    ev: o.countAsk.auto.evidence.map(
      (e) => `${e.kind}:${e.n.join('/')}${e.counts ? '' : '(no)'} ${e.detail}`,
    ),
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
      o.countAsk.auto.evidence
        .filter((x) => x.counts)
        .map((x) => x.kind)
        .join('+') === 'label+nests',
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
  // 3 · the front drawn again at another scale beside it (sizes side by side): SIZE 38 only names
  for (const k of [1.05, 1.2]) {
    const wide = SVG.replace('width="1000mm"', 'width="1700mm"')
      .replace('viewBox="0 0 1000 700"', 'viewBox="0 0 1700 750"')
      .replace('height="700mm"', 'height="750mm"')
      .replace(
        '</svg>',
        `<g transform="translate(1050,0) scale(${k})"><path style="fill:none;stroke:#000000;stroke-width:0.5" d="M 40,655 l 260,0 l 20,-380 a100,100 0 00-100,-100 l -80,-80 a100,100 0 01-100,100 l 0,460 z" /></g></svg>`,
      );
    sizes = await sheetOf(wide);
    o = await sizes({ card: SML });
    check(
      o.expected === null &&
        o.countAsk?.auto?.evidence.some((x) => x.kind === 'label' && !x.counts) === true,
      `front again at ×${k} beside it → NOT inferred, SIZE 38 does not count`,
      summary(o),
    );
    o = await sizes({ card: SML, drawnSizes: 1 });
    check(
      o.run.sizes[0]?.label === '38',
      `… answered 1 by the operator → the run is named 38`,
      summary(o),
    );
  }
  // 1 · two models on the sheet: never
  sizes = await sheetOf(
    SVG.replace('>FRONT</tspan>', '>STYLE A</tspan>').replace('CUT &amp; 2', 'STYLE B'),
  );
  o = await sizes({ card: SML });
  check(
    o.expected === null && !!o.countAsk?.auto?.blocked,
    'STYLE A / STYLE B on the sheet → NOT inferred (two models)',
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
