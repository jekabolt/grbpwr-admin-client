// ЧТО ПРОИСХОДИТ СО ВТОРЫМ ⌘V — ТАБЛИЦЕЙ.
//
//   node scripts/intake-queue-probe.mjs
//
// Владелец просил ровно две вещи: чтобы вторая вставка ДОБАВЛЯЛА кадр к первой, и чтобы «нажали
// аплоуд — они в том виде и отправляются». Первая половина живёт здесь, в одной чистой функции, и
// проверяется без браузера. Вторая половина проверяется стендом — тут её нет, и делать вид, что
// зелёная таблица про неё что-то говорит, нельзя.
//
// ОТДЕЛЬНО ПРОВЕРЯЕТСЯ ЛИЧНОСТЬ МАССИВА: когда брать нечего, очередь обязана вернуться ТОЙ ЖЕ,
// а не новой копией с тем же содержимым. Новый массив — это новый проп у приёмки, то есть сброс
// вида, в котором человек сейчас работает (у него там открыт кроп).
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `intake-queue-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'intake-queue-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
  },
});
const m = await import(pathToFileURL(outfile).href);

let pass = 0;
let fail = 0;
const failed = [];
const ck = (id, note, ok, detail = '') => {
  if (ok) pass += 1; else { fail += 1; failed.push(id); }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${id} ${note}${detail ? `  — ${detail}` : ''}`);
};

const f = (name) => new File([name], name, { type: 'image/png' });
const A = f('a'), B = f('b'), C = f('c'), D = f('d'), E = f('e');
const names = (list) => list.map((x) => x.name).join(',');

function row(id, note, got, wantNames, wantDropped) {
  const ok = names(got.queue) === wantNames && got.dropped === wantDropped;
  ck(id, note, ok, ok ? `[${names(got.queue)}] отброшено ${got.dropped}` :
    `ждали [${wantNames}] отброшено ${wantDropped}, имеем [${names(got.queue)}] отброшено ${got.dropped}`);
}

row('Q1', 'второй ⌘V ДОБАВЛЯЕТ, а не замещает', m.mergeQueue([A], [B]), 'a,b', 0);
row('Q2', 'потолок слота режет вставку по остатку мест', m.mergeQueue([A, B], [C, D], 3), 'a,b,c', 1);
row('Q3', 'слот на одну картинку ЗАМЕЩАЕТ кадр', m.mergeQueue([A], [B], 1), 'b', 0);
row('Q3b', 'и берёт из пачки один, назвав остальные', m.mergeQueue([A], [C, D, E], 1), 'c', 2);
row('Q4', 'пустая вставка не трогает очередь даже при limit=1', m.mergeQueue([A], [], 1), 'a', 0);
row('Q5', 'полная очередь: не взято ничего, отброшено всё', m.mergeQueue([A, B, C], [D, E], 3), 'a,b,c', 2);
row('Q6', 'без потолка берётся вся вставка', m.mergeQueue([A], [B, C, D]), 'a,b,c,d', 0);

// ЛИЧНОСТЬ МАССИВА. Без этой пары строк «очередь не тронута» подтверждалось бы и новой копией —
// а копия перерисовывает приёмку и роняет открытый в ней кроп.
{
  const prev = [A];
  ck('Q4-ref', 'пустая вставка: та же ссылка на массив', m.mergeQueue(prev, [], 1).queue === prev);
  const full = [A, B, C];
  ck('Q5-ref', 'полная очередь: та же ссылка на массив', m.mergeQueue(full, [D], 3).queue === full);
  const grew = m.mergeQueue(prev, [B]);
  ck('Q1-ref', 'а когда взяли — массив НОВЫЙ, прежний не тронут',
    grew.queue !== prev && names(prev) === 'a');
}

console.log(`\nИСХОДОВ ${pass + fail}: зелёных ${pass}, ПРОВАЛОВ ${fail}${fail ? ` (${failed.join(', ')})` : ''}`);
process.exit(fail === 0 ? 0 : 1);
