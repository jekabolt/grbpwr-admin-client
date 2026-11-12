import { describe, expect, it } from 'vitest';
import { searchTasks } from './search';
import { isTableFileName, sheetToken, sheetTokenEdit, stripTaskTokens } from './sheet-token';

const apply = (text: string, start: number, end = start) => {
  const edit = sheetTokenEdit(text, start, end, 13);
  return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
};

describe('sheetTokenEdit', () => {
  const t = sheetToken(13);

  it('stands on its own line', () => {
    expect(apply('', 0)).toBe(t);
    expect(apply('abc', 3)).toBe(`abc\n\n${t}`);
    expect(apply('abc', 0)).toBe(`${t}\n\nabc`);
    expect(apply('abc\n\n', 5)).toBe(`abc\n\n${t}`);
    expect(apply('abc\n', 4)).toBe(`abc\n\n${t}`);
  });

  it('never cuts a line', () => {
    expect(apply('abc def\nnext', 3)).toBe(`abc def\n\n${t}\n\nnext`);
  });

  it('replaces a selection', () => {
    expect(apply('a b c', 2, 3)).toBe(`a \n\n${t}\n\n c`);
  });

  it('puts the caret after the token', () => {
    const edit = sheetTokenEdit('abc', 3, 3, 13);
    expect(edit.sel[0]).toBe(3 + 2 + t.length);
  });
});

describe('stripTaskTokens', () => {
  it('removes whole tokens', () => {
    expect(stripTaskTokens('a [[media:1]] b [[media:1#2]] c [[sheet:13]] d')).toBe('a   b   c   d');
  });

  it('removes a token the server cut in half', () => {
    expect(stripTaskTokens('…heet:13]] text')).toBe('… text');
    expect(stripTaskTokens('…]] text')).toBe('… text');
    expect(stripTaskTokens('…] text')).toBe('… text');
    expect(stripTaskTokens('text [[she…')).toBe('text …');
    expect(stripTaskTokens('text [[sheet:13…')).toBe('text …');
    expect(stripTaskTokens('text [[sheet:13]…')).toBe('text …');
    expect(stripTaskTokens('text […')).toBe('text …');
  });

  it('leaves ordinary brackets alone', () => {
    expect(stripTaskTokens('a [b] c')).toBe('a [b] c');
  });
});

describe('search snippet', () => {
  it('shows no token from the server', () => {
    const task = {
      id: 1,
      boardId: 1,
      archivedAt: '',
      task: { title: 't', description: '' },
      checklist: [],
    };
    const [hit] = searchTasks([task as never], 'text', [
      { taskId: 1, field: 'description', snippet: '…heet:13]] text [[sheet:13]] end [[sh…' },
    ] as never);
    expect(hit.snippet).toBe('… text end …');
  });
});

describe('isTableFileName', () => {
  it('knows the table files', () => {
    expect(['a.xlsx', 'a.XLS', 'b.csv'].every(isTableFileName)).toBe(true);
    expect(['a.txt', 'a.html', 'xlsx', undefined].some(isTableFileName)).toBe(false);
  });
});
