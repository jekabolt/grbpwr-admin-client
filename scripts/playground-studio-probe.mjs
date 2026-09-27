#!/usr/bin/env node
// PLAYGROUND ЖИВЬЁМ: ОДНА ОПЛАТА НА ОДНО НАМЕРЕНИЕ, ФОКУС, ИСТОРИЯ ПО СПИСКАМ (G-01, G-01 r2).
//
// Монтируется НАСТОЯЩИЙ `PlaygroundStudio` с историей под ним (scripts/playground-studio-entry.tsx)
// в Chromium; сеть заглушена, `StartDesignRun` ОТЛОЖЕН — проба отвечает на него сама: успехом,
// потерянным ответом, отказом с кодом или никак. Заглушка ведёт «сервер»: одна логическая оплата на
// один `client_request_id` — ровно то, как сервер дедуплицирует (store/design wave2.go).
//
//   A · нажать GENERATE, уйти с шага рельсом, пока ответа нет, вернуться, открыть ту же плитку:
//       GENERATE всё ещё «starting…», |→ ждёт; ответ потерялся — повторное нажатие несёт ТОТ ЖЕ id,
//       оплата одна; успех, пришедший при размонтированной форме, записан в «Recently used»; после
//       подтверждённого успеха следующее нажатие — НОВЫЙ id;
//   B · нажать, ПЕРЕЗАГРУЗИТЬ вкладку, пока ответа нет, собрать тот же черновик — тот же id;
//   C · фокус: открытие плитки с клавиатуры — на заголовок формы; «what the model gets» закрыт
//       Escape — на свою кнопку; «reuse» — на свою дверь; «reuse», заполнивший последний слот
//       (дверь погасла), — на заголовок формы (r2 N8); |→ — на плитку, из которой пришли;
//   D · история: бюджет дочитывания, потраченный под Change a Color, не переходит к Create or edit;
//   E · итоги на сетке: вырез — «no background», перекрас — select, из ResultsDef своей плитки;
//   F · история: страница и открытая колода сбрасываются сменой списка (сетка → плитка) (r2 п.8);
//   G · отказы (r2 N3): 4xx освобождает ключ — следующее нажатие новый id; 5xx и потерянный ответ
//       ключ держат; отказ ПОВТОРА после потерянного ответа ключ держит (прогон мог быть заведён);
//   H · отпечаток канонический (r2 N2): тот же запрос с другим порядком ключей и пробелами по краям —
//       тот же id; другой порядок картинок — другой id;
//   I · оператор (r2 N4): B в той же вкладке не наследует ни ключ A, ни «starting…» A;
//   J · срок ответа (r2 N5): зависший запрос отпускает форму с «no answer» и тем же id на повтор;
//       поздний успех всё равно освобождает ключ.
//
// МУТАЦИИ В ПАМЯТИ (исходник не трогается), каждая роняет СВОЮ группу:
//   --mutate-ledger          ledgerSend всегда чеканит новый id                  → A, B
//   --mutate-no-storage      журнал не пишется в sessionStorage                  → B
//   --mutate-accepted        onAccepted снова per-call опция mutate               → A
//   --mutate-focus           фокус не следует за экраном                          → C
//   --mutate-wmg-focus       «what the model gets» закрывается без возврата фокуса → C
//   --mutate-reuse-focus     галерея «reuse» закрывается без возврата фокуса       → C
//   --mutate-focus-fallback  погасшая дверь — без запасного адресата              → C
//   --mutate-pending-local   «starting…» снова читается только из своей формы     → A
//   --mutate-scope           бюджет дочитывания не знает имени списка             → D
//   --mutate-results-cut     итоги не читают ResultsDef.cutout                    → E
//   --mutate-results-select  итоги не читают ResultsDef.selectable                → E
//   --mutate-scope-page      смена списка не сбрасывает страницу                  → F
//   --mutate-scope-deck      смена списка не складывает колоду                    → F
//   --mutate-refusal-keeps   4xx не освобождает ключ                              → G
//   --mutate-unsure-forgotten отказ повтора после тишины освобождает ключ         → G
//   --mutate-5xx-definitive  5xx считается окончательным отказом                  → G
//   --mutate-fingerprint     отпечаток — сырой JSON.stringify                     → H
//   --mutate-operator        журнал без оператора                                 → I
//   --mutate-operator-pending «starting…» без оператора                           → I
//   --mutate-no-deadline     срока ответа нет                                     → J
//   --mutate-late-lost       поздний успех теряется                               → J
//   --mutate-own-results     плитка 12 снова под итогами комнаты (C-10)            → K
//   --mutate-pool-caption    «Only the newest …» снова и у Swap Fabrics (C-12, m-8)  → L
//   --mutate-workflow-caption подпись окна плитки снова по колорвею 0 (G-02 m-1)   → L
//   --mutate-mask-focus      маска закрывается без возврата фокуса (G-02 m-4)     → M
//   --mutate-source-opens    выбор картинки в слоте плитки 10 не открывает маску  → M
//   --mutate-pin-room        под плиткой 10 приколоты все прогоны комнаты         → M
//   --mutate-retouch-door    рекол ретуши жив и без её картинки (Codex 5)         → M
//   --mutate-retouch-recall  рекол ретуши не открывает маску (Codex 5)            → M
//   --mutate-recall-gate     рекол не спрашивает ворота плитки (Codex 6)          → M
//   --mutate-mask-upload-each маска грузится на каждое нажатие (C-14)            → N
//   --mutate-mask-route-always редактор шлёт маску и старому серверу (C-14)      → N
//   --mutate-mask-draft-lost  нажатая краска не переживает закрытие (G-03 BLOCKER) → O
//   --mutate-mask-id-lost     маска краски не переживает закрытие (G-03 BLOCKER)   → O
//   --mutate-close-mid-upload закрытие во время загрузки маски не заперто (m-3)    → O
//   --mutate-upload-label     во время загрузки кнопка говорит «starting…» (m-4)   → O
//   --mutate-null-painter     холст не нарисовал маску — картинка не уходит в окно (M-1) → O
//   --mutate-canvas-cap       бюджета холста нет — 24 МП идут маской (M-1)         → O
//   --mutate-no-keyboard      у кисти нет клавиатуры (Codex MAJOR)                 → O
//   --mutate-exif-blind       повёрнутый файл не отказан (m-1)                     → O
//
//   O · (G-03 client fix) маска живьём: нажатие, потерянный ответ, ЗАКРЫТЬ и открыть снова —
//       краска и слова на месте, второе нажатие без новой загрузки и с ТЕМ ЖЕ ключом (и на пути
//       окна тоже), и после перезагрузки вкладки; принятый прогон краску забывает; во время
//       загрузки маски — «uploading the mask…», Escape и ✕ не закрывают; холст без маски (null) —
//       ничего не начато, строка «cannot draw», следующее нажатие — тело окна; 24 МП — окно сразу;
//       клавиатура: дверь Mask с клавиатуры, кисть стрелками и пробелом, Enter — прогон inpaint,
//       Escape поднимает кисть, затем закрывает; повёрнутый файл — отказ даром.
//
//   N · (C-14) маршрут маски живьём: кисть по настоящему холсту, GENERATE → ОДНА загрузка PNG
//       (verbatim, размер картинки 800×1000, белое там, где кисть, чёрное вокруг) → StartDesignRun
//       kind=inpaint {source, mask}, ask = слова; ответ потерян → второе нажатие: загрузок всё ещё
//       одна, тот же client_request_id (отпечаток повторился); строка «only the painted zone»;
//       старый сервер — тело фазы 2 без загрузки и прежняя строка; картинка без размера — окно и
//       «states no size» в строке цены.
//
//   L · (G-02 m-1) подпись окна: комнаты — на сетке и у плитки 10; своя (поле 31) — у плитки; нет —
//       у пула колорвеев и у старого сервера;
//   M · (G-02) Retouch a Zone: слот картинки на панели открывает маску (M-1), слова владельца и
//       строка цены (m-3); фокус после маски — на угол mask, и из просмотрщика (m-4); под плиткой
//       10 не приколоты чужие прогоны (Codex 8); рекол ретуши открывает маску на её картинке, а без
//       картинки погашен (Codex 5); рекол в плитку, которую сервер не открывает, — отказ (Codex 6).
//   K · (C-10) Image to 3D: под открытой плиткой — блок 3D-моделей карточки, а не итоги комнаты;
//       строки опций — только объявленные сервером; текстура off гасит материалы со словами;
//       Detailed — в шапке и в цене GENERATE; история называет строки «3D»; |→ — итоги комнаты.
//
// Нет Chromium — КОД 2 и слово «НЕ ВЫПОЛНЕНА»: пропуск — это не зелень. Сборка упала или якорь
// мутации/настройки не найден — тоже код 2. Playwright не в зависимостях репозитория (как у
// остальных браузерных проб здесь): node_modules, затем кэш npx; `npx playwright install chromium`.

import { build as esbuild } from 'esbuild';
import { crc32, deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

function dieNotRun(why) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
}

const KNOWN = new Set([
  '--mutate-ledger',
  '--mutate-no-storage',
  '--mutate-accepted',
  '--mutate-focus',
  '--mutate-wmg-focus',
  '--mutate-reuse-focus',
  '--mutate-focus-fallback',
  '--mutate-pending-local',
  '--mutate-scope',
  '--mutate-results-cut',
  '--mutate-results-select',
  '--mutate-scope-page',
  '--mutate-scope-deck',
  '--mutate-refusal-keeps',
  '--mutate-unsure-forgotten',
  '--mutate-5xx-definitive',
  '--mutate-fingerprint',
  '--mutate-operator',
  '--mutate-operator-pending',
  '--mutate-no-deadline',
  '--mutate-late-lost',
  '--mutate-own-results',
  '--mutate-pool-caption',
  '--mutate-workflow-caption',
  '--mutate-mask-focus',
  '--mutate-source-opens',
  '--mutate-pin-room',
  '--mutate-retouch-door',
  '--mutate-retouch-recall',
  '--mutate-recall-gate',
  '--mutate-mask-upload-each',
  '--mutate-mask-route-always',
  '--mutate-mask-draft-lost',
  '--mutate-mask-id-lost',
  '--mutate-close-mid-upload',
  '--mutate-upload-label',
  '--mutate-null-painter',
  '--mutate-canvas-cap',
  '--mutate-no-keyboard',
  '--mutate-exif-blind',
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.has(a));
if (stray) dieNotRun(`неизвестный флаг мутации ${stray}; известные: ${[...KNOWN].join(', ')}`);
const on = (f) => process.argv.includes(f);
const MUTATED = [...KNOWN].some(on);

// ─── правки бандла: настройка стенда и мутации, СКЛАДЫВАЮТСЯ в одном onLoad ─────────────────
// esbuild берёт первый onLoad, вернувший содержимое, поэтому две правки одного файла двумя
// плагинами не сложились бы: здесь один плагин применяет ВСЕ правки, чей фильтр подходит файлу.
// Якорь не найден — КОД 2: правка, которая не применилась, — это непроверенная проба.
const edits = [];
const patch = (name, filter, needle, replacement) =>
  edits.push({ name, filter, needle, replacement });
const editPlugin = {
  name: 'probe-edits',
  setup(b) {
    b.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
      const mine = edits.filter((e) => e.filter.test(args.path));
      if (!mine.length) return undefined;
      let src = await readFile(args.path, 'utf8');
      for (const e of mine) {
        if (!src.includes(e.needle))
          dieNotRun(`правка «${e.name}» не нашла свой якорь в ${args.path}`);
        src = src.replace(e.needle, e.replacement);
      }
      return { contents: src, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
};

// НАСТРОЙКА СТЕНДА (не мутация, всегда): срок ответа читается из `window.__pgDeadlineMs`, если он
// задан, — группа J ставит полсекунды, остальные идут с настоящим сроком.
patch(
  'deadline-knob',
  /render\/use-design-run\.ts$/,
  `        START_RUN_DEADLINE_MS,
        () => accepted(input),`,
  `        globalThis.__pgDeadlineMs ?? START_RUN_DEADLINE_MS,
        () => accepted(input),`,
);

if (on('--mutate-ledger'))
  patch(
    'ledger-always-mints',
    /render\/run-ledger\.ts$/,
    'const id = found ? found.id : newClientRequestId();',
    'const id = newClientRequestId();',
  );
if (on('--mutate-no-storage'))
  patch(
    'ledger-no-storage',
    /render\/run-ledger\.ts$/,
    'window.sessionStorage.setItem(RUN_LEDGER_STORAGE_KEY, JSON.stringify(book()));',
    'void book();',
  );
if (on('--mutate-accepted'))
  patch(
    'accepted-per-call',
    /render\/use-design-run\.ts$/,
    `      mutation.mutate({
        wire,
        techCardId,
        clientRequestId,
        scope,
        fingerprint,
        onAccepted: opts?.onAccepted,
      });`,
    `      mutation.mutate(
        { wire, techCardId, clientRequestId, scope, fingerprint },
        opts?.onAccepted ? { onSuccess: () => opts.onAccepted?.() } : undefined,
      );`,
  );
if (on('--mutate-focus'))
  patch(
    'focus-stays',
    /playground\/studio\.tsx$/,
    '    if (was === openKey) return;',
    '    if (was === openKey || true) return;',
  );
if (on('--mutate-wmg-focus'))
  patch(
    'wmg-no-return',
    /playground\/workflow-panel\.tsx$/,
    '        onCloseAutoFocus={inspectFocus.onCloseAutoFocus}',
    '',
  );
if (on('--mutate-reuse-focus'))
  patch(
    'reuse-no-return',
    /fields\/reuse\.tsx$/,
    "    focus.remember(door.current?.querySelector<HTMLElement>('button'));",
    '',
  );
if (on('--mutate-focus-fallback'))
  patch(
    'focus-no-fallback',
    /playground\/focus\.ts$/,
    'for (const target of [el, fallback()]) {',
    'for (const target of [el]) {',
  );
if (on('--mutate-pending-local'))
  patch(
    'pending-local',
    /render\/use-design-run\.ts$/,
    'isPending: mutation.isPending || (!!scope && scopedPending > 0),',
    'isPending: mutation.isPending,',
  );
if (on('--mutate-results-cut'))
  patch(
    'results-cut-blind',
    /playground\/results\.tsx$/,
    'const cut = !!own?.cutout;',
    'const cut = false;',
  );
if (on('--mutate-results-select'))
  patch(
    'results-select-blind',
    /playground\/results\.tsx$/,
    'const selectable = !!own?.selectable;',
    'const selectable = false;',
  );
if (on('--mutate-scope'))
  patch(
    'budget-blind-to-scope',
    /generation\/generation-history\.tsx$/,
    'const autofillSlot = `${techCardId}:${rep}:${scopeKey}:${current}`;',
    'const autofillSlot = `${techCardId}:${rep}:${current}`;',
  );
if (on('--mutate-scope-page'))
  patch(
    'scope-keeps-page',
    /generation\/generation-history\.tsx$/,
    `    shownScope.current = scopeKey;
    if (page !== 0) setPage(0);`,
    `    shownScope.current = scopeKey;`,
  );
if (on('--mutate-scope-deck'))
  patch(
    'scope-keeps-deck',
    /generation\/generation-history\.tsx$/,
    `    if (page !== 0) setPage(0);
    if (openDeck !== null) setOpenDeck(null);
  }

  /**
   * КАРТОЧКА`,
    `    if (page !== 0) setPage(0);
  }

  /**
   * КАРТОЧКА`,
  );
if (on('--mutate-refusal-keeps'))
  patch(
    'refusal-keeps-key',
    /render\/use-design-run\.ts$/,
    "isDefinitiveRefusal(error) ? 'refused' : 'unknown',",
    "'unknown',",
  );
if (on('--mutate-unsure-forgotten'))
  patch(
    'unsure-forgotten',
    /render\/run-ledger\.ts$/,
    "} else if (outcome === 'refused' && found.unsure) {",
    '} else if (false) {',
  );
if (on('--mutate-5xx-definitive'))
  patch(
    '5xx-definitive',
    /generation\/refusal\.ts$/,
    'return s !== null && s >= 400 && s < 500 && s !== 408 && s !== 499;',
    'return s !== null && s >= 400;',
  );
if (on('--mutate-fingerprint'))
  patch(
    'raw-fingerprint',
    /render\/run-ledger\.ts$/,
    'return JSON.stringify(canonical(wire));',
    'return JSON.stringify(wire);',
  );
if (on('--mutate-operator'))
  patch(
    'ledger-no-operator',
    /render\/run-ledger\.ts$/,
    '`${operatorKey()}|${techCardId}|${scope}`',
    '`op|${techCardId}|${scope}`',
  );
if (on('--mutate-operator-pending'))
  patch(
    'pending-no-operator',
    /render\/use-design-run\.ts$/,
    "return ['design', 'start-run', operatorKey(), techCardId, scope] as const;",
    "return ['design', 'start-run', techCardId, scope] as const;",
  );
if (on('--mutate-no-deadline'))
  patch(
    'no-deadline',
    /render\/use-design-run\.ts$/,
    `      over = true;
      reject(`,
    `      if (Date.now() > 0) return;
      reject(`,
  );
if (on('--mutate-late-lost'))
  patch(
    'late-lost',
    /render\/use-design-run\.ts$/,
    'if (over) late(answer);',
    'if (over) void answer;',
  );

if (on('--mutate-own-results'))
  patch(
    'room-results-for-3d',
    /playground\/studio\.tsx$/,
    'const OwnResults = flow?.results.view;',
    'const OwnResults = undefined;',
  );
if (on('--mutate-pool-caption'))
  patch(
    'pool-caption-back',
    /playground\/results\.tsx$/,
    'if (!def || COLOURWAY_POOL.has(def.key)) return null;',
    "if (!def || def.key === 'change_color') return null;",
  );

if (on('--mutate-workflow-caption'))
  patch(
    'workflow-caption-room',
    /playground\/results\.tsx$/,
    'return workflowOutputsHorizon(band, def.key);',
    'return outputsHorizon(band, 0);',
  );
if (on('--mutate-mask-focus'))
  patch(
    'mask-no-return',
    /playground\/results\.tsx$/,
    '          onCloseAutoFocus={maskFocus.onCloseAutoFocus}\n',
    '',
  );
if (on('--mutate-source-opens'))
  patch(
    'source-stays-shut',
    /mask\/retouch-source\.tsx$/,
    'flags: { ...d.flags, [RETOUCH_MASKING_KEY]: !disabled },',
    'flags: { ...d.flags, [RETOUCH_MASKING_KEY]: false },',
  );
if (on('--mutate-pin-room'))
  patch(
    'pin-the-room',
    /playground\/results\.tsx$/,
    'const pinMatch = def?.run?.results.match ?? inPlaygroundRoom;',
    'const pinMatch = match;',
  );
if (on('--mutate-retouch-door'))
  patch(
    'retouch-door-always',
    /design\/history-recall\.tsx$/,
    '? retouchSource > 0 &&',
    '? true || retouchSource > 0 &&',
  );
if (on('--mutate-retouch-recall'))
  patch(
    'retouch-recall-shut',
    /tiles\/retouch-zone\.tsx$/,
    'flags: { [RETOUCH_MASKING_KEY]: !!found },',
    'flags: { [RETOUCH_MASKING_KEY]: false },',
  );
if (on('--mutate-recall-gate'))
  patch(
    'recall-no-gate',
    /playground\/recall\.tsx$/,
    'if (!workflowOpenable(def, band)) {',
    'if (false) {',
  );

if (on('--mutate-mask-upload-each')) {
  // Neither memory: the uploader's own, nor the id kept with the pressed paint.
  patch('mask-upload-each', /mask\/mask-upload\.ts$/, 'if (held) return held;', '');
  patch(
    'mask-upload-each-store',
    /mask\/mask-upload\.ts$/,
    'const kept = store?.recall(mediaId, key);',
    'const kept = undefined;',
  );
}
if (on('--mutate-mask-route-always'))
  patch('mask-route-always', /mask\/mask-editor\.tsx$/, "if (route === 'mask') {", 'if (true) {');

// СТЕНД (не мутация, всегда): `window.__pgNoCanvas` — холст «не рисует» маску (null), как Safari
// сверх своего предела площади (G-03 M-1).
patch(
  'no-canvas-knob',
  /mask\/mask-upload\.ts$/,
  'const blob = await maskPng(strokes, width, height);',
  'const blob = globalThis.__pgNoCanvas ? null : await maskPng(strokes, width, height);',
);
const MASK_EDITOR = /mask\/mask-editor\.tsx$/;
if (on('--mutate-mask-draft-lost'))
  patch(
    'mask-draft-lost',
    /mask\/mask-draft\.ts$/,
    'return book()[at(techCardId, mediaId)] ?? null;',
    'return null;',
  );
if (on('--mutate-mask-id-lost')) {
  patch(
    'mask-id-lost-memo',
    /mask\/mask-upload\.ts$/,
    'let up = uploaders.get(at);',
    'let up: MaskUploader | undefined = undefined;',
  );
  patch(
    'mask-id-lost-store',
    /mask\/mask-upload\.ts$/,
    'recall: (mediaId, key) => keptMaskId(techCardId, mediaId, key),',
    'recall: () => undefined,',
  );
}
if (on('--mutate-close-mid-upload')) {
  patch('close-mid-upload-root', MASK_EDITOR, 'if (!next && uploading) return;', '');
  patch(
    'close-mid-upload-esc',
    MASK_EDITOR,
    `            if (uploading) {
              e.preventDefault();
              return;
            }`,
    '',
  );
}
if (on('--mutate-upload-label'))
  patch(
    'upload-label',
    MASK_EDITOR,
    "pendingLabel={uploading ? 'uploading the mask…' : undefined}",
    '',
  );
if (on('--mutate-null-painter'))
  patch('null-painter', MASK_EDITOR, 'if (alive.current) setCanDraw(false);', '');
if (on('--mutate-canvas-cap'))
  patch('canvas-cap', /mask\/geometry\.ts$/, '  width * height <= MASK_MAX_AREA;', '  true;');
if (on('--mutate-no-keyboard')) patch('no-keyboard', MASK_EDITOR, 'onKeyDown={onKey}', '');
if (on('--mutate-exif-blind'))
  patch(
    'exif-blind',
    /tiles\/retouch-zone\.tsx$/,
    'if (pictureTurned(input.media, input.shownAspect)) return { reason: RETOUCH_TURNED };',
    '',
  );

// ─── заглушенная сеть ──────────────────────────────────────────────────────────────────────────
// По суффиксу пути: `api/api` достижим и алиасом, и относительным импортом. Маркер ищется в
// собранном бандле — без него настоящий клиент мог бы остаться внутри и пойти в сеть.
const STUB_MARKER = 'PROBE_STUB_G01_PLAYGROUND_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const g = globalThis;
g.__pgStub = '${STUB_MARKER}';
g.__pgCalls = g.__pgCalls || [];
g.__pgLogical = g.__pgLogical || new Set();
g.__pgOut = g.__pgOut || [];
const call = (method) => (req) => {
  g.__pgCalls.push({ method, req: JSON.parse(JSON.stringify(req ?? {})) });
  if (method === 'StartDesignRun') {
    // «Сервер» бронирует прогон на КЛЮЧ: второй запрос с тем же ключом — тот же прогон.
    g.__pgLogical.add(req.clientRequestId);
    return new Promise((res, rej) => g.__pgOut.push({ req, res, rej }));
  }
  // The band the editor reads through its own query (useDesignBand): the one group N mounts, and
  // an empty answer everywhere else, as before.
  if (method === 'GetDesignBand') return Promise.resolve(g.__pgBand || {});
  if (method === 'UploadContentImage') {
    g.__pgUploads = (g.__pgUploads || 0) + 1;
    const answer = { media: { id: 6000 + g.__pgUploads } };
    // G-03 m-3: the probe may hold the upload and release it when it wants.
    if (g.__pgUploadHold)
      return new Promise((res) => (g.__pgUploadOut = g.__pgUploadOut || []).push(() => res(answer)));
    return Promise.resolve(answer);
  }
  if (method === 'ListDesignRuns') {
    const page = (g.__pgPages || {})[req.pageToken] || { runs: [], nextPageToken: '' };
    return Promise.resolve(page);
  }
  return Promise.resolve({});
};
const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? call(k) : undefined) });
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({
      path: 'probe-stub-api',
      namespace: 'probe-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

// ─── playwright ────────────────────────────────────────────────────────────────────────────────
function playwrightCandidates() {
  const out = [];
  try {
    out.push(createRequire(import.meta.url).resolve('playwright'));
  } catch {
    /* дальше — кэш npx */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (existsSync(root)) {
      const found = execFileSync(
        'find',
        [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter(Boolean);
      for (const dir of found) out.push(`${dir}/index.js`);
    }
  } catch {
    /* нет кэша */
  }
  return out;
}
let browser = null;
for (const entry of playwrightCandidates()) {
  try {
    const pw = await import(pathToFileURL(entry).href);
    const chromium = pw.chromium ?? pw.default?.chromium;
    if (!chromium) continue;
    browser = await chromium.launch();
    break;
  } catch {
    /* у этой копии нет своего браузера — следующая */
  }
}
if (!browser)
  dieNotRun(
    'playwright с chromium не найден — живого стенда нет, доказывать нечем; поставить: npx playwright install chromium',
  );

// ─── сборка ────────────────────────────────────────────────────────────────────────────────────
const outfile = resolve(tmpdir(), `playground-studio-${process.pid}.js`);
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'playground-studio-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' },
    alias: { '@': resolve(REPO, 'src') },
    plugins: [stub, editPlugin],
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
  });
} catch (e) {
  await browser.close();
  dieNotRun(`сборка упала — ${e.message}`);
}
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER)) dieNotRun(`в бандле нет «${STUB_MARKER}» — сеть НЕ заглушена`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`в бандле остался «${REAL_API_MARKER}» — настоящий api-слой`);

// ─── счёт ──────────────────────────────────────────────────────────────────────────────────────
let bad = 0;
let total = 0;
const failedIn = new Set();
let group = '';
const ck = (ok, what, d = '') => {
  total++;
  if (!ok) {
    bad++;
    failedIn.add(group);
  }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${!ok && d ? `  — ${d}` : ''}`);
};
const head = (id, s) => {
  group = id;
  console.log(`\n${id} · ${s}`);
};

// ─── стенд ─────────────────────────────────────────────────────────────────────────────────────
const page = await browser.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://probe.local/tech-cards/') || url === 'http://probe.local/start') {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${bundle.replace(/<\/script/g, '<\\/script')}</script>`,
    });
  }
  // Картинки, шрифты и всё прочее — никуда: стенд не ходит в сеть.
  return route.abort();
});

const CARD = 'http://probe.local/tech-cards/7?tab=studio&step=playground';
const settle = (ms = 80) => page.waitForTimeout(ms);
const wf = () => new URL(page.url()).searchParams.get('wf');

const RECOLOR_RUN = {
  id: 501,
  kind: 'recolor',
  status: 'done',
  ask: 'the denim jacket',
  params: {
    extraInputMediaIds: [101],
    colour: { code: '19-4052 TCX', hex: '#0F4C81', fabrics: [], words: '' },
  },
  inputs: {
    refs: [
      {
        mediaId: 101,
        deleted: false,
        media: { id: 101, media: { thumbnail: { mediaUrl: 'http://probe.local/m101.jpg' } } },
      },
    ],
  },
};
const EMPTY_BAND = {
  freeformPresets: ['free', 'cutout'],
  runs: [],
  nextPageToken: '',
  totalRuns: 0,
};

async function mount(band, url = CARD) {
  await page.goto('http://probe.local/start');
  await page.goto(url);
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate((b) => window.__pg.mount(b), band);
  await page.waitForSelector('[data-workflow-tile]');
}
const tileButton = (key) =>
  page.locator(`[data-workflow-tile="${key}"]`).locator('xpath=ancestor::button[1]');
const generate = () =>
  page.locator('[data-playground-open] button', { hasText: /^(GENERATE|starting…)$/ });
const backArrow = () => page.locator('[data-workflow-back]');
/** Back to the grid when a workflow is open (|→); a no-op on the grid. */
const leaveTo = async () => {
  if ((await backArrow().count()) === 0) return;
  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile]');
  await settle();
};
const calls = () =>
  page.evaluate(() =>
    window.__pgCalls.filter((c) => c.method === 'StartDesignRun').map((c) => c.req.clientRequestId),
  );
const logical = () => page.evaluate(() => window.__pgLogical.size);
/** Answer the OLDEST outstanding start: 'ok', 'lost' (no status) or a status code number. */
const answer = (how) =>
  page.evaluate((how) => {
    const out = window.__pgOut.shift();
    if (!out) return false;
    if (how === 'ok') out.res({ run: { id: 900 + window.__pgLogical.size, status: 'pending' } });
    else if (typeof how === 'number')
      out.rej(Object.assign(new Error(`refused with ${how}`), { status: how }));
    else out.rej(new Error('network: the answer was lost'));
    return true;
  }, how);
const lastId = async () => (await calls()).at(-1);
const railRoundTrip = async () => {
  await page.click('#rail-flat');
  await page.waitForSelector('[data-playground-open], [data-workflow-tile]', { state: 'detached' });
  await page.click('#rail-playground');
  await page.waitForSelector('[data-workflow-tile]');
  await settle();
};
const recallInto = async () => {
  await page.evaluate((run) => window.__pg.recall(run), RECOLOR_RUN);
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
};
const recentText = () =>
  page.evaluate(() => localStorage.getItem('plm.playground.recent.v1:change_color.garment') ?? '');

head('A', 'уход с шага, пока прогон стартует, и возврат: тот же ключ, одна оплата');
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  ck((await generate().textContent()) === 'GENERATE', 'черновик собран, GENERATE жив');
  await generate().click();
  await settle();
  const [first] = await calls();
  ck(!!first, 'первое нажатие ушло', String(first));
  ck((await generate().textContent()) === 'starting…', 'GENERATE — «starting…»');
  ck(await backArrow().isDisabled(), '|→ ждёт ответа');

  // Рельс уводит с шага PLAYGROUND (форма размонтирована) и возвращает на сетку.
  await railRoundTrip();
  ck(
    wf() === null && (await page.locator('[data-playground-open]').count()) === 0,
    'рельс туда и обратно — сетка, форма размонтирована',
    page.url(),
  );
  // Черновик жил в экране шага и ушёл с ним — человек собирает ТО ЖЕ намерение заново (рекол).
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  ck(
    (await generate().textContent()) === 'starting…' && (await generate().isDisabled()),
    'то же намерение снова собрано: прогон всё ещё «starting…», второе нажатие невозможно',
    await generate().textContent(),
  );
  ck(await backArrow().isDisabled(), '|→ по-прежнему ждёт');

  await answer('lost');
  await settle();
  ck((await generate().textContent()) === 'GENERATE', 'ответ потерян — GENERATE снова жив');
  await generate().click();
  await settle();
  const after = await calls();
  ck(after.length === 2, 'второе нажатие ушло', JSON.stringify(after));
  ck(after[1] === first, 'второе нажатие несёт ТОТ ЖЕ client_request_id', `${first} → ${after[1]}`);
  ck((await logical()) === 1, 'сервер держит ОДИН логический прогон', String(await logical()));

  // Успех приходит, когда формы уже нет: «Recently used» пишется всё равно.
  await railRoundTrip();
  ck((await page.locator('[data-playground-open]').count()) === 0, 'снова сетка, пока ответа нет');
  await answer('ok');
  await settle(150);
  ck(
    (await recentText()).includes('the denim jacket'),
    'успех при размонтированной форме записал слова в «Recently used»',
    await recentText(),
  );

  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  const third = await calls();
  ck(
    third.length === 3 && third[2] !== first,
    'после подтверждённого успеха — НОВЫЙ ключ (новый прогон)',
    JSON.stringify(third),
  );
  await answer('ok');
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('B', 'перезагрузка вкладки, пока ответа нет: тот же черновик — тот же ключ');
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    window.__pgCalls.length = 0;
  });
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  const [before] = await calls();
  ck(!!before, 'нажатие ушло');
  await page.reload();
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate((b) => window.__pg.mount(b), EMPTY_BAND);
  await page.waitForSelector('[data-playground-open], [data-workflow-tile]');
  if ((await page.locator('[data-playground-open="change_color"]').count()) === 0) {
    await tileButton('change_color').click();
    await page.waitForSelector('[data-playground-open="change_color"]');
  }
  await recallInto();
  ck(
    (await generate().textContent()) === 'GENERATE',
    'после перезагрузки GENERATE жив (ответа ждать уже некому)',
  );
  await generate().click();
  await settle();
  const [again] = await calls();
  ck(again === before, 'после перезагрузки — тот же client_request_id', `${before} → ${again}`);
  await answer('ok');
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('C', 'фокус: открытие, «what the model gets», «reuse», |→');
try {
  // Одна картинка на карточке — чтобы у «reuse» был живой источник «this card».
  const cardPic = (id, ordinal) => ({
    id,
    ordinal,
    media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/p${id}.jpg` } } },
  });
  await mount({
    ...EMPTY_BAND,
    runs: [
      {
        id: 70,
        kind: 'render',
        status: 'done',
        pictures: [cardPic(700, 1), cardPic(701, 2), cardPic(702, 3)],
      },
    ],
  });
  await tileButton('change_color').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();
  ck(
    await page.evaluate(
      () => document.activeElement?.hasAttribute('data-workflow-heading') === true,
    ),
    'открытие с клавиатуры — фокус на заголовке формы',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  const wmg = page.locator('[data-playground-open] button', { hasText: 'what the model gets' });
  await wmg.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  await settle();
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.tagName === 'BUTTON' &&
        (document.activeElement.textContent ?? '').includes('what the model gets'),
    ),
    'Escape — фокус снова на «what the model gets ▸»',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  const reuse = page.locator('[data-fold-section="change_color.photos"] button', {
    hasText: /^Reuse/,
  });
  await reuse.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-reuse-source="card"]:not([disabled])');
  await page.locator('[data-reuse-source="card"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-card-picker]');
  await settle();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-card-picker]', { state: 'detached' });
  await settle();
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.tagName === 'BUTTON' &&
        /^Reuse/.test((document.activeElement.textContent ?? '').trim()),
    ),
    'галерея «reuse» закрыта — фокус снова на двери «reuse»',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  // r2 N8: «reuse» забирает последние свободные места — его дверь гаснет (или уходит вовсе) в том
  // же кадре, в котором закрывается галерея. Фокус не падает на <body>: он уходит на заголовок.
  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="create_edit"]');
  await tileButton('create_edit').click();
  await page.waitForSelector('[data-playground-open="create_edit"]');
  await settle();
  const refsReuse = page.locator('[data-fold-section="create_edit.refs"] button', {
    hasText: /^Reuse/,
  });
  await refsReuse.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-reuse-source="card"]:not([disabled])');
  await page.locator('[data-reuse-source="card"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-card-picker]');
  for (const id of [700, 701, 702]) {
    await page.locator(`[data-card-picker] [data-card-picture="${id}"] button`).first().click();
  }
  await page.locator('[data-card-picker-foot] button', { hasText: 'done' }).click();
  await page.waitForSelector('[data-card-picker]', { state: 'detached' });
  await settle();
  ck(
    (await refsReuse.count()) === 0 || (await refsReuse.isDisabled()),
    '«reuse» заполнил три места — его двери больше нет (места кончились)',
  );
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.hasAttribute('data-workflow-heading') === true &&
        !!document.activeElement.closest('[data-playground-open="create_edit"]'),
    ),
    'двери нет — фокус на заголовке формы, а не на <body>',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="change_color"]');
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle();

  await backArrow().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-workflow-tile="change_color"]');
  await settle();
  ck(
    await page.evaluate(
      () =>
        document.activeElement?.querySelector('[data-workflow-tile="change_color"]') !== null &&
        document.activeElement?.tagName === 'BUTTON',
    ),
    '|→ — фокус на плитке, из которой пришли',
    await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('D', 'история: бюджет дочитывания принадлежит списку, а не шагу');
try {
  const run = (id, kind, extra = {}) => ({
    id,
    kind,
    status: 'done',
    ask: '',
    pictures: [],
    ...extra,
  });
  const band = {
    freeformPresets: ['free', 'cutout'],
    // Первая страница: один перекрас и два выреза — сетке (комната) хватает трёх строк, она не
    // дочитывает; Change a Color видит одну и тратит свой бюджет.
    runs: [run(60, 'recolor'), run(59, 'cutout'), run(58, 'cutout')],
    nextPageToken: 't1',
    totalRuns: 18,
    archivedRuns: 0,
  };
  await page.goto('http://probe.local/start');
  await page.goto(`${CARD}&wf=change_color`);
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate(() => {
    window.__pgCalls.length = 0;
    const r = (id, kind) => ({ id, kind, status: 'done', ask: '', pictures: [] });
    window.__pgPages = {
      // Страница t1 — двенадцать рендеров: ни одной строки ни одной плитке.
      t1: { runs: Array.from({ length: 12 }, (_, i) => r(57 - i, 'render')), nextPageToken: 't2' },
      // Страница t2 — три свободных прогона Create or edit.
      t2: { runs: [r(44, 'freeform'), r(43, 'freeform'), r(42, 'freeform')], nextPageToken: '' },
    };
  });
  await page.evaluate((b) => window.__pg.mount(b), band);
  await page.waitForSelector('[data-playground-open="change_color"]');
  await page.locator('[aria-controls="design-history-runs"]').click();
  await settle(250);
  const lists = () =>
    page.evaluate(() =>
      window.__pgCalls.filter((c) => c.method === 'ListDesignRuns').map((c) => c.req.pageToken),
    );
  ck(
    JSON.stringify(await lists()) === '["t1"]',
    'Change a Color потратил бюджет на одну страницу',
    JSON.stringify(await lists()),
  );
  ck(
    (await page.locator('#design-history [data-run="60"]').count()) === 1,
    '…и показывает свой перекрас',
  );

  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="create_edit"]');
  await settle(150);
  ck(
    JSON.stringify(await lists()) === '["t1"]',
    'сетке хватает своих строк — она ничего не просит',
    JSON.stringify(await lists()),
  );
  await tileButton('create_edit').click();
  await page.waitForSelector('[data-playground-open="create_edit"]');
  await settle(300);
  ck(
    JSON.stringify(await lists()) === '["t1","t2"]',
    'Create or edit просит СВОЁ продолжение (бюджет списка новый)',
    JSON.stringify(await lists()),
  );
  ck(
    (await page.locator('#design-history [data-run="44"]').count()) === 1,
    '…и показывает свои прогоны со страницы t2',
    `${await page.locator('#design-history [data-run]').count()} строк`,
  );
  ck(
    (await page.locator('#design-history-runs').count()) === 1,
    'свёртка истории осталась открытой при смене плитки',
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('E', 'итоги: вырез — «no background», перекрас — select; из ResultsDef своей плитки');
try {
  const pic = (id) => ({
    id,
    ordinal: 1,
    selected: false,
    media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/${id}.png` } } },
  });
  await mount({
    ...EMPTY_BAND,
    runs: [
      { id: 81, kind: 'cutout', status: 'done', pictures: [pic(801)] },
      { id: 80, kind: 'recolor', status: 'done', pictures: [pic(802)] },
    ],
  });
  const cutTile = page.locator('[data-pg-output="801"]');
  const recolourTile = page.locator('[data-pg-output="802"]');
  ck(
    (await cutTile.count()) === 1 && (await recolourTile.count()) === 1,
    'на сетке обе картинки комнаты',
  );
  ck(
    (await cutTile.textContent()).includes('no background'),
    'под вырезом — «no background»',
    await cutTile.textContent(),
  );
  ck(
    !(await recolourTile.textContent()).includes('no background'),
    'под перекрасом этого слова нет',
  );
  ck(
    (await recolourTile.locator('[aria-label*="as chosen"]').count()) === 1,
    'у перекраса есть select',
  );
  ck((await cutTile.locator('[aria-label*="as chosen"]').count()) === 0, 'у выреза select нет');
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('F', 'история: смена списка сбрасывает страницу и складывает колоду (r2 п.8)');
try {
  const pic = (id, extra = {}) => ({
    id,
    ordinal: 1,
    media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/${id}.png` } } },
    ...extra,
  });
  const recolor = (id, pictures = [pic(id * 10)]) => ({
    id,
    kind: 'recolor',
    status: 'done',
    ask: '',
    pictures,
  });
  const band = {
    freeformPresets: ['free', 'cutout'],
    // Четыре перекраса: две страницы по три и у комнаты, и у Change a Color. У первого — лист с
    // вырезанным из него куском: колода, которую можно раскрыть.
    runs: [
      recolor(64, [pic(640), pic(641, { derivation: 'crop', derivedFrom: 640 })]),
      recolor(63),
      recolor(62),
      recolor(61),
    ],
    nextPageToken: '',
    totalRuns: 4,
    archivedRuns: 0,
  };
  await mount(band);
  await page.locator('[aria-controls="design-history-runs"]').click();
  await settle(150);
  const caption = () =>
    page
      .locator('#design-history')
      .getByText(/^page \d+ of \d+$/)
      .first()
      .textContent();
  await page.locator('#design-history [aria-label="earlier runs"]').click();
  await settle();
  ck((await caption()) === 'page 2 of 2', 'сетка: история на второй странице', await caption());
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle(150);
  ck(
    (await caption()) === 'page 1 of 2' &&
      (await page.locator('#design-history [data-run="64"]').count()) === 1,
    'открыта плитка — её список с первой страницы',
    await caption(),
  );

  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile="change_color"]');
  await settle(150);
  const deck = page.locator('#design-history [data-deck="640"]');
  await deck.click();
  await settle();
  ck((await deck.getAttribute('aria-expanded')) === 'true', 'сетка: колода листа 640 раскрыта');
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await settle(150);
  ck(
    (await deck.getAttribute('aria-expanded')) === 'false',
    'открыта плитка — колода её списка сложена',
    String(await deck.getAttribute('aria-expanded')),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// Запрос, который проба подаёт хуку напрямую (`RawStart` в entry), — только поля провода.
const rawReq = (ask, items, extra = {}) => ({
  kind: 'freeform',
  ask,
  params: {
    views: [],
    freeform: {
      preset: 'free',
      items: items.map((mediaId) => ({ mediaId, regions: [], texts: [], role: '' })),
    },
    ...extra,
  },
});
const raw = async (input) => {
  await page.evaluate((i) => window.__pg.raw(i), input);
  await settle();
  return lastId();
};
const jwt = (sub) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp: 4102444800 })}.sig`;
};
const signIn = (sub) => page.evaluate((t) => localStorage.setItem('authToken', t), jwt(sub));

head('G', 'отказы: 4xx освобождает ключ, 5xx и тишина держат (r2 N3)');
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  const g1 = await raw(rawReq('refused outright', [11]));
  await answer(400);
  await settle();
  const g1b = await raw(rawReq('refused outright', [11]));
  ck(
    !!g1 && g1b !== g1,
    '400 — отказ окончательный: следующее нажатие — НОВЫЙ id',
    `${g1} → ${g1b}`,
  );
  await answer('ok');

  const g2 = await raw(rawReq('lost then refused', [12]));
  await answer('lost');
  await settle();
  const g2b = await raw(rawReq('lost then refused', [12]));
  ck(g2b === g2, 'после потерянного ответа — тот же id', `${g2} → ${g2b}`);
  await answer(400);
  await settle();
  const g2c = await raw(rawReq('lost then refused', [12]));
  ck(
    g2c === g2,
    'отказ ПОВТОРА после тишины ключ держит: первый прогон мог быть заведён',
    `${g2} → ${g2c}`,
  );
  await answer('ok');

  const g3 = await raw(rawReq('server error', [13]));
  await answer(503);
  await settle();
  const g3b = await raw(rawReq('server error', [13]));
  ck(g3b === g3, '503 — не окончательный: тот же id', `${g3} → ${g3b}`);
  await answer('ok');
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('H', 'отпечаток канонический: порядок ключей и пробелы не меняют id (r2 N2)');
try {
  const h1 = await raw(rawReq('make it blue', [21, 22]));
  await answer('lost');
  await settle();
  // То же намерение, собранное иначе: ключи в другом порядке, лишнее undefined, пробелы по краям.
  const same = {
    params: {
      colour: undefined,
      freeform: {
        items: [21, 22].map((mediaId) => ({ role: '', texts: [], regions: [], mediaId })),
        preset: 'free',
      },
      views: [],
    },
    ask: '  make it blue ',
    kind: 'freeform',
  };
  const h2 = await raw(same);
  ck(h2 === h1, 'тот же запрос в другом порядке ключей — тот же id', `${h1} → ${h2}`);
  await answer('lost');
  await settle();
  const h3 = await raw(rawReq('make it blue', [22, 21]));
  ck(h3 !== h1, 'другой порядок картинок — другой запрос, другой id', `${h1} → ${h3}`);
  await answer('ok');
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('I', 'оператор: B в той же вкладке не наследует ключ и «starting…» A (r2 N4)');
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await signIn('alice');
  const a1 = await raw(rawReq('same draft', [31]));
  await answer('lost');
  await settle();
  await signIn('bob');
  const b1 = await raw(rawReq('same draft', [31]));
  ck(!!a1 && b1 !== a1, 'B, тот же черновик — СВОЙ id', `${a1} → ${b1}`);
  await answer('lost');
  await settle();
  await signIn('alice');
  const a2 = await raw(rawReq('same draft', [31]));
  ck(a2 === a1, 'A вернулся — его ключ на месте', `${a1} → ${a2}`);
  await answer('ok');
  await settle();

  // Форма: A нажал, ответа нет; B входит в ту же вкладку и открывает ту же плитку.
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  ck((await generate().textContent()) === 'starting…', 'A: «starting…»');
  await signIn('bob');
  await railRoundTrip();
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  ck(
    (await generate().textContent()) === 'GENERATE' &&
      !(await generate().isDisabled()) &&
      !(await backArrow().isDisabled()),
    'B: GENERATE жив, |→ свободен — чужое «starting…» не его',
    await generate().textContent(),
  );
  await answer('ok');
  await settle();
  await page.evaluate(() => localStorage.removeItem('authToken'));
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head(
  'J',
  'срок ответа: зависший старт отпускает форму, id тот же; поздний успех — засчитан (r2 N5)',
);
try {
  await mount(EMPTY_BAND);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.__pgDeadlineMs = 500;
  });
  await tileButton('change_color').click();
  await page.waitForSelector('[data-playground-open="change_color"]');
  await recallInto();
  await generate().click();
  await settle();
  const j1 = await lastId();
  ck((await generate().textContent()) === 'starting…', 'нажато — «starting…»');
  await page.waitForTimeout(800);
  ck(
    (await generate().textContent()) === 'GENERATE' && !(await backArrow().isDisabled()),
    'срок вышел — GENERATE и |→ свободны',
    await generate().textContent(),
  );
  const note = page.locator('[data-probe="refusal"]');
  ck(
    (await note.count()) === 1 &&
      (await note.getAttribute('data-refusal-answered')) === null &&
      (await note.getAttribute('data-request-id')) === j1,
    'стоит «no answer» с тем же id запроса',
    `${await note.count()} · ${await note.getAttribute('data-request-id')}`,
  );
  const noteText = (await note.textContent()) ?? '';
  ck(
    /^no answer from the server\./.test(noteText.trim()) &&
      noteText.includes('To check, press GENERATE again without changing anything'),
    'слова: «no answer», и проверка — тем же GENERATE, без новой кнопки',
    noteText.slice(0, 120),
  );
  await generate().click();
  await settle();
  const j2 = await lastId();
  ck(j2 === j1, 'проверка повтором — ТОТ ЖЕ id', `${j1} → ${j2}`);
  // Первый ответ опоздал и потерян; повтор отвечен сразу — прогон один.
  await answer('lost');
  await answer('ok');
  await settle();
  ck((await logical()) === 1, 'сервер держит ОДИН логический прогон', String(await logical()));

  // Поздний успех: срок вышел, повторного нажатия не было — а ответ всё-таки пришёл.
  await page.locator('[data-playground-open] textarea').first().fill('a late answer');
  await settle();
  await generate().click();
  await settle();
  const j3 = await lastId();
  await page.waitForTimeout(800);
  ck((await generate().textContent()) === 'GENERATE', 'второй старт тоже вышел за срок');
  await answer('ok');
  await settle(150);
  await generate().click();
  await settle();
  const j4 = await lastId();
  ck(j4 !== j3, 'поздний успех освободил ключ — следующее нажатие новый прогон', `${j3} → ${j4}`);
  await answer('ok');
  await page.evaluate(() => {
    window.__pgDeadlineMs = undefined;
  });
  await settle();
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('K', 'Image to 3D: блок 3D-моделей, опции по слову сервера, Detailed в шапке и цене (C-10)');
try {
  await mount({
    ...EMPTY_BAND,
    playgroundWorkflows: ['create_edit', 'image_to_3d'],
    threedOptions: ['texture', 'pbr', 'quality'],
  });
  await tileButton('image_to_3d').click();
  await page.waitForSelector('[data-playground-open="image_to_3d"]');
  await settle();
  ck(
    (await page.locator('#design-threed-outputs').count()) === 1 &&
      (await page.locator('#design-playground-results').count()) === 0,
    'под плиткой — «3D models of this card», итогов комнаты нет',
  );
  const open3 = page.locator('[data-playground-open="image_to_3d"]');
  ck(
    (await open3.locator('[data-toggle-row="texture"]').count()) === 1 &&
      (await open3.locator('[data-toggle-row="pbr"]').count()) === 1 &&
      (await open3.locator('[data-option-row="quality"]').count()) === 1 &&
      (await open3.locator('[data-option-row="follow"]').count()) === 0,
    'строки: Texture, Realistic materials, Quality; Follow нет',
  );
  const pbrSwitch = open3.locator('[data-toggle-row="pbr"] [role="switch"]');
  ck(!(await pbrSwitch.isDisabled()), 'материалы включаемы, пока текстура есть');
  ck(
    (await pbrSwitch.getAttribute('aria-checked')) === 'true' &&
      (await open3
        .locator('[data-toggle-row="texture"] [role="switch"]')
        .getAttribute('aria-checked')) === 'true',
    'по умолчанию Texture и Realistic materials включены (14.png, C-12)',
  );
  await open3.locator('[data-toggle-row="texture"] [role="switch"]').click();
  await settle();
  ck(
    (await pbrSwitch.isDisabled()) &&
      (await open3.locator('[data-toggle-row="pbr"]').textContent()).includes('turn it on first'),
    'текстура off — материалы погашены и сказано почему',
  );
  const fold = open3.locator('[data-fold-section="image_to_3d.options"] [data-fold-value]');
  ck(
    (await fold.textContent()) === 'standard',
    'шапка 3D options — «standard»',
    await fold.textContent(),
  );
  await open3.locator('[data-option-row="quality"]').getByText('Detailed', { exact: true }).click();
  await settle();
  ck(
    (await fold.textContent()) === 'detailed',
    'Detailed — «detailed» в шапке',
    await fold.textContent(),
  );
  // G-02 Codex 3: the server reserves max(estimate, the configured route) — no figure is shown.
  ck(
    !(await open3.textContent()).includes('$') &&
      (await open3.textContent()).includes('1 model · priced by the server when the run starts'),
    'у GENERATE ни одной суммы: «1 model · priced by the server when the run starts»',
  );
  ck(
    (await generate().isDisabled()) &&
      (await open3.textContent()).includes('add the picture to build the model from'),
    'без картинки GENERATE заперт, причина названа',
  );
  ck(
    (await page.locator('[data-rep-filter="threed"]').count()) === 1,
    'история под плиткой говорит о 3D-прогонах',
  );
  await backArrow().click();
  await page.waitForSelector('[data-workflow-tile]');
  await settle();
  ck(
    (await page.locator('#design-playground-results').count()) === 1 &&
      (await page.locator('#design-threed-outputs').count()) === 0,
    '|→ — на сетке снова итоги комнаты',
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head(
  'L',
  'итоги: подпись окна — комнаты на сетке и у плитки 10, своя у плитки, нет у пула колорвеев (G-02 m-1)',
);
try {
  const out = (id, runId, kind, stamp) => ({
    picture: {
      id,
      runId,
      colorwayId: 0,
      ordinal: 1,
      media: { id, media: { thumbnail: { mediaUrl: `http://probe.local/${id}.png` } } },
    },
    runId,
    runKind: kind,
    runWorkflow: stamp,
  });
  const OUTS = [
    out(821, 71, 'freeform', 'create_edit'),
    out(822, 72, 'recolor', 'swap_fabrics'),
    out(823, 73, 'recolor', 'change_color'),
    out(824, 74, 'freeform', 'virtual_try_on'),
  ];
  const WFS = [
    'change_color',
    'swap_fabrics',
    'create_edit',
    'virtual_try_on',
    'retouch_zone',
    'image_to_3d',
  ];
  // Four pictures of colourway 0 arrived; the server holds 500 of them, 200 of Create or edit's,
  // and every Try-On it has (1 of 1) — each tile has its own window of 60 (band 31).
  await mount({
    ...EMPTY_BAND,
    playgroundWorkflows: WFS,
    threedOptions: [],
    outputs: OUTS,
    outputsTotalByColorway: { 0: 500 },
    outputsTotalByWorkflow: {
      create_edit: 200,
      virtual_try_on: 1,
      change_color: 10,
      swap_fabrics: 50,
      image_to_3d: 9,
    },
  });
  // The rendered words only: the stand's bundle is an inline <script> in the same body.
  const caption = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-pg-horizon]');
      return el ? `${el.getAttribute('data-pg-horizon')}|${el.textContent}` : '';
    });
  ck(
    (await caption()) ===
      'room|Only the newest 4 of this card’s 500 pictures without a colourway are sent here; older ones stay in the history below.',
    'сетка: подпись окна комнаты (колорвей 0)',
    await caption(),
  );
  const openTile = async (key) => {
    await tileButton(key).click();
    await page.waitForSelector(`[data-playground-open="${key}"]`);
    await settle();
  };
  const leave = async () => {
    await backArrow().click();
    await page.waitForSelector('[data-workflow-tile]');
    await settle();
  };
  await openTile('create_edit');
  ck(
    (await caption()) ===
      'workflow|Only the newest 1 of this workflow’s 200 pictures are sent here; older ones stay in the history below.',
    'Create or edit: своя подпись — 1 из 200 этой плитки, не 4 из 500 комнаты',
    await caption(),
  );
  await leave();
  await openTile('virtual_try_on');
  ck(
    (await caption()) === '',
    'Virtual Try-On: всё пришло (1 из 1) — подписи нет',
    await caption(),
  );
  await leave();
  await openTile('retouch_zone');
  ck(
    (await caption()).startsWith('room|Only the newest 4 of this card’s 500'),
    'Retouch a Zone (картинки комнаты): подпись окна комнаты',
    await caption(),
  );
  await leave();
  await openTile('swap_fabrics');
  ck(
    (await page.locator('[data-pg-output="822"]').count()) === 1 && (await caption()) === '',
    'Swap Fabrics: заглушка со штампом на месте, подписи окна нет (пул колорвеев)',
    await caption(),
  );
  await leave();
  await openTile('change_color');
  ck(
    (await page.locator('[data-pg-output="823"]').count()) === 1 &&
      (await page.locator('[data-pg-output="822"]').count()) === 0 &&
      (await caption()) === '',
    'Change a Color: только своя заглушка, подписи окна нет',
    await caption(),
  );
  await leave();
  await openTile('image_to_3d');
  ck(
    (await caption()) === '' && (await page.locator('[data-outputs-horizon]').count()) === 0,
    'Image to 3D: ни подписи окна, ни «newest N of M»',
  );

  // A server older than band 31: no per-tile count — no caption under a tile (never the room's).
  await mount({
    ...EMPTY_BAND,
    playgroundWorkflows: WFS,
    threedOptions: [],
    outputs: OUTS,
    outputsTotalByColorway: { 0: 500 },
  });
  ck((await caption()).startsWith('room|'), 'старый сервер: на сетке подпись комнаты есть');
  await openTile('create_edit');
  ck(
    (await caption()) === '',
    'старый сервер (поля 31 нет): под Create or edit подписи нет',
    await caption(),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head(
  'M',
  'Retouch a Zone: слот картинки на панели, фокус после маски, рекол ретуши, ворота рекола (G-02)',
);
try {
  const media = (id) => ({
    id,
    media: {
      thumbnail: { mediaUrl: `http://probe.local/${id}.png` },
      fullSize: { mediaUrl: `http://probe.local/${id}-full.png`, width: 800, height: 1000 },
    },
  });
  const pic = (id) => ({ id, ordinal: 1, media: media(id) });
  const RETOUCH = (id, refs) => ({
    id,
    kind: 'freeform',
    status: 'done',
    ask: '',
    params: {
      freeform: {
        preset: 'retouch',
        items: [{ mediaId: 800, regions: [], texts: ['remove the stain'], role: '' }],
      },
    },
    inputs: { refs },
    pictures: [pic(id * 10)],
  });
  const WFS = ['retouch_zone', 'create_edit', 'change_color'];
  const band = {
    ...EMPTY_BAND,
    playgroundWorkflows: WFS,
    runs: [
      RETOUCH(90, [{ mediaId: 800, deleted: false, media: media(800) }]),
      RETOUCH(91, []),
      {
        id: 80,
        kind: 'freeform',
        status: 'done',
        ask: 'a coat',
        params: { freeform: { preset: 'free', items: [] } },
        pictures: [pic(800)],
      },
      { id: 70, kind: 'render', status: 'done', pictures: [pic(700), pic(701)] },
    ],
  };
  await mount(band);
  const active = () => page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120) ?? '');
  const escapeEditor = async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-mask-editor]', { state: 'detached' });
    await settle(150);
  };

  // m-4 · the result tile's `mask` corner → the editor → Escape: focus back on that corner.
  const corner = page.locator('[data-pg-output="800"] button[aria-label^="mask picture"]');
  await corner.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-mask-editor="800"]');
  await escapeEditor();
  ck(
    await page.evaluate(
      () =>
        (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('mask picture') &&
        !!document.activeElement?.closest('[data-pg-output="800"]'),
    ),
    'угол mask → маска → Escape: фокус снова на углу mask',
    await active(),
  );
  // m-4 · the viewer's Mask (the viewer closes first, its button is gone): focus on the corner.
  await page.locator('[data-pg-output="800"] button[aria-label^="zoom"]').click();
  const viewerMask = page.locator('[role="dialog"] button', { hasText: /^mask$/ });
  await viewerMask.waitFor();
  await viewerMask.click();
  await page.waitForSelector('[data-mask-editor="800"]');
  await escapeEditor();
  ck(
    await page.evaluate(
      () =>
        (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('mask picture') &&
        !!document.activeElement?.closest('[data-pg-output="800"]'),
    ),
    'зум → Mask в просмотрщике → Escape: фокус на углу mask этой картинки, не на <body>',
    await active(),
  );

  // M-1 · tile 10's own picture slot: + and Reuse, and the pick opens the same editor.
  await tileButton('retouch_zone').click();
  await page.waitForSelector('[data-playground-open="retouch_zone"]');
  await settle();
  const open10 = page.locator('[data-playground-open="retouch_zone"]');
  const text10 = (await open10.textContent()) ?? '';
  ck(
    text10.includes('Open or upload any picture') &&
      text10.includes('press Mask, paint the zone to change and describe what should be there') &&
      text10.includes(
        'The retouch is generated as a new picture beside the original — nothing is overwritten.',
      ) &&
      text10.includes('The rectangle around your zone may change.') &&
      !/credit/i.test(text10),
    'панель плитки 10: слова владельца (12.png), честная строка, без «credit»',
    text10.slice(0, 200),
  );
  ck(
    text10.includes('priced by the server when the run starts') && !text10.includes('$'),
    'панель плитки 10: строка цены — «priced by the server», без выдуманной суммы (m-3)',
  );
  const slot = open10.locator('[data-retouch-source]');
  ck(
    (await slot.count()) === 1 &&
      (await slot.locator('button', { hasText: /^Reuse$/ }).count()) === 1 &&
      (await open10.locator('button', { hasText: /^(GENERATE|starting…)$/ }).count()) === 0,
    'панель плитки 10: ОДИН слот (+ и Reuse), GENERATE на панели нет',
  );
  await slot.locator('button', { hasText: /^Reuse$/ }).click();
  await page.waitForSelector('[data-reuse-source="card"]:not([disabled])');
  await page.locator('[data-reuse-source="card"]').click();
  await page.waitForSelector('[data-card-picker]');
  await page.locator('[data-card-picker] [data-card-picture="700"] button').first().click();
  await page.locator('[data-card-picker-foot] button', { hasText: 'done' }).click();
  const opened = await page
    .waitForSelector('[data-mask-editor="700"]', { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  ck(opened, 'Reuse → картинка карточки → маска открыта на ней (тот же редактор)');
  if (opened) {
    ck(
      (await page
        .locator('[data-mask-editor] button', { hasText: /^(GENERATE|starting…)$/ })
        .count()) === 1,
      'в редакторе — ровно один GENERATE',
    );
    await escapeEditor();
  }
  ck(
    (await open10.locator('[data-retouch-source="700"]').count()) === 1,
    'после маски картинка осталась в слоте',
  );
  ck(
    await page.evaluate(
      () =>
        (document.activeElement?.getAttribute('aria-label') ?? '').startsWith(
          'mask this picture',
        ) && !!document.activeElement?.closest('[data-retouch-source]'),
    ),
    'редактор закрыт — фокус на углу mask слота (открыватель — галерея — ушёл)',
    await active(),
  );
  await open10.locator('[data-retouch-source] button[aria-label^="mask this picture"]').click();
  ck(
    await page
      .waitForSelector('[data-mask-editor="700"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false),
    'угол mask слота открывает маску снова',
  );
  await escapeEditor();

  // Codex 8 · under tile 10 nothing of another workflow is pinned (a live Create or edit run).
  await leaveTo();
  await mount({
    ...band,
    runs: [
      {
        id: 95,
        kind: 'freeform',
        status: 'pending',
        ask: 'x',
        params: { freeform: { preset: 'free', items: [] } },
        pictures: [],
      },
      ...band.runs,
    ],
  });
  await tileButton('retouch_zone').click();
  await page.waitForSelector('[data-playground-open="retouch_zone"]');
  await settle();
  ck(
    (await page.locator('[data-pg-pinned="95"]').count()) === 0,
    'под плиткой 10 живой прогон Create or edit не приколот',
  );
  await leaveTo();

  // Codex 5 · a retouch's recall: the door is live only with its picture; it opens the mask on it.
  await mount(band);
  await tileButton('retouch_zone').click();
  await page.waitForSelector('[data-playground-open="retouch_zone"]');
  await page.locator('[aria-controls="design-history-runs"]').click();
  await settle(250);
  const door = (id) =>
    page.locator(
      `#design-history [data-run="${id}"] button[aria-label="take the input of run ${id} back"]`,
    );
  ck(
    (await door(91).count()) === 1 &&
      (await door(91).isDisabled()) &&
      ((await page.locator('#design-history [data-run="91"]').textContent()) ?? '').includes(
        'its picture is gone',
      ),
    'ретушь без своей картинки в снимке: рекол погашен — «its picture is gone»',
  );
  await door(90).click();
  const confirm = page.locator('[role="dialog"] button', { hasText: 'open the mask' });
  await confirm.waitFor();
  await confirm.click();
  const recalled = await page
    .waitForSelector('[data-mask-editor="800"]', { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  ck(recalled, 'рекол ретуши: плитка 10, маска открыта на её картинке');
  if (recalled) {
    ck(
      (await page.locator('[data-mask-editor] textarea').inputValue()) === 'remove the stain',
      'рекол ретуши: её слова в поле',
    );
    await escapeEditor();
  }
  ck(
    (await page
      .locator('[data-playground-open="retouch_zone"] [data-retouch-source="800"]')
      .count()) === 1,
    'рекол ретуши: её картинка в слоте панели',
  );
  await leaveTo();

  // Codex 6 · recall into a tile this server cannot open: said with the gate's reason, no ?wf.
  await mount({ ...EMPTY_BAND, playgroundWorkflows: ['create_edit'], threedOptions: [] });
  await page.evaluate((run) => window.__pg.recall(run, true), {
    id: 77,
    kind: 'threed',
    status: 'done',
    params: { threed: { referenceMediaIds: [41] } },
    inputs: { refs: [] },
  });
  await settle(200);
  const alerts = await page.evaluate(() => window.__pg.alerts());
  ck(
    wf() === null &&
      alerts.some((a) =>
        a.includes('run 77 cannot be laid out here — Image to 3D is not wired on this server'),
      ) &&
      !alerts.some((a) => a.includes('is back in')),
    'рекол в плитку, которую сервер не открывает: причина ворот, без «back in», без ?wf',
    JSON.stringify(alerts),
  );
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// ─── стенд маски (N и O): настоящая картинка 4×5, полоса с одним результатом, помощники ────────
// A real 4×5 PNG for the stage (the stand aborts every other picture): the editor needs its
// natural size to lay the canvas on it.
const png = (w, h) => {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
// `-wide` serves a 6×4 picture (the 6000×4000 case of O); every other name a 4×5 one.
await page.route('http://probe.local/inpaint-*', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: route.request().url().includes('-wide') ? png(6, 4) : png(4, 5),
  }),
);
const pmedia = (id, w, h, shown = w > h ? 'wide' : 'tall') => ({
  id,
  media: {
    thumbnail: { mediaUrl: `http://probe.local/inpaint-${id}-${shown}.png` },
    fullSize: { mediaUrl: `http://probe.local/inpaint-${id}-${shown}.png`, width: w, height: h },
  },
});
const bandOf = (over, w = 800, h = 1000, shown) => ({
  ...EMPTY_BAND,
  playgroundWorkflows: ['retouch_zone', 'create_edit'],
  runs: [
    {
      id: 85,
      kind: 'freeform',
      status: 'done',
      ask: 'a coat',
      params: { freeform: { preset: 'free', items: [] } },
      pictures: [{ id: 850, ordinal: 1, media: pmedia(850, w, h, shown) }],
    },
  ],
  ...over,
});
const uploads = () => page.evaluate(() => window.__pgUploads || 0);
const uploadReqs = () =>
  page.evaluate(() => window.__pgCalls.filter((c) => c.method === 'UploadContentImage'));
const starts = () =>
  page.evaluate(() =>
    window.__pgCalls.filter((c) => c.method === 'StartDesignRun').map((c) => c.req),
  );
const editorGenerate = () =>
  page.locator('[data-mask-editor] button', {
    hasText: /^(GENERATE|starting…|uploading the mask…)$/,
  });
const maskDoor = () => page.locator('[data-pg-output="850"] button[aria-label^="mask picture"]');
/** A fresh page on `band`; `clear` = forget the tab's storage (the ledger and the kept paints). */
const mountMask = async (band, clear = true) => {
  await page.goto('http://probe.local/start');
  await page.goto(CARD);
  await page.waitForFunction(() => !!window.__pg);
  await page.evaluate((b) => {
    window.__pgBand = b;
    window.__pg.mount(b);
  }, band);
  await page.waitForSelector('[data-workflow-tile]');
  await page.evaluate((clear) => {
    if (clear) sessionStorage.clear();
    window.__pgCalls.length = 0;
    window.__pgUploads = 0;
  }, clear);
};
const openMask = async () => {
  await maskDoor().click();
  await page.waitForSelector('[data-mask-canvas]');
  // The stand has no stylesheet: the dialog lies in the flow, below the fold — bring the canvas
  // into view, or the pointer lands outside the dialog and Radix closes it.
  await page.locator('[data-mask-canvas]').scrollIntoViewIfNeeded();
};
const openAndPaint = async (band) => {
  await mountMask(band);
  await openMask();
  const box = await page.locator('[data-mask-canvas]').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + box.width * 0.05, cy + box.height * 0.02, { steps: 4 });
  await page.mouse.up();
  await page.locator('[data-mask-editor] textarea').fill('a clean pocket');
  await settle(100);
};
const editorText = async () => (await page.locator('[data-mask-editor]').textContent()) ?? '';

head('N', 'C-14 маршрут маски живьём: одна загрузка на краску, тот же ключ, тело inpaint');
try {
  // 1 · the mask route
  await openAndPaint(bandOf({ runKinds: ['freeform', 'inpaint'] }));
  const t1 = await editorText();
  ck(
    t1.includes('Only the painted zone changes; everything else keeps its pixels.') &&
      !t1.includes('The rectangle around your zone may change.'),
    'сервер с inpaint: под кистью «only the painted zone», строки про прямоугольник нет',
  );
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const up1 = await uploadReqs();
  ck(
    up1.length === 1 && up1[0].req.preserveOriginal === true,
    'одна загрузка маски, verbatim (preserveOriginal)',
  );
  const maskFacts = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      w: img.naturalWidth,
      h: img.naturalHeight,
      centre: at(410, 505),
      corner: at(5, 5),
      png: url.startsWith('data:image/png;base64,'),
    };
  }, up1[0]?.req.rawB64Image ?? '');
  ck(
    maskFacts.png && maskFacts.w === 800 && maskFacts.h === 1000,
    'маска — PNG размером картинки (800×1000)',
    JSON.stringify(maskFacts),
  );
  ck(
    maskFacts.centre.slice(0, 3).every((v) => v === 255) &&
      maskFacts.corner.slice(0, 3).every((v) => v === 0),
    'маска: белое под кистью, чёрное вокруг',
    JSON.stringify(maskFacts),
  );
  const s1 = await starts();
  ck(
    s1.length === 1 &&
      s1[0].kind === 'inpaint' &&
      s1[0].ask === 'a clean pocket' &&
      s1[0].params.inpaint?.sourceMediaId === 850 &&
      s1[0].params.inpaint?.maskMediaId === 6001 &&
      !s1[0].params.freeform,
    'StartDesignRun: kind inpaint, ask = слова, params.inpaint = {850, маска}',
    JSON.stringify(s1[0]),
  );
  await answer('lost');
  await settle(150);
  ck(
    (await editorGenerate().textContent()) === 'GENERATE',
    'ответ потерян — GENERATE снова жив, редактор открыт',
  );
  await editorGenerate().click();
  await page.waitForFunction(
    () => window.__pgCalls.filter((c) => c.method === 'StartDesignRun').length === 2,
  );
  const s2 = await starts();
  ck(
    (await uploads()) === 1,
    'второе нажатие той же краски — загрузок всё ещё одна',
    String(await uploads()),
  );
  ck(
    s2[1].clientRequestId === s2[0].clientRequestId &&
      s2[1].params.inpaint?.maskMediaId === s2[0].params.inpaint?.maskMediaId,
    'второе нажатие несёт ТОТ ЖЕ client_request_id и ту же маску',
    `${s2[0].clientRequestId} → ${s2[1].clientRequestId}`,
  );
  await answer('lost');
  await page.keyboard.press('Escape');
  await settle(150);

  // 2 · an old server: phase 2 exactly
  await openAndPaint(bandOf({}));
  const t2 = await editorText();
  ck(
    t2.includes('The rectangle around your zone may change.') &&
      !t2.includes('Only the painted zone'),
    'старый сервер: прежняя строка под кистью',
  );
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const s3 = await starts();
  ck(
    (await uploads()) === 0 &&
      s3[0].kind === 'freeform' &&
      s3[0].params.freeform?.preset === 'retouch',
    'старый сервер: тело фазы 2 (freeform/retouch), маска не грузится',
    JSON.stringify({ uploads: await uploads(), kind: s3[0]?.kind }),
  );
  await answer('lost');
  await page.keyboard.press('Escape');
  await settle(150);

  // 3 · a picture that states no size on a mask server: the window, said in the price line
  await openAndPaint(bandOf({ runKinds: ['freeform', 'inpaint'] }, 0, 0));
  ck(
    ((await page.locator('[data-mask-price]').textContent()) ?? '').startsWith(
      'this picture states no size; the rectangle path is used',
    ) && (await editorText()).includes('The rectangle around your zone may change.'),
    'картинка без размера: строка цены «states no size», строка про прямоугольник',
  );
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const s4 = await starts();
  ck(
    (await uploads()) === 0 && s4[0].kind === 'freeform',
    'картинка без размера: тело окна, без загрузки',
  );
  await answer('lost');
  await page.keyboard.press('Escape');
  await settle(150);
} catch (e) {
  ck(false, 'группа оборвалась', String(e?.message ?? e).split('\n')[0]);
}

head('O', 'G-03: краска переживает закрытие, замок загрузки, холст без маски, клавиатура, поворот');
const MASK_BAND = () => bandOf({ runKinds: ['freeform', 'inpaint'] });
const closeMask = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-mask-editor]', { state: 'detached' });
  await settle(100);
};
const priceLine = async () => (await page.locator('[data-mask-price]').textContent()) ?? '';
const TOO_LARGE = 'this browser cannot draw a mask this size; the rectangle path is used';
/** What the uploaded mask holds at two pixels (white = painted). */
const maskAt = (dataUrl, points) =>
  page.evaluate(
    async ([url, points]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3));
    },
    [dataUrl, points],
  );

// 1 · BLOCKER: a lost answer, a close, a reopen — the same paint, the same mask, the same key
try {
  await openAndPaint(MASK_BAND());
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const [first] = await starts();
  await answer('lost');
  await settle(150);
  await closeMask();
  await openMask();
  ck(
    (await page.locator('[data-mask-editor] textarea').inputValue()) === 'a clean pocket' &&
      !(await page.locator('[data-mask-editor] button', { hasText: /^undo$/ }).isDisabled()) &&
      (await editorGenerate().textContent()) === 'GENERATE',
    'закрыть и открыть после потерянного ответа: краска и слова на месте, GENERATE жив',
    JSON.stringify({
      words: await page.locator('[data-mask-editor] textarea').inputValue(),
      door: await editorGenerate().textContent(),
      text: (await editorText()).slice(0, 400),
    }),
  );
  await editorGenerate().click();
  await page.waitForFunction(
    () => window.__pgCalls.filter((c) => c.method === 'StartDesignRun').length === 2,
  );
  const again = (await starts())[1];
  ck(
    (await uploads()) === 1 &&
      again.clientRequestId === first.clientRequestId &&
      again.params.inpaint?.maskMediaId === first.params.inpaint?.maskMediaId,
    'повтор после закрытия: загрузок одна, та же маска, ТОТ ЖЕ client_request_id — оплата одна',
    `${first.clientRequestId}/${first.params.inpaint?.maskMediaId} → ${again.clientRequestId}/${again.params.inpaint?.maskMediaId} (${await uploads()})`,
  );
  await answer('lost');
  await settle(150);
  // …and a reload of the tab: the kept paint and its mask come back from sessionStorage
  await mountMask(MASK_BAND(), false);
  await openMask();
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const [reloaded] = await starts();
  ck(
    (await uploadReqs()).length === 0 &&
      reloaded.clientRequestId === first.clientRequestId &&
      reloaded.params.inpaint?.maskMediaId === first.params.inpaint?.maskMediaId,
    'после перезагрузки вкладки: без новой загрузки, та же маска, тот же ключ',
    `${reloaded.clientRequestId}/${reloaded.params.inpaint?.maskMediaId}`,
  );
  // accepted → the paint is spent: the next open starts clean
  await answer('ok');
  await page.waitForSelector('[data-mask-editor]', { state: 'detached' });
  await settle(100);
  await openMask();
  ck(
    (await page.locator('[data-mask-editor] button', { hasText: /^undo$/ }).isDisabled()) &&
      (await page.locator('[data-mask-editor] textarea').inputValue()) === '',
    'принятый прогон забывает краску: новое открытие — чистый лист',
  );
  await closeMask();
} catch (e) {
  ck(false, 'O1 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// 2 · the same on the window path (an old server): the hull comes back from the same strokes
try {
  await openAndPaint(bandOf({}));
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const [first] = await starts();
  await answer('lost');
  await settle(150);
  await closeMask();
  await openMask();
  await editorGenerate().click();
  await page.waitForFunction(
    () => window.__pgCalls.filter((c) => c.method === 'StartDesignRun').length === 2,
  );
  const again = (await starts())[1];
  ck(
    again.kind === 'freeform' && again.clientRequestId === first.clientRequestId,
    'путь окна: закрыть, открыть, повторить — тот же ключ (та же оболочка)',
  );
  await answer('lost');
  await settle(150);
  await closeMask();
} catch (e) {
  ck(false, 'O2 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// 3 · m-3 / m-4: while the mask goes up — «uploading the mask…», no close
try {
  await openAndPaint(MASK_BAND());
  await page.evaluate(() => {
    window.__pgUploadHold = true;
  });
  await editorGenerate().click();
  await page.waitForFunction(() => (window.__pgUploadOut || []).length === 1);
  ck(
    (await editorGenerate().textContent()) === 'uploading the mask…',
    'во время загрузки кнопка говорит «uploading the mask…», а не «starting…» (m-4)',
    await editorGenerate().textContent(),
  );
  await page.keyboard.press('Escape');
  await settle(150);
  ck(
    (await page.locator('[data-mask-editor]').count()) === 1 &&
      (await page.locator('[data-mask-editor] button[aria-label="close the mask"]').isDisabled()),
    'во время загрузки Escape не закрывает, ✕ выключен (m-3)',
  );
  await page.evaluate(() => {
    window.__pgUploadHold = false;
    window.__pgUploadOut.shift()();
  });
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  ck(
    (await starts())[0].kind === 'inpaint' && (await uploads()) === 1,
    'загрузка дошла — прогон inpaint стартовал из того же редактора',
  );
  await answer('lost');
  await settle(150);
  await closeMask();
} catch (e) {
  ck(false, 'O3 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// 4 · M-1: a canvas that answers null — nothing started, the rectangle said, then its body
try {
  await openAndPaint(MASK_BAND());
  await page.evaluate(() => {
    window.__pgNoCanvas = true;
  });
  await editorGenerate().click();
  await settle(300);
  ck(
    (await starts()).length === 0 && (await uploads()) === 0,
    'холст не нарисовал маску: ничего не начато, ничего не загружено',
  );
  ck(
    (await priceLine()).startsWith(TOO_LARGE) &&
      (await editorText()).includes('The rectangle around your zone may change.'),
    'строка цены «cannot draw a mask this size», под кистью — прямоугольник',
    await priceLine(),
  );
  ck(
    (await page.evaluate(() => window.__pg.alerts())).some((a) =>
      a.startsWith('nothing was started: this browser could not draw the mask at 800×1000 px'),
    ),
    'тост: ничего не начато, и почему',
    JSON.stringify(await page.evaluate(() => window.__pg.alerts())),
  );
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const [s] = await starts();
  ck(
    s.kind === 'freeform' &&
      s.params.freeform?.preset === 'retouch' &&
      !s.params.inpaint &&
      (await uploads()) === 0,
    'следующее нажатие — тело окна (freeform/retouch), без inpaint и без загрузки',
    JSON.stringify({ kind: s.kind, uploads: await uploads() }),
  );
  await answer('lost');
  await settle(150);
  await page.evaluate(() => {
    window.__pgNoCanvas = false;
  });
  await closeMask();
} catch (e) {
  ck(false, 'O4 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// 5 · M-1: 24 MP over the budget — the window from the start, said before any press
try {
  await openAndPaint(bandOf({ runKinds: ['freeform', 'inpaint'] }, 6000, 4000));
  ck(
    (await priceLine()).startsWith(TOO_LARGE),
    '6000×4000 на сервере с маской: строка «cannot draw a mask this size» до нажатия',
    await priceLine(),
  );
  await editorGenerate().click();
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  ck(
    (await starts())[0].kind === 'freeform' && (await uploads()) === 0,
    '6000×4000: тело окна, холст на 24 МП не создаётся, загрузки нет',
  );
  await answer('lost');
  await settle(150);
  await closeMask();
} catch (e) {
  ck(false, 'O5 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// 6 · Codex MAJOR: the whole retouch from the keyboard
try {
  await mountMask(MASK_BAND());
  await maskDoor().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-mask-canvas]');
  await settle(100);
  const onCanvas = () =>
    page.evaluate(() => !!document.activeElement?.hasAttribute('data-mask-canvas'));
  for (let i = 0; i < 4 && !(await onCanvas()); i++) await page.keyboard.press('Tab');
  ck(
    await onCanvas(),
    'дверь Mask открыта клавишей Enter, Tab доводит до картинки (фокус на кисти)',
  );
  await page.keyboard.press('Space');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await settle(80);
  ck(
    (await page.locator('[data-mask-ring]').count()) === 1 &&
      !(await page.locator('[data-mask-editor] button', { hasText: /^undo$/ }).isDisabled()),
    'Space · стрелки · Space: мазок лёг (undo жив), кольцо кисти видно',
  );
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await settle(120);
  ck(
    (await page.locator('[data-mask-editor]').count()) === 1,
    'Escape при опущенной кисти поднимает её, а не закрывает редактор',
  );
  await page.locator('[data-mask-editor] textarea').fill('a clean pocket');
  await page.locator('[data-mask-canvas]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pgCalls.some((c) => c.method === 'StartDesignRun'));
  const [s] = await starts();
  const [up] = await uploadReqs();
  const px = await maskAt(up?.req.rawB64Image ?? '', [
    [400, 500],
    [470, 540],
    [5, 5],
  ]);
  ck(
    s.kind === 'inpaint' &&
      s.ask === 'a clean pocket' &&
      px[0].every((v) => v === 255) &&
      px[1].every((v) => v === 255) &&
      px[2].every((v) => v === 0),
    'Enter на картинке: прогон inpaint, маска белая по пути кисти, чёрная вокруг',
    JSON.stringify({ kind: s.kind, px }),
  );
  await answer('lost');
  await settle(150);
  await page.locator('[data-mask-canvas]').focus();
  await closeMask();
  ck(true, 'Escape при поднятой кисти закрывает редактор');
} catch (e) {
  ck(false, 'O6 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

// 7 · m-1: a file stored turned — refused for free, before the paint
try {
  await openAndPaint(bandOf({ runKinds: ['freeform', 'inpaint'] }, 1000, 800, 'tall'));
  ck(
    (await editorText()).includes('this picture is stored turned (its camera orientation)'),
    'файл хранится повёрнутым (1000×800, показан 4:5): отказ словами',
  );
  await page.locator('[data-mask-canvas]').focus();
  await page.keyboard.press('Enter');
  await settle(200);
  ck(
    (await starts()).length === 0 && (await uploads()) === 0,
    'повёрнутый файл: ни загрузки, ни прогона',
  );
  await closeMask();
} catch (e) {
  ck(false, 'O7 оборвалась', String(e?.message ?? e).split('\n')[0]);
}

ck(errors.length === 0, 'страница без ошибок', errors.join(' | '));
await browser.close();

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    (MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : ''),
);
process.exit(bad === 0 ? 0 : 1);
