import { describe, expect, it } from 'vitest';

import {
  clampLabelToPiece,
  clampPrintToLabel,
  pieceFitIssue,
  printFitIssue,
} from './label-placement';

describe('fabric piece fit', () => {
  const piece = {
    pieceWidthMm: '40',
    pieceHeightMm: '70',
    pieceSeamMm: '8',
    widthMm: '30',
    heightMm: '50',
    labelXMm: '5',
    labelYMm: '12',
  };

  it('accepts a label below the seam and inside the piece', () => {
    expect(pieceFitIssue(piece)).toBeNull();
  });

  it('rejects every edge that crosses the fit rule', () => {
    expect(pieceFitIssue({ ...piece, labelYMm: '7.99' })).toBe('label outside piece');
    expect(pieceFitIssue({ ...piece, labelXMm: '10.01' })).toBe('label outside piece');
    expect(pieceFitIssue({ ...piece, labelYMm: '20.01' })).toBe('label outside piece');
    expect(pieceFitIssue({ ...piece, pieceSeamMm: '-1' })).toBe('negative piece value');
  });

  it('clamps a drag to the seam and far edges', () => {
    expect(clampLabelToPiece(piece, -4, 2)).toEqual({ labelXMm: '0', labelYMm: '8' });
    expect(clampLabelToPiece(piece, 50, 90)).toEqual({ labelXMm: '10', labelYMm: '20' });
  });
});

describe('label print fit', () => {
  const print = {
    method: 'screen',
    widthMm: '30',
    heightMm: '8',
    xMm: '7',
    yMm: '6',
  };

  it('requires a known method, positive size and label size', () => {
    expect(printFitIssue(print, '44', '28')).toBeNull();
    expect(printFitIssue({ ...print, method: 'digital' }, '44', '28')).toBe('pick print method');
    expect(printFitIssue({ ...print, widthMm: '0' }, '44', '28')).toBe('print size required');
    expect(printFitIssue(print, '', '28')).toBe('set label size');
  });

  it('rejects overflow and clamps dragging inside the label', () => {
    expect(printFitIssue({ ...print, xMm: '14.01' }, '44', '28')).toBe('print outside label');
    expect(printFitIssue({ ...print, yMm: '20.01' }, '44', '28')).toBe('print outside label');
    expect(clampPrintToLabel(print, '44', '28', -2, 40)).toEqual({ xMm: '0', yMm: '20' });
  });
});
