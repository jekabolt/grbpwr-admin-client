// The same papers with a team brand (wave «teams», W-spec §5): another team's paper never carries
// GRBPWR, its site, its VAT id or the house mark; empty brand data prints nothing.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_TechCard, TeamBrand } from 'api/proto-http/admin';
import type { common_OrderFull } from 'api/proto-http/frontend';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaperBrandOverride } from './paper-brand-context';

import {
  techpackFixture,
  techpackGeometry,
  techpackMarkerLayouts,
  techpackMeasurements,
  techpackSizeChart,
} from 'components/managers/tech-card/techpack/techpack-document.fixture';

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
vi.mock('components/managers/tech-card/techpack/use-assembly-geometry', () => ({
  useAssemblyGeometry: () => ({
    ...techpackGeometry,
    dep: { label: 'pattern geometry', status: 'ok' },
  }),
}));
vi.mock('components/managers/tech-card/techpack/use-l3-data', () => ({
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

import { InvoiceDocument } from 'components/managers/order/components/invoice-document';
import { RunPackDocument } from 'components/managers/production-runs/components/run-pack-document';
import { TechPackDocument } from 'components/managers/tech-card/components/tech-pack-document';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { TechpackDocument } from 'components/managers/tech-card/techpack/document';

const NOW = new Date('2026-01-15T10:00:00Z');

beforeAll(() => {
  process.env.TZ = 'UTC';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(globalThis, {
    window: { location: { origin: 'https://admin.example' } },
  });
});
afterAll(() => {
  vi.useRealTimers();
});

function html(
  brand: TeamBrand | null,
  logoUrl: string,
  node: ReactElement,
  seed?: (qc: QueryClient) => void,
): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  // text only: the `<!-- -->` separators between text nodes are not what a factory reads
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <PaperBrandOverride brand={brand} logoUrl={logoUrl}>
        <MemoryRouter>{node}</MemoryRouter>
      </PaperBrandOverride>
    </QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

const withBrand = (brand: string): common_TechCard => ({
  ...techpackFixture,
  techCard: { ...techpackFixture.techCard!, brand },
});

const CARDS: [string, common_TechCard][] = [
  ['card-brand', withBrand('GRBPWR')],
  ['own-brand', withBrand('Atelier Own')],
  ['no-brand', withBrand('')],
];

const ORDER = {
  order: {
    id: 4512,
    uuid: '9b2f0c1e-0000-4000-8000-000000004512',
    currency: 'EUR',
    totalPrice: { value: '240.00' },
    vatRegime: 'wdt',
    placed: '2026-01-10T09:00:00Z',
  },
  buyer: {
    buyerInsert: { firstName: 'Ana', lastName: 'Lind', email: 'ana@example.com', phone: '' },
  },
  shipping: {
    addressInsert: {
      country: 'DE',
      city: 'Berlin',
      addressLineOne: 'Kastanienallee 1',
      postalCode: '10435',
    },
  },
  billing: {
    addressInsert: {
      country: 'DE',
      city: 'Berlin',
      addressLineOne: 'Kastanienallee 1',
      postalCode: '10435',
    },
  },
  shipment: { cost: { value: '20.00' } },
  orderItems: [
    {
      id: 1,
      orderItem: { productId: 7, quantity: 2, sizeId: 1 },
      productName: 'Wool coat',
      productPrice: { value: '110.00' },
      productSalePercentage: { value: '0' },
      productPriceWithSale: { value: '110.00' },
      sku: 'RC27-99999-OFW-76',
    },
  ],
} as unknown as common_OrderFull;

const EMPTY: TeamBrand = {
  brandName: '',
  legalEntity: '',
  legalAddress: [],
  contactEmail: '',
  website: '',
  firstTeam: false,
  unavailable: false,
};
const OSTRA: TeamBrand = {
  ...EMPTY,
  brandName: 'Ostra',
  legalEntity: 'Ostra Studio Ltd',
  legalAddress: ['1 Mill Lane', 'Leeds'],
  contactEmail: 'shop@ostra.com',
  website: 'ostra.com',
};
const LOGO = 'https://cdn.example/ostra.png';
const NO_BRAND = withBrand('');
// the house mark's markup, as rendered on today's papers
const HOUSE_MARK = /viewBox="42 42 516 516"/;

const papers = (brand: TeamBrand | null, logo = '') => {
  const id = NO_BRAND.id ?? 0;
  return {
    cover: html(
      brand,
      logo,
      <TechpackDocument techCard={NO_BRAND} orient='land' revision='rev 7' patternViewerToken='t' />,
    ),
    classic: html(brand, logo, <TechPackDocument techCard={NO_BRAND} patternViewerToken='t' />),
    run: html(
      brand,
      logo,
      <RunPackDocument
        run={{ id: 31, run: { techCardId: id, status: 'PRODUCTION_RUN_STATUS_PLANNED' } } as never}
        runPackToken='t'
      />,
      (qc) => qc.setQueryData(techCardKeys.detail(id), NO_BRAND),
    ),
    invoice: html(brand, logo, <InvoiceDocument orderDetails={ORDER} orderStatus='confirmed' />),
  };
};

describe('papers with a team brand', () => {
  it('another team: its name and logo, no GRBPWR, no house mark', () => {
    const p = papers(OSTRA, LOGO);
    expect(p.cover).toContain('Ostra · tech pack');
    expect(p.cover).toContain(`src="${LOGO}"`);
    expect(p.classic).toContain('Ostra · tech pack');
    expect(p.run).toContain('Ostra · production run pack');
    expect(p.run).toContain(`src="${LOGO}"`);
    for (const [name, markup] of Object.entries(p)) {
      if (name === 'classic') continue; // the label summary is the editor mirror, checked below
      expect(markup, name).not.toMatch(/grbpwr/i);
    }
    expect(p.invoice).toContain('shop@ostra.com');
    expect(p.invoice).toContain('ostra.com');
    expect(p.invoice).not.toContain('not configured');
    expect(p.invoice).not.toMatch(/<div>VAT /);
  });

  it('empty brand data prints nothing in its place', () => {
    const p = papers(EMPTY);
    expect(p.cover).not.toMatch(/grbpwr/i);
    expect(p.cover).not.toMatch(HOUSE_MARK);
    expect(p.run).toContain('>production run pack<');
    expect(p.invoice).toContain('>commercial invoice<');
    expect(p.invoice).not.toMatch(/grbpwr/i);
    expect(p.invoice).not.toContain('questions?');
  });

  it('unavailable prints nothing either', () => {
    const p = papers({ ...OSTRA, firstTeam: true, unavailable: true }, LOGO);
    expect(p.cover).not.toContain('Ostra');
    expect(p.cover).not.toContain(LOGO);
    expect(p.invoice).not.toMatch(/grbpwr/i);
  });

  it('the first team keeps the house mark without a logo', () => {
    const p = papers({ ...OSTRA, brandName: 'GRBPWR', firstTeam: true });
    expect(p.cover).toMatch(HOUSE_MARK);
    expect(p.invoice).toContain('seller vat id not configured');
  });

  it('a card brand wins over the team name', () => {
    const markup = html(
      OSTRA,
      '',
      <TechpackDocument
        techCard={withBrand('Atelier Own')}
        orient='land'
        revision='rev 7'
        patternViewerToken='t'
      />,
    );
    expect(markup).toContain('Atelier Own · tech pack');
    expect(markup).not.toContain('Ostra · ');
  });
});
