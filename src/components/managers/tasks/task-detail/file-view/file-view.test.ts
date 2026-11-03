import { describe, expect, it } from 'vitest';
import {
  bytesFromBase64,
  columnLabel,
  decodeText,
  looksNumeric,
  parseDelimited,
  taskFileViewOf,
} from './file-view';

describe('taskFileViewOf', () => {
  it('opens tables, text and html in place', () => {
    expect(taskFileViewOf('План пошива.xlsx')).toBe('sheet');
    expect(taskFileViewOf('old.XLS')).toBe('sheet');
    expect(taskFileViewOf('noext', 'application/vnd.ms-excel')).toBe('sheet');
    expect(taskFileViewOf('suppliers.CSV', 'application/octet-stream')).toBe('delimited');
    expect(taskFileViewOf('a.tsv')).toBe('delimited');
    expect(taskFileViewOf('Закупка ткани Прато.html', 'text/html')).toBe('html');
    expect(taskFileViewOf('notes.txt', 'text/plain')).toBe('text');
    expect(taskFileViewOf('data.json')).toBe('text');
    expect(taskFileViewOf('noext', 'text/plain; charset=utf-8')).toBe('text');
  });

  it('leaves pdf and images as they were', () => {
    expect(taskFileViewOf('a.pdf', 'application/pdf')).toBe('as-is');
    expect(taskFileViewOf('a.PNG')).toBe('as-is');
    expect(taskFileViewOf('a.svg', 'image/svg+xml')).toBe('as-is');
    expect(taskFileViewOf('noext', 'image/webp')).toBe('as-is');
  });

  it('downloads the rest', () => {
    expect(taskFileViewOf('a.zip', 'application/zip')).toBe('download');
    expect(taskFileViewOf('a.dxf')).toBe('download');
    expect(taskFileViewOf('', '')).toBe('download');
  });
});

describe('decodeText', () => {
  it('reads utf-8 and drops its bom', () => {
    const utf8 = new TextEncoder().encode('﻿ткань');
    expect(decodeText(utf8)).toBe('ткань');
  });

  it('falls back to windows-1251', () => {
    expect(decodeText(new Uint8Array([0xf2, 0xea, 0xe0, 0xed, 0xfc]))).toBe('ткань');
  });

  it('reads utf-16 by its bom', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x42, 0x04]))).toBe('т'.replace('т', 'т'));
  });
});

describe('bytesFromBase64', () => {
  it('round-trips', () => {
    expect(Array.from(bytesFromBase64(btoa('abc')))).toEqual([97, 98, 99]);
  });
});

describe('parseDelimited', () => {
  it('detects the delimiter', () => {
    expect(parseDelimited('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a;b\n1,5;2\n')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
    expect(parseDelimited('a\tb')).toEqual([['a', 'b']]);
  });

  it('ignores a delimiter inside quotes when detecting', () => {
    expect(parseDelimited('"a;b;c",d\n')).toEqual([['a;b;c', 'd']]);
  });

  it('keeps quotes, line breaks and CRLF right', () => {
    expect(parseDelimited('"a ""q""","b\nc"\r\n1,2\r\n')).toEqual([
      ['a "q"', 'b\nc'],
      ['1', '2'],
    ]);
  });

  it('keeps empty cells and blank lines, adds no row after the last break', () => {
    expect(parseDelimited('a,,\n\nb')).toEqual([['a', '', ''], [''], ['b']]);
    expect(parseDelimited('')).toEqual([]);
  });

  it('never coerces', () => {
    expect(parseDelimited('007,2026-11-03')).toEqual([['007', '2026-11-03']]);
  });
});

describe('columnLabel', () => {
  it('counts like a sheet', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLabel)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});

describe('looksNumeric', () => {
  it('sees numbers, not codes with letters', () => {
    expect(looksNumeric('1 200,50')).toBe(true);
    expect(looksNumeric('-3.5')).toBe(true);
    expect(looksNumeric('12%')).toBe(true);
    expect(looksNumeric('A12')).toBe(false);
    expect(looksNumeric('')).toBe(false);
  });
});
