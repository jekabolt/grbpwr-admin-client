import { describe, expect, it } from 'vitest';

import {
  fitOf,
  isDoubleTap,
  limitsOf,
  MAX_POLAR,
  MIN_POLAR,
  padOrbit,
  pickPolyline,
  PRESET_PHI,
  PRESET_THETA,
  presetPath,
  wheelKind,
  wrapAngle,
  type Box,
} from './doll-nav';

const tall: Box = { min: [-250, 0, -150], max: [250, 1000, 150] };
const wide: Box = { min: [-900, 0, -150], max: [900, 600, 150] };
const visibleHeight = (dist: number, fov: number) => 2 * dist * Math.tan((fov * Math.PI) / 360);

describe('fitOf', () => {
  it('a tall doll takes 85 % of the height, measured at its front face', () => {
    const f = fitOf(tall, 28, 1.6);
    expect(f.target).toEqual([0, 500, 0]);
    expect(1000 / visibleHeight(f.dist - 150, 28)).toBeCloseTo(0.85, 5);
  });
  it('a wide doll is fitted by its width on a narrow canvas', () => {
    const aspect = 0.5;
    const f = fitOf(wide, 28, aspect);
    const w = visibleHeight(f.dist - 150, 28) * aspect;
    expect(1800 / w).toBeCloseTo(0.85, 5);
    // and its height then takes less than the fill
    expect(600 / visibleHeight(f.dist - 150, 28)).toBeLessThan(0.85);
  });
});

describe('limitsOf', () => {
  it('zoom 0.25–3 × the fit, the target within 1.5 × half the diagonal', () => {
    const l = limitsOf(tall, 4000);
    expect(l.minDistance).toBe(1000);
    expect(l.maxDistance).toBe(12000);
    expect(l.maxTargetRadius).toBeCloseTo((Math.hypot(500, 1000, 300) / 2) * 1.5, 6);
  });
});

describe('presetPath', () => {
  it('front → back goes round the side, never over the head', () => {
    const path = presetPath(
      { r: 3000, phi: PRESET_PHI, theta: PRESET_THETA.front },
      { r: 3000, phi: PRESET_PHI, theta: PRESET_THETA.back },
    );
    for (let t = 0; t <= 1; t += 0.05) {
      const s = path(t);
      expect(s.phi).toBeCloseTo(PRESET_PHI, 6);
    }
    expect(Math.abs(wrapAngle(path(1).theta - Math.PI))).toBeLessThan(1e-9);
  });
  it('takes the shortest arc across ±π', () => {
    const path = presetPath({ r: 1, phi: 1, theta: 3 }, { r: 1, phi: 1, theta: -3 });
    expect(Math.abs(path(1).theta - 3)).toBeCloseTo(2 * Math.PI - 6, 9);
  });
  it('lands exactly on the target sphere', () => {
    const path = presetPath({ r: 100, phi: 0.5, theta: 0 }, { r: 300, phi: 1.2, theta: 1 });
    expect(path(1)).toEqual({ r: 300, phi: 1.2, theta: 1 });
    expect(path(0)).toEqual({ r: 100, phi: 0.5, theta: 0 });
  });
});

describe('wheelKind', () => {
  const ev = (
    o: Partial<{ ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number }>,
  ) => ({
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    ...o,
  });
  it('a pinch is ctrlKey', () => {
    expect(wheelKind(ev({ ctrlKey: true, deltaY: 3.5 }), 0, -1e9)).toBe('pinch');
  });
  it('a swipe has a sideways or fractional delta, or follows a swipe', () => {
    expect(wheelKind(ev({ deltaX: 4 }), 0, -1e9)).toBe('pad');
    expect(wheelKind(ev({ deltaY: 2.25 }), 0, -1e9)).toBe('pad');
    expect(wheelKind(ev({ deltaY: 4 }), 1000, 900)).toBe('pad');
  });
  it('a mouse wheel is whole lines or whole pixels, alone', () => {
    expect(wheelKind(ev({ deltaY: 100 }), 1000, 0)).toBe('mouse');
    expect(wheelKind(ev({ deltaMode: 1, deltaY: 3 }), 1000, 900)).toBe('mouse');
  });
});

describe('padOrbit', () => {
  it('stays inside the polar limits', () => {
    expect(padOrbit({ r: 1, phi: 0.2, theta: 0 }, 0, 10000, 500).phi).toBe(MIN_POLAR);
    expect(padOrbit({ r: 1, phi: 3, theta: 0 }, 0, -10000, 500).phi).toBe(MAX_POLAR);
  });
});

describe('pickPolyline', () => {
  const lines = [
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    [
      { x: 0, y: 30 },
      { x: 100, y: 30 },
    ],
  ];
  it('nearest first, within the radius only', () => {
    expect(pickPolyline(lines, { x: 50, y: 8 }, 10)).toEqual([{ index: 0, dist: 8 }]);
    expect(pickPolyline(lines, { x: 50, y: 16 }, 18).map((h) => h.index)).toEqual([1, 0]);
    expect(pickPolyline(lines, { x: 50, y: 15 }, 10)).toEqual([]);
  });
});

describe('isDoubleTap', () => {
  it('within 300 ms and 10 px', () => {
    expect(isDoubleTap({ t: 0, x: 0, y: 0 }, { t: 250, x: 5, y: 5 })).toBe(true);
    expect(isDoubleTap({ t: 0, x: 0, y: 0 }, { t: 350, x: 0, y: 0 })).toBe(false);
    expect(isDoubleTap({ t: 0, x: 0, y: 0 }, { t: 100, x: 20, y: 0 })).toBe(false);
    expect(isDoubleTap(null, { t: 100, x: 0, y: 0 })).toBe(false);
  });
});
