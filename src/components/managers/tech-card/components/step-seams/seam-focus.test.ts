import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { card6Geoms, card6InnerLines } from './card6.fixture';
import {
  cycleLayerHit,
  edgesTouch,
  isGuess,
  pickTarget,
  seamSideName,
  sideForClick,
  sideForTarget,
} from './seam-focus';
import { stepLayout } from './step-picture';
import { DOOR_SPAN_MM, spanMm, StepPictureSvg } from './step-picture-view';

describe('isGuess', () => {
  it('only a proposal flagged not confident is a guess', () => {
    expect(isGuess({ confident: false })).toBe(true);
    expect(isGuess({ confident: true })).toBe(false);
    expect(isGuess({})).toBe(false);
    expect(isGuess(null)).toBe(false);
  });
});

describe('pickTarget', () => {
  const isInner = (id: string) => /:i\d+$/.test(id);
  const pieceOf = (id: string) => id.split(':')[0];
  const pick = (sel: { a: string[]; b: string[] }, side: 'a' | 'b', id: string) =>
    pickTarget(sel, side, id, isInner, pieceOf);

  it('takes the base fabric slit under a patch already sewn on (fabric + two patches)', () => {
    // Block A: FABRIC with PATCH_1 on it; B: PATCH_2 to go onto the fabric.
    const one = pick({ a: [], b: [] }, 'b', 'PATCH_2:0');
    const two = pick(one, 'a', 'FABRIC:i0');
    expect(two).toEqual({ a: ['FABRIC:i0'], b: ['PATCH_2:0'] });
  });

  it('takes the sleeve slit in a sleeve + first placket block (card 6, op 260)', () => {
    const sel = pick({ a: ['FLP_R_MAIN:2'], b: [] }, 'a', 'SLV_R:i0');
    expect(sel.a).toEqual(['SLV_R:i0']);
  });

  it('keeps the base edges a door next to the patch edges', () => {
    const sel = pick(pick({ a: [], b: [] }, 'a', 'PATCH_1:1'), 'a', 'FABRIC:3');
    expect(sel.a).toEqual(['PATCH_1:1', 'FABRIC:3']);
  });

  it('an edge after a line drops the line; a line twice clears it', () => {
    const lined = pick({ a: [], b: [] }, 'a', 'FABRIC:i0');
    expect(pick(lined, 'a', 'FABRIC:3').a).toEqual(['FABRIC:3']);
    expect(pick(lined, 'a', 'FABRIC:i0').a).toEqual([]);
  });

  it('a line drops the other side edges of its own piece', () => {
    expect(pick({ a: [], b: ['FABRIC:2', 'PATCH_2:0'] }, 'a', 'FABRIC:i0').b).toEqual([
      'PATCH_2:0',
    ]);
  });
});

describe('click-order sides', () => {
  const pieceOf = (id: string) => id.split(':')[0];
  const oneInput = [{ pieces: ['SLEEVE', 'PLACKET'] }];

  it('splits a step of three inputs by what was clicked, so a second seam reaches both sides', () => {
    const groups = [{ pieces: ['LEFT'] }, { pieces: ['RIGHT'] }, { pieces: ['FRONT', 'BACK'] }];

    expect(sideForClick('RIGHT', groups, { a: [], b: [] }, pieceOf)).toBe('a');
    expect(sideForClick('FRONT', groups, { a: ['RIGHT:0'], b: [] }, pieceOf)).toBe('b');
    expect(sideForClick('BACK', groups, { a: ['RIGHT:0'], b: ['FRONT:0'] }, pieceOf)).toBe('b');
    expect(sideForClick('RIGHT', groups, { a: [], b: ['FRONT:0'] }, pieceOf)).toBe('a');
  });

  it('keeps runs of the first piece on side 1 and opens side 2 on another piece', () => {
    expect(sideForClick('SLEEVE', oneInput, { a: [], b: [] }, pieceOf)).toBe('a');
    expect(sideForClick('SLEEVE', oneInput, { a: ['SLEEVE:0'], b: [] }, pieceOf)).toBe('a');
    expect(sideForClick('PLACKET', oneInput, { a: ['SLEEVE:0'], b: [] }, pieceOf)).toBe('b');
  });

  it('keeps input-owned sides for multi-input steps', () => {
    const groups = [{ pieces: ['BODY'] }, { pieces: ['SLEEVE', 'PLACKET'] }];
    expect(sideForClick('BODY', groups, { a: [], b: [] }, pieceOf)).toBe('a');
    expect(sideForClick('PLACKET', groups, { a: [], b: [] }, pieceOf)).toBe('b');
  });
});

describe('a piece closed on itself (C1)', () => {
  const pieceOf = (id: string) => id.slice(0, id.lastIndexOf('#'));
  // A four-edge piece: #0 → #1 → #2 → #3 around the ring.
  const geoms = new Map([
    [
      'SLV',
      {
        rs: Array.from({ length: 40 }, () => [0, 0]),
        edges: [0, 1, 2, 3].map((k) => ({ id: `SLV#${k}`, s: k * 10, e: k * 10 + 10 })),
      },
    ],
  ]) as unknown as Parameters<typeof edgesTouch>[2];
  const touches = (x: string, y: string) => edgesTouch(x, y, geoms, pieceOf);
  const alone = [{ pieces: ['SLV'] }];
  const withCuff = [{ pieces: ['SLV', 'CUFF'] }];
  const side = (
    id: string,
    picked: { a: string[]; b: string[] },
    groups: { pieces: string[] }[] = alone,
  ) => sideForTarget(id, groups, picked, pieceOf, touches);

  it('the old rule sends every edge of the piece to side 1, even one already on side 2', () => {
    expect(sideForClick('SLV', alone, { a: ['SLV#0'], b: ['SLV#2'] }, pieceOf)).toBe('a');
  });

  it('an edge in hand keeps its side', () => {
    expect(side('SLV#2', { a: ['SLV#0'], b: ['SLV#2'] })).toBe('b');
    expect(side('SLV#0', { a: ['SLV#0'], b: ['SLV#2'] })).toBe('a');
  });

  it('a lone piece: the second edge opens side 2, even next to the first (a dart)', () => {
    expect(side('SLV#0', { a: [], b: [] })).toBe('a');
    expect(side('SLV#2', { a: ['SLV#0'], b: [] })).toBe('b');
    expect(side('SLV#1', { a: ['SLV#0'], b: [] })).toBe('b');
  });

  it('with other pieces in the input a run still grows on side 1', () => {
    expect(side('SLV#1', { a: ['SLV#0'], b: [] }, withCuff)).toBe('a');
    expect(side('SLV#2', { a: ['SLV#0'], b: [] }, withCuff)).toBe('b');
    expect(side('CUFF#0', { a: ['SLV#0'], b: [] }, withCuff)).toBe('b');
  });

  it('later edges join the side they run on from', () => {
    expect(side('SLV#3', { a: ['SLV#0'], b: ['SLV#2'] })).toBe('a');
    expect(side('SLV#1', { a: ['SLV#3'], b: ['SLV#2'] })).toBe('b');
  });

  it('chains touch by their members; the ring wraps', () => {
    expect(touches('SLV#1+2', 'SLV#3')).toBe(true);
    expect(touches('SLV#3', 'SLV#0')).toBe(true);
    expect(touches('SLV#0', 'SLV#2')).toBe(false);
  });
});

describe('side names', () => {
  const geoms = card6Geoms();
  const nameOf = (piece: string) =>
    piece === 'SLV_L' ? 'sleeve' : piece === 'FLP_L_MAIN' ? 'placket' : piece;
  const pieceOf = (id: string) =>
    /:i\d+$/.test(id) ? id.replace(/:i\d+$/, '') : id.slice(0, id.lastIndexOf('#'));

  it('names an inner line as the piece slit', () => {
    expect(seamSideName(['SLV_L:i0'], geoms, nameOf, (id) => id.replace(/:i\d+$/, ''))).toBe(
      'sleeve slit',
    );
  });

  it('names a generic placket run by the piece alone', () => {
    const placket = geoms.get('FLP_L_MAIN')!;
    const longest = placket.edges.reduce((best, edge) => (edge.lenMm > best.lenMm ? edge : best));
    expect(seamSideName([longest.id], geoms, nameOf, pieceOf)).toBe('placket');
  });
});

describe('cycleLayerHit', () => {
  const hits = ['TOP', 'MIDDLE', 'BOTTOM'];

  it('starts on top, walks down at the same spot, then wraps', () => {
    const at: [number, number] = [100, 80];
    expect(cycleLayerHit(hits, at, null)).toBe('TOP');
    expect(cycleLayerHit(hits, at, { piece: 'TOP', at })).toBe('MIDDLE');
    expect(cycleLayerHit(hits, [103, 82], { piece: 'MIDDLE', at })).toBe('BOTTOM');
    expect(cycleLayerHit(hits, at, { piece: 'BOTTOM', at })).toBe('TOP');
  });

  it('restarts on top after the pointer leaves the click tolerance', () => {
    expect(cycleLayerHit(hits, [20, 20], { piece: 'TOP', at: [10, 10] })).toBe('TOP');
  });
});

describe('inner-line doors', () => {
  it('a sleeve slit is a door, a button circle and a buttonhole stroke are not', () => {
    const slit: [number, number][] = [
      [0, 0],
      [0, 159.5],
    ];
    const circle = Array.from({ length: 17 }, (_, i): [number, number] => [
      5 * Math.cos((i / 16) * 2 * Math.PI),
      5 * Math.sin((i / 16) * 2 * Math.PI),
    ]);
    const buttonhole: [number, number][] = [
      [0, 0],
      [25, 0],
    ];
    expect(spanMm(slit)).toBeGreaterThanOrEqual(DOOR_SPAN_MM);
    expect(spanMm(circle)).toBeLessThan(DOOR_SPAN_MM);
    expect(spanMm(buttonhole)).toBeLessThan(DOOR_SPAN_MM);
  });
});

describe('buttons and buttonholes are drawn (card 6)', () => {
  const geoms = card6Geoms();
  const innerLines = card6InnerLines();
  const svg = (piece: string, look: 'canvas' | 'tile', pick?: boolean) =>
    renderToStaticMarkup(
      createElement(StepPictureSvg, {
        w: 400,
        h: 400,
        pad: 4,
        look,
        layout: stepLayout([[piece]], [], geoms, { explode: 0 }),
        geoms,
        innerLines,
        onPick: pick ? () => {} : undefined,
      }),
    );
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
  const marksOf = (html: string) => {
    const group = html.match(/<g[^>]*data-inner-marks=""[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    return count(group, /<path /g);
  };

  it('the placket marks stay under the door span, its slits and fold lines above it', () => {
    for (const piece of ['PLCK_L', 'PLCK_R', 'FLP_L', 'SLV_L']) {
      const spans = innerLines.get(piece)!.map(spanMm);
      expect(spans.filter((s) => s < DOOR_SPAN_MM).every((s) => s <= 30)).toBe(true);
      expect(spans.filter((s) => s >= DOOR_SPAN_MM).every((s) => s >= 100)).toBe(true);
    }
  });

  it('the canvas draws every mark as a hairline and picks only the doors', () => {
    const lines = innerLines.get('PLCK_R')!;
    const small = lines.filter((l) => spanMm(l) < DOOR_SPAN_MM).length;
    const html = svg('PLCK_R', 'canvas', true);
    expect(small).toBeGreaterThan(10);
    expect(marksOf(html)).toBe(small);
    expect(count(html, /data-seam-target="[^"]*:i\d+"/g)).toBe(lines.length - small);
  });

  it('a tile draws every inner line, buttons and slits alike', () => {
    expect(marksOf(svg('PLCK_L', 'tile'))).toBe(innerLines.get('PLCK_L')!.length);
  });
});
