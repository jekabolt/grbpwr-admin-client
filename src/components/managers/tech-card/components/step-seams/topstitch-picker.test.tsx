import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import type { TopstitchLine } from '../topstitch-lines';
import {
  TopstitchLineList,
  topstitchLineNos,
  topstitchLineText,
  withoutTopstitchLine,
  writeTopstitchLines,
} from './topstitch-picker';

const collar = {
  pieceKey: 'collar',
  name: 'collar',
  hand: null,
  cloth: null,
  rs: [
    [0, 0],
    [400, 0],
    [400, 60],
    [0, 60],
  ] as Pt2[],
  corners: [0, 1, 2, 3],
  notchIdx: [],
  edges: [
    { id: 'collar#0', k: 0, pts: [[0, 0] as Pt2, [400, 0] as Pt2], len: 400 },
    { id: 'collar#2', k: 2, pts: [[400, 60] as Pt2, [0, 60] as Pt2], len: 400 },
  ],
  rect: true,
  areaMm2: 24000,
  perimMm: 920,
  twinOf: [],
} as unknown as PieceGeom;
const geoms = new Map([['collar', collar]]);

const anchor = (edgeHint: string, range: [number, number]) => ({
  piece: 'collar',
  samples: [],
  perimShare: 0.4,
  lenMm: 400,
  notches: 0,
  turnDeg: 0,
  range,
  edgeHint,
  contourSig: 'shape',
});
const line = (lineKey: string, parts: ReturnType<typeof anchor>[], lineMm?: number) =>
  ({
    lineKey,
    bomLineKey: 'thread',
    anchoredSize: 'M',
    rows: 1,
    sizes: lineMm ? [{ sizeId: 3, lineMm }] : [],
    parts,
  }) as unknown as TopstitchLine;

const outer = line('outer', [anchor('collar#0', [0, 0.25]), anchor('collar#2', [0, 1])], 412);
const neck = line('neck', [anchor('collar#2', [0, 0.5])]);

describe('topstitch picker numbers', () => {
  it('puts each line number on its longest part, numbered as LINES numbers it', () => {
    expect(topstitchLineNos([outer, neck], geoms)).toEqual([
      { id: 'collar#2', i: 0 },
      { id: 'collar#2', i: 1, range: [0, 200] },
    ]);
  });

  it('reads side, width and length, leaving out what is not known', () => {
    const sideName = (targets: readonly string[]) => (targets.length ? 'collar' : '');
    expect(topstitchLineText(outer, { geoms, sideName, widthMm: '1', sizeId: 3 })).toBe(
      'collar · 1 mm · 412 mm',
    );
    expect(topstitchLineText(neck, { geoms, sideName, widthMm: '', sizeId: 3 })).toBe('collar');
  });
});

describe('topstitch picker footer', () => {
  const render = (active: string | null, frozen = false, lines = [outer, neck]) =>
    renderToStaticMarkup(
      <TopstitchLineList
        lines={lines}
        active={active}
        frozen={frozen}
        busy={false}
        textOf={(item) => `text ${item.lineKey}`}
        onToggle={() => {}}
        onRemove={() => {}}
      />,
    );

  it('lists every stored line as a numbered button', () => {
    const markup = render(null);
    expect(markup).toContain('data-topstitch-line="1"');
    expect(markup).toContain('data-topstitch-line="2"');
    expect(markup).toContain('data-pair-no="1"');
    expect(markup).toContain('data-pair-no="2"');
    expect(markup).not.toContain('text ');
    expect(markup).not.toContain('data-topstitch-remove');
  });

  it('shows words and remove for the active line only, and words for a sole line', () => {
    const active = render('neck');
    expect(active).toContain('text neck');
    expect(active).not.toContain('text outer');
    expect(active).toContain('data-topstitch-remove');
    expect(render('neck', true)).not.toContain('data-topstitch-remove');
    expect(render(null, false, [outer])).toContain('text outer');
  });

  it('remove and clear write the op lines dirty, as the LINES table does', () => {
    const setValue = vi.fn();
    writeTopstitchLines(setValue, 4, withoutTopstitchLine([outer, neck], 'outer'));
    writeTopstitchLines(setValue, 4, []);
    expect(setValue).toHaveBeenNthCalledWith(1, 'operations.4.topstitchLines', [neck], {
      shouldDirty: true,
    });
    expect(setValue).toHaveBeenNthCalledWith(2, 'operations.4.topstitchLines', [], {
      shouldDirty: true,
    });
  });
});
