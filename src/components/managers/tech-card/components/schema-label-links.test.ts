import { describe, expect, it } from 'vitest';
import type { FormGarmentLabel } from './labels-schema';
import { liveLabelBomLinks } from './schema';

const label = (over: Partial<FormGarmentLabel>) =>
  ({ key: 'composition', ...over }) as FormGarmentLabel;

describe('liveLabelBomLinks', () => {
  it('keeps a source on a live line counted in pieces', () => {
    const [l] = liveLabelBomLinks(
      [label({ bomLineKey: 'L1', source: 'make' })],
      [{ lineKey: 'L1', section: 'TECH_CARD_BOM_SECTION_LABEL' }],
    );
    expect(l).toMatchObject({ bomLineKey: 'L1', source: 'make' });
  });

  it('a line gone from the card takes the source with it', () => {
    const [l] = liveLabelBomLinks(
      [label({ bomLineKey: 'gone', bomItemId: 9, source: 'make' })],
      [{ lineKey: 'other', id: 1, section: 'TECH_CARD_BOM_SECTION_LABEL' }],
    );
    expect(l).toMatchObject({ bomLineKey: '', bomItemId: 0, source: '' });
  });

  it.each([
    'TECH_CARD_BOM_SECTION_FABRIC',
    'TECH_CARD_BOM_SECTION_LINING',
    'TECH_CARD_BOM_SECTION_INTERLINING',
    'TECH_CARD_BOM_SECTION_INSULATION',
    'TECH_CARD_BOM_SECTION_THREAD',
    'TECH_CARD_BOM_SECTION_TRIM',
  ])('a line moved to %s keeps the link and loses the source', (section) => {
    const [l] = liveLabelBomLinks(
      [label({ bomLineKey: 'L1', source: 'make' })],
      [{ lineKey: 'L1', section }],
    );
    expect(l).toMatchObject({ bomLineKey: 'L1', source: '' });
  });

  it('finds the line by id when the row has no key', () => {
    const [l] = liveLabelBomLinks(
      [label({ bomItemId: 9, source: 'stock' })],
      [{ id: 9, lineKey: 'L1', section: 'TECH_CARD_BOM_SECTION_HARDWARE' }],
    );
    expect(l).toMatchObject({ bomLineKey: '', bomItemId: 9, source: 'stock' });
  });

  it('a stale key does not hide a live id', () => {
    const [l] = liveLabelBomLinks(
      [label({ bomLineKey: 'gone', bomItemId: 9, source: 'make' })],
      [{ id: 9, lineKey: 'L1', section: 'TECH_CARD_BOM_SECTION_LABEL' }],
    );
    expect(l).toMatchObject({ bomLineKey: '', bomItemId: 9, source: 'make' });
  });

  it('leaves a row with no source as it is', () => {
    const [l] = liveLabelBomLinks([label({ source: '' })], []);
    expect(l).toMatchObject({ bomLineKey: '', bomItemId: 0, source: '' });
  });
});
