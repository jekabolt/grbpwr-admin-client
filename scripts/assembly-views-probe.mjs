#!/usr/bin/env node
// СХЕМА СБОРКИ ОБЯЗАНА ПЕРЕЖИТЬ РЕФАКТОРИНГ БАЙТ-В-БАЙТ.
//
//   node scripts/assembly-views-probe.mjs            сравнение с golden + юнит-кейсы
//   node scripts/assembly-views-probe.mjs --capture  снять golden заново
//
// Рендер нод схемы переехал из тела `AssemblySchematic` в `assembly-node-views.tsx`. Ценность
// переноса нулевая для глаза и отрицательная для риска: файл несёт жестовую механику
// (перетаскивание, hit-test, автоскролл), а дифф переноса большой. Единственное, что делает такой
// дифф проверяемым, — СНИМОК РАЗМЕТКИ ВСЕГО КОМПОНЕНТА, снятый ДО первой правки и сравниваемый
// после. Перенос, изменивший класс, title, атрибут, порядок узлов, координату style, глиф, слово
// состояния, путь провода или роль органа (`div` против `<button>`!), ломает сравнение.
//
// ЧЕГО СНИМОК НЕ ЛОВИТ, и это не оговорка, а список для ревью диффа: обработчики событий (в
// статической разметке их нет вовсе), ref-механику жестов (клик-эхо после драга, Esc, автоскролл),
// ветки под наведением (полоса действий узла рисуется только при hovered) и ветки выделения
// (кольца picked, ActionPanel). Всё это — поведение, а не разметка.
//
// КАНОНИЗАЦИЯ ТОЛЬКО ОДНА: генерируемые `useId` идентификаторы (штриховка ткани заводит паттерн на
// ИНСТАНС компонента) заменяются по порядку первого вхождения на id1, id2, … синхронно в `id="…"` и
// в `url(#…)`. Извлечение вьюшек меняет границы компонентов и сдвигает эти токены — без замены гейт
// красный на шуме. Ничего больше не нормализуется: pretty-print, сортировка атрибутов и trim
// прячут настоящие расхождения.

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const capture = process.argv.includes('--capture');
const dumpIds = process.argv.includes('--ids');

const GOLDEN = {
  false: resolve(root, 'scripts/fixtures/assembly-views-golden.html'),
  true: resolve(root, 'scripts/fixtures/assembly-views-golden-frozen.html'),
};

// Вывод кладётся В РЕПОЗИТОРИЙ (и удаляется после): react и react-dom оставлены внешними, а из
// системной временной папки node_modules не виден вовсе — тот же приём, что в
// `annotation-shape-probe.mjs`.
const outfile = resolve(root, `scripts/.assembly-views-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/assembly-views-probe-entry.tsx')],
  bundle: true,
  format: 'esm',
  // НОДА, А НЕ БРАУЗЕР: снимок снимается `renderToStaticMarkup`, и ни стенда, ни playwright,
  // ни авторизации для гейта не нужно.
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: root,
  outfile,
  logLevel: 'warning',
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  // Модалка подтверждения тянет Radix, а тот — CJS-пакеты, которые зовут `require('react')` прямо
  // при загрузке. В ESM-выводе esbuild подставляет заглушку, роняющую бандл на первом же таком
  // вызове; настоящий `require` из `node:module` снимает это, ничего не меняя в разметке.
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nvar require = __cr(import.meta.url);",
  },
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    // Весь `import.meta.env` целиком, а не только один ключ: в графе компонента лежит
    // медиа-прокси, читающий свою переменную, и без объекта бандл падает на обращении к
    // undefined ещё до первого рендера.
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(root, 'src/components'),
    lib: resolve(root, 'src/lib'),
    api: resolve(root, 'src/api'),
    utils: resolve(root, 'src/utils'),
    ui: resolve(root, 'src/ui'),
    constants: resolve(root, 'src/constants'),
    store: resolve(root, 'src/store'),
    hooks: resolve(root, 'src/hooks'),
  },
});
// `ConfirmationModal` вычисляет контейнер портала (`document.body`) в момент СОЗДАНИЯ JSX, до
// того как Radix решит, что при open=false рисовать нечего. Заглушка нужна ровно под это обращение
// и в разметку не попадает ни байтом: закрытый портал не рендерит ничего.
globalThis.document ??= { body: {} };
let mod;
try {
  mod = await import(pathToFileURL(outfile).href);
} finally {
  // finally, а не следующей строкой: упавший бандл иначе остаётся в репозитории и попадает
  // соседу в `git status` мусором с чужим pid в имени.
  rmSync(outfile, { force: true });
}

/**
 * Идентификатор, рождённый `useId`.
 *
 * В React 19 `useId()` отдаёт токен в гильеметах («R2b»), а `hatchId` сводит его к [A-Za-z0-9],
 * так что до разметки доезжает `hatch-R2b`. Ловим обе формы, а вот стабильные идентификаторы
 * (`assembly-arrow`) НЕ трогаем: канонизируй их — и переименование маркера прошло бы гейт молча.
 */
const isGeneratedId = (v) => /(?:«[^»]*»|:[A-Za-z0-9]+:|^[A-Za-z0-9]+-[Rr][0-9a-z]*$)/.test(v);

function canon(html) {
  const map = new Map();
  const rename = (v) => {
    if (!isGeneratedId(v)) return v;
    if (!map.has(v)) map.set(v, `id${map.size + 1}`);
    return map.get(v);
  };
  // Порядок первого вхождения считается по ОБЩЕМУ проходу — id и url(#…) видят одну нумерацию,
  // иначе ссылка и определение разъехались бы при перестановке.
  return html.replace(/id="([^"]*)"|url\(#([^)]*)\)/g, (whole, idVal, urlVal) =>
    idVal !== undefined ? `id="${rename(idVal)}"` : `url(#${rename(urlVal)})`,
  );
}

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) {
    bad++;
    console.log(`  FAIL ${what}${detail ? `\n       ${detail}` : ''}`);
  } else {
    console.log(`  ok   ${what}`);
  }
};

const shots = { false: canon(mod.renderSchematic(false)), true: canon(mod.renderSchematic(true)) };

if (dumpIds) {
  for (const frozen of ['false', 'true']) {
    const raw = mod.renderSchematic(frozen === 'true');
    console.log(
      `frozen=${frozen} ids:`,
      JSON.stringify([...raw.matchAll(/id="([^"]*)"/g)].map((m) => m[1])),
    );
    console.log(
      `frozen=${frozen} urls:`,
      JSON.stringify([...raw.matchAll(/url\(#([^)]*)\)/g)].map((m) => m[1])),
    );
  }
  process.exit(0);
}

if (capture) {
  mkdirSync(resolve(root, 'scripts/fixtures'), { recursive: true });
  for (const frozen of ['false', 'true']) {
    writeFileSync(GOLDEN[frozen], shots[frozen]);
    console.log(
      `снят  ${relative(root, GOLDEN[frozen])}  (${shots[frozen].length} байт после канонизации id)`,
    );
  }
  console.log('\ngolden снят. ПОСЛЕ рефакторинга он не перезаписывается — только сравнивается.');
  process.exit(0);
}

// --- 1. разметка совпала с golden --------------------------------------------------------------
console.log('golden-разметка полного AssemblySchematic');
for (const frozen of ['false', 'true']) {
  const path = GOLDEN[frozen];
  if (!existsSync(path)) {
    ck(false, `frozen=${frozen}: golden на месте`, `нет файла ${relative(root, path)} — сними --capture`);
    continue;
  }
  const want = readFileSync(path, 'utf8');
  const got = shots[frozen];
  if (want === got) {
    ck(true, `frozen=${frozen}: разметка байт-в-байт (${got.length} байт)`);
    continue;
  }
  let at = 0;
  while (at < want.length && at < got.length && want[at] === got[at]) at++;
  ck(
    false,
    `frozen=${frozen}: разметка разошлась на байте ${at}`,
    `было: …${want.slice(Math.max(0, at - 90), at + 90)}…\n       стало: …${got.slice(Math.max(0, at - 90), at + 90)}…`,
  );
}

// Фикстура обязана оставаться той, ради которой снимок снимали: выродись она в пустое полотно —
// сравнение зеленело бы на пустоте.
console.log('\nсостав фикстуры');
const f = mod.fixtureFacts;
ck(
  JSON.stringify(f.convergedBlockKeys) === JSON.stringify(['SHELL', 'HOOD', 'GARMENT', '']),
  'сошедшийся граф: три узла и хвост',
  JSON.stringify(f.convergedBlockKeys),
);
ck(
  JSON.stringify(f.convergedLiveUnits) === JSON.stringify(['GARMENT']),
  'сошедшийся граф: ровно один терминал (иначе «✓ garment» в снимке нет)',
  JSON.stringify(f.convergedLiveUnits),
);
ck(f.convergedViolations.length === 0, 'сошедшийся граф валиден', f.convergedViolations.join(', '));
ck(
  f.brokenLiveUnits.length === 2,
  'разорванный граф: два живых узла (иначе «✕ break» в снимке нет)',
  JSON.stringify(f.brokenLiveUnits),
);
ck(f.brokenViolations.length === 0, 'разорванный граф валиден по проходу', f.brokenViolations.join(', '));
// ТРЕТЬЕ ПОЛОТНО — ЕДИНСТВЕННОЕ, ГДЕ ХВОСТ ВООБЩЕ ЕСТЬ. Стоит ему выродиться (появись в нём узел,
// или окажись обработка над ОДНОЙ деталью), шаг уехал бы на плитку, хвоста не стало бы — и его
// разметка перестала бы проверяться, оставив снимок зелёным.
ck(
  JSON.stringify(f.tailBlockKeys) === JSON.stringify(['']),
  'граф хвоста: ни одного узла, только хвостовой псевдоблок',
  JSON.stringify(f.tailBlockKeys),
);
ck(
  JSON.stringify(f.tailLooseSteps) === JSON.stringify([0, 1, 2]),
  'граф хвоста: атрибуция держит все три шага — ни один не достаёт до узла',
  JSON.stringify(f.tailLooseSteps),
);
ck(
  JSON.stringify(f.tailDrawnSteps) === JSON.stringify([1, 2]),
  'граф хвоста: строк в хвосте две — обработка одной детали уехала на её плитку',
  JSON.stringify(f.tailDrawnSteps),
);
ck(f.tailLiveUnits.length === 0, 'граф хвоста: живых узлов нет', JSON.stringify(f.tailLiveUnits));
ck(f.tailViolations.length === 0, 'граф хвоста валиден по проходу', f.tailViolations.join(', '));

/**
 * Токены-ссылки снимка: `[{ to, text }]` в порядке появления. Ищется по СОБСТВЕННОЙ подсказке
 * токена, а не по классу: класс — оформление и вправе меняться, адресат — контракт.
 */
// ПОДСКАЗКА ТОКЕНА НАЗЫВАЕТ МЕСТО СЛОВАМИ СВОЕЙ ПОВЕРХНОСТИ, и потому фраза здесь не зашита, а
// ВЫНИМАЕТСЯ: снимок снят с ИНЛАЙНОВОЙ схемы, где полотна нет вовсе (есть прокручиваемая коробка),
// и «on the canvas» тут обещало бы место, которого на этом экране не найти. Зашитая фраза сделала
// бы пробу слепой к обратному переезду слов, а не строгой к нему.
const tokensIn = (html) =>
  [...html.matchAll(/title="go to ▣ ([^"]*?) ([^"]*)"[^>]*>([^<]*)</g)].map((m) => ({
    to: m[1],
    where: m[2],
    text: m[3],
  }));

for (const frozen of ['false', 'true']) {
  const s = shots[frozen];
  ck(s.includes('✓ garment'), `frozen=${frozen}: терминал назван словом`);
  ck(s.includes('>▣ GARMENT</span>'), `frozen=${frozen}: поглощённый узел назван словом`);
  ck(s.includes('✕ break'), `frozen=${frozen}: разрыв назван словом`);

  // ТОКЕН `▣ ИМЯ` — ССЫЛКА НА УЗЕЛ, ВЕЗДЕ И ВСЕГДА, включая выпущенную карточку: переход это
  // способ СМОТРЕТЬ, а смотреть на RELEASED разрешено (R10). Разъедься эти два снимка по числу
  // токенов — и половина навигации умирала бы ровно там, где карточку только и читают.
  const tk = tokensIn(s);
  // ЧЕТЫРЕ — И ВОТ КАКИЕ: шапки SHELL и HOOD («→ ▣ GARMENT» у обоих) плюс подвал GARMENT
  // («← ▣ SHELL + ▣ HOOD + 2 pieces»). У разорванного графа токенов нет вовсе — оба узла живы
  // («✕ break»), а в их подвалах только детали; у графа хвоста нет и боксов.
  ck(tk.length === 4, `frozen=${frozen}: четыре токена-ссылки в снимке`, JSON.stringify(tk));
  ck(
    tk.every((t) => t.text === `▣ ${t.to}`),
    `frozen=${frozen}: текст токена и его адресат — одно и то же имя`,
    JSON.stringify(tk),
  );
  ck(
    tk.every((t) => t.where === 'in the schematic'),
    `frozen=${frozen}: подсказка называет ИНЛАЙН, а не полотно — снимок снят с него`,
    JSON.stringify(tk.map((t) => t.where)),
  );
  // Стрелка состояния и стрелка состава — РАЗНЫЕ строки бокса, и обе обязаны нести ссылку:
  // «куда узел ушёл» и «из чего собран» — два вопроса, и оба ведут к соседям по графу.
  ck(
    s.includes('→ <span role="button"'),
    `frozen=${frozen}: стрелка состояния ведёт токеном, а не текстом`,
  );
  ck(
    s.includes('← <span role="button"'),
    `frozen=${frozen}: стрелка состава ведёт токеном, а не текстом`,
  );
  // «✓ garment», «✕ break» и «N pieces» ссылками НЕ становятся: у первых двух адресата нет, у
  // третьего его нет тоже — числу некуда вести. Орган, который иногда работает, а иногда нет, —
  // ровно тот перегруз, ради снятия которого токен и заведён.
  for (const dead of ['✓ garment', '✕ break', '2 pieces', '1 piece']) {
    ck(
      !new RegExp(`role="button"[^>]*>${dead.replace(/[+]/g, '\\$&')}<`).test(s),
      `frozen=${frozen}: «${dead}» органом не стало`,
    );
  }

  // ХВОСТОВОЙ БОКС ЖИВЁТ ТОЛЬКО В ТРЕТЬЕМ ПОЛОТНЕ, и до него золото не доставало вовсе.
  ck(s.includes('◌ waiting for a unit'), `frozen=${frozen}: хвост назван ожиданием`);
  ck(s.includes('joins a unit with its piece'), `frozen=${frozen}: хвост говорит про будущее`);
  ck(s.includes('nothing here reaches a unit yet.'), `frozen=${frozen}: подсказка хвоста на месте`);
  ck(
    s.includes('border border-dashed border-borderColor bg-bgColor'),
    `frozen=${frozen}: край хвоста 1px — рангом обычной коробки, а не узла`,
  );
  ck(s.includes('>2 steps<'), `frozen=${frozen}: подвал хвоста считает свои две строки`);
  ck(s.includes('Σ 2.4'), `frozen=${frozen}: Σ хвоста на месте — подвал не пустой`);
  for (const glyph of ['·', '▣', '+▣']) {
    ck(s.includes(`>${glyph}</span>`), `frozen=${frozen}: глиф «${glyph}» на месте`);
  }
  // Смоук Ф1: штриховка ткани доезжает до снимка. Без неё «перенос ничего не сломал» проверялось бы
  // на разметке, где штриховки нет вовсе.
  ck(/<pattern /.test(s), `frozen=${frozen}: паттерны штриховки ткани в разметке`);
  ck(s.includes("role=\"button\""), `frozen=${frozen}: органы полотна — div с ролью кнопки`);
}
// ПОКОЙНАЯ РАЗМЕТКА ПОД ЗАМОРОЗКОЙ ТЕПЕРЬ ТА ЖЕ, И ЭТО ПРОВЕРЯЕТСЯ, А НЕ ДОПУСКАЕТСЯ.
//
// Раньше здесь стояло обратное — «frozen меняет разметку» и «кликабельных органов меньше», — и
// стояло справедливо: голова плитки под заморозкой роли не получала вовсе, а у свободной детали
// пропадала и на драфте, стоило её съесть. Обе развилки сняты (Т10 и Т9в): в ПОКОЕ по ноде можно
// делать ровно одно — выделить её, а выделение это ПРЕЗЕНТАЦИЯ, и смотреть на RELEASED разрешено
// (R10). Всё, что заморозка отнимает, живёт в ховер-полосе и в этот снимок не попадает ни байтом.
//
// Проверка от этого не стала холостой, она сменила знак: любое расхождение покойной разметки по
// `frozen` означает, что на выпущенной карточке снова что-то не рисуется, — и падает тут же.
ck(
  shots.false === shots.true,
  'в покое frozen разметку НЕ меняет: смотреть и выделять разрешено везде',
  `длины ${shots.false.length} и ${shots.true.length}`,
);
// `<button>` под внешним `<fieldset disabled>` карточки мёртв (R4): шапки, строки шагов и плитки
// обязаны остаться div-ами. Проверка накрывает ИСХОДНЫЙ рендер — полоса действий узла живёт под
// наведением, её чипы в снимок не попадают вовсе и сверяются построчно на ревью диффа.
ck(
  !/<button/.test(shots.false) && !/<button/.test(shots.true),
  'органы исходного рендера — не <button>',
);

// --- 2. юнит-кейсы извлечённых чистых функций --------------------------------------------------
const views = mod.views;
if (!views) {
  console.log('\nЮНИТ-КЕЙСЫ НЕ ПРОГНАНЫ: энтри не отдаёт `views` — модуль ещё не извлечён.');
  process.exit(1);
}
const {
  stepGlyph,
  stateWord,
  stateParts,
  compositionOf,
  compositionParts,
  partsText,
  directInputsOf,
  buildWires,
  makeRowY,
  METRICS,
} = views;

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const step = (inputs, out = '') => ({
  inputs: inputs.map(([kind, key]) => ({ kind, key })),
  outputUnitKey: out,
  outputUnitName: '',
});
const blk = (key, steps, extra = {}) => ({
  key,
  name: '',
  producedAt: steps[0] ?? -1,
  steps,
  leaves: [],
  live: true,
  absorbedInto: '',
  ...extra,
});

console.log('\nstepGlyph — три ветки');
{
  const steps = [
    step([['piece', 'FR']]),
    step(
      [
        ['piece', 'FR'],
        ['piece', 'BK'],
      ],
      'SHELL',
    ),
    step(
      [
        ['unit', 'SHELL'],
        ['piece', 'SL'],
      ],
      'SHELL',
    ),
  ];
  ck(stepGlyph(steps, 0) === '·', 'обработка — «·»', stepGlyph(steps, 0));
  ck(stepGlyph(steps, 1) === '▣', 'рождение узла — «▣»', stepGlyph(steps, 1));
  ck(stepGlyph(steps, 2) === '+▣', 'поглощение — «+▣»', stepGlyph(steps, 2));
  ck(stepGlyph(steps, 9) === '·', 'шага нет — «·», а не падение', stepGlyph(steps, 9));
}

console.log('\nstateWord — три ветки');
{
  ck(stateWord(blk('G', [0]), true) === '✓ garment', 'терминал');
  ck(
    stateWord(blk('S', [0], { absorbedInto: 'G' }), false) === '→ ▣ G',
    'поглощённый',
    stateWord(blk('S', [0], { absorbedInto: 'G' }), false),
  );
  ck(stateWord(blk('X', [0]), false) === '✕ break', 'разрыв');
  // Терминал СИЛЬНЕЕ поглощения: узел, съеденный кем-то и при этом единственный живой, — это
  // невозможное состояние, и порядок веток решает, каким словом схема о нём скажет.
  ck(stateWord(blk('S', [0], { absorbedInto: 'G' }), true) === '✓ garment', 'терминал бьёт поглощение');
}

console.log('\nstateParts — адресат ровно у одной ветки из трёх');
{
  // ГЛАВНОЕ СВОЙСТВО ТОКЕНА: он есть там и только там, где есть КУДА идти. «✓ garment» — конец
  // пути, «✕ break» не ведёт никуда, и кликабельной СТРОКОЙ они не станут — органа в них нет.
  const to = (parts) => parts.filter((p) => p.to !== undefined).map((p) => p.to);
  ck(eq(to(stateParts(blk('G', [0]), true)), []), 'терминал адресата не имеет');
  ck(eq(to(stateParts(blk('X', [0]), false)), []), 'разрыв адресата не имеет');
  const absorbed = stateParts(blk('S', [0], { absorbedInto: 'G' }), false);
  ck(eq(to(absorbed), ['G']), 'поглощение ведёт к съевшему узлу', JSON.stringify(absorbed));
  ck(
    absorbed.find((p) => p.to === 'G')?.text === '▣ G',
    'текст токена — имя узла целиком, вместе с глифом',
    JSON.stringify(absorbed),
  );
  // Разбиение обязано быть БЕЗ ПОТЕРЬ: видимая строка ровно та же, что печаталась до токенов.
  for (const [b, t] of [
    [blk('G', [0]), true],
    [blk('S', [0], { absorbedInto: 'G' }), false],
    [blk('X', [0]), false],
  ]) {
    ck(partsText(stateParts(b, t)) === stateWord(b, t), `склейка кусков = строка (${stateWord(b, t)})`);
  }
}

console.log('\ndirectInputsOf — дедуп, свой ключ, порядок первого вхождения');
{
  const steps = [
    step(
      [
        ['piece', 'FR'],
        ['piece', 'BK'],
      ],
      'SHELL',
    ),
    step(
      [
        ['unit', 'SHELL'],
        ['piece', 'SL'],
        ['piece', 'FR'],
      ],
      'SHELL',
    ),
    step([['unit', 'HOOD']]),
  ];
  const blocks = [blk('SHELL', [0, 1, 2])];
  const got = directInputsOf(blocks, steps).get('SHELL');
  ck(eq(got, ['FR', 'BK', 'SL', 'HOOD']), 'порядок первого вхождения, свой ключ выброшен, дублей нет', JSON.stringify(got));

  const empty = directInputsOf([blk('T', [])], steps).get('T');
  ck(eq(empty, []), 'блок без шагов — пустой список', JSON.stringify(empty));

  // Вход с пустым ключом отбрасывается: он не сущность, а незаполненная строка формы.
  const blank = directInputsOf([blk('B', [0])], [step([['piece', '']])]).get('B');
  ck(eq(blank, []), 'пустой ключ входа отброшен', JSON.stringify(blank));
}

console.log('\ncompositionOf — узлы поимённо, детали числом');
{
  const units = new Map([
    ['SHELL', {}],
    ['HOOD', {}],
  ]);
  const di = new Map([
    ['G', ['SHELL', 'HOOD', 'FR', 'BK']],
    ['ONE', ['FR']],
    ['UNITS', ['SHELL']],
    ['NONE', []],
  ]);
  ck(
    compositionOf('G', di, units) === '← ▣ SHELL + ▣ HOOD + 2 pieces',
    'узлы поимённо, детали числом',
    compositionOf('G', di, units),
  );
  ck(compositionOf('ONE', di, units) === '← 1 piece', 'единственное число', compositionOf('ONE', di, units));
  ck(compositionOf('UNITS', di, units) === '← ▣ SHELL', 'без деталей — без счётчика', compositionOf('UNITS', di, units));
  ck(compositionOf('NONE', di, units) === '', 'пустой вход — пустая строка', compositionOf('NONE', di, units));
  ck(compositionOf('MISSING', di, units) === '', 'ключа нет в карте — пустая строка');
  // Свой ключ выбрасывает directInputsOf, и связка обязана оставаться сквозной.
  const steps = [
    step(
      [
        ['unit', 'G'],
        ['piece', 'HEM'],
      ],
      'G',
    ),
  ];
  const chained = compositionOf('G', directInputsOf([blk('G', [0])], steps), new Map([['G', {}]]));
  ck(chained === '← 1 piece', 'поглощение не пишет «берёт сам себя»', chained);

  // АДРЕСАТЫ СОСТАВА — только узлы. Детали приезжают ЧИСЛОМ, и числу некуда вести: ссылка на
  // «2 pieces» либо врала бы про одну из двух, либо требовала бы выбирать за автора.
  const to = (parts) => parts.filter((p) => p.to !== undefined).map((p) => p.to);
  ck(
    eq(to(compositionParts('G', di, units)), ['SHELL', 'HOOD']),
    'ссылками стали узлы и только они',
    JSON.stringify(compositionParts('G', di, units)),
  );
  ck(eq(to(compositionParts('ONE', di, units)), []), 'состав из одних деталей ссылок не даёт');
  ck(eq(compositionParts('NONE', di, units), []), 'пустой вход — ни одного куска');
  for (const k of ['G', 'ONE', 'UNITS', 'NONE', 'MISSING']) {
    ck(
      partsText(compositionParts(k, di, units)) === compositionOf(k, di, units),
      `склейка кусков = строка состава (${k})`,
      partsText(compositionParts(k, di, units)),
    );
  }
}

console.log('\nmakeRowY — строка бокса, а не бокс');
{
  const { HEAD_H, LINE_H } = METRICS;
  const box = { key: 'S', x: 100, y: 40, w: 180, h: 90 };
  const layout = { byKey: new Map([['S', box]]), tail: undefined, tiles: [], tailSteps: [] };
  const blocks = [blk('S', [3, 7, 9])];
  const rowY = makeRowY(blocks, layout);
  ck(rowY('S', 3) === 40 + HEAD_H + 2 + 0 * LINE_H + LINE_H / 2, 'первая строка', String(rowY('S', 3)));
  ck(rowY('S', 9) === 40 + HEAD_H + 2 + 2 * LINE_H + LINE_H / 2, 'третья строка', String(rowY('S', 9)));
  ck(rowY('S', 5) === 40 + HEAD_H / 2, 'шага нет в блоке — центр шапки', String(rowY('S', 5)));
  ck(rowY('NOPE', 3) === 0, 'бокса нет в раскладке — 0', String(rowY('NOPE', 3)));

  const tail = { key: '', x: 500, y: 16, w: 180, h: 70 };
  const withTail = { byKey: new Map(), tail, tiles: [], tailSteps: [4] };
  const rowYTail = makeRowY([blk('', [4])], withTail);
  ck(
    rowYTail('', 4) === 16 + HEAD_H + 2 + 0 * LINE_H + LINE_H / 2,
    'хвост ищется полем tail, а не byKey',
    String(rowYTail('', 4)),
  );

  // ХВОСТ СЧИТАЕТСЯ ПО `tailSteps`, А НЕ ПО СВОЕМУ БЛОКУ. Блок хвоста по-прежнему держит ВСЕ
  // шаги вне узлов, включая обработки, уехавшие на плитки своих деталей: атрибуция намеренно не
  // тронута. Считай провод по блоку — и он целился бы в строку, сдвинутую на все уехавшие, то
  // есть мимо всех оставшихся.
  const trimmed = { byKey: new Map(), tail, tiles: [], tailSteps: [7] };
  const rowYTrim = makeRowY([blk('', [4, 7])], trimmed);
  ck(
    rowYTrim('', 7) === 16 + HEAD_H + 2 + 0 * LINE_H + LINE_H / 2,
    'уехавшая на плитку строка не сдвигает оставшуюся',
    String(rowYTrim('', 7)),
  );
  ck(
    rowYTrim('', 4) === 16 + HEAD_H / 2,
    'шага, уехавшего на плитку, в хвосте нет — центр шапки',
    String(rowYTrim('', 4)),
  );
}

console.log('\nbuildWires — из правого края источника в строку потребителя');
{
  const shell = { key: 'SHELL', x: 0, y: 0, w: 180, h: 60 };
  const garment = { key: 'GARMENT', x: 400, y: 100, w: 180, h: 60 };
  const tile = { key: 'FR', x: -60, y: 10, w: 52, h: 48, state: 'eaten', into: 'SHELL', consumers: [0] };
  const free = { key: 'FLAP', x: -60, y: 200, w: 64, h: 48, state: 'free', into: '', consumers: [1] };
  const steps = [
    step(
      [
        ['piece', 'FR'],
        ['piece', 'BK'],
      ],
      'SHELL',
    ),
    step(
      [
        ['unit', 'SHELL'],
        ['piece', 'FLAP'],
      ],
      'GARMENT',
    ),
  ];
  const blocks = [blk('SHELL', [0]), blk('GARMENT', [1])];
  const layout = {
    byKey: new Map([
      ['SHELL', shell],
      ['GARMENT', garment],
    ]),
    tail: undefined,
    tiles: [tile, free],
    tailSteps: [],
  };
  const rowY = makeRowY(blocks, layout);
  const wires = buildWires(blocks, steps, layout, rowY);

  const byKeyOf = new Map(wires.map((w) => [w.key, w]));
  ck(byKeyOf.has('SHELL->GARMENT:1'), 'формат ключа провода узла', [...byKeyOf.keys()].join(', '));
  ck(byKeyOf.has('tile:FR->SHELL:0'), 'формат ключа провода детали', [...byKeyOf.keys()].join(', '));

  const uw = byKeyOf.get('SHELL->GARMENT:1');
  ck(uw.from === 'SHELL' && uw.to === 'GARMENT', 'провод помнит свои концы');
  ck(
    uw.d.startsWith(`M${shell.x + shell.w},${shell.y + shell.h / 2} `),
    'провод выходит из середины правого края источника',
    uw.d,
  );
  ck(uw.d.endsWith(`${garment.x},${rowY('GARMENT', 1)}`), 'провод приходит в СТРОКУ потребителя', uw.d);
  ck(uw.faint === undefined, 'провод узла не бледный', String(uw.faint));

  ck(byKeyOf.get('tile:FR->SHELL:0').faint === false, 'деталь вошла в этот узел — полный провод');
  ck(byKeyOf.get('tile:FLAP->GARMENT:1').faint === true, 'деталь только обработана — бледный провод');

  // Съедена ДРУГИМ узлом, а обработана этим: связь есть, но полной её называть нельзя.
  const elsewhere = {
    key: 'CUF',
    x: -60,
    y: 300,
    w: 52,
    h: 48,
    state: 'eaten',
    into: 'GARMENT',
    consumers: [0],
  };
  const w2 = buildWires(blocks, steps, { ...layout, tiles: [elsewhere] }, rowY);
  ck(w2[w2.length - 1].faint === true, 'съедена не здесь — бледный провод', JSON.stringify(w2[w2.length - 1]));

  // Бокса нет в раскладке — провод не рисуется вовсе, а не целится в нули.
  const noBox = buildWires(
    blocks,
    steps,
    { byKey: new Map([['SHELL', shell]]), tail: undefined, tiles: [], tailSteps: [] },
    rowY,
  );
  ck(noBox.length === 0, 'нет бокса потребителя — провода нет', JSON.stringify(noBox));
  const noSource = buildWires(
    blocks,
    steps,
    { byKey: new Map([['GARMENT', garment]]), tail: undefined, tiles: [], tailSteps: [] },
    rowY,
  );
  ck(noSource.length === 0, 'нет бокса источника — провода нет', JSON.stringify(noSource));

  // Шаг, которого нет ни в одном блоке, провода детали не получает: целиться некуда.
  const orphan = { ...free, consumers: [5] };
  const w3 = buildWires(blocks, steps, { ...layout, tiles: [orphan] }, rowY);
  ck(w3.length === 1, 'потребитель вне блоков — провода нет', JSON.stringify(w3.map((w) => w.key)));

  // Собственный ключ узла входом не считается: «SHELL → SHELL» не провод, а поглощение.
  const selfSteps = [
    step(
      [
        ['unit', 'SHELL'],
        ['piece', 'SL'],
      ],
      'SHELL',
    ),
  ];
  const w4 = buildWires([blk('SHELL', [0])], selfSteps, { ...layout, tiles: [] }, rowY);
  ck(w4.length === 0, 'поглощение не рисует провод в себя', JSON.stringify(w4));

  // Хвостовой блок источником проводов не бывает: узлом он не является.
  const w5 = buildWires([blk('', [0])], selfSteps, { ...layout, tiles: [] }, rowY);
  ck(w5.length === 0, 'хвост не тянет проводов от себя', JSON.stringify(w5));

  // ПРОВОД ВЫХОДИТ ИЗ СЕРЕДИНЫ ГОЛОВЫ ПЛИТКИ, А НЕ ИЗ СЕРЕДИНЫ ПЛИТКИ. Высота выросла под
  // строки обработки, и точка выхода, посчитанная по ней, уехала бы к строкам — провод целился
  // бы в деталь мимо детали.
  const grown = { ...tile, h: METRICS.TILE + 2 * METRICS.PROC_ROW_H, processing: [0] };
  const wg = buildWires(blocks, steps, { ...layout, tiles: [grown] }, rowY);
  ck(
    wg[wg.length - 1].d.startsWith(`M${grown.x + grown.w},${grown.y + METRICS.TILE / 2} `),
    'провод детали выходит из середины ГОЛОВЫ, а не выросшей плитки',
    wg[wg.length - 1].d,
  );

  // ШАГ, УЕХАВШИЙ НА ПЛИТКУ, ИЗ ХВОСТА УШЁЛ — и провода в несуществующую строку быть не должно.
  // Блок хвоста про переезд не знает: атрибуция шагов намеренно осталась прежней.
  const looseStep = [step([['piece', 'CUF']])];
  const looseTile = {
    key: 'CUF',
    x: -60,
    y: 0,
    w: 52,
    h: 60,
    state: 'free',
    into: '',
    consumers: [0],
    processing: [0],
  };
  const tailBox = { key: '', x: 400, y: 16, w: 180, h: 68 };
  const wt = buildWires(
    [blk('', [0])],
    looseStep,
    { byKey: new Map(), tail: tailBox, tiles: [looseTile], tailSteps: [] },
    makeRowY([blk('', [0])], { byKey: new Map(), tail: tailBox, tiles: [], tailSteps: [] }),
  );
  ck(
    wt.length === 0,
    'провода в строку, уехавшую на плитку, нет',
    JSON.stringify(wt.map((w) => w.key)),
  );

  // А оставшийся в хвосте шаг провод получает как прежде: правило снимает лишнее, а не всё.
  const stays = buildWires(
    [blk('', [0])],
    looseStep,
    { byKey: new Map(), tail: tailBox, tiles: [{ ...looseTile, processing: [] }], tailSteps: [0] },
    makeRowY([blk('', [0])], { byKey: new Map(), tail: tailBox, tiles: [], tailSteps: [0] }),
  );
  ck(
    stays.length === 1,
    'оставшийся в хвосте шаг провод получает',
    JSON.stringify(stays.map((w) => w.key)),
  );
}

console.log(bad === 0 ? '\nвсё сошлось' : `\nрасхождений: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
