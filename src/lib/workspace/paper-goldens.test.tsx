// Byte-for-byte guard of today's factory papers (wave «teams», W2 §5.4). Pinned BEFORE the team
// brand reached the papers: rendered with no team brand (teams OFF, prod), every paper must keep
// its exact markup. A diff here means prod paper changed — never re-record to make a test pass.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_TechCard } from 'api/proto-http/admin';
import type { common_OrderFull } from 'api/proto-http/frontend';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
    window: { location: { origin: 'https://admin.beta.grbpwr.com' } },
  });
});
afterAll(() => {
  vi.useRealTimers();
});

function html(node: ReactElement, seed?: (qc: QueryClient) => void): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
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

describe('paper goldens (no team brand)', () => {
  for (const [name, card] of CARDS) {
    it(`tech pack (cover, labels) · ${name}`, async () => {
      const markup = html(
        <TechpackDocument techCard={card} orient='land' revision='rev 7' patternViewerToken='t' />,
      );
      await expect(markup).toMatchFileSnapshot(`./__goldens__/techpack-${name}.html`);
    });

    it(`classic pack · ${name}`, async () => {
      const markup = html(<TechPackDocument techCard={card} patternViewerToken='t' />);
      await expect(markup).toMatchFileSnapshot(`./__goldens__/classic-pack-${name}.html`);
    });

    it(`run pack · ${name}`, async () => {
      const id = card.id ?? 0;
      const markup = html(
        <RunPackDocument
          run={{ id: 31, run: { techCardId: id, status: 'PRODUCTION_RUN_STATUS_PLANNED' } } as never}
          runPackToken='t'
        />,
        (qc) => qc.setQueryData(techCardKeys.detail(id), card),
      );
      await expect(markup).toMatchFileSnapshot(`./__goldens__/run-pack-${name}.html`);
    });
  }

  it('invoice · no VAT id configured', async () => {
    const markup = html(<InvoiceDocument orderDetails={ORDER} orderStatus='confirmed' />);
    await expect(markup).toMatchFileSnapshot('./__goldens__/invoice.html');
  });

  it('invoice · VAT id configured', async () => {
    vi.stubEnv('VITE_SELLER_VAT_ID', 'PL0000000000');
    vi.resetModules();
    try {
      const mod = await import('components/managers/order/components/invoice-document');
      const markup = html(<mod.InvoiceDocument orderDetails={ORDER} orderStatus='confirmed' />);
      expect(markup).toContain('PL0000000000');
      await expect(markup).toMatchFileSnapshot('./__goldens__/invoice-vat.html');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
