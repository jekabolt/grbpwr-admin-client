#!/usr/bin/env node
// ВЫБОР ФИГУРЫ КЛИКОМ ПО ЕЁ ЛИНИИ — ЗАМЕР В БРАУЗЕРЕ, А НЕ ДОПУЩЕНИЕ.
//
// Слой геометрии — это <svg> с `pointer-events: none`: иначе он ловил бы клики постановки, и точку
// под уже нарисованной фигурой поставить было бы нельзя. Хит-пути (невидимые толстые копии
// штрихов) лежат ВНУТРИ этого svg и обязаны перебить наследование своим `pointer-events`.
//
// Допущение это не проверяется ни типами, ни сборкой, а цена ошибки — «клик по мерке не работает»
// без единого следа в консоли: выбрать фигуру, чтобы поправить её точки, стало бы нельзя вовсе.
// Ровно та же категория, что «под fieldset disabled у кнопки гаснет только click» — тоже замер.
//
// Проверяются три правила отрисовки, на которых стоит surface.tsx:
//   1. `pointer-events: stroke` перебивает унаследованный `none`;
//   2. толщина хит-штриха (12px) делает волосяную линию попадаемой мышью;
//   3. заштрихованная зона ловится ПО ПЛОЩАДИ (`fill: transparent` + `pointer-events: all`), а
//      незаштрихованная — только по контуру: когда область закрашена, целятся в неё, а не в край.
//
// Точки взяты заведомо ДАЛЬШЕ 6px от всех рёбер. Первая версия этой пробы этого не делала и
// поймала ложный ответ: «попал в площадь» на деле означало «попал в 12px обводку».
//
// Playwright не в зависимостях проекта — проба ищет его в кэше npx и МОЛЧА ПРОПУСКАЕТСЯ, если не
// нашла: гейт, который нельзя выполнить, не должен красить сборку в красный.
//
//   node scripts/annotation-hit-probe.mjs

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
  // Кэш npx: путь содержит хэш, поэтому ищем, а не угадываем.
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
// Кэшированный playwright — CJS: у пространства имён импорта интерфейс лежит либо сверху, либо
// под `default`, и брать только первое значит падать на половине установок.
const mod = await import(entry);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`
<style>html,body{margin:0} #box{position:relative;width:400px;height:300px;background:#eee}</style>
<div id="box">
  <svg id="svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"
       viewBox="0 0 400 300" preserveAspectRatio="none">
    <path id="line" d="M50,150 L350,150" fill="none" stroke="transparent" stroke-width="12"
          style="pointer-events:stroke"/>
    <path id="area" d="M50,40 L200,40 L200,100 Z" fill="transparent" stroke="transparent"
          stroke-width="12" style="pointer-events:all"/>
    <path id="outline" d="M250,40 L380,40 L380,100 Z" fill="none" stroke="transparent"
          stroke-width="12" style="pointer-events:stroke"/>
  </svg>
</div>`);

const hit = (x, y) =>
  page.evaluate(([x, y]) => (document.elementFromPoint(x, y) || {}).id ?? 'none', [x, y]);

const cases = [
  ['по самой линии — хит-путь ловит', await hit(200, 150), 'line'],
  ['в 5px от линии (внутри 12px штриха) — ловит', await hit(200, 155), 'line'],
  ['в 20px от линии — не ловит', await hit(200, 175), 'box'],
  ['внутри заштрихованной области — ловит ПО ПЛОЩАДИ', await hit(170, 55), 'area'],
  ['внутри НЕзаштрихованной — площадь не ловит', await hit(360, 55), 'box'],
  ['по контуру незаштрихованной — ловит', await hit(315, 40), 'outline'],
  ['пустое место сквозь svg — ловит подложку', await hit(20, 250), 'box'],
];
await browser.close();

let fail = 0;
for (const [name, got, want] of cases) {
  if (got === want) continue;
  fail++;
  console.error(`✗ ${name} — получено «${got}», ожидалось «${want}»`);
}
console.log(`${cases.length - fail} из ${cases.length} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
