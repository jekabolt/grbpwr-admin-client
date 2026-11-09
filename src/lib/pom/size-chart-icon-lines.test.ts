import { describe, expect, it } from 'vitest';

import { placeIconLine } from './size-chart-icon-lines';
import { SIZE_CHART_ICONS } from './size-chart-icons';

describe('placeIconLine', () => {
  it('keeps the icon’s own line', () => {
    const chest = SIZE_CHART_ICONS.shirt.lines.find((line) => line.name === 'chest');
    expect(placeIconLine('shirt', 'chest')).toEqual({
      x: chest?.type === 'horizontal' ? chest.xStart : 0,
      y: 200,
      x2: chest?.type === 'horizontal' ? chest.xEnd : 0,
      y2: 200,
    });
  });

  it('puts missing body lines level and as wide as the chest', () => {
    const chest = placeIconLine('shirt', 'chest');
    const waist = placeIconLine('shirt', 'waist');
    const hem = placeIconLine('shirt', 'bottom-width');
    for (const line of [waist, hem]) {
      expect(line?.y).toBe(line?.y2);
      expect(line?.x).toBe(chest?.x);
      expect(line?.x2).toBe(chest?.x2);
    }
    expect(waist!.y).toBeGreaterThan(chest!.y);
    expect(hem!.y).toBeGreaterThan(waist!.y);
  });

  it('stands sleeve lines across the sleeve, outside the body', () => {
    const chest = placeIconLine('shirt', 'chest')!;
    for (const name of ['bicep', 'sleeve-opening']) {
      const line = placeIconLine('shirt', name)!;
      expect(Math.min(line.x, line.x2)).toBeGreaterThanOrEqual(chest.x2 - 1);
    }
  });

  it('puts the knee on one leg between thigh and leg opening', () => {
    const knee = placeIconLine('joggers', 'knee')!;
    const thigh = placeIconLine('joggers', 'thigh')!;
    const opening = placeIconLine('joggers', 'leg-opening')!;
    expect(knee.y).toBe(knee.y2);
    expect(knee.y).toBeGreaterThan(thigh.y);
    expect(knee.y).toBeLessThan(opening.y);
  });

  it('reads trouser length as outseam and skips names it cannot place', () => {
    expect(placeIconLine('joggers', 'height')).toEqual(placeIconLine('joggers', 'length'));
    expect(placeIconLine('joggers', 'no-such-point')).toBeNull();
    expect(placeIconLine('no-icon', 'chest')).toBeNull();
  });

  it('draws no sleeve on a sleeveless icon', () => {
    for (const icon of ['cami', 'puffer_vest', 'swimsuit']) {
      for (const name of ['sleeve', 'bicep', 'sleeve-opening']) {
        expect(placeIconLine(icon, name)).toBeNull();
      }
    }
    expect(placeIconLine('cami', 'chest')).not.toBeNull();
  });

  it('keeps the hood line the icon draws', () => {
    expect(placeIconLine('hoodie', 'hood-height')).toEqual({
      x: 420,
      y: -87.075,
      x2: 420,
      y2: 72.925,
    });
  });

  it('draws no leg lines on a skirt or a one-piece without legs', () => {
    for (const icon of ['skirt_mini', 'jumpsuit']) {
      for (const name of ['rise', 'thigh', 'knee', 'leg-opening', 'inseam']) {
        expect(placeIconLine(icon, name)).toBeNull();
      }
    }
    expect(placeIconLine('skirt_mini', 'hip')).not.toBeNull();
  });
});
