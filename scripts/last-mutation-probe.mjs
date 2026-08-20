#!/usr/bin/env node
// Прогон ИСТОРИИ ЖЕСТОВ — чистой половины отмены (Т5, раунд 2).
//
// Отмена здесь инвертирует ЖЕСТ, а не восстанавливает снимок формы, и её ошибки тихие:
//
//   • запись, сделанная синхронно из `fields[at]?.id`, несёт `undefined` (RHF отдаёт новую строку
//     только следующим рендером) — guard отказывает всегда, и чип живёт мёртвым;
//   • запись без guard по `fieldId` переживает перестановку строк и ресет формы после save — и
//     `removeOperation(index)` удаляет ЧУЖОЙ шаг, молча;
//   • история, где раскладка и последовательность лежат в РАЗНЫХ стопках, теряет порядок жестов:
//     «создал шаг → подвигал ноды → ⌘Z» сносит созданный шаг, хотя человек отменял перестановку.
//     Ровно на этом упёрся владелец, и ровно поэтому стопка одна;
//   • сброс, срезающий историю СКОПОМ, уносит вместе с формовыми записями и раскладочные — и
//     подвинутый на выпущенной карточке блок вернуть уже нечем, хотя раскладывать её законно.
//
// Плюс десять точек сброса: пропуск любой оставляет протухшую формовую запись, и устаревший ⌘Z
// сносит не то. Точки моделируются вызовами `clearForm` — в компоненте это ровно один и тот же
// `clearFormHistory`.
//
// ЧЕГО ПРОБА НЕ ДОКАЗЫВАЕТ: ни одной клавиши и ни одного жеста мышью тут нет. Достижимость ⌘Z,
// возврат фокуса после порталов и то, что перетаскивание не взводит `isDirty`, проверяются
// браузерным стендом — чистая арифметика об этом ничего не знает.
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
const {
  HISTORY_DEPTH,
  appendLabel,
  canRedo,
  canUndo,
  dissolveLabel,
  dropForm,
  dropMove,
  dropRedoTop,
  emptyHistory,
  isFormEntry,
  moveLabel,
  peekRedo,
  peekUndo,
  pushUndo,
  record,
  redoStep,
  redoTitle,
  renameLabel,
  resolvePending,
  undoStep,
  undoTitle,
} = await import(pathToFileURL(outfile).href);

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
/** Строка формы: модулю она непрозрачна, он только возит её от жеста к повтору. */
const row = (u = '') => ({ outputUnitKey: u });

// --- подписи --------------------------------------------------------------------------------------
console.log('подписи жестов — номер ЭКРАННЫЙ, (i + 1) * 10');

is('первый шаг — 10', appendLabel(0), 'create step 10');
is('девятый шаг — 90', appendLabel(8), 'create step 90');
is('растворение называет узел', dissolveLabel('SHELL'), 'dissolve ▣ SHELL');
// РАСКЛАДКА НАЗЫВАЕТСЯ СЧЁТОМ, а не именем ноды: мультидраг и стрелка двигают сколько угодно нод
// разом, и «move ▣ SHELL» у жеста из четырёх нод было бы прямой неправдой.
is('одна нода — единственное число', moveLabel(1), 'move 1 node');
is('четыре ноды', moveLabel(4), 'move 4 nodes');
is('чип без записи', undoTitle(null), 'nothing to undo');
is('чип возврата без записи', redoTitle(null), 'nothing to redo');
is(
  'чип называет жест создания',
  undoTitle({ kind: 'append', index: 8, fieldId: 'r9', row: row(), label: appendLabel(8) }),
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
is('переименование называет ОБА ключа', renameLabel('SHELL', 'BODY'), 'rename ▣ SHELL → BODY');
// «rename ▣ SHELL» не отличает «сейчас вернётся SHELL» от «сейчас вернётся BODY»: чип обязан
// называть то, что произойдёт по нажатию, а не то, чего жест касался.
is(
  'чип называет жест переименования',
  undoTitle({
    kind: 'rename',
    index: 0,
    fieldId: 'r1',
    from: 'SHELL',
    to: 'BODY',
    outputs: [],
    inputs: [],
    label: renameLabel('SHELL', 'BODY'),
  }),
  'undo — rename ▣ SHELL → BODY',
);
is(
  'чип называет жест раскладки',
  undoTitle({ kind: 'move', back: [], forward: [], label: moveLabel(2) }),
  'undo — move 2 nodes',
);
is(
  'чип возврата называет тот же жест',
  redoTitle({ kind: 'move', back: [], forward: [], label: moveLabel(2) }),
  'redo — move 2 nodes',
);

// --- род записи -----------------------------------------------------------------------------------
console.log('\nрод записи — на нём стоят и гейт заморозки, и сброс');

yes('append — формовая', isFormEntry({ kind: 'append' }));
yes('dissolve — формовая', isFormEntry({ kind: 'dissolve' }));
yes('rename — формовая', isFormEntry({ kind: 'rename' }));
no('move — не формовая', isFormEntry({ kind: 'move' }));

// --- resolvePending -------------------------------------------------------------------------------
console.log('\nresolvePending — дозаполнение id вторым тактом');

const pending = { kind: 'append', index: 2, expectedLength: 3, row: row('SHELL'), label: appendLabel(2) };

// ДЛИНА СОВПАЛА: append состоялся, и строка по адресу — та самая новая.
is('совпавшая длина дозаполняет id', resolvePending(pending, rows('r1', 'r2', 'r3')), {
  kind: 'append',
  index: 2,
  fieldId: 'r3',
  row: row('SHELL'),
  label: 'create step 30',
});

// ДЛИНА НЕ ТА — дозаполнять нечем. Между мутатором и эффектом успела пройти чужая мутация; запись
// с чужим id указывала бы на шаг, которого этот жест не создавал.
is('длина короче — сброс', resolvePending(pending, rows('r1', 'r2')), null);
is('длина длиннее — сброс', resolvePending(pending, rows('r1', 'r2', 'r3', 'r4')), null);
is('пустой массив — сброс', resolvePending(pending, []), null);

// СИНХРОННОЕ ЧТЕНИЕ `fields[at]?.id` ДАЛО БЫ ЭТО. Массив ДО append короче ровно на строку — и
// запись, сделанная в мутаторе, была бы записью в никуда.
is('снимок ДО append (та самая ловушка) — сброс', resolvePending(pending, rows('r1', 'r2')), null);

// Строка по адресу есть, но без id (битое состояние) — тоже сброс, а не запись с undefined.
is('строка без id — сброс', resolvePending(pending, [{ id: 'r1' }, { id: 'r2' }, { id: '' }]), null);

// Первый шаг карточки: append в пустой массив.
is(
  'append в пустую карточку',
  resolvePending(
    { kind: 'append', index: 0, expectedLength: 1, row: row(), label: appendLabel(0) },
    rows('r1'),
  ),
  { kind: 'append', index: 0, fieldId: 'r1', row: row(), label: 'create step 10' },
);

// СТРОКА ЕДЕТ В ЗАПИСЬ ЦЕЛИКОМ — ею повторяет ⇧⌘Z. Собери повтор строку сам — и появилось бы
// второе определение того, что такое «созданный этим жестом шаг».
is(
  'полезная нагрузка строки доезжает до записи',
  resolvePending(
    {
      kind: 'append',
      index: 0,
      expectedLength: 1,
      row: { outputUnitKey: 'SHELL', inputKeys: ['FRONT', 'BACK'] },
      label: appendLabel(0),
    },
    rows('r1'),
  ).row,
  { outputUnitKey: 'SHELL', inputKeys: ['FRONT', 'BACK'] },
);

// ФЛАГ «СНЯТЬ РАЗМЕТКУ», ПЕРЕЗАПИСАННЫЙ ЖЕСТОМ, едет сквозь второй такт: «снял → сшил → ⌘Z» без
// него молча терял намерение снятия, и следующее сохранение не доносило его до сервера.
is(
  'clearedBefore переносится вторым тактом',
  resolvePending(
    {
      kind: 'append',
      index: 0,
      expectedLength: 1,
      row: row('SHELL'),
      label: appendLabel(0),
      clearedBefore: true,
    },
    rows('r1'),
  ).clearedBefore,
  true,
);
// Жест без узла флага не трогал — и запись обязана этого НЕ утверждать: `clearedBefore: false`
// здесь значил бы «жест перезаписал флаг значением false», то есть откат писал бы в форму.
is(
  'жест без узла — clearedBefore отсутствует',
  'clearedBefore' in
    resolvePending(
      { kind: 'append', index: 0, expectedLength: 1, row: row(), label: appendLabel(0) },
      rows('r1'),
    ),
  false,
);

// --- canUndo: append ------------------------------------------------------------------------------
console.log('\ncanUndo (append) — тождество строки, а не её наличие');

const APP = { kind: 'append', index: 2, fieldId: 'r3', row: row(), label: appendLabel(2) };

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

// --- canUndo/canRedo: rename ----------------------------------------------------------------------
console.log('\ncanUndo (rename) — ВСЕ переписанные места разом, иначе не отменяем ничего');

// Жест переименовал SHELL → BODY на карточке из трёх шагов:
//   r1 производит BODY (был SHELL), r2 поглощает его (тот же ключ ВЫХОДОМ) и берёт входом,
//   r3 берёт входом. Три вида мест ровно те, что перечисляет план переписывателя.
const REN = {
  kind: 'rename',
  index: 0,
  fieldId: 'r1',
  from: 'SHELL',
  to: 'BODY',
  outputs: [
    { index: 0, fieldId: 'r1' },
    { index: 1, fieldId: 'r2' },
  ],
  inputs: [
    { index: 1, fieldId: 'r2', at: 0 },
    { index: 2, fieldId: 'r3', at: 1 },
  ],
  label: renameLabel('SHELL', 'BODY'),
};
const R3 = rows('r1', 'r2', 'r3');
/** Карточка ПОСЛЕ жеста: везде новый ключ. */
const outNew = (i) => (i === 0 || i === 1 ? 'BODY' : '');
const inNew = (i) => (i === 1 ? ['BODY', 'SLEEVES'] : i === 2 ? ['COLLAR', 'BODY'] : ['FRONT', 'BACK']);
/** Карточка ПОСЛЕ отмены: везде старый. */
const outOld = (i) => (i === 0 || i === 1 ? 'SHELL' : '');
const inOld = (i) => (i === 1 ? ['SHELL', 'SLEEVES'] : i === 2 ? ['COLLAR', 'SHELL'] : ['FRONT', 'BACK']);

yes('все места на месте — отмена честна', canUndo(REN, R3, outNew, inNew));

// ПОГЛОЩАЮЩИЙ ШАГ — САМОЕ ТИХОЕ МЕСТО. Его выход правили тем же жестом; вернули руками старый код
// — и отмена, вернувшая остальные места, оставила бы карточку с ДВУМЯ разными ключами одного узла.
no(
  'поглотителю вернули старый код руками',
  canUndo(REN, R3, (i) => (i === 0 ? 'BODY' : i === 1 ? 'SHELL' : ''), inNew),
);
no(
  'производителю дали ТРЕТИЙ код',
  canUndo(REN, R3, (i) => (i === 0 ? 'CARCASS' : i === 1 ? 'BODY' : ''), inNew),
);
// Ссылку потребителя переписали руками — тот же довод, только со стороны входов.
no(
  'потребитель больше не смотрит на новый ключ',
  canUndo(REN, R3, outNew, (i) => (i === 2 ? ['COLLAR', 'CUFFS'] : inNew(i))),
);
// Позиция внутри `inputKeys` несущая: тот же ключ, но сдвинутый, значит порядок входов трогали.
no(
  'ключ уехал на другую позицию входов',
  canUndo(REN, R3, outNew, (i) => (i === 2 ? ['BODY', 'COLLAR'] : inNew(i))),
);
// Ресет формы после save и перестановка убивают запись целиком — как и все формовые.
no('после ресета формы', canUndo(REN, rows('n1', 'n2', 'n3'), outNew, inNew));
no('после перестановки строк', canUndo(REN, rows('r1', 'r3', 'r2'), outNew, inNew));
no('строки потребителя больше нет', canUndo(REN, rows('r1', 'r2'), outNew, inNew));

// ЧИТАТЕЛЬ ВХОДОВ НЕОБЯЗАТЕЛЕН: без него щит удостоверяет тождество строк и выходы. Слабее — но
// это осознанная граница, а не дыра: отказывать из-за того, что вызывающий не дал читателя, значит
// сделать отмену мёртвой у того, кто просто не знает про четвёртый аргумент.
yes('без читателя входов — щит слабее, но не отказывает', canUndo(REN, R3, outNew));
no('и выходы он всё равно проверяет', canUndo(REN, R3, outOld));

console.log('\ncanRedo (rename) — зеркало: все места носят СТАРЫЙ ключ');

yes('после отмены повтор честен', canRedo(REN, R3, outOld, inOld));
no('повтор по непеременённой карточке', canRedo(REN, R3, outNew, inNew));
no(
  'между ⌘Z и ⇧⌘Z поглотителя тронули',
  canRedo(REN, R3, (i) => (i === 0 ? 'SHELL' : i === 1 ? 'CARCASS' : ''), inOld),
);
no('после ресета формы повторять нечего', canRedo(REN, rows('n1', 'n2', 'n3'), outOld, inOld));

// --- canUndo: move --------------------------------------------------------------------------------
console.log('\ncanUndo (move) — раскладку не адресуют строкой формы');

const MOV = {
  kind: 'move',
  back: [{ key: 'SHELL', at: null }],
  forward: [{ key: 'SHELL', at: { x: 10, y: 20 } }],
  label: moveLabel(1),
};

// РЕСЕТ ФОРМЫ ПОСЛЕ SAVE РАСКЛАДКУ НЕ КАСАЕТСЯ. Записи `move` ключуются кодом узла или детали, а
// не `fieldId` строки, — и обязаны пережить ровно то, что убивает формовые.
yes('после ресета формы жива', canUndo(MOV, rows('n1', 'n2'), noUnits));
yes('после перестановки строк жива', canUndo(MOV, rows('r3', 'r1'), noUnits));
yes('на пустом массиве строк жива', canUndo(MOV, [], noUnits));

// --- canRedo --------------------------------------------------------------------------------------
console.log('\ncanRedo — щит повтора у создания ДРУГОЙ: отменённой строки в форме нет');

// Создание всегда дописывает В КОНЕЦ, поэтому «ряд тот же, что был сразу после отмены» = длина,
// равная адресу записи. Спрашивать `fieldId` не у чего: строку только что удалили.
yes('длина равна адресу — повтор честен', canRedo(APP, rows('r1', 'r2'), noUnits));
no('между ⌘Z и ⇧⌘Z дописали шаг', canRedo(APP, rows('r1', 'r2', 'r3'), noUnits));
no('между ⌘Z и ⇧⌘Z удалили шаг', canRedo(APP, rows('r1'), noUnits));
no('отрицательный адрес', canRedo({ ...APP, index: -1 }, rows('r1', 'r2'), noUnits));

// У растворения щит — ЗЕРКАЛО отменного: узел на месте и это ТОТ ЖЕ код.
yes(
  'узел вернулся отменой — повтор честен',
  canRedo(DIS, rows('r1', 'r2', 'r3'), (i) => (i === 1 ? 'SHELL' : '')),
);
no('узел так и не вернулся', canRedo(DIS, rows('r1', 'r2', 'r3'), noUnits));
no(
  'узлу дали ДРУГОЙ код',
  canRedo(DIS, rows('r1', 'r2', 'r3'), (i) => (i === 1 ? 'BODY' : '')),
);
no(
  'строка уже не та',
  canRedo(DIS, rows('n1', 'n2', 'n3'), (i) => (i === 1 ? 'SHELL' : '')),
);
yes('раскладку повторяют всегда', canRedo(MOV, [], noUnits));

// --- стопки ---------------------------------------------------------------------------------------
console.log('\nстопки — вершина последняя, новый жест гасит возврат');

const E = (n) => ({ kind: 'move', back: [], forward: [], label: `m${n}` });

{
  const h0 = emptyHistory();
  is('пустая история', h0, { undo: [], redo: [] });
  is('пустая вершина отмены', peekUndo(h0), null);
  is('пустая вершина возврата', peekRedo(h0), null);
  // Пустые стопки не двигаются — и возвращают ТОТ ЖЕ объект: на этом стоит бездействие setState
  // при каждом `focusin` в доке.
  yes('undoStep пустой отдаёт тот же объект', undoStep(h0) === h0);
  yes('redoStep пустой отдаёт тот же объект', redoStep(h0) === h0);
  yes('dropRedoTop пустой отдаёт тот же объект', dropRedoTop(h0) === h0);

  const h1 = record(record(h0, E(1)), E(2));
  is('вершина — последний записанный', peekUndo(h1).label, 'm2');
  is('глубина два', h1.undo.length, 2);
  is('запись не мутирует прежнюю историю', h0.undo.length, 0);

  const h2 = undoStep(h1);
  is('шаг назад снял вершину', peekUndo(h2).label, 'm1');
  is('и положил её в возврат', peekRedo(h2).label, 'm2');
  const h3 = undoStep(h2);
  is('второй шаг назад', peekUndo(h3), null);
  is('возврат накопил оба', h3.redo.map((e) => e.label), ['m2', 'm1']);

  const h4 = redoStep(h3);
  is('шаг вперёд вернул ближайший', peekUndo(h4).label, 'm1');
  is('и снял его с возврата', peekRedo(h4).label, 'm2');
  is('вперёд до конца', redoStep(h4).undo.map((e) => e.label), ['m1', 'm2']);

  // НОВЫЙ ЖЕСТ ГАСИТ ВОЗВРАТ. После него «вперёд» ведёт уже не туда, откуда ушли.
  const h5 = record(h3, E(9));
  is('новый жест погасил возврат', h5.redo, []);
  is('и лёг вершиной', peekUndo(h5).label, 'm9');

  // ПОВТОР ВОЗВРАЩАЕТ ЗАПИСЬ, НЕ ТРОГАЯ ВОЗВРАТ: у создания новый `fieldId` приезжает вторым
  // тактом, и запись кладётся отдельно от самого жеста. Гаси она возврат — ⇧⌘Z, нажатое трижды,
  // вернуло бы один жест и молча забыло два.
  const h6 = pushUndo(h3, E(7));
  is('pushUndo не тронул возврат', h6.redo.map((e) => e.label), ['m2', 'm1']);
  is('pushUndo положил вершину', peekUndo(h6).label, 'm7');
  is('dropRedoTop снял вершину возврата', dropRedoTop(h3).redo.map((e) => e.label), ['m2']);
}

// --- глубина --------------------------------------------------------------------------------------
console.log('\nглубина — вытесняется САМОЕ СТАРОЕ, а не свежее');

{
  is('потолок объявлен', HISTORY_DEPTH, 50);
  let h = emptyHistory();
  for (let i = 1; i <= HISTORY_DEPTH + 5; i++) h = record(h, E(i));
  is('стопка не переросла потолок', h.undo.length, HISTORY_DEPTH);
  is('вершина — последний жест', peekUndo(h).label, `m${HISTORY_DEPTH + 5}`);
  is('дно — шестой, первые пять вытеснены', h.undo[0].label, 'm6');
  // Отмена всех пятидесяти доводит стопку возврата до потолка и не теряет ни одной.
  for (let i = 0; i < HISTORY_DEPTH; i++) h = undoStep(h);
  is('отменилось ровно пятьдесят', h.undo.length, 0);
  is('возврат держит все пятьдесят', h.redo.length, HISTORY_DEPTH);
  is('ближайший к возврату — шестой', peekRedo(h).label, 'm6');
}

// --- сброс по роду ---------------------------------------------------------------------------------
console.log('\nсброс по роду — формовые умирают, раскладочные живут (и наоборот)');

{
  const A = { kind: 'append', index: 0, fieldId: 'r1', row: row(), label: 'a' };
  const M = { kind: 'move', back: [], forward: [], label: 'm' };
  const D = { kind: 'dissolve', index: 0, fieldId: 'r1', unitKey: 'X', unitName: '', label: 'd' };
  const h = { undo: [A, M, D], redo: [A, M] };

  is('dropForm оставил только раскладку', dropForm(h).undo.map((e) => e.kind), ['move']);
  is('dropForm вычистил и возврат', dropForm(h).redo.map((e) => e.kind), ['move']);
  is('dropMove оставил только форму', dropMove(h).undo.map((e) => e.kind), ['append', 'dissolve']);
  is('dropMove вычистил и возврат', dropMove(h).redo.map((e) => e.kind), ['append']);

  // ТОТ ЖЕ ОБЪЕКТ, КОГДА СБРАСЫВАТЬ НЕЧЕГО. Восьмую точку сброса дёргает КАЖДЫЙ `focusin` в доке:
  // новая история на каждое касание поля означала бы ре-рендер редактора шага на каждое касание.
  const onlyMove = { undo: [M], redo: [] };
  yes('dropForm без формовых отдаёт тот же объект', dropForm(onlyMove) === onlyMove);
  const onlyForm = { undo: [A], redo: [] };
  yes('dropMove без раскладочных отдаёт тот же объект', dropMove(onlyForm) === onlyForm);
  const h0 = emptyHistory();
  yes('dropForm пустой отдаёт тот же объект', dropForm(h0) === h0);
  yes('dropMove пустой отдаёт тот же объект', dropMove(h0) === h0);
}

// --- модель компонента ------------------------------------------------------------------------------
//
// Дальше — не отдельные функции, а ЦИКЛ: жест, запись, отмена, повтор. Модель повторяет
// `operations-field.tsx` там, где ошибиться легко и тихо: двухтактный захват `fieldId`, инверсия
// через тот же мутатор (а он сам — точка сброса), два хранилища и по-родовой гейт заморозки.

/** Раскладка — те же две чистые функции, что живут в `use-schematic-prefs` (их пробует свой прогон). */
const applyEdits = (pos, edits) => {
  const next = { ...pos };
  for (const e of edits) {
    if (e.at) next[e.key] = { x: Math.max(0, e.at.x), y: Math.max(0, e.at.y) };
    else delete next[e.key];
  }
  return next;
};
const inverseEdits = (pos, edits) => edits.map((e) => ({ key: e.key, at: pos[e.key] ?? null }));

function stand(initialIds = []) {
  let hist = emptyHistory();
  let pending = null;
  let fields = initialIds.map((id) => ({ id }));
  /** Выход шага держится по `fieldId`, а не по индексу: перестановка строк его не двигает. */
  const units = new Map();
  /** Входы шага — по тому же ключу и по той же причине. Переименование правит и их. */
  const ins = new Map();
  let pos = {};
  let seq = 0;
  let frozen = false;
  let applying = false;
  const said = [];
  const newId = () => `f${++seq}`;
  const outputOf = (i) => units.get(fields[i]?.id) ?? '';
  const inputsOf = (i) => ins.get(fields[i]?.id) ?? [];

  const api = {
    get history() {
      return hist;
    },
    get rows() {
      return fields.map((f) => f.id);
    },
    get pos() {
      return pos;
    },
    /** Карточка целиком — по ней и проверяется, что переписаны ВСЕ три вида мест. */
    get card() {
      return fields.map((_, i) => ({ out: outputOf(i), ins: inputsOf(i) }));
    },
    get said() {
      return said;
    },
    get undoName() {
      return undoTitle(peekUndo(hist));
    },
    get redoName() {
      return redoTitle(peekRedo(hist));
    },
    freeze(v) {
      frozen = v;
      if (v) api.clearForm(); // эффект заморозки — девятая точка
    },

    /** Точка сброса. Формовые записи умирают, раскладочные живут. */
    clearForm() {
      if (applying) return;
      pending = null;
      hist = dropForm(hist);
    },

    /** Эффект на `[fields]`: второй такт записи create. */
    settle() {
      const p = pending;
      if (!p) return;
      pending = null;
      const rec = resolvePending(p, fields);
      if (!rec) return;
      hist = p.redone ? pushUndo(hist, rec) : record(hist, rec);
    },

    /** `appendStep` — жест полотна: строка дописывается в конец, запись доезжает вторым тактом. */
    create(unitKey = '', clearedBefore, inputKeys = []) {
      if (frozen) return;
      const at = fields.length;
      const r = { outputUnitKey: unitKey };
      pending = {
        kind: 'append',
        index: at,
        expectedLength: at + 1,
        row: r,
        label: appendLabel(at),
        ...(clearedBefore !== undefined ? { clearedBefore } : {}),
      };
      const id = newId();
      fields = [...fields, { id }];
      units.set(id, unitKey);
      ins.set(id, [...inputKeys]);
      api.settle();
    },

    /**
     * `renameUnit` — переписыватель ссылок. ТРИ ВИДА МЕСТ, одна запись, одно слово.
     *
     * Модель повторяет мутатор ровно там, где он ошибается тихо: собирает адреса ДО первой записи,
     * пишет их одним проходом и кладёт ОДНУ запись, инвертирующую всё разом.
     */
    rename(index, next) {
      if (frozen) return { ok: false, why: 'frozen' };
      const from = outputOf(index);
      if (!from || next === from) return { ok: false, why: 'nothing to rename' };
      // Коллизия — отказ БЕЗ ЕДИНОЙ ЗАПИСИ. Сравнение побайтное: «Shell» не занят «SHELL».
      if (fields.some((_, i) => outputOf(i) === next)) {
        said.push(`unit “${next}” is already produced`);
        return { ok: false, why: 'taken' };
      }
      const outputs = [];
      const inputs = [];
      fields.forEach((f, i) => {
        if (outputOf(i) === from) outputs.push({ index: i, fieldId: f.id });
        inputsOf(i).forEach((k, j) => {
          if (k === from) inputs.push({ index: i, fieldId: f.id, at: j });
        });
      });
      // ТРЕТЬЯ КОЛЛИЗИЯ — ДУБЛЬ ВО ВХОДАХ ОДНОГО ШАГА (правило 7). Новый ключ может нигде не
      // производиться и всё равно СТОЯТЬ ВХОДОМ там же, где старый: висячая ссылка на растворённый
      // узел выглядит ровно так. Перезапись поставила бы один и тот же вход дважды.
      const clash = inputs.find((s) => inputsOf(s.index).includes(next));
      if (clash) {
        said.push(`step ${(clash.index + 1) * 10} already takes “${next}” as an input`);
        return { ok: false, why: 'duplicate-input' };
      }
      api.write({ outputs, inputs }, next);
      hist = record(hist, {
        kind: 'rename',
        index,
        fieldId: fields[index].id,
        from,
        to: next,
        outputs,
        inputs,
        label: renameLabel(from, next),
      });
      said.push(`renamed ${from} → ${next} in ${new Set([...outputs, ...inputs].map((x) => x.index)).size} steps`);
      return { ok: true };
    },

    /** Перезапись по списку мест — одна на жест и на обе его инверсии. */
    write(sites, key) {
      for (const s of sites.outputs) units.set(fields[s.index].id, key);
      for (const s of sites.inputs) {
        const cur = [...inputsOf(s.index)];
        cur[s.at] = key;
        ins.set(fields[s.index].id, cur);
      }
    },

    /** `removeOperation` — мутатор массива, и он же точка сброса №1. */
    remove(index) {
      const id = fields[index]?.id;
      api.clearForm();
      if (id) {
        units.delete(id);
        ins.delete(id);
      }
      fields = fields.filter((_, i) => i !== index);
    },

    dissolve(index) {
      if (frozen) return;
      const id = fields[index]?.id;
      const unitKey = (units.get(id) ?? '').trim();
      units.set(id, '');
      if (!id || !unitKey) return;
      hist = record(hist, {
        kind: 'dissolve',
        index,
        fieldId: id,
        unitKey,
        unitName: unitKey.toLowerCase(),
        label: dissolveLabel(unitKey),
      });
    },

    /** Жест раскладки. НИ ОДНОГО касания формы — иначе перетаскивание взводило бы isDirty. */
    move(edits) {
      if (edits.length === 0) return;
      const back = inverseEdits(pos, edits);
      pos = applyEdits(pos, edits);
      hist = record(hist, { kind: 'move', back, forward: edits, label: moveLabel(edits.length) });
    },

    /** Ресет формы после успешного save: RHF раздаёт строкам НОВЫЕ id. */
    saveAndReset() {
      const fresh = fields.map((f) => ({ id: newId(), was: f.id }));
      for (const f of fresh) {
        units.set(f.id, units.get(f.was) ?? '');
        ins.set(f.id, ins.get(f.was) ?? []);
      }
      fields = fresh.map((f) => ({ id: f.id }));
    },

    undo() {
      const rec = peekUndo(hist);
      if (!rec) return; // тишина
      if (rec.kind !== 'move' && frozen) {
        said.push('frozen');
        return;
      }
      if (!canUndo(rec, fields, outputOf, inputsOf)) {
        hist = dropForm(hist);
        said.push('the sequence has changed — nothing to undo');
        return;
      }
      if (rec.kind === 'move') {
        pos = applyEdits(pos, rec.back);
      } else if (rec.kind === 'append') {
        applying = true;
        api.remove(rec.index);
        applying = false;
      } else if (rec.kind === 'rename') {
        applying = true;
        api.write(rec, rec.from);
        applying = false;
      } else {
        applying = true;
        units.set(fields[rec.index].id, rec.unitKey);
        applying = false;
      }
      hist = undoStep(hist);
    },

    redo() {
      const rec = peekRedo(hist);
      if (!rec) return; // та же тишина
      if (rec.kind !== 'move' && frozen) {
        said.push('frozen');
        return;
      }
      if (!canRedo(rec, fields, outputOf, inputsOf)) {
        hist = dropForm(hist);
        said.push('the sequence has changed — nothing to redo');
        return;
      }
      if (rec.kind === 'move') {
        pos = applyEdits(pos, rec.forward);
        hist = redoStep(hist);
        return;
      }
      if (rec.kind === 'append') {
        hist = dropRedoTop(hist);
        pending = { ...rec, expectedLength: rec.index + 1, redone: true };
        const id = newId();
        fields = [...fields, { id }];
        units.set(id, rec.row.outputUnitKey ?? '');
        ins.set(id, []);
        api.settle();
        return;
      }
      if (rec.kind === 'rename') {
        applying = true;
        api.write(rec, rec.to);
        applying = false;
        hist = redoStep(hist);
        return;
      }
      applying = true;
      units.set(fields[rec.index].id, '');
      applying = false;
      hist = redoStep(hist);
    },
  };
  return api;
}

console.log('\nмногошаговость — ⌘Z несколько раз подряд, ⇧⌘Z обратно');

{
  const s = stand();
  s.create('SHELL');
  s.create('SLEEVES');
  s.create('GARMENT');
  is('три создания — три записи', s.history.undo.length, 3);
  is('чип называет последний', s.undoName, 'undo — create step 30');
  s.undo();
  is('первый ⌘Z снял третий шаг', s.rows.length, 2);
  is('и чип назвал следующий', s.undoName, 'undo — create step 20');
  s.undo();
  s.undo();
  is('три ⌘Z подряд опустошили карточку', s.rows.length, 0);
  is('история отмены пуста', peekUndo(s.history), null);
  is('возврат держит все три', s.history.redo.length, 3);
  is('и молчит: снекбар не сказал ни слова', s.said, []);
  // ЧЕТВЁРТОЕ НАЖАТИЕ — ТИШИНА. Прямое требование владельца: пустая история не алертит.
  s.undo();
  is('⌘Z по пустой истории молчит', s.said, []);

  s.redo();
  s.redo();
  s.redo();
  is('три ⇧⌘Z вернули все три шага', s.rows.length, 3);
  is('возврат опустел', peekRedo(s.history), null);
  is('и отмена снова полна', s.history.undo.length, 3);
  is('⇧⌘Z ничего не сказал', s.said, []);
  s.redo();
  is('⇧⌘Z по пустому возврату молчит', s.said, []);
}

{
  // ПОВТОР СОЗДАНИЯ ПЕРЕЗАХВАТЫВАЕТ `fieldId`. Строка, дописанная заново, получает у RHF НОВЫЙ id;
  // вернись запись в стопку со старым — следующий ⌘Z отказал бы по guard'у, и отмена оказалась бы
  // мёртвой ровно через один цикл ⌘Z/⇧⌘Z. Это самая тихая ошибка редо.
  const s = stand();
  s.create('SHELL');
  const idBefore = s.rows[0];
  s.undo();
  s.redo();
  const idAfter = s.rows[0];
  no('RHF выдал новой строке другой id', idBefore === idAfter);
  is('запись вернулась в стопку отмены', s.history.undo.length, 1);
  is('и с НОВЫМ id', peekUndo(s.history).fieldId, idAfter);
  s.undo();
  is('и следующий ⌘Z снова работает', s.rows.length, 0);
  is('без единого отказа', s.said, []);
}

{
  // ⇧⌘Z, НАЖАТОЕ ТРИЖДЫ, ВОЗВРАЩАЕТ ТРИ ЖЕСТА. Повтор создания, гасящий стопку возврата, вернул бы
  // один и молча забыл остальные.
  const s = stand();
  s.create('A');
  s.create('B');
  s.create('C');
  s.undo();
  s.undo();
  s.undo();
  s.redo();
  is('после первого ⇧⌘Z в возврате осталось два', s.history.redo.length, 2);
  s.redo();
  s.redo();
  is('вернулись все три', s.rows.length, 3);
  is('порядок восстановлен', peekUndo(s.history).label, 'create step 30');
}

console.log('\nсмешение родов — порядок жестов, а не два отдельных списка');

{
  // ГЛАВНАЯ ПРЕТЕНЗИЯ ВЛАДЕЛЬЦА. «Создал шаг → подвигал ноды → ⌘Z» обязано отменить ПЕРЕСТАНОВКУ.
  // Двумя стопками (форма отдельно, раскладка отдельно) порядок теряется, и ⌘Z сносит созданный
  // шаг — молча, потому что перестановка не записывалась нигде.
  const s = stand();
  s.create('SHELL');
  s.move([{ key: 'SHELL', at: { x: 100, y: 50 } }]);
  is('вершина — перестановка, а не создание', peekUndo(s.history).kind, 'move');
  is('и чип это ГОВОРИТ', s.undoName, 'undo — move 1 node');
  s.undo();
  is('⌘Z вернул раскладку', s.pos, {});
  is('шаг остался на месте', s.rows.length, 1);
  is('ни слова в снекбар', s.said, []);
  s.undo();
  is('второй ⌘Z снял уже шаг', s.rows.length, 0);
}

{
  // Обратный порядок: подвигал, потом создал. Первый ⌘Z обязан снять СОЗДАНИЕ.
  const s = stand();
  s.move([{ key: 'SHELL', at: { x: 10, y: 10 } }]);
  s.create('SHELL');
  is('вершина — создание', peekUndo(s.history).kind, 'append');
  s.undo();
  is('шаг снят', s.rows.length, 0);
  is('раскладка не тронута', s.pos, { SHELL: { x: 10, y: 10 } });
  s.undo();
  is('второй ⌘Z вернул раскладку', s.pos, {});
}

{
  // ПЕРВОЕ перетаскивание ноды отменяется СНЯТИЕМ оверрайда, а не записью прежнего места: до жеста
  // позицию давала авто-раскладка, и «вернуть как было» значит вернуть её ей.
  const s = stand();
  s.move([{ key: 'SHELL', at: { x: 10, y: 10 } }]);
  s.move([{ key: 'SHELL', at: { x: 20, y: 20 } }]);
  s.undo();
  is('второе перетаскивание отменилось в первое', s.pos, { SHELL: { x: 10, y: 10 } });
  s.undo();
  is('первое — в отсутствие оверрайда', s.pos, {});
  is('ключа нет вовсе, а не {x:0,y:0}', 'SHELL' in s.pos, false);
  s.redo();
  is('⇧⌘Z вернул первое', s.pos, { SHELL: { x: 10, y: 10 } });
  s.redo();
  is('и второе', s.pos, { SHELL: { x: 20, y: 20 } });
}

{
  // МУЛЬТИДРАГ — ОДИН ЖЕСТ. Разбей его на записи по ноде — и ⌘Z возвращал бы четвёрку по одной
  // ноде за нажатие, то есть жест и его отмена перестали бы быть одним и тем же движением.
  const s = stand();
  s.move([{ key: 'A', at: { x: 1, y: 1 } }]);
  s.move([
    { key: 'A', at: { x: 5, y: 5 } },
    { key: 'B', at: { x: 6, y: 6 } },
    { key: 'C', at: { x: 7, y: 7 } },
  ]);
  is('пачка легла одной записью', s.history.undo.length, 2);
  is('и назвалась счётом', peekUndo(s.history).label, 'move 3 nodes');
  s.undo();
  is('одно нажатие вернуло все три', s.pos, { A: { x: 1, y: 1 } });
}

console.log('\nпереименование — три вида мест, одна запись, одно нажатие ⌘Z');

/** Цепочка из трёх нод: SHELL → BODY → GARMENT, плюс поглощение BODY на четвёртом шаге. */
function chain() {
  const s = stand();
  s.create('SHELL', undefined, ['FRONT', 'BACK']);
  s.create('BODY', undefined, ['SHELL', 'SLEEVE']);
  s.create('BODY', undefined, ['BODY', 'POCKET']); // поглощение: тот же ключ ВЫХОДОМ
  s.create('GARMENT', undefined, ['BODY', 'COLLAR']);
  // Карточку СОБРАЛИ, история сборки к делу не относится: в жизни первый же `focusin` в поле кода
  // (восьмая точка сброса) гасит формовые записи, и переименование ложится в пустую стопку.
  s.clearForm();
  return s;
}

{
  const s = chain();
  const before = j(s.card);
  s.rename(0, 'CARCASS');
  is('производитель переименован', s.card[0].out, 'CARCASS');
  is('потребитель переписан на новый ключ', s.card[1].ins, ['CARCASS', 'SLEEVE']);
  is('порядок входов не сдвинут', s.card[1].ins[1], 'SLEEVE');
  is('цепочка ниже не тронута', s.card[3].ins, ['BODY', 'COLLAR']);
  is('успех произнесён с числом шагов', s.said.at(-1), 'renamed SHELL → CARCASS in 2 steps');
  is('жест — ОДНА запись, а не три', s.history.undo.length, 1);
  is('и чип называет оба ключа', s.undoName, 'undo — rename ▣ SHELL → CARCASS');
  s.undo();
  is('одно нажатие ⌘Z вернуло ВСЁ разом', j(s.card), before);
  is('и сделало это одной записью', s.history.undo.length, 0);
  s.redo();
  is('⇧⌘Z вернул переименование целиком', s.card[1].ins, ['CARCASS', 'SLEEVE']);
  is('и выход производителя', s.card[0].out, 'CARCASS');
}

{
  // ПОГЛОЩЕНИЕ — САМАЯ ТИХАЯ ИЗ ТРЁХ ОШИБОК. Поглощающий шаг несёт тот же ключ ВЫХОДОМ; пропусти
  // его переписыватель — и он станет ВТОРЫМ ПРОИЗВОДИТЕЛЕМ старого кода, то есть новым узлом.
  // На глаз переименование при этом выглядит удавшимся.
  const s = chain();
  s.rename(1, 'TORSO');
  is('выход производителя', s.card[1].out, 'TORSO');
  is('ВЫХОД ПОГЛОТИТЕЛЯ — тоже', s.card[2].out, 'TORSO');
  is('и его вход', s.card[2].ins, ['TORSO', 'POCKET']);
  is('вход следующего узла', s.card[3].ins, ['TORSO', 'COLLAR']);
  is('старого кода не осталось нигде', s.card.filter((r) => r.out === 'BODY' || r.ins.includes('BODY')).length, 0);
  is('число шагов считает ВСЕ три вида мест', s.said.at(-1), 'renamed BODY → TORSO in 3 steps');
  s.undo();
  is('⌘Z вернул и поглотителя', s.card[2].out, 'BODY');
  is('и все ссылки', j(s.card.map((r) => r.ins)), j([['FRONT', 'BACK'], ['SHELL', 'SLEEVE'], ['BODY', 'POCKET'], ['BODY', 'COLLAR']]));
}

{
  // КОЛЛИЗИЯ — ОТКАЗ СЛОВАМИ И НИ ОДНОЙ ЗАПИСИ.
  const s = chain();
  const before = j(s.card);
  const r = s.rename(0, 'GARMENT');
  no('коллизия отказала', r.ok);
  is('карточка не тронута', j(s.card), before);
  is('истории не появилось', s.history.undo.length, 0);
  is('и отказ произнесён', s.said.at(-1), 'unit “GARMENT” is already produced');
}

{
  // КОЛЛИЗИЯ ТРЕТЬЕГО РОДА: новый ключ нигде не производится, но УЖЕ СТОИТ ВХОДОМ там же, где
  // старый. Так выглядит висячая ссылка на растворённый узел — состояние живое и частое, а
  // перезапись поставила бы один и тот же вход дважды (правило 7, duplicate-input). Отказ обязан
  // прийти ДО первой записи: движок иначе показал бы слова о ЧУЖОМ шаге, и причину ищут не там.
  const s = stand();
  s.create('SHELL', undefined, ['FRONT', 'BACK']);
  s.create('BODY', undefined, ['SHELL', 'LOST']); // LOST не производит никто
  s.clearForm();
  const before = j(s.card);
  const r = s.rename(0, 'LOST');
  no('дубль во входах отказал', r.ok);
  is('карточка не тронута', j(s.card), before);
  is('истории не появилось', s.history.undo.length, 0);
  is('и отказ назвал шаг', s.said.at(-1), 'step 20 already takes “LOST” as an input');
  // А безопасное переименование на той же карточке проходит, и отмена возвращает ИСХОДНЫЕ строки,
  // а не «переименовывает обратно»: висячая ссылка на LOST жестом не тронута ни разу.
  s.rename(0, 'CARCASS');
  is('висячая ссылка не тронута', s.card[1].ins, ['CARCASS', 'LOST']);
  s.undo();
  is('отмена вернула байт-в-байт', j(s.card), before);
}

{
  // ПОБАЙТНОСТЬ. «Shell» — ДРУГОЙ узел, а не тот же в другом регистре: коллация ключа utf8mb4_bin.
  const s = chain();
  const r = s.rename(0, 'Shell');
  yes('регистр — не коллизия', r.ok);
  is('и переписан он побайтно', s.card[1].ins, ['Shell', 'SLEEVE']);
}

{
  // РЕСЕТ ФОРМЫ ПОСЛЕ SAVE убивает и эту запись: адреса те же, id новые.
  const s = chain();
  s.rename(0, 'CARCASS');
  s.saveAndReset();
  s.undo();
  is('отказ произнесён', s.said.at(-1), 'the sequence has changed — nothing to undo');
  is('и ни одно место не тронуто', s.card[1].ins, ['CARCASS', 'SLEEVE']);
}

{
  // ПЕРЕИМЕНОВАНИЕ И ПЕРЕСТАНОВКА В ОДНОЙ СТОПКЕ — порядок жестов, а не два списка.
  const s = chain();
  s.rename(0, 'CARCASS');
  s.move([{ key: 'CARCASS', at: { x: 5, y: 5 } }]);
  is('вершина — перестановка', peekUndo(s.history).kind, 'move');
  s.undo();
  is('первый ⌘Z вернул раскладку', s.pos, {});
  is('а переименование осталось', s.card[1].ins, ['CARCASS', 'SLEEVE']);
  s.undo();
  is('второй ⌘Z снял переименование', s.card[1].ins, ['SHELL', 'SLEEVE']);
}

{
  // ЗАМОРОЗКА: род формовый, значит на выпущенной карточке отмена отказывает СЛОВАМИ.
  const s = chain();
  s.rename(0, 'CARCASS');
  s.freeze(true);
  is('формовая запись умерла при выпуске', s.history.undo.length, 0);
  const t = chain();
  t.freeze(true);
  const r = t.rename(0, 'CARCASS');
  no('на выпущенной карточке переименование не состоялось', r.ok);
  is('и карточка цела', t.card[0].out, 'SHELL');
}

console.log('\nресет формы после save — формовые записи мертвы, раскладочные живы');

{
  const s = stand();
  s.create('SHELL');
  s.move([{ key: 'SHELL', at: { x: 30, y: 30 } }]);
  s.create('SLEEVES');
  is('в истории три жеста', s.history.undo.length, 3);
  s.saveAndReset(); // ← успешный save: RHF раздал строкам новые id

  // ВЕРШИНА — ФОРМОВАЯ, И ОНА ОБЯЗАНА ОТКАЗАТЬ СЛОВАМИ. Молчание тут означало бы «отменил», хотя
  // не отменено ничего: запись БЫЛА, guard провалился.
  s.undo();
  is('отказ произнесён', s.said, ['the sequence has changed — nothing to undo']);
  is('карточка цела — ни одного шага не удалено', s.rows.length, 2);
  is('формовых записей не осталось', s.history.undo.filter((e) => e.kind !== 'move').length, 0);
  is('раскладочная жива', s.history.undo.length, 1);
  is('и она — та самая перестановка', peekUndo(s.history).kind, 'move');

  // …и она РАБОТАЕТ: ресет формы раскладку не касался.
  s.undo();
  is('перестановка отменилась после save', s.pos, {});
  is('и сделала это молча', s.said.length, 1);
}

console.log('\nзаморозка — гейт ПО РОДУ, а не скопом');

{
  const s = stand();
  s.create('SHELL');
  s.move([{ key: 'SHELL', at: { x: 40, y: 40 } }]);
  s.freeze(true); // карточку выпустили, пока фулскрин открыт

  is('формовые записи умерли при выпуске', s.history.undo.filter((e) => e.kind !== 'move').length, 0);
  is('раскладочная пережила выпуск', s.history.undo.length, 1);
  is('чип называет её', s.undoName, 'undo — move 1 node');

  // ОТМЕНА ПЕРЕСТАНОВКИ НА RELEASED РАБОТАЕТ: раскладывать выпущенную карточку законно (R10).
  s.undo();
  is('перестановка отменена на выпущенной карточке', s.pos, {});
  is('и без отказа', s.said, []);
  s.redo();
  is('и возвращается', s.pos, { SHELL: { x: 40, y: 40 } });
  is('тоже без отказа', s.said, []);
}

{
  // Формовая запись на замороженной карточке (гонка Release в другом порядке: запись сначала,
  // заморозка мимо эффекта) обязана отказывать СЛОВАМИ, а не молча.
  const s = stand();
  s.create('SHELL');
  s.freeze(true);
  // подкладываем формовую запись руками — так выглядит гонка, которую эффект не успел разобрать
  s.history.undo.push({ kind: 'append', index: 0, fieldId: s.rows[0], row: row(), label: 'x' });
  s.undo();
  is('на выпущенной карточке формовая отмена отказывает словами', s.said, ['frozen']);
  is('и ничего не удаляет', s.rows.length, 1);
}

console.log('\nдесять точек сброса — формовое умирает, раскладочное остаётся');

/**
 * ДЕСЯТЬ ТРИГГЕРОВ, поимённо: шесть структурных + добор детали + focusin дока + эффект frozen —
 * девять по спеке Ф4 — плюс десятая из ревью Ф4: граница визита фулскрина (обе стороны). ⌘Z живёт
 * только в фулскрине, а снаружи шаг правится мимо всех девяти (редактор списка без focusin-сброса,
 * «make it a unit», «clear the unit markup») — запись из прошлого визита сносила бы шаг вместе с
 * правками.
 */
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
  'граница визита фулскрина',
];

is('точек сброса ровно десять', RESETS.length, 10);

for (const name of RESETS) {
  const s = stand();
  s.create('SHELL');
  s.move([{ key: 'SHELL', at: { x: 1, y: 2 } }]);
  checks++;
  if (s.history.undo.length !== 2) fail(`${name}: записи до сброса`, 'сбрасывать нечего, случай пуст');
  s.clearForm(); // ← это и есть точка сброса
  is(`${name} убивает формовую запись`, s.history.undo.filter((e) => e.kind !== 'move').length, 0);
  is(`${name} НЕ трогает раскладочную`, s.history.undo.length, 1);
}

{
  // СБРОС ПОЛУЗАПИСИ. Точка сброса, сработавшая МЕЖДУ мутатором и эффектом, обязана убить и
  // pending: иначе следующий такт дозаполнит её id шага, которого этот жест не создавал.
  const s = stand();
  s.create('SHELL');
  s.clearForm();
  s.settle();
  is('сброс между тактами не воскрешает запись', s.history.undo.length, 0);
}

{
  // ИНВЕРСИЯ НЕ ИМЕЕТ ПРАВА СРАБОТАТЬ КАК ТОЧКА СБРОСА. Отмена создания зовёт `removeOperation`, а
  // он сам — точка №1: без щита первый же ⌘Z стёр бы ВСЮ остальную формовую историю, и
  // многошаговость кончилась бы на одном шаге. Ошибка тихая: один ⌘Z работает, второй молчит.
  const s = stand();
  s.create('A');
  s.create('B');
  s.create('C');
  s.undo();
  is('после первой отмены история цела', s.history.undo.length, 2);
  s.undo();
  s.undo();
  is('три ⌘Z сняли три шага', s.rows.length, 0);
}

{
  // Черновик генератора переписал список — формовые записи умирают, но раскладка человека остаётся:
  // «заменить весь список» не про то, где стоят ноды.
  const s = stand();
  s.move([{ key: 'A', at: { x: 3, y: 3 } }]);
  s.create('SHELL');
  s.clearForm();
  is('после генератора отменяется раскладка', peekUndo(s.history).kind, 'move');
  s.undo();
  is('и отменяется честно', s.pos, {});
}

// --- итог -----------------------------------------------------------------------------------------
console.log(
  failed.size === 0
    ? `\n${checks} из ${checks} проверок прошло`
    : `\n${failed.size} провалов из ${checks} проверок`,
);
process.exit(failed.size === 0 ? 0 : 1);
