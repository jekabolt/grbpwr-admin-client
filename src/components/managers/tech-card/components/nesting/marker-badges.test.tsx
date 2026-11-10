import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MARKER_BADGES_CELL, MarkerBadges, markerGroupLabel } from './marker-badges';

describe('marker row badges (prod card 6, INTERLINING, 11.11)', () => {
  it('three badges sit in one wrapping cell, none dropped', () => {
    const html = renderToStaticMarkup(
      <MarkerBadges isNorm changed sheetMoved onDelete={() => undefined} />,
    );
    expect(html).toContain('norm');
    expect(html).toContain('set changed');
    expect(html).toContain('patterns changed');
    const cell = html.match(/^<span class="([^"]+)"/)?.[1] ?? '';
    expect(cell).toBe(MARKER_BADGES_CELL);
    expect(cell.split(' ')).toContain('flex-wrap');
    expect(cell.split(' ')).toContain('min-w-0');
    expect(cell.split(' ')).not.toContain('inline-flex');
  });

  it('a repeated word in the group name is said once; other names untouched', () => {
    expect(markerGroupLabel('interlining interlining')).toBe('interlining');
    expect(markerGroupLabel(' Interlining interlining ')).toBe('Interlining');
    expect(markerGroupLabel('lining pocketing')).toBe('lining pocketing');
    expect(markerGroupLabel('main fabric')).toBe('main fabric');
    expect(markerGroupLabel(undefined)).toBe('');
  });
});
