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
//       она восстановлена из черновика-JSON (у профиля пресса без пара ключа `pressSteam` там нет, а
//       маппер отдаёт его присутствующим `undefined`); карта грязного — разреженная (R-8). Настоящий
//       RHF (createFormControl) и настоящий маппер схемы;
//   (8) хелперы записи: «грязно ли что-то под узлом» по полной карте RHF (m4); отказ панели — только
//       её собственный, в той же задаче (m2); сдвинулось ли ТЕЛО между двумя чтениями карточки (M-3);
//       работа тела формы без фактов стиля (M2);
//   (7) панель, которую правят во время каждого её коммита, не упирается в потолок `restaged` —
//       потолок держит только панель, перестейдживающую саму себя (R-9); flush, не дождавшийся
//       тишины, отвечает `busy` (R-10); работа, возникшая раньше машины, взводится при создании
//       (R-12); запись, которую вела не машина, заканчивает её статус там же, где кончилась (R-7);
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
  // (6a) ОТКАТ R-1: база нетронутого ключа снова с сервера — форма из JSON-черновика «грязна» навсегда
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
      '      mapTechCardToForm(pinRowKeys(card)),',
      '      mapTechCardToForm(card),',
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
      '      if (disposed || !deps.isEnabled()) return;\n      settle(r, reason);\n',
      '      if (disposed || !deps.isEnabled() || reason) return;\n      settle(r, reason);\n',
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
// ПРИСУТСТВУЮЩИМ ключом (schema.ts), а черновик — JSON, и у восстановленной формы ключа нет вовсе.
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
  // b) the same card restored from a JSON draft: dirty by key presence alone, quiet after one save
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
  out.selfRestagingStillCapped =
    r.saves === 4 && r.m.state().status === 'error' && r.m.state().retrying === false;
  // …and a paid door's flush that runs into that cap hears `busy`: nothing failed, the panel kept moving
  r = restaged(false);
  const capped = await r.m.flush('paid door');
  out.flushOnTheCapIsBusy = capped === 'busy' && r.saves === 4 && r.m.state().status === 'error';

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
  w.stop();
  out.ownFailureOnlyInItsTask = own?.conflict === true && foreign === null;

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
]);
report('(7) mutant mountDirtArmed', await promise7(await load('mountDirtArmed')), [
  'mountDirtWaitsForAPerson',
  'pausedCycleResumes',
]);
report('(7) mutant noResume', await promise7(await load('noResume')), ['pausedCycleResumes']);
report('(8) mutant anyDirtyArrays', await promise8(await load('anyDirtyArrays')), [
  'fullMapEmptyArrayIsClean',
]);
report('(8) mutant failureOutlivesItsTask', await promise8(await load('failureOutlivesItsTask')), [
  'ownFailureOnlyInItsTask',
]);
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
