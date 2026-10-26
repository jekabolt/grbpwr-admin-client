import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import { gapNav, gapSubjects, gapsToClientFindings } from './gap-findings';
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
    expect(gapNav({ tab: 'construction', op: 90, field: 'edge' })).toEqual({
      tab: 'construction',
      extra: { op: '90' },
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

describe('gapSubjects', () => {
  const card = {
    techCard: {
      bomItems: [{ lineKey: 'SHELL', name: 'cotton poplin' }, { lineKey: 'LINING' }],
      pieces: [{ lineKey: 'fp_l' }, { lineKey: '01KZVT1QZWB5DX4YDRW3W4QNW1', name: 'yoke' }],
    },
  } as unknown as common_TechCard;
  const name = gapSubjects(card);
  it('names the BOM line, falling back to its key', () => {
    expect(name(gap({ target: { tab: 'materials', bomLine: 'SHELL', field: 'width' } }))).toBe(
      'cotton poplin',
    );
    expect(name(gap({ target: { tab: 'patterns', bomLine: 'LINING', field: 'marker' } }))).toBe(
      'LINING',
    );
  });
  it('names the piece code, else its name; nothing for a step', () => {
    expect(name(gap({ target: { tab: 'pieces', piece: 'fp_l', field: 'qty' } }))).toBe('FP_L');
    expect(
      name(gap({ target: { tab: 'pieces', piece: '01KZVT1QZWB5DX4YDRW3W4QNW1', field: 'code' } })),
    ).toBe('yoke');
    expect(name(gap({}))).toBe('');
  });
});
