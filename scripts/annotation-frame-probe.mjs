#!/usr/bin/env node
// КАДР — ЭТО СИСТЕМА КООРДИНАТ УКАЗАНИЙ, И ОН ОБЯЗАН СОВПАДАТЬ С КАРТИНКОЙ.
//
// Координаты хранятся долями кадра, а меряются по коробке `boxRef`. Любое расхождение между этой
// коробкой и тем, что в ней НАРИСОВАНО, — это указание, показывающее не туда. Ни типы, ни сборка
// такого не видят: раскладка сходится, ошибок нет, просто мерка стоит не на том месте.
//
// Дефект, ради которого написана проба (замерено 2026-08-16, найдено пользователем):
// поверхность — flex-колонка «кадр, под ним легенда и редактор». У колонки `align-items: stretch`
// по умолчанию, поэтому кадр БЕЗ явной ширины растягивался до самого широкого соседа снизу. Клик по
// пину открывал редактор → кадр 150px становился 520px → `max-height` резал высоту, НЕ трогая
// ширину → картинку СПЛЮЩИВАЛО (400×300 → 520×150). Повторный клик возвращал всё назад: «картинка
// увеличивается и уменьшается, и точки уезжают».
//
// Проверяются три правила, на которых всё держится:
//   1. кадр не меняет размер, когда под ним появляется что-то широкое;
//   2. кадр совпадает с картинкой, даже когда её ужимает `max-height`;
//   3. КОЛОНКА тоже не меняет ширину. Кадр держится, но сама колонка — `width: fit-content`, и
//      открытый редактор шире панели видов: без третьего правила клик по пину раздвигал плитку и
//      двигал соседние кадры в ряду. Это второй заход того же дефекта, уже после первой починки.
//
// Playwright не в зависимостях проекта — проба ищет его в кэше npx и МОЛЧА ПРОПУСКАЕТСЯ, если не
// нашла: гейт, который нельзя выполнить, не должен красить сборку в красный.
//
//   node scripts/annotation-frame-probe.mjs

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
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

const entry = resolvePlaywright();
if (!entry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entry);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

// КЛАССЫ БЕРУТСЯ ИЗ ИСХОДНИКА, а не переписываются в пробе: копия правил разошлась бы с ними на
// первой же правке, и проба продолжала бы зеленеть, проверяя вчерашнюю раскладку.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../src/ui/components/annotation/surface.tsx'), 'utf8');
const guards = [
  ["кадр объявлен нерастягивающимся ('self-start')", /'self-start',/],
  ["ширину картинки задаёт она сама ('w-auto max-w-full')", /'block h-auto w-auto max-w-full'/],
  ['подпись под кадром не участвует в ширине колонки', /'flex w-0 min-w-full flex-col gap-1'/],
];

const browser = await chromium.launch();
const page = await browser.newPage();
const img =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#888"/></svg>',
  );
await page.setContent(`
<style>
 html,body{margin:0}
 .col{display:flex;flex-direction:column;gap:4px;width:fit-content}
 .frame{position:relative}
 .fixed{align-self:flex-start}
 img{display:block;height:auto}
 .free{width:auto;max-width:100%;max-height:150px}
 .stretchy{width:100%;max-height:150px}
 .editor{width:520px;height:30px}
 .hide{display:none}
 .pin{width:0;min-width:100%}
</style>
<div class="col"><div class="frame" id="bad"><img id="badImg" class="stretchy" src="${img}"></div><div class="editor"></div></div>
<div class="col"><div class="frame fixed" id="good"><img id="goodImg" class="free" src="${img}"></div><div class="editor"></div></div>
<div class="col" id="colGrow"><div class="frame fixed"><img class="free" src="${img}"></div><div><div class="editor hide" id="growEd"></div></div></div>
<div class="col" id="colPin"><div class="frame fixed"><img class="free" src="${img}"></div><div class="pin"><div class="editor hide" id="pinEd"></div></div></div>`);
await page.waitForFunction(() => document.getElementById('goodImg')?.complete);

const box = (id) =>
  page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  }, id);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

for (const [name, re] of guards) check(name, re.test(src));

// НЕГАТИВНЫЙ КОНТРОЛЬ: без обоих правил дефект обязан воспроизводиться. Без него проба не отличала
// бы «починено» от «случай недостижим».
const badFrame = await box('bad');
const badImg = await box('badImg');
check(
  'старая раскладка действительно сплющивает картинку',
  badFrame[0] === 520 && badImg[1] === 150 && badImg[0] / badImg[1] !== 4 / 3,
  `кадр ${badFrame}, картинка ${badImg}`,
);

// КОЛОНКА НЕ РАСТЁТ ПОД РЕДАКТОР — с негативным контролем рядом: без приёма она обязана вырасти,
// иначе проба не отличала бы «починено» от «случай недостижим».
{
  const growBefore = (await box('colGrow'))[0];
  const pinBefore = (await box('colPin'))[0];
  await page.evaluate(() => {
    document.getElementById('growEd').classList.remove('hide');
    document.getElementById('pinEd').classList.remove('hide');
  });
  check('без приёма колонка растёт под редактор', (await box('colGrow'))[0] > growBefore, `${growBefore} → ${(await box('colGrow'))[0]}`);
  check('с приёмом колонка держится за кадр', (await box('colPin'))[0] === pinBefore, `${pinBefore} → ${(await box('colPin'))[0]}`);
}

const frame = await box('good');
const shown = await box('goodImg');
check('кадр не растянулся под редактор', frame[0] < 520, `кадр ${frame}`);
check('кадр совпадает с картинкой', frame[0] === shown[0] && frame[1] === shown[1], `кадр ${frame}, картинка ${shown}`);
check(
  'пропорции картинки целы',
  Math.abs(shown[0] / shown[1] - 400 / 300) < 0.01,
  `картинка ${shown}`,
);

await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
