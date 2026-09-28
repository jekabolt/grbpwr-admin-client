#!/usr/bin/env node
// АВТОСЕЙВ КАРТОЧКИ, АВТО-СТЕЙДЖ И ОТКАТ ТЕКСТА — ТРИ ОБЕЩАНИЯ ВОЛНЫ 25.09 (зона CL-A).
//
//   (1) автосейв пишет через 2 с после ПОСЛЕДНЕЙ правки — не раньше — и НЕ пишет невалидную форму;
//   (4) flush отвечает только над ТИХОЙ карточкой (ревью B-03 / M-03): записи здесь ОТЛОЖЕННЫЕ, правки
//       приходят и во время первого прохода, и во время поставленного в очередь, — flush обязан ждать,
//       пока не ляжет проход, за который не пришло ничего, а «saved» и история — только после него;
//   (5) 409 держит ВСЕ записи, явные тоже (M-01); откат всей работы гасит любой статус о ней (N-02);
//       после dispose машина не рендерит и не взводит таймеров (N-01);
//   (6) после записи форма чиста, если никто не правил (R-1), — и когда карточка пришла маппером, и когда
//       форма собрана из JSON (так восстанавливался черновик до O-64: у профиля пресса без пара ключа
//       `pressSteam` там нет, а маппер отдаёт его присутствующим `undefined`); карта грязного —
//       разреженная (R-8). Настоящий RHF (createFormControl) и настоящий маппер схемы;
//   (8) хелперы записи: «грязно ли что-то под узлом» по полной карте RHF (m4); отказ панели — только
//       её собственный, в той же задаче (m2); сдвинулось ли ТЕЛО между двумя чтениями карточки (M-3);
//       работа тела формы без фактов стиля (M2); тело, которое страница ОТПРАВИЛА, против прочитанного
//       потом (mn-1);
//   (7) панель, которую правят во время каждого её коммита, не упирается в потолок `restaged` —
//       потолок держит только панель, перестейдживающую саму себя (R-9); flush, не дождавшийся
//       тишины, отвечает `busy` (R-10); работа, возникшая раньше машины, взводится при создании
//       (R-12); запись, которую вела не машина, заканчивает её статус там же, где кончилась (R-7);
//       упавшая запись повторяется сама — лестница 5 / 15 / 45 с, потом каждые 30 с, пока есть
//       работа, правка не ждёт шага, затихшая карточка повторы снимает; потолок `restaged` — тоже
//       шаг, а не конец (O-60, D-59: двери «retry» нет);
//   (9) ревью Codex O-60 (r4): диалог перевода, ждущий записи, ушедшей до него, слышит её 409 как
//       `conflict`, а не как паузу; правка, пришедшая, пока летела падающая запись, пишется своим
//       дебаунсом, а не ступенью лестницы; `off` терминален для записи в полёте — ни «saved», ни
//       «not saved», ни таймера, а бухгалтерия лёгшей записи (история) остаётся; `error`
//       помнит причину — упала запись или панель менялась, пока писалась;
//  (10) D-66 / D-66′ (27.09, T61 r5): что значит упавшая запись, решает одно место — `failureClassOf`:
//       401/403 — `off` до конца жизни страницы (ни таймера, ни следующей правки, setEnabled(true) его
//       не снимает), со словами сервера; 409 — конфликт; сеть, 408, 429, 5xx — лестница; любой другой
//       4xx — удержанный отказ: «not saved» со словами сервера КАК ЕСТЬ (и там, где страница объясняет
//       отказ своей фразой), ни одного таймера, следующая попытка — со следующей правкой; статус,
//       завёрнутый панелью в `cause`, и статус мутации панели (watchOwnFailure) классифицируются так же;
//  (11) диалог перевода ждёт запись в полёте (convert-wait.ts): ожидание отменяемо и ограничено
//       (15 с, повисшая запись — `timeout`), первый ответ — ответ; приговор после ожидания архивирует
//       только над `needs-confirm` / `ok` / `nothing`, над живой страницей и карточкой, которая
//       сохраняет себя сама, — `off`, `error`, отказ, конфликт, ушедшая страница: ни одного архива;
//  (12) ТОЧКА СБРОСА (10/10) истории операций под автосейвом (operations-field.tsx): settle после записи
//       не шлёт RHF безымянного события значений — слушатель `watch` «пустое name = reset()» молчит;
//       массивы той же длины пишутся по листьям, id строк useFieldArray живут; массив другой длины
//       пишется целиком — и только его id перечеканиваются (настоящий RHF 7.62);
//   (2) авто-стейдж не поднимает стейдж, если хоть одна строка готовности `unknown` (Codex B-01);
//   (3) откат из истории меняет ТОЛЬКО текстовые секции, картинки аспектов остаются текущими (B-04).
//
// Каждое обещание проверено дважды: на настоящем коде (всё зелёное) и на МУТАНТЕ — копии того же
// модуля с вырезанной ровно той строкой, которая обещание держит. На мутанте соответствующая проверка
// ОБЯЗАНА покраснеть: иначе она сторожит мёртвый код. Подмена утверждает, что случилась (строка
// найдена), — совпавшие «до» и «после» без подмены ничего бы не доказали. Ничего на диске не трогается.
//
//   node scripts/techcard-autosave-probe.mjs

import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const C = 'src/components/managers/tech-card/components';

// ─── мутанты ──────────────────────────────────────────────────────────────────────────────────
const MUTANTS = {
  none: [],
  // (1a) дебаунс выключен: запись уходит сразу, а не через 2 с
  debounce0: [
    [`${C}/useTechCardAutosave.ts`, "arm(deps.debounceMs, 'debounce');", "arm(0, 'debounce');"],
  ],
  // (1b) проверка валидности выключена: невалидная форма уходит на сервер
  noValidate: [[`${C}/useTechCardAutosave.ts`, 'if (!v.ok) {', 'if (false) {']],
  // (4a) ОТКАТ B-03 В ОДНУ СТРОКУ: flush отвечает после первого же прохода, тихо там или нет
  flushAnswersEarly: [
    [
      `${C}/useTechCardAutosave.ts`,
      'const quiet = gen === changeGen && !deps.hasWork();',
      'const quiet = true;',
    ],
  ],
  // (4b) «complete» с работой на руках снова считается концом: saved + история над правкой в полёте
  completeOverWork: [
    [
      `${C}/useTechCardAutosave.ts`,
      'if (deps.hasWork()) return progress(at);',
      'if (false) return progress(at);',
    ],
  ],
  // (5a) старая пауза конфликта: держала только тихие записи, ⌘S проходил с протухшей версией
  conflictLetsExplicit: [
    [
      `${C}/useTechCardAutosave.ts`,
      "if (state.status === 'conflict') return 'conflict';",
      "if (mode === 'silent' && state.status === 'conflict') return 'conflict';",
    ],
  ],
  // (5b) старое «нечего писать»: гасило только `dirty`, `invalid` оставался висеть
  restOnlyDirty: [
    [
      `${C}/useTechCardAutosave.ts`,
      'restIfNoWork();',
      "if (state.status === 'dirty') set({ status: restingStatus() });",
    ],
  ],
  // (5c) без стража dispose: исход записи, пришедший после размонтирования, рендерится и взводит повтор
  noDisposeGuard: [
    [`${C}/useTechCardAutosave.ts`, 'if (!disposed) deps.onState(state);', 'deps.onState(state);'],
    [
      `${C}/useTechCardAutosave.ts`,
      '    // N-01: no retry or debounce outlives the page.\n    if (disposed) return;\n',
      '',
    ],
  ],
  // (6a) ОТКАТ R-1: база нетронутого ключа снова с сервера — форма, собранная из JSON, «грязна» навсегда
  baselineFromServer: [[`${C}/useTechCardAutosave.ts`, '        : now;', '        : landed;']],
  // (6b) ОТКАТ R-8: полная карта RHF остаётся — `!![]` читается «грязно» у каждого массива
  fullDirtyMap: [
    [
      `${C}/useTechCardAutosave.ts`,
      '  control._formState.dirtyFields = sparse;\n  control._subjects.state.next({ dirtyFields: sparse });\n',
      '',
    ],
  ],
  // (7a) ОТКАТ R-9: жест оператора больше не обнуляет счёт `restaged`
  streakIgnoresGestures: [
    [`${C}/useTechCardAutosave.ts`, 'if (gestures !== heardOperatorGen) {', 'if (false) {'],
  ],
  // (7b) ОТКАТ R-10: не затихший flush снова «the last save failed»
  flushSaysError: [
    [
      `${C}/useTechCardAutosave.ts`,
      "было бы неправдой (R-10).\n      return 'busy';",
      "было бы неправдой (R-10).\n      return 'error';",
    ],
  ],
  // (7e) ОТКАТ R-10 у потолка restaged: flush, упёршийся в него, снова «the last save failed»
  capSaysError: [
    [
      `${C}/useTechCardAutosave.ts`,
      "not «the last save failed» (R-10).\n          return 'busy';",
      "not «the last save failed» (R-10).\n          return 'error';",
    ],
  ],
  // (7c) ОТКАТ R-12: работа, возникшая до машины, ждёт следующей правки под «idle»
  noArmAtCreation: [
    [`${C}/useTechCardAutosave.ts`, 'if (deps.isEnabled() && deps.hasWork()) {', 'if (false) {'],
  ],
  // (7f) ОТКАТ m7: работа до машины без человека за ней всё равно пишется при открытии
  mountDirtArmed: [
    [
      `${C}/useTechCardAutosave.ts`,
      "    if (deps.armAtCreation?.() ?? true) arm(deps.debounceMs, 'debounce');",
      "    arm(deps.debounceMs, 'debounce');",
    ],
  ],
  // (7g) ОТКАТ m9: цикл, пришедшийся на паузу, конец паузы не взводит
  noResume: [
    [
      `${C}/useTechCardAutosave.ts`,
      '      if (disposed || !skippedWhilePaused) return;',
      '      return;',
    ],
  ],
  // (8a) ОТКАТ m4: массив под узлом — «грязно», что бы в нём ни было
  anyDirtyArrays: [
    [
      `${C}/useTechCardAutosave.ts`,
      'if (Array.isArray(node)) return node.some(anyDirty);',
      'if (Array.isArray(node)) return true;',
    ],
  ],
  // (8b) ОТКАТ m2: отказ мутации помнится и после своей задачи — чужой 409 приписывается панели
  failureOutlivesItsTask: [
    [
      `${C}/useTechCardAutosave.ts`,
      '    setTimeout(() => {\n      if (last === failure) last = null;\n    }, 0);\n',
      '',
    ],
  ],
  // (8c) ОТКАТ M-3: тело «не сдвигается» никогда — чужая запись принимается молча
  bodyNeverMoves: [
    [
      `${C}/useTechCardAutosave.ts`,
      '  const echo = to.techCard;\n  return !deepEqual(',
      '  const echo = to.techCard;\n  return false && !deepEqual(',
    ],
  ],
  // (8d) ключи строк без ключа не прикалываются — два чтения одной карточки «расходятся» на ULID
  keysNotPinned: [
    [
      `${C}/useTechCardAutosave.ts`,
      'formOnTheWire(mapTechCardToForm(pinRowKeys(card)), echo, canWriteCosting)',
      'formOnTheWire(mapTechCardToForm(card), echo, canWriteCosting)',
    ],
  ],
  // (7h) ОТКАТ mn-5: конфликт, открытый, пока шла тихая проверка, перекрашивается и пишется поверх
  conflictDuringCheckOverwritten: [
    [
      `${C}/useTechCardAutosave.ts`,
      "      if ((state as MachineState).status === 'conflict') return 'conflict';\n",
      '',
    ],
  ],
  // (8e) факты стиля считаются движением тела
  styleOwnedCounted: [
    [
      `${C}/useTechCardAutosave.ts`,
      '  for (const k of STYLE_OWNED_INSERT_KEYS) delete wire[k];\n',
      '',
    ],
  ],
  // (8f) ОТКАТ M2: факт стиля — работа тела, и форма с ним не затихает никогда
  styleFactsAreBodyWork: [
    [`${C}/useTechCardAutosave.ts`, '    if (STYLE_FACTS.has(key)) continue;\n', ''],
  ],
  // (7d) ОТКАТ R-7: исход чужой записи машине не сообщается
  externalIgnored: [
    [
      `${C}/useTechCardAutosave.ts`,
      '      if (disposed || !enabled()) return;\n      settle(r, reason);\n',
      '      if (disposed || !enabled() || reason) return;\n      settle(r, reason);\n',
    ],
  ],
  // (2) строка `unknown` больше не держит стейдж
  noUnknownGuard: [
    [`${C}/stage-progress.tsx`, 'if (all.some((x) => x.unknown === true)) return null;', ''],
  ],
  // (3a) откат переписывает строку аспекта из снимка — картинки строки теряются
  restoreDropsPictures: [
    [
      `${C}/save-history.ts`,
      'details.push({ ...d, text });',
      'details.push({ key, text, mediaIds: [] });',
    ],
  ],
  // (3b) аспект без текста и без картинок больше не снимается
  restoreKeepsEmptyRows: [
    [`${C}/save-history.ts`, 'if (!text.trim() && (d.mediaIds?.length ?? 0) === 0) continue;', ''],
  ],
  // (7k) ОТКАТ D-59 (1): лестница 5 / 15 / 45 с кончилась — повторов больше нет, запись ждёт человека
  // с «retry», которого нет
  noRetryStep: [
    [
      `${C}/useTechCardAutosave.ts`,
      "        } else {\n          arm(retryInterval, 'retry');\n        }",
      '        } else {\n          clearTimer();\n        }',
    ],
  ],
  // (7l) ОТКАТ D-59 (2): потолок `restaged` снова останавливает запись насовсем
  capStopsSaving: [
    [
      `${C}/useTechCardAutosave.ts`,
      "go out at the retry step.\n          arm(retryInterval, 'retry');",
      'go out at the retry step.\n          clearTimer();',
    ],
  ],
  // (9a) ОТКАТ O-60 r4 / P1-1: пауза снова раньше конфликта — ожидающий диалог слышит 409 как паузу
  pauseBeforeConflict: [
    [
      `${C}/useTechCardAutosave.ts`,
      '    // M-01: 409 держит ВСЕ записи, явные тоже.',
      "    if (deps.isPaused()) {\n      skippedWhilePaused = true;\n      return 'needs-confirm';\n    }\n    // M-01: 409 держит ВСЕ записи, явные тоже.",
    ],
  ],
  // (9b) ОТКАТ P1-3: падение записи меняет дебаунс правки, пришедшей во время полёта, на ступень лестницы
  failureTakesLadder: [
    [`${C}/useTechCardAutosave.ts`, '        if (changedMeanwhile) {', '        if (false) {'],
  ],
  // (9f) P1-3 без жеста: правка самой страницы во время записи (стейдж возвращён после упавшего
  // перечтения, B-07) снова меняет ступень лестницы на дебаунс
  pageChangeKeepsDebounce: [
    [
      `${C}/useTechCardAutosave.ts`,
      '          (gesturesAtStart === undefined || heardOperatorGen !== gesturesAtStart);',
      '          true;',
    ],
  ],
  // (9g) страж `off` в settle читает устаревший статус: конфликт, найденный страницей на чтении, пока
  // setEnabled(true) ещё не прошёл, не слышен — чип «unsaved» над модалкой конфликта (M-2)
  staleOffSwallowsTheReport: [
    [
      `${C}/useTechCardAutosave.ts`,
      "    if (!enabled()) return 'off';\n",
      "    if (state.status === 'off' || !enabled()) return 'off';\n",
    ],
  ],
  // (9c) ОТКАТ P2-1: исход записи, пришедший после выключения, снова рисует статус и взводит таймер
  settleOverOff: [
    [`${C}/useTechCardAutosave.ts`, '    if (stoppedMeanwhile()) {', '    if (false) {'],
    [`${C}/useTechCardAutosave.ts`, "    if (!enabled()) return 'off';\n", ''],
  ],
  // (9d) страж `off` проглатывает и бухгалтерию лёгшей записи: релиз не пишет историю
  offDropsBookkeeping: [
    [
      `${C}/useTechCardAutosave.ts`,
      "      if (r.outcome === 'complete' && !r.pendingConfirm && !deps.hasWork()) {\n        deps.onComplete?.(reason);\n      }\n",
      '',
    ],
  ],
  // (9e) ОТКАТ P2-3: потолок `restaged` называет себя упавшей записью
  capBlamesAFailure: [
    [
      `${C}/useTechCardAutosave.ts`,
      "            cause: 'restaged',",
      "            cause: 'failed',",
    ],
  ],
  // (10a) ОТКАТ D-66: отказ сервера снова едет по лестнице — 412 шлётся каждые 5 / 15 / 45 / 30 с
  refusalRidesLadder: [
    [
      `${C}/useTechCardAutosave.ts`,
      "        if (r.failure === 'refused') {",
      '        if (false) {',
    ],
  ],
  // (10b) машина не узнаёт класс брошенной ошибки (статус есть, а она его не читает)
  catchNeverRefuses: [
    [
      `${C}/useTechCardAutosave.ts`,
      "r = { outcome: 'error', message: errorText(e), ...failureFieldsOf(e) };",
      "r = { outcome: 'error', message: errorText(e) };",
    ],
  ],
  // (10c) любая брошенная ошибка — отказ: 503 и сеть больше не повторяются сами
  everyThrowRefused: [
    [
      `${C}/useTechCardAutosave.ts`,
      "r = { outcome: 'error', message: errorText(e), ...failureFieldsOf(e) };",
      "r = { outcome: 'error', message: errorText(e), failure: 'refused' };",
    ],
  ],
  // (10f) ОТКАТ D-66′: 401/403 снова удержанный отказ — следующая правка шлёт тело снова
  authHeldAsRefusal: [
    [`${C}/useTechCardAutosave.ts`, "  if (status === 401 || status === 403) return 'auth';\n", ''],
  ],
  // (10g) остановка по 401/403 не терминальна: следующая правка снова пишет
  authHearsTheNextChange: [
    [
      `${C}/useTechCardAutosave.ts`,
      '  const enabled = () => !authStopped && deps.isEnabled();',
      '  const enabled = () => deps.isEnabled();',
    ],
  ],
  // (10h) остановку по 401/403 снимает setEnabled(true) страницы
  authLiftedBySetEnabled: [[`${C}/useTechCardAutosave.ts`, '      if (authStopped) return;\n', '']],
  // (10i) ОТКАТ D-66′ P2: машина держит фразу страницы, а не слова сервера
  refusalWordsReplaced: [
    [
      `${C}/useTechCardAutosave.ts`,
      "refusal: r.refusalMessage, cause: 'refused' });",
      "refusal: undefined, cause: 'refused' });",
    ],
  ],
  // (10j) статус, завёрнутый панелью в `cause`, потерян — 412 рецепта уезжает на лестницу
  wrappedStatusLost: [
    [
      `${C}/useTechCardAutosave.ts`,
      '  const wrapped = httpStatus(causeOf(e));',
      '  const wrapped = undefined;',
    ],
  ],
  // (10k) watchOwnFailure помнит только «конфликт ли» — класс переобёрнутой без cause ошибки потерян
  ownFailureForgetsStatus: [
    [
      `${C}/useTechCardAutosave.ts`,
      '      status: failureStatus(error),',
      '      status: undefined,',
    ],
  ],
  // (11a) ожидание без предела: повисшая запись держит диалог
  waitUnbounded: [
    [
      `${C}/convert-wait.ts`,
      "    timer = timers.setTimer(() => done('timeout'), ms);",
      '    void ms;',
    ],
  ],
  // (11b) ✕ / Esc / «keep sellable» не прерывают ожидание
  waitIgnoresCancel: [
    [`${C}/convert-wait.ts`, "    signal.addEventListener('abort', onAbort);", '    void onAbort;'],
  ],
  // (11c) истёкшее ожидание закрывает диалог вместо того, чтобы оставить подтверждение живым
  timeoutClosesDialog: [[`${C}/convert-wait.ts`, '      keep: true,', '      keep: false,']],
  // (11d) ОТКАТ P1 Codex r4: архив над `off` / `error` / картой, которая не сохраняется
  archiveOverOff: [[`${C}/convert-wait.ts`, '  if (!expected || !live.saves) {', '  if (false) {']],
  // (11e) архив после ухода страницы
  archiveAfterUnmount: [
    [
      `${C}/convert-wait.ts`,
      "  if (waited === 'aborted' || !live.mounted) return { go: false };",
      "  if (waited === 'aborted') return { go: false };",
    ],
  ],
  // (12a) settle снова сбрасывает значения формы целиком — безымянное событие будит точку сброса (10/10)
  settleResetsValues: [
    [
      `${C}/useTechCardAutosave.ts`,
      '  form.reset(baseline as TechCardFormData, {\n    keepValues: true,',
      '  form.reset(baseline as TechCardFormData, {\n    keepValues: false,',
    ],
  ],
  // (10e) конец паузы (диалог перевода закрыт) снова шлёт тело, которому сервер отказал
  resumeResendsRefusal: [
    [
      `${C}/useTechCardAutosave.ts`,
      "      if (state.status === 'error' && state.cause === 'refused') return;\n",
      '',
    ],
  ],
  // (10d) 429 (лимит частоты — проходит сам) принят за отказ
  rateLimitRefused: [
    [`${C}/useTechCardAutosave.ts`, ' || status === 429 || status < 400', ' || status < 400'],
  ],
  // (7m) правка поверх упавшей записи ждёт шага повторов, а не пишет своим дебаунсом
  changeWaitsForTheStep: [
    [
      `${C}/useTechCardAutosave.ts`,
      "      retryIndex = 0;\n      if (state.status === 'saved' || state.status === 'idle' || state.status === 'error') {",
      "      if (state.status === 'error') return;\n      retryIndex = 0;\n      if (state.status === 'saved' || state.status === 'idle' || state.status === 'error') {",
    ],
  ],
};

async function load(mutant) {
  const edits = MUTANTS[mutant];
  const hits = new Set();
  const outfile = resolve(root, `scripts/.techcard-autosave-${mutant}-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(root, 'scripts/techcard-autosave-probe-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    absWorkingDir: root,
    outfile,
    logLevel: 'silent',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'text', '.png': 'dataurl' },
    define: {
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [
      {
        name: 'mutate',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const mine = edits.filter(([rel]) => args.path.endsWith(rel));
            if (mine.length === 0) return null;
            let text = readFileSync(args.path, 'utf8');
            for (const [rel, from, to] of mine) {
              if (!text.includes(from))
                throw new Error(`mutant ${mutant}: «${from}» not found in ${rel}`);
              text = text.split(from).join(to);
              hits.add(rel + from);
            }
            return { contents: text, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
          });
        },
      },
    ],
  });
  if (hits.size !== edits.length)
    throw new Error(`mutant ${mutant}: ${edits.length - hits.size} edit(s) did not apply`);
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(outfile, { force: true });
  return mod;
}

// ─── поддельные часы: setTimeout/clearTimeout/now, advance прогоняет таймеры и микрозадачи ──────
function fakeClock() {
  let t = 0;
  let seq = 0;
  const q = new Map();
  const drain = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  };
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      q.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => q.delete(id),
    pending: () => q.size,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, e] of q) if (e.at <= end && (!next || e.at < next[1].at)) next = [id, e];
        if (!next) break;
        q.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await drain();
      }
      t = end;
      await drain();
    },
  };
}

function machineRig(mod, { valid = true } = {}) {
  const clock = fakeClock();
  const rig = { clock, saves: [], states: [], dirty: false, valid };
  rig.m = mod.createAutosaveMachine({
    debounceMs: 2000,
    retryDelaysMs: [5000, 15000, 45000],
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    isEnabled: () => true,
    isPaused: () => false,
    hasWork: () => rig.dirty,
    validate: async () => ({ ok: rig.valid, errors: rig.valid ? 0 : 2 }),
    save: async (mode, reason) => {
      rig.saves.push({ at: clock.now(), mode, reason });
      rig.dirty = false;
      return { outcome: 'complete' };
    },
    countErrors: () => (rig.valid ? 0 : 2),
    onState: (s) => rig.states.push(s),
  });
  rig.edit = () => {
    rig.dirty = true;
    rig.m.notifyChange();
  };
  return rig;
}

// ─── обещания ───────────────────────────────────────────────────────────────────────────────
async function promise1(mod) {
  const out = {};
  // one edit at t=0: nothing at 1999 ms, exactly one write at 2000 ms
  let r = machineRig(mod);
  r.edit();
  await r.clock.advance(1999);
  out.notBefore2s = r.saves.length === 0;
  await r.clock.advance(1);
  out.firesAt2s = r.saves.length === 1 && r.saves[0].at === 2000 && r.saves[0].mode === 'silent';
  out.savedStatus = r.m.state().status === 'saved' && r.m.state().lastSavedAt === 2000;

  // the debounce restarts on every edit: edits at 0 / 1500 / 3000 → one write at 5000
  r = machineRig(mod);
  r.edit();
  await r.clock.advance(1500);
  r.edit();
  await r.clock.advance(1500);
  r.edit();
  await r.clock.advance(1999);
  out.restartsOnEachEdit = r.saves.length === 0;
  await r.clock.advance(1);
  out.oneWriteAfterQuiet = r.saves.length === 1 && r.saves[0].at === 5000;

  // not while invalid — and the status says why
  r = machineRig(mod, { valid: false });
  r.edit();
  await r.clock.advance(10_000);
  out.noWriteWhileInvalid = r.saves.length === 0;
  out.invalidStatus = r.m.state().status === 'invalid' && r.m.state().errorsCount === 2;
  // …and the same card, once valid, is written 2 s after the fix
  r.valid = true;
  r.edit();
  await r.clock.advance(2000);
  out.writesOnceFixed = r.saves.length === 1;

  // flush: immediate, awaited, answers ok
  r = machineRig(mod);
  r.edit();
  const res = await r.m.flush('probe');
  out.flushImmediate = res === 'ok' && r.saves.length === 1 && r.saves[0].at === 0;
  await r.clock.advance(5000);
  out.flushCancelsDebounce = r.saves.length === 1;
  return out;
}

function promise2(mod) {
  const base = {
    currentStage: 'TECH_CARD_STAGE_IDEA',
    nextStage: 'TECH_CARD_STAGE_PROTO',
    nextStageReady: true,
    releaseRequirements: [],
    releaseReady: false,
    advisories: [],
  };
  const decide = (rows, extra = {}) =>
    mod.decideAutoStage({
      readiness: { ...base, nextStageRequirements: rows, ...extra.readiness },
      savedStage: extra.saved ?? 'TECH_CARD_STAGE_IDEA',
      formStage: extra.form ?? 'TECH_CARD_STAGE_IDEA',
      isAux: extra.isAux ?? false,
    });
  const met = { key: 'style_number', label: 'style number', met: true, unknown: false };
  return {
    // the server's own shape of an unverified row (met=false, unknown=true) with nextStageReady=true
    unknownRowHolds: decide([met, { key: 'patterns', met: false, unknown: true }]) === null,
    // even a row the server marks met AND unknown holds the milestone — the guard itself, not `met`
    unknownFlagItselfHolds: decide([met, { key: 'patterns', met: true, unknown: true }]) === null,
    // control: the same card with every row verified DOES advance, one step
    advancesWhenVerified:
      decide([met, { key: 'patterns', met: true, unknown: false }]) === 'TECH_CARD_STAGE_PROTO',
    // stale readiness (scored for a stage the card has left) never advances
    staleReadinessHolds:
      decide([met], { saved: 'TECH_CARD_STAGE_PROTO', form: 'TECH_CARD_STAGE_PROTO' }) === null,
    // already raised in the form, waiting for its save
    raisedInFormHolds: decide([met], { form: 'TECH_CARD_STAGE_PROTO' }) === null,
    // never two steps, never down
    neverSkips:
      decide([met], { readiness: { nextStage: 'TECH_CARD_STAGE_FIT' } }) === null &&
      decide([met], {
        saved: 'TECH_CARD_STAGE_FIT',
        form: 'TECH_CARD_STAGE_FIT',
        readiness: { currentStage: 'TECH_CARD_STAGE_FIT', nextStage: 'TECH_CARD_STAGE_PROTO' },
      }) === null,
    // an unmet row holds, whatever nextStageReady says
    unmetHolds: decide([met, { key: 'bom_fabric', met: false }]) === null,
    // aux card: its colourway row can never be met — it is dropped, not failed
    auxDropsColourwayRow:
      decide([met, { key: 'colorway_linked', met: false }], {
        isAux: true,
        readiness: { nextStageReady: false },
      }) === 'TECH_CARD_STAGE_PROTO',
  };
}

function promise3(mod) {
  const cur = {
    ...mod.techCardDefaultData,
    name: 'parka NOW',
    concept: 'concept NOW',
    notes: 'note NOW',
    garmentDescription: 'words NOW',
    stage: 'TECH_CARD_STAGE_FIT',
    styleNumber: 'ST-042',
    details: [
      { key: 'silhouette', text: 'boxy NOW', mediaIds: [5, 6] },
      { key: 'collar', text: 'added after the save', mediaIds: [] },
      { key: 'pockets', text: 'pockets NOW', mediaIds: [9] },
    ],
    bomItems: [{ id: 7, lineKey: 'L1', name: 'shell' }],
    callouts: [{ number: 1, text: 'callout' }],
  };
  const snap = mod.textSnapshotOf({
    name: 'parka THEN',
    concept: 'concept THEN',
    notes: 'note THEN',
    garmentDescription: 'words THEN',
    details: [
      { key: 'silhouette', text: 'boxy THEN', mediaIds: [1] },
      { key: 'hem', text: 'raw hem THEN', mediaIds: [2] },
    ],
  });
  const { next, changed } = mod.restoreTextSections(cur, snap);
  const TEXT = new Set(mod.TEXT_SECTIONS);
  const nonText = Object.keys(cur).filter((k) => !TEXT.has(k));
  const byKey = (k) => (next.details ?? []).find((d) => d.key === k);
  const out = {
    textRestored:
      next.name === 'parka THEN' &&
      next.concept === 'concept THEN' &&
      next.notes === 'note THEN' &&
      next.garmentDescription === 'words THEN',
    nonTextUntouched: nonText.every((k) => next[k] === cur[k]),
    changedIsText: changed.every((k) => TEXT.has(k)) && changed.length === 5,
    // the aspect's pictures stay CURRENT — the snapshot's picture list is not restored
    picturesStayCurrent:
      byKey('silhouette')?.text === 'boxy THEN' &&
      JSON.stringify(byKey('silhouette')?.mediaIds) === '[5,6]',
    // an aspect added after the snapshot: its text goes back to empty; with no pictures the row goes
    addedTextOnlyRowDropped: byKey('collar') === undefined,
    // an aspect with pictures keeps its row and pictures, only the text goes back
    rowWithPicturesKeepsThem:
      byKey('pockets')?.text === '' && JSON.stringify(byKey('pockets')?.mediaIds) === '[9]',
    // a text-only aspect deleted since the snapshot comes back, without pictures
    deletedAspectReturns:
      byKey('hem')?.text === 'raw hem THEN' && JSON.stringify(byKey('hem')?.mediaIds) === '[]',
  };
  // An absent WORDS (null in the snapshot) is never turned into a command to clear it.
  const absent = mod.restoreTextSections(cur, { ...snap, garmentDescription: null });
  out.absentWordsNotWritten = absent.next.garmentDescription === 'words NOW';
  // Restoring the current text is a no-op.
  const same = mod.restoreTextSections(cur, mod.textSnapshotOf(cur));
  out.currentIsNoop = same.changed.length === 0;
  return out;
}

// ─── (4) flush над отложенными записями ────────────────────────────────────────────────────────
// Запись здесь висит, пока проба её не отпустит, и уносит только ту правку, что была на экране, когда
// она стартовала: правка, набранная на лету, после приземления остаётся несохранённой.
function deferredRig(mod) {
  const clock = fakeClock();
  const rig = { clock, version: 0, savedVersion: 0, inFlight: [], saves: [], completes: [] };
  rig.m = mod.createAutosaveMachine({
    debounceMs: 2000,
    retryDelaysMs: [5000, 15000, 45000],
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    isEnabled: () => true,
    isPaused: () => false,
    hasWork: () => rig.version !== rig.savedVersion,
    validate: async () => ({ ok: true, errors: 0 }),
    save: (mode, reason) =>
      new Promise((resolve) => {
        const carried = rig.version;
        rig.saves.push({ at: clock.now(), mode, reason, carried });
        rig.inFlight.push(() => {
          rig.savedVersion = carried;
          resolve({ outcome: 'complete' });
        });
      }),
    countErrors: () => 0,
    onState: () => {},
    onComplete: (reason) => rig.completes.push(reason),
  });
  rig.edit = () => {
    rig.version += 1;
    rig.m.notifyChange();
  };
  // Lands the oldest write on the wire; with none on the wire (a mutant that stopped early) it lands
  // nothing, and the checks read what did — or did not — happen.
  rig.land = async () => {
    const next = rig.inFlight.shift();
    if (next) next();
    await clock.advance(0);
  };
  return rig;
}

async function promise4(mod) {
  const out = {};
  // A · a paid door flushes; the operator types during the first pass AND during the second
  let r = deferredRig(mod);
  r.edit();
  let answer = null;
  let flushed = r.m.flush('paid door').then((x) => (answer = x));
  await r.clock.advance(0);
  const firstStarted = r.saves.length === 1;
  r.edit(); // typed while pass 1 is on the wire
  await r.land(); // pass 1 lands without it
  out.pendingAfterFirstPass = firstStarted && answer === null && r.saves.length === 2;
  out.noHistoryOverWork = r.completes.length === 0;
  r.edit(); // typed while pass 2 is on the wire
  await r.land();
  out.pendingAfterSecondPass = answer === null && r.saves.length === 3;
  await r.land(); // pass 3 lands, nothing typed meanwhile
  await flushed;
  out.answersOverQuietCard = answer === 'ok' && r.version === r.savedVersion;
  out.historyOnceQuiet = r.completes.length === 1;

  // B · the flush lands in the QUEUE behind a timer cycle already on the wire; edits during that
  // cycle and during the queued one
  r = deferredRig(mod);
  r.edit();
  await r.clock.advance(2000); // the debounce fires: cycle A on the wire
  const timerCycle = r.saves.length === 1;
  answer = null;
  flushed = r.m.flush('paid door').then((x) => (answer = x)); // queued behind A
  r.edit(); // typed during A
  await r.land(); // A lands; the queued cycle B starts, carrying the edit
  out.queuedPassCarriesEdit =
    timerCycle && r.saves.length === 2 && r.saves[1].carried === 2 && answer === null;
  r.edit(); // typed during the queued cycle
  await r.land();
  out.pendingAfterQueuedPass = answer === null && r.saves.length === 3;
  await r.land();
  await flushed;
  out.queuedAnswersOverQuietCard = answer === 'ok' && r.version === r.savedVersion;
  // …and the debounce the edits armed does not write the same card again afterwards
  await r.clock.advance(10_000);
  out.noEchoWrite = r.saves.length === 3;
  return out;
}

// ─── (5) конфликт, откат всей работы, dispose ─────────────────────────────────────────────────
async function promise5(mod) {
  const out = {};
  // a 409, then ⌘S under the modal: no write until «keep mine» lifts the pause
  let r = machineRig(mod);
  let next = 'conflict';
  r.m = mod.createAutosaveMachine({
    debounceMs: 2000,
    retryDelaysMs: [5000, 15000, 45000],
    setTimer: r.clock.setTimer,
    clearTimer: r.clock.clearTimer,
    now: r.clock.now,
    isEnabled: () => true,
    isPaused: () => false,
    hasWork: () => r.dirty,
    validate: async () => ({ ok: true, errors: 0 }),
    save: async (mode, reason) => {
      r.saves.push({ at: r.clock.now(), mode, reason });
      if (next === 'conflict') return { outcome: 'conflict', message: 'moved on' };
      r.dirty = false;
      return { outcome: 'complete' };
    },
    countErrors: () => 0,
    onState: (s) => r.states.push(s),
  });
  r.dirty = true;
  r.m.notifyChange();
  await r.clock.advance(2000);
  const conflicted = r.m.state().status === 'conflict' && r.saves.length === 1;
  next = 'complete';
  const cmdS = await r.m.flush('keyboard', 'explicit');
  out.conflictHoldsExplicit = conflicted && cmdS === 'conflict' && r.saves.length === 1;
  r.m.resolveConflict();
  const keepMine = await r.m.flush('keep mine', 'explicit');
  out.keepMineWrites = keepMine === 'ok' && r.saves.length === 2 && r.m.state().status === 'saved';

  // invalid, then the operator reverts the only edit: nothing to write, nothing to say about it
  r = machineRig(mod, { valid: false });
  r.edit();
  await r.clock.advance(2000);
  const wasInvalid = r.m.state().status === 'invalid';
  r.dirty = false;
  r.m.notifyChange();
  out.revertClearsInvalid =
    wasInvalid && r.m.state().status === 'idle' && r.m.state().errorsCount === undefined;

  // dispose while a write is on the wire; the write then fails: no render, no retry timer
  r = machineRig(mod);
  let fail = null;
  r.m = mod.createAutosaveMachine({
    debounceMs: 2000,
    retryDelaysMs: [5000, 15000, 45000],
    setTimer: r.clock.setTimer,
    clearTimer: r.clock.clearTimer,
    now: r.clock.now,
    isEnabled: () => true,
    isPaused: () => false,
    hasWork: () => r.dirty,
    validate: async () => ({ ok: true, errors: 0 }),
    save: (mode, reason) =>
      new Promise((resolve) => {
        r.saves.push({ at: r.clock.now(), mode, reason });
        fail = () => resolve({ outcome: 'error', message: 'network' });
      }),
    countErrors: () => 0,
    onState: (s) => r.states.push(s),
  });
  r.dirty = true;
  r.m.notifyChange();
  await r.clock.advance(2000);
  r.m.dispose();
  const statesAtDispose = r.states.length;
  fail();
  await r.clock.advance(0);
  out.noRenderAfterDispose = r.states.length === statesAtDispose;
  out.noTimerAfterDispose = r.clock.pending() === 0;
  await r.clock.advance(120_000);
  out.noRetryAfterDispose = r.saves.length === 1;
  return out;
}

// ─── (6) после записи: база по ключу, разреженная карта грязного (R-1 / R-8) ─────────────────
// Настоящий RHF и настоящий маппер. Профиль пресса без пара: маппер отдаёт `pressSteam: undefined`
// ПРИСУТСТВУЮЩИМ ключом (schema.ts), а у формы, собранной из JSON, ключа нет вовсе.
const PRESS_CARD = {
  id: 7,
  lockVersion: 3,
  techCard: {
    name: 'parka',
    styleNumber: 'ST-042',
    stage: 'TECH_CARD_STAGE_IDEA',
    approvalState: 'TECH_CARD_APPROVAL_STATE_DRAFT',
    construction: {
      // with its equipment, as a stored profile has it (the write mapper drops one without)
      equipmentDefaults: {
        machines: [],
        presses: [
          {
            profileKey: 'p1',
            label: 'steam press',
            pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_PRESS',
            pressTemperatureC: 150,
          },
        ],
      },
    },
  },
};
// What useForm does for the page: something reads isDirty / dirtyFields (RHF computes them only then),
// and a subscriber keeps `_formState` current (RHF writes it only through its subscribers).
function formFor(mod, defaults) {
  const form = mod.createFormControl({ defaultValues: defaults, mode: 'onSubmit' });
  form.control._proxyFormState.isDirty = true;
  form.control._proxyFormState.dirtyFields = true;
  form.control._subscribe({
    formState: { isDirty: true, dirtyFields: true },
    callback: () => {},
    reRenderRoot: true,
  });
  form.control._state.mount = true;
  return form;
}
// A save with nothing typed: the body re-read, construction taken whole from the server (as
// withServerAssignedValues does), everything else as sent.
function landedSave(mod, form) {
  const before = structuredClone(form.getValues());
  const server = mod.mapTechCardToForm(PRESS_CARD);
  return {
    before,
    settled: {
      values: { ...structuredClone(form.getValues()), construction: server.construction },
      server,
    },
  };
}

function promise6(mod) {
  const out = {};
  const mapped = mod.mapTechCardToForm(PRESS_CARD);
  const press = mapped.construction?.equipmentDefaults?.presses?.[0] ?? {};
  // the fixture carries the key as the mapper really emits it — otherwise the checks below prove nothing
  out.mapperEmitsPresentUndefined = 'pressSteam' in press && press.pressSteam === undefined;
  // a) the card as the mapper gave it, saved with no edit
  let form = formFor(mod, mapped);
  let s = landedSave(mod, form);
  mod.settleFormAfterSave(form, s.before, s.settled);
  out.mapperShapedQuietAfterSave = !mod.liveIsDirty(form);
  // b) the same card as a JSON-built form: dirty by key presence alone, quiet after one save
  form = formFor(mod, mapped);
  form.reset(JSON.parse(JSON.stringify(mapped)), { keepDefaultValues: true });
  const dirtyByPresenceOnly = mod.liveIsDirty(form);
  s = landedSave(mod, form);
  mod.settleFormAfterSave(form, s.before, s.settled);
  out.jsonRestoredQuietAfterSave = dirtyByPresenceOnly && !mod.liveIsDirty(form);
  // c) a keystroke landing while that save is on the wire stays the operator's — and is ALL the map holds
  form = formFor(mod, mapped);
  form.reset(JSON.parse(JSON.stringify(mapped)), { keepDefaultValues: true });
  s = landedSave(mod, form);
  form.setValue('name', 'parka typed', { shouldDirty: true });
  mod.settleFormAfterSave(form, s.before, s.settled);
  const map = form.control._formState.dirtyFields;
  out.typedDuringSaveStaysDirty =
    mod.liveIsDirty(form) && form.getValues('name') === 'parka typed' && map.name === true;
  out.dirtyMapIsSparse = JSON.stringify(map) === '{"name":true}';
  return out;
}

// ─── (7) потолок restaged, busy, работа до машины, чужая запись (R-9 / R-10 / R-12 / R-7) ─────
function bareRig(mod, over) {
  const clock = fakeClock();
  const rig = { clock, saves: 0, completes: [] };
  rig.m = mod.createAutosaveMachine({
    debounceMs: 2000,
    retryDelaysMs: [5000, 15000, 45000],
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    isEnabled: () => true,
    isPaused: () => false,
    hasWork: () => true,
    validate: async () => ({ ok: true, errors: 0 }),
    save: async () => ({ outcome: 'complete' }),
    countErrors: () => 0,
    onState: () => {},
    onComplete: (reason) => rig.completes.push(reason),
    ...over(rig),
  });
  return rig;
}

async function promise7(mod) {
  const out = {};
  // R-9 · every cycle ends `restaged` because the operator types into the panel while its commit
  // runs: never the cap. The same with NO gesture behind it is a panel re-staging itself: the cap holds.
  const restaged = (withGestures) =>
    bareRig(mod, (rig) => {
      rig.gen = 0;
      return {
        operatorGen: () => rig.gen,
        save: async () => {
          rig.saves += 1;
          if (withGestures) {
            rig.gen += 1;
            rig.m.notifyChange();
          }
          return { outcome: 'restaged' };
        },
      };
    });
  let r = restaged(true);
  r.m.notifyChange();
  await r.clock.advance(20_000);
  out.steadyPanelEditsNeverCapped = r.saves >= 8 && r.m.state().status !== 'error';
  r = restaged(false);
  r.m.notifyChange();
  await r.clock.advance(20_000);
  const cappedAtFour = r.saves === 4 && r.m.state().status === 'error';
  // D-59: the cap ends the two-second loop, not the saving — nobody is left to press a retry. The step
  // (30 s after the cap at 8 s) writes it once more, and only once, by 40 s.
  await r.clock.advance(20_000);
  out.selfRestagingStillCapped = cappedAtFour && r.saves === 5 && r.m.state().status === 'error';
  // …and a paid door's flush that runs into that cap hears `busy`: nothing failed, the panel kept moving
  r = restaged(false);
  const capped = await r.m.flush('paid door');
  out.flushOnTheCapIsBusy = capped === 'busy' && r.saves === 4 && r.m.state().status === 'error';

  // D-59 · a write that keeps failing: the ladder (5 / 15 / 45 s), then the step — every 30 s, for as
  // long as the card has work; a change does not wait for either (its own debounce); a card that went
  // quiet stops the retries (no save, no timer). Saves at 2 (debounce) · 7 · 22 · 67 · 97 · 127.
  let failing = true;
  r = bareRig(mod, (rig) => ({
    hasWork: () => failing,
    save: async () => {
      rig.saves += 1;
      return { outcome: 'error', message: 'network down' };
    },
  }));
  r.m.notifyChange();
  await r.clock.advance(66_000);
  const ladder = r.saves === 3 && r.m.state().status === 'error';
  await r.clock.advance(2_000); // 68 s: the last rung (67 s) has come
  const afterLadder = r.saves === 4;
  await r.clock.advance(28_000); // 96 s: the step is not due yet
  const stepNotEarly = r.saves === 4;
  await r.clock.advance(2_000); // 98 s: the step (97 s) came — once
  const stepOnce = r.saves === 5;
  await r.clock.advance(30_000); // 128 s: and again (127 s)
  out.retryStepAfterLadder =
    ladder &&
    afterLadder &&
    stepNotEarly &&
    stepOnce &&
    r.saves === 6 &&
    r.m.state().status === 'error';
  // a change while the step is pending writes at its own debounce (130 s), not at the step (157 s)
  const beforeChange = r.saves;
  r.m.notifyChange();
  await r.clock.advance(2_000);
  out.changeDoesNotWaitForTheStep = r.saves === beforeChange + 1;
  // the work went away (reverted by hand, written by another door): the next retry finds nothing, rests
  const beforeQuiet = r.saves;
  failing = false;
  await r.clock.advance(120_000);
  out.retryStopsOverAQuietCard =
    r.saves === beforeQuiet && r.m.state().status !== 'error' && r.clock.pending() === 0;

  // R-10 · a flush over a card that is never quiet (every pass leaves work) answers `busy`
  r = bareRig(mod, (rig) => ({
    save: async () => {
      rig.saves += 1;
      return { outcome: 'complete' };
    },
  }));
  const answer = await r.m.flush('paid door');
  out.neverQuietFlushIsBusy = answer === 'busy' && r.saves === 5;

  // R-12 · work that was there before the machine, with a person behind it (an organ asked early):
  // armed at creation, written at 2 s — not left under «idle» until the next edit
  let dirty = true;
  r = bareRig(mod, (rig) => ({
    hasWork: () => dirty,
    armAtCreation: () => true,
    save: async () => {
      rig.saves += 1;
      dirty = false;
      return { outcome: 'complete' };
    },
  }));
  const armedAtCreation = r.m.state().status === 'dirty';
  await r.clock.advance(2000);
  out.workBeforeMachineIsWritten =
    armedAtCreation && r.saves === 1 && r.m.state().status === 'saved';

  // m7 · the same work with nobody behind it (a child dirtied the form on mount): the chip says «dirty»
  // at once, but opening the card writes nothing — the first change arms it
  dirty = true;
  r = bareRig(mod, (rig) => ({
    hasWork: () => dirty,
    armAtCreation: () => false,
    save: async () => {
      rig.saves += 1;
      dirty = false;
      return { outcome: 'complete' };
    },
  }));
  const shownDirty = r.m.state().status === 'dirty';
  await r.clock.advance(5000);
  const quietOnOpen = r.saves === 0;
  r.m.notifyChange();
  await r.clock.advance(2000);
  out.mountDirtWaitsForAPerson = shownDirty && quietOnOpen && r.saves === 1;

  // m9 · a cycle comes due while the convert dialog holds the page: nothing written, nothing armed; the
  // pause ends → it is armed then, and the work is written — not left at «dirty» for good
  dirty = true;
  let paused = true;
  r = bareRig(mod, (rig) => ({
    hasWork: () => dirty,
    isPaused: () => paused,
    armAtCreation: () => false,
    save: async () => {
      rig.saves += 1;
      dirty = false;
      return { outcome: 'complete' };
    },
  }));
  r.m.notifyChange();
  await r.clock.advance(2000);
  const heldWhilePaused = r.saves === 0;
  paused = false;
  r.m.resume();
  await r.clock.advance(2000);
  // …and a pause no cycle came due under ends with nothing re-opened
  const r2 = bareRig(mod, (rig) => ({
    hasWork: () => true,
    armAtCreation: () => false,
    save: async () => {
      rig.saves += 1;
      return { outcome: 'needs-confirm' };
    },
  }));
  r2.m.resume();
  await r2.clock.advance(5000);
  out.pausedCycleResumes =
    heldWhilePaused && r.saves === 1 && r.m.state().status === 'saved' && r2.saves === 0;

  // R-7 · the convert: an explicit save handed its write to the dialog (needs-confirm); the dialog's
  // own write lands and leaves the card quiet → «saved» and the quiet-card bookkeeping, at once
  dirty = true;
  r = bareRig(mod, () => ({
    hasWork: () => dirty,
    save: async () => ({ outcome: 'needs-confirm', message: 'the purpose change waits' }),
  }));
  r.m.notifyChange(); // the flip itself — this check must not lean on (R-12) arming at creation
  await r.clock.advance(2000);
  const heldForDialog = r.m.state().status === 'needs-confirm';
  dirty = false;
  r.m.settleExternal({ outcome: 'complete' }, 'convert');
  out.externalWriteSettlesStatus =
    heldForDialog && r.m.state().status === 'saved' && r.completes.join() === 'convert';

  // mn-5 · a read judged while the quiet check runs opens the conflict decision: it stands — the cycle
  // neither paints «saving»/«invalid» over it nor writes
  r = bareRig(mod, (rig) => ({
    validate: async () => {
      rig.m.settleExternal({ outcome: 'conflict', message: 'their body moved' }, 'read');
      return { ok: true, errors: 0 };
    },
    save: async () => {
      rig.saves += 1;
      return { outcome: 'complete' };
    },
  }));
  r.m.notifyChange();
  await r.clock.advance(2000);
  out.conflictDuringCheckStands = r.saves === 0 && r.m.state().status === 'conflict';
  return out;
}

// ─── (9) ревью Codex O-60 r4: конфликт раньше паузы, правка во время падающей записи, `off`, причина ─
async function promise9(mod) {
  const out = {};
  // Записи ОТЛОЖЕННЫЕ: каждая ждёт, пока проба сама не скажет её исход.
  const deferredRig = (over = () => ({})) => {
    const pending = [];
    const r = bareRig(mod, (rig) => ({
      save: () => {
        rig.saves += 1;
        (rig.at ??= []).push(rig.clock.now());
        return new Promise((res) => pending.push(res));
      },
      ...over(rig),
    }));
    r.answer = async (result) => {
      pending.shift()(result);
      await r.clock.advance(0);
    };
    return r;
  };

  // P1-1 · a write is out; the convert dialog opens (the page pauses) and its confirm flushes; the write
  // comes back 409 → the flush answers `conflict`, not the pause's `needs-confirm` — nothing more written
  let paused = false;
  let r = deferredRig(() => ({ isPaused: () => paused }));
  r.m.notifyChange();
  await r.clock.advance(2000);
  const inFlight = r.saves === 1 && r.m.state().status === 'saving';
  paused = true;
  const flushed = r.m.flush('convert');
  await r.answer({ outcome: 'conflict', message: 'moved on' });
  const answer = await flushed;
  out.conflictBeatsPause =
    inFlight && answer === 'conflict' && r.saves === 1 && r.m.state().status === 'conflict';

  // P1-3 · the write fails (2 s), the retry goes out at 7 s; an edit at 7.5 s, the retry fails at 8 s
  // → the edit's own debounce writes at 9.5 s, not the next rung (15 s after the failure, at 23 s)
  r = deferredRig();
  r.m.notifyChange();
  await r.clock.advance(2000);
  await r.answer({ outcome: 'error', message: 'down' });
  await r.clock.advance(5000); // 7 s: the first rung
  const retryOut = r.saves === 2;
  await r.clock.advance(500);
  r.m.notifyChange(); // 7.5 s, while the retry is out
  await r.clock.advance(500);
  await r.answer({ outcome: 'error', message: 'down' }); // 8 s: fails AFTER the edit
  await r.clock.advance(1499);
  const notEarly = r.saves === 2;
  await r.clock.advance(1);
  out.editDuringFailingWriteKeepsDebounce =
    retryOut && notEarly && r.saves === 3 && r.at[2] === 9500 && r.m.state().cause === 'failed';

  // …the OPERATOR's change, that is: with gestures wired (the page), a change the page makes itself
  // while the write is out (B-07's stage put back after a failed re-read) takes the ladder rung, 5 s
  // after the failure — and the same change behind a gesture keeps its 2 s debounce
  const gestured = async (withGesture) => {
    const g = deferredRig((rig) => {
      rig.gen = 0;
      return { operatorGen: () => rig.gen };
    });
    g.m.notifyChange();
    await g.clock.advance(2000); // out at 2 s
    if (withGesture) g.gen += 1;
    g.m.notifyChange(); // at 2 s, while it is out
    await g.answer({ outcome: 'error', message: 'down' }); // fails at 2 s
    await g.clock.advance(2000);
    const atDebounce = g.saves;
    await g.clock.advance(3000);
    return { atDebounce, atRung: g.saves, second: g.at[1] };
  };
  const byPage = await gestured(false);
  const byOperator = await gestured(true);
  out.pageOwnChangeTakesTheRung =
    byPage.atDebounce === 1 &&
    byPage.atRung === 2 &&
    byPage.second === 7000 &&
    byOperator.atDebounce === 2 &&
    byOperator.second === 4000;

  // P2-1 · switched off while a write is out (frozen, rights gone): its failure neither paints
  // «not saved» nor arms a retry — and a release's own write, which raises the halt the moment it
  // lands, leaves the machine `off` too
  let enabled = true;
  r = deferredRig(() => ({ isEnabled: () => enabled }));
  r.m.notifyChange();
  await r.clock.advance(2000);
  enabled = false;
  r.m.setEnabled(false);
  await r.answer({ outcome: 'error', message: 'down' });
  await r.clock.advance(60_000);
  const failedLate = r.m.state().status === 'off' && r.clock.pending() === 0 && r.saves === 1;
  let halted = false;
  let work = true;
  const release = deferredRig(() => ({ isEnabled: () => !halted, hasWork: () => work }));
  release.m.notifyChange();
  await release.clock.advance(2000);
  halted = true; // B-08: the halt rises the moment the release's PUT lands
  work = false;
  await release.answer({ outcome: 'complete' });
  await release.clock.advance(60_000);
  out.offSurvivesLateSettle =
    failedLate && release.m.state().status === 'off' && release.clock.pending() === 0;
  // …and that write's bookkeeping still happens: its history, once
  out.releaseWriteStillBooksItsHistory = release.completes.join() === 'debounce';

  // M-2 over P2-1 · the halt lifted (a re-open elsewhere), setEnabled(true) not yet run: the status still
  // reads `off`, and the conflict the page judged on that read is heard — the chip says «conflict»
  let live = false;
  const lifted = bareRig(mod, () => ({ isEnabled: () => live }));
  lifted.m.setEnabled(false);
  live = true; // the render sees the halt gone; the effect that calls setEnabled(true) is still to come
  lifted.m.settleExternal(
    { outcome: 'conflict', message: 'another editor saved this card' },
    'read',
  );
  const heard = lifted.m.state().status === 'conflict';
  lifted.m.setEnabled(true);
  out.conflictHeardOverAStaleOff = heard && lifted.m.state().status === 'conflict';

  // P2-3 · why the card is not saved: the restaged cap says «restaged», a failed write «failed»
  const capped = bareRig(mod, (rig) => ({
    save: async () => {
      rig.saves += 1;
      return { outcome: 'restaged' };
    },
  }));
  capped.m.notifyChange();
  await capped.clock.advance(20_000);
  const failed = bareRig(mod, () => ({
    save: async () => ({ outcome: 'error', message: 'down' }),
  }));
  failed.m.notifyChange();
  await failed.clock.advance(2000);
  out.causeSaysWhy =
    capped.m.state().status === 'error' &&
    capped.m.state().cause === 'restaged' &&
    failed.m.state().status === 'error' &&
    failed.m.state().cause === 'failed';
  return out;
}

// ─── (10) D-66 / D-66′: ЧТО ЗНАЧИТ УПАВШАЯ ЗАПИСЬ — ОДНО МЕСТО ──────────────────────────────────────
async function promise10(mod) {
  const out = {};
  // The page's save throws what api.ts throws: an Error carrying the HTTP status.
  const BACKSTOP = 'this save would erase the assembly units on this tech card';
  const WORDS = {
    401: 'the session has expired',
    403: 'permission denied: tech_cards write',
    412: BACKSTOP,
  };
  const thrower = (status) =>
    bareRig(mod, (rig) => ({
      save: async () => {
        rig.saves += 1;
        (rig.at ??= []).push(rig.clock.now());
        throw Object.assign(new Error(WORDS[status] ?? 'unavailable'), { status });
      },
    }));

  // 412 at 2 s → «not saved» with the server's words, cause `refused`, NO timer: five minutes pass and
  // nothing goes out; the next change writes at its own debounce (and is refused again, held again)
  let r = thrower(412);
  r.m.notifyChange();
  await r.clock.advance(2000);
  const held =
    r.saves === 1 &&
    r.m.state().status === 'error' &&
    r.m.state().cause === 'refused' &&
    mod.refusalOf(r.m.state()) === BACKSTOP &&
    r.clock.pending() === 0;
  await r.clock.advance(300_000);
  const quiet = r.saves === 1;
  r.m.notifyChange(); // 302 s
  await r.clock.advance(1999);
  const notEarly = r.saves === 1;
  await r.clock.advance(1);
  out.refusalHoldsUntilTheNextChange =
    held &&
    quiet &&
    notEarly &&
    r.saves === 2 &&
    r.at[1] === 304_000 &&
    r.m.state().cause === 'refused' &&
    r.clock.pending() === 0;

  // 503 at 2 s → transient: the ladder's first rung writes at 7 s
  r = thrower(503);
  r.m.notifyChange();
  await r.clock.advance(2000);
  const failedAt2 = r.saves === 1 && r.m.state().cause === 'failed' && r.clock.pending() === 1;
  await r.clock.advance(5000);
  out.serverErrorKeepsTheLadder = failedAt2 && r.saves === 2 && r.at[1] === 7000;

  // 429 (the rate limit passes) → the same ladder, not a held refusal
  r = thrower(429);
  r.m.notifyChange();
  await r.clock.advance(2000);
  const limitedAt2 = r.saves === 1 && r.m.state().cause === 'failed' && r.clock.pending() === 1;
  await r.clock.advance(5000);
  out.rateLimitKeepsTheLadder = limitedAt2 && r.saves === 2 && r.at[1] === 7000;

  // 401 / 403 → `off` for the rest of the page life, with the server's words: no timer; five minutes,
  // then a change, a door's flush and ⌘S (an explicit flush skips the quiet check that a status `off`
  // alone would stop) — nothing goes out; the page's own switch (setEnabled) lifts nothing
  const authStop = async (status) => {
    const a = thrower(status);
    a.m.notifyChange();
    await a.clock.advance(2000);
    const st = a.m.state();
    const stopped =
      a.saves === 1 &&
      st.status === 'off' &&
      st.cause === 'auth' &&
      st.message === WORDS[status] &&
      mod.refusalOf(st) === undefined &&
      a.clock.pending() === 0;
    await a.clock.advance(300_000);
    a.m.notifyChange();
    await a.clock.advance(60_000);
    const flushed = await a.m.flush('door');
    const pressed = await a.m.flush('keyboard', 'explicit');
    a.m.setEnabled(false);
    a.m.setEnabled(true);
    await a.clock.advance(60_000);
    return {
      stopped,
      stays:
        a.saves === 1 &&
        flushed === 'off' &&
        pressed === 'off' &&
        a.m.state().status === 'off' &&
        a.m.state().cause === 'auth' &&
        a.m.state().message === WORDS[status] &&
        a.clock.pending() === 0,
    };
  };
  const s403 = await authStop(403);
  const s401 = await authStop(401);
  out.authStopsTheCard = s403.stopped && s401.stopped;
  out.authStopIsTerminal = s403.stays && s401.stays;

  // the one table (D-66′): 401/403 auth, 409 conflict, the network / 408 / 429 / 5xx transient, every
  // other 4xx refused — and a status a panel wrapped into its own sentence (`cause`) counts the same
  const cls = mod.failureClassOf;
  out.whatAFailureIs =
    [401, 403].every((x) => cls(x) === 'auth') &&
    cls(409) === 'conflict' &&
    [undefined, 408, 429, 500, 502, 503, 504].every((x) => cls(x) === 'transient') &&
    [400, 404, 412, 422].every((x) => cls(x) === 'refused');
  const wrap = (status, words) =>
    Object.assign(new Error(`the recipe was not saved: ${words}`), {
      cause: Object.assign(new Error(words), { status }),
    });
  const w412 = mod.failureFieldsOf(wrap(412, 'the colourway moved on its lifecycle'));
  const w503 = mod.failureFieldsOf(wrap(503, 'unavailable'));
  const w403 = mod.failureFieldsOf(wrap(403, 'permission denied'));
  out.wrappedPanelFailureClassified =
    w412.failure === 'refused' &&
    w412.refusalMessage === 'the colourway moved on its lifecycle' &&
    w503.failure === undefined &&
    w403.failure === 'auth' &&
    mod.failureFieldsOf(new Error('network down')).failure === undefined;

  // the page's pipeline says it itself (SaveResult.failure): the same hold — and the words the machine
  // holds are the SERVER's (refusalMessage), not the page's own sentence for the banner (D-66′ P2)
  const RAW = 'proto: (line 1:145): unknown field "chestPiece"';
  r = bareRig(mod, (rig) => ({
    save: async () => {
      rig.saves += 1;
      return {
        outcome: 'error',
        message: 'the backend did not recognise part of this card — see the banner on the card',
        failure: 'refused',
        refusalMessage: RAW,
      };
    },
  }));
  r.m.notifyChange();
  await r.clock.advance(122_000);
  out.pipelineRefusalHolds =
    r.saves === 1 && r.m.state().cause === 'refused' && r.clock.pending() === 0;
  out.refusalKeepsTheServersWords = mod.refusalOf(r.m.state()) === RAW;

  // the convert dialog opens while the write is out (the page pauses), the write is refused, the
  // dialog's flush is skipped by the pause; the dialog closes (resume) — the refused body is not sent
  // again: nothing in five minutes. A change made under the dialog is the next change: it does go out.
  const pausedRig = (edit) => {
    let paused = false;
    const pending = [];
    const rig = bareRig(mod, (g) => ({
      isPaused: () => paused,
      save: () => {
        g.saves += 1;
        return new Promise((res) => pending.push(res));
      },
    }));
    return {
      rig,
      async run() {
        rig.m.notifyChange();
        await rig.clock.advance(2000); // out
        paused = true;
        const flushed = rig.m.flush('convert');
        pending.shift()({ outcome: 'error', message: BACKSTOP, failure: 'refused' });
        await rig.clock.advance(0);
        await flushed;
        if (edit) {
          rig.m.notifyChange();
          await rig.clock.advance(2000); // due under the pause: skipped
        }
        paused = false;
        rig.m.resume();
        await rig.clock.advance(300_000);
        for (const res of pending.splice(0)) res({ outcome: 'complete' });
        await rig.clock.advance(0);
      },
    };
  };
  const quietDialog = pausedRig(false);
  await quietDialog.run();
  const editedDialog = pausedRig(true);
  await editedDialog.run();
  out.pauseEndKeepsTheRefusal =
    quietDialog.rig.saves === 1 &&
    quietDialog.rig.m.state().cause === 'refused' &&
    editedDialog.rig.saves === 2;
  return out;
}

// ─── (11) «ARCHIVE & SWITCH» ЖДЁТ ЗАПИСЬ В ПОЛЁТЕ: ОЖИДАНИЕ И ПРИГОВОР (convert-wait.ts) ─────────────
async function promise11(mod) {
  const out = {};
  const clock = fakeClock();
  const timers = { setTimer: clock.setTimer, clearTimer: clock.clearTimer };
  const MS = mod.CONVERT_WAIT_MS;
  const never = () => new Promise(() => {});
  const later = () => {
    let settle;
    const p = new Promise((res, rej) => (settle = { res, rej }));
    return { p, settle };
  };

  // a write that never settles: the wait answers `timeout` at 15 s — not a moment before — and leaves
  // no timer behind
  let signal = new AbortController();
  let answer = null;
  void mod.waitForTheWrite(never(), signal.signal, MS, timers).then((v) => (answer = v));
  await clock.advance(MS - 1);
  const notYet = answer === null;
  await clock.advance(1);
  out.hungWriteTimesOut = MS === 15_000 && notYet && answer === 'timeout' && clock.pending() === 0;

  // ✕ / Esc / «keep sellable» (the signal) end the wait at once; the write settling later changes nothing
  signal = new AbortController();
  answer = null;
  let w = later();
  void mod.waitForTheWrite(w.p, signal.signal, MS, timers).then((v) => (answer = v));
  await clock.advance(1000);
  signal.abort();
  await clock.advance(0);
  const cancelled = answer;
  w.settle.res('needs-confirm');
  await clock.advance(MS);
  out.cancelEndsTheWait = cancelled === 'aborted' && answer === 'aborted' && clock.pending() === 0;

  // the flush's own answer, when it comes first; a rejected flush is `error`, not a pass
  signal = new AbortController();
  answer = null;
  w = later();
  void mod.waitForTheWrite(w.p, signal.signal, MS, timers).then((v) => (answer = v));
  w.settle.res('needs-confirm');
  await clock.advance(0);
  const passed = answer;
  answer = null;
  w = later();
  void mod.waitForTheWrite(w.p, new AbortController().signal, MS, timers).then((v) => (answer = v));
  w.settle.rej(new Error('boom'));
  await clock.advance(0);
  out.flushAnswersFirst = passed === 'needs-confirm' && answer === 'error' && clock.pending() === 0;

  // the verdict: the one table the confirm acts on
  const v = mod.convertVerdict;
  const live = { mounted: true, saves: true, conflict: false, refusal: undefined };
  const go = (waited, over = {}) => v(waited, { ...live, ...over }).go === true;
  out.archivesOnlyOverTheExpected =
    go('needs-confirm') && go('ok') && go('nothing') && !go('invalid') && !go('busy');
  const t = v('timeout', live);
  out.timeoutKeepsTheDialog =
    t.go === false &&
    t.keep === true &&
    t.say === 'the card is still saving — try the switch again in a moment';
  const off = v('off', live);
  const offLive = v('needs-confirm', { ...live, saves: false });
  const failed = v('error', live);
  out.nothingArchivedOverOff =
    !off.go &&
    !off.keep &&
    off.say === 'nothing was archived — the card stopped saving' &&
    !offLive.go &&
    offLive.say === 'nothing was archived — the card stopped saving' &&
    !failed.go &&
    /could not be saved/.test(failed.say ?? '');
  const gone = v('needs-confirm', { ...live, mounted: false });
  const aborted = v('aborted', live);
  out.nothingArchivedAfterTheLeave =
    !gone.go && gone.say === undefined && !aborted.go && aborted.say === undefined;
  const conflict = v('needs-confirm', { ...live, conflict: true });
  const refused = v('needs-confirm', { ...live, refusal: 'this save would erase…' });
  out.conflictAndRefusalArchiveNothing =
    !conflict.go &&
    /decide the conflict first/.test(conflict.say ?? '') &&
    !v('conflict', live).go &&
    !refused.go &&
    refused.say ===
      'nothing was archived — the server refused the last save: this save would erase…';
  return out;
}

// ─── (12) ТОЧКА СБРОСА (10/10) ПОД АВТОСЕЙВОМ: SETTLE НЕ ШЛЁТ «reset()», ID СТРОК ЖИВУТ ─────────────
function promise12(mod) {
  const out = {};
  const row = (t) => ({
    operationType: t,
    zone: 'TECH_CARD_GARMENT_ZONE_BODY',
    operationNumber: 0,
  });
  const mapped = mod.mapTechCardToForm(PRESS_CARD);
  const form = formFor(mod, { ...mapped, operations: [row('A'), row('B'), row('C')] });
  // what a rendered useFieldArray does on every render (RHF 7.62, useFieldArray: `_names.array.add`)
  form.control._names.array.add('operations');
  const unnamed = [];
  const arrays = [];
  // operations-field.tsx, (10/10): `watch((_, { name }) => { if (name) return; clearFormHistory(); })`
  const w = form.watch((_, info) => {
    if (!info.name) unnamed.push('values');
  });
  // useFieldArray re-mints every id of an array its subject names (or of every array, unnamed)
  const a = form.control._subjects.array.subscribe({ next: (p) => arrays.push(p.name ?? '*') });
  // a) a save that lands with the server's numbers on the same three rows
  let before = structuredClone(form.getValues());
  let server = {
    ...before,
    operations: before.operations.map((o, i) => ({ ...o, operationNumber: (i + 1) * 10 })),
  };
  mod.settleFormAfterSave(form, before, { values: server, server });
  out.settleSendsNoResetSignal =
    unnamed.length === 0 && form.getValues('operations.1.operationNumber') === 20;
  out.sameLengthRowsKeepTheirIds = arrays.length === 0;
  // b) an untouched list whose length differs from what landed is written whole — that list alone
  // re-mints its ids (the one case), and still no reset signal
  form.control._names.array.add('operations');
  unnamed.length = 0;
  arrays.length = 0;
  before = structuredClone(form.getValues());
  server = { ...before, operations: before.operations.slice(0, 2) };
  mod.settleFormAfterSave(form, before, { values: server, server });
  out.lengthChangeRemintsThatListOnly =
    unnamed.length === 0 &&
    arrays.join() === 'operations' &&
    form.getValues('operations').length === 2;
  w.unsubscribe();
  a.unsubscribe();
  return out;
}

// ─── (8) хелперы записи: anyDirty / чей отказ / сдвинулось ли тело / работа тела (m4 / m2 / M-3 / M2) ─
const tick = () => new Promise((r) => setTimeout(r, 5));
const conflict409 = () => Promise.reject(Object.assign(new Error('moved on'), { status: 409 }));
const BODY_CARD = (tc = {}, top = {}) => ({
  id: 7,
  lockVersion: 3,
  techCard: {
    name: 'parka',
    styleNumber: 'ST-042',
    stage: 'TECH_CARD_STAGE_IDEA',
    approvalState: 'TECH_CARD_APPROVAL_STATE_DRAFT',
    concept: 'mine',
    ...tc,
  },
  ...top,
});

async function promise8(mod) {
  const out = {};
  // m4 · RHF's full map after a field-array operation: nothing dirty under `moodboardMedia: []`
  out.fullMapEmptyArrayIsClean =
    !mod.anyDirty({ moodboardMedia: [], name: false, pieces: [{ name: false }] }) &&
    mod.anyDirty({ pieces: [{ name: false }, { area: true }] });

  // m2 · the failure a panel re-throws is read in its own task; another mutation's 409 a moment
  // earlier, and a panel failing before any mutation, find nothing
  const qc = new mod.QueryClient();
  const cache = qc.getMutationCache();
  const w = mod.watchOwnFailure(cache);
  const panel = async () => {
    try {
      await cache.build(qc, { mutationFn: conflict409, retry: false }).execute();
    } catch (e) {
      throw new Error(`the recipe was not saved: ${e.message}`); // the panels' rewrap, no status
    }
  };
  let own = null;
  try {
    await panel();
  } catch {
    own = w.current();
  }
  await cache
    .build(qc, { mutationFn: conflict409, retry: false })
    .execute()
    .catch(() => {});
  await tick();
  const failedWithoutMutation = async () => {
    await tick();
    throw new Error('the colourway version could not be read');
  };
  let foreign = 'unread';
  try {
    await failedWithoutMutation();
  } catch {
    foreign = w.current();
  }
  // D-66′: …and the status it failed with, for a rewrap that kept no `cause` (a 412 of the recipe)
  const refused412 = () =>
    Promise.reject(
      Object.assign(new Error('the colourway moved on its lifecycle'), { status: 412 }),
    );
  let own412 = null;
  try {
    try {
      await cache.build(qc, { mutationFn: refused412, retry: false }).execute();
    } catch (e) {
      throw new Error(`the recipe was not saved: ${e.message}`);
    }
  } catch {
    own412 = w.current();
  }
  w.stop();
  out.ownFailureOnlyInItsTask = own?.conflict === true && foreign === null;
  out.ownFailureKeepsItsStatus =
    own?.status === 409 &&
    own412?.status === 412 &&
    own412?.conflict === false &&
    mod.failureClassOf(own412?.status) === 'refused' &&
    own412?.message === 'the colourway moved on its lifecycle';

  // M-3 · two readings of the card: only what a body write would carry counts as a move
  const from = BODY_CARD({
    costing: { currency: 'EUR', notes: 'as read' },
    bomItems: [{ name: 'shell' }],
  });
  const bump = (tc, top) => BODY_CARD({ ...from.techCard, ...tc }, { lockVersion: 4, ...top });
  out.satelliteBumpIsNoMove = !mod.bodyMoved(
    from,
    bump({}, { colorways: [{ colorwayId: 1 }], markers: [{ id: 2 }] }),
    true,
  );
  out.foreignConceptIsAMove = mod.bodyMoved(from, bump({ concept: 'theirs' }), true);
  out.styleFactIsNoMove = !mod.bodyMoved(
    from,
    bump({ brand: 'ACME', skuSeason: { code: 'SEASON_ENUM_FW', year: 2027 } }),
    true,
  );
  out.costingByWhoWritesIt =
    !mod.bodyMoved(from, bump({ costing: { currency: 'EUR', notes: 'theirs' } }), false) &&
    mod.bodyMoved(from, bump({ costing: { currency: 'EUR', notes: 'theirs' } }), true);
  out.keylessRowsCompare = !mod.bodyMoved(from, bump({}), true);

  // mn-1 · no card read back after this page's own write: the body it SENT stands in for it — a later
  // reading with that body (a panel's bump on top) is no move; another editor's concept is
  const echo = from.techCard;
  const sentValues = mod.mapTechCardToForm(from);
  sentValues.name = 'parka 2';
  const sentBody = mod.formOnTheWire(sentValues, echo, true);
  // what the server keeps is what was sent (its row keys included), under a panel's bump
  const readBack = {
    ...from,
    lockVersion: 5,
    colorways: [{ colorwayId: 1 }],
    techCard: mod.mapFormToTechCardInsert(sentValues, echo, true),
  };
  const theirsOnTop = {
    ...readBack,
    lockVersion: 6,
    techCard: { ...readBack.techCard, concept: 'theirs' },
  };
  out.sentBodyIsNoMove =
    mod.deepEqual(mod.bodyOnTheWire(readBack, echo, true), sentBody) &&
    !mod.deepEqual(mod.bodyOnTheWire(theirsOnTop, echo, true), sentBody);

  // M2 · a style fact is not the body's work; any other field is
  const form = formFor(mod, mod.mapTechCardToForm(BODY_CARD()));
  form.setValue('fit', 'FIT_SLIM', { shouldDirty: true });
  const styleOnly = mod.liveIsDirty(form) && !mod.bodyWorkOf(form);
  form.setValue('name', 'parka 2', { shouldDirty: true });
  out.styleFactIsNotBodyWork = styleOnly && mod.bodyWorkOf(form);
  return out;
}

// ─── прогон ─────────────────────────────────────────────────────────────────────────────────
let fail = 0;
const report = (title, results, mustFail = []) => {
  for (const [name, ok] of Object.entries(results)) {
    const expected = !mustFail.includes(name);
    const good = ok === expected;
    if (!good) fail++;
    const tag = mustFail.includes(name)
      ? ok
        ? '✗ STILL GREEN on mutant'
        : '✓ red on mutant'
      : ok
        ? '✓'
        : '✗';
    if (!good || mustFail.includes(name)) console.log(`${tag}  ${title} · ${name}`);
    else console.log(`${tag}  ${title} · ${name}`);
  }
};

const real = await load('none');
report('(1) autosave', await promise1(real));
report('(2) auto-stage', promise2(real));
report('(3) restore', promise3(real));
report('(4) flush over deferred writes', await promise4(real));
report('(5) conflict / revert / dispose', await promise5(real));
report('(6) settle after a save (real RHF, real mapper)', promise6(real));
report('(7) restaged cap / busy / work before the machine / external write', await promise7(real));
report('(8) anyDirty / own failure / body moved / body work', await promise8(real));
report(
  '(9) O-60 r4: conflict before pause / edit during a failing write / off / cause',
  await promise9(real),
);
report(
  '(10) D-66 / D-66′: auth stops, a refusal holds, a 503 / 429 retries',
  await promise10(real),
);
report('(11) the convert wait and its verdict', await promise11(real));
report('(12) the reset point (10/10) under the autosave', promise12(real));
// sanity for the shortcut: ⌘S on a Russian layout gives e.key 'ы' — the physical key decides
const kb = real.isSaveShortcut;
report('keyboard', {
  cmdS: kb({ metaKey: true, ctrlKey: false, altKey: false, code: 'KeyS', key: 's' }),
  ctrlS: kb({ metaKey: false, ctrlKey: true, altKey: false, code: 'KeyS', key: 's' }),
  cmdS_ruLayout: kb({ metaKey: true, ctrlKey: false, altKey: false, code: 'KeyS', key: 'ы' }),
  plainS_isNot: !kb({ metaKey: false, ctrlKey: false, altKey: false, code: 'KeyS', key: 's' }),
});

console.log('\n── negative controls (mutants): the named check MUST turn red ──');
report('(1) mutant debounce0', await promise1(await load('debounce0')), [
  'notBefore2s',
  'firesAt2s',
  'savedStatus',
  'restartsOnEachEdit',
  'oneWriteAfterQuiet',
]);
report('(1) mutant noValidate', await promise1(await load('noValidate')), [
  'noWriteWhileInvalid',
  'invalidStatus',
  'writesOnceFixed',
]);
report('(2) mutant noUnknownGuard', promise2(await load('noUnknownGuard')), [
  'unknownFlagItselfHolds',
]);
report('(3) mutant restoreDropsPictures', promise3(await load('restoreDropsPictures')), [
  'picturesStayCurrent',
  'rowWithPicturesKeepsThem',
]);
report('(3) mutant restoreKeepsEmptyRows', promise3(await load('restoreKeepsEmptyRows')), [
  'addedTextOnlyRowDropped',
]);
report('(4) mutant flushAnswersEarly', await promise4(await load('flushAnswersEarly')), [
  'pendingAfterFirstPass',
  'pendingAfterSecondPass',
  'answersOverQuietCard',
  // the flush gave up the drain, so the quiet pass (and its one history row) never came in A
  'historyOnceQuiet',
  'pendingAfterQueuedPass',
  'queuedAnswersOverQuietCard',
]);
report('(4) mutant completeOverWork', await promise4(await load('completeOverWork')), [
  'noHistoryOverWork',
  'historyOnceQuiet',
]);
report('(5) mutant conflictLetsExplicit', await promise5(await load('conflictLetsExplicit')), [
  'conflictHoldsExplicit',
  // ⌘S already wrote under the modal, so «keep mine» is the third write, not the second
  'keepMineWrites',
]);
report('(5) mutant restOnlyDirty', await promise5(await load('restOnlyDirty')), [
  'revertClearsInvalid',
]);
report('(5) mutant noDisposeGuard', await promise5(await load('noDisposeGuard')), [
  'noRenderAfterDispose',
  'noTimerAfterDispose',
]);
report('(6) mutant baselineFromServer', promise6(await load('baselineFromServer')), [
  'jsonRestoredQuietAfterSave',
]);
report('(6) mutant fullDirtyMap', promise6(await load('fullDirtyMap')), ['dirtyMapIsSparse']);
report('(7) mutant streakIgnoresGestures', await promise7(await load('streakIgnoresGestures')), [
  'steadyPanelEditsNeverCapped',
]);
report('(7) mutant flushSaysError', await promise7(await load('flushSaysError')), [
  'neverQuietFlushIsBusy',
]);
report('(7) mutant capSaysError', await promise7(await load('capSaysError')), [
  'flushOnTheCapIsBusy',
]);
report('(7) mutant noArmAtCreation', await promise7(await load('noArmAtCreation')), [
  'workBeforeMachineIsWritten',
  'mountDirtWaitsForAPerson',
]);
report('(7) mutant externalIgnored', await promise7(await load('externalIgnored')), [
  'externalWriteSettlesStatus',
  // the mn-5 check puts the machine into conflict through the same door
  'conflictDuringCheckStands',
]);
report('(7) mutant mountDirtArmed', await promise7(await load('mountDirtArmed')), [
  'mountDirtWaitsForAPerson',
  'pausedCycleResumes',
]);
report('(7) mutant noResume', await promise7(await load('noResume')), ['pausedCycleResumes']);
report('(7) mutant noRetryStep', await promise7(await load('noRetryStep')), [
  'retryStepAfterLadder',
]);
report('(7) mutant capStopsSaving', await promise7(await load('capStopsSaving')), [
  'selfRestagingStillCapped',
]);
report('(7) mutant changeWaitsForTheStep', await promise7(await load('changeWaitsForTheStep')), [
  'changeDoesNotWaitForTheStep',
]);
report(
  '(7) mutant conflictDuringCheckOverwritten',
  await promise7(await load('conflictDuringCheckOverwritten')),
  ['conflictDuringCheckStands'],
);
report('(9) mutant pauseBeforeConflict', await promise9(await load('pauseBeforeConflict')), [
  'conflictBeatsPause',
]);
// the operator's change (with a gesture) loses its debounce too — two checks, one rule
report('(9) mutant failureTakesLadder', await promise9(await load('failureTakesLadder')), [
  'editDuringFailingWriteKeepsDebounce',
  'pageOwnChangeTakesTheRung',
]);
report(
  '(9) mutant pageChangeKeepsDebounce',
  await promise9(await load('pageChangeKeepsDebounce')),
  ['pageOwnChangeTakesTheRung'],
);
report(
  '(9) mutant staleOffSwallowsTheReport',
  await promise9(await load('staleOffSwallowsTheReport')),
  ['conflictHeardOverAStaleOff'],
);
report('(9) mutant settleOverOff', await promise9(await load('settleOverOff')), [
  'offSurvivesLateSettle',
]);
report('(9) mutant offDropsBookkeeping', await promise9(await load('offDropsBookkeeping')), [
  'releaseWriteStillBooksItsHistory',
]);
report('(9) mutant capBlamesAFailure', await promise9(await load('capBlamesAFailure')), [
  'causeSaysWhy',
]);
// without the hold nothing is `refused`, so the pause's end re-sends too — three checks, one cause
report('(10) mutant refusalRidesLadder', await promise10(await load('refusalRidesLadder')), [
  'refusalHoldsUntilTheNextChange',
  'pipelineRefusalHolds',
  'refusalKeepsTheServersWords',
  'pauseEndKeepsTheRefusal',
]);
report('(10) mutant catchNeverRefuses', await promise10(await load('catchNeverRefuses')), [
  'refusalHoldsUntilTheNextChange',
  'authStopsTheCard',
  'authStopIsTerminal',
]);
report('(10) mutant everyThrowRefused', await promise10(await load('everyThrowRefused')), [
  'serverErrorKeepsTheLadder',
  'rateLimitKeepsTheLadder',
  'authStopsTheCard',
  'authStopIsTerminal',
]);
report('(10) mutant rateLimitRefused', await promise10(await load('rateLimitRefused')), [
  'rateLimitKeepsTheLadder',
  'whatAFailureIs',
]);
report('(10) mutant resumeResendsRefusal', await promise10(await load('resumeResendsRefusal')), [
  'pauseEndKeepsTheRefusal',
]);
report('(10) mutant authHeldAsRefusal', await promise10(await load('authHeldAsRefusal')), [
  'authStopsTheCard',
  'authStopIsTerminal',
  'whatAFailureIs',
  'wrappedPanelFailureClassified',
]);
report(
  '(10) mutant authHearsTheNextChange',
  await promise10(await load('authHearsTheNextChange')),
  ['authStopIsTerminal'],
);
report(
  '(10) mutant authLiftedBySetEnabled',
  await promise10(await load('authLiftedBySetEnabled')),
  ['authStopIsTerminal'],
);
report('(10) mutant refusalWordsReplaced', await promise10(await load('refusalWordsReplaced')), [
  'refusalKeepsTheServersWords',
]);
report('(10) mutant wrappedStatusLost', await promise10(await load('wrappedStatusLost')), [
  'wrappedPanelFailureClassified',
]);
report('(11) mutant waitUnbounded', await promise11(await load('waitUnbounded')), [
  'hungWriteTimesOut',
]);
report('(11) mutant waitIgnoresCancel', await promise11(await load('waitIgnoresCancel')), [
  'cancelEndsTheWait',
]);
report('(11) mutant timeoutClosesDialog', await promise11(await load('timeoutClosesDialog')), [
  'timeoutKeepsTheDialog',
]);
report('(11) mutant archiveOverOff', await promise11(await load('archiveOverOff')), [
  'archivesOnlyOverTheExpected',
  'nothingArchivedOverOff',
]);
report('(11) mutant archiveAfterUnmount', await promise11(await load('archiveAfterUnmount')), [
  'nothingArchivedAfterTheLeave',
]);
// the old post-save reset whole: the reset signal AND every list's ids re-minted — all three go red
report('(12) mutant settleResetsValues', promise12(await load('settleResetsValues')), [
  'settleSendsNoResetSignal',
  'sameLengthRowsKeepTheirIds',
  'lengthChangeRemintsThatListOnly',
]);
report('(8) mutant anyDirtyArrays', await promise8(await load('anyDirtyArrays')), [
  'fullMapEmptyArrayIsClean',
]);
report('(8) mutant failureOutlivesItsTask', await promise8(await load('failureOutlivesItsTask')), [
  'ownFailureOnlyInItsTask',
]);
report(
  '(8) mutant ownFailureForgetsStatus',
  await promise8(await load('ownFailureForgetsStatus')),
  ['ownFailureKeepsItsStatus'],
);
report('(8) mutant bodyNeverMoves', await promise8(await load('bodyNeverMoves')), [
  'foreignConceptIsAMove',
  'costingByWhoWritesIt',
]);
report('(8) mutant keysNotPinned', await promise8(await load('keysNotPinned')), [
  'satelliteBumpIsNoMove',
  'styleFactIsNoMove',
  'costingByWhoWritesIt',
  'keylessRowsCompare',
]);
report('(8) mutant styleOwnedCounted', await promise8(await load('styleOwnedCounted')), [
  'styleFactIsNoMove',
]);
report('(8) mutant styleFactsAreBodyWork', await promise8(await load('styleFactsAreBodyWork')), [
  'styleFactIsNotBodyWork',
]);

console.log(
  fail === 0 ? '\nALL GREEN (real code) · ALL MUTANTS CAUGHT' : `\n${fail} UNEXPECTED RESULT(S)`,
);
process.exit(fail === 0 ? 0 : 1);
