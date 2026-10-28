import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  techpackFixture,
  techpackGeometry,
  techpackMarkerLayouts,
  techpackMeasurements,
  techpackSizeChart,
} from './techpack-document.fixture';

vi.mock('lib/providers/dictionary-provider', () => ({
  useDictionary: () => ({
    dictionary: {
      sizes: [
        { id: 1, name: 'M' },
        { id: 2, name: 'L' },
      ],
    },
  }),
}));
vi.mock('./use-assembly-geometry', () => ({
  useAssemblyGeometry: () => ({
    ...techpackGeometry,
    dep: { label: 'pattern geometry', status: 'ok' },
  }),
}));
vi.mock('./use-l3-data', () => ({
  useTechpackMeasurements: () => ({
    measurements: techpackMeasurements,
    sizeChart: techpackSizeChart,
    sizeNames: { 1: 'M', 2: 'L' },
    isLoading: false,
    isError: false,
  }),
  useTechpackMarkerLayouts: () => ({
    markerLayouts: techpackMarkerLayouts,
    isLoading: false,
    isError: false,
  }),
}));

import { TechpackDocument } from './document';
import { PdfLangProvider } from './i18n';

const OWN_TEXT = [
  // Product and brand names stay verbatim by owner decision.
  'Workshop jacket',
  'GRBPWR',
  // Other card-authored fields pass through own(); a separate lane translates this seam.
  'Core',
  'Left front',
  'Right front',
  'front',
  'Back panel',
  'Cotton twill',
  'Black',
  'cotton',
  'Core thread',
  'polyester',
  'Thread House',
  'Button',
  'horn',
  'Match notches',
  'Front unit',
  'Front placket',
  'CB neck',
  'edge stitch',
  'end fold',
  'Confirm pocket depth',
  'A. Maker',
  'Sample approved',
  'Night',
  'Main marker',
  'T. Owner',
  'Button placement',
  'Chest width',
  'Body length',
  'Join lockstitch',
  'Join / seam',
  'Fuse',
  'Button attach',
];

function visibleText(markup: string): string {
  return markup
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function outsideTranslations(markup: string): string {
  return visibleText(markup)
    .split('\n')
    .map((node) => {
      const source = node.trim();
      let text = node.replace(/⟦[^⟧]*⟧/g, ' ');
      for (const allowed of [...OWN_TEXT].sort((a, b) => b.length - a.length)) {
        text = text.replaceAll(allowed, ' ');
      }
      // Paper codes, the fixed abbreviations, fixture sizes, and measurement units stay verbatim.
      text = text.replaceAll('m/c', ' ');
      text = text.replaceAll('L+R', ' ');
      text = text
        .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, ' ')
        .replace(/\b[A-Z]{1,4}(?:-[A-Z0-9]+)+\b/g, ' ')
        .replace(/\b(?:SA|CB|CF|TS|GSM|PAIR|RS|WS|DXF|P|A|B|M|L|EUR|C)\b/g, ' ')
        .replace(/\b(?:mm|cm|m|m²|s|pc|pcs|rev|v|op|bom|qr|gsm)\b/gi, ' ')
        .replace(/\bN\/cm²\b/g, ' ')
        .replace(/\bv(?=\d)/gi, ' ')
        .replace(/[\d\s\p{P}\p{S}]+/gu, ' ')
        .trim();
      return /[A-Za-z]/.test(text) ? `${text} ← ${source}` : '';
    })
    .filter(Boolean)
    .join(' | ');
}

describe('v6 English paper', () => {
  it('matches the pre-i18n markup', async () => {
    Object.assign(globalThis, {
      window: { location: { origin: 'https://admin.beta.grbpwr.com' } },
    });
    const markup = renderToStaticMarkup(
      <TechpackDocument
        techCard={techpackFixture}
        orient='land'
        revision='rev 7'
        patternViewerToken='pattern-token'
      />,
    );

    expect(markup).toContain('00');
    expect(markup).toContain('09 qc &amp; sign-off');
    await expect(markup).toMatchFileSnapshot('./__snapshots__/techpack-document.en.html');
  });

  it('routes authored paper copy through t()', () => {
    Object.assign(globalThis, {
      window: { location: { origin: 'https://admin.beta.grbpwr.com' } },
    });
    const markup = renderToStaticMarkup(
      <PdfLangProvider lang='xx'>
        <TechpackDocument
          techCard={techpackFixture}
          orient='land'
          revision='rev 7'
          patternViewerToken='pattern-token'
        />
      </PdfLangProvider>,
    );
    const leaked = outsideTranslations(markup);

    expect(leaked, `untranslated paper text: ${leaked}`).not.toMatch(/[A-Za-z]/);
  });
});
