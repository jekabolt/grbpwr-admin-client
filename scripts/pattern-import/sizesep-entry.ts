// PATTERN-IMPORT · SIZESEP honesty probe (bundled by sizesep.mjs). A labelled sheet whose sizes have
// a look each (polupalto: 44 crosses … 54 thick, key on the sheet) is ranked look by look only where
// the look order, the inside vote and the labels on the look lines agree (sizes/look-order.ts).
// The probe runs the real chains + sizes steps on both polupalto sheets and r4454 (text-label too,
// must not move), with the fix off and on, then on three mutated inputs that must NOT be ranked by
// look (the step goes back to asking):
//   labels-swapped   the boxed labels 44↔54, 46↔52, 48↔50 (the run text stays): labels contradict
//                    the nesting
//   looks-merged     every 50 line drawn in the 48 look: no section shows six looks
//   looks-shuffled   every size line drawn in a random size look: no order dominates
// The truth per polupalto chain is its pen (width + dash), read from the sheet's key, never from the
// engine's rows. Output: one table on stdout, JSON in PATIMPORT_REPORTS (default os tmpdir).
//   node scripts/pattern-import/sizesep.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';
import { furniture } from 'lib/pattern-import/chains/classify';
import { makeChains, type ChainBuild } from 'lib/pattern-import/chains/make';
import { recoverSizes, type RecoverOut } from 'lib/pattern-import/sizes/recover';
import type { Chain, Sheet, SourceDoc, Style } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS = process.env.PATIMPORT_REPORTS ?? tmpdir();
const CACHE = process.env.PATIMPORT_CACHE ?? resolve(tmpdir(), 'patimport-sizesep-cache');
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const mk = (d: string) => (existsSync(d) || mkdirSync(d, { recursive: true }), d);

async function loadDoc(file: string): Promise<SourceDoc> {
  const cp = resolve(mk(CACHE), `doc-${file.replace(/\W+/g, '_')}.json`);
  if (existsSync(cp)) return JSON.parse(readFileSync(cp, 'utf8')) as SourceDoc;
  const b = readFileSync(resolve(CORPUS, 'pdf', file));
  const doc = await extractPdf(
    {
      id: '0',
      name: file,
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
    DEFAULT_EXTRACT_OPTS,
  );
  writeFileSync(cp, JSON.stringify(doc));
  return doc;
}

/** polupalto's key (drawn on the sheet): 44 crosses, 46 diamonds (0.35 mm), 48 dash, 50 long dash,
 *  52 dots (0.5 mm), 54 solid 1 mm. */
function poluTruth(c: Chain, styles: Map<number, Style>): number {
  const w = styles.get(c.style)?.widthMm ?? 0;
  const m = c.motif;
  if (!m || !m.length) return Math.abs(w - 1) < 0.05 ? 5 : -1;
  const m0 = m[0];
  if (Math.abs(w - 0.35) < 0.03 && Math.abs(m0 - 1.25) < 0.05) return 0;
  if (Math.abs(w - 0.35) < 0.03 && m0 >= 4.8 && m0 <= 5.4) return 1;
  if (Math.abs(w - 0.5) < 0.03 && m.length >= 4 && Math.abs(m0 - 9) < 0.3) return 3;
  if (Math.abs(w - 0.5) < 0.03 && Math.abs(m0 - 1.5) < 0.1) return 2;
  if (Math.abs(w - 0.5) < 0.03 && Math.abs(m0 - 0.5) < 0.1) return 4;
  return -1;
}

type Mutation = 'none' | 'labels-swapped' | 'looks-merged' | 'looks-shuffled';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function mutate(sheet: Sheet, build: ChainBuild, truth: number[], m: Mutation): Sheet {
  if (m === 'labels-swapped') {
    const swap: Record<string, string> = {
      '44': '54',
      '54': '44',
      '46': '52',
      '52': '46',
      '48': '50',
      '50': '48',
    };
    return {
      ...sheet,
      texts: sheet.texts.map((t) =>
        swap[t.text.trim()] ? { ...t, text: swap[t.text.trim()] } : t,
      ),
    };
  }
  if (m === 'none') return sheet;
  // a reference line per look: the longest reliable line in the look's commonest pen (the longest
  // line of all can be an odd one — a corner drawn as one stroke — and would make a seventh look)
  const ref = new Array<number>(6).fill(-1);
  for (let r = 0; r < 6; r++) {
    const byPen = new Map<string, number>();
    const pen = (i: number) => `${build.chains[i].style}|${build.chains[i].motif?.join('/') ?? ''}`;
    truth.forEach((t, i) => {
      if (t === r) byPen.set(pen(i), (byPen.get(pen(i)) ?? 0) + build.chains[i].lengthMm);
    });
    const top = [...byPen].sort((a, b) => b[1] - a[1])[0]?.[0];
    truth.forEach((t, i) => {
      if (t !== r || pen(i) !== top || !build.sigs[i].reliable) return;
      if (ref[r] < 0 || build.chains[i].lengthMm > build.chains[ref[r]].lengthMm) ref[r] = i;
    });
  }
  const draw = (i: number, r: number) => {
    const j = ref[r];
    if (j < 0 || j === i) return;
    build.sigs[i] = build.sigs[j];
    build.chains[i] = {
      ...build.chains[i],
      style: build.chains[j].style,
      motif: build.chains[j].motif,
    };
  };
  const rnd = rng(19);
  truth.forEach((r, i) => {
    if (r < 0) return;
    if (m === 'looks-merged' && r === 3) draw(i, 2);
    if (m === 'looks-shuffled') draw(i, Math.floor(rnd() * 6));
  });
  return sheet;
}

type Row = {
  case: string;
  fix: boolean;
  mutation: Mutation;
  encoding: string;
  lookOrder: string;
  rankedByLook: boolean;
  /** truth length (m): right / wrong / not ranked; polupalto only */
  right: number;
  wrong: number;
  none: number;
  /** per truth rank: engine rank → length (m) */
  perLook: Record<number, Record<number, number>>;
  /** chains moved vs the fix off (r4454), length m */
  moved: number;
  asks: Record<string, number>;
};

function score(
  name: string,
  fix: boolean,
  m: Mutation,
  rec: RecoverOut,
  truth: number[] | null,
  pathTruth: Map<number, number>,
): Row {
  const asks: Record<string, number> = {};
  for (const a of rec.ambiguities) {
    const k = /drawn in \d+ looks/.test(a.message) ? `${a.kind}:split-looks` : a.kind;
    asks[k] = (asks[k] ?? 0) + 1;
  }
  const row: Row = {
    case: name,
    fix,
    mutation: m,
    encoding: rec.encoding,
    lookOrder: String(rec.diag.lookOrder ?? '—'),
    rankedByLook: /ranked by look$/.test(String(rec.diag.lookOrder ?? '')),
    right: 0,
    wrong: 0,
    none: 0,
    perLook: {},
    moved: 0,
    asks,
  };
  if (!truth) return row;
  rec.chains.forEach((c, i) => {
    // split chains (ids past the built ones): the truth of the line they were cut from
    const t = i < truth.length ? truth[i] : pathTruth.get(c.ranges[0]?.path ?? -1) ?? -1;
    if (t < 0) return;
    const L = c.lengthMm / 1000;
    const e = rec.rankOf.get(i);
    const pl = (row.perLook[t] ??= {});
    pl[e ?? -1] = (pl[e ?? -1] ?? 0) + L;
    if (e === undefined) row.none += L;
    else if (e === t) row.right += L;
    else row.wrong += L;
  });
  return row;
}

function runOne(
  name: string,
  sheet0: Sheet,
  base: ChainBuild,
  extraTexts: string[],
  fix: boolean,
  m: Mutation,
  truthOf: ((c: Chain, s: Map<number, Style>) => number) | null,
): { row: Row; rec: RecoverOut } {
  const build: ChainBuild = structuredClone(base);
  const styles = new Map<number, Style>(sheet0.styles.map((s) => [s.id, s]));
  const truth = truthOf ? build.chains.map((c) => truthOf(c, styles)) : null;
  const pathTruth = new Map<number, number>();
  if (truth)
    build.chains.forEach((c, i) => {
      for (const r of c.ranges) pathTruth.set(r.path, truth[i]);
    });
  const sheet = mutate(sheet0, build, truth ?? [], m);
  const furn = furniture(build.chains, styles, sheet.poses, sheet.texts);
  const opLinked = build.work.map((w) => {
    const ops = new Set(w.items.map((l) => l.it.op));
    return w.items.length >= 3 && ops.size < w.items.length / 2;
  });
  if (fix) delete process.env.SIZESEP_OFF;
  else process.env.SIZESEP_OFF = '1';
  const rec = recoverSizes({
    sheet,
    chains: build.chains,
    sigs: build.sigs,
    furniture: furn,
    opLinked,
    extraTexts,
    fileNames: new Map([['0', name]]),
  });
  delete process.env.SIZESEP_OFF;
  return { row: score(name, fix, m, rec, truth, pathTruth), rec };
}

const f1 = (v: number) => v.toFixed(1);

export async function main(): Promise<number> {
  const cases: { file: string; sheet: number; truth: boolean }[] = [
    { file: 'polupalto.pdf', sheet: 0, truth: true },
    { file: 'polupalto.pdf', sheet: 1, truth: true },
    { file: 'r4454.pdf', sheet: 0, truth: false },
  ];
  const rows: Row[] = [];
  const fails: string[] = [];
  for (const cs of cases) {
    const doc = await loadDoc(cs.file);
    const sheet = assembleSheet([doc], classifyPages([doc]), cs.sheet);
    const docTexts = doc.pages.flatMap((p) => p.texts.map((t) => t.text));
    const base = makeChains(sheet, {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    });
    const name = `${cs.file.replace(/\.pdf$/, '')}#${cs.sheet}`;
    const truthOf = cs.truth ? poluTruth : null;
    const off = runOne(name, sheet, base, docTexts, false, 'none', truthOf);
    const on = runOne(name, sheet, base, docTexts, true, 'none', truthOf);
    on.row.moved = 0;
    on.rec.chains.forEach((c, i) => {
      if (on.rec.rankOf.get(i) !== off.rec.rankOf.get(i)) on.row.moved += c.lengthMm / 1000;
    });
    rows.push(off.row, on.row);
    if (cs.truth) {
      if (!on.row.rankedByLook) fails.push(`${name}: the unmutated sheet is not ranked by look`);
      if (on.row.wrong > 0.02 * (on.row.right + on.row.wrong + on.row.none))
        fails.push(`${name}: ${f1(on.row.wrong)} m wrong with the fix`);
      if (on.row.right < off.row.right) fails.push(`${name}: right went down`);
      for (const m of ['labels-swapped', 'looks-merged', 'looks-shuffled'] as const) {
        const mu = runOne(name, sheet, base, docTexts, true, m, truthOf);
        rows.push(mu.row);
        if (mu.row.rankedByLook) fails.push(`${name} ${m}: ranked by look on a mutated sheet`);
        const offAsks = Object.values(mu.row.asks).reduce((a, b) => a + b, 0);
        if (!offAsks) fails.push(`${name} ${m}: no question left`);
      }
    } else if (on.row.moved > 0) fails.push(`${name}: ${f1(on.row.moved)} m changed rank`);
  }
  console.log(
    'case          fix mutation        right  wrong  none(m)  moved  asks                    look order',
  );
  for (const r of rows)
    console.log(
      `${r.case.padEnd(13)} ${r.fix ? 'on ' : 'off'} ${r.mutation.padEnd(15)} ${f1(r.right).padStart(6)} ${f1(r.wrong).padStart(6)} ${f1(r.none).padStart(6)}  ${f1(r.moved).padStart(6)}  ${JSON.stringify(r.asks).padEnd(24)} ${r.lookOrder}`,
    );
  for (const r of rows)
    if (Object.keys(r.perLook).length && r.mutation === 'none')
      console.log(
        `  ${r.case} fix ${r.fix ? 'on ' : 'off'} truth→engine (m):`,
        Object.entries(r.perLook)
          .map(
            ([t, e]) =>
              `${t}:{${Object.entries(e)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k}=${f1(v)}`)
                .join(' ')}}`,
          )
          .join('  '),
      );
  const out = resolve(mk(REPORTS), 'SIZESEP-probe.json');
  writeFileSync(out, JSON.stringify({ rows, fails }, null, 1));
  console.log(fails.length ? `FAIL\n  ${fails.join('\n  ')}` : 'PASS', '·', out);
  return fails.length ? 1 : 0;
}
