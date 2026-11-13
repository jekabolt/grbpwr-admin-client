import { describe, expect, it } from 'vitest';
import {
  withZoneRingMode,
  withZoneRingPoints,
  zoneRingMode,
  zoneRingModeLabel,
  zoneRingPoints,
} from 'components/managers/tech-card/components/nesting/fuse-zone';
import type { FuseInternalLine } from './dxf';
import type { FuseZone } from './types';

// The ring's carry-over mode is set on the canvas and must survive every later reshape.
const square = (x0: number, y0: number, s: number) => ({
  points: [
    { x: x0, y: y0, corner: true },
    { x: x0 + s, y: y0, corner: true },
    { x: x0 + s, y: y0 + s, corner: true },
    { x: x0, y: y0 + s, corner: true },
  ],
});
const zone: FuseZone = { spline: square(0, 0, 100), holes: [square(40, 40, 20)], islands: [] };
const fold: FuseInternalLine = {
  layer: 'FOLD',
  closed: false,
  points: [
    { x: 50, y: -20 },
    { x: 50, y: 120 },
  ],
};
const notch: FuseInternalLine = {
  layer: 'NOTCH',
  closed: false,
  points: [
    { x: 0, y: 10 },
    { x: 5, y: 10 },
  ],
};
const lines = [notch, fold];

describe('ring carry-over mode on the canvas', () => {
  it('follow line ties the ring to the nearest followable line, never a notch', () => {
    const next = withZoneRingMode(zone, 'main', 'follow_line', lines);
    expect(next && 'spline' in next && next.spline.gradeMode).toBe('follow_line');
    expect(next && 'spline' in next && next.spline.anchor).toEqual({ x: 50, y: 50 });
    expect(zoneRingModeLabel(next, 'main', lines)).toBe('line 1');
  });

  it('follow line is refused without a followable line', () => {
    expect(withZoneRingMode(zone, 'main', 'follow_line', [notch])).toBeNull();
  });

  it('a reshape keeps the mode; fixed clears it', () => {
    const grown = withZoneRingMode(zone, 'hole:0', 'grow');
    const pts = zoneRingPoints(grown, 'hole:0').map((p) => ({ ...p, x: p.x + 1 }));
    const moved = withZoneRingPoints(grown, 'hole:0', pts);
    expect(zoneRingMode(moved, 'hole:0')).toBe('grow');
    expect(zoneRingMode(moved, 'main')).toBe('fixed');
    const main = withZoneRingMode(moved, 'main', 'follow_line', lines);
    const reshaped = withZoneRingPoints(main, 'main', zoneRingPoints(main, 'main'));
    expect(zoneRingMode(reshaped, 'main')).toBe('follow_line');
    const fixed = withZoneRingMode(reshaped, 'hole:0', 'fixed');
    expect(zoneRingMode(fixed, 'hole:0')).toBe('fixed');
    expect(fixed && 'spline' in fixed && 'gradeMode' in fixed.holes[0]).toBe(false);
  });

  it('a legacy rectangle becomes a spline to hold a mode', () => {
    const next = withZoneRingMode({ rect: [0, 0, 100, 100] }, 'main', 'grow');
    expect(next && 'spline' in next && next.spline.gradeMode).toBe('grow');
  });
});
