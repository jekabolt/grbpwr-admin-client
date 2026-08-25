// ТАБЛИЦА ВХОДА-ВЫХОДА ДЛЯ КНОПКИ «CODE» И ВСТАВКИ МЕДИА.
//
//   node scripts/format-edits-probe.mjs
//
// Просьба владельца звучала как один дефект («код делает `` а не ````»), а дефектов три, и они
// разные: пустое выделение УЧЕТВЕРЯЕТ пару, тройной клик по строке даёт ОГРАДУ, повтор на свежей
// ограде ВКЛАДЫВАЕТ ограду в ограду. Поэтому таблица, а не один пример: строки, помеченные ★,
// обязаны быть КРАСНЫМИ до починки — это негативный контроль самой таблицы. Зелёная таблица на
// невыполненной работе означала бы, что она смотрит не туда.
//
// СЧИТАЮТСЯ ИСХОДЫ, А НЕ КОД ВОЗВРАТА: каждая строка ловится по отдельности, отсутствующая
// функция считается ПРОВАЛОМ строки, а не обрывом прогона.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `format-edits-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'format-edits-entry.ts')], bundle: true, platform: 'node',
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

const show = (s) => JSON.stringify(s);
const same = (a, b) =>
  a && b && a.start === b.start && a.end === b.end && a.text === b.text &&
  a.sel?.[0] === b.sel?.[0] && a.sel?.[1] === b.sel?.[1];

/** Как выглядит поле ПОСЛЕ правки — то, что человек увидит; сравнение идёт по Edit. */
const applied = (text, edit) =>
  edit ? text.slice(0, edit.start) + edit.text + text.slice(edit.end) : '—';

function row(id, note, run, want, input) {
  let got = null;
  let err = '';
  try {
    got = run();
    if (!got || typeof got !== 'object') err = `вернулось ${show(got)}`;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const ok = !err && same(got, want);
  if (ok) pass += 1;
  else { fail += 1; failed.push(id); }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${id} ${note}`);
  if (!ok) {
    console.log(`        ждали  ${show(want)}`);
    console.log(`        имеем  ${err ? `ОШИБКА: ${err}` : show(got)}`);
    if (!err && input != null) {
      console.log(`        текст после правки: ${show(applied(input, got))}`);
    }
  }
}

const E = (start, end, text, sel) => ({ start, end, text, sel });
const code = (t, s, e) => m.codeEdit(t, s, e);

console.log('── кнопка code: одна чистая функция на три дефекта ──────────────────────────');

row('R1 ', 'пустое выделение даёт пару, каретка между', () => code('', 0, 0), E(0, 0, '``', [1, 1]), '');
row('R2 ', 'каретка МЕЖДУ парой — пара снимается', () => code('``', 1, 1), E(0, 2, '', [0, 0]), '``');
row('R3 ★', 'каретка ПОСЛЕ пары — пара снимается (Д1)', () => code('``', 2, 2), E(0, 2, '', [0, 0]), '``');
row('R4 ★', 'каретка ПЕРЕД парой — пара снимается (Д1)', () => code('``x', 0, 0), E(0, 2, '', [0, 0]), '``x');
row('R5 ', 'слово оборачивается в бэктики', () => code('word', 0, 4), E(0, 4, '`word`', [1, 5]), 'word');
row('R6 ', 'обёрнутое слово разворачивается', () => code('`word`', 0, 6), E(0, 6, 'word', [0, 4]), '`word`');
row('R7 ★', 'тройной клик по строке — НЕ ограда (Д2)', () => code('alpha\n', 0, 6), E(0, 5, '`alpha`', [1, 6]), 'alpha\n');
row('R8 ★', 'строка с хвостовым \\n в середине текста (Д2)', () => code('a\nbb\ncc', 2, 5), E(2, 4, '`bb`', [3, 5]), 'a\nbb\ncc');
row('R9 ', 'две строки — ограда', () => code('a\nb', 0, 3), E(0, 3, '```\na\nb\n```', [4, 7]), 'a\nb');
row('R10', 'ограда целиком — разворачивается', () => code('```\na\nb\n```', 0, 11), E(0, 11, 'a\nb', [0, 3]), '```\na\nb\n```');
row('R11 ★', 'ТЕЛО свежей ограды — разворот, не вложение (Д3)', () => code('```\na\nb\n```', 4, 7), E(0, 11, 'a\nb', [0, 3]), '```\na\nb\n```');
row('R12 ★', 'ОДНОСТРОЧНОЕ тело ограды — разворот (Д3+Д2)', () => code('```\nalpha\n```', 4, 9), E(0, 13, 'alpha', [0, 5]), '```\nalpha\n```');

// R13 — ЗАЩИТА ЧЁТНОСТЬЮ. Строка «x» лежит В ЗАЗОРЕ между двумя соседними блоками кода: сверху
// закрывающая ограда, снизу открывающая — то есть «строка выше и строка ниже обе ```» выполняется,
// а телом ограды строка НЕ является. Разворот здесь склеил бы два разных блока в один.
const GAP = '```\na\n```\nx\n```\nb\n```';
row('R13', 'строка в зазоре между двумя оградами — НЕ разворот', () => code(GAP, 10, 11), E(10, 11, '`x`', [11, 12]), GAP);
row('R14', 'каретка после ТРЁХ бэктиков — пара не снимается', () => code('```', 3, 3), E(3, 3, '``', [4, 4]), '```');

console.log('\n── вставка медиа ───────────────────────────────────────────────────────────');

const media = (t, s, e, items) => m.mediaEdit(t, s, e, items);
const M1T = '![media 5](https://x/a.jpg)';
row('M1 ', 'один кадр в каретку, каретка после', () => media('hello ', 6, 6, [{ id: 5, url: 'https://x/a.jpg' }]),
  E(6, 6, M1T, [6 + M1T.length, 6 + M1T.length]), 'hello ');
row('M2 ', 'выделение стало подписью', () => media('see this', 4, 8, [{ id: 5, url: 'u' }]),
  E(4, 8, '![this](u)', [14, 14]), 'see this');
const M3T = '\n![media 1](u1)\n![media 2](u2)\n';
row('M3 ', 'два кадра — абзац только из снимков, с добивкой \\n', () => media('ab', 1, 1, [{ id: 1, url: 'u1' }, { id: 2, url: 'u2' }]),
  E(1, 1, M3T, [1 + M3T.length, 1 + M3T.length]), 'ab');
const M4T = '![media 1](u1)\n![media 2](u2)';
row('M4 ', 'каретка в начале пустого текста — без ведущего \\n', () => media('', 0, 0, [{ id: 1, url: 'u1' }, { id: 2, url: 'u2' }]),
  E(0, 0, M4T, [M4T.length, M4T.length]), '');
const M5T = '![media 7](https://x/a%20%281%29.jpg)';
row('M5 ', 'скобки и пробел в адресе экранируются', () => media('', 0, 0, [{ id: 7, url: 'https://x/a (1).jpg' }]),
  E(0, 0, M5T, [M5T.length, M5T.length]), '');

// КОНТРОЛЬ M5: токен обязан МАТЧИТЬСЯ регуляркой разметчика. Литерал скопирован из
// markdown-view.tsx (INLINE): в адресе запрещены `)` и пробел — незаэкранированный адрес порвал бы
// токен, и снимок в заметке показался бы текстом.
const INLINE = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*\s][^*]*?\*)|(!?\[[^\]]*\]\([^)\s]*\))/g;
{
  let got = null;
  let err = '';
  try { got = media('', 0, 0, [{ id: 7, url: 'https://x/a (1).jpg' }]); } catch (e) { err = String(e); }
  const token = got?.text ?? '';
  const re = new RegExp(INLINE.source, 'g');
  const hit = re.exec(token);
  const ok = !err && hit !== null && hit[0] === token;
  if (ok) pass += 1; else { fail += 1; failed.push('M5-re'); }
  console.log(`${ok ? '  ok  ' : '  FAIL'} M5-re токен целиком матчится регуляркой INLINE`);
  if (!ok) console.log(`        токен ${show(token)}, матч ${show(hit?.[0] ?? null)}${err ? ` (${err})` : ''}`);
}
// И ВТОРАЯ ПОЛОВИНА КОНТРОЛЯ: сырой адрес регуляркой НЕ ловится целиком. Без этой строки зелёная
// строка выше не отличима от «регулярка ловит что угодно».
{
  const raw = '![media 7](https://x/a (1).jpg)';
  const re = new RegExp(INLINE.source, 'g');
  const hit = re.exec(raw);
  const ok = hit === null || hit[0] !== raw;
  if (ok) pass += 1; else { fail += 1; failed.push('M5-neg'); }
  console.log(`${ok ? '  ok  ' : '  FAIL'} M5-neg сырой адрес со скобками токеном НЕ становится`);
}

console.log(`\nИСХОДОВ ${pass + fail}: зелёных ${pass}, ПРОВАЛОВ ${fail}${fail ? ` (${failed.join(', ')})` : ''}`);
process.exit(fail === 0 ? 0 : 1);
