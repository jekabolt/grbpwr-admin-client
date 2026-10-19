// PATTERN-IMPORT · F4 probe entry (bundled by pieces.mjs). Real pipeline per sample:
//   extract (F1, cached) → classifyPages + assembleSheet (F2) → buildChainsDetailed (F3) →
//   detectSizeRun (F3) → proposeSeeds / fillPieces (F4) → compare with K0 truth.
// Modes:
//   prep [sample…]     build + cache sheet/chains/run per sample (tmpdir), print a summary
//   explore <sample>   texts, size classes, seeds — what the operator would see
//   run [sample…]      fill per sample, report table + overlays
//   all                prep (cached) + run every sample + negative control → reports/F4-<date>.{json,md}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';
import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import type { ChainSet, Sheet, SizeRun, SourceDoc } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { runPieces } from './pieces-run';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
export const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
export const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
export const CACHE = process.env.PATIMPORT_CACHE ?? resolve(tmpdir(), 'patimport-f4-cache');
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

export type Sample = { id: string; files: string[]; sheet: number };

const W = (s: string) => `wm_kka_15_01_${s}_wykroj.pdf`;
export const SAMPLES: Sample[] = [
  { id: 'kombinezon', files: ['kombinezon.pdf'], sheet: 0 },
  { id: 'robe', files: ['robe.pdf'], sheet: 0 },
  { id: 'palto', files: ['palto.pdf'], sheet: 0 },
  { id: 'viola', files: ['viola.pdf'], sheet: 0 },
  { id: 'reef', files: ['reef.pdf'], sheet: 0 },
  { id: 'r4454', files: ['r4454.pdf'], sheet: 0 },
  { id: 'blazer', files: ['blazer.pdf'], sheet: 0 },
  {
    id: 'redcafe',
    files: ['44.pdf', '46.pdf', '48.pdf', '50.pdf', '52.pdf', '54.pdf'],
    sheet: 0,
  },
  { id: 'wm', files: ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'].map(W), sheet: 0 },
  { id: 'polupalto', files: ['polupalto.pdf'], sheet: 0 },
];

const ab = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function mk(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadDoc(file: string, id: string): Promise<SourceDoc> {
  const cp = resolve(mk(CACHE), `doc-${file.replace(/\W+/g, '_')}.json`);
  if (existsSync(cp)) return JSON.parse(readFileSync(cp, 'utf8')) as SourceDoc;
  const doc = await extractPdf(
    { id, name: file, bytes: ab(resolve(CORPUS, 'pdf', file)) },
    DEFAULT_EXTRACT_OPTS,
  );
  writeFileSync(cp, JSON.stringify(doc));
  return doc;
}

export type Prepared = {
  sample: Sample;
  sheet: Sheet;
  set: ChainSet;
  run: SizeRun;
  /** Texts of every page (instructions, overview) — variant labels live there. */
  docTexts: string[];
  files: { id: string; name: string }[];
  ms: { assemble: number; chains: number };
};

export async function prepare(s: Sample, fresh = false): Promise<Prepared> {
  const cp = resolve(mk(CACHE), `prep-${s.id}-s${s.sheet}.json`);
  if (!fresh && existsSync(cp)) return JSON.parse(readFileSync(cp, 'utf8')) as Prepared;
  const docs: SourceDoc[] = [];
  for (let i = 0; i < s.files.length; i++) {
    const d = await loadDoc(s.files[i], String(i));
    // the cache was written with this sample's file index (same order) — keep ids consistent
    if (d.file.id !== String(i)) throw new Error(`cached doc ${s.files[i]} has id ${d.file.id}`);
    docs.push(d);
  }
  const t0 = Date.now();
  const classes = classifyPages(docs);
  const sheet = assembleSheet(docs, classes, s.sheet);
  const t1 = Date.now();
  const docTexts = docs.flatMap((d) => d.pages.flatMap((p) => p.texts.map((t) => t.text)));
  const fileNames = new Map(docs.map((d) => [d.file.id, d.file.name]));
  const { set } = buildChainsDetailed(
    sheet,
    {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    },
    { extraTexts: docTexts, fileNames },
  );
  const run = detectSizeRun(
    sheet,
    set,
    docs.map((d) => d.file),
  );
  const t2 = Date.now();
  const out: Prepared = {
    sample: s,
    sheet,
    set,
    run,
    docTexts,
    files: docs.map((d) => ({ id: d.file.id, name: d.file.name })),
    ms: { assemble: t1 - t0, chains: t2 - t1 },
  };
  writeFileSync(cp, JSON.stringify(out));
  return out;
}

function summary(p: Prepared) {
  const b = p.sheet.bbox;
  const sizeCls = p.set.classes.filter((c) => c.role === 'size');
  const roles = new Map<string, number>();
  for (const c of p.set.classes) roles.set(c.role, (roles.get(c.role) ?? 0) + c.chains.length);
  console.log(
    `${p.sample.id}: sheet ${(b.maxX - b.minX).toFixed(0)}×${(b.maxY - b.minY).toFixed(0)} paths=${p.sheet.paths.length} texts=${p.sheet.texts.length} chains=${p.set.chains.length} bundles=${p.set.bundles.length} run=${p.run.encoding} [${p.run.sizes.map((x) => x.label || '?').join(' ')}] roles=${[...roles].map(([k, v]) => `${k}:${v}`).join(' ')} sizeClasses=${sizeCls.length} (assemble ${p.ms.assemble} ms, chains ${p.ms.chains} ms)`,
  );
}

export async function main(argv: string[]) {
  const [mode = 'all', ...rest] = argv;
  const pick = (ids: string[]) =>
    ids.length ? SAMPLES.filter((s) => ids.includes(s.id)) : SAMPLES;
  if (mode === 'prep') {
    const fresh = rest.includes('--fresh');
    for (const s of pick(rest.filter((r) => !r.startsWith('--')))) {
      const t = Date.now();
      const p = await prepare(s, fresh);
      summary(p);
      console.log(`  ${Date.now() - t} ms`);
    }
    return 0;
  }
  if (mode === 'explore') {
    const p = await prepare(pick(rest)[0]);
    summary(p);
    const tx = p.sheet.texts.map((t) => t.text.trim()).filter(Boolean);
    console.log('  texts:', [...new Set(tx)].slice(0, 200).join(' | '));
    for (const a of p.set.ambiguities ?? []) console.log('  ambiguity', a.kind, a.message);
    return 0;
  }
  return runPieces(mode, rest, pick, prepare);
}
