#!/usr/bin/env node
// СТЕНД ГАЛЕРЕИ УКАЗАНИЙ — НАСТОЯЩИЙ ВВОД МЫШИ ПО НАСТОЯЩИМ КОМПОНЕНТАМ.
//
// Табличные зонды (`annotation-geometry`, `annotation-kinds`) доказывают чистые функции. Этот
// доказывает ЖЕСТЫ: клик, перетаскивание, рисование, клавиши. Проба на разметке не доказывает
// жест — поэтому здесь `mouse.down/move/up` и `keyboard.press`, а не `dispatchEvent`.
//
//   node scripts/annotation-canvas-probe.mjs                 прогон
//   node scripts/annotation-canvas-probe.mjs 5               только группа «5…»
//   node scripts/annotation-canvas-probe.mjs --mutate=phase  вернуть `drop` в фазу перехвата
//   node scripts/annotation-canvas-probe.mjs --sweep         прогнать всю батарею мутаций
//   node scripts/annotation-canvas-probe.mjs --list          перечислить мутации
//
// Мутации живут В ПАМЯТИ СБОРЩИКА: репозиторий не трогается. Зелёная мутация означает, что
// проверка ничего не держит, — это находка, а не успех.
//
// САМАЯ ХРУПКАЯ СТРОКА, ради которой стенд и коммитится: `--mutate=phase`. Фазу события
// (перехват против всплытия) синтетический прогон на React 19 не различает — её держит только
// настоящий ввод мыши. Без этой пробы следующая правка вернёт `true` третьим аргументом, и ни
// один зонд в репозитории не покраснеет, а перестановка плиток мышью перестанет применяться.
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const args = process.argv.slice(2);
const MUTATE = (args.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';
const MUTATE_LIST = MUTATE ? MUTATE.split(',').filter(Boolean) : [];
const only = args.find((a) => !a.startsWith('--')) ?? null;

// Каждая мутация возвращает РОВНО ту строку, которой была починка, и названа тем, что она ломает.
const MUTATIONS = {
  // Клик по указанию снова уводит курсор в textarea — и Backspace перестаёт удалять выноску.
  focus: { file: /annotation\/surface\.tsx$/, from: 'select(c.key);', to: "select(c.key, { focus: true });", all: true },
  // Снят сторож владения в ветке удаления (ожидается СЛЕПОЙ — см. комментарий у самой строки).
  owner: { file: /annotation\/surface\.tsx$/, from: '      if (!byKey.has(selected)) return;\n', to: '' },
  // Снят сторож скрытой вкладки: Backspace на эскизе уносит выноску с мудборда.
  hidden: { file: /annotation\/surface\.tsx$/, from: '      if (!visible) return;\n', to: '' },
  // Снята ветка Enter-в-редактор.
  enter: {
    file: /annotation\/surface\.tsx$/,
    from: "      if (e.key === 'Enter' && !typing && !placing && selected !== null && byKey.has(selected)) {",
    to: '      if (false) {',
  },
  // Маркиза выбранной фигуры не рисуется.
  marquee: { file: /annotation\/surface\.tsx$/, from: '  const marquee = (() => {', to: '  const marquee = (() => { if (1) return null;' },
  // ⌘Z снова сравнивается по НАПЕЧАТАННОЙ букве: на кириллице и греческом откат умирает.
  keyz: { file: /annotation\/surface\.tsx$/, from: "e.code === 'KeyZ'", to: "e.key === 'z'" },
  // Штрих снова копится в буфере вместо записи в форму: Save отправляет карточку без нарисованного.
  draft: { file: /annotation\/surface\.tsx$/, from: '        pushInkStroke(next);', to: '        void 0;' },
  // Прореживание прогоняется по СКЛЕЙКЕ, а не по штрихам: RDP съедает сам разделитель.
  thin: {
    file: /annotation\/surface\.tsx$/,
    from: '    const thin = s.length <= budget ? s : simplifyToLimit(s.map(toPx), budget, eps).map(toFrac);\n    if (out.length > 0) out.push(out[out.length - 1]);\n    out.push(...thin);',
    to: '    out.push(...s);',
  },
  // Полоса редактора снова появляется только при выборе — и полотно дёргается на каждый клик.
  slot: { file: /focused-annotator\.tsx$/, from: '    !readOnly && hasMedia ? (', to: '    !readOnly && hasMedia && selected != null ? (' },
  // Редактор не прокидывается в увеличенный вид: правка в зуме идёт в редактор ПОЗАДИ модалки.
  zoom: { file: /focused-annotator\.tsx$/, from: '          renderEditor={renderEditor}', to: '          renderEditor={undefined}' },
  // Порог заворота вернулся к «упёрся в самый конец»: первая стрелка не листает.
  rail: { file: /focused-annotator\.tsx$/, from: 'el.scrollLeft >= max - by / 2', to: 'el.scrollLeft >= max' },
  // Перенос строк в сетке не включается.
  wrap: { file: /focused-annotator\.tsx$/, from: "wrap ? 'flex-wrap'", to: "false ? 'flex-wrap'" },
  // Подвал плитки не рисуется — ни ручки перестановки, ни стрелок.
  footer: { file: /focused-annotator\.tsx$/, from: '                  {canOrder && (', to: '                  {false && (' },
  // Сторож «жест без файла приёмнику не адресован» — СНЯТЬ ОБА ЗВЕНА. Их два, и это не дублирование
  // по недосмотру: галерея сужает свои `regionHandlers`, а сам хук приёмки сужает СВОИ — внутри той
  // же рельсы живёт `MediaSlot`, у которого своя приёмка и мимо галереи. Снятие ОДНОГО звена ничего
  // не меняет (второе держит), поэтому мутация обязана снимать оба — иначе она «слепая» не потому,
  // что проба плоха, а потому, что мутация недостаточна.
  filedrag: {
    edits: [
      { file: /focused-annotator\.tsx$/, from: '        if (!isFileDrag(e)) return;\n', to: '' },
      { file: /useMediaIntake\.tsx$/, from: '        if (!enabled || !isFileDrag(e)) return;\n        e.preventDefault();\n        e.stopPropagation();\n        setDragging(true);', to: '        if (!enabled) return;\n        e.preventDefault();\n        e.stopPropagation();\n        setDragging(true);' },
    ],
  },
  // САМАЯ ЦЕННАЯ. `drop` возвращён в фазу ПЕРЕХВАТА: слушатель отработает раньше реактового
  // `onDrop` на плитке, обнулит `from`, и бросок выйдет по `if (from === null) return`.
  phase: {
    file: /gallery-order\.tsx$/,
    from: "    document.addEventListener('drop', done);",
    to: "    document.addEventListener('drop', done, true);",
  },
  // Второй рубеж сторожа залипшего жеста: жест, чей исходный узел размонтировали, повиснет навсегда.
  stuck: {
    file: /gallery-order\.tsx$/,
    from: "    const arm = window.setTimeout(() => window.addEventListener('mousemove', done, true), 400);",
    to: '    const arm = 0;',
  },
};

if (args.includes('--list')) {
  for (const k of Object.keys(MUTATIONS)) console.log(k);
  process.exit(0);
}

// ПРОГОН ВСЕЙ БАТАРЕИ. Мутация отвечает не «работает ли код», а «смотрит ли проверка туда, куда я
// думаю», поэтому вердикт — ЧИСЛО СЛОМАННЫХ ИСХОДОВ, а не код возврата. «СЛЕПА» здесь означает
// сторожа у мёртвого кода и требует либо пробы, либо честной записи, почему её не бывает.
//
// Известная слепая ровно одна — `owner`, и она объяснена в комментарии у самой строки
// (`annotation/surface.tsx`): выбор пер-аннотаторный, чужая галерея отсекается раньше, а внутри
// одного листа все кадры делят один `onRemove` — «не та» поверхность зовёт тот же обработчик с тем
// же ключом, и результат неотличим. Строка страхует разные списки у соседних поверхностей и
// владение откатом, а не сегодняшнее наблюдаемое поведение.
if (args.includes('--sweep')) {
  const self = fileURLToPath(import.meta.url);
  let caught = 0;
  for (const name of Object.keys(MUTATIONS)) {
    let out = '';
    try {
      out = execFileSync('node', [self, `--mutate=${name}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    if (out.includes('не нашла свою строку')) {
      console.log(`ОТКАЗ  ${name} — якорь мутации не найден (проба ничего не доказывает)`);
      continue;
    }
    const broke = [...out.matchAll(/^ {2}FAIL (\S+)/gm)].map((m) => m[1]);
    if (broke.length) caught += 1;
    console.log(`${broke.length ? 'ЛОВИТ ' : 'СЛЕПА '} ${name}${broke.length ? ` — сломано ${broke.length} [${broke.join(', ')}]` : ''}`);
  }
  console.log(`\nИТОГ: ${caught} из ${Object.keys(MUTATIONS).length} мутаций поймано пробами`);
  process.exit(0);
}
for (const name of MUTATE_LIST) {
  if (!MUTATIONS[name]) {
    console.log(`неизвестная мутация «${name}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
    process.exit(2);
  }
}

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch { /* не в зависимостях — ищем в кэше npx */ }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync('find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const dir of found) {
      // Берётся сборка, у которой есть СВОЙ chromium: старая версия из кэша ставит браузер,
      // которого нет, и все пробы краснеют по одной посторонней причине.
      try {
        const mod = `${dir}/index.js`;
        const reg = `${dir}/.local-browsers`;
        if (!existsSync(reg)) { if (!found[1]) return mod; continue; }
        return mod;
      } catch { /* следующая */ }
    }
    return found[0] ? `${found[0]}/index.js` : null;
  } catch { return null; }
}

const entryPath = resolvePlaywright();
if (!entryPath) { console.log('playwright не найден — проба пропущена (это не отказ)'); process.exit(0); }
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) { console.log('playwright найден, но без chromium — проба пропущена'); process.exit(0); }

// СЕТЕВОЙ СЛОЙ ПОДМЕНЁН. Без этого стенд ходит в бэкенд, всё приходит 404, и замеры «проходят» на
// пустом экране. Подмена по СУФФИКСУ пути: относительные импорты алиасом не перехватить.
const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        const nope = () => Promise.resolve({});
        export const adminService = new Proxy({}, { get: () => nope });
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

const mutation = MUTATE_LIST.length && {
  name: `canvas-mutation-${MUTATE_LIST.join('+')}`,
  setup(b) {
    for (const name of MUTATE_LIST) {
      // Мутация — это либо одна правка, либо СПИСОК правок: сторож, разложенный на два звена,
      // ловится только снятием обоих сразу.
      const edits = MUTATIONS[name].edits ?? [MUTATIONS[name]];
      for (const m of edits) {
        b.onLoad({ filter: m.file }, async (a) => {
          const src = await readFile(a.path, 'utf8');
          if (!src.includes(m.from)) throw new Error(`мутация «${name}» не нашла свою строку в ${a.path}`);
          const contents = m.all ? src.split(m.from).join(m.to) : src.replace(m.from, m.to);
          return { contents, loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      }
    }
  },
};

const outfile = resolve(tmpdir(), `annotation-canvas-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'annotation-canvas-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
  logLevel: 'warning', absWorkingDir: REPO, jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: mutation ? [stubNetwork, mutation] : [stubNetwork],
  // `import.meta` в iife пуст, а репозиторий читает из него переменные окружения — без подмены
  // модуль падает на загрузке, стенд не монтируется, и КАЖДАЯ проба краснеет по одной причине.
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'), hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

// СОБРАННАЯ CSS АДМИНКИ — НЕ УКРАШЕНИЕ СТЕНДА. Без неё tailwind-классов не существует, и замер
// геометрии (заворот ленты, высота полосы редактора) меряет голый html. Нет `dist` — замеры
// геометрии ЧЕСТНО пропускаются, а не красятся в зелёный.
function adminCss() {
  const dir = resolve(REPO, 'dist/assets');
  if (!existsSync(dir)) return null;
  const files = execFileSync('find', [dir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (!files.length) return null;
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}
const CSS = adminCss();
if (!CSS) console.log('dist/assets/index-*.css не найден — соберите `yarn build`, иначе замеры геометрии не имеют смысла');

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const state = (page) => page.$eval('#state', (el) => JSON.parse(el.textContent));

async function fresh(browser, storage = {}, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    fail += 1;
    results.push(`  FAIL page error — ${e.message}`);
  });
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await page.goto('http://probe.local/');
  if (CSS) await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[aria-label="probe images"]');
  return { ctx, page };
}

/** Ведёт мышь настоящим жестом: нажать, провести по точкам, отпустить. */
async function stroke(page, pts) {
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
}

const run = async (name, fn) => {
  if (only && !name.startsWith(only)) return;
  try {
    await fn();
  } catch (e) {
    fail += 1;
    results.push(`  FAIL ${name} — БРОСИЛО: ${e.message.split('\n')[0]}`);
  }
};

const browser = await chromium.launch();

// ── 1. Backspace удаляет ВЫБРАННОЕ, и клик не крадёт фокус ───────────────────────────────────────
await run('1 backspace', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('span[title="two"]');
  const active = await page.evaluate(() => document.activeElement?.tagName);
  check('1a клик по плашке НЕ уводит фокус в поле', active !== 'TEXTAREA' && active !== 'INPUT', `activeElement=${active}`);
  const before = (await state(page)).callouts.map((c) => c.number);
  await page.keyboard.press('Backspace');
  const after = (await state(page)).callouts.map((c) => c.number);
  check(
    '1b Backspace унёс РОВНО кликнутую (№2)',
    after.length === before.length - 1 && !after.includes(2) && after.includes(1) && after.includes(3) && after.includes(4),
    `было ${before} стало ${after}`,
  );
  await ctx.close();
});

// ── 2. Сторож владения: удаляется ровно одна выноска, а не по одной с каждого кадра ─────────────
await run('2 multidelete', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('span[title="two"]');
  await page.keyboard.press('Backspace');
  const s = await state(page);
  check('2a onRemove позван РОВНО ОДИН раз (кадров на листе три)', s.calls.remove === 1, `remove=${s.calls.remove}`);
  check(
    '2b выноски соседнего кадра целы (№3 и №4)',
    s.callouts.filter((c) => c.mediaId === 22).map((c) => c.number).join(',') === '3,4',
    JSON.stringify(s.callouts.map((c) => [c.mediaId, c.number])),
  );
  await ctx.close();
});

// 2c/2d — ЧУЖАЯ ГАЛЕРЕЯ НА ТОЙ ЖЕ СТРАНИЦЕ. Счётчик вызовов внутри ОДНОЙ галереи слеп: браузер
// делает микрозадачный чекпойнт МЕЖДУ слушателями одного события, React успевает перерисовать,
// эффект переподписывается — и ещё не вызванные слушатели по спецификации DOM пропускаются. Так
// N вызовов схлопываются в один. Видно другое: КТО его сделал. У соседней галереи свой `onRemove`,
// пишущий в свой список, и она подписалась РАНЬШЕ — без сторожа владения обслужит Backspace она.
await run('2c foreign gallery', async () => {
  const { ctx, page } = await fresh(browser, { 'probe.two': '1' });
  await page.waitForSelector('[aria-label="neighbour images"]');
  await page.click('span[title="two"]');
  await page.keyboard.press('Backspace');
  const s = await state(page);
  const n = await page.$eval('#state2', (el) => JSON.parse(el.textContent));
  check('2c чужая галерея НЕ получила вызова удаления', n.hits === 0, `hits=${n.hits}`);
  check(
    '2d выбранная выноска всё-таки удалена (её удалил владелец)',
    !s.callouts.some((c) => c.key === 'a2'),
    JSON.stringify(s.callouts.map((c) => c.key)),
  );
  check('2e и своя выноска соседа цела', n.rows.join(',') === 'x1', JSON.stringify(n.rows));
  await ctx.close();
});

// 2f/2g — СТОРОЖ СКРЫТОЙ ВКЛАДКИ (`visible` в слушателе клавиш). Вкладки карточки смонтированы все
// разом, переключение — это `hidden`, а выбор переживает уход с вкладки: без проверки Backspace,
// нажатый на эскизе, уносил бы выноску с мудборда молча. Сначала положительный контроль — на
// ВИДИМОЙ вкладке та же последовательность действительно удаляет.
await run('2f hidden tab guard', async () => {
  const { ctx, page } = await fresh(browser, { 'probe.two': '1' });
  await page.waitForSelector('[aria-label="neighbour images"]');
  await page.click('span[title="neighbour"]');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(80);
  const n = await page.$eval('#state2', (el) => JSON.parse(el.textContent));
  check('2f на ВИДИМОЙ вкладке Backspace выноску удаляет', n.hits === 1 && n.rows.length === 0, `hits=${n.hits}, rows=${JSON.stringify(n.rows)}`);
  await ctx.close();
});

await run('2g hidden tab guard', async () => {
  const { ctx, page } = await fresh(browser, { 'probe.two': '1' });
  await page.waitForSelector('[aria-label="neighbour images"]');
  await page.click('span[title="neighbour"]');
  // Ушли с вкладки, выбор остался — ровно то состояние, в котором жил дефект.
  await page.evaluate(() => window.__hideNeighbour(true));
  await page.waitForTimeout(60);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(80);
  const n = await page.$eval('#state2', (el) => JSON.parse(el.textContent));
  check('2g на СКРЫТОЙ вкладке Backspace не трогает ничего', n.hits === 0 && n.rows.join(',') === 'x1', `hits=${n.hits}, rows=${JSON.stringify(n.rows)}`);
  await ctx.close();
});

// ── 3. Enter открывает текст выбранного ─────────────────────────────────────────────────────────
await run('3 enter-edit', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('span[title="two"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
  const active = await page.evaluate(() => document.activeElement?.tagName);
  check('3a Enter ставит курсор в поле редактора', active === 'TEXTAREA', `activeElement=${active}`);
  const s = await state(page);
  check('3b и ничего не удалил', s.callouts.length === 4 && s.calls.remove === 0, JSON.stringify(s.calls));
  await ctx.close();
});

// ── 4. Выбранное видно ──────────────────────────────────────────────────────────────────────────
await run('4 highlight', async () => {
  const { ctx, page } = await fresh(browser);
  check('4a до выбора маркизы нет', (await page.$$('[data-marquee]')).length === 0);
  await page.click('span[title="four"]'); // dim, два якоря
  const marq = await page.$$('[data-marquee]');
  check('4b у выбранной фигуры с якорями есть маркиза', marq.length === 1, `найдено ${marq.length}`);
  const box = await page.$eval('[data-marquee] rect', (r) => r.getBoundingClientRect().width);
  check('4c маркиза имеет ненулевую ширину', box > 10, `width=${box}`);
  await page.click('span[title="one"]'); // пин
  check(
    '4d выбранный пин помечен и маркизы у него нет',
    (await page.$$('[data-callout-selected="true"]')).length === 1 &&
      (await page.$$('[data-marquee]')).length === 0,
  );
  const ring = await page.$eval('[data-callout-selected="true"]', (el) => getComputedStyle(el).outlineWidth);
  check('4e кольцо выбора реально нарисовано', ring !== '0px' && ring !== '', `outline-width=${ring}`);
  await ctx.close();
});

// ── 5. Сессия фрихенда ──────────────────────────────────────────────────────────────────────────
async function drawTwoStrokes(page) {
  const frame = await page.$('[aria-label="probe images"] > div');
  const r = await frame.boundingBox();
  await stroke(page, [
    { x: r.x + 20, y: r.y + 30 },
    { x: r.x + 60, y: r.y + 50 },
    { x: r.x + 90, y: r.y + 40 },
  ]);
  await stroke(page, [
    { x: r.x + 30, y: r.y + 150 },
    { x: r.x + 80, y: r.y + 170 },
    { x: r.x + 110, y: r.y + 160 },
  ]);
}

await run('5 ink', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('span[title*="press and drag"]'); // чип «freehand»
  await drawTwoStrokes(page);
  let s = await state(page);
  // ИНВАРИАНТ ПЕРЕВЁРНУТ НАМЕРЕННО. В первой редакции штрихи копились в состоянии поверхности и
  // становились выноской только в конце сессии — и здесь стояло «выносок не прибавилось». Ценой
  // была дыра: Save карточки не был ни одним из концов сессии, поэтому нарисованное было ВИДНО на
  // кадре и ОТСУТСТВОВАЛО в отправляемых данных. Теперь первый же штрих создаёт выноску, а
  // следующие её дописывают: невыписанного состояния нет вовсе.
  check('5a два штриха дали РОВНО ОДНУ выноску-след', s.callouts.filter((c) => c.kind === 'ink').length === 1, `ink ${s.callouts.filter((c) => c.kind === 'ink').length}, всего ${s.callouts.length}`);
  const chip = await page.locator('text=/done · 2 strokes/').count();
  check('5b строка завершения называет число штрихов', chip === 1, `чипов ${chip}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
  s = await state(page);
  const fresh_ = s.callouts.filter((c) => c.kind === 'ink');
  check('5c Enter дал РОВНО ОДНУ фигуру-след', fresh_.length === 1, `ink-выносок ${fresh_.length}`);
  if (fresh_.length === 1) {
    const pts = fresh_[0].points;
    let dups = 0;
    for (let i = 1; i < pts.length; i++)
      if (pts[i].x === pts[i - 1].x && pts[i].y === pts[i - 1].y) dups += 1;
    check('5d в точках ровно ОДИН соседний дубль — разделитель штрихов', dups === 1, `дублей ${dups}, точек ${pts.length}`);
    const inRange = pts.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    check('5e все координаты в 0..1 (сервер валидирует именно это)', inRange);
    check('5f точек не больше серверного предела 200', pts.length <= 200, `точек ${pts.length}`);
  }
  // ⌘Z снимает ОДИН ШТРИХ: запись в историю теперь у каждого своя. Первая отмена возвращает след
  // к одному штриху (разделителей не остаётся), вторая уносит выноску целиком.
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(80);
  s = await state(page);
  const one = s.callouts.filter((c) => c.kind === 'ink');
  const dupsOf = (pts) => {
    let n = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].x === pts[i - 1].x && pts[i].y === pts[i - 1].y) n += 1;
    return n;
  };
  check('5g первый ⌘Z снял ОДИН штрих, выноска осталась', one.length === 1 && dupsOf(one[0].points) === 0,
    `ink ${one.length}${one.length ? `, дублей ${dupsOf(one[0].points)}` : ''}`);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(80);
  s = await state(page);
  check('5n второй ⌘Z унёс выноску', s.callouts.filter((c) => c.kind === 'ink').length === 0, `осталось ${s.callouts.filter((c) => c.kind === 'ink').length}`);
  await ctx.close();
});

// ── F1: SAVE КАРТОЧКИ ПОСРЕДИ ОТКРЫТОЙ СЕССИИ ───────────────────────────────────────────────────
// Путь, которого не покрывал ни один конец сессии: нарисовал — нажал Save. Save это не смена
// инструмента, не Enter, не закрытие зума и не размонтирование. Положительный контроль обязателен:
// без «след виден на кадре» проба «след в отправленных данных» прошла бы и на пустом экране.
await run('5m save mid-session', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('span[title*="press and drag"]');
  await drawTwoStrokes(page);
  const drawn = await page.$$eval('svg path', (els) => els.length);
  check('5m след нарисован и виден на кадре', drawn > 0, `path-ов ${drawn}`);
  const chip = await page.locator('text=/done · 2 strokes/').count();
  check('5o сессия ОТКРЫТА в момент Save (строка завершения на экране)', chip === 1, `чипов ${chip}`);
  // Save — и никаких «сначала закончи»: ни Enter, ни done, ни смены инструмента.
  await page.click('#save');
  await page.waitForTimeout(80);
  const s = await state(page);
  const sent = (s.submitted ?? []).filter((c) => c.kind === 'ink');
  check('5p отправленные данные содержат след', sent.length === 1, `ink в submitted ${sent.length}`);
  if (sent.length === 1) {
    let dups = 0;
    const pts = sent[0].points;
    for (let i = 1; i < pts.length; i++) if (pts[i].x === pts[i - 1].x && pts[i].y === pts[i - 1].y) dups += 1;
    check('5q и оба штриха внутри: разделитель уехал вместе с ними', dups === 1, `дублей ${dups}, точек ${pts.length}`);
  }
  await ctx.close();
});

await run('5x ink commit by tool change', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('span[title*="press and drag"]');
  await drawTwoStrokes(page);
  check('5h штрихи уже в форме до всякого конца сессии', (await state(page)).callouts.filter((c) => c.kind === 'ink').length === 1);
  await page.click('span[title*="a numbered point"]'); // чип «pin»
  await page.waitForTimeout(80);
  const s = await state(page);
  check('5i смена инструмента закрыла сессию, фигура одна', s.callouts.filter((c) => c.kind === 'ink').length === 1, `ink ${s.callouts.filter((c) => c.kind === 'ink').length}`);
  await ctx.close();
});

await run('5z ink commit on zoom close', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('[aria-label="zoom · pan · edit — picture 1"]');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] span[title*="press and drag"]');
  const img = await page.$('[role="dialog"] img');
  const r = await img.boundingBox();
  await stroke(page, [
    { x: r.x + r.width * 0.3, y: r.y + r.height * 0.3 },
    { x: r.x + r.width * 0.4, y: r.y + r.height * 0.35 },
    { x: r.x + r.width * 0.5, y: r.y + r.height * 0.3 },
  ]);
  await stroke(page, [
    { x: r.x + r.width * 0.3, y: r.y + r.height * 0.6 },
    { x: r.x + r.width * 0.4, y: r.y + r.height * 0.65 },
    { x: r.x + r.width * 0.5, y: r.y + r.height * 0.6 },
  ]);
  check('5j в зуме штрихи тоже уезжают в форму сразу', (await state(page)).callouts.filter((c) => c.kind === 'ink').length === 1);
  await page.click('[aria-label="close the zoomed view"]');
  await page.waitForTimeout(120);
  const s = await state(page);
  const ink = s.callouts.filter((c) => c.kind === 'ink');
  check('5k закрытие зума ничего не потеряло', ink.length === 1, `ink ${ink.length}`);
  if (ink.length === 1) {
    let dups = 0;
    const pts = ink[0].points;
    for (let i = 1; i < pts.length; i++)
      if (pts[i].x === pts[i - 1].x && pts[i].y === pts[i - 1].y) dups += 1;
    check('5l и разделитель на месте', dups === 1, `дублей ${dups}`);
  }
  await ctx.close();
});

// ── 7. Редактор не двигает полотно ──────────────────────────────────────────────────────────────
await run('7 no-jump', async () => {
  const { ctx, page } = await fresh(browser);
  const railTop = () => page.$eval('[aria-label="probe images"]', (el) => Math.round(el.getBoundingClientRect().top));
  const t0 = await railTop();
  await page.click('span[title="two"]');
  await page.waitForTimeout(60);
  const t1 = await railTop();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
  await page.fill('textarea', 'x'.repeat(400));
  await page.waitForTimeout(80);
  const t2 = await railTop();
  // Пин своего кадра к этому моменту накрыт четырёхсотсимвольной плашкой — переключаемся на
  // выноску СОСЕДНЕГО кадра; проба про высоту полосы, а не про то, кто кого перекрывает.
  await page.click('span[title="three"]');
  await page.waitForTimeout(60);
  const t3 = await railTop();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const t4 = await railTop();
  check(
    '7a верх рельсы одинаков во всех пяти состояниях',
    new Set([t0, t1, t2, t3, t4]).size === 1,
    `[${t0}, ${t1}, ${t2}, ${t3}, ${t4}]`,
  );
  await ctx.close();
});

// ── 8. Редактор в зуме ──────────────────────────────────────────────────────────────────────────
await run('8 zoom-editor', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('[aria-label="zoom · pan · edit — picture 1"]');
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] span[title="two"]');
  await page.waitForTimeout(80);
  const inDialog = await page.$$eval('[role="dialog"] textarea', (n) => n.length);
  const onPage = await page.$$eval('textarea', (n) => n.length);
  check('8a редактор рисуется ВНУТРИ диалога', inDialog === 1, `textarea в диалоге: ${inDialog}`);
  check('8b и второго под модалкой нет', onPage === inDialog, `всего textarea на странице: ${onPage}`);
  await page.click('[aria-label="close the zoomed view"]');
  await page.waitForTimeout(120);
  const back = await page.$$eval('textarea', (n) => n.length);
  check('8c после закрытия редактор вернулся на страницу', back === 1, `textarea: ${back}`);
  await ctx.close();
});

// ── 9. Перестановка кадров ──────────────────────────────────────────────────────────────────────
await run('9 reorder', async () => {
  const { ctx, page } = await fresh(browser);
  check('9a ручка перестановки есть у каждой плитки', (await page.$$('[title="drag to reorder"]')).length === 3);
  check('9b кнопки «set as preview» на листе нет', (await page.locator('text=set as preview').count()) === 0);

  // Жест ведём вручную и БЫСТРО: у `useReorder` есть сторож залипшего перетаскивания, который
  // через 400 мс считает первое же движение мыши концом жеста. Настоящая мышь во время нативного
  // drag'а движений не шлёт, а синтетическая шлёт — то есть медленный жест стенд убивает сам.
  const handle = page.locator('[title="drag to reorder"]').nth(2);
  const target = page.locator('[aria-label="probe images"] > div').nth(0);
  const hb = await handle.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 });
  await page.mouse.move(tb.x + tb.width / 2 + 2, tb.y + tb.height / 2, { steps: 2 });
  // ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ САМОГО ЖЕСТА: без него «приёмник не зажёгся» ниже было бы зелёным
  // просто потому, что перетаскивания не случилось вовсе.
  const litTarget = await page.$$eval('[aria-label="probe images"] > div', (els) =>
    els.filter((e) => e.className.includes('outline-textColor')).length,
  );
  check('9c перетаскивание реально идёт: цель броска подсвечена', litTarget === 1, `подсвечено плиток: ${litTarget}`);
  await page.mouse.up();
  await page.waitForTimeout(150);
  let s = await state(page);
  check('9d бросок плитки применяется', s.order.join(',') === '33,11,22', `order=${s.order}`);
  const firstKind = await page.$eval('[aria-label="probe images"] > div [data-footer-kind]', (el) => el.dataset.footerKind);
  check('9e подвал первой плитки показывает вид ПЕРЕЕХАВШЕГО кадра', firstKind === 'detail', `kind=${firstKind}`);
  await ctx.close();
});

// Клавиатурный путь перестановки — ОТДЕЛЬНОЙ пробой: он не идёт через `drop` и потому не зависит
// от дефекта канонного модуля, о котором говорит проба 9d.
// 9g/9h/9j — СТОРОЖ ЗАЛИПШЕГО ЖЕСТА, снятый с фазы перехвата у `drop`, обязан пережить правку.
// Жест, брошенный ВНЕ приёмника, события `drop` не рождает вовсе — состояние снимает `dragend`.
// Наблюдаемое у `cancel()` одно на двоих: он гасит `from` и `overIndex` одной функцией, а наружу
// торчит только подсветка цели. Поэтому подсветка ДО отпускания — положительный контроль (иначе
// «погасло» было бы зелёным просто от несостоявшегося жеста), а мутация M15 (снят `dragend`)
// отвечает, туда ли смотрит проба.
await run('9g abort outside', async () => {
  const { ctx, page } = await fresh(browser);
  const handle = page.locator('[title="drag to reorder"]').nth(2);
  const target = page.locator('[aria-label="probe images"] > div').nth(0);
  const hb = await handle.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 });
  await page.mouse.move(tb.x + tb.width / 2 + 2, tb.y + tb.height / 2, { steps: 2 });
  const lit = () =>
    page.$$eval('[aria-label="probe images"] > div', (els) =>
      els.filter((e) => e.className.includes('outline-textColor')).length,
    );
  check('9g жест идёт: цель броска подсвечена', (await lit()) === 1);
  // Отпускаем в отступе корня стенда — ВНЕ галереи: там нет ни плитки, ни приёмника файлов,
  // то есть никто не звал `preventDefault` на `dragover` и броска не будет.
  await page.mouse.move(4, 4, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await lit();
  check('9h подсветка снята, хотя броска не было', after === 0, `подсвечено: ${after}`);
  const s2 = await state(page);
  check('9j порядок кадров не менялся — бросок и правда не состоялся', s2.order.join(',') === '11,22,33', `order=${s2.order}`);
  await ctx.close();
});

// 9m/9n — СТОРОЖ ЗАЛИПШЕГО ЖЕСТА В ЕГО СОБСТВЕННОМ СЛУЧАЕ: исходный узел размонтировался посреди
// перетаскивания. Пробы 9g/9h/9j выше меряют поведение («жест мимо приёмника ничего не переставил
// и погасил подсветку»), но НЕ сторож: там состояние снимает реактовый `onDragEnd` на самой ручке.
//
// ЗАМЕРЕНО ЗДЕСЬ, и оно поправило представление о сторо́же: когда исходный узел снят, `dragend` не
// приходит НИКОМУ — в том числе document-слушателю. Через 120 мс после отпускания подсветка ещё
// висит. Спасает не он, а второй рубеж: первое движение мыши после 400 мс (во время нативного
// перетаскивания браузер `mousemove` не шлёт вовсе, поэтому движение = жест кончился). Проба и
// меряет ровно этот рубеж, а мутация M17 (снят взвод `mousemove`) отвечает, туда ли она смотрит.
await run('9m stuck gesture guard', async () => {
  const { ctx, page } = await fresh(browser);
  const handle = page.locator('[title="drag to reorder"]').nth(2);
  const target = page.locator('[aria-label="probe images"] > div').nth(0);
  const hb = await handle.boundingBox();
  const tb = await target.boundingBox();
  const lit = () =>
    page.$$eval('[aria-label="probe images"] > div', (els) =>
      els.filter((e) => e.className.includes('outline-textColor')).length,
    );
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 });
  await page.mouse.move(tb.x + tb.width / 2 + 2, tb.y + tb.height / 2, { steps: 2 });
  check('9m жест идёт: цель броска подсвечена', (await lit()) === 1);
  // Исходная плитка уходит с листа ПРЯМО В ЖЕСТЕ — её `onDragEnd` больше некому позвать.
  await page.evaluate(() => window.__dropView(2));
  await page.mouse.move(4, 4, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(600); // больше 400 мс: рубеж «первое движение мыши» взведён
  await page.mouse.move(40, 40, { steps: 2 });
  await page.waitForTimeout(120);
  const after = await lit();
  check('9n залипший жест снят вторым рубежом', after === 0, `подсвечено: ${after}`);
  await ctx.close();
});

await run('9k reorder by keyboard', async () => {
  const { ctx, page } = await fresh(browser);
  await page.click('[aria-label="move view 3 earlier"]');
  await page.waitForTimeout(80);
  const s = await state(page);
  check('9k стрелка ← переставляет с клавиатуры', s.order.join(',') === '11,33,22', `order=${s.order}`);
  const firstKind = await page.$$eval('[aria-label="probe images"] > div [data-footer-kind]', (e) => e.map((x) => x.dataset.footerKind));
  check('9l подвалы плиток поехали вместе с кадрами', firstKind.join(',') === 'front,detail,back', firstKind.join(','));
  await ctx.close();
});

await run('9i intake guard', async () => {
  const { ctx, page } = await fresh(browser);
  const rail = await page.$('[aria-label="probe images"]');
  const rb = await rail.boundingBox();
  const handle = page.locator('[title="drag to reorder"]').nth(2);
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  // Ведём В ЗАЗОР рельсы, мимо плиток — туда, где раньше зажигался приёмник файлов.
  await page.mouse.move(rb.x + rb.width - 12, rb.y + rb.height - 4, { steps: 6 });
  await page.mouse.move(rb.x + rb.width - 10, rb.y + rb.height - 4, { steps: 2 });
  const lit = await page.locator('text=drop the file').count();
  const dragging = await page.evaluate(() => !!document.querySelector('[title="drag to reorder"]'));
  check('9f перетаскивание плитки НЕ зажигает приёмник файлов', lit === 0 && dragging, `«drop the file» на экране: ${lit}`);
  await page.mouse.up();
  await ctx.close();
});

// ── 10. Карусель заворачивает с первого нажатия ─────────────────────────────────────────────────
await run('10 rail wrap', async () => {
  // ХОЛОСТОЕ НАЖАТИЕ БЫВАЕТ НЕ ПРИ ЛЮБОЙ ШИРИНЕ. Рельса со snap-mandatory отдыхает только в
  // снап-точках, и интересен ровно случай «от последней снап-точки до конца осталось меньше
  // полукарты»: там прежний код проезжал сливер, а заворачивал лишь СЛЕДУЮЩИМ нажатием. Ширину
  // окна подбираем так, чтобы этот случай существовал, — иначе проба зелена ни о чём.
  let found = null;
  for (let w = 460; w <= 900 && !found; w += 10) {
    const { ctx, page } = await fresh(browser, {}, w);
    const m = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="probe images"]');
      const max = el.scrollWidth - el.clientWidth;
      const card = el.firstElementChild.getBoundingClientRect().width + 8;
      if (max <= 1) return null;
      // Позиции покоя рельсы — снап-точки, то есть левые края плиток. Берём ПОСЛЕДНЮЮ, которая
      // ещё не совпала с концом, и смотрим, что реально встанет (snap правит присваивание сам).
      let last = null;
      for (const k of el.children) {
        const o = k.offsetLeft - el.offsetLeft;
        if (o > 1 && o < max - 2) last = o;
      }
      if (last == null) return null;
      el.scrollLeft = last;
      const rest = el.scrollLeft;
      return { max, card, rest, gap: max - rest };
    });
    if (m && m.rest > 5 && m.gap > 2 && m.gap < m.card / 2) found = { w, m, ctx, page };
    else await ctx.close();
  }
  check('10a есть положение, где до конца меньше полукарты (иначе мерить нечего)', !!found,
    found ? `ширина ${found.w}, ${JSON.stringify(found.m)}` : 'такого положения не нашлось');
  if (!found) return;
  const { page, ctx } = found;
  await page.click('[aria-label="next view"]');
  await page.waitForTimeout(700);
  const left = await page.$eval('[aria-label="probe images"]', (el) => el.scrollLeft);
  check('10b одно нажатие ›› завернуло в начало, а не проехало сливер',
    left < 5, `scrollLeft=${left} (было ${Math.round(found.m.rest)}, max=${Math.round(found.m.max)}, карта ${Math.round(found.m.card)})`);
  await ctx.close();
});

// ── 11. Переключатель вида ──────────────────────────────────────────────────────────────────────
await run('11 viewswitch', async () => {
  const { ctx, page } = await fresh(browser, {}, 520);
  check('11a в ленте стрелки есть', (await page.$$('[aria-label="next view"]')).length === 1);
  await page.click('[role="radio"][aria-checked="false"]');
  await page.waitForTimeout(120);
  const cls = await page.$eval('[aria-label="probe images"]', (el) => el.className);
  check('11b в гриде рельса переносит строки', cls.includes('flex-wrap') && !cls.includes('overflow-x-auto'), cls);
  check('11c и стрелок больше нет', (await page.$$('[aria-label="next view"]')).length === 0);
  const stored = await page.evaluate(() => localStorage.getItem('probe.rail'));
  check('11d выбор записан в предпочтения', stored === 'grid', `stored=${stored}`);
  await ctx.close();

  const second = await fresh(browser, { 'probe.rail': 'grid' }, 520);
  const cls2 = await second.page.$eval('[aria-label="probe images"]', (el) => el.className);
  check('11e режим пережил перемонтирование листа', cls2.includes('flex-wrap'), cls2);
  await second.ctx.close();
});

// ── 12. ⌘Z в чужой раскладке ────────────────────────────────────────────────────────────────────
await run('12 keyz', async () => {
  const { ctx, page } = await fresh(browser);
  // Сначала мутация — у ⌘Z есть владелец, и им становится последний, кто что-то менял.
  await page.click('span[title="two"]');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(60);
  check('12a есть что откатывать', (await state(page)).callouts.length === 3);
  // Синтетика здесь законна: проверяется ПРЕДИКАТ (по чему сравнивают клавишу), а не жест.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ω', code: 'KeyZ', ctrlKey: true, bubbles: true }),
    );
  });
  await page.waitForTimeout(80);
  const s = await state(page);
  check('12b ⌘Z сработал на греческой раскладке (key=ω, code=KeyZ)', s.calls.undo === 1 && s.callouts.length === 4, `undo=${s.calls.undo}, выносок ${s.callouts.length}`);
  await ctx.close();
});

await browser.close();

console.log(results.join('\n'));
console.log(`\nИСХОДЫ: ${pass} PASS, ${fail} FAIL (всего ${pass + fail})`);
// Вердикт — по ЧИСЛУ ИСХОДОВ. Код возврата ставится в конце, чтобы `yarn` не оборвал вывод.
process.exitCode = fail ? 1 : 0;
