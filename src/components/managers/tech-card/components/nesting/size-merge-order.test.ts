import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeDxfBytes, mergeDxfSheets } from 'lib/nesting/dxf/merge';
import { orderSizeFiles, sizeLadderOrder } from './size-merge';

// Минимальная по-размерная выгрузка R12: один блок детали и его вставка.
function r12(block: string, w: number): string {
  const t = (c: number, v: string | number) => `${c}\n${v}\n`;
  return (
    t(0, 'SECTION') +
    t(2, 'HEADER') +
    t(9, '$ACADVER') +
    t(1, 'AC1009') +
    t(0, 'ENDSEC') +
    t(0, 'SECTION') +
    t(2, 'TABLES') +
    t(0, 'ENDSEC') +
    t(0, 'SECTION') +
    t(2, 'BLOCKS') +
    t(0, 'BLOCK') +
    t(8, '0') +
    t(2, block) +
    t(70, 0) +
    t(10, 0) +
    t(20, 0) +
    t(30, 0) +
    t(3, block) +
    t(0, 'POLYLINE') +
    t(8, '1') +
    t(66, 1) +
    t(70, 1) +
    [
      [0, 0],
      [w, 0],
      [w, w],
      [0, w],
    ]
      .map(([x, y]) => t(0, 'VERTEX') + t(8, '1') + t(10, x) + t(20, y) + t(30, 0))
      .join('') +
    t(0, 'SEQEND') +
    t(8, '1') +
    t(0, 'ENDBLK') +
    t(8, '0') +
    t(0, 'ENDSEC') +
    t(0, 'SECTION') +
    t(2, 'ENTITIES') +
    t(0, 'INSERT') +
    t(8, '0') +
    t(2, block) +
    t(10, 0) +
    t(20, 0) +
    t(30, 0) +
    t(0, 'ENDSEC') +
    t(0, 'EOF')
  );
}

const SIZES: Record<string, string[]> = {
  'POCKETS_XS.dxf': ['XS'],
  'POCKETS_S.dxf': ['S'],
  'POCKETS_M.dxf': ['M'],
  'POCKETS_L.dxf': ['L'],
  'POCKETS_XL.dxf': ['XL'],
};

const files = [
  { name: 'POCKETS_XS.dxf', text: r12('POCKET_XS', 10) },
  { name: 'POCKETS_S.dxf', text: r12('POCKET_S', 11) },
  { name: 'POCKETS_M.dxf', text: r12('POCKET_M', 12) },
  { name: 'POCKETS_L.dxf', text: r12('POCKET_L', 13) },
  { name: 'POCKETS_XL.dxf', text: r12('POCKET_XL', 14) },
].map((f) => ({ ...f, size: f.text.length }));

// Тот же путь, что у окна склейки: устойчивый порядок до разбора, затем размерная сетка.
function mergeOrder(dropped: typeof files): typeof files {
  const stable = orderSizeFiles(dropped);
  return sizeLadderOrder(stable.map((f) => ({ sizes: SIZES[f.name] ?? [] }))).map((i) => stable[i]);
}

function mergedBytes(dropped: typeof files): string {
  const ordered = mergeOrder(dropped);
  const { text } = mergeDxfSheets(ordered.map((f) => ({ name: f.name, text: f.text })));
  return createHash('sha256').update(encodeDxfBytes(text)).digest('hex');
}

describe('size merge: the same CLO files give the same sheet', () => {
  it('drop order does not change the merged bytes', () => {
    const a = mergedBytes(files);
    expect(mergedBytes([...files].reverse())).toBe(a);
    expect(mergedBytes([files[2], files[4], files[0], files[3], files[1]])).toBe(a);
  });

  it('the merge itself is order-sensitive (why the order is fixed)', () => {
    const raw = (fs: typeof files) =>
      mergeDxfSheets(fs.map((f) => ({ name: f.name, text: f.text }))).text;
    expect(raw([...files].reverse())).not.toBe(raw(files));
  });

  it('files go in size-ladder order, not alphabetical', () => {
    expect(mergeOrder([...files].reverse()).map((f) => f.name)).toEqual([
      'POCKETS_XS.dxf',
      'POCKETS_S.dxf',
      'POCKETS_M.dxf',
      'POCKETS_L.dxf',
      'POCKETS_XL.dxf',
    ]);
  });

  it('numbers as numbers, unknown sizes after the known in a stable order', () => {
    const rows = [['100'], ['QQ'], ['46'], [], ['44'], ['XL', 'S'], ['AA']].map((sizes) => ({
      sizes,
    }));
    // S (из XL+S) — буквы раньше чисел; 44 < 46 < 100; QQ, пустой, AA — в прежнем порядке.
    expect(sizeLadderOrder(rows)).toEqual([5, 4, 2, 0, 1, 3, 6]);
  });
});
