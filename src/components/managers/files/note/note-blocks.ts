/**
 * ЧИСТАЯ РАЗМЕТКА ЗАМЕТКИ НА БЛОКИ — БЕЗ DOM, REACT И СОСТОЯНИЯ РЕДАКТОРА.
 *
 * Координаты всегда относятся к ИСХОДНОЙ строке. Пустые строки между блоками не принадлежат
 * ни одному из них: поэтому замена может оставить весь остальной текст байт-в-байт, а удаление
 * знает, какой ровно разделитель убрать вместе с блоком.
 */

export type BlockKind = 'heading' | 'code' | 'list' | 'quote' | 'table' | 'paragraph';

export interface NoteBlock {
  start: number;
  end: number;
  kind: BlockKind;
}

interface Line {
  start: number;
  /** Конец строки без `\n`; у CRLF стоящий перед ним `\r` остаётся здесь. */
  end: number;
  text: string;
}

interface Fence {
  marker: '`' | '~';
  length: number;
}

const BLANK_LINE = /^\s*$/;
const HEADING_LINE = /^[ \t]*#{1,6}(?:[ \t]+|\r?$)/;
const LIST_LINE = /^[ \t]*(?:[-*+](?:[ \t]+|\r?$)|\d+\.(?:[ \t]+|\r?$))/;

/** Разрезаем только по `\n`: так `\r` не теряется и диапазоны годятся для исходного CRLF. */
function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;

  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    lines.push({ start, end, text: text.slice(start, end) });
    if (newline === -1) break;
    start = newline + 1;
  }

  return lines;
}

/** Открывающая ограда: язык и прочий хвост намеренно не разбираются. */
function openingFence(line: string): Fence | null {
  const match = /^[ \t]*(`{3,}|~{3,})/.exec(line);
  if (!match) return null;
  return { marker: match[1][0] as Fence['marker'], length: match[1].length };
}

/** Закрывающая ограда — тот же знак, не короче открывающей, и больше ничего на строке. */
function closesFence(line: string, fence: Fence): boolean {
  let at = 0;
  while (line[at] === ' ' || line[at] === '\t') at += 1;

  let count = 0;
  while (line[at + count] === fence.marker) count += 1;
  if (count < fence.length) return false;

  return /^[ \t]*\r?$/.test(line.slice(at + count));
}

function kindOf(firstLine: string): BlockKind {
  if (HEADING_LINE.test(firstLine)) return 'heading';
  if (openingFence(firstLine)) return 'code';
  if (LIST_LINE.test(firstLine)) return 'list';
  if (/^[ \t]*>/.test(firstLine)) return 'quote';
  if (/^[ \t]*\|/.test(firstLine)) return 'table';
  return 'paragraph';
}

/**
 * Делит заметку на диапазоны непустых блоков.
 *
 * Заголовок всегда занимает одну строку. Ограда, наоборот, забирает всё до подходящего закрытия,
 * включая пустые строки и похожую на markdown разметку внутри; незакрытая — весь хвост заметки.
 */
export function splitBlocks(text: string): NoteBlock[] {
  if (!text) return [];

  const lines = linesOf(text);
  const blocks: NoteBlock[] = [];
  let line = 0;

  while (line < lines.length) {
    while (line < lines.length && BLANK_LINE.test(lines[line].text)) line += 1;
    if (line >= lines.length) break;

    const first = lines[line];
    const fence = openingFence(first.text);

    if (fence) {
      let close = line + 1;
      while (close < lines.length && !closesFence(lines[close].text, fence)) close += 1;

      if (close >= lines.length) {
        blocks.push({ start: first.start, end: text.length, kind: 'code' });
        break;
      }

      blocks.push({ start: first.start, end: lines[close].end, kind: 'code' });
      line = close + 1;
      continue;
    }

    if (HEADING_LINE.test(first.text)) {
      blocks.push({ start: first.start, end: first.end, kind: 'heading' });
      line += 1;
      continue;
    }

    let next = line + 1;
    while (
      next < lines.length &&
      !BLANK_LINE.test(lines[next].text) &&
      !HEADING_LINE.test(lines[next].text) &&
      !openingFence(lines[next].text)
    ) {
      next += 1;
    }

    blocks.push({ start: first.start, end: lines[next - 1].end, kind: kindOf(first.text) });
    line = next;
  }

  return blocks;
}

/**
 * Заменяет только диапазон блока. Пустая правка удаляет ещё один СОСЕДНИЙ разделитель: следующий,
 * если он есть, иначе предыдущий. Поэтому первый и последний блок не оставляют пустой край.
 */
export function replaceBlock(text: string, blocks: NoteBlock[], i: number, next: string): string {
  const block = blocks[i];
  if (!block) return text;
  if (next.trim()) return text.slice(0, block.start) + next + text.slice(block.end);

  const following = blocks[i + 1];
  if (following) return text.slice(0, block.start) + text.slice(following.start);

  const previous = blocks[i - 1];
  if (previous) return text.slice(0, previous.end) + text.slice(block.end);

  return text.slice(0, block.start) + text.slice(block.end);
}

/**
 * Вставляет блок с каноническим разделителем `\n\n`.
 *
 * На краях исходные ведущие/хвостовые пустые строки остаются снаружи. В середине старый
 * разделитель заменяется двумя каноническими — по одному с каждой стороны нового блока: иначе
 * вставка рядом с заголовком могла бы незаметно склеиться с соседним абзацем.
 */
export function insertBlock(
  text: string,
  blocks: NoteBlock[],
  after: number,
  body: string,
): string {
  if (blocks.length === 0) return body;

  if (after < 0) {
    const at = blocks[0].start;
    return text.slice(0, at) + body + '\n\n' + text.slice(at);
  }

  const last = blocks.length - 1;
  if (after >= last) {
    const at = blocks[last].end;
    return text.slice(0, at) + '\n\n' + body + text.slice(at);
  }

  const left = blocks[after];
  const right = blocks[after + 1];
  return text.slice(0, left.end) + '\n\n' + body + '\n\n' + text.slice(right.start);
}
