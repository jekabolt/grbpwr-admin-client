#!/usr/bin/env node
// ПЕРЕИМЕНОВАНИЕ УЗЛА — расчёт жеста и все его отказы (Т7б, раунд 2).
//
// Зачем отдельный прогон. Расчёт жил внутри `operations-field.tsx`, а удостоверяла его КОПИЯ,
// написанная в `last-mutation-probe.mjs`: та проверяла модель, а не код. Копия успела разойтись с
// оригиналом на две ветки (в ней не было ни растворения по пустому ключу, ни коллизии с деталью),
// и разойтись молча — расхождение видно только тому, кто читает обе. Здесь импортируется
// НАСТОЯЩИЙ `assembly-rename.ts`, и проба истории теперь зовёт его же.
//
// Ошибки этого расчёта тихие и разрушительные:
//
//   • ПРОПУЩЕННЫЙ ПОГЛОТИТЕЛЬ. Поглощение выражено тем же ключом в ВЫХОДЕ шага
//     (`GARMENT + HEM → GARMENT`). Не перепиши его — и поглотитель станет ВТОРЫМ ПРОИЗВОДИТЕЛЕМ
//     старого кода, то есть новым узлом. На глаз переименование выглядит удавшимся, а движок
//     начинает отвергать половину карточки правилом 2.
//   • СКАН ПО РЕЗУЛЬТАТУ СВИПА вместо лексического. Свип знает только ЗАКОННЫЕ узлы; на уже
//     сломанной карточке (второй производитель, отвергнутый джойн) половины мест он не видит
//     вовсе — и починка ломала бы.
//   • ДУБЛЬ ВО ВХОДАХ ОДНОГО ШАГА (правило 7). Новый ключ может нигде не производиться и всё равно
//     стоять входом там же, где старый: так выглядит висячая ссылка на растворённый узел.
//     Перезапись поставила бы один и тот же вход дважды, а слова движка были бы не о
//     переименовании — и причину искали бы не там.
//   • ПОДРЕЗАННОЕ СРАВНЕНИЕ. Идентичность узла побайтна (`COLLATE utf8mb4_bin`): «Shell» — другой
//     узел, а не тот же в другом регистре. Один `trim` в модуле есть, и он ровно один: ключ из
//     пробелов — это ОТСУТСТВИЕ ключа, то есть растворение, а не узел с пустым именем.
//
// ДВЕ НОГИ:
//   СЕМАНТИКА — план и вердикт на карточках-фикстурах, включая заведомо сломанные.
//   СТРУКТУРА — исходники читаются текстом и проверяются на то, что второй копии расчёта в
//               репозитории НЕТ. Без этой ноги проба зелёная и на дереве, где копия вернулась
//               рядом с оригиналом, — то есть ровно на дефекте, ради которого она написана.
//
// ЧЕГО ПРОБА НЕ ДОКАЗЫВАЕТ: ни одной записи в форму, ни одного слова на экране, ни одного жеста.
// Что мутатор действительно позвал этот расчёт и произнёс его отказ — проверяется браузерным
// стендом; чистая арифметика об этом ничего не знает.
//
//   node scripts/assembly-rename-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/assembly-rename-probe-entry.ts');

const outfile = resolve(tmpdir(), `assembly-rename-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
});
const { planUnitRename, unitRenameAct } = await import(pathToFileURL(outfile).href);

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
const head = (t) => console.log(`\n${t}`);

const op = (ins, out) => ({ inputKeys: [...ins], outputUnitKey: out });

/** Цепочка из трёх нод плюс ПОГЛОЩЕНИЕ BODY на третьем шаге — та же, что у стенда. */
const CHAIN = [
  op(['FRONT', 'BACK'], 'SHELL'),
  op(['SHELL', 'SLEEVE'], 'BODY'),
  op(['BODY', 'POCKET'], 'BODY'),
  op(['BODY', 'COLLAR'], 'GARMENT'),
];

/** Карточка, уже сломанная правилом 2: SHELL производят ДВА шага. */
const TWOPROD = [
  op(['FRONT', 'BACK'], 'SHELL'),
  op(['SHELL', 'SLEEVE'], 'BODY'),
  op(['CUFF-L', 'CUFF-R'], 'SHELL'),
];

/** Карточка с висячим входом: узел LOST когда-то растворили, ссылка осталась. */
const DANGLE = [op(['FRONT', 'BACK'], 'SHELL'), op(['SHELL', 'LOST'], 'BODY')];

const PIECES = [
  { lineKey: 'FRONT', name: 'front panel' },
  { lineKey: 'BACK', name: 'back panel' },
  { lineKey: 'SLEEVE', name: '' },
];

// --- planUnitRename: три вида мест ----------------------------------------------------------------

head('план — ТРИ вида мест, а не два');
{
  const p = planUnitRename(CHAIN, 'SHELL');
  is('выход производителя найден', p.outputs, [0]);
  is('вход потребителя найден с ПОЗИЦИЕЙ', p.inputs, [{ index: 1, at: [0] }]);
  is('и затронуто ровно два шага', p.steps, 2);
}
{
  // ПОГЛОТИТЕЛЬ — САМАЯ ТИХАЯ ИЗ ТРЁХ ОШИБОК: у него тот же ключ стоит и входом, и выходом.
  const p = planUnitRename(CHAIN, 'BODY');
  is('выходы: производитель И поглотитель', p.outputs, [1, 2]);
  is('входы: поглотитель и следующий узел', p.inputs, [
    { index: 2, at: [0] },
    { index: 3, at: [0] },
  ]);
  is('шаг, стоящий в обоих списках, посчитан ОДИН раз', p.steps, 3);
}
{
  // ЛЕКСИЧЕСКИЙ СКАН: свип второго производителя законным узлом не считает, а переписать обязаны.
  const p = planUnitRename(TWOPROD, 'SHELL');
  is('оба производителя в плане', p.outputs, [0, 2]);
  is('и потребитель', p.inputs, [{ index: 1, at: [0] }]);
  is('затронуто три шага', p.steps, 3);
}
{
  // Один и тот же ключ ДВАЖДЫ во входах одного шага — строка незаконная, но переписать надо обе:
  // снимок, взятый один раз, потерял бы вторую позицию, и половина ссылок осталась бы старой.
  const p = planUnitRename([op(['SHELL', 'SHELL'], 'BODY')], 'SHELL');
  is('обе позиции внутри одного шага', p.inputs, [{ index: 0, at: [0, 1] }]);
  is('а шаг всё равно один', p.steps, 1);
}
{
  const p = planUnitRename(CHAIN, 'Shell');
  is('регистр — ДРУГОЙ узел: мест нет', p.outputs, []);
  is('и входов нет', p.inputs, []);
  is('и шагов нет', p.steps, 0);
}
{
  const p = planUnitRename([{}, { inputKeys: undefined }, { outputUnitKey: undefined }], 'SHELL');
  is('пустые строки формы плана не рождают', p, { outputs: [], inputs: [], steps: 0 });
}
{
  // Пустой ключ в плане не ищется никогда — но если бы искался, он совпал бы с КАЖДЫМ шагом без
  // узла. Проверка стоит затем, чтобы ветка растворения не могла тихо превратиться в перезапись.
  const p = planUnitRename(CHAIN, '');
  is('пустой ключ ни с чем не совпал', p, { outputs: [], inputs: [], steps: 0 });
}

// --- unitRenameAct: что жест собирается сделать ---------------------------------------------------

head('вердикт — четыре исхода, и ни один не молчит');
{
  const a = unitRenameAct(CHAIN, 0, 'CARCASS', PIECES);
  is('успех', a.kind, 'rewrite');
  is('старый ключ назван вердиктом, а не вызывающим', a.from, 'SHELL');
  is('и план тот же, что считает планировщик', a.plan, planUnitRename(CHAIN, 'SHELL'));
}
is('побайтно то же самое — жеста не было', unitRenameAct(CHAIN, 0, 'SHELL', PIECES).kind, 'noop');
is('регистр — НЕ то же самое', unitRenameAct(CHAIN, 0, 'Shell', PIECES).kind, 'rewrite');
is('пустой ключ — растворение', unitRenameAct(CHAIN, 0, '', PIECES).kind, 'dissolve');
is('пробелы — тоже растворение', unitRenameAct(CHAIN, 0, '   ', PIECES).kind, 'dissolve');
{
  // Шаг без узла: сюда попадают только мимо интерфейса, но расчёт про разметку не знает.
  const a = unitRenameAct([op(['FRONT'], '')], 0, 'SHELL', PIECES);
  is('шагу без узла отказано', a.kind, 'refuse');
  yes('и отказ назвал причину', /assembles nothing/.test(a.why));
}

head('три коллизии, а не одна');
{
  const a = unitRenameAct(CHAIN, 0, 'GARMENT', PIECES);
  is('занятый ключ отказал', a.kind, 'refuse');
  yes('и назвал ЭКРАННЫЙ номер шага', /step 40/.test(a.why));
  yes('и предложил, что делать', /dissolve that unit first/.test(a.why));
}
{
  // ПРОСТРАНСТВО ИМЁН ОДНО (правило 6) — этой ветки в копии не было вовсе.
  const a = unitRenameAct(CHAIN, 0, 'FRONT', PIECES);
  is('ключ детали отказал', a.kind, 'refuse');
  yes('и назвал деталь по имени', /“front panel”/.test(a.why));
  yes('и объяснил, почему', /share one namespace/.test(a.why));
}
{
  // У детали может не быть имени — тогда отказ называет её ключом, а не пустой парой кавычек.
  const a = unitRenameAct(CHAIN, 0, 'SLEEVE', PIECES);
  is('безымянная деталь тоже отказ', a.kind, 'refuse');
  yes('и названа ключом', /“SLEEVE”/.test(a.why));
}
{
  // ТРЕТЬЯ КОЛЛИЗИЯ: LOST нигде не производится и деталью не является — и всё-таки стоит входом
  // там же, где SHELL. Перезапись поставила бы один и тот же вход дважды (правило 7).
  const a = unitRenameAct(DANGLE, 0, 'LOST', PIECES);
  is('дубль во входах отказал', a.kind, 'refuse');
  yes('и назвал шаг, где дубль', /step 20/.test(a.why));
  yes('и сказал, что дублируется', /same input there twice/.test(a.why));
}
{
  // А безопасное переименование на той же сломанной карточке проходит: висячая ссылка не при чём.
  const a = unitRenameAct(DANGLE, 0, 'CARCASS', PIECES);
  is('сломанная карточка чинится', a.kind, 'rewrite');
  is('и висячий вход в план не попал', a.plan.inputs, [{ index: 1, at: [0] }]);
}

head('порядок отказов — тот же, что у сервера: гигиена до графа');
{
  // Ключ занят И деталью, И узлом: слова обязаны быть про деталь — она ближе к тому, что человек
  // видит на полотне, и вторая проверка ничего к первой не добавила бы.
  const ops = [op(['FRONT'], 'SHELL'), op(['SHELL'], 'FRONT')];
  const a = unitRenameAct(ops, 0, 'FRONT', PIECES);
  is('деталь названа первой', a.kind, 'refuse');
  yes('и это именно она', /taken by piece/.test(a.why));
}
{
  // Растворение сильнее любой коллизии: пустой ключ никого не занимает.
  is('пустой ключ мимо коллизий', unitRenameAct(DANGLE, 0, '', PIECES).kind, 'dissolve');
}

// --- СТРУКТУРА: второй копии расчёта в репозитории нет ---------------------------------------------

head('структура — расчёт живёт в одном экземпляре');
{
  const src = (p) => readFileSync(resolve(root, p), 'utf8');
  const field = src('src/components/managers/tech-card/components/operations-field.tsx');
  yes(
    'мутатор берёт расчёт из модуля',
    /import \{[^}]*unitRenameAct[^}]*\} from '\.\/assembly-rename'/.test(field),
  );
  is(
    'и своей копии планировщика не держит',
    /function planUnitRename/.test(field),
    false,
  );
  yes(
    'проба истории тянет тот же расчёт',
    /assembly-rename/.test(src('scripts/last-mutation-probe-entry.ts')),
  );
  const hist = src('scripts/last-mutation-probe.mjs');
  yes('и зовёт его в модели жеста', /unitRenameAct\(/.test(hist));
  // Признак вернувшейся копии — не слова отказа (их проба вправе ЖДАТЬ строкой), а повторный СКАН
  // строк: собственный поиск мест по ключу и собственная проверка дубля во входах.
  is('и своего скана мест не держит', /=== from|includes\(next\)/.test(hist), false);
}

rmSync(outfile, { force: true });

console.log(`\n${checks - failed.size} из ${checks} проверок прошло`);
if (failed.size) process.exitCode = 1;
