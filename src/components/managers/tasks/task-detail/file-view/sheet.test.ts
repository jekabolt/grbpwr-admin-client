import { describe, expect, it } from 'vitest';
import { utils, type WorkSheet } from 'xlsx';
import { MAX_TABLE_ROWS } from './file-view';
import { inkOn, sheetRows } from './sheet';

describe('sheetRows', () => {
  it('takes the cached formula value, formatted text and solid fill', () => {
    const ws: WorkSheet = {
      '!ref': 'A1:B2',
      A1: {
        t: 's',
        v: 'Изделие',
        w: 'Изделие',
        s: { patternType: 'solid', fgColor: { rgb: '2B3138' } },
      },
      B2: {
        t: 'n',
        v: 42,
        w: '42.00',
        f: 'SUM(D2:D15)',
        s: { patternType: 'solid', fgColor: { rgb: 'FFE6E9EC' } },
      },
    };
    const { rows, totalRows } = sheetRows(ws, utils);
    expect(totalRows).toBe(2);
    expect(rows[0][0]).toEqual({ text: 'Изделие', numeric: false, fill: '2B3138' });
    expect(rows[0][1]).toEqual({ text: '', numeric: false, fill: undefined });
    expect(rows[1][1]).toEqual({ text: '42.00', numeric: true, fill: 'E6E9EC' });
  });

  it('gives no fill for a theme colour', () => {
    const ws: WorkSheet = {
      '!ref': 'A1:A1',
      A1: { t: 's', v: 'a', s: { patternType: 'solid', fgColor: { theme: 3 } } },
    };
    expect(sheetRows(ws, utils).rows[0][0].fill).toBeUndefined();
  });

  it('caps the rows but reports the real total', () => {
    const { rows, totalRows } = sheetRows({ '!ref': 'A1:A9000' }, utils);
    expect(rows).toHaveLength(MAX_TABLE_ROWS);
    expect(totalRows).toBe(9000);
  });

  it('handles an empty sheet', () => {
    expect(sheetRows({}, utils)).toEqual({ rows: [], totalRows: 0 });
  });
});

describe('inkOn', () => {
  it('stays readable on dark and light fills', () => {
    expect(inkOn('2B3138')).toBe('#ffffff');
    expect(inkOn('FCE8D2')).toBe('#000000');
    expect(inkOn('E6E9EC')).toBe('#000000');
  });
});
