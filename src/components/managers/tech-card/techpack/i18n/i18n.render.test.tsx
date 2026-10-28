import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  techpackFixture,
  techpackGeometry,
  techpackMarkerLayouts,
  techpackMeasurements,
  techpackSizeChart,
} from '../techpack-document.fixture';

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
vi.mock('../use-assembly-geometry', () => ({
  useAssemblyGeometry: () => ({
    ...techpackGeometry,
    dep: { label: 'pattern geometry', status: 'ok' },
  }),
}));
vi.mock('../use-l3-data', () => ({
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

import { TechpackDocument } from '../document';
import { en, type Message } from './en';
import { PdfLangProvider } from './context';
import { englishWordLeaks } from './test-helpers';

const englishWords = new Set(
  Object.values(en)
    .flatMap((section) => Object.values(section) as Message[])
    .flatMap((message) => (typeof message === 'string' ? [message] : Object.values(message)))
    .flatMap((message) => message.match(/[A-Za-z]+/g) ?? [])
    .map((word) => word.toLowerCase()),
);

// Fixed paper codes and units remain Latin in every language. German also shares these five
// ordinary words with English; they are correctly capitalized German nouns in the dictionary.
const fixedWords = ['bom', 'qr', 'dxf', 'gsm', 'sa', 'cb', 'cf', 'ts', 'pair', 'rs', 'ws', 'pdf'];
const allowedWords = {
  ru: new Set(fixedWords),
  cn: new Set(fixedWords),
  de: new Set([...fixedWords, 'status', 'material', 'name', 'code', 'hand', 'tol']),
} as const;

describe.each(['ru', 'cn', 'de'] as const)('%s rendered PDF dictionary', (locale) => {
  it('leaves no English dictionary words in the document fixture', () => {
    Object.assign(globalThis, {
      window: { location: { origin: 'https://admin.beta.grbpwr.com' } },
    });
    const markup = renderToStaticMarkup(
      <PdfLangProvider lang={locale}>
        <TechpackDocument
          techCard={techpackFixture}
          orient='land'
          revision='rev 7'
          patternViewerToken='pattern-token'
        />
      </PdfLangProvider>,
    );

    const leaked = englishWordLeaks(markup, englishWords, allowedWords[locale]);
    expect(leaked, `English dictionary words: ${leaked}`).toBe('');
  });
});
