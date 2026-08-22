#!/usr/bin/env node
// ОТКАЗ, ПРОТИВОРЕЧАЩИЙ ЭКРАНУ, — ЭТО РАСХОЖДЕНИЕ ВЕРСИЙ, А НЕ ОШИБКА ПОЛЯ.
//
// Владелец получил «operation_type: required» на поле, которое видел заполненным. Такой отказ не
// про человека: сервер не узнал ЗНАЧЕНИЯ, потому что бинарь старше приложения и выбросил
// незнакомый член словаря по дороге. Покрасить поле красным здесь — соврать про человека ровно в
// том случае, когда он всё заполнил.
//
// ЧТО ПРОВЕРЯЕТСЯ И ЧЕМ ЭТО ДЕРЖИТСЯ:
//   А. отказ ТРАНСПОРТА (строгий protojson Ф2) распознан и даёт баннер расхождения версий;
//   Б. отказ БИЗНЕС-ПРАВИЛА с похожим текстом («unknown field» из предиката email-сегмента)
//      баннера НЕ даёт — это и есть анти-ложное срабатывание, ради которого распознавание
//      построено на ПРЕФИКСЕ ПРОТОКОЛА `proto: (line `, а не на фразе;
//   В. отказ НА ПОЛЕ по-прежнему ложится на поле: `not_applicable` / `needs_*` /
//      `conflicts_with_*` классификатор не трогает, а `required` про ПУСТОЕ поле — обычный отказ;
//   Г. разметка: баннер смонтирован, называет поля и цитирует сервер (живой DOM).
//
// ТЕЛА ОТКАЗОВ СКОПИРОВАНЫ ИЗ ПРОГОНА СЕРВЕРНОГО ТЕСТА `internal/api/http/marshaler_test.go`
// (2026-08-22), а не сочинены:
//   400 {"code":3,"message":"proto: (line 1:145): unknown field \"pressAction2\"","details":[]}
//   400 {"code":3,"message":"proto: (line 1:163): invalid value for enum field action:
//        \"TECH_CARD_PRESS_ACTION_OPEN\"","details":[]}
// Если бамп grpc-gateway изменит форму — сначала пересобирается распознаватель, потом чинится
// тест (так написано в самом тесте).
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ (приём взят у press-action-probe):
//   node scripts/version-skew-probe.mjs                    прогон
//   node scripts/version-skew-probe.mjs --mutate-prefix    снимает проверку префикса protojson —
//                                                          цитата Б (анти-ложное срабатывание)
//                                                          обязана покраснеть
//   node scripts/version-skew-probe.mjs --mutate-classifier глушит `contradicts` в роутере
//                                                          ошибок, как если бы карточка передала
//                                                          undefined, — цитата А-2 обязана
//                                                          покраснеть
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui):
//   --mutate-prefix     → 2 провала, оба в цитате Б: опечатка в предикате email-сегмента и
//                         свободное предложение с той же фразой начинают давать баннер
//                         «расхождение версий». Ровно тот ложный баннер, ради которого
//                         распознавание построено на префиксе протокола. Откатано.
//   --mutate-classifier → 8 провалов: отказ снова красит заполненное поле, противоречий ноль,
//                         и баннер остаётся без строк. Откатано.
//
// РЕВЬЮ ШВА Ф4+Ф5+Ф7 (2026-08-22), мутация сверх авторских: `violationReason` по ПОДСТРОКЕ
// (`includes('required')`) вместо машинного префикса — 1 провал: «слово required в хвосте чужой
// причины баннера не даёт» (needs_needle_count с «a required value is missing upstream» дал бы
// ложный баннер расхождения версий). Откатано.
//
// Половина «живой DOM» требует playwright: он не в зависимостях проекта, ищется в кэше npx и
// МОЛЧА пропускается, если не найден. Функциональные цитаты от этого не зависят — они считаются
// в node и красят пробу всегда.

import { build as esbuild } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_PREFIX = process.argv.includes('--mutate-prefix');
const MUTATE_CLASSIFIER = process.argv.includes('--mutate-classifier');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CARD_FILE = resolve(REPO, 'src/components/managers/tech-card/components/index.tsx');

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── мутации ────────────────────────────────────────────────────────────────────────────────────
const PREFIX_FIX = `  if (!raw.includes(PROTOJSON_PREFIX)) return null;`;
const CLASSIFIER_FIX = `    if (contradicts?.(path, v)) {`;
const CLASSIFIER_BROKEN = `    if (false && contradicts?.(path, v)) {`;

const mutation = (find, replaceWith) => ({
  name: 'field-errors-mutation',
  setup(b) {
    b.onLoad({ filter: /utils\/field-errors\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(find)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(find, replaceWith), loader: 'ts' };
    });
  },
});

const plugins = [];
if (MUTATE_PREFIX) plugins.push(mutation(PREFIX_FIX, '  // МУТАЦИЯ: проверка префикса снята'));
if (MUTATE_CLASSIFIER) plugins.push(mutation(CLASSIFIER_FIX, CLASSIFIER_BROKEN));

const outfile = resolve(REPO, `scripts/.version-skew-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'version-skew-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
});
const { applyServerFieldErrors, contradictsScreen, transportRefusal, violationReason } =
  await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// ─── стенд ──────────────────────────────────────────────────────────────────────────────────────

// Ошибка в той форме, в какой её строит `api.ts`: сообщение из `json.message`, статус, details.
const wireError = (status, message, details) =>
  Object.assign(new Error(message), { status, details });

const badRequest = (violations) => [
  {
    '@type': 'type.googleapis.com/google.rpc.BadRequest',
    fieldViolations: violations,
  },
];

// Прогон роутера ошибок ровно так, как его зовёт карточка: те же опции, тот же предикат. Разница
// одна — `setError` здесь считает вызовы вместо того, чтобы красить контрол, и `getValue` читает
// подставленную карту вместо `form.getValues`.
function route(error, values) {
  const painted = [];
  const setError = (path, err) => painted.push({ path, message: err.message });
  const res = applyServerFieldErrors(error, setError, {
    stripPrefixes: ['tech_card'],
    contradicts: contradictsScreen((p) => values[p]),
  });
  return { ...res, painted };
}

const STEAM = 'TECH_CARD_PRESS_ACTION_STEAM';

// ─── ЦИТАТА А: отказ транспорта даёт баннер расхождения версий ───────────────────────────────────
head('цитата А — отказ ТРАНСПОРТА распознан');

// А-1. Тело строгого маршалера, скопированное из прогона серверного теста.
const transportField = wireError(
  400,
  'proto: (line 1:145): unknown field "pressAction2"',
  [],
);
const transportEnum = wireError(
  400,
  'proto: (line 1:163): invalid value for enum field action: "TECH_CARD_PRESS_ACTION_OPEN"',
  [],
);
{
  const q1 = transportRefusal(transportField);
  ck(!!q1, 'незнакомое ПОЛЕ распознано как отказ транспорта');
  ck(
    (q1 ?? '').includes('pressAction2'),
    'цитата несёт имя виновника — без него баннер не о чем',
    q1 ?? '',
  );
  const q2 = transportRefusal(transportEnum);
  ck(!!q2, 'незнакомый ЧЛЕН словаря распознан как отказ транспорта');
  ck(
    (q2 ?? '').includes('TECH_CARD_PRESS_ACTION_OPEN'),
    'цитата несёт имя снятого члена',
    q2 ?? '',
  );
}

// А-2. Отказ, противоречащий экрану: `required` про ЗАПОЛНЕННОЕ поле.
{
  const err = wireError(
    400,
    'invalid argument',
    badRequest([
      { field: 'operations[0].press_action', description: 'required; say how the seam is pressed' },
    ]),
  );
  const r = route(err, { 'operations.0.pressAction': STEAM });
  ck(r.painted.length === 0, 'поле НЕ покрашено', JSON.stringify(r.painted));
  ck(r.applied.length === 0, 'ни одного пришпиленного пути', r.applied.join(', '));
  ck(r.contradictions.length === 1, 'ровно одно противоречие', String(r.contradictions.length));
  ck(
    r.contradictions[0]?.path === 'operations.0.pressAction',
    'противоречие названо путём формы',
    r.contradictions[0]?.path ?? '—',
  );
  ck(r.unmapped.length === 0, 'ничего не ушло в «непришпиленное»', String(r.unmapped.length));
}

// А-3. Вторая перехватываемая причина — `unknown_value`.
{
  const err = wireError(
    400,
    'invalid argument',
    badRequest([
      {
        field: 'operations[0].machine_type',
        description: 'unknown_value; pick a machine this backend knows',
      },
    ]),
  );
  const r = route(err, { 'operations.0.machineType': 'TECH_CARD_MACHINE_TYPE_OVERLOCK' });
  ck(r.contradictions.length === 1, '`unknown_value` про заполненное — тоже противоречие');
  ck(r.painted.length === 0, 'и тоже не красит поле', JSON.stringify(r.painted));
}

// ─── ЦИТАТА Б: похожий текст бизнес-правила баннера НЕ даёт ──────────────────────────────────────
head('цитата Б — АНТИ-ЛОЖНОЕ СРАБАТЫВАНИЕ: «unknown field» без префикса протокола');

// Предикат сегмента email-рассылки: тот же code 3, та же фраза, те же пустые details — и это
// обычная опечатка в имени поля сегмента, а не расхождение версий.
{
  const segmentTypo = wireError(
    400,
    'invalid segment predicate: segment: unknown field: "emaill"',
    [],
  );
  ck(
    transportRefusal(segmentTypo) === null,
    'опечатка в предикате сегмента НЕ считается отказом транспорта',
    String(transportRefusal(segmentTypo)),
  );
  // Второй родственник: фраза есть, префикса нет, details пусты — свободный текст любого
  // будущего правила.
  const plainSentence = wireError(400, 'unknown field in the request body', []);
  ck(
    transportRefusal(plainSentence) === null,
    'свободное предложение с той же фразой — не отказ транспорта',
  );
  // Префикс есть, фразы нет: разбор упал по другой причине (битый JSON) — это не «расхождение
  // версий», и баннер про версии здесь соврал бы о причине.
  const otherProtoError = wireError(400, 'proto: (line 1:5): unexpected token', []);
  ck(
    transportRefusal(otherProtoError) === null,
    'префикс без фразы про незнакомое — не расхождение версий',
  );
  // Поимённые нарушения в теле означают, что тело РАЗОБРАЛОСЬ и ругается бизнес-правило.
  const withViolations = wireError(
    400,
    'proto: (line 1:145): unknown field "x"',
    badRequest([{ field: 'operations[0].press_action', description: 'not_applicable; clear it' }]),
  );
  ck(
    transportRefusal(withViolations) === null,
    'непустой BadRequest выигрывает у похожего сообщения',
  );
  // И статус: 409 с тем же телом — конфликт версий карточки, у него своя модалка.
  ck(
    transportRefusal(wireError(409, 'proto: (line 1:1): unknown field "x"', [])) === null,
    'не-400 отказом транспорта не считается',
  );
}

// ─── ЦИТАТА В: отказ на поле по-прежнему ложится на поле ─────────────────────────────────────────
head('цитата В — законный отказ остаётся у контрола');

{
  const err = wireError(
    400,
    'invalid argument',
    badRequest([
      {
        field: 'operations[0].press_action',
        description: 'not_applicable (used by press_open); clear it or change the step',
      },
    ]),
  );
  const r = route(err, { 'operations.0.pressAction': STEAM });
  ck(r.painted.length === 1, '`not_applicable` про заполненное КРАСИТ поле', String(r.painted.length));
  ck(r.contradictions.length === 0, 'и противоречием не считается');
}
{
  const err = wireError(
    400,
    'invalid argument',
    badRequest([
      { field: 'operations[0].press_action', description: 'required; say how the seam is pressed' },
    ]),
  );
  // Поле ПУСТО — сервер прав, экран с ним согласен.
  const r = route(err, { 'operations.0.pressAction': 'TECH_CARD_PRESS_ACTION_UNKNOWN' });
  ck(r.painted.length === 1, '`required` про ПУСТОЕ поле красит поле', String(r.painted.length));
  ck(r.contradictions.length === 0, 'и противоречием не считается');
}
{
  // Причина — МАШИННЫЙ КОД в префиксе описания, а не подстрока: «required» в человеческом хвосте
  // чужого отказа не должно превращать его в расхождение версий.
  const err = wireError(
    400,
    'invalid argument',
    badRequest([
      {
        field: 'operations[0].needle_gauge_mm',
        description: 'needs_needle_count; a required value is missing upstream',
      },
    ]),
  );
  const r = route(err, { 'operations.0.needleGaugeMm': '6.4' });
  ck(
    r.painted.length === 1 && r.contradictions.length === 0,
    'слово «required» в хвосте чужой причины баннера не даёт',
    `покрашено ${r.painted.length}, противоречий ${r.contradictions.length}`,
  );
}
{
  // Разбор причины сам по себе — форма зафиксирована `apierr.fieldViolation`.
  ck(violationReason('required; say how') === 'required', 'причина = префикс до `;`');
  ck(
    violationReason('not_applicable (used by press_open); clear it') === 'not_applicable',
    'причина = префикс до `(`',
  );
  ck(violationReason('required') === 'required', 'причина без хвоста');
  ck(
    violationReason('the card is released and frozen') === 'the card is released and frozen',
    'свободный текст причиной не притворяется',
  );
}

// ─── ЦИТАТА Г: карточка действительно так и зовёт классификатор ──────────────────────────────────
head('цитата Г — разметка карточки: классификатор и баннеры на месте');

{
  const src = readFileSync(CARD_FILE, 'utf8');
  // Проба гоняет НАСТОЯЩИЕ функции, но зовёт их сама. Эти четыре строки — единственное
  // доказательство, что их зовёт и карточка: без них зелёная проба означала бы «функции работают
  // и никем не используются».
  ck(src.includes('transportRefusal(error)'), 'catch распознаёт отказ транспорта');
  ck(src.includes('contradicts: contradictsScreen('), 'catch передаёт классификатор в роутер');
  ck(src.includes('<VersionSkewBanner'), 'баннер расхождения версий отрисован');
  ck(src.includes('setVersionSkew({'), 'баннер получает собранный список');
}

// ─── ЖИВОЙ DOM: баннер смонтирован и называет виновника ──────────────────────────────────────────
head('живой DOM — баннер расхождения версий');

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

const pwEntry = resolvePlaywright();
const mod = pwEntry ? await import(pwEntry) : null;
const chromium = mod?.chromium ?? mod?.default?.chromium;
if (!chromium) {
  console.log('  ..  playwright не найден — половина «живой DOM» пропущена (это не отказ)');
} else {
  const bundleFile = resolve(tmpdir(), `save-banners-${process.pid}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'save-banners-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile: bundleFile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
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
  const bundle = readFileSync(bundleFile, 'utf8');
  rmSync(bundleFile, { force: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });

  // Баннер собирается из ТОГО ЖЕ результата, что вернул роутер выше, — не из выписанной руками
  // строки: между «классификатор посчитал» и «человек увидел» и живёт весь класс дефекта.
  const err = wireError(
    400,
    'invalid argument',
    badRequest([
      { field: 'operations[0].press_action', description: 'required; say how the seam is pressed' },
    ]),
  );
  const routed = route(err, { 'operations.0.pressAction': STEAM });
  const skew = {
    quote: transportRefusal(transportField) ?? undefined,
    fields: routed.contradictions.map((c) => ({
      path: c.path,
      description: c.violation.description,
    })),
  };
  await page.evaluate((s) => window.__banners.skew(s), skew);
  await page.waitForSelector('[data-version-skew]', { timeout: 15000 });

  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const textOf = async (sel) =>
    (await has(sel)) ? ((await page.locator(sel).first().textContent()) ?? '').trim() : '';

  ck(pageErrors.length === 0, 'баннер смонтировался без исключений', pageErrors[0] ?? '');
  ck(await has('[data-version-skew]'), 'баннер расхождения версий нарисован');
  ck(
    await has('[data-skew-field="operations.0.pressAction"]'),
    'строка называет поле — тем же путём, каким его адресует роутер ошибок',
  );
  ck(
    (await textOf('[data-skew-field="operations.0.pressAction"]')).includes('required'),
    'строка несёт описание с провода',
    await textOf('[data-skew-field="operations.0.pressAction"]'),
  );
  ck(
    (await textOf('[data-skew-quote]')).includes('pressAction2'),
    'цитата сервера на экране целиком, с именем виновника',
    await textOf('[data-skew-quote]'),
  );
  const whole = await textOf('[data-version-skew]');
  ck(whole.includes('different versions'), 'баннер называет причину: разные версии');
  ck(whole.includes('NOT saved'), 'баннер говорит, что карточка НЕ сохранена');
  ck(whole.includes('nothing was lost'), 'баннер говорит, что ничего не потеряно');

  await browser.close();
}

console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : 'ПРОВАЛОВ: ' + bad}${
    MUTATE_PREFIX ? '  (прогон с мутацией префикса)' : ''
  }${MUTATE_CLASSIFIER ? '  (прогон с мутацией классификатора)' : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
