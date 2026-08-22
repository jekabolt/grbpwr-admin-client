#!/usr/bin/env node
// СОХРАНЕНИЕ ПРОШЛО — ВЕРНУЛОСЬ ЛИ ВСЁ, ЧТО УШЛО.
//
// Ф2 сделала admin-гейтвей громким, но громкость живёт только там, где стоит новый бинарь. Два
// окна остаются: прод до ручного деплоя владельца и откат DO на предыдущий бинарь (readyz=200
// врёт). В обоих сохранение отвечает «ок», а часть фактов шага не доезжает — операции пишутся
// полной заменой, и непринятое поле становится NULL. Аудит присутствия — единственная сеть под
// обоими окнами.
//
// ЧТО ПРОВЕРЯЕТСЯ И ЧЕМ ЭТО ДЕРЖИТСЯ:
//   А. СЪЕДЕННОЕ ПОЛЕ ОБНАРУЖЕНО И НАЗВАНО. Старый бэкенд не выдумывается: поле вырезается из
//      ТЕЛА ПРОВОДА, и «прочитанное» строит настоящий `mapTechCardToForm` — то же, что делает
//      `DiscardUnknown` на бинаре, который поля не знает;
//   Б. НИЧЕГО НЕ СЪЕДЕНО — МОЛЧАНИЕ. Полный круг через настоящие мапперы не даёт ни одного
//      расхождения;
//   В. КАНОНИЗАЦИЯ НЕ ЛОЖНОСРАБАТЫВАЕТ: fusible_patch→patch, '4.0'→'4', NONE↔'none' — сравнение
//      идёт по ПРИСУТСТВИЮ, а не по значению. Эта половина обязательна: первая же ложная тревога
//      научила бы человека не читать баннер;
//   Г. СПИСОК ПОЛЕЙ — ИЗ САМОЙ ZOD-СХЕМЫ, а не выписан руками (общий источник с пробой круга Ф4);
//   Д. разметка баннера в живом DOM: потерянное поле названо путём, и сказано, что значения
//      всё ещё в форме;
//   Е. ЗАКОННЫЙ СЕРВЕРНЫЙ ДЕТАШ — МОЛЧАНИЕ (ревью шва Ф4+Ф5+Ф7): ключи профилей, имя узла у
//      поглощающего шага и ссылка на удалённую выноску снимаются сервером нарочно — аудит не
//      объявляет канонизацию расхождением версий, иначе баннер кричал бы на каждом сохранении.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ:
//   node scripts/presence-audit-probe.mjs                  прогон
//   node scripts/presence-audit-probe.mjs --mutate-values   сверка ЗНАЧЕНИЙ вместо присутствий —
//                                                           цитата В обязана покраснеть
//   node scripts/presence-audit-probe.mjs --mutate-blind    сверка перестаёт копить потери —
//                                                           цитата А обязана покраснеть
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui):
//   --mutate-values → 5 провалов: канонизированные пары (fusible_patch→patch, '4.0'→'4',
//                     NONE→none) объявляются потерей, и вдобавок краснеет честный круг — список
//                     ссылок не равен сам себе по `===`. Ложная тревога на каждом сохранении.
//                     Откатано.
//   --mutate-blind  → 7 провалов: аудит перестаёт называть съеденное поле, баннеру нечего
//                     показать. Откатано.
//
// РЕВЬЮ ШВА Ф4+Ф5+Ф7 (2026-08-22), мутации сверх авторских — все прогнаны и откатаны:
//   isPresent(0) → true (граница «ноль = не задано» стёрта)      → 2 провала в границе «заполнено»;
//   pressAction выброшен из operationPresenceFields (дрейф списка) → 6 провалов, в т.ч.
//     «каждое поле схемы под аудитом, кроме поимённо исключённых»;
//   снято исключение calloutNumber (проверка цитаты Е)            → 2 провала: пин исключений
//     и «деташ ключа, выноски и имени узла — молчание».
//
// Половина «живой DOM» требует playwright: он не в зависимостях, ищется в кэше npx и МОЛЧА
// пропускается. Функциональные цитаты считаются в node и красят пробу всегда.

import { build as esbuild } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_VALUES = process.argv.includes('--mutate-values');
const MUTATE_BLIND = process.argv.includes('--mutate-blind');

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
const PRESENCE_FIX = `      if (after && isPresent(after[field])) continue;`;
const PRESENCE_BY_VALUE = `      if (after && after[field] === before[field]) continue;`;
const PUSH_FIX = `      losses.push({ step: i, field, path: \`operations.\${i}.\${field}\` });`;
const PUSH_BLIND = `      void { step: i, field };`;

const mutation = (find, replaceWith) => ({
  name: 'presence-mutation',
  setup(b) {
    b.onLoad({ filter: /operations-presence\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(find)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(find, replaceWith), loader: 'ts' };
    });
  },
});

const plugins = [];
if (MUTATE_VALUES) plugins.push(mutation(PRESENCE_FIX, PRESENCE_BY_VALUE));
if (MUTATE_BLIND) plugins.push(mutation(PUSH_FIX, PUSH_BLIND));

const outfile = resolve(REPO, `scripts/.presence-audit-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'presence-audit-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
});
const {
  auditOperationPresence,
  hasPresenceLoss,
  isPresent,
  operationFieldNames,
  operationPresenceFields,
  PRESENCE_NOT_AUDITED,
  toWire,
  readBack,
} = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// Шаг ВТО с фактами четырёх родов: словарные токены, децималы-строки, число, булево «сухим»,
// список ссылок. Каждый род ломается по-своему, и присутствие у каждого выглядит иначе.
const STEP = {
  operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
  zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
  pressAction: 'TECH_CARD_PRESS_ACTION_STEAM',
  pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  pressTemperatureC: 160,
  pressDwellSec: 12,
  pressSteam: false,
  pressCloth: 'TECH_CARD_PRESS_CLOTH_SILICONE_PAPER',
  smv: '1.8',
  seamAllowanceMm: '10',
  topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_IN_DITCH',
  topstitchWidthMm: '4',
  threadCount: 3,
  reinforcement: 'TECH_CARD_REINFORCEMENT_PATCH',
  note: 'a note',
  inputKeys: ['piece-1'],
};

const SECOND_STEP = {
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
  machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
  threadCount: 4,
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const paths = (audit) => audit.losses.map((l) => l.path);

// ─── ЦИТАТА А: съеденное поле обнаружено и названо ───────────────────────────────────────────────
head('цитата А — старый бэкенд съел поле: аудит его называет');

{
  // Провод строится настоящим маппером записи; «старый бэкенд» вырезает из него ОДНО поле, и
  // прочитанное собирает настоящий маппер чтения. Никакого рукописного «как бы ответа сервера».
  const wire = toWire([clone(STEP)]);
  const eaten = clone(wire);
  delete eaten.operations[0].press.action;
  const server = readBack(eaten);

  const audit = auditOperationPresence([STEP], server);
  ck(hasPresenceLoss(audit), 'потеря обнаружена');
  ck(
    paths(audit).join(',') === 'operations.0.pressAction',
    'потеряно ровно одно поле, и это оно',
    paths(audit).join(', '),
  );
  ck(audit.losses[0]?.step === 0, 'потеря отнесена к своему шагу', String(audit.losses[0]?.step));
  ck(audit.sentSteps === 1 && audit.readSteps === 1, 'число шагов сошлось');
}

{
  // Съеден децимал — другой род значения, другой путь в мапперах.
  const wire = toWire([clone(STEP)]);
  const eaten = clone(wire);
  delete eaten.operations[0].topstitch.widthMm;
  const audit = auditOperationPresence([STEP], readBack(eaten));
  ck(
    paths(audit).join(',') === 'operations.0.topstitchWidthMm',
    'съеденный децимал назван поимённо',
    paths(audit).join(', '),
  );
}

{
  // Съеден целый шаг: расхождение числа шагов И поимённый список того, что в нём было.
  const audit = auditOperationPresence([STEP, SECOND_STEP], [clone(STEP)]);
  ck(audit.sentSteps === 2 && audit.readSteps === 1, 'расхождение числа шагов видно');
  ck(hasPresenceLoss(audit), 'аудит не молчит');
  const lost = paths(audit);
  ck(
    lost.includes('operations.1.machineType') && lost.includes('operations.1.threadCount'),
    'факты пропавшего шага названы поимённо',
    lost.join(', '),
  );
  ck(
    lost.every((p) => p.startsWith('operations.1.')),
    'уцелевший шаг в потери не попал',
    lost.join(', '),
  );
}

// ─── ЦИТАТА Б: ничего не съедено — молчание ──────────────────────────────────────────────────────
head('цитата Б — целый круг: ни одного расхождения');

{
  const server = readBack(toWire([clone(STEP)]));
  const audit = auditOperationPresence([STEP], server);
  ck(!hasPresenceLoss(audit), 'аудит молчит на честном круге', paths(audit).join(', '));
}
{
  // Пустой шаг: ни одного заполненного факта — сравнивать нечего, тревоги нет.
  const empty = { operationType: 'TECH_CARD_OPERATION_TYPE_UNKNOWN', zone: '' };
  const audit = auditOperationPresence([empty], readBack(toWire([clone(empty)])));
  ck(!hasPresenceLoss(audit), 'пустой шаг тревоги не поднимает', paths(audit).join(', '));
}
{
  // Сервер ДОБАВИЛ значение (номер шага, назначенный сервером, — самый частый случай): аудит
  // спрашивает «не потерялось ли», а не «совпадает ли», и молчит.
  const audit = auditOperationPresence(
    [{ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS' }],
    [{ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', operationNumber: 10, smv: '2' }],
  );
  ck(!hasPresenceLoss(audit), 'дописанное сервером расхождением не считается');
}

// ─── ЦИТАТА В: канонизация сервера НЕ даёт ложной тревоги ────────────────────────────────────────
head('цитата В — АНТИ-ЛОЖНОЕ СРАБАТЫВАНИЕ: канонизированные пары молчат');

{
  const sent = {
    operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
    zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
    // Сервер канонизирует член словаря…
    reinforcement: 'TECH_CARD_REINFORCEMENT_FUSIBLE_PATCH',
    // …и формат децимала…
    topstitchWidthMm: '4.0',
    seamAllowanceMm: '10.00',
    // …и регистр служебного токена.
    pressCloth: 'NONE',
    threadCount: 3,
    pressSteam: false,
  };
  const server = {
    operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
    zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
    reinforcement: 'TECH_CARD_REINFORCEMENT_PATCH',
    topstitchWidthMm: '4',
    seamAllowanceMm: '10',
    pressCloth: 'none',
    threadCount: 3,
    pressSteam: false,
  };
  const audit = auditOperationPresence([sent], [server]);
  ck(
    !hasPresenceLoss(audit),
    'ни одна канонизированная пара не считается потерей',
    paths(audit).join(', '),
  );
}

// ─── ЦИТАТА Г: список полей — из самой схемы ─────────────────────────────────────────────────────
head('цитата Г — один источник списка полей с пробой круга Ф4');

{
  const all = operationFieldNames();
  const audited = operationPresenceFields();
  ck(all.length > 40, 'zod-схема шага перечисляет поля', `полей: ${all.length}`);
  ck(
    audited.every((n) => all.includes(n)),
    'аудит не знает полей, которых нет в схеме',
    audited.filter((n) => !all.includes(n)).join(', '),
  );
  const missing = all.filter((n) => !audited.includes(n) && !PRESENCE_NOT_AUDITED.has(n));
  ck(missing.length === 0, 'каждое поле схемы под аудитом, кроме поимённо исключённых', missing.join(', '));
  // Пин ПАРАМИ, а не счётом (дисциплина «хвосты дайджеста парами»): каждое исключение названо, и
  // новое не проскочит под старым числом. Кроме серверного номера шага здесь четыре ЗАКОННЫХ
  // молчаливых снятия сервера — деташ ключей парка, имя узла у поглощающего шага, деташ ссылки на
  // удалённую выноску (см. комментарии в самом PRESENCE_NOT_AUDITED и цитату Е ниже).
  ck(
    [...PRESENCE_NOT_AUDITED].sort().join(',') ===
      'calloutNumber,machineProfileKey,operationNumber,outputUnitName,pressProfileKey',
    'исключения перечислены поимённо, и лишних нет',
    [...PRESENCE_NOT_AUDITED].join(', '),
  );
  // Новое поле волны попадает под аудит САМО: список берётся из схемы, а не дописывается руками.
  ck(audited.length === all.length - PRESENCE_NOT_AUDITED.size, 'счёт сходится');
}

// ─── ЦИТАТА Е: законное серверное снятие — молчание, а не тревога ────────────────────────────────
// Ревью шва Ф4+Ф5+Ф7 (2026-08-22). Сервер снимает четыре поля шага МОЛЧА и ЗАКОННО: ключ профиля,
// не нашедшийся в парке (resolveProfileKey — «detach»), имя узла у поглощающего шага
// (normalizeUnitNames) и ссылку на удалённую выноску (S8 callout-sync). До исключений аудит
// объявлял каждый такой деташ «бэкенд старой версии» — и, поскольку сброс формы после записи
// мерджит отправленное, тревога повторялась бы на каждом сохранении той же карточки.
head('цитата Е — законный серверный деташ не считается потерей');

{
  const sent = {
    ...clone(STEP),
    machineProfileKey: '01JC0FF0000000000000000000',
    calloutNumber: 4,
    outputUnitKey: 'SHELL',
    outputUnitName: 'shell body',
  };
  // «Прочитанное» — та же строка после законных снятий: ключ отцеплен, выноска отцеплена, имя
  // узла унесено на первого производителя. Сам узел (outputUnitKey) на месте.
  const server = { ...clone(sent), machineProfileKey: '', calloutNumber: 0, outputUnitName: '' };
  const audit = auditOperationPresence([sent], [server]);
  ck(!hasPresenceLoss(audit), 'деташ ключа, выноски и имени узла — молчание', paths(audit).join(', '));
}
{
  // Граница исключения: потерю самого УЗЛА аудит по-прежнему называет — outputUnitKey не исключён.
  const sent = { ...clone(STEP), outputUnitKey: 'SHELL' };
  const server = { ...clone(sent), outputUnitKey: '' };
  const audit = auditOperationPresence([sent], [server]);
  ck(
    paths(audit).join(',') === 'operations.0.outputUnitKey',
    'пропавший выходной узел назван — исключение не шире своей причины',
    paths(audit).join(', '),
  );
}

// ─── граница «заполнено» ─────────────────────────────────────────────────────────────────────────
head('граница «заполнено» — тот же предикат, которым Ф5 меряет противоречие');

{
  ck(!isPresent(undefined) && !isPresent(null), 'ничего — не заполнено');
  ck(!isPresent('') && !isPresent('   '), 'пустая строка и пробелы — не заполнено');
  ck(
    !isPresent('TECH_CARD_PRESS_ACTION_UNKNOWN'),
    'нулевой член словаря — «никто не сказал», а не значение',
  );
  ck(!isPresent(0), 'ноль у числового поля шага — не задано');
  ck(isPresent('0'), 'строка «0» — настоящая величина децимала');
  ck(isPresent(false), '`false` — настоящий ответ «сухим», а не молчание');
  ck(!isPresent([]) && !isPresent(['']), 'пустой список и список пустых строк — не заполнено');
  ck(isPresent(['piece-1']), 'непустой список ссылок — заполнено');
  ck(!isPresent({}) && !isPresent({ mediaId: 0 }), 'объект без фактов — не заполнено');
  ck(isPresent({ mediaId: 7 }), 'объект с фактом — заполнено');
}

// ─── разметка карточки: аудит действительно врезан в сохранение ──────────────────────────────────
head('разметка карточки — аудит стоит в save-flow, а не лежит без дела');

{
  const src = readFileSync(CARD_FILE, 'utf8');
  ck(src.includes('auditOperationPresence('), 'сохранение зовёт аудит');
  ck(src.includes('hasPresenceLoss(settled.audit)'), 'результат проверяется после сброса формы');
  ck(src.includes('<PresenceLossBanner'), 'баннер потери отрисован');
}

// ─── ЖИВОЙ DOM ───────────────────────────────────────────────────────────────────────────────────
head('живой DOM — баннер потери называет поле');

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
  const bundleFile = resolve(tmpdir(), `save-banners-presence-${process.pid}.js`);
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

  // Баннер получает результат НАСТОЯЩЕЙ сверки — той же, что считалась в цитате А.
  const eaten = clone(toWire([clone(STEP)]));
  delete eaten.operations[0].press.action;
  const audit = auditOperationPresence([STEP], readBack(eaten));
  await page.evaluate((a) => window.__banners.presence(a), audit);
  await page.waitForSelector('[data-presence-loss]', { timeout: 15000 });

  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const textOf = async (sel) =>
    (await has(sel)) ? ((await page.locator(sel).first().textContent()) ?? '').trim() : '';

  ck(pageErrors.length === 0, 'баннер смонтировался без исключений', pageErrors[0] ?? '');
  ck(await has('[data-presence-loss]'), 'баннер потери нарисован');
  ck(
    await has('[data-lost-field="operations.0.pressAction"]'),
    'потерянное поле названо путём формы',
  );
  const row = await textOf('[data-lost-field="operations.0.pressAction"]');
  ck(row.includes('step 1'), 'строка называет шаг человеческим номером', row);
  const whole = await textOf('[data-presence-loss]');
  ck(whole.includes('did not come back'), 'баннер говорит, что поле не вернулось');
  ck(whole.includes('do not close the tab'), 'баннер говорит, что значения ещё в форме');
  ck(
    !(await has('[data-presence-steps]')),
    'при сошедшемся числе шагов строки про шаги нет — лишнего не утверждается',
  );

  // Второй случай: пропал целый шаг — строка про число шагов обязана появиться.
  const stepsAudit = auditOperationPresence([STEP, SECOND_STEP], [clone(STEP)]);
  await page.evaluate((a) => window.__banners.presence(a), stepsAudit);
  await page.waitForSelector('[data-presence-steps]', { timeout: 15000 });
  const steps = await textOf('[data-presence-steps]');
  ck(steps.includes('2') && steps.includes('1'), 'строка называет оба числа шагов', steps);

  await browser.close();
}

console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : 'ПРОВАЛОВ: ' + bad}${
    MUTATE_VALUES ? '  (прогон с мутацией «сверка значений»)' : ''
  }${MUTATE_BLIND ? '  (прогон с мутацией «сверка ослепла»)' : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
