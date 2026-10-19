// PATTERN-IMPORT · NAP — "not a piece" clicks: a number that is part of a printed code is held
// back, never offered as a piece (pieces/seeds.ts codeTextSeeds, worker/session.ts labelSeeds).
//   1 crafted controls on the rule, one per evidence — each guarded by a mutation switch
//     (`off`), which makes its check FAIL: the type (smaller than the piece numbers), the string
//     (its line of digits reads 4+ digits), its own box (a copy over it is no string), the
//     length (a real number split in two text runs is ≤ 3 digits)
//   2 a crafted SVG through the session: a code printed inside a closed outline — the code is
//     held, the outline is NOT lost (seeded, or listed as set aside: D3)
//   3 the corpus at the automatic pieces run: every hold is one reviewed by eye (TRUTH.md:
//     polupalto's article strip "7142 … 00 15"), and no TRUTH piece is ever held — a held label
//     that is a TRUTH piece number must be printed as a kept piece label elsewhere in the file
// Writes only to a temp dir (PATIMPORT_E2E_OUT).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { codeTextSeeds, type CodeTextSwitch } from 'lib/pattern-import/pieces/seeds';
import type { IRText, Seed, StageIO } from 'lib/pattern-import/types';
import { CASES, runCase } from './e2e-entry';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) fails++;
};

// ── 1 · the rule ────────────────────────────────────────────────────────────────────────────
let nid = 0;
/** A text as the extractors give it: centre (x, y), print size fs, one digit ≈ 0.6 fs wide. */
function txt(s: string, x: number, y: number, fs: number, rot = 0): IRText {
  const w = 0.6 * fs * s.length;
  const along = Math.abs(Math.cos((rot * Math.PI) / 180)) > 0.5;
  const [hx, hy] = along ? [w / 2, fs / 2] : [fs / 2, w / 2];
  return {
    id: nid++,
    text: s,
    anchor: { x: x - hx, y },
    bbox: { minX: x - hx, minY: y - hy, maxX: x + hx, maxY: y + hy },
    fontSizeMm: fs,
    rotationDeg: rot,
    layer: null,
    src: { file: '0', page: 0, op: 0, sub: 0 },
  };
}
const seedOf = (t: IRText): Seed => ({
  id: t.id,
  at: { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 },
  origin: 'text',
  text: t,
  variant: null,
});
/** Labels "1" "2" "3" "4" at 17 mm, far apart: the sheet's piece-number type. */
const labels = () => ['1', '2', '3', '4'].map((s, i) => txt(s, 100 + 300 * i, 100, 17.4));
function held(texts: IRText[], seeds: IRText[], off?: ReadonlySet<CodeTextSwitch>): Set<string> {
  const v = codeTextSeeds({ texts }, seeds.map(seedOf), { off });
  return new Set(seeds.filter((t) => v.has(t.id)).map((t) => t.text));
}
const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

function rule() {
  // the article strip: "00" "15" in 11 mm type, one line, beside each other
  {
    const L = labels();
    const a = txt('00', 600, 900, 11.1);
    const b = txt('15', 600 + 0.6 * 11.1 * 2 + 3, 900, 11.1);
    const all = [...L, a, b];
    const h = held(all, all);
    check(
      '1 · a code strip ("00" "15", smaller, one line): both held',
      same(h, ['00', '15']),
      [...h].join(','),
    );
    check('1 · …the piece numbers are not', !L.some((t) => h.has(t.text)));
  }
  // the same strip turned 90° (a sheet printed sideways)
  {
    const L = labels();
    const a = txt('00', 600, 900, 11.1, 90);
    const b = txt('15', 600, 900 + 0.6 * 11.1 * 2 + 3, 11.1, 90);
    const h = held([...L, a, b], [...L, a, b]);
    check(
      '1 · the strip turned 90°: held along its own line',
      same(h, ['00', '15']),
      [...h].join(','),
    );
  }
  // type: two piece labels in the label type side by side ("21" "22" printed next to each other)
  {
    const L = labels();
    const a = txt('21', 600, 900, 17.4);
    const b = txt('22', 600 + 0.6 * 17.4 * 2 + 4, 900, 17.4);
    const all = [...L, a, b];
    check(
      '1 type · numbers in the label type beside each other: not held',
      held(all, all).size === 0,
    );
    check(
      '1 type · …mutation (type not required): they are held → the guard is real',
      held(all, all, new Set(['type'])).size > 0,
    );
  }
  // string: a lone small number (a piece label printed smaller — kombinezon-style small piece)
  {
    const L = labels();
    const a = txt('5', 600, 900, 11.1);
    const all = [...L, a];
    check('1 string · a lone smaller number: not held', held(all, all).size === 0);
    check(
      '1 string · …mutation (string not required): it is held → the guard is real',
      held(all, all, new Set(['string'])).has('5'),
    );
  }
  // string across lines: a smaller number with digits ABOVE it (a size table column), not on its line
  {
    const L = labels();
    const a = txt('15', 600, 900, 11.1);
    const b = txt('44', 600, 900 + 2 * 11.1, 11.1);
    const all = [...L, a, b];
    check(
      '1 string · digits on another line (a table column): not held',
      held(all, [...L, a]).size === 0,
    );
  }
  // a cut count beside a smaller piece number ("15  X 2"): the "2" a type height away, not a string
  {
    const L = labels();
    const a = txt('15', 600, 900, 11.1);
    const x = txt('X', 600 + 0.6 * 11.1 + 4 + 3, 900, 11.1);
    const b = txt('2', 600 + 0.6 * 11.1 + 11.1 + 0.3 * 11.1 + 0.6 * 11.1 * 1.5, 900, 11.1);
    check(
      '1 string · a cut count "X 2" beside a smaller number: not held',
      held([...L, a, x, b], [...L, a]).size === 0,
    );
  }
  // own copies: an OCG per size prints "15" again at the same spot (kombinezon repeats every label)
  {
    const L = labels();
    const a = txt('15', 600, 900, 11.1);
    const copy = txt('15', 600.2, 900, 11.1);
    const all = [...L, a, copy];
    check(
      '1 parts · a number over its own copy ("15"+"15" in one box): not held',
      held(all, [...L, a]).size === 0,
    );
    // its copy over it and a cut count "2" beside: the line reads "152", not "15152"
    {
      const two = txt('2', 600 + 0.6 * 11.1 + 0.3 * 11.1 + 0.3 * 11.1, 900, 11.1);
      check(
        '1 parts · its copy over it + a "2" beside (reads 152, ≤ 3 digits): not held',
        held([...L, a, copy, two], [...L, a]).size === 0,
      );
    }
    // the copy shifted along the line, partly over it and wholly beside it ("15 15" reads 1515)
    for (const dx of [0.3 * 11.1, 0.6 * 11.1 * 2 + 0.3 * 11.1]) {
      const c2 = txt('15', 600 + dx, 900, 11.1);
      check(
        `1 parts · its copy shifted ${dx.toFixed(1)} mm along the line: not held`,
        held([...L, a, c2], [...L, a]).size === 0,
      );
    }
    check(
      '1 parts · …mutation (its own box counts as the string): it is held → the guard is real',
      held(all, [...L, a], new Set(['parts'])).has('15'),
    );
  }
  // a real smaller label split in two text runs past the digit join ("1" + "5", 0.4 type apart)
  {
    const L = labels();
    const a = txt('1', 600, 900, 11.1);
    const b = txt('5', 600 + 0.6 * 11.1 + 0.4 * 11.1, 900, 11.1);
    const all = [...L, a, b];
    check(
      '1 long · a split piece number ("1" + "5" = 15, ≤ 3 digits): not held',
      held(all, all).size === 0,
    );
    check(
      '1 long · …mutation (any run length): both held → the guard is real',
      same(held(all, all, new Set(['long'])), ['1', '5']),
    );
  }
  // no label type: two number seeds only — nothing to compare a print size with
  {
    const a = txt('3', 100, 100, 17.4);
    const b = txt('00', 600, 900, 11.1);
    const c = txt('15', 600 + 0.6 * 11.1 * 2 + 3, 900, 11.1);
    check(
      '1 type · fewer than 3 numbers in one type: no label type, nothing held',
      held([a, b, c], [a, b, c]).size === 0,
    );
  }
  // explicit labels are never codes
  {
    const L = labels();
    const p = txt('Piece 15', 600, 900, 11.1);
    const b = txt('00', 600 - 0.6 * 11.1 * 6, 900, 11.1);
    const all = [...L, p, b];
    const v = codeTextSeeds({ texts: all }, [...L.map(seedOf), seedOf(p)]);
    check('1 · an explicit label ("Piece 15") is never a code', !v.has(p.id));
  }
}

// ── 2 · a code inside a closed outline, through the session ─────────────────────────────────
const OUT = process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-nap-out');
const STOP = new Error('nap probe: auto pieces captured');
async function autoPieces(c: (typeof CASES)[number]): Promise<StageIO['pieces']['out'] | null> {
  let got: StageIO['pieces']['out'] | null = null;
  try {
    await runCase(c, {
      onAutoPieces: (_s, pc) => {
        got = pc;
        throw STOP;
      },
    });
  } catch (e) {
    if (e !== STOP && !got) throw e;
  }
  return got;
}

const RECT = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:none;stroke:#000;stroke-width:0.5"/>`;
const TEXT = (s: string, x: number, y: number, fs: number) =>
  `<text x="${x}" y="${y}" style="font-size:${fs}px;font-family:sans-serif">${s}</text>`;

async function session() {
  mkdirSync(OUT, { recursive: true });
  const file = resolve(OUT, 'nap-code-in-outline.svg');
  // four pieces labelled 1–4 in 20 mm type; a fifth closed outline whose only text is a code
  // strip "00 15" in 12 mm type; a free code strip "7142 01" outside every outline
  const body = [
    RECT(50, 50, 300, 250),
    TEXT('1', 190, 185, 20),
    RECT(400, 50, 300, 250),
    TEXT('2', 540, 185, 20),
    RECT(50, 350, 300, 250),
    TEXT('3', 190, 485, 20),
    RECT(400, 350, 300, 250),
    TEXT('4', 540, 485, 20),
    RECT(750, 50, 200, 200),
    TEXT('00', 800, 160, 12),
    TEXT('15', 817, 160, 12),
    TEXT('71', 760, 640, 12),
    TEXT('42', 777, 640, 12),
  ].join('\n');
  writeFileSync(
    file,
    `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" height="700mm" viewBox="0 0 1000 700">\n${body}\n</svg>\n`,
  );
  const out = await autoPieces({
    id: 'nap:code-in-outline',
    group: 'synthetic',
    files: [file],
    card: ['M'],
    drawn: 1,
  } as (typeof CASES)[number]);
  if (!out) {
    check('2 · the crafted sheet reaches the pieces step', false);
    return;
  }
  const textOf = (sd: Seed) => sd.text?.text.trim() ?? '';
  const offered = out.seeds.map(textOf).filter(Boolean);
  const codes = (out.setAside ?? []).filter((a) => a.reason === 'code-text');
  console.log(
    `  seeds [${offered.join(' ')}] · code holds [${codes.map((a) => a.seed?.text?.text).join(' ')}] · set aside ${(out.setAside ?? []).map((a) => `${a.reason}:${Math.round(a.areaMm2 / 100)}`).join(' ')}`,
  );
  check(
    '2 · the piece numbers 1–4 are offered',
    ['1', '2', '3', '4'].every((s) => offered.includes(s)),
  );
  check(
    '2 · the code strips are held as code, each with its evidence in words',
    codes.length === 4 &&
      ['00', '15', '71', '42'].every((s) => codes.some((a) => a.seed?.text?.text.trim() === s)) &&
      codes.every((a) => !!a.why && a.seed != null),
    codes.map((a) => `${a.seed?.text?.text}:${a.why}`).join(' | '),
  );
  check(
    '2 · no code is offered as a piece',
    !['00', '15', '71', '42'].some((s) => offered.includes(s)),
  );
  // the fifth outline (750..950 × 50..250 in SVG; area 400 cm²) is never lost: seeded as an
  // outline, or listed as set aside (a piece-sized outline set aside stops the run: D3)
  const inside = (
    p: { x: number; y: number },
    b: { minX: number; minY: number; maxX: number; maxY: number },
  ) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
  // where "00" is printed (held, or offered as a seed when the hold is off)
  const at =
    codes.find((a) => a.seed?.text?.text.trim() === '00')?.at ??
    out.seeds.find((sd) => textOf(sd) === '00')?.at;
  // seeded = a seed of the outline's own (an outline seed, or the code itself when not held)
  const seededThere =
    !!at &&
    out.families.some((f) => f.candidates.some((c) => c.outer.length > 2 && inside(at, c.bbox)));
  const asideThere =
    !!at &&
    (out.setAside ?? []).some(
      (a) => a.reason !== 'code-text' && a.areaMm2 >= 30000 && inside(at, a.box),
    );
  check(
    '2 · the outline the code sits in is not lost (seeded, or set aside and listed)',
    seededThere || asideThere,
    seededThere ? 'seeded' : asideThere ? 'set aside' : 'GONE',
  );
}

// ── 3 · the corpus ──────────────────────────────────────────────────────────────────────────
const TRUTH = JSON.parse(
  readFileSync(
    resolve(
      process.env.PATIMPORT_CORPUS ??
        '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/',
      'truth.json',
    ),
    'utf8',
  ),
) as {
  samples: {
    id: string;
    variants?: { pieces?: { label: string }[] }[];
    pieces?: { label: string }[];
  }[];
};
const truthLabels = (id: string) => {
  const s = TRUTH.samples.find((x) => x.id === id);
  const all = [...(s?.pieces ?? []), ...(s?.variants ?? []).flatMap((v) => v.pieces ?? [])];
  return new Set(all.map((p) => String(p.label).replace(/\.$/, '').trim()));
};
/** The number-labelled sheets of the corpus (bare piece numbers: where a code can pass as one). */
const CORPUS_CASES: { id: string; truth: string }[] = [
  { id: 'robe', truth: 'robe' },
  { id: 'palto', truth: 'palto' },
  { id: 'viola', truth: 'viola' },
  { id: 'zhaket', truth: 'zhaket' },
  { id: 'reef', truth: 'reef' },
  { id: 'kombinezon-A', truth: 'kombinezon' },
  { id: 'blazer', truth: 'blazer' },
  // D6: both tile sheets in one case
  { id: 'polupalto', truth: 'polupalto' },
];
/** Holds reviewed by eye (TRUTH.md + the sheet): anything else on the corpus FAILS until reviewed. */
const REVIEWED: Record<string, string[]> = {
  // the burda article strip beside "7142" and "fashion", 11.1 mm against 17.4 mm piece numbers
  polupalto: ['0', '015', '15', '00'],
};

async function corpus(only: string[]) {
  const kept = new Map<string, Set<string>>();
  const holds: { id: string; truth: string; label: string }[] = [];
  for (const k of CORPUS_CASES) {
    if (only.length && !only.includes(k.id)) continue;
    const c = CASES.find((x) => x.id === k.id);
    if (!c) {
      check(`3 · ${k.id}: a case of the e2e table`, false);
      continue;
    }
    const t = Date.now();
    const out = await autoPieces(c);
    if (!out) {
      check(`3 · ${k.id}: the automatic pieces run`, false, 'no pieces stage reached');
      continue;
    }
    const lab = (sd: Seed) => sd.text?.text.trim().replace(/\.$/, '') ?? '';
    const ks = kept.get(k.truth) ?? new Set<string>();
    for (const sd of out.seeds) if (sd.origin === 'text') ks.add(lab(sd));
    kept.set(k.truth, ks);
    const codes = (out.setAside ?? []).filter((a) => a.reason === 'code-text');
    for (const a of codes)
      holds.push({ id: k.id, truth: k.truth, label: a.seed ? lab(a.seed) : '?' });
    console.log(
      `  ${k.id}: ${out.seeds.filter((s) => s.origin === 'text').length} text seeds · held as code [${codes.map((a) => `${a.seed ? lab(a.seed) : '?'} (${a.why})`).join('; ')}] · ${((Date.now() - t) / 1000).toFixed(0)} s`,
    );
    const want = REVIEWED[k.id] ?? [];
    const got = codes.map((a) => (a.seed ? lab(a.seed) : '?'));
    check(
      `3 · ${k.id}: the holds are the reviewed ones [${want.join(',')}]`,
      got.length === want.length && want.every((w) => got.includes(w)),
      `held [${got.join(',')}]`,
    );
  }
  // no TRUTH piece held: a held label that is a TRUTH piece number is printed as a kept piece
  // label elsewhere in the file (polupalto's 15 = Riegel, sheet A, 17.4 mm)
  for (const h of holds) {
    const isTruth = truthLabels(h.truth).has(h.label);
    const elsewhere = kept.get(h.truth)?.has(h.label) ?? false;
    check(
      `3 · ${h.id} “${h.label}”: no TRUTH piece held`,
      !isTruth || elsewhere,
      isTruth
        ? elsewhere
          ? 'a TRUTH number, kept as a piece label elsewhere in the file'
          : 'a TRUTH piece number held and printed nowhere else'
        : 'not a TRUTH piece',
    );
  }
}

export async function main(args: string[] = []): Promise<number> {
  const only = args.filter((a) => !a.startsWith('--'));
  if (!args.includes('--corpus-only')) {
    rule();
    await session();
  }
  if (!args.includes('--synthetic-only')) await corpus(only);
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  return fails;
}
