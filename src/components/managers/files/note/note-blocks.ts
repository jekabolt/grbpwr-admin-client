/**
 * ВРЕМЕННАЯ РЕАЛИЗАЦИЯ КОНТРАКТА (дорожка U). Настоящий файл пишет дорожка S, и при слиянии
 * берётся он — этот лишь держит сборку ветки U по тому же контракту
 * (tmp/plans/note-blocks/01-TASKS.md, «Контракт note-blocks.ts»).
 */

export type BlockKind = 'heading' | 'code' | 'list' | 'quote' | 'table' | 'paragraph';
/** [start,end) в исходной строке, без окружающих пустых строк. */
export interface NoteBlock {
  start: number;
  end: number;
  kind: BlockKind;
}

const BLANK = /^\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}#{1,6}(\s|$)/;

function kindOf(line: string): BlockKind {
  if (HEADING.test(line)) return 'heading';
  if (FENCE.test(line)) return 'code';
  if (/^\s{0,3}([-*+]\s|\d+[.)]\s)/.test(line)) return 'list';
  if (/^\s{0,3}>/.test(line)) return 'quote';
  if (/^\s{0,3}\|/.test(line)) return 'table';
  return 'paragraph';
}

export function splitBlocks(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  let cur: NoteBlock | null = null;
  let fence: string | null = null;
  let at = 0;
  for (const line of text.split('\n')) {
    const end = at + line.length;
    if (fence !== null && cur) {
      cur.end = end;
      const close = line.trim();
      if (close.startsWith(fence) && BLANK.test(close.slice(close.match(/^[`~]+/)![0].length))) {
        out.push(cur);
        cur = null;
        fence = null;
      }
    } else if (BLANK.test(line)) {
      if (cur) out.push(cur);
      cur = null;
    } else if (FENCE.test(line)) {
      if (cur) out.push(cur);
      cur = { start: at, end, kind: 'code' };
      fence = line.match(FENCE)![1];
    } else if (HEADING.test(line)) {
      if (cur) out.push(cur);
      out.push({ start: at, end, kind: 'heading' });
      cur = null;
    } else if (cur) {
      cur.end = end;
    } else {
      cur = { start: at, end, kind: kindOf(line) };
    }
    at = end + 1;
  }
  if (cur) out.push(cur);
  return out;
}

export function replaceBlock(text: string, blocks: NoteBlock[], i: number, next: string): string {
  const b = blocks[i];
  if (!b) return text;
  if (next.trim()) return text.slice(0, b.start) + next + text.slice(b.end);
  // Удаление — вместе с одним разделителем: следующим, а у последнего блока — предыдущим.
  const after = blocks[i + 1];
  if (after) return text.slice(0, b.start) + text.slice(after.start);
  const before = blocks[i - 1];
  if (before) return text.slice(0, before.end) + text.slice(b.end);
  return text.slice(0, b.start) + text.slice(b.end);
}

export function insertBlock(
  text: string,
  blocks: NoteBlock[],
  after: number,
  body: string,
): string {
  if (!blocks.length) return text.trim() ? `${text}\n\n${body}` : body;
  if (after < 0) {
    const first = blocks[0];
    return `${text.slice(0, first.start)}${body}\n\n${text.slice(first.start)}`;
  }
  const b = blocks[Math.min(after, blocks.length - 1)];
  return `${text.slice(0, b.end)}\n\n${body}${text.slice(b.end)}`;
}
