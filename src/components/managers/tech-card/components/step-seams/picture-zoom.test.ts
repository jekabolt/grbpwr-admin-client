import { describe, expect, it } from 'vitest';
import { panSwallowsClick, panTo, wheelPan, zoomAt, type PanPress } from './picture-zoom';

const press = (over: Partial<PanPress> = {}): PanPress => ({
  id: 1,
  button: 0,
  cx: 100,
  cy: 100,
  x: 0,
  y: 0,
  forced: false,
  on: false,
  ...over,
});

describe('picture zoom', () => {
  it('holds the view in no frame', () => {
    expect(wheelPan({ k: 1, x: 0, y: 0 }, 5000, -3000, false)).toEqual({ k: 1, x: -5000, y: 3000 });
    expect(panTo(press(), 1, 2100, -900)).toEqual({ k: 1, x: 2000, y: -1000 });
  });

  it('pans a horizontal wheel with shift', () => {
    expect(wheelPan({ k: 2, x: 10, y: 10 }, 0, 40, true)).toEqual({ k: 2, x: -30, y: 10 });
  });

  it('zooms below 1 down to 0.1, at the cursor', () => {
    const v = zoomAt({ k: 1, x: 0, y: 0 }, 0.5, 200, 100);
    expect(v).toEqual({ k: 0.5, x: 100, y: 50 });
    expect(zoomAt(v, 0.001, 200, 100).k).toBeCloseTo(0.1);
    // The point under the cursor stays: (200 - x) / k is the same before and after.
    expect((200 - v.x) / v.k).toBeCloseTo(200);
  });

  it('a plain press stays a click until it travels', () => {
    const p = press();
    expect(panTo(p, 1, 102, 101)).toBeNull();
    expect(panSwallowsClick(p)).toBe(false);
    expect(panTo(p, 1, 110, 100)).toEqual({ k: 1, x: 10, y: 0 });
    expect(panSwallowsClick(p)).toBe(true);
  });

  it('the click ending a Space pan never picks an edge, even without a move', () => {
    expect(panSwallowsClick(press({ forced: true }))).toBe(true);
  });

  it('the middle button leaves no click to swallow for the next press', () => {
    expect(panSwallowsClick(press({ button: 1, forced: true, on: true }))).toBe(false);
  });
});
