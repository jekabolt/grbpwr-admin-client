import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { frameOf, toUV } from 'lib/folds/geom';
import type { FoldKind, StoredFold } from 'lib/folds';
import { foldLinesOf, unresolvedFoldsOf } from './fold-lines';
import { createPdfT, PDF_LANGS } from './i18n';
import { cn } from './i18n/cn';
import { de } from './i18n/de';
import { en } from './i18n/en';
import { es } from './i18n/es';
import { fr } from './i18n/fr';
import { it as italian } from './i18n/it';
import { ja } from './i18n/ja';
import { kr } from './i18n/kr';
import { pl } from './i18n/pl';
import { ru } from './i18n/ru';
import type { AsmPiece } from './derive-assembly';

const KEY = '01BACKPIECE000000000000001';
const w = 569;
const h = 662;
const rs: Pt2[] = [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
const apex: Pt2 = [285, 14];
const fanLines: [Pt2, Pt2][] = [
  [apex, [250, 662]],
  [apex, [285, 662]],
  [apex, [320, 662]],
];
const piece = {
  key: KEY,
  name: 'BP back panel',
  code: 'BP',
  cut: [],
  inner: fanLines.map((line) => line.map(([x, y]): Pt2 => [x, -y])),
  notch: [],
  pocketing: false,
  area: 0,
  geom: { pieceKey: KEY, name: 'BP', rs, edges: [] } as unknown as PieceGeom,
} as AsmPiece;
const pieces = new Map([[KEY, piece]]);
const grain = new Map([[KEY, 0]]);

const frame = frameOf(piece.geom, 0);
const row = (
  foldKey: string,
  seq: number,
  kind: FoldKind,
  line: [Pt2, Pt2],
  flipAt: Pt2,
): StoredFold => ({
  foldKey,
  pieceKey: KEY,
  seq,
  kind,
  source: 'owner',
  line: [toUV(frame, line[0]), toUV(frame, line[1])],
  flipAt: toUV(frame, flipAt),
  edge: null,
  contourSig: '',
  anchoredSize: 'M',
  note: '',
  stale: false,
});
const pleat = (kind: FoldKind, at = 1): StoredFold[] =>
  fanLines.map((line, i) => ({
    ...row(`p${i}`, at + i, kind, line, [line[1][0] + 5, 300]),
    source: 'dxf',
  }));
const keys = (rows: readonly StoredFold[]) => rows.map((one) => one.foldKey);
const english = createPdfT('en');
const lines = (rows: StoredFold[], linked: string[] = keys(rows)) =>
  foldLinesOf(linked, rows, pieces, grain, english);

const hem = (foldKey: string, seq: number, kind: FoldKind, y = 60) =>
  row(
    foldKey,
    seq,
    kind,
    [
      [0, y],
      [w, y],
    ],
    [w / 2, y / 2],
  );

describe('the OPERATION fold lines', () => {
  it('prints one line per kind', () => {
    expect(lines([hem('a', 1, 'inward')])).toEqual(['Fold in BP']);
    expect(lines([hem('a', 1, 'outward')])).toEqual(['Fold out BP']);
    expect(lines([hem('a', 1, 'inward', 30), hem('b', 2, 'inward', 60)])).toEqual([
      'Double fold BP',
    ]);
    expect(lines(pleat('pleat'))).toEqual(['Pleat BP · 70 mm']);
    expect(lines(pleat('pleat_r'))).toEqual(['Pleat BP · 70 mm →']);
    expect(lines(pleat('pleat_l'))).toEqual(['Pleat BP · 70 mm ←']);
  });

  it('prints only what is linked to this very step, not a later one', () => {
    const rows = [...pleat('pleat_r'), hem('later', 9, 'inward')];
    expect(lines(rows, keys(rows.slice(0, 3)))).toEqual(['Pleat BP · 70 mm →']);
    expect(lines(rows, ['later'])).toEqual(['Fold in BP']);
    expect(lines(rows, [])).toEqual([]);
    expect(foldLinesOf(undefined, rows, pieces, grain, english)).toEqual([]);
  });

  it('never prints a key, even when the piece has no code', () => {
    const noName = new Map([[KEY, { ...piece, code: undefined, name: '' }]]);
    const [line] = foldLinesOf(keys(pleat('pleat')), pleat('pleat'), noName, grain, english);
    expect(line).toBeDefined();
    expect(line).not.toContain(KEY);
  });

  it('skips a row that cannot be laid on this size', () => {
    const bare = new Map([[KEY, { ...piece, inner: [] }]]);
    expect(foldLinesOf(keys(pleat('pleat')), pleat('pleat'), bare, grain, english)).toEqual([]);
  });

  it('is translated in every language', () => {
    const dictionaries = { en, fr, de, it: italian, es, pl, ru, cn, ja, kr };
    const codes = PDF_LANGS.map(({ code }) => code);
    expect(Object.keys(dictionaries).sort()).toEqual([...codes].sort());
    for (const dictionary of Object.values(dictionaries)) {
      const section = dictionary.assembly as Record<string, unknown>;
      for (const key of ['foldIn', 'foldOut', 'foldDouble', 'pleatPlain'])
        expect(section[key]).toContain('{piece}');
      expect(section.pleat).toContain('{piece}');
      expect(section.pleat).toContain('{mm}');
    }
    for (const lang of codes) {
      const rows = pleat('pleat_r');
      const [line] = foldLinesOf(keys(rows), rows, pieces, grain, createPdfT(lang));
      expect(line).toContain('BP');
      expect(line).toContain('70');
      expect(line.endsWith('→')).toBe(true);
    }
  });
});

describe('a step fold this size cannot lay', () => {
  const absent = { ...hem('gone', 2, 'inward'), pieceKey: '01OTHERPIECE00000000000001' };
  const unresolved = (rows: StoredFold[], linked: string[] = keys(rows)) =>
    unresolvedFoldsOf(linked, rows, pieces, grain, (key) => (key === absent.pieceKey ? 'CF' : ''));

  it('names nothing when every step fold lays', () => {
    expect(unresolved([hem('a', 1, 'inward')])).toEqual([]);
  });

  it('names the piece by its code and the fold by its number, never a key', () => {
    expect(unresolved([hem('a', 1, 'inward'), absent])).toEqual([
      { foldKey: 'gone', piece: 'CF', seq: 2 },
    ]);
    expect(unresolved([{ ...hem('a', 3, 'inward'), stale: true }])).toEqual([
      { foldKey: 'a', piece: 'BP', seq: 3 },
    ]);
  });

  it('a fold no step names is not a step gap', () => {
    expect(unresolved([hem('a', 1, 'inward'), absent], ['a'])).toEqual([]);
  });
});
