#!/usr/bin/env node
// WORDS = АНГЛИЙСКИЙ БРИФ, А НЕ СЫРОЙ ТЕКСТ МУДБОРДА (T03, волна moodboard-flats 03.10).
//
// Владелец: «если у нас в MOODBOARD - DESCRIPTION - CONCEPT & CONSTRUCTION DESCRIPTION описан на
// русском или на любом другом языке он не должен попадать flats INPUT — REFERENCES WORDS в том же
// виде… в WORDS должна быть хороший промпт для последующей генерации флетов».
//
// Проверяются НАСТОЯЩИЕ `core/card-facts.ts` и `words-brief.ts` (бандл esbuild); RPC — заглушка
// `fetcher`, сети нет.
//   node scripts/words-brief-probe.mjs                прогон
//   node scripts/words-brief-probe.mjs --mutate-raw   `composeWords` снова копирует все строки
//                                                     фактов (поведение до T03) — краснеет
//   node scripts/words-brief-probe.mjs --mutate-memo  память брифа забывает текст — второй вызов
//                                                     на тот же текст, краснеет

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_RAW = process.argv.includes('--mutate-raw');
const MUTATE_MEMO = process.argv.includes('--mutate-memo');
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DESIGN = resolve(REPO, 'src/components/managers/tech-card/components/design');

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const swap = (filter, needle, replacement) => ({
  name: `swap:${needle.slice(0, 24)}`,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle)) throw new Error(`mutation did not find its line in ${args.path}`);
      return { contents: src.replace(needle, replacement), loader: 'ts' };
    });
  },
});
const plugins = [];
if (MUTATE_RAW)
  plugins.push(
    swap(
      /core\/card-facts\.ts$/,
      '  const lines = structuredLines(f);\n  const b = (brief',
      '  const lines = cardFactLines({ ...f, materials: undefined });\n  const b = (brief',
    ),
  );
if (MUTATE_MEMO)
  plugins.push(
    swap(
      /design\/words-brief\.ts$/,
      '  if (!text || memo.has(text)) return;',
      '  if (!text) return;',
    ),
  );

const bundle = async (entry, tag) => {
  const outfile = resolve(REPO, `scripts/.words-brief-${tag}-${process.pid}.mjs`);
  await esbuild({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    absWorkingDir: REPO,
    outfile,
    logLevel: 'silent',
    plugins,
    external: ['react'],
  });
  const m = await import(pathToFileURL(outfile).href);
  rmSync(outfile, { force: true });
  return m;
};
const F = await bundle(resolve(DESIGN, 'core/card-facts.ts'), 'facts');
const B = await bundle(resolve(DESIGN, 'words-brief.ts'), 'brief');

const RU = 'Объёмная куртка с асимметричной застёжкой, настроение — северный лес';
const facts = {
  categoryPath: 'outerwear › jackets › bomber',
  fit: 'oversized',
  gender: 'unisex',
  concept: RU,
  silhouette: 'укороченный, широкие плечи',
  aspects: [['closure', 'молния справа']],
  callouts: ['карман на рукаве'],
  materials: ['shell · nylon · 100% PA'],
};
const BRIEF = 'cropped oversized bomber, dropped wide shoulders, offset front zip, sleeve pocket';

console.log('\nWORDS без брифа: только строки словаря, сырого текста нет');
{
  const { text } = F.composeWords(facts, 2000);
  ck(!/[А-яЁё]/.test(text), 'no Cyrillic in WORDS', JSON.stringify(text));
  ck(!text.includes('description:'), 'no `description: <concept>` line');
  ck(
    text.startsWith('garment: bomber jacket\nfit: oversized\nfor: unisex'),
    'dictionary lines kept, in order',
  );
  ck(!text.includes('materials'), 'materials stay out of WORDS (O-35)');
}

console.log('\nWORDS с брифом');
{
  const { text } = F.composeWords(facts, 2000, BRIEF);
  ck(
    text.endsWith(`\n${BRIEF}`) && !/[А-яЁё]/.test(text),
    'brief follows the dictionary lines',
    JSON.stringify(text),
  );
}

console.log('\nисточник брифа');
{
  const src = F.wordsBriefSource(facts);
  ck(src.text.includes(`concept: ${RU}`), 'concept goes to the brief call');
  ck(
    src.text.includes('closure: молния справа') &&
      src.text.includes('notes on the board: карман на рукаве'),
    'construction + board notes go too',
  );
  ck(
    src.context.includes('garment: bomber jacket') && !src.context.includes('concept'),
    'context = dictionary lines only',
  );
  ck(F.wordsBriefSource({ categoryPath: 'tops' }).text === '', 'no free text → nothing to call');
}

console.log('\nодин вызов на текст, отказ без повторов');
{
  B.resetBriefs();
  const calls = [];
  let fail = false;
  const fetcher = async (req) => {
    calls.push(req);
    if (fail) throw new Error('rate limited');
    return `  ${BRIEF}  `;
  };
  B.requestBrief('concept: A', 'ctx', fetcher);
  B.requestBrief('concept: A', 'ctx', fetcher);
  ck(B.readBrief('concept: A')?.status === 'pending', 'pending while in flight');
  await new Promise((r) => setTimeout(r, 0));
  B.requestBrief('concept: A', 'ctx', fetcher);
  ck(calls.length === 1, 'same text → one call', `calls=${calls.length}`);
  ck(B.readBrief('concept: A')?.text === BRIEF, 'answer stored trimmed');
  fail = true;
  B.requestBrief('concept: B', 'ctx', fetcher);
  await new Promise((r) => setTimeout(r, 0));
  B.requestBrief('concept: B', 'ctx', fetcher);
  ck(
    B.readBrief('concept: B')?.status === 'failed' && calls.length === 2,
    'failure is remembered, not retried',
    `calls=${calls.length}`,
  );
}

console.log('\nплан засева');
{
  const done = { status: 'done', text: BRIEF };
  ck(B.briefPlan('', '', undefined).brief === undefined, 'no free text → dictionary lines only');
  ck(B.briefPlan('a b', 'a', done) === 'wait', 'still typing → wait');
  ck(B.briefPlan('a', 'a', { status: 'pending' }) === 'wait', 'in flight → wait');
  ck(B.briefPlan('a', 'a', { status: 'failed' }) === 'keep', 'failed → keep what is shown');
  ck(B.briefPlan('a', 'a', done).brief === BRIEF, 'done → brief');
}

console.log('\nпровод: засев WORDS ходит через бриф');
{
  const hook = readFileSync(resolve(DESIGN, 'use-words-seeding.ts'), 'utf8');
  ck(hook.includes('composeWords(facts, WORDS_MAX, planBrief)'), 'composeWords gets the brief');
  ck(hook.includes("if (planState === 'wait') return;"), 'seed waits while the brief is pending');
  ck(hook.includes("if (planState === 'keep') return;"), 'a failed brief keeps the shown seed');
  ck(hook.includes("mode: 'prompt', field: 'words'"), 'EnhanceText PROMPT · WORDS');
}

console.log(
  `\n${total - bad} / ${total}, failures ${bad}${MUTATE_RAW ? '  (--mutate-raw)' : ''}${MUTATE_MEMO ? '  (--mutate-memo)' : ''}`,
);
process.exit(bad ? 1 : 0);
