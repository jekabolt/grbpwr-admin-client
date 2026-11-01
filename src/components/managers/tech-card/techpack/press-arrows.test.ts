import { describe, expect, it } from 'vitest';

import {
  normalIntoPiece,
  pressMode,
  pressScreenAim,
  pressTowardPiece,
  pressWord,
  seamMidNormal,
} from './press-arrows';

const piece = (key: string, name: string, code?: string) => ({ key, name, code });

describe('press mode from the stored step', () => {
  it('reads open, side, flat and final apart, never from the drawing technique', () => {
    expect(pressMode({ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' })).toBe('open');
    expect(pressMode({ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS', work: 'press_open' })).toBe(
      'open',
    );
    expect(pressMode({ work: 'press_to_one_side' })).toBe('side');
    expect(
      pressMode({
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        press: { action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE', toward: undefined },
      }),
    ).toBe('side');
    expect(pressMode({ work: 'press_flat' })).toBe('flat');
    expect(pressMode({ operationType: 'TECH_CARD_OPERATION_TYPE_PRESS' })).toBe('flat');
    expect(pressMode({ work: 'press_final' })).toBeNull();
    expect(
      pressMode({
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        press: { action: 'TECH_CARD_PRESS_ACTION_FINAL', toward: undefined },
      }),
    ).toBeNull();
    expect(pressMode({ operationType: 'TECH_CARD_OPERATION_TYPE_FUSING' })).toBeNull();
    expect(pressMode(undefined)).toBeNull();
  });
});

describe('press word', () => {
  it('says open, to <side>, or the side phrase; flat says nothing', () => {
    expect(pressWord('open')).toBe('open');
    expect(pressWord('side', 'TECH_CARD_PRESS_TOWARD_BACK')).toBe('to back');
    expect(pressWord('side', 'TECH_CARD_PRESS_TOWARD_FRONT')).toBe('to front');
    expect(pressWord('side', 'TECH_CARD_PRESS_TOWARD_TOWARD_CENTER')).toBe('to centre');
    expect(pressWord('side', 'TECH_CARD_PRESS_TOWARD_UP')).toBe('upward');
    expect(pressWord('side', 'TECH_CARD_PRESS_TOWARD_BODY')).toBe('onto the body');
    expect(pressWord('side', undefined)).toBe('');
    expect(pressWord('flat', 'TECH_CARD_PRESS_TOWARD_BACK')).toBe('');
  });
});

describe('press side', () => {
  const seam = [piece('a', 'FRONT_L', 'FR'), piece('b', 'BACK', 'BK'), piece('c', 'SLEEVE_L')];

  it('finds the named piece on the seam by name or code', () => {
    expect(pressTowardPiece('TECH_CARD_PRESS_TOWARD_FRONT', seam)).toBe('a');
    expect(pressTowardPiece('TECH_CARD_PRESS_TOWARD_BACK', seam)).toBe('b');
    expect(pressTowardPiece('TECH_CARD_PRESS_TOWARD_SLEEVE', seam)).toBe('c');
    expect(pressTowardPiece('TECH_CARD_PRESS_TOWARD_BACK', [piece('x', 'Part 1', 'BK')])).toBe('x');
    expect(pressTowardPiece('TECH_CARD_PRESS_TOWARD_BACK', [piece('x', 'спинка')])).toBe('x');
  });

  it('reads body as the non-sleeve piece and shell as the non-facing piece', () => {
    expect(
      pressTowardPiece('TECH_CARD_PRESS_TOWARD_BODY', [piece('s', 'SLV'), piece('p', 'PANEL')]),
    ).toBe('p');
    expect(
      pressTowardPiece('TECH_CARD_PRESS_TOWARD_SHELL', [piece('f', 'FACING'), piece('p', 'PANEL')]),
    ).toBe('p');
    expect(
      pressTowardPiece('TECH_CARD_PRESS_TOWARD_LINING', [
        piece('p', 'FRONT'),
        piece('l', 'LIN_FRONT'),
      ]),
    ).toBe('l');
  });

  it('leaves the side unresolved when the seam does not name it', () => {
    expect(
      pressTowardPiece('TECH_CARD_PRESS_TOWARD_BACK', [piece('a', 'FLP_R'), piece('b', 'SLV_R')]),
    ).toBeUndefined();
    expect(pressTowardPiece('TECH_CARD_PRESS_TOWARD_UP', seam)).toBeUndefined();
    expect(pressTowardPiece(undefined, seam)).toBeUndefined();
  });

  it('reads up, down and the centre on the picture', () => {
    expect(pressScreenAim('TECH_CARD_PRESS_TOWARD_UP')).toBe('up');
    expect(pressScreenAim('TECH_CARD_PRESS_TOWARD_DOWN')).toBe('down');
    expect(pressScreenAim('TECH_CARD_PRESS_TOWARD_TOWARD_CENTER')).toBe('centre');
    expect(pressScreenAim('TECH_CARD_PRESS_TOWARD_AWAY_FROM_CENTER')).toBe('away');
    expect(pressScreenAim('TECH_CARD_PRESS_TOWARD_BACK')).toBeUndefined();
  });
});

describe('press arrow geometry', () => {
  it('stands on the seam midpoint by length, square to the run', () => {
    const mid = seamMidNormal([
      [0, 0],
      [0, 10],
      [0, 40],
    ]);
    expect(mid?.at).toEqual([0, 20]);
    expect(mid?.normal[0]).toBeCloseTo(-1);
    expect(mid?.normal[1]).toBeCloseTo(0);
  });

  it('turns the normal into the piece cloth', () => {
    const ring: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 50],
      [0, 50],
    ];
    expect(normalIntoPiece([0, 25], [-1, 0], ring)).toEqual([1, -0]);
    expect(normalIntoPiece([100, 25], [-1, 0], ring)).toEqual([-1, 0]);
  });
});
