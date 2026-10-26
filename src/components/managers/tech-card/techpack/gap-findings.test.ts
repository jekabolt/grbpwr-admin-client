import { describe, expect, it } from 'vitest';

import { gapNav, gapsToClientFindings } from './gap-findings';
import type { Gap } from './gaps';

const gap = (over: Partial<Gap>): Gap =>
  ({
    code: 'asm_edge_missing',
    refs: ['op:560', 'field:seam'],
    label: 'no seam · pick',
    section: '06',
    target: { tab: 'construction', op: 560, field: 'seam' },
    ...over,
  }) as Gap;

describe('gapsToClientFindings', () => {
  it('one client finding per gap, in order, refs as printed', () => {
    const gaps = [gap({}), gap({ code: 'pdf_name_missing', refs: ['field:name'], section: '00' })];
    const f = gapsToClientFindings(gaps);
    expect(f.map((x) => x.code)).toEqual(['asm_edge_missing', 'pdf_name_missing']);
    expect(f[0].refs).toEqual(['op:560', 'field:seam']);
    expect(f[0].title).toBe('no seam · pick — assembly');
    expect(f.every((x) => x.severity === 'warning' && x.category === 'pdf_gaps')).toBe(true);
  });
});

describe('gapNav', () => {
  it('a step seam gap opens the step and its picker', () => {
    expect(gapNav({ tab: 'construction', op: 560, field: 'seam' })).toEqual({
      tab: 'construction',
      extra: { op: '560', pick: '560' },
    });
    expect(gapNav({ tab: 'construction', op: 12, field: 'machine' })).toEqual({
      tab: 'construction',
      extra: { op: '12' },
    });
  });
  it('a BOM line, a label field, the cover name', () => {
    expect(gapNav({ tab: 'materials', bomLine: 'SHELL', field: 'width' })).toEqual({
      tab: 'bom',
      extra: { bom: 'SHELL' },
    });
    expect(gapNav({ tab: 'labels', field: 'composition' })).toEqual({
      tab: 'labels',
      scroll: '[data-labels-tab]',
    });
    expect(gapNav({ tab: 'cover', field: 'name' })).toEqual({ tab: 'studio', reveal: 'name' });
    expect(gapNav({ tab: 'cover', field: 'fabrics' })).toEqual({ tab: 'bom' });
    expect(gapNav({ tab: 'measurements' })).toEqual({ tab: 'sizes' });
  });
});
