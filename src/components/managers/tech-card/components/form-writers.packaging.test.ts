import { describe, expect, it } from 'vitest';

import { insertPackagingItemByRank } from './form-writers';

describe('insertPackagingItemByRank', () => {
  it('inserts by the mockup kind rank and keeps equal kinds stable', () => {
    const start = [
      { key: 'hanger', id: 1 },
      { key: 'tissue', id: 2 },
      { key: 'box', id: 3 },
    ];

    const collar = insertPackagingItemByRank(start, { key: 'collar_support', id: 4 });
    expect(collar.index).toBe(1);
    expect(collar.rows.map((row) => row.key)).toEqual([
      'hanger',
      'collar_support',
      'tissue',
      'box',
    ]);

    const tissue = insertPackagingItemByRank(collar.rows, { key: 'tissue', id: 5 });
    expect(tissue.index).toBe(3);
    expect(tissue.rows.map((row) => row.id)).toEqual([1, 4, 2, 5, 3]);
  });

  it('places custom kinds after the known ladder', () => {
    const result = insertPackagingItemByRank([{ key: 'mailer' }], { key: 'custom wrap' });
    expect(result.index).toBe(1);
  });
});
