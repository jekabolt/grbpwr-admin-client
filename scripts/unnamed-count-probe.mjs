#!/usr/bin/env node
// СЧЁТЧИК НЕНАЗВАННЫХ ШАГОВ: ОДНА СТРОКА В ШАПКЕ РЕЛЬСА — ИЛИ НИ ОДНОЙ (Д6).
//
// ДЕФЕКТ, РАДИ КОТОРОГО ПРОБА. Масштаб «шагов без работы» не был виден по клиенту НИЧЕМ: поиск
// «need a kind» по репозиторию пуст, значка не было ни на шаге, ни в шапке, и узнать, что после
// 0331 на проде 111 строк из 126 не несут работы, можно было только запросом к базе. Владелец
// правил карточку, не зная, сколько в ней шагов зовут себя старым выводом.
//
// ЦИТАТЫ:
//   А — 10 шагов, 8 без работы: счётчик показывает ИМЕННО 8, и стоит он В ОДНОМ экземпляре
//       (по-шаговое ворчание — отдельная жалоба владельца, и оно обязано отсутствовать);
//   Б — работа есть у ВСЕХ: строки НЕТ ВОВСЕ. Не «0 steps», не пустой узел — узла нет;
//   В — единственное «не названо» это ПУСТАЯ строка: пробел и tab считаются пустотой, а токен,
//       которого не знает каталог, — названием (иначе счётчик считал бы «незнакомое» «неназванным»
//       и врал бы про масштаб ровно на отставании бандла);
//   Г — слова строки не упрекают и не требуют: ни «need», ни «missing», ни «required».
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ (приём взят у press-action-probe и step-name-probe):
// правка исходника ради проверки — это правка, которую однажды забудут откатить.
//   node scripts/unnamed-count-probe.mjs                  прогон
//   node scripts/unnamed-count-probe.mjs --mutate-countall  в счёт идут ВСЕ шаги, а не безработные
//   node scripts/unnamed-count-probe.mjs --mutate-zeroline  ноль перестаёт прятать строку
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui) — обе откатаны:
//   --mutate-countall → 5 провалов: цитата А получила «10 of 10» вместо восьми, цитата Б выросла
//                     строкой над исправной карточкой, цитата В — те же 10. Проверка «счётчик
//                     ОДИН» при этом ЗЕЛЁНАЯ, и это по делу: считать не то и ворчать по шагу —
//                     два РАЗНЫХ дефекта, и одна проверка не имеет права ловить оба;
//   --mutate-zeroline → 2 провала, ровно цитата Б: число осталось верным везде, но ноль перестал
//                     прятать строку. Цитаты А и В зелёные — доказательство, что Б стоит отдельно
//                     и стережёт именно молчание, а не арифметику.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_COUNTALL = process.argv.includes('--mutate-countall');
const MUTATE_ZEROLINE = process.argv.includes('--mutate-zeroline');

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* дальше — кэш npx */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}

const entryPath = resolvePlaywright();
if (!entryPath) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `unnamed-count-${process.pid}.js`);

// ── МУТАЦИИ ──────────────────────────────────────────────────────────────────────────────────────
//
// Первая — та, о которой просит гейт: СЧИТАТЬ НЕ ТО. В счёт идут все шаги подряд, включая
// названные. Это самый правдоподобный промах (`n + 1` вместо предиката) и самый вредный: число
// выглядит настоящим и завышает масштаб ровно на долю сделанной работы.
const COUNTALL_FIX = `  const unnamed = operations.reduce(
    (n, o) => n + (((o?.work ?? '') as string).trim() ? 0 : 1),
    0,
  );`;
const COUNTALL_BROKEN = `  const unnamed = operations.reduce((n) => n + 1, 0);`;
// Вторая — адверсарная: НОЛЬ ПЕРЕСТАЁТ ПРЯТАТЬ СТРОКУ. Соблазн выглядит доброжелательно
// («пусть счётчик всегда на месте, чтобы глаз знал, где смотреть»), а на деле вешает над
// исправной карточкой отчёт о нуле — и учит пролистывать то самое место, где однажды появится
// настоящее число.
const ZEROLINE_FIX = `  if (!unnamed) return null;`;
const ZEROLINE_BROKEN = `  if (false) return null;`;

const patcher = (filter, pairs, loader) => ({
  name: 'unnamed-count-mutation',
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const plugins = [];
if (MUTATE_COUNTALL)
  plugins.push(patcher(/operations-field\.tsx$/, [[COUNTALL_FIX, COUNTALL_BROKEN]], 'tsx'));
if (MUTATE_ZEROLINE)
  plugins.push(patcher(/operations-field\.tsx$/, [[ZEROLINE_FIX, ZEROLINE_BROKEN]], 'tsx'));

await esbuild({
  entryPoints: [resolve(HERE, 'unnamed-count-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins,
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

// ── ФИКСТУРЫ ─────────────────────────────────────────────────────────────────────────────────────
//
// Шаги нарочно ОДНОРОДНЫ по всему, кроме `work`: счётчик обязан считать ось работы и ничего кроме
// неё, и однородность делает любой другой ответ невозможным по построению.
const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
};
const step = (work) => ({
  operationType: T.MACHINE,
  machineType: T.LOCKSTITCH,
  zone: T.ZONE,
  ...(work === undefined ? {} : { work }),
});

// А — 10 шагов, 8 из них без работы. Два названных стоят НЕ подряд и НЕ с краю: счётчик, считающий
// «до первого названного» или «с конца», дал бы на такой раскладке другое число.
const TEN_EIGHT_BLANK = [
  step(),
  step('topstitch'),
  step(),
  step(),
  step(),
  step('press_flat'),
  step(),
  step(),
  step(),
  step(),
];
// Б — работа есть у всех десяти, включая ТОКЕН, КОТОРОГО НЕТ В КАТАЛОГЕ: «названо» это непустая
// строка, а не «узнано». Иначе счётчик врал бы про масштаб ровно на отставании бандла от сервера.
const TEN_ALL_NAMED = [
  step('topstitch'),
  step('press_flat'),
  step('txt_unknown_to_catalog'),
  step('topstitch'),
  step('moscow_hem'),
  step('press_flat'),
  step('topstitch'),
  step('txt_unknown_to_catalog'),
  step('press_flat'),
  step('topstitch'),
];
// В — пустота бывает и из пробелов: черновик из localStorage и правка руками оставляют ' ' и '\t'.
const TEN_WHITESPACE = [
  step(' '),
  step('topstitch'),
  step('\t'),
  step('   '),
  step(''),
  step('press_flat'),
  step(),
  step(' \t '),
  step(''),
  step(''),
];
// Единственный шаг — ветка единственного числа. «1 of 1 steps» читается как опечатка.
const ONE_BLANK = [step()];

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 2400 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
// Каталог работ ОТВЕЧАЕТ ПУСТО НАРОЧНО: счётчик не имеет права зависеть от того, узнаны ли токены.
await page.route('http://stub.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"works":[]}' }),
);

async function mount(steps) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((s) => window.__unnamed.mount(s), steps);
  await page.waitForSelector(`[data-rail-step="${steps.length - 1}"]`, { timeout: 20000 });
  // Каталог — сетевой запрос, приезжает ПОСЛЕ первого кадра. Ждём его, иначе «строки нет» могло
  // бы означать «экран ещё не дорисовался».
  await page.waitForTimeout(400);
}

/** Все узлы счётчика на экране — их количество и есть проверка «одна строка, а не по шагу». */
const counters = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-unnamed-steps]')].map((n) => ({
      attr: n.getAttribute('data-unnamed-steps'),
      text: (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
/** Сколько раз фраза встречается во ВСЁМ дереве — ловит по-шаговое ворчание мимо селектора. */
const phraseHits = () =>
  page.evaluate(() => ((document.body.innerText ?? '').match(/not named yet/g) ?? []).length);

// ── А: 10 шагов, 8 без работы ────────────────────────────────────────────────────────────────────
head('А — 10 шагов, 8 без работы');
await mount(TEN_EIGHT_BLANK);
let c = await counters();
ck(c.length === 1, 'счётчик на экране РОВНО ОДИН', `узлов: ${c.length}`);
ck(c[0]?.attr === '8', 'счётчик считает 8', `attr = ${c[0]?.attr}`);
ck(
  c[0]?.text === 'kind — 8 of 10 steps not named yet',
  'строка называет и долю, и целое',
  `«${c[0]?.text}»`,
);
ck((await phraseHits()) === 1, 'фраза встречается один раз на весь экран, а не на каждом шаге');

// ── Г: слова не упрекают ─────────────────────────────────────────────────────────────────────────
head('Г — формулировка не упрёк и не требование');
const text = c[0]?.text ?? '';
for (const word of ['need', 'missing', 'required', 'must', 'error', 'incomplete', 'fill']) {
  ck(!text.toLowerCase().includes(word), `в строке нет слова «${word}»`);
}

// ── Б: работа есть у всех ────────────────────────────────────────────────────────────────────────
head('Б — работа есть у всех десяти: строки нет вовсе');
await mount(TEN_ALL_NAMED);
c = await counters();
ck(c.length === 0, 'узла счётчика НЕТ', `узлов: ${c.length}`);
ck((await phraseHits()) === 0, 'фразы «not named yet» на экране нет вовсе');

// ── В: пустота из пробелов и незнакомый токен ────────────────────────────────────────────────────
head('В — пустота это пустая строка, а незнакомый токен — название');
await mount(TEN_WHITESPACE);
c = await counters();
ck(c.length === 1, 'счётчик один', `узлов: ${c.length}`);
ck(c[0]?.attr === '8', 'пробелы и tab сочтены пустотой — снова 8', `attr = ${c[0]?.attr}`);

// ── единственное число ───────────────────────────────────────────────────────────────────────────
head('единственный шаг — единственное число');
await mount(ONE_BLANK);
c = await counters();
ck(
  c[0]?.text === 'kind — 1 of 1 step not named yet',
  'на одном шаге строка говорит «step», а не «steps»',
  `«${c[0]?.text}»`,
);

ck(pageErrors.length === 0, 'страница не бросала исключений', pageErrors.join(' | '));

await browser.close();
console.log(`\n${bad === 0 ? 'все проверки прошли' : `${bad} проверок ПРОВАЛЕНО`}`);
if (bad) process.exitCode = 1;
