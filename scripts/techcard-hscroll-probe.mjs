#!/usr/bin/env node
// K-12 · «УБРАТЬ ГОРИЗОНТАЛЬНЫЙ СКРОЛЛ НА ТЕХКАРТЕ» — ЗАМЕР, А НЕ ДОГАДКА.
//
// Скролл на этом экране НЕ ВИДНО глазом, и это не фигура речи: `src/global.css:127` глушит
// полосы прокрутки во всём приложении (`scrollbar-width: none` + `::-webkit-scrollbar{display:none}`).
// Поэтому «горизонтальный скролл» здесь выглядит как страница, которую можно утащить вбок, без
// единого признака, что она вообще шире окна. Замерить — единственный способ узнать, ЧТО именно
// вылезает.
//
// ЧТО МЕРЯЕТСЯ. Настоящая `OperationsField` в настоящей форме, помещённая в ту же цепочку коробок,
// в которой она живёт на экране (цепочка выписана в `techcard-hscroll-entry.tsx` со ссылками на
// строки живых файлов). Проба спрашивает две вещи:
//   1. едет ли вбок КОРОБКА СТРАНИЦЫ (`layout.tsx:80`) — scrollWidth против clientWidth;
//   2. если едет — КТО её распирает: самый широкий элемент, чей правый край вышел за коробку.
//
// ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ обязателен: проба, которая на сломанном коде зелёная, ничего не значит.
// `--mutate-unguard` снимает `min-w-0` с формы и филдсета (index.tsx:1910/1911) — единственных
// защищённых коробок цепочки. На этой мутации замер ОБЯЗАН покраснеть; если он зелёный, значит
// он меряет не то.
//
//   node scripts/techcard-hscroll-probe.mjs                   # замер
//   node scripts/techcard-hscroll-probe.mjs --dump            # список всех вылезших элементов
//   node scripts/techcard-hscroll-probe.mjs --mutate-unguard  # снять min-w-0 с формы
//   node scripts/techcard-hscroll-probe.mjs --self-test       # САМОПРОВЕРКА: детектор обязан покраснеть

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DUMP = process.argv.includes('--dump');
const MUT_UNGUARD = process.argv.includes('--mutate-unguard');
const SELF_TEST = process.argv.includes('--self-test');

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

const pwEntry = resolvePlaywright();
if (!pwEntry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const pw = await import(pwEntry);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

// ── МУТАЦИЯ (положительный контроль) ────────────────────────────────────────────────────────────
const GUARD_FIX = `<form className='min-w-0 pb-24'>`;
const GUARD_BROKEN = `<form className='pb-24'>`;
const FIELDSET_FIX = `<fieldset className='m-0 min-w-0 border-0 p-0'>`;
const FIELDSET_BROKEN = `<fieldset className='m-0 border-0 p-0'>`;

const patcher = (filter, pairs, loader) => ({
  name: 'hscroll-mutation',
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
if (MUT_UNGUARD)
  plugins.push(
    patcher(
      /techcard-hscroll-entry\.tsx$/,
      [
        [GUARD_FIX, GUARD_BROKEN],
        [FIELDSET_FIX, FIELDSET_BROKEN],
      ],
      'tsx',
    ),
  );

const outfile = resolve(tmpdir(), `hscroll-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'techcard-hscroll-entry.tsx')],
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
rmSync(outfile, { force: true });
if (!bundle.includes('data-step-editor'))
  dieNotRun('в бандле нет редактора шага — собралось не то');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('dist/assets нет — сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('dist/assets/index-*.css нет — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ── ФИКСТУРА ────────────────────────────────────────────────────────────────────────────────────
// Один машинный шаг: этого достаточно, чтобы `selectedIndex` стал 0 и редактор шага отрисовался
// рядом с рельсом (operations-field.tsx:6092, :7690) — то есть чтобы двухколоночный ряд, который
// и есть предмет замера, вообще существовал.
// Детали с ПРАВДОПОДОБНЫМИ именами: чипы входов шага подписываются именами деталей, и min-content
// редактора складывается именно из них. Пустая фикстура давала бы редактор шириной с подпись — то
// есть замер на данных, которых на живой карточке не бывает.
const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';
const PIECES = [
  { lineKey: 'p-fp', name: 'FP_OS' },
  { lineKey: 'p-bp', name: 'BP_OS' },
  { lineKey: 'p-sl-l', name: 'SL_OUT_L' },
  { lineKey: 'p-sl-r', name: 'SL_OUT_R' },
  { lineKey: 'p-lin-bp', name: 'BP_LIN_L_2' },
  { lineKey: 'p-pck', name: 'PCK_BAG_OS' },
  { lineKey: 'p-oct', name: 'Octagon_Top_OS_M' },
].map((p) => ({ ...p, materials: [] }));
const CARD = {
  pieces: PIECES,
  operations: [
    {
      operationType: MACHINE,
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      inputKeys: PIECES.map((p) => p.lineKey),
      // БЕЗ `outputUnitKey`, И ЭТО НЕ МЕЛОЧЬ: размеченный узел переводит рельс в режим
      // `schematic` (operations-field.tsx:6542), а двухколоночного ряда там нет вовсе. Первая
      // редакция фикстуры узел размечала — и ряд честно встал в колонку, то есть замер измерял
      // бы не тот экран. Поймал это якорь «ряд действительно в строку», а не глаз.
      outputUnitKey: '',
    },
  ],
};

const browser = await chromium.launch();
const pageErrors = [];

// ЗАМЕР НА ДЕСКТОПЕ. Двухколоночный ряд включается на `lg` (≥1024px), то есть на самой обычной
// рабочей ширине админа; ниже неё колонки складываются в стопку и вопроса нет вовсе.
const VIEWPORTS = [
  { w: 1280, h: 1000, name: '1280 — рабочая ширина' },
  { w: 1024, h: 900, name: '1024 — нижняя граница lg' },
];

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;
const FAKE_JWT = `h.${Buffer.from(JSON.stringify({ exp: FAR_FUTURE })).toString('base64')}.s`;

const results = [];
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.route('http://stub.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('http://probe.local/');
  await page.evaluate((t) => localStorage.setItem('authToken', t), FAKE_JWT);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.evaluate((c) => window.__hscroll.mount(c), CARD);
  await page.waitForSelector('[data-step-editor]', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(400);

  // САМОПРОВЕРКА ДЕТЕКТОРА — отдельно от вопроса «едет ли этот экран».
  //
  // Зачем она нужна отдельно от мутации `--mutate-unguard`: та мутация снимает `min-w-0`, но
  // сработать может ТОЛЬКО если min-content содержимого шире доступной ширины. У редактора шага
  // он уже, поэтому мутация остаётся зелёной — и это НЕ значит, что детектор видит переполнение.
  // Значит только, что снятие защиты на ЭТИХ данных ничего не ломает. Утверждать «экран не едет»
  // на основании молчащего детектора нельзя, поэтому детектору предъявляется заведомо широкий
  // элемент, и он обязан его увидеть.
  if (SELF_TEST) {
    await page.evaluate(() => {
      const host = document.querySelector('[data-page-body] fieldset');
      const d = document.createElement('div');
      d.setAttribute('data-selftest', '1');
      d.style.cssText = 'width:2000px;height:8px;background:#000';
      host.appendChild(d);
    });
    await page.waitForTimeout(150);
  }

  const measured = await page.evaluate(() => {
    const body = document.querySelector('[data-page-body]');
    const box = body.getBoundingClientRect();
    // Правый предел коробки страницы. Всё, что правее, распирает страницу.
    const limit = box.right;
    const out = [];
    for (const el of document.querySelectorAll('[data-page-body] *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Портированные слои (Radix) живут вне коробки страницы и скролл документа не двигают.
      if (el.closest('[data-radix-popper-content-wrapper]')) continue;
      const over = r.right - limit;
      if (over > 0.5)
        out.push({
          over: Math.round(over * 10) / 10,
          width: Math.round(r.width),
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 110),
          hook: el.getAttribute('data-step-editor')
            ? 'data-step-editor'
            : el.getAttribute('data-rail-step')
              ? 'data-rail-step'
              : '',
        });
    }
    out.sort((a, b) => b.over - a.over);
    // ДИАГНОСТИКА ДВУХКОЛОНОЧНОГО РЯДА. Без неё зелёный замер неотличим от «ряда на экране нет»:
    // редактор мог не смонтироваться, ряд мог не встать в строку (`lg:flex-row` не сработал), а
    // проба всё равно отрапортовала бы «не едет вбок».
    const ed = document.querySelector('[data-step-editor]');
    const row = ed?.parentElement ?? null;
    const rail = row?.firstElementChild ?? null;
    const geo = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        scrollW: el.scrollWidth,
        display: getComputedStyle(el).display,
        flexDir: getComputedStyle(el).flexDirection,
        minW: getComputedStyle(el).minWidth,
      };
    };
    return {
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      bodyScroll: body.scrollWidth,
      bodyClient: body.clientWidth,
      offenders: out,
      row: geo(row),
      rail: geo(rail),
      editor: geo(ed),
    };
  });
  results.push({ vp, measured });
  await page.close();
}

head('ЗАМЕР — распирает ли содержимое коробку страницы (layout.tsx:80)');
for (const { vp, measured } of results) {
  const docOver = measured.docScroll - measured.docClient;
  const bodyOver = measured.bodyScroll - measured.bodyClient;
  console.log(
    `\n  [${vp.name}]  документ ${measured.docScroll}/${measured.docClient} (+${docOver})  ·  коробка страницы ${measured.bodyScroll}/${measured.bodyClient} (+${bodyOver})`,
  );
  if (measured.offenders.length && (DUMP || bodyOver > 0 || docOver > 0)) {
    console.log(`  вылезли за правый край коробки: ${measured.offenders.length}`);
    for (const o of measured.offenders.slice(0, DUMP ? 40 : 6)) {
      console.log(
        `    +${o.over}px  ширина ${o.width}  <${o.tag}>${o.hook ? ` [${o.hook}]` : ''}  ${o.cls || '(без класса)'}`,
      );
    }
  }
  const g = (n, o) =>
    o ? `${n}: w=${o.w} scrollW=${o.scrollW} display=${o.display}${o.flexDir ? ` dir=${o.flexDir}` : ''} minW=${o.minW}` : `${n}: НЕТ`;
  console.log(`    ${g('ряд', measured.row)}`);
  console.log(`    ${g('рельс', measured.rail)}`);
  console.log(`    ${g('редактор', measured.editor)}`);
  // ЯКОРЬ ОСМЫСЛЕННОСТИ: если двухколоночного ряда на экране нет, замер «не едет вбок» ничего
  // не значит — мерить было нечего.
  ck(
    measured.row?.flexDir === 'row',
    `[${vp.name}] двухколоночный ряд ДЕЙСТВИТЕЛЬНО в строку (иначе мерить нечего)`,
    measured.row?.flexDir ?? 'ряда нет',
  );
  ck(docOver <= 0, `[${vp.name}] документ не едет вбок`, docOver > 0 ? `+${docOver}px` : '');
  ck(
    bodyOver <= 0,
    `[${vp.name}] коробка страницы не распёрта изнутри`,
    bodyOver > 0 ? `+${bodyOver}px` : '',
  );
}


// ── СЦЕНАРИЙ 2 · ПЛИТКА МУДБОРДА В РЕЖИМЕ «ГРИДОМ» ──────────────────────────────────────────────
//
// ЧЕСТНО О ГРАНИЦАХ ЭТОГО ЗАМЕРА: здесь воспроизводится МЕХАНИЗМ, а не смонтирован живой мудборд.
// Классы взяты дословно из `src/ui/components/focused-annotator.tsx:650` (контейнер ленты) и
// `:667` (плитка), высота кадра — `mood-board.tsx:255` (`grid` ⇒ 280px), стиль кадра — `:686`
// (`frameStyle={{ height: gridRowHeight }}` + `frameClassName='w-auto'`). Стилевой файл настоящий
// (собранный `dist/assets/index-*.css`). Подменён ровно один объект — сам снимок: вместо
// `<img>` стоит блок тех же размеров, в которые кадр разрешается при заданной пропорции.
// Поэтому число ниже — это ширина, которую примет плитка при таком референсе, а не замер
// конкретной карточки владельца.
//
// Почему именно этот случай: в режиме «гридом» лента получает `flex-wrap` и теряет
// `overflow-x-auto` (он стоит только на ветке-ленте), а плитка при этом остаётся `shrink-0` и
// `w-fit` при ФИКСИРОВАННОЙ высоте кадра. Ширина = высота × пропорция, ничем не ограничена сверху,
// сжаться не может, и обрезать её нечему.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });

  const ASPECTS = [
    { name: '3:2 — обычная съёмка', ratio: 3 / 2 },
    { name: '16:9 — широкий кадр', ratio: 16 / 9 },
    { name: '21:9 — панорама', ratio: 21 / 9 },
    { name: '4:1 — раскладка/баннер', ratio: 4 },
  ];
  const H = 280; // mood-board.tsx:255 — gridRowHeight в режиме grid

  const moodResults = await page.evaluate(
    ({ aspects, h }) => {
      const root = document.getElementById('root');
      // Цепочка коробок страницы — та же, что в сценарии 1.
      root.innerHTML = `
        <div class="h-full px-2.5 pt-26" data-page-body="1">
          <div class="flex flex-col gap-6">
            <div class="grid gap-2.5 pt-3 lg:grid-cols-[150px_1fr]">
              <aside></aside>
              <form class="min-w-0 pb-24"><fieldset class="m-0 min-w-0 border-0 p-0">
                <section class="border border-borderColor bg-bgColor p-4">
                  <div id="strip" class="flex items-start gap-2 py-1 flex-wrap"></div>
                </section>
              </fieldset></form>
            </div>
          </div>
        </div>`;
      const strip = document.getElementById('strip');
      const body = document.querySelector('[data-page-body]');
      const out = [];
      // ДВА ВАРИАНТА ПЛИТКИ НА ОДНИХ И ТЕХ ЖЕ ДАННЫХ: «как было» и «как стало». Одного числа мало
      // — оно не отличает починку от того, что случай просто перестал воспроизводиться.
      const VARIANTS = [
        { tag: 'было', cls: 'relative shrink-0 space-y-1 w-fit' },
        { tag: 'стало', cls: 'relative shrink-0 space-y-1 w-fit max-w-full overflow-x-auto' },
      ];
      for (const a of aspects) for (const V of VARIANTS) {
        strip.innerHTML = '';
        const tile = document.createElement('div');
        tile.className = V.cls;
        const frame = document.createElement('div');
        frame.className = 'w-auto';
        frame.style.height = `${h}px`;
        frame.style.aspectRatio = String(a.ratio);
        frame.style.background = '#ccc';
        tile.appendChild(frame);
        strip.appendChild(tile);
        const tileW = Math.round(tile.getBoundingClientRect().width);
        const avail = Math.round(strip.getBoundingClientRect().width);
        out.push({
          variant: V.tag,
          name: a.name,
          tileW,
          avail,
          over: tileW - avail,
          docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          bodyOver: body.scrollWidth - body.clientWidth,
        });
      }
      return out;
    },
    { aspects: ASPECTS, h: H },
  );

  head('ЗАМЕР 2 — плитка мудборда «гридом» (высота кадра 280px, ширина = 280 × пропорция)');
  for (const r of moodResults) {
    console.log(
      `  [${r.variant}] ${r.name}: плитка ${r.tileW}px, доступно ${r.avail}px → ${r.over > 0 ? `ВЫЛЕЗАЕТ на +${r.over}px` : 'влезает'}; документ +${r.docOver}px`,
    );
  }
  const before = moodResults.filter((r) => r.variant === 'было');
  const after = moodResults.filter((r) => r.variant === 'стало');
  // ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ: если «было» никого не уронило, случай не воспроизвёлся, и зелень
  // «стало» ничего не доказывает.
  ck(
    before.some((r) => r.docOver > 0),
    'случай ВОСПРОИЗВЁЛСЯ на старой плитке (иначе доказывать нечего)',
    before.map((r) => `${r.name}:+${r.docOver}`).join(' '),
  );
  ck(
    after.every((r) => r.docOver <= 0),
    'на новой плитке страница не едет вбок НИ НА ОДНОЙ пропорции',
    after
      .filter((r) => r.docOver > 0)
      .map((r) => `${r.name}:+${r.docOver}`)
      .join(' '),
  );
  await page.close();
}

ck(pageErrors.length === 0, 'страница без исключений', pageErrors.slice(0, 2).join(' | '));

await browser.close();
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${MUT_UNGUARD ? ' (мутация: unguard)' : ''}${SELF_TEST ? ' (САМОПРОВЕРКА: краснота ОБЯЗАТЕЛЬНА, зелень = детектор слеп)' : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
