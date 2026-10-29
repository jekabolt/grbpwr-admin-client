import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import { gapHref, gapNav, gapSubjects, gapsToClientFindings, gapWhere } from './gap-findings';
import type { Gap } from './gaps';
import { createPdfT } from './i18n';

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

describe('gapHref / gapWhere', () => {
  it('links a PDF gap line to the same tab and params as the audit door', () => {
    const origin = 'https://admin.beta.grbpwr.com';
    expect(gapHref({ tab: 'construction', op: 560, field: 'seam' }, 6, origin)).toBe(
      'https://admin.beta.grbpwr.com/tech-cards/6?tab=construction&op=560&pick=560',
    );
    expect(gapHref({ tab: 'materials', bomLine: 'SHELL', field: 'width' }, 6, origin)).toBe(
      'https://admin.beta.grbpwr.com/tech-cards/6?tab=bom&bom=SHELL',
    );
    expect(gapWhere({ tab: 'construction', op: 30, field: 'seam' })).toBe('construction · op 30');
    expect(gapWhere({ tab: 'materials', bomLine: 'SHELL' })).toBe('bom · material');
    expect(gapWhere({ tab: 'measurements' })).toBe('sizes');
  });

  it('prints a BOM role and label part, never its ULID', () => {
    const lineKey = '01KZVT1QZWB5DX4YDRW3W4QNW1';
    const card = {
      techCard: {
        bomItems: [
          {
            lineKey,
            section: 'TECH_CARD_BOM_SECTION_FABRIC',
            purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
          },
        ],
      },
    } as unknown as common_TechCard;
    const where = gapWhere({ tab: 'materials', bomLine: lineKey }, createPdfT('ru'), card);

    expect(where).toBe('BOM · основной материал · SHELL');
    expect(where).not.toContain(lineKey);
    expect(where).not.toMatch(/[0-9A-HJKMNP-TV-Z]{26}/i);
  });
});
