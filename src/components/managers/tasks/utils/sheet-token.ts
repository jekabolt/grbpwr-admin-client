/**
 * ТАБЛИЦА ВНУТРИ ОПИСАНИЯ: `[[sheet:13]]` на отдельной строке. Токен живёт в самом тексте, как
 * `[[media:13]]`: нового поля на сервере нет, а файл адресуется по id, не по месту в списке.
 */

/** Источник, а не готовая регулярка: у объекта с флагом `g` есть `lastIndex`. */
export const SHEET_TOKEN_SOURCE = String.raw`\[\[sheet:(\d+)\]\]`;

/** Файлы, которые описание умеет показать таблицей. */
const TABLE_FILE = /\.(xlsx|xls|csv)$/i;

export function isTableFileName(name: string | undefined): boolean {
  return TABLE_FILE.test(name ?? '');
}

export function sheetToken(fileId: number): string {
  return `[[sheet:${fileId}]]`;
}

type TokenEdit = { start: number; end: number; text: string; sel: [number, number] };

/**
 * Вставка на отдельную строку с пустой строкой вокруг. Выделение заменяется; каретка посреди строки
 * уходит в её конец, а не режет предложение пополам.
 */
export function sheetTokenEdit(
  text: string,
  start: number,
  end: number,
  fileId: number,
): TokenEdit {
  let s = start;
  let e = end;
  if (s === e) {
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    if (s !== lineStart) {
      const lineEnd = text.indexOf('\n', s);
      s = e = lineEnd < 0 ? text.length : lineEnd;
    }
  }
  const before = text.slice(0, s);
  const after = text.slice(e);
  const lead =
    before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail =
    after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const token = sheetToken(fileId);
  const next = `${lead}${token}${trail}`;
  const caret = s + lead.length + token.length;
  return { start: s, end: e, text: next, sel: [caret, caret] };
}

/**
 * Токены вложений в одну строку поиска не показываются. Сервер режет фрагмент по 80 символов и
 * ставит многоточие, поэтому половина токена на краю убирается тоже.
 */
export function stripTaskTokens(text: string): string {
  return text
    .replace(/\[\[(?:media:\d+(?:#\d+)?|sheet:\d+)\]\]/g, ' ')
    .replace(/^(…?)[a-z:#\d]*\]\]/, '$1')
    .replace(/^…\]/, '…')
    .replace(/\[\[[a-z:#\d]*\]?(…?)$/, '$1')
    .replace(/\[…$/, '…');
}
