// ТАБЛИЦА ВХОДА-ВЫХОДА ДЛЯ БЛОКОВ ЗАМЕТКИ.
//
//   node --experimental-strip-types src/components/managers/files/note/note-blocks.check.ts
//
// Здесь считаются ИСХОДЫ, а не один общий код возврата: каждая строка таблицы ловит свою ошибку,
// чтобы один сломанный диапазон не прятал проверки удаления и вставки ниже.
import {
  insertBlock,
  replaceBlock,
  splitBlocks,
  type BlockKind,
  type NoteBlock,
} from './note-blocks.ts';

interface VisibleBlock extends NoteBlock {
  text: string;
}

interface BlockSpec {
  kind: BlockKind;
  text: string;
}

let passed = 0;
let failed = 0;
const failedRows: string[] = [];

const show = (value: unknown): string => JSON.stringify(value);

function row(id: string, note: string, run: () => unknown, want: unknown): void {
  let got: unknown;
  let error = '';
  try {
    got = run();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const ok = !error && show(got) === show(want);
  if (ok) passed += 1;
  else {
    failed += 1;
    failedRows.push(id);
  }

  console.log(`${ok ? '  ok  ' : '  FAIL'} ${id} ${note}`);
  if (!ok) {
    console.log(`        ждали  ${show(want)}`);
    console.log(`        имеем  ${error ? `ОШИБКА: ${error}` : show(got)}`);
  }
}

/** Ожидаемые координаты выводятся из ЯВНО заданных тел, а не из результата splitBlocks. */
function expected(text: string, specs: BlockSpec[]): VisibleBlock[] {
  let cursor = 0;
  return specs.map((spec) => {
    const start = text.indexOf(spec.text, cursor);
    if (start < 0) throw new Error(`в фикстуре не найдено ${show(spec.text)}`);
    cursor = start + spec.text.length;
    return { start, end: cursor, kind: spec.kind, text: spec.text };
  });
}

function visible(text: string): VisibleBlock[] {
  return splitBlocks(text).map((block) => ({
    ...block,
    text: text.slice(block.start, block.end),
  }));
}

const ERROR_LIKE = [
  '# Ошибка запроса',
  'curl -X POST https://api.example.test/orders',
  '',
  '```xml',
  '<Error>',
  '',
  '  <Message>bad request</Message>',
  '</Error>',
  '```',
  '',
  'Повторить запрос.',
].join('\n');
const ERROR_CODE = [
  '```xml',
  '<Error>',
  '',
  '  <Message>bad request</Message>',
  '</Error>',
  '```',
].join('\n');

console.log('── разбиение и диапазоны ──────────────────────────────────────────────────');

row(
  'S1',
  'ошибка.md: curl и XML-ограда с пустой строкой внутри',
  () => visible(ERROR_LIKE),
  expected(ERROR_LIKE, [
    { kind: 'heading', text: '# Ошибка запроса' },
    { kind: 'paragraph', text: 'curl -X POST https://api.example.test/orders' },
    { kind: 'code', text: ERROR_CODE },
    { kind: 'paragraph', text: 'Повторить запрос.' },
  ]),
);

const TIGHT_HEADING = 'Вступление\n## Без зазора\nследующая строка';
row(
  'S2',
  'ATX-заголовок — отдельный блок без пустых строк с обеих сторон',
  () => visible(TIGHT_HEADING),
  expected(TIGHT_HEADING, [
    { kind: 'paragraph', text: 'Вступление' },
    { kind: 'heading', text: '## Без зазора' },
    { kind: 'paragraph', text: 'следующая строка' },
  ]),
);

const UNCLOSED = 'до ограды\n\n~~~ts\nconst x = 1;\n\nx += 1;\n';
row(
  'S3',
  'незакрытая ограда забирает весь хвост, включая последний перевод строки',
  () => visible(UNCLOSED),
  expected(UNCLOSED, [
    { kind: 'paragraph', text: 'до ограды' },
    { kind: 'code', text: '~~~ts\nconst x = 1;\n\nx += 1;\n' },
  ]),
);

const CRLF = '# Заголовок\r\nтекст\r\n\r\n> цитата\r\n';
row(
  'S4',
  'CRLF: граница по LF, а CR остаётся в диапазоне блока',
  () => visible(CRLF),
  expected(CRLF, [
    { kind: 'heading', text: '# Заголовок\r' },
    { kind: 'paragraph', text: 'текст\r' },
    { kind: 'quote', text: '> цитата\r' },
  ]),
);

const KINDS = '- первый\n* второй\n\n> цитата\n> ещё\n\n| a | b |\n| - | - |\n\nобычный';
row(
  'S5',
  'kind читается по первой строке списка, цитаты, таблицы и абзаца',
  () => visible(KINDS),
  expected(KINDS, [
    { kind: 'list', text: '- первый\n* второй' },
    { kind: 'quote', text: '> цитата\n> ещё' },
    { kind: 'table', text: '| a | b |\n| - | - |' },
    { kind: 'paragraph', text: 'обычный' },
  ]),
);

row(
  'S6',
  'пустой и whitespace-only текст не содержит блоков',
  () => [splitBlocks(''), splitBlocks(' \n\t\n')],
  [[], []],
);

console.log('\n── замена и удаление ──────────────────────────────────────────────────────');

const THREE = 'первый\n\nвторой\n\nтретий';
row(
  'R1',
  'удаление первого блока забирает следующий разделитель',
  () => replaceBlock(THREE, splitBlocks(THREE), 0, ' \n '),
  'второй\n\nтретий',
);
row(
  'R2',
  'удаление последнего блока забирает предыдущий разделитель',
  () => replaceBlock(THREE, splitBlocks(THREE), 2, ''),
  'первый\n\nвторой',
);
row(
  'R3',
  'непустая замена меняет только диапазон среднего блока',
  () => replaceBlock(THREE, splitBlocks(THREE), 1, 'НОВЫЙ'),
  'первый\n\nНОВЫЙ\n\nтретий',
);
row(
  'R4',
  'замена каждого блока его же срезом оставляет исходник байт-в-байт',
  () =>
    splitBlocks(ERROR_LIKE).every(
      (block, i, blocks) =>
        replaceBlock(ERROR_LIKE, blocks, i, ERROR_LIKE.slice(block.start, block.end)) ===
        ERROR_LIKE,
    ),
  true,
);

console.log('\n── вставка ────────────────────────────────────────────────────────────────');

const TWO = 'альфа\n\nомега';
row(
  'I1',
  'after = -1 вставляет блок в начало',
  () => insertBlock(TWO, splitBlocks(TWO), -1, 'новый'),
  'новый\n\nальфа\n\nомега',
);
row(
  'I2',
  'after = last вставляет блок в конец',
  () => insertBlock(TWO, splitBlocks(TWO), 1, 'новый'),
  'альфа\n\nомега\n\nновый',
);
row(
  'I3',
  'пустой текст получает только тело без лишнего разделителя',
  () => insertBlock('', splitBlocks(''), -1, 'новый'),
  'новый',
);
row(
  'I4',
  'вставка между блоками сохраняет новый блок отдельным',
  () => insertBlock(TWO, splitBlocks(TWO), 0, 'новый'),
  'альфа\n\nновый\n\nомега',
);

console.log(
  `\nИСХОДОВ ${passed + failed}: зелёных ${passed}, ПРОВАЛОВ ${failed}${
    failed ? ` (${failedRows.join(', ')})` : ''
  }`,
);

if (failed) throw new Error('таблица note-blocks не сошлась');
