#!/usr/bin/env node
// Прогон записи последнего жеста — чистой половины отмены глубины 1 (Ф4).
//
// Отмена здесь инвертирует ЖЕСТ, а не восстанавливает снимок формы, и обе её ошибки тихие:
//
//   • запись, сделанная синхронно из `fields[at]?.id`, несёт `undefined` (RHF отдаёт новую строку
//     только следующим рендером) — guard отказывает всегда, и чип живёт мёртвым;
//   • запись без guard по `fieldId` переживает перестановку строк и ресет формы после save — и
//     `removeOperation(index)` удаляет ЧУЖОЙ шаг, молча.
//
// Плюс девять точек сброса: пропуск любой оставляет протухшую запись, и устаревший ⌘Z сносит не то.
// Точки моделируются вызовами reset-функции — в компоненте это ровно один и тот же `clear`.
//
//   node scripts/last-mutation-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/last-mutation-probe-entry.ts');

const outfile = resolve(tmpdir(), `last-mutation-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const { resolvePending, canUndo, undoTitle, appendLabel, dissolveLabel } = await import(
  pathToFileURL(outfile).href
);

let checks = 0;
const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const j = (v) => JSON.stringify(v);
const is = (name, got, want) => {
  checks++;
  if (j(got) !== j(want)) fail(name, `${j(got)} ≠ ${j(want)}`);
};
const yes = (name, got) => is(name, got, true);
const no = (name, got) => is(name, got, false);

/** Строки `useFieldArray` — модулю от них нужен только устойчивый id. */
const rows = (...ids) => ids.map((id) => ({ id }));
/** Форма, у которой ни один шаг ничего не собирает. */
const noUnits = () => '';

// --- подписи --------------------------------------------------------------------------------------
console.log('подписи жестов — номер ЭКРАННЫЙ, (i + 1) * 10');

is('первый шаг — 10', appendLabel(0), 'create step 10');
is('девятый шаг — 90', appendLabel(8), 'create step 90');
is('растворение называет узел', dissolveLabel('SHELL'), 'dissolve ▣ SHELL');
is('чип без записи', undoTitle(null), 'nothing to undo');
is(
  'чип называет жест создания',
  undoTitle({ kind: 'append', index: 8, fieldId: 'r9', label: appendLabel(8) }),
  'undo — create step 90',
);
is(
  'чип называет жест растворения',
  undoTitle({
    kind: 'dissolve',
    index: 2,
    fieldId: 'r3',
    unitKey: 'SHELL',
    unitName: 'корпус',
    label: dissolveLabel('SHELL'),
  }),
  'undo — dissolve ▣ SHELL',
);

// --- resolvePending -------------------------------------------------------------------------------
console.log('\nresolvePending — дозаполнение id вторым тактом');

const pending = { kind: 'append', index: 2, expectedLength: 3, label: appendLabel(2) };

// ДЛИНА СОВПАЛА: append состоялся, и строка по адресу — та самая новая.
is('совпавшая длина дозаполняет id', resolvePending(pending, rows('r1', 'r2', 'r3')), {
  kind: 'append',
  index: 2,
  fieldId: 'r3',
  label: 'create step 30',
});

// ДЛИНА НЕ ТА — дозаполнять нечем. Между мутатором и эффектом успела пройти чужая мутация; запись
// с чужим id указывала бы на шаг, которого этот жест не создавал.
is('длина короче — сброс', resolvePending(pending, rows('r1', 'r2')), null);
is('длина длиннее — сброс', resolvePending(pending, rows('r1', 'r2', 'r3', 'r4')), null);
is('пустой массив — сброс', resolvePending(pending, []), null);

// СИНХРОННОЕ ЧТЕНИЕ `fields[at]?.id` ДАЛО БЫ ЭТО. Массив ДО append короче ровно на строку — и
// запись, сделанная в мутаторе, была бы записью в никуда.
is(
  'снимок ДО append (та самая ловушка) — сброс',
  resolvePending(pending, rows('r1', 'r2')),
  null,
);

// Строка по адресу есть, но без id (битое состояние) — тоже сброс, а не запись с undefined.
is('строка без id — сброс', resolvePending(pending, [{ id: 'r1' }, { id: 'r2' }, { id: '' }]), null);

// Первый шаг карточки: append в пустой массив.
is(
  'append в пустую карточку',
  resolvePending({ kind: 'append', index: 0, expectedLength: 1, label: appendLabel(0) }, rows('r1')),
  { kind: 'append', index: 0, fieldId: 'r1', label: 'create step 10' },
);

// --- canUndo: append ------------------------------------------------------------------------------
console.log('\ncanUndo (append) — тождество строки, а не её наличие');

const APP = { kind: 'append', index: 2, fieldId: 'r3', label: appendLabel(2) };

yes('живой id по адресу', canUndo(APP, rows('r1', 'r2', 'r3'), noUnits));

// РЕСЕТ ФОРМЫ ПОСЛЕ SAVE. Длина та же, индекс тот же, id — новые: отмена обязана отказать, а не
// удалить шаг из СОХРАНЁННОЙ карточки.
no('после ресета формы (другие id)', canUndo(APP, rows('n1', 'n2', 'n3'), noUnits));

// ПЕРЕСТАНОВКА СТРОК. Тот же набор id, другой порядок — по адресу теперь ЧУЖОЙ шаг.
no('после перестановки строк', canUndo(APP, rows('r3', 'r1', 'r2'), noUnits));
no('шаг уехал на соседний адрес', canUndo(APP, rows('r1', 'r3', 'r2'), noUnits));

// Строку удалили руками — отменять нечего.
no('строки больше нет', canUndo(APP, rows('r1', 'r2'), noUnits));
no('массив опустел', canUndo(APP, [], noUnits));

// Соседний шаг дописали ПОСЛЕ созданного: адрес и id на месте — отмена всё ещё честна.
yes('дописали шаг следом', canUndo(APP, rows('r1', 'r2', 'r3', 'r4'), noUnits));

// Отрицательный адрес не разбирается вовсе: он бывает только у битой записи.
no('отрицательный адрес', canUndo({ ...APP, index: -1 }, rows('r1', 'r2', 'r3'), noUnits));

// --- canUndo: dissolve ----------------------------------------------------------------------------
console.log('\ncanUndo (dissolve) — плюс «узел всё ещё растворён»');

const DIS = {
  kind: 'dissolve',
  index: 1,
  fieldId: 'r2',
  unitKey: 'SHELL',
  unitName: 'корпус',
  label: dissolveLabel('SHELL'),
};

yes('узел растворён — отмена честна', canUndo(DIS, rows('r1', 'r2', 'r3'), noUnits));

// ШАГУ ВЕРНУЛИ ВЫХОД — руками или новым жестом. Вернуть поверх старый код значит переписать чужую
// работу, а не отменить свою.
no('шаг снова собирает узел', canUndo(DIS, rows('r1', 'r2', 'r3'), (i) => (i === 1 ? 'BODY' : '')));
no(
  'шагу вернули ТОТ ЖЕ код',
  canUndo(DIS, rows('r1', 'r2', 'r3'), (i) => (i === 1 ? 'SHELL' : '')),
);
// ПРОБЕЛЫ — НЕ КОД УЗЛА, и щит обязан читать их так же, как движок сборки: тот сравнивает
// `outputUnitKey.trim()`, то есть шаг с одними пробелами ничего не собирает. Прочитай щит строку
// буквально — и отмена отказала бы на шаге, который по всем прочим правилам растворён.
yes(
  'одни пробелы — всё ещё растворён',
  canUndo(DIS, rows('r1', 'r2', 'r3'), (i) => (i === 1 ? '   ' : '')),
);
// Чужой шаг с кодом на отмену не влияет: вопрос задаётся ровно про записанный адрес.
yes(
  'код у соседнего шага не мешает',
  canUndo(DIS, rows('r1', 'r2', 'r3'), (i) => (i === 1 ? '' : 'X')),
);

// Тождество строки проверяется и здесь — первым.
no('после ресета формы', canUndo(DIS, rows('n1', 'n2', 'n3'), noUnits));
no('после перестановки', canUndo(DIS, rows('r2', 'r1', 'r3'), noUnits));

// --- девять точек сброса --------------------------------------------------------------------------
console.log('\nдевять точек сброса — пропуск любой оставляет протухшую запись');

/**
 * Модель ref-а из `operations-field.tsx`: одна запись, один `clear`. В компоненте `clear` зовут
 * девять мест; здесь они перечислены поимённо, чтобы список нельзя было укоротить незаметно.
 */
function recorder() {
  let rec = null;
  let pend = null;
  return {
    get record() {
      return rec;
    },
    appendStep(index, length) {
      pend = { kind: 'append', index, expectedLength: length, label: appendLabel(index) };
    },
    /** Эффект на `[fields]`: второй такт. */
    settle(fields) {
      if (!pend) return;
      const p = pend;
      pend = null;
      rec = resolvePending(p, fields);
    },
    dissolveUnit(index, fields, unitKey, unitName) {
      rec = {
        kind: 'dissolve',
        index,
        fieldId: fields[index]?.id ?? '',
        unitKey,
        unitName,
        label: dissolveLabel(unitKey),
      };
    },
    clear() {
      rec = null;
      pend = null;
    },
  };
}

/** ДЕВЯТЬ ТРИГГЕРОВ, поимённо: шесть структурных + добор детали + focusin дока + эффект frozen. */
const RESETS = [
  'removeOperation',
  'insertAfter',
  'moveOperation',
  'эффект addRequest',
  'acceptGeneratedOperations',
  'addOperation',
  'addInputToOperation',
  'focusin в доке',
  'эффект frozen',
];

is('точек сброса ровно девять', RESETS.length, 9);

for (const name of RESETS) {
  const r = recorder();
  r.appendStep(2, 3);
  r.settle(rows('r1', 'r2', 'r3'));
  checks++;
  if (!r.record) fail(`${name}: запись до сброса`, 'записи нет — сбрасывать нечего, случай пуст');
  r.clear(); // ← это и есть точка сброса
  is(`${name} сбрасывает запись`, r.record, null);
}

// ЗАПИСЬ ПЕРЕЖИВАЕТ НЕСВЯЗАННЫЕ ВЫЗОВЫ. Отмена, умирающая от любого чиха, не отменяет ничего: чип
// гаснет раньше, чем человек до него дотянется.
{
  const r = recorder();
  r.appendStep(1, 2);
  r.settle(rows('r1', 'r2'));
  // Ни один из этих тактов точкой сброса не является: пере-рендер, наведение, панорама, выбор шага.
  r.settle(rows('r1', 'r2'));
  r.settle(rows('r1', 'r2'));
  is('запись пережила лишние такты эффекта', r.record, {
    kind: 'append',
    index: 1,
    fieldId: 'r2',
    label: 'create step 20',
  });
  yes('и осталась отменяемой', canUndo(r.record, rows('r1', 'r2'), noUnits));
}

// СБРОС ПОЛУЗАПИСИ. Точка сброса, сработавшая МЕЖДУ мутатором и эффектом, обязана убить и pending:
// иначе следующий такт дозаполнит её id шага, которого этот жест не создавал.
{
  const r = recorder();
  r.appendStep(2, 3);
  r.clear();
  r.settle(rows('r1', 'r2', 'r3'));
  is('сброс между тактами убивает полузапись', r.record, null);
}

// РАСТВОРЕНИЕ ПИШЕТСЯ СИНХРОННО: у него `fieldId` доступен сразу, второго такта не нужно.
{
  const r = recorder();
  const fields = rows('r1', 'r2', 'r3');
  r.dissolveUnit(1, fields, 'SHELL', 'корпус');
  is('растворение записано одним тактом', r.record, {
    kind: 'dissolve',
    index: 1,
    fieldId: 'r2',
    unitKey: 'SHELL',
    unitName: 'корпус',
    label: 'dissolve ▣ SHELL',
  });
  yes('и отменяемо', canUndo(r.record, fields, noUnits));
  r.clear();
  is('и сбрасывается', r.record, null);
}

// ВТОРОЙ ЖЕСТ ВЫТЕСНЯЕТ ПЕРВЫЙ — глубина ровно одна.
{
  const r = recorder();
  r.appendStep(0, 1);
  r.settle(rows('r1'));
  r.dissolveUnit(0, rows('r1'), 'SHELL', 'корпус');
  is('вторая запись вытеснила первую', r.record.kind, 'dissolve');
  r.appendStep(1, 2);
  r.settle(rows('r1', 'r2'));
  is('третья вытеснила вторую', r.record.kind, 'append');
}

// --- итог -----------------------------------------------------------------------------------------
console.log(
  failed.size === 0
    ? `\n${checks} из ${checks} проверок прошло`
    : `\n${failed.size} провалов из ${checks} проверок`,
);
process.exit(failed.size === 0 ? 0 : 1);
