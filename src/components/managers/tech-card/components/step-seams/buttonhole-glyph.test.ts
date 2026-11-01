import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import {
  buttonholeDirection,
  buttonholeLengthMm,
  buttonholePictureGlyphs,
  fasteningPictureGlyphs,
} from './buttonhole-glyph';

const placket = {
  pieceKey: 'PLCK_R',
  name: 'right placket',
  hand: 'R',
  cloth: 'main',
  rs: [
    [0, 0],
    [10, 0],
    [10, 100],
    [0, 100],
  ] as Pt2[],
  corners: [0, 1, 2, 3],
  notchIdx: [],
  edges: [],
  rect: true,
  areaMm2: 1000,
  perimMm: 220,
  twinOf: [],
  marks: [20, 50, 80].map((y, index) => ({
    id: `PLCK_R@${index}`,
    kind: 'buttonhole' as const,
    layer: '8',
    closed: false,
    pts: [
      [5, y - 2],
      [5, y + 2],
    ] as Pt2[],
    bbox: { w: 0, h: 4, cx: 5, cy: y },
    lenMm: 4,
  })),
} satisfies PieceGeom;

describe('buttonhole glyph geometry', () => {
  it('reads the operation length and keeps the 12 mm fallback', () => {
    expect(buttonholeLengthMm({ cutLengthMm: '18,5' })).toBe(18.5);
    expect(buttonholeLengthMm({ fastening: { cutLengthMm: { value: '16' } } })).toBe(16);
    expect(buttonholeLengthMm(undefined)).toBe(12);
  });

  it('orients horizontal and unset slits across the host long axis', () => {
    const horizontal = buttonholeDirection(
      placket.rs,
      'TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL',
    );
    const unset = buttonholeDirection(placket.rs, 'TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN');
    const vertical = buttonholeDirection(placket.rs, 'TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL');

    expect(Math.abs(horizontal[0])).toBeCloseTo(1);
    expect(Math.abs(horizontal[1])).toBeCloseTo(0);
    expect(unset).toEqual(horizontal);
    expect(Math.abs(vertical[0])).toBeCloseTo(0);
    expect(Math.abs(vertical[1])).toBeCloseTo(1);
  });

  it('uses classified marks, the operation count, and the operation cut length', () => {
    const glyphs = buttonholePictureGlyphs(
      {
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
        placementCount: 2,
        cutLengthMm: '14',
        buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL',
      },
      [placket.pieceKey],
      new Map([[placket.pieceKey, placket]]),
    );

    expect(glyphs).toHaveLength(2);
    expect(glyphs.map((glyph) => glyph.point)).toEqual([
      [5, 20],
      [5, 50],
    ]);
    expect(glyphs.every((glyph) => glyph.lengthMm === 14)).toBe(true);
    expect(glyphs.every((glyph) => Math.abs(glyph.direction[0]) > 0.999)).toBe(true);
  });

  it('uses drill marks for the button-attach step', () => {
    const buttonHost = {
      ...placket,
      marks: placket.marks.map((mark) => ({ ...mark, kind: 'drill' as const })),
    } satisfies PieceGeom;
    const glyphs = fasteningPictureGlyphs(
      {
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
        placementCount: 2,
      },
      [buttonHost.pieceKey],
      new Map([[buttonHost.pieceKey, buttonHost]]),
    );

    expect(glyphs.map((glyph) => glyph.kind)).toEqual(['button', 'button']);
    expect(glyphs.map((glyph) => glyph.point)).toEqual([
      [5, 20],
      [5, 50],
    ]);
  });
});
