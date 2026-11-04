import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { read, utils } from 'xlsx';
import { classifyInput, isDateFormat, openSheetBook, parseSum, type SheetBook } from './sheet-edit';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

const golden = () => fixture('plan-poshiva.xlsx');

function open(bytes: Uint8Array, name = 'plan.xlsx'): SheetBook {
  const book = openSheetBook(name, bytes);
  if (!book) throw new Error('not opened');
  return book;
}

const edit = (book: SheetBook, cells: Record<string, string>, sheet = 0) =>
  book.apply(new Map([[sheet, new Map(Object.entries(cells))]]));

/** Лист так, как его прочитает обычный просмотр (SheetJS). */
function viewed(bytes: Uint8Array, sheet = 0) {
  const wb = read(bytes, { type: 'array' });
  return wb.Sheets[wb.SheetNames[sheet]];
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Минимальная книга: листы задаются разметкой `<sheetData>` и прочим хвостом. */
function makeBook(
  sheets: string[],
  options: { styles?: string; shared?: string; names?: string; sheetPath?: string } = {},
): Uint8Array {
  const dir = options.sheetPath ?? 'worksheets/sheet';
  const list = sheets
    .map((_, i) => `<sheet name="S${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const rels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="${dir}${i + 1}.xml"/>`,
    )
    .join('');
  const parts: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/${dir}${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        (options.shared
          ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
          : '') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${list}</sheets>${options.names ?? ''}</workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships xmlns="${RELS}">${rels}` +
        (options.styles ? `<Relationship Id="rS" Type="${REL}/styles" Target="styles.xml"/>` : '') +
        (options.shared
          ? `<Relationship Id="rT" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`
          : '') +
        '</Relationships>',
    ),
  };
  if (options.styles) parts['xl/styles.xml'] = strToU8(options.styles);
  if (options.shared) parts['xl/sharedStrings.xml'] = strToU8(options.shared);
  sheets.forEach((xml, i) => {
    parts[`xl/${dir}${i + 1}.xml`] = strToU8(`<worksheet xmlns="${NS}">${xml}</worksheet>`);
  });
  return zipSync(parts);
}

const sheetXml = (bytes: Uint8Array, part = 'xl/worksheets/sheet1.xml') =>
  new TextDecoder().decode(unzipSync(bytes)[part]);

describe('golden plan-poshiva.xlsx', () => {
  it('opens as editable, formulas locked, plain cells not', () => {
    const book = open(golden());
    expect(book.sheets).toEqual([{ name: 'План пошива', editable: true }]);
    expect(book.cell(0, 'D12')).toEqual({ input: '', locked: false });
    expect(book.cell(0, 'J16')).toEqual({ input: '208', locked: true, formula: '=SUM(J2:J15)' });
    expect(book.cell(0, 'A1')).toEqual({ input: 'Изделие', locked: false });
    expect(book.cell(0, 'C2').input).toBe('25.5');
  });

  it('D12 = 7 recalculates J12, D16 and J16 live', () => {
    const totals = open(golden()).recalc(0, new Map([['D12', '7']]));
    expect(totals.get('J12')).toBe(7);
    expect(totals.get('D16')).toBe(49);
    expect(totals.get('J16')).toBe(215);
  });

  it('D12 = 7 writes the same totals and leaves every other part byte-identical', () => {
    const before = golden();
    const after = edit(open(before), { D12: '7' });

    const a = unzipSync(before);
    const b = unzipSync(after);
    expect(Object.keys(b)).toEqual(Object.keys(a));
    for (const name of Object.keys(a)) {
      if (name === 'xl/worksheets/sheet1.xml') continue;
      expect(b[name], name).toEqual(a[name]);
    }

    const xml = sheetXml(after);
    expect(xml).toContain('<c r="D12" s="7"><v>7</v></c>');
    expect(xml).toContain('<c r="J12" s="6"><f>SUM(D12:I12)</f><v>7</v></c>');
    expect(xml).toContain('<c r="D16" s="9"><f>SUM(D2:D15)</f><v>49</v></c>');
    expect(xml).toContain('<c r="J16" s="9"><f>SUM(J2:J15)</f><v>215</v></c>');

    const ws = viewed(after);
    expect(ws.D12.v).toBe(7);
    expect(ws.J12.v).toBe(7);
    expect(ws.D16.v).toBe(49);
    expect(ws.J16.v).toBe(215);
    expect(ws.A1.v).toBe('Изделие');
  });

  it('emptying D12 again returns the original values', () => {
    const after = edit(open(golden()), { D12: '7' });
    const back = edit(open(after), { D12: '' });
    const ws = viewed(back);
    const original = viewed(golden());
    expect(ws.D12).toBeUndefined();
    expect(ws.J12.v).toBe(original.J12.v);
    expect(ws.D16.v).toBe(42);
    expect(ws.J16.v).toBe(208);
    expect(sheetXml(back)).toContain('<c r="D12" s="7"/>');
    expect(utils.sheet_to_json(ws, { header: 1 })).toEqual(
      utils.sheet_to_json(original, { header: 1 }),
    );
  });

  it('keeps the style of a text edit and does not create shared strings', () => {
    const after = edit(open(golden()), { K12: 'a <b> & "c"' });
    const parts = unzipSync(after);
    expect(parts['xl/sharedStrings.xml']).toBeUndefined();
    expect(sheetXml(after)).toContain(
      '<c r="K12" s="3" t="inlineStr"><is><t>a &lt;b&gt; &amp; "c"</t></is></c>',
    );
    expect(viewed(after).K12.v).toBe('a <b> & "c"');
  });

  it('refuses a locked cell', () => {
    expect(() => edit(open(golden()), { J16: '1' })).toThrow();
  });
});

describe('xlsx splicing', () => {
  const data = (rows: string, tail = '') =>
    `<dimension ref="A1:B2"/><sheetData>${rows}</sheetData>${tail}`;

  it('decimal comma becomes a dot, Cyrillic and spaces survive', () => {
    const bytes = makeBook([data('<row r="1"><c r="A1"><v>1</v></c><c r="B1"/></row>')]);
    const book = open(bytes);
    const after = edit(book, { A1: '7,5', B1: '  Пальто ' });
    expect(sheetXml(after)).toContain('<c r="A1"><v>7.5</v></c>');
    expect(sheetXml(after)).toContain('<t xml:space="preserve">  Пальто </t>');
    expect(viewed(after).A1.v).toBe(7.5);
    expect(viewed(after).B1.v).toBe('  Пальто ');
  });

  it('a decimal comma of the same number is not a change', () => {
    const book = open(makeBook([data('<row r="1"><c r="A1"><v>7.5</v></c></row>')]));
    expect(book.sameValue(0, 'A1', '7,5')).toBe(true);
    expect(book.sameValue(0, 'A1', '8')).toBe(false);
  });

  it('inserts an absent cell in column order with the column style', () => {
    const bytes = makeBook([
      `<cols><col min="2" max="2" style="4"/></cols>` +
        data('<row r="1" spans="1:3"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>'),
    ]);
    const after = edit(open(bytes), { B1: '2' });
    expect(sheetXml(after)).toContain(
      '<c r="A1"><v>1</v></c><c r="B1" s="4"><v>2</v></c><c r="C1"><v>3</v></c>',
    );
    expect(viewed(after).B1.v).toBe(2);
  });

  it('inserts an absent row in order, extends dimension and spans', () => {
    const bytes = makeBook([
      data(
        '<row r="1" spans="1:1"><c r="A1"><v>1</v></c></row><row r="5"><c r="A5"><v>5</v></c></row>',
      ),
    ]);
    const after = edit(open(bytes), { A3: '3', C1: 'x', D7: '9' });
    const xml = sheetXml(after);
    expect(xml.indexOf('<row r="1"')).toBeLessThan(xml.indexOf('<row r="3"'));
    expect(xml.indexOf('<row r="3"')).toBeLessThan(xml.indexOf('<row r="5"'));
    expect(xml.indexOf('<row r="5"')).toBeLessThan(xml.indexOf('<row r="7"'));
    expect(xml).toContain('spans="1:3"');
    expect(xml).toContain('<dimension ref="A1:D7"/>');
    const ws = viewed(after);
    expect(ws.A3.v).toBe(3);
    expect(ws.C1.v).toBe('x');
    expect(ws.D7.v).toBe(9);
  });

  it('writes into a self-closed row and an empty sheetData', () => {
    const selfRow = makeBook([data('<row r="2"/>')]);
    expect(viewed(edit(open(selfRow), { A2: '1' })).A2.v).toBe(1);
    const empty = makeBook(['<sheetData/>']);
    expect(viewed(edit(open(empty), { B2: 'x' })).B2.v).toBe('x');
  });

  it('counts a new cell inside a SUM range', () => {
    const bytes = makeBook([
      data(
        '<row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><f>SUM(A1:A2)</f><v>1</v></c></row>',
      ),
    ]);
    const after = edit(open(bytes), { A2: '4' });
    expect(viewed(after).A3.v).toBe(5);
  });

  it('shows shared strings, edits one as inline, and leaves the table alone', () => {
    const shared = `<sst xmlns="${NS}"><si><t>Ткань</t></si><si><r><t>a</t></r><r><t>b</t></r></si></sst>`;
    const bytes = makeBook(
      [data('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>')],
      { shared },
    );
    const book = open(bytes);
    expect(book.cell(0, 'A1').input).toBe('Ткань');
    expect(book.cell(0, 'B1').input).toBe('ab');
    const after = edit(book, { A1: 'x' });
    expect(viewed(after).A1.v).toBe('x');
    expect(viewed(after).B1.v).toBe('ab');
    expect(unzipSync(after)['xl/sharedStrings.xml']).toEqual(strToU8(shared));
  });

  it('removes a stale t="str" only when the value changes', () => {
    const bytes = makeBook([
      data('<row r="1"><c r="A1"><v>1</v></c><c r="B1" t="str"><f>SUM(A1)</f><v>1</v></c></row>'),
    ]);
    const after = edit(open(bytes), { A1: '2' });
    expect(sheetXml(after)).toContain('<c r="B1"><f>SUM(A1)</f><v>2</v></c>');
  });

  it('handles SUM with cells, absolute refs and text in the range', () => {
    const bytes = makeBook([
      data(
        '<row r="1"><c r="A1"><v>1</v></c><c r="B1" t="inlineStr"><is><t>7</t></is></c>' +
          '<c r="C1"><f>SUM(A1,$A$1:$B$1)</f><v>2</v></c></row>',
      ),
    ]);
    expect(
      open(bytes)
        .recalc(0, new Map([['A1', '3']]))
        .get('C1'),
    ).toBe(6);
  });

  it('does not add float noise', () => {
    const bytes = makeBook([
      data(
        '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>0.2</v></c><c r="C1"><f>SUM(A1:B1)</f><v>1.2</v></c></row>',
      ),
    ]);
    expect(
      open(bytes)
        .recalc(0, new Map([['A1', '0.1']]))
        .get('C1'),
    ).toBe(0.3);
  });

  it('a date-format cell is locked, a number with "d" in quotes is not', () => {
    const styles =
      `<styleSheet xmlns="${NS}"><numFmts><numFmt numFmtId="170" formatCode="&quot;день&quot; 0"/>` +
      '<numFmt numFmtId="171" formatCode="dd.mm.yy"/></numFmts><cellXfs>' +
      '<xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="170"/><xf numFmtId="171"/></cellXfs></styleSheet>';
    const bytes = makeBook(
      [
        data(
          '<row r="1"><c r="A1" s="0"><v>1</v></c><c r="B1" s="1"><v>1</v></c>' +
            '<c r="C1" s="2"><v>1</v></c><c r="D1" s="3"><v>1</v></c></row>',
        ),
      ],
      { styles },
    );
    const book = open(bytes);
    expect(book.cell(0, 'A1').locked).toBe(false);
    expect(book.cell(0, 'B1').locked).toBe(true);
    expect(book.cell(0, 'C1').locked).toBe(false);
    expect(book.cell(0, 'D1').locked).toBe(true);
  });

  it('a merged tail cell and a multi-line cell are locked', () => {
    const bytes = makeBook([
      data(
        '<row r="1"><c r="A1"><v>1</v></c><c r="B1"/><c r="C1" t="inlineStr"><is><t>a&#10;b</t></is></c></row>',
        '<mergeCells><mergeCell ref="A1:B1"/></mergeCells>',
      ),
    ]);
    const book = open(bytes);
    expect(book.cell(0, 'A1').locked).toBe(false);
    expect(book.cell(0, 'B1').locked).toBe(true);
    expect(book.cell(0, 'C1').locked).toBe(true);
  });

  it('several sheets: an edit touches only its own part', () => {
    const one = data('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f>SUM(A1)</f><v>1</v></c></row>');
    const two = data('<row r="1"><c r="A1"><v>5</v></c></row>');
    const bytes = makeBook([one, two]);
    const after = edit(open(bytes), { A1: '9' }, 1);
    const a = unzipSync(bytes);
    const b = unzipSync(after);
    expect(b['xl/worksheets/sheet1.xml']).toEqual(a['xl/worksheets/sheet1.xml']);
    expect(viewed(after, 1).A1.v).toBe(9);
  });

  it('finds parts through workbook rels, not by name', () => {
    const bytes = makeBook([data('<row r="1"><c r="A1"><v>1</v></c></row>')], {
      sheetPath: 'pages/page',
    });
    const after = edit(open(bytes), { A1: '2' });
    expect(viewed(after).A1.v).toBe(2);
  });
});

describe('read-only fallback', () => {
  const row = (cells: string) => `<sheetData><row r="1">${cells}</row></sheetData>`;
  const editable = (bytes: Uint8Array, sheet = 0) =>
    openSheetBook('a.xlsx', bytes)?.sheets[sheet].editable ?? false;

  it.each([
    ['unknown function', '<c r="B1"><f>AVERAGE(A1:A1)</f><v>1</v></c>'],
    ['expression', '<c r="B1"><f>SUM(A1)*2</f><v>2</v></c>'],
    ['bare reference', '<c r="B1"><f>A1</f><v>1</v></c>'],
    ['shared formula', '<c r="B1"><f t="shared" ref="B1:B1" si="0">SUM(A1)</f><v>1</v></c>'],
    ['array formula', '<c r="B1"><f t="array" ref="B1:B1">SUM(A1)</f><v>1</v></c>'],
    ['cycle', '<c r="B1"><f>SUM(A1:C1)</f><v>1</v></c>'],
    ['total that does not add up', '<c r="B1"><f>SUM(A1)</f><v>99</v></c>'],
    ['prefixed cell', '<x:c r="B1"/>'],
  ])('%s', (_, cell) => {
    expect(editable(makeBook([row(`<c r="A1"><v>1</v></c>${cell}`)]))).toBe(false);
  });

  it('error cell inside a SUM range', () => {
    const cells = '<c r="A1" t="e"><v>#REF!</v></c><c r="B1"><f>SUM(A1)</f><v>1</v></c>';
    expect(editable(makeBook([row(cells)]))).toBe(false);
  });

  it('cross-sheet reference locks the whole book', () => {
    const one = row('<c r="A1"><v>1</v></c>');
    const two = row('<c r="A1"><f>SUM(\'S1\'!A1)</f><v>1</v></c>');
    const bytes = makeBook([one, two]);
    expect(editable(bytes, 0)).toBe(false);
    expect(editable(bytes, 1)).toBe(false);
  });

  it('an unknown formula on one sheet leaves the other editable', () => {
    const one = row('<c r="A1"><f>NOW()</f><v>1</v></c>');
    const two = row('<c r="A1"><v>1</v></c>');
    const bytes = makeBook([one, two]);
    expect(editable(bytes, 0)).toBe(false);
    expect(editable(bytes, 1)).toBe(true);
  });

  it('named range with an unknown formula locks the whole book', () => {
    const one = row('<c r="A1"><f>Total</f><v>1</v></c>');
    const two = row('<c r="A1"><v>1</v></c>');
    const names = '<definedNames><definedName name="Total">S2!$A$1</definedName></definedNames>';
    expect(editable(makeBook([one, two], { names }), 1)).toBe(false);
  });

  it('protected sheet and table sheet', () => {
    expect(editable(makeBook([`${row('')}<sheetProtection sheet="1"/>`]))).toBe(false);
    expect(editable(makeBook([`${row('')}<tableParts count="1"/>`]))).toBe(false);
  });

  it('garbage, an .xls name and a zip without a workbook', () => {
    expect(openSheetBook('a.xlsx', new Uint8Array([1, 2, 3]))).toBeNull();
    expect(openSheetBook('a.xls', golden())).toBeNull();
    expect(openSheetBook('a.xlsm', golden())).toBeNull();
    expect(openSheetBook('a.xlsx', zipSync({ 'a.txt': strToU8('a') }))).toBeNull();
  });

  it('never saves a formula it cannot count', () => {
    const book = open(makeBook([row('<c r="A1"><v>1</v></c><c r="B1"><f>NOW()</f><v>1</v></c>')]));
    expect(() => edit(book, { A1: '2' })).toThrow();
  });
});

describe('csv', () => {
  const u8 = (text: string) => new TextEncoder().encode(text);
  const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  const csv = (source: string | Uint8Array) =>
    open(typeof source === 'string' ? u8(source) : source, 'a.csv');

  it('golden csv: only the edited field changes', () => {
    const source = fixture('plan-poshiva.csv');
    const book = csv(source);
    const after = text(edit(book, { D2: '3' }));
    const lines = text(source).split('\n');
    const changed = after.split('\n');
    expect(changed[1].trimEnd()).toBe('Пальто,427 Ricceri / Rasta,25.5,3,1,5,4,,,10,');
    expect(changed.slice(2)).toEqual(lines.slice(2));
    expect(changed[0]).toBe(lines[0]);
    expect(changed[3]).toBe(lines[3]);
  });

  it('keeps delimiter, CRLF, BOM, quoting and a missing last newline', () => {
    const source = '﻿"a";b;"c d"\r\n1;"2";3';
    const after = text(edit(csv(source), { B2: 'x;y', C2: '9' }));
    expect(after).toBe('﻿"a";b;"c d"\r\n1;"x;y";9');
  });

  it('a BOM survives byte for byte', () => {
    const after = edit(csv('﻿a,b\n1,2\n'), { A2: '7' });
    expect([...after.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('quotes what needs it and doubles quotes', () => {
    expect(text(edit(csv('a,b\n'), { A1: 'x,"y"' }))).toBe('"x,""y""",b\n');
    expect(text(edit(csv('"a",b\n'), { A1: 'plain' }))).toBe('"plain",b\n');
  });

  it('pads a short row', () => {
    expect(text(edit(csv('a,b,c\n1\n'), { C2: 'z' }))).toBe('a,b,c\n1,,z\n');
  });

  it('windows-1251 round-trips and refuses a character it cannot hold', () => {
    const bytes = new Uint8Array([0xc0, 0x2c, 0x62, 0x0a]);
    const book = csv(bytes);
    expect(book.cell(0, 'A1').input).toBe('А');
    expect([...edit(book, { B1: 'Б' })]).toEqual([0xc0, 0x2c, 0xc1, 0x0a]);
    expect(() => edit(book, { B1: '中' })).toThrow();
  });

  it('utf-16 keeps its encoding', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x61, 0, 0x2c, 0, 0x62, 0]);
    const after = edit(csv(bytes), { B1: 'c' });
    expect([...after]).toEqual([0xff, 0xfe, 0x61, 0, 0x2c, 0, 0x63, 0]);
  });

  it('binary bytes and an empty file are view only', () => {
    expect(openSheetBook('a.csv', new Uint8Array([0x61, 0, 0x62]))).toBeNull();
    expect(openSheetBook('a.csv', new Uint8Array())).toBeNull();
  });

  it('has no formulas: =SUM stays a plain field', () => {
    const book = csv('=SUM(A1),b\n');
    expect(book.cell(0, 'A1')).toEqual({ input: '=SUM(A1)', locked: false });
    expect(book.recalc(0, new Map()).size).toBe(0);
  });

  it('a multi-line field is locked', () => {
    expect(csv('"a\nb",c\n').cell(0, 'A1').locked).toBe(true);
  });
});

describe('helpers', () => {
  it('classifyInput', () => {
    expect(classifyInput('')).toEqual({ kind: 'empty' });
    expect(classifyInput('7')).toEqual({ kind: 'number', value: '7' });
    expect(classifyInput('-7,50')).toEqual({ kind: 'number', value: '-7.5' });
    expect(classifyInput('007')).toEqual({ kind: 'text', value: '007' });
    expect(classifyInput('1e5')).toEqual({ kind: 'text', value: '1e5' });
    expect(classifyInput('1234567890123456')).toEqual({
      kind: 'text',
      value: '1234567890123456',
    });
  });

  it('parseSum', () => {
    expect(parseSum('SUM(A1:B2)')).toEqual([{ r1: 0, c1: 0, r2: 1, c2: 1 }]);
    expect(parseSum('sum(A1)')).toBeNull();
    expect(parseSum('SUM(A1;B1)')).toBeNull();
    expect(parseSum('SUM(S1!A1)')).toBeNull();
    expect(parseSum('SUM()')).toBeNull();
    expect(parseSum('SUM(SUM(A1))')).toBeNull();
  });

  it('isDateFormat', () => {
    expect(isDateFormat('dd.mm.yy')).toBe(true);
    expect(isDateFormat('[$-419]mmmm')).toBe(true);
    expect(isDateFormat('0.##')).toBe(false);
    expect(isDateFormat('General')).toBe(false);
    expect(isDateFormat('"шт" 0;[Red]0')).toBe(false);
    expect(isDateFormat('#,##0_d')).toBe(false);
  });
});
