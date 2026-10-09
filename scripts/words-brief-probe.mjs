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
//   node scripts/words-brief-probe.mjs --mutate-context  ключ памяти — один текст, без контекста
//                                                     (до R3): чужие факты берут старый бриф, краснеет
//   node scripts/words-brief-probe.mjs --mutate-wait  GENERATE не ждёт бриф в пути (до R2), краснеет
//   node scripts/words-brief-probe.mjs --mutate-generate  флэт отдаёт засев ДО ожидания брифа, краснеет
//   node scripts/words-brief-probe.mjs --mutate-follow  T56: правленые руками слова переписываются
//                                                     сами (без ссылки), краснеет

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_RAW = process.argv.includes('--mutate-raw');
const MUTATE_MEMO = process.argv.includes('--mutate-memo');
const MUTATE_CONTEXT = process.argv.includes('--mutate-context');
const MUTATE_WAIT = process.argv.includes('--mutate-wait');
const MUTATE_GENERATE = process.argv.includes('--mutate-generate');
const MUTATE_FOLLOW = process.argv.includes('--mutate-follow');
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
    swap(/design\/words-brief\.ts$/, '  if (!key || memo.has(key)) return;', '  if (!key) return;'),
  );

if (MUTATE_CONTEXT)
  plugins.push(
    swap(
      /design\/words-brief\.ts$/,
      "  return JSON.stringify(field === 'words' ? [text, context] : [text, context, field]);",
      '  return text;',
    ),
  );

if (MUTATE_WAIT)
  plugins.push(
    swap(
      /design\/words-brief\.ts$/,
      "  if (!seedBriefInFlight(card)) return 'none';",
      "  return 'none';",
    ),
  );

if (MUTATE_FOLLOW)
  plugins.push(
    swap(
      /design\/words-follow\.ts$/,
      "  return own.trim() === rec.text.trim() ? 'auto' : 'offer';",
      "  return 'auto';",
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
const W = await bundle(resolve(DESIGN, 'words-follow.ts'), 'follow');

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
  ck(B.readBrief('concept: A', 'ctx')?.status === 'pending', 'pending while in flight');
  await new Promise((r) => setTimeout(r, 0));
  B.requestBrief('concept: A', 'ctx', fetcher);
  ck(calls.length === 1, 'same text → one call', `calls=${calls.length}`);
  ck(B.readBrief('concept: A', 'ctx')?.text === BRIEF, 'answer stored trimmed');
  fail = true;
  B.requestBrief('concept: B', 'ctx', fetcher);
  await new Promise((r) => setTimeout(r, 0));
  B.requestBrief('concept: B', 'ctx', fetcher);
  ck(
    B.readBrief('concept: B', 'ctx')?.status === 'failed' && calls.length === 2,
    'failure is remembered, not retried',
    `calls=${calls.length}`,
  );
}

console.log('\nR3: память по тексту + контексту (факты карточки)');
{
  B.resetBriefs();
  const calls = [];
  const fetcher = async (req) => {
    calls.push(req);
    return `brief for ${req.context}`;
  };
  B.requestBrief('concept: A', 'fit: slim', fetcher);
  await new Promise((r) => setTimeout(r, 0));
  ck(
    B.readBrief('concept: A', 'fit: oversized') === undefined,
    'same text, other facts → no stale brief',
    JSON.stringify(B.readBrief('concept: A', 'fit: oversized')),
  );
  B.requestBrief('concept: A', 'fit: oversized', fetcher);
  await new Promise((r) => setTimeout(r, 0));
  ck(
    calls.length === 2 && calls[1].context === 'fit: oversized',
    'other facts → a new call with them',
    `calls=${calls.length}`,
  );
  ck(
    B.readBrief('concept: A', 'fit: slim')?.text === 'brief for fit: slim' &&
      B.readBrief('concept: A', 'fit: oversized')?.text === 'brief for fit: oversized',
    'each pair keeps its own brief',
  );
  ck(
    B.briefKey('a', 'x') !== B.briefKey('a', 'y') && B.briefKey('', 'x') === '',
    'debounce identity = text + context; no text → empty key',
  );
}

console.log('\nR2: GENERATE ждёт бриф в пути');
{
  B.resetBriefs();
  const card = 7;
  const key = B.briefKey('concept: W', 'ctx');
  let answer;
  const fetcher = () => new Promise((r) => (answer = r));
  B.noteSeedBrief(card, key);
  ck((await B.settleSeedBrief(card, 50)) === 'none', 'nothing in flight → no wait');
  B.requestBrief('concept: W', 'ctx', fetcher);
  ck(B.seedBriefInFlight(card), 'brief of the current pair is in flight');
  let settled = null;
  const first = B.settleSeedBrief(card, 5000).then((r) => (settled = r));
  ck(B.briefAwaited(card), 'GENERATE is waiting (the seed may pass the run lock)');
  ck((await B.settleSeedBrief(card, 50)) === 'busy', 'second press while waiting → busy');
  await new Promise((r) => setTimeout(r, 20));
  ck(settled === null, 'still waiting while the brief is pending');
  answer('a brief');
  await first;
  ck(
    settled === 'waited' && B.readBrief('concept: W', 'ctx')?.text === 'a brief',
    'answer arrives → the wait ends with the brief stored',
    `${settled}`,
  );
  ck(!B.briefAwaited(card), 'wait released');

  B.requestBrief('concept: T', 'ctx', () => new Promise(() => {}));
  B.noteSeedBrief(card, B.briefKey('concept: T', 'ctx'));
  const t0 = Date.now();
  const timed = await B.settleSeedBrief(card, 40);
  ck(timed === 'waited' && Date.now() - t0 >= 35, 'no answer → gives up after the timeout');
  ck(B.BRIEF_WAIT_MS === 20000, 'timeout is 20 s');

  const gone = B.settleSeedBrief(card, 5000);
  B.noteSeedBrief(card, '');
  ck((await gone) === 'waited', 'seed stops wanting the brief → the wait ends');
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
  let flat = readFileSync(resolve(DESIGN, 'flat-run-row.tsx'), 'utf8');
  if (MUTATE_GENERATE)
    flat = flat.replace(
      '      const brief = await settleSeedBrief(card);\n',
      '      materializeWords(card, form, wasOn && !disabled);\n      const brief = await settleSeedBrief(card);\n',
    );
  const render = readFileSync(resolve(DESIGN, 'render/render-studio.tsx'), 'utf8');
  const waitAt = flat.indexOf('await settleSeedBrief(card)');
  const giveAt = flat.indexOf('materializeWords(card, form');
  ck(
    waitAt > 0 && giveAt > waitAt,
    'flat GENERATE waits for the brief before giving WORDS to the form',
  );
  ck(
    flat.includes("brief === 'waited' && (cardNow.current !== card || !cardOnScreen(card))"),
    'flat re-checks the card after the wait',
  );
  ck(
    render.includes('await settleSeedBrief(card)') &&
      render.includes('shownCard.current !== card') &&
      render.includes('pending={run.isPending || briefing}'),
    'render GENERATE waits too, re-checks the card, button busy meanwhile',
  );
  ck(
    hook.includes("noteSeedBrief(techCardId, wantsBrief ? key : '')") &&
      hook.includes('if (wordsBusy && !briefAwaited(techCardId)) return;'),
    'seed names its pair and passes the run lock only while GENERATE waits',
  );
  ck(hook.includes('composeWords(facts, WORDS_MAX, planBrief)'), 'composeWords gets the brief');
  ck(hook.includes("if (planState === 'wait') return;"), 'seed waits while the brief is pending');
  ck(hook.includes("if (planState === 'keep') return;"), 'a failed brief keeps the shown seed');
  ck(hook.includes("mode: 'prompt', field: 'words'"), 'EnhanceText PROMPT · WORDS');
  ck(
    hook.includes('const key = briefKey(source.text, source.context);') &&
      hook.includes('useSettled(key, BRIEF_SETTLE_MS)') &&
      hook.includes('briefPlan(key, settled, brief)'),
    'debounce settles on text + context',
  );
}

console.log('\nT56: WORDS и IN WORDS догоняют мудборд');
{
  const rec = { source: 'k1', text: 'auto words' };
  ck(W.followPlan('', rec, 'k2', 'k2') === 'none', 'empty words → seed decides, not follow');
  ck(W.followPlan('auto words', rec, 'k2', 'k1') === 'none', 'source still settling → wait');
  ck(W.followPlan('auto words', rec, 'k1', 'k1') === 'none', 'same source → nothing');
  ck(W.followPlan('typed', null, 'k1', 'k1') === 'baseline', 'no record → baseline');
  ck(
    W.followPlan('auto words', rec, 'k2', 'k2') === 'auto',
    'untouched auto text → rewrite itself',
  );
  ck(W.followPlan('hand edit', rec, 'k2', 'k2') === 'offer', 'hand-edited → offer the link');
  ck(
    W.followPlan('typed', { source: 'k1', text: '' }, 'k2', 'k2') === 'offer',
    'baseline record never auto-rewrites',
  );
  ck(
    B.briefKey('t', 'c') === JSON.stringify(['t', 'c']) &&
      B.briefKey('t', 'c', 'render-words') !== B.briefKey('t', 'c'),
    'render brief has its own memo key; flat key unchanged',
  );
  const hook = readFileSync(resolve(DESIGN, 'use-words-seeding.ts'), 'utf8');
  ck(
    hook.includes("mode: 'prompt', field: 'render-words'") &&
      hook.includes("setValue('garmentDescription', composed.text, { shouldDirty: true })"),
    'render asks RENDER_WORDS; flat rewrite is a dirty form change',
  );
}

console.log(
  `\n${total - bad} / ${total}, failures ${bad}${MUTATE_FOLLOW ? '  (--mutate-follow)' : ''}${MUTATE_RAW ? '  (--mutate-raw)' : ''}${MUTATE_MEMO ? '  (--mutate-memo)' : ''}${MUTATE_CONTEXT ? '  (--mutate-context)' : ''}${MUTATE_WAIT ? '  (--mutate-wait)' : ''}${MUTATE_GENERATE ? '  (--mutate-generate)' : ''}`,
);
process.exit(bad ? 1 : 0);
