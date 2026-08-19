#!/usr/bin/env node
// ПЕРЕКЛЮЧАТЕЛЬ ВИДА ОБЯЗАН СТОЯТЬ НА МЕСТЕ. Орган, который уезжает от собственного нажатия,
// нельзя нажать дважды подряд не глядя — а туда-сюда между схемой и списком ходят именно так.
//
// Дефект, ради которого написана проба (найден пользователем: «переключатель прыгает слева
// направо»). Он складывался из двух независимых причин, и починка одной ничего бы не дала:
//
//   1. ОРГАН БЫЛ ПРИЖАТ К ПРАВОМУ КРАЮ КОНТЕЙНЕРА, ШИРИНА КОТОРОГО ЗАВИСИТ ОТ РЕЖИМА. Заголовок
//      группы жил внутри колонки: 320px в режиме списка и во всю секцию в режиме схемы. Слот
//      `action` у `GroupLabel` — это `ml-auto`, поэтому чип стоял то на x≈320, то у правого края
//      экрана. Один клик — перелёт через полсекции.
//   2. ПОДПИСЬ МЕНЯЛА ШИРИНУ. Один чип называл СЛЕДУЮЩИЙ вид: «as a schematic» (14 знаков) против
//      «as a list» (9). У прижатого вправо органа это второй сдвиг поверх первого.
//
// Проверяются оба конца, и у каждого рядом стоит НЕГАТИВНЫЙ КОНТРОЛЬ: без починки случай обязан
// воспроизводиться, иначе проба не отличает «починено» от «недостижимо».
//
// Playwright не в зависимостях проекта — проба ищет его в кэше npx и МОЛЧА ПРОПУСКАЕТСЯ, если не
// нашла: гейт, который нельзя выполнить, не должен красить сборку в красный.
//
//   node scripts/view-switch-probe.mjs

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

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const ops = read('../src/components/managers/tech-card/components/operations-field.tsx');
const groupLabel = read('../src/ui/components/group-label.tsx');
const viewSwitch = read('../src/ui/components/view-switch.tsx');
/** Комментарии из проверки вычёркиваются: в них про `<button>` написано как раз то, почему её тут нет. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const viewSwitchCode = stripComments(viewSwitch);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// ── ГАРАНТИИ ПО ИСХОДНИКУ ────────────────────────────────────────────────────────────────────
// Раскладку меряет браузер ниже, но браузер не увидит, если завтра орган вернут в правый слот
// внутрь колонки. Эти проверки держат именно то решение, которое чинит дефект.

check(
  'заголовок последовательности вынесен из колонки, меняющей ширину',
  // Между заголовком и колонкой с `lg:w-[320px]` стоит открытие flex-контейнера — значит
  // заголовок снаружи неё.
  /<GroupLabel flush lead=\{<SequenceViewSwitch[\s\S]{0,400}?'flex flex-col gap-3'[\s\S]{0,300}?lg:w-\[320px\]/.test(
    ops,
  ),
);
check(
  'переключатель стоит в левом слоте (`lead`), а не в прижатом вправо `action`',
  /lead=\{<SequenceViewSwitch/.test(ops) && !/action=\{[\s\S]{0,200}?SequenceViewSwitch/.test(ops),
);
check(
  'слот `lead` у GroupLabel действительно левый (без `ml-auto`)',
  /\{lead && <div className='self-center'>\{lead\}<\/div>\}/.test(groupLabel) &&
    /\{action && <div className='ml-auto'>\{action\}<\/div>\}/.test(groupLabel),
);
check(
  'заголовок и размеченное им содержимое лежат в ОДНОЙ обёртке, а не высыпаны фрагментом',
  // Родитель — `space-y-2.5`: фрагмент отдал бы ему обоих детей, и заголовок отъехал бы от
  // содержимого на 10px сверх собственного `mb-1`.
  /\) : \(\n(?:\s*\/\/[^\n]*\n)*\s*<div>\n/.test(ops),
);
check(
  'чип с подписью следующего вида больше не рендерится',
  !/'as a list'|'as a schematic'/.test(ops),
);
check(
  'оба вида названы своими именами и оба всегда на виду',
  /value: 'schematic', label: 'schematic'|value: 'schematic',\s*\n\s*label: 'schematic'/.test(
    ops,
  ) && /value: 'list', label: 'list'/.test(ops),
);
check(
  'сегменты — span-ы: переключатель обязан жить под `<fieldset disabled>` выпущенной карточки',
  /role='radio'/.test(viewSwitchCode) && !/<button/.test(viewSwitchCode),
);
check(
  'выбранный сегмент не меняет насыщенность шрифта (подменный шрифт не моноширинный)',
  !/font-(bold|semibold|medium)/.test(viewSwitch),
);
check(
  'у каждого сегмента есть роль, состояние и клавиатура',
  /aria-checked=\{on\}/.test(viewSwitch) &&
    /role='radiogroup'/.test(viewSwitch) &&
    /ArrowRight/.test(viewSwitch) &&
    /focus-visible:outline/.test(viewSwitch),
);

const entry = resolvePlaywright();
if (!entry) {
  console.log(`${pass} из ${pass + fail} проверок по исходнику прошло`);
  console.log('playwright не найден — замер раскладки пропущен (это не отказ)');
  process.exit(fail === 0 ? 0 : 1);
}
const mod = await import(entry);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — замер раскладки пропущен');
  process.exit(fail === 0 ? 0 : 1);
}

// ── ЗАМЕР РАСКЛАДКИ ──────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(`
<style>
  html, body { margin: 0; font: 12px/1.5 Arial, sans-serif; }
  .section { width: 1000px; }
  /* GroupLabel */
  .grp { display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #ccc;
         padding-bottom: 2px; margin-bottom: 4px; }
  .title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
           color: #666; }
  .lead { align-self: center; }
  .action { margin-left: auto; }
  /* колонка под заголовком: во всю ширину на схеме, 320px в списке */
  .col { width: 100%; }
  .col.list { width: 320px; flex-shrink: 0; }
  .rowwrap { display: flex; flex-direction: column; gap: 12px; }
  .rowwrap.list { flex-direction: row; align-items: flex-start; }
  /* чип «как раньше» — ширина по подписи */
  .chip { display: inline-flex; border: 1px dashed #ccc; padding: 1px 7px; font-size: 10px;
          text-transform: uppercase; letter-spacing: .03em; color: #666; white-space: nowrap; }
  /* полоса «как теперь» — оба сегмента всегда нарисованы */
  .sw { display: inline-flex; }
  .seg { display: inline-flex; align-items: center; border: 1px solid #ccc; margin-left: -1px;
         padding: 1px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
         color: #666; white-space: nowrap; }
  .seg:first-child { margin-left: 0; }
  .seg.on { position: relative; border-color: #000; background: #000; color: #fff; }
</style>

<!-- СТАРО: заголовок внутри колонки, орган в правом слоте -->
<div class="section">
  <div class="rowwrap" id="oldSchem">
    <div class="col">
      <div class="grp"><span class="title">sequence</span>
        <div class="action"><span class="chip" id="oldChipSchem">as a list</span></div></div>
    </div>
  </div>
  <div class="rowwrap list" id="oldList">
    <div class="col list">
      <div class="grp"><span class="title">sequence</span>
        <div class="action"><span class="chip" id="oldChipList">as a schematic</span></div></div>
    </div>
  </div>
</div>

<!-- НОВО: заголовок снаружи колонки, орган в левом слоте -->
<div class="section">
  <div id="newSchemHdr" class="grp"><span class="title">sequence</span>
    <div class="lead"><span class="sw" id="newSwSchem">
      <span class="seg on">schematic</span><span class="seg">list</span></span></div></div>
  <div class="rowwrap"><div class="col"></div></div>

  <div id="newListHdr" class="grp"><span class="title">sequence</span>
    <div class="lead"><span class="sw" id="newSwList">
      <span class="seg">schematic</span><span class="seg on">list</span></span></div></div>
  <div class="rowwrap list"><div class="col list"></div></div>
</div>
`);

const box = (id) =>
  page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
  }, id);

// НЕГАТИВНЫЙ КОНТРОЛЬ №1 — прижатый вправо орган внутри колонки переменной ширины реально уезжает.
const oldSchem = await box('oldChipSchem');
const oldList = await box('oldChipList');
check(
  'старая раскладка действительно двигает орган по горизонтали',
  Math.abs(oldSchem.x - oldList.x) > 200,
  `x ${oldSchem.x} → ${oldList.x} (${Math.abs(oldSchem.x - oldList.x)}px)`,
);
// НЕГАТИВНЫЙ КОНТРОЛЬ №2 — и меняет ширину, потому что подпись называет следующий вид.
check(
  'старая подпись действительно меняла ширину органа',
  oldSchem.w !== oldList.w,
  `${oldSchem.w}px → ${oldList.w}px`,
);

// ПОЧИНКА — обе координаты и ширина совпадают до пикселя.
const newSchem = await box('newSwSchem');
const newList = await box('newSwList');
check(
  'переключатель не двигается по горизонтали',
  newSchem.x === newList.x,
  `x ${newSchem.x} → ${newList.x}`,
);
check(
  'переключатель не меняет ширину',
  newSchem.w === newList.w,
  `${newSchem.w}px → ${newList.w}px`,
);
check(
  'переключатель не меняет высоту',
  newSchem.h === newList.h,
  `${newSchem.h}px → ${newList.h}px`,
);

// Полоса заголовка одинакова в обоих режимах — значит и вертикаль органа не зависит от вида.
const hdrSchem = await box('newSchemHdr');
const hdrList = await box('newListHdr');
check(
  'полоса заголовка одинакова в обоих режимах',
  hdrSchem.w === hdrList.w && hdrSchem.h === hdrList.h,
  `${hdrSchem.w}×${hdrSchem.h} → ${hdrList.w}×${hdrList.h}`,
);
// Орган в левом слоте не свешивается под линейку группы: она проходит по низу полосы.
check(
  'орган не свешивается под линейку группы',
  newSchem.h <= hdrSchem.h,
  `орган ${newSchem.h}px, полоса ${hdrSchem.h}px`,
);

await browser.close();
console.log(
  `было: орган уезжал на ${Math.abs(oldSchem.x - oldList.x)}px и менял ширину ` +
    `${oldSchem.w}→${oldList.w}px; стало: x ${newSchem.x}, ширина ${newSchem.w}px в обоих видах`,
);
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
