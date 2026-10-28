import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  techpackCoverageFixture,
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
import { setOwnState } from './i18n/own';
import { outsideTranslations } from './i18n/test-helpers';

class MarkingOwnTable extends Map<string, string> {
  override get(key: string) {
    return `⟪${key}⟫`;
  }
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
    setOwnState({ lang: 'xx', table: new MarkingOwnTable(), seen: new Set() });
    try {
      const markup = renderToStaticMarkup(
        <PdfLangProvider lang='xx'>
          <TechpackDocument
            techCard={techpackCoverageFixture}
            orient='land'
            revision='rev 7'
            patternViewerToken='pattern-token'
          />
        </PdfLangProvider>,
      );
      const leaked = outsideTranslations(markup);

      expect(leaked, `untranslated paper text: ${leaked}`).not.toMatch(/[A-Za-z]/);
    } finally {
      setOwnState({ lang: 'en', table: new Map(), seen: new Set() });
    }
  });
});
