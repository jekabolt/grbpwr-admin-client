import {
  fromSeamStrip,
  oneLengthStrip,
  STRIP_SIZE_NAMES,
  waistbandCard,
} from 'components/managers/tech-card/components/cut-strips/strip.fixture';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { deriveAssembly } from '../derive-assembly';
import { deriveCutStrips } from '../derive-cut-strips';
import { collectPdfGaps } from '../gaps';
import { PdfLangProvider, type PdfLocale } from '../i18n';
import { setOwnState } from '../i18n/own';
import { outsideTranslations } from '../i18n/test-helpers';
import { CutStripsPage } from './cut-strips';

class MarkingOwnTable extends Map<string, string> {
  override get(source: string): string {
    return `⟪${source}⟫`;
  }
}

const NAMES = Object.fromEntries(STRIP_SIZE_NAMES) as Record<number, string>;
const BAND = 'rubber';

const textOf = (cell: string) =>
  cell
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .trim();

/** Every table of the markup as rows of cell texts. */
function tablesOf(markup: string): string[][][] {
  return [...markup.matchAll(/<table[\s\S]*?<\/table>/g)].map(([table]) =>
    [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(([row]) =>
      [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => textOf(cell[1])),
    ),
  );
}

/** The card with its seam decision undone: rejected, or still confirmed but stale. */
function seamGone(input: ReturnType<typeof waistbandCard>, how: 'rejected' | 'stale') {
  const seams = (input.techCard as { seams?: Record<string, unknown>[] }).seams ?? [];
  expect(seams).toHaveLength(1);
  return {
    ...input,
    techCard: {
      ...input.techCard,
      seams: seams.map((row) =>
        how === 'rejected'
          ? { ...row, status: 'TECH_CARD_SEAM_STATUS_REJECTED' }
          : { ...row, stale: true },
      ),
    },
  } as ReturnType<typeof waistbandCard>;
}

function page(input: ReturnType<typeof waistbandCard>, lang: PdfLocale = 'en', n = '06b') {
  return renderToStaticMarkup(
    <PdfLangProvider lang={lang}>
      <CutStripsPage
        techCard={input.techCard}
        orient='port'
        docline=''
        n={n}
        assembly={deriveAssembly(input)}
        sizeNames={NAMES}
      />
    </PdfLangProvider>,
  );
}

describe('the cut-to-length sheet', () => {
  it('prints the step row at the base size and a length per size', () => {
    const tables = tablesOf(page(waistbandCard(fromSeamStrip())));
    expect(tables).toHaveLength(2);
    const [head, row] = tables[0];
    expect(head.slice(1)).toEqual(['step', BAND, 'cut · M']);
    expect(row[0]).toBe('230');
    expect(row[2]).toBe('40 mm');
    expect(row[3]).toBe('702 mm');
    expect(tables[1]).toEqual([
      [`${BAND}, cut mm`, 'S', 'M', 'L', 'XL'],
      ['×1, 40 mm', '668', '702', '736', '770'],
    ]);
  });

  it('prints one column for one length', () => {
    const tables = tablesOf(page(waistbandCard(oneLengthStrip(700))));
    expect(tables[1]).toEqual([
      [`${BAND}, cut mm`, 'all sizes'],
      ['×1, 40 mm', '700'],
    ]);
  });

  it('shows an unknown length as unknown, never 0', () => {
    const strip = fromSeamStrip();
    const blanked = {
      ...strip,
      sizes: strip.sizes?.map((row) =>
        row.sizeId === 3 ? { ...row, seamMm: undefined as never } : row,
      ),
    };
    const [, row] = tablesOf(page(waistbandCard(blanked)))[1];
    expect(row).toEqual(['×1, 40 mm', '668', '702', '—', '770']);
  });

  it.each(['rejected', 'stale'] as const)(
    'prints no length from a %s seam, as the norm does not count it',
    (how) => {
      const [, row] = tablesOf(page(seamGone(waistbandCard(fromSeamStrip()), how)))[1];
      expect(row).toEqual(['×1, 40 mm', '—', '—', '—', '—']);
    },
  );

  it('still prints a manual cut on a rejected seam', () => {
    const strip = fromSeamStrip();
    const manual = {
      ...strip,
      sizes: strip.sizes?.map((row) => (row.sizeId === 3 ? { ...row, manualCutMm: 740 } : row)),
    };
    const [, row] = tablesOf(page(seamGone(waistbandCard(manual), 'rejected')))[1];
    expect(row).toEqual(['×1, 40 mm', '—', '—', '740', '—']);
  });

  it('prints no sheet at all for a card with no strip', () => {
    const input = waistbandCard(fromSeamStrip());
    const none = { ...input.techCard, cutStrips: [] };
    expect(
      renderToStaticMarkup(
        <PdfLangProvider lang='en'>
          <CutStripsPage techCard={none} orient='port' docline='' n='06b' sizeNames={NAMES} />
        </PdfLangProvider>,
      ),
    ).toBe('');
  });

  it('leaves no English on a translated sheet', () => {
    setOwnState({ lang: 'xx', table: new MarkingOwnTable(), seen: new Set() });
    try {
      const markup = page(waistbandCard(fromSeamStrip()), 'xx', '06');
      expect(markup).toContain('⟪rubber⟫');
      expect(outsideTranslations(markup)).not.toMatch(/[A-Za-z]/);
    } finally {
      setOwnState({ lang: 'en', table: new Map(), seen: new Set() });
    }
  });
});

describe('what the audit asks of a strip', () => {
  const codesOf = (input: ReturnType<typeof waistbandCard>) =>
    collectPdfGaps({ ...input, sizeNames: NAMES }).map((gap) => gap.code);

  it('finds a strip no step uses, once', () => {
    const codes = codesOf(waistbandCard(fromSeamStrip(), { inStep: false }));
    expect(codes.filter((code) => code === 'cut_strip_unused')).toHaveLength(1);
  });

  it('does not find a strip a step uses', () => {
    expect(codesOf(waistbandCard(fromSeamStrip()))).not.toContain('cut_strip_unused');
  });

  it('finds a seam length that moved', () => {
    const strip = fromSeamStrip();
    const stored = {
      ...strip,
      sizes: strip.sizes?.map((row) => ({ ...row, seamMm: { value: '500' } })),
    };
    expect(codesOf(waistbandCard(stored))).toContain('cut_strip_seam_stale');
  });

  it('finds a strip on a rejected seam even when the pattern did not move', () => {
    const codes = codesOf(seamGone(waistbandCard(fromSeamStrip()), 'rejected'));
    expect(codes.filter((code) => code === 'cut_strip_seam_stale')).toHaveLength(1);
  });

  it('does not call a length read from the seam today stale', () => {
    expect(codesOf(waistbandCard(fromSeamStrip()))).not.toContain('cut_strip_seam_stale');
  });

  it('gives the same list from a ready assembly', () => {
    const input = waistbandCard(fromSeamStrip(), { inStep: false });
    const direct = collectPdfGaps({ ...input, sizeNames: NAMES }).map((gap) => gap.code);
    const assembly = deriveAssembly(input);
    const given = collectPdfGaps({ ...input, sizeNames: NAMES, assembly }).map((gap) => gap.code);
    expect(given).toEqual(direct);
  });

  it('keeps the model free of findings when the card has no strip', () => {
    const input = waistbandCard(fromSeamStrip());
    expect(deriveCutStrips({ ...input.techCard, cutStrips: [] }).gaps).toEqual([]);
  });
});
