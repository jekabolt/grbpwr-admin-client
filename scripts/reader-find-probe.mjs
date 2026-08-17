// ЧИТАЛКА: «ТЕКУЩЕЕ СОВПАДЕНИЕ ↔ ВИДИМАЯ СТРАНИЦА» — ПРОТИВ ВРУЩЕГО СЧЁТЧИКА.
//
// Вопрос зонда ровно один и он не про поиск: подпись «3 из 5» — это ССЫЛКА на подсветку.
// Если подсветка лежит на странице, которой сейчас нет на экране, подпись врёт при первом же
// взгляде: человек читает «3 из 5» и не видит ни одной отметки. Провал этой связи ТИХИЙ —
// экран рисуется, кнопки нажимаются, ошибок в консоли нет, — поэтому она вынесена в чистые
// функции и проверяется здесь, а не глазами.
//
// Проверяются четыре вещи и их стык:
//   1. текст страницы   — синтетический перенос строки НИЧЕЙ (иначе подсветка съедет на символ);
//   2. поиск            — регистр, кириллица, фраза через перенос, спецсимволы регэкспа;
//   3. синхронизация    — три исхода syncHitToPages и круговой инвариант с pageOfHit;
//   4. раскладка матча  — sliceMatch не залезает в перенос и не теряет куски.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `reader-find-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'reader-find-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
  },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const eq = (a, b, what) => ck(JSON.stringify(a) === JSON.stringify(b), what, JSON.stringify(a));

// ── 1. ТЕКСТ СТРАНИЦЫ ─────────────────────────────────────────────────────────────────────

console.log('\n1 · buildPageText: смещения кусков и НИЧЕЙ перенос строки');
{
  const p = m.buildPageText([
    { str: 'состав', hasEOL: false },
    { str: ' и уход', hasEOL: true },
    { str: 'для изделий', hasEOL: false },
  ]);
  ck(p.text === 'состав и уход\nдля изделий', 'куски склеены, после hasEOL — перенос', JSON.stringify(p.text));
  eq(p.runs, [{ start: 0, end: 6 }, { start: 6, end: 13 }, { start: 14, end: 25 }],
    'диапазон каждого куска');
  // Дыра между 13 и 14 — тот самый перенос. Если он попадёт в чей-то диапазон, подсветка
  // потянется на символ, которого в тексте документа нет.
  ck(p.runs[1].end === 13 && p.runs[2].start === 14, 'перенос не принадлежит ни соседу слева, ни соседу справа');
  ck(p.text.slice(p.runs[2].start, p.runs[2].end) === 'для изделий', 'по диапазону читается ровно исходный кусок');
}
{
  const p = m.buildPageText([]);
  ck(p.text === '' && p.runs.length === 0, 'страница без текста даёт пустой текст и ноль кусков');
  const q = m.buildPageText([{ str: '' }, { str: 'x' }]);
  eq(q.runs, [{ start: 0, end: 0 }, { start: 0, end: 1 }], 'пустой кусок сохраняет позицию и не сдвигает соседей');
}

// ── 2. ПОИСК ──────────────────────────────────────────────────────────────────────────────

console.log('\n2 · findInText: регистр, кириллица, фраза через перенос, спецсимволы');
{
  const text = 'СОСТАВ И УХОД\nСостав указан на вшивной бирке.\nсостав';
  eq(m.findInText(text, 'состав').map((s) => s.start), [0, 14, 46], 'регистр не важен — три вхождения');
  eq(m.findInText(text, 'СоСтАв').length, 3, 'регистр запроса тоже не важен');
  eq(m.findInText(text, '  состав  ').length, 3, 'края запроса обрезаются');
  // Главное про pdf: строка рвётся ровно там, где человек напечатал пробел.
  eq(m.findInText('состав\nи уход', 'состав и уход').length, 1, 'фраза находится через перенос строки');
  eq(m.findInText('состав   и  уход', 'состав и уход').length, 1, 'фраза находится через несколько пробелов');
  eq(m.findInText(text, ''), [], 'пустой запрос — ноль совпадений, а не всё подряд');
  eq(m.findInText(text, '   '), [], 'запрос из пробелов — ноль совпадений');
  ck(m.queryPattern('') === null, 'пустой запрос не даёт регэкспа');
}
{
  // Спецсимволы регэкспа приходят из настоящих документов: «200 г/м²», «(1)», «п.3.1».
  eq(m.findInText('размер 60 × 40 мм (1)', '(1)').length, 1, 'скобки ищутся буквально');
  eq(m.findInText('поля не менее 3 мм', '.').length, 0, 'точка — это точка, а не «любой символ»');
  eq(m.findInText('пункт 3.1 и 331', '3.1').length, 1, 'точка не совпала с «331»');
  eq(m.findInText('a*b', '*'), [{ start: 1, end: 2 }],
    'одинокая звёздочка не роняет регэксп и ищется как символ');
}
{
  const spans = m.findInText('ааа', 'аа');
  eq(spans, [{ start: 0, end: 2 }], 'перекрывающиеся вхождения не считаются дважды');
}

console.log('\n2b · findAcrossPages / countsByPage: счётчики страниц рельса');
{
  const texts = ['состав и уход', 'состав указан', 'ничего', 'состав, состав'];
  const hits = m.findAcrossPages(texts, 'состав');
  eq(hits.map((h) => h.page), [1, 2, 4, 4], 'страницы 1-based и идут по порядку чтения');
  eq(m.countsByPage(hits), { 1: 1, 2: 1, 4: 2 }, 'счётчик на страницу; страницы без совпадений отсутствуют');
  eq(m.findAcrossPages(texts, 'ничего такого'), [], 'нет совпадений — пустой список, а не ошибка');
}

// ── 3. СИНХРОНИЗАЦИЯ. ГЛАВНОЕ ─────────────────────────────────────────────────────────────

// Документ: 6 страниц, совпадения на 2 (два), 4 (три) и 6 (одно). Всего шесть.
const DOC = [
  { page: 2, start: 0, end: 3 }, { page: 2, start: 10, end: 13 },
  { page: 4, start: 0, end: 3 }, { page: 4, start: 20, end: 23 }, { page: 4, start: 40, end: 43 },
  { page: 6, start: 5, end: 8 },
];
const TOTAL = 6;

console.log('\n3 · syncHitToPages: три исхода');
{
  eq(m.syncHitToPages([], 1, [1]), { hit: 0, page: 0, onScreen: false },
    'совпадений нет — нет и текущего: 0, а не «1 из 0»');

  const keep = m.syncHitToPages(DOC, 4, [4]);
  eq(keep, { hit: 4, page: 4, onScreen: true }, 'совпадение уже на видимой странице — не трогаем');

  // Человек кликнул страницу 4 в рельсе, а счётчик стоял на совпадении со страницы 2.
  const moved = m.syncHitToPages(DOC, 1, [4]);
  eq(moved, { hit: 3, page: 4, onScreen: true }, 'страница сменилась — счётчик переехал на ПЕРВОЕ совпадение этой страницы');

  // Третий исход: на видимой странице совпадений нет вообще. Подменять счётчик нечем —
  // и функция обязана СКАЗАТЬ это, а не соврать про onScreen.
  const away = m.syncHitToPages(DOC, 3, [5]);
  eq(away, { hit: 3, page: 4, onScreen: false }, 'на странице без совпадений — честное onScreen:false и адрес совпадения');
}
{
  eq(m.syncHitToPages(DOC, 0, [2]), { hit: 1, page: 2, onScreen: true }, 'ноль зажимается в первое');
  eq(m.syncHitToPages(DOC, 99, [6]), { hit: 6, page: 6, onScreen: true }, 'номер больше числа совпадений зажимается в последнее');
  eq(m.syncHitToPages(DOC, 99, [1]), { hit: 6, page: 6, onScreen: false }, 'зажатие не выдумывает onScreen');
  eq(m.syncHitToPages(DOC, 2, []), { hit: 2, page: 2, onScreen: false }, 'ни одной видимой страницы — ничего не на экране');
}

console.log('\n3b · ИНВАРИАНТ: onScreen истинно ТОГДА И ТОЛЬКО ТОГДА, когда названная страница видима');
{
  let checked = 0, broken = 0;
  for (const spread of [false, true]) {
    for (let page = 1; page <= TOTAL; page++) {
      const shown = m.visiblePages(page, spread, TOTAL);
      for (let hit = 1; hit <= DOC.length; hit++) {
        const r = m.syncHitToPages(DOC, hit, shown);
        checked++;
        if (r.onScreen !== shown.includes(r.page)) broken++;
        // И названное совпадение обязано существовать: hit указывает на страницу page.
        if (r.hit > 0 && DOC[r.hit - 1].page !== r.page) broken++;
      }
    }
  }
  ck(broken === 0, `ни одного расхождения на ${checked} сочетаниях страницы, разворота и совпадения`,
    broken ? `${broken} расхождений` : '');
}

console.log('\n3c · КРУГОВОЙ ИНВАРИАНТ: перешёл к совпадению — оно на экране');
{
  // Это ровно то, что делает кнопка ↓ / enter: setHit(next); setPage(pageOfHit(...)).
  // Если после такого перехода sync возвращает другой номер или onScreen:false — счётчик врёт.
  let broken = 0, checked = 0;
  for (const spread of [false, true]) {
    for (let start = 1; start <= DOC.length; start++) {
      for (const dir of [1, -1]) {
        const next = m.stepHit(DOC.length, start, dir);
        const page = m.pageOfHit(DOC, next);
        const shown = m.visiblePages(page, spread, TOTAL);
        const r = m.syncHitToPages(DOC, next, shown);
        checked++;
        if (!(r.hit === next && r.onScreen && shown.includes(r.page))) broken++;
      }
    }
  }
  ck(broken === 0, `после перехода к совпадению оно всегда на видимой странице (${checked} переходов)`,
    broken ? `${broken} провалов` : '');
}

console.log('\n3d · stepHit: кольцо, pageOfHit: адрес');
{
  eq(m.stepHit(6, 6, 1), 1, 'после последнего — первое');
  eq(m.stepHit(6, 1, -1), 6, 'перед первым — последнее');
  eq(m.stepHit(6, 3, 1), 4, 'следующее');
  eq(m.stepHit(6, 3, -1), 2, 'предыдущее');
  eq(m.stepHit(0, 1, 1), 0, 'совпадений нет — идти некуда');
  eq(m.stepHit(1, 1, 1), 1, 'единственное совпадение — само себе следующее');
  eq(m.pageOfHit(DOC, 5), 4, 'адрес пятого совпадения');
  eq(m.pageOfHit([], 1), 0, 'адреса нет, когда нет совпадений');
  eq(m.pageOfHit(DOC, 999), 6, 'номер за пределами зажимается');
}

console.log('\n3e · visiblePages / stepPage: разворот');
{
  eq(m.visiblePages(3, false, TOTAL), [3], 'одна страница');
  eq(m.visiblePages(3, true, TOTAL), [3, 4], 'разворот — текущая и следующая');
  eq(m.visiblePages(6, true, TOTAL), [6], 'на последней странице развернуть нечего');
  eq(m.visiblePages(0, false, TOTAL), [1], 'ноль зажимается в первую');
  eq(m.visiblePages(99, false, TOTAL), [6], 'номер за пределами зажимается в последнюю');
  eq(m.visiblePages(1, false, 0), [], 'в документе без страниц не видно ничего');
  eq(m.stepPage(3, false, TOTAL, 1), 4, 'листаем по одной');
  eq(m.stepPage(3, true, TOTAL, 1), 5, 'в развороте лист переворачивается через два');
  eq(m.stepPage(1, false, TOTAL, -1), 1, 'назад с первой некуда');
  eq(m.stepPage(6, true, TOTAL, 1), 6, 'вперёд с последней некуда');
}

console.log('\n3f · pageForSpread: прыжок к совпадению не ломает разворот');
{
  eq(m.pageForSpread(5, 1, false, TOTAL), 5, 'без разворота — просто нужная страница');
  // Совпадение уже видно в текущем развороте: двигаться некуда, и двигаться НЕЛЬЗЯ —
  // иначе страница слева уезжает с экрана без причины.
  eq(m.pageForSpread(4, 3, true, TOTAL), 3, 'цель уже в развороте [3,4] — страница не меняется');
  eq(m.pageForSpread(3, 3, true, TOTAL), 3, 'цель и есть текущая — тоже без движения');
  // Чётность левой страницы держится той же, что задаёт stepPage, иначе пары съезжают на одну.
  eq(m.pageForSpread(6, 1, true, TOTAL), 5, 'цель 6 при развороте от 1 — встаём на 5, чтобы [5,6]');
  eq(m.pageForSpread(5, 2, true, TOTAL), 4, 'цель 5 при развороте от 2 — встаём на 4, чтобы [4,5]');
  eq(m.pageForSpread(1, 2, true, TOTAL), 1, 'у первой страницы отступать некуда — не уходим в ноль');
  eq(m.pageForSpread(99, 1, true, TOTAL), 5, 'цель за пределами зажимается и всё равно выравнивается');
}

console.log('\n3g · ИНВАРИАНТ: куда бы ни прыгнули, цель ВИДНА');
{
  let broken = 0, checked = 0;
  for (const spread of [false, true]) {
    for (let current = 1; current <= TOTAL; current++) {
      for (let target = 1; target <= TOTAL; target++) {
        const landed = m.pageForSpread(target, current, spread, TOTAL);
        checked++;
        if (!m.visiblePages(landed, spread, TOTAL).includes(target)) broken++;
      }
    }
  }
  ck(broken === 0, `цель видна после прыжка во всех ${checked} сочетаниях`,
    broken ? `${broken} провалов` : '');
}

console.log('\n3h · «показать» и ↓ говорят об ОДНОМ совпадении');
{
  // Ловушка, ради которой это здесь: совпадение не на экране, счётчик показывает «1 из 6».
  // Если ↓ считает от sync.hit слепо, оно уедет на второе — первое человек так и не увидит.
  const shown = m.visiblePages(5, false, TOTAL);       // страница 5, совпадений на ней нет
  const s = m.syncHitToPages(DOC, 1, shown);
  ck(s.onScreen === false && s.hit === 1, 'исходное состояние: «1 из 6», но не на экране',
    JSON.stringify(s));
  // Так теперь считает goHit: пока не на экране — сначала ПОКАЗАТЬ, а не шагнуть.
  const next = s.onScreen ? m.stepHit(DOC.length, s.hit, 1) : s.hit;
  eq(next, 1, 'первое нажатие ↓ остаётся на том же совпадении, что названо в счётчике');
  const landed = m.pageForSpread(m.pageOfHit(DOC, next), 5, false, TOTAL);
  eq(landed, 2, 'и уводит на страницу этого совпадения');
  const after = m.syncHitToPages(DOC, next, m.visiblePages(landed, false, TOTAL));
  eq(after, { hit: 1, page: 2, onScreen: true }, 'после нажатия оно на экране и номер не изменился');
  // Второе нажатие уже шагает дальше.
  const second = after.onScreen ? m.stepHit(DOC.length, after.hit, 1) : after.hit;
  eq(second, 2, 'второе нажатие ↓ идёт к следующему совпадению');
}

// ── 4. РАСКЛАДКА МАТЧА ПО КУСКАМ (по ней рисуется подсветка) ──────────────────────────────

console.log('\n4 · sliceMatch: подсветка не залезает в перенос и не теряет куски');
{
  const page = m.buildPageText([
    { str: 'состав', hasEOL: true },   // 0..6, перенос на 6
    { str: 'и уход', hasEOL: false },  // 7..13
    { str: ' далее', hasEOL: false },  // 13..19
  ]);
  ck(page.text === 'состав\nи уход далее', 'текст страницы', JSON.stringify(page.text));

  const one = m.findInText(page.text, 'уход');
  eq(m.sliceMatch(page, one[0]), [{ run: 1, from: 2, to: 6 }], 'совпадение внутри одного куска');

  const across = m.findInText(page.text, 'состав и');
  ck(across.length === 1, 'фраза через перенос нашлась');
  eq(m.sliceMatch(page, across[0]), [{ run: 0, from: 0, to: 6 }, { run: 1, from: 0, to: 1 }],
    'два отрезка: хвост первого куска и голова второго — перенос между ними НЕ подсвечивается');

  const wide = m.sliceMatch(page, { start: 0, end: page.text.length });
  eq(wide, [{ run: 0, from: 0, to: 6 }, { run: 1, from: 0, to: 6 }, { run: 2, from: 0, to: 6 }],
    'матч во всю страницу задевает все три куска целиком');

  eq(m.sliceMatch(page, { start: 6, end: 7 }), [],
    'матч ровно из переноса не даёт ни одного отрезка — рисовать нечего');
  eq(m.sliceMatch(page, { start: 100, end: 110 }), [], 'матч за пределами текста ничего не задевает');
}

// ── 5. ЧЕСТНАЯ ГРАНИЦА: СКАН, .md, МАСШТАБ ───────────────────────────────────────────────

console.log('\n5 · hasTextLayer: скан обязан сказать словами, а не показать «0 совпадений»');
{
  ck(m.hasTextLayer(['', '', '']) === false, 'три пустые страницы — текстового слоя нет');
  ck(m.hasTextLayer(['   \n \t ', '']) === false, 'пробелы и переносы — это НЕ текст');
  ck(m.hasTextLayer(['', '', 'состав']) === true, 'хоть одна буква — слой есть');
  ck(m.hasTextLayer([]) === false, 'нечего было понюхать — считаем, что слоя нет');
  ck(m.TEXT_LAYER_SAMPLE_PAGES >= 2, 'нюхаем не одну первую страницу: обложка часто картинка',
    String(m.TEXT_LAYER_SAMPLE_PAGES));
}

console.log('\n5b · isReadablePdf: развод с заметками — .md сюда НЕ приходит');
{
  ck(m.isReadablePdf('состав.pdf') === true, 'pdf по расширению');
  ck(m.isReadablePdf('СОСТАВ.PDF') === true, 'регистр расширения не важен');
  ck(m.isReadablePdf('заметка', 'application/pdf') === true, 'pdf по типу без расширения');
  ck(m.isReadablePdf('x', 'application/pdf; charset=binary') === true, 'параметры типа не мешают');
  // Заметка уходит на свой экран (md.v3). Читалка про него не знает и знать не должна.
  ck(m.isReadablePdf('заметка.md') === false, '.md — НЕ читалка');
  ck(m.isReadablePdf('заметка.md', 'text/markdown') === false, '.md по типу — тоже не читалка');
  ck(m.isReadablePdf('чертёж.dxf') === false, '.dxf — не читалка');
  ck(m.isReadablePdf('архив.zip') === false, '.zip — не читалка');
  ck(m.isReadablePdf('pdf.zip') === false, 'слово pdf в имени — не признак');
  ck(m.isReadablePdf('') === false, 'пустое имя без типа — не читалка');
}

console.log('\n5c · stepZoom: 50–200 шагом 25');
{
  eq([m.ZOOM_MIN, m.ZOOM_MAX, m.ZOOM_STEP], [50, 200, 25], 'границы и шаг те, что в тз');
  eq(m.stepZoom(100, 1), 125, 'плюс шаг');
  eq(m.stepZoom(100, -1), 75, 'минус шаг');
  eq(m.stepZoom(200, 1), 200, 'выше потолка не поднимается');
  eq(m.stepZoom(50, -1), 50, 'ниже пола не опускается');
  eq(m.stepZoom(133, 1), 150, 'нецелое значение сначала прижимается к сетке шага');
  const seen = [];
  for (let z = m.ZOOM_MIN; z !== m.ZOOM_MAX; z = m.stepZoom(z, 1)) {
    seen.push(z);
    if (seen.length > 20) break;
  }
  eq(seen, [50, 75, 100, 125, 150, 175], 'от пола до потолка ровно шесть шагов, без петли');
}

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\n${bad} ПРОВАЛОВ`);
process.exit(bad === 0 ? 0 : 1);
