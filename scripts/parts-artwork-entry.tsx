// СТЕНД R7 · ARTWORK ON THE PARTS — визуальный, не тест. Настоящие `MaterialsPack` (палитра +
// плитки артворков) + `PartsCanvas` (инструмент `artwork`) над поддельной полосой: две стороны с
// флэтами Ф0 (c49-p122/123), колорвей ROSSO, слоты MAIN FABRIC + два DECORATION (вышивка на белом
// грунте → multiply, принт с вырезанным фоном `· cut`). Сеть — прокси в `parts-artwork-shot.mjs`:
// SetDesignAssetPlacement / DeleteDesignAssetPlacement пишут в `window.__band.assetPlacements`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PartsCanvas } from 'components/managers/tech-card/components/design/paint/parts-canvas';
import { artworksOf } from 'components/managers/tech-card/components/design/paint/artworks';
import { usePaint } from 'components/managers/tech-card/components/design/paint/use-paint';
import type { ClothSlot } from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { MaterialsPack } from 'components/managers/tech-card/components/design/render/materials-pack';
import { useMemo } from 'react';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';

/** A woven texture drawn on a canvas — PNG, so `createImageBitmap` reads it like a real swatch. */
function texture(base: string, wale: string, kind: 'twill' | 'check' | 'denim'): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 240;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 240, 240);
  g.fillStyle = wale;
  if (kind === 'check') {
    for (let i = 0; i < 240; i += 40) {
      g.globalAlpha = 0.55;
      g.fillRect(i, 0, 14, 240);
      g.fillRect(0, i, 240, 14);
    }
  } else {
    g.globalAlpha = kind === 'denim' ? 0.35 : 0.6;
    for (let i = -240; i < 480; i += kind === 'denim' ? 6 : 10) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 240, 240);
      g.lineWidth = kind === 'denim' ? 2 : 4;
      g.strokeStyle = wale;
      g.stroke();
    }
  }
  return c.toDataURL('image/png');
}

const media = (id: number, url: string, w = 600, h = 600) =>
  ({
    id,
    media: {
      thumbnail: { mediaUrl: url, width: w, height: h },
      fullSize: { mediaUrl: url, width: w, height: h },
    },
  }) as never;

/** An artwork picture: a white-ground embroidery (multiply) or a cut-out print (alpha). */
function artwork(kind: 'embroidery' | 'print'): string {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 400;
  const g = c.getContext('2d')!;
  if (kind === 'embroidery') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 400, 400);
    g.strokeStyle = '#1d1d1d';
    g.lineWidth = 18;
    g.beginPath();
    g.arc(200, 200, 150, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d8b04a';
    g.font = 'bold 120px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GBP', 200, 205);
  } else {
    g.fillStyle = '#f4f1ea';
    g.font = 'bold 150px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GRB', 200, 150);
    g.fillStyle = '#111';
    g.fillRect(40, 260, 320, 40);
  }
  return c.toDataURL('image/png');
}

const TWILL = texture('#b3262b', '#7d1519', 'twill');
const EMB = artwork('embroidery');
const PRINT = artwork('print');

const asset = (id: number, kind: string, name: string, url: string, note = '', colourHex = '') => ({
  id,
  kind,
  name,
  mediaId: 500 + id,
  media: media(500 + id, url),
  colourHex,
  note,
});
const bench = (id: number, view: string, file: string, w: number, h: number) => ({
  id,
  viewKey: view,
  kind: 'flat',
  pictureId: id,
  slotRev: 1,
  picture: { id, media: media(100 + id, `http://probe.local/flats/${file}`, w, h) },
});
const pt = (x: number, y: number) => ({ x: { value: String(x) }, y: { value: String(y) } });

const BAND = {
  assets: [
    asset(201, 'fabric', 'rosso twill', TWILL, '', '#b3262b'),
    asset(301, 'hardware', 'chest embroidery', EMB, 'embroidery'),
    asset(302, 'hardware', 'back print', PRINT, 'screen print · cut'),
  ],
  assetBindings: [
    { colorwayId: 11, bomItemId: 1, assetId: 201 },
    { colorwayId: 11, bomItemId: 7, assetId: 301 },
    { colorwayId: 11, bomItemId: 8, assetId: 302 },
  ],
  assetPlacements: [
    {
      id: 41,
      assetId: 302,
      pictureId: 2,
      annotation: {
        kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON',
        points: [pt(0.3, 0.3), pt(0.68, 0.27), pt(0.7, 0.45), pt(0.32, 0.48)],
      },
      note: 'screen print',
    },
  ],
  bench: [bench(1, 'front', 'c49-p122.png', 555, 852), bench(2, 'back', 'c49-p123.png', 556, 851)],
  partsSuggestions: [],
  runs: [],
  colourPlan: { techCardId: 1, rev: 0, maps: [], cloths: [] },
} as unknown as GetDesignBandResponse;
(window as unknown as { __band: unknown }).__band = BAND;

const slot = (bomItemId: number, name: string, section: string, detail = ''): ClothSlot =>
  ({
    bomItemId,
    lineKey: `l${bomItemId}`,
    name,
    purpose: '',
    purposeLabel: '',
    section,
    detail,
    words: name,
  }) as ClothSlot;
const SLOTS = [slot(1, 'MAIN FABRIC', 'TECH_CARD_BOM_SECTION_FABRIC')];
const MATERIAL_SLOTS = [
  ...SLOTS,
  slot(7, 'chest embroidery', 'TECH_CARD_BOM_SECTION_DECORATION', 'embroidery'),
  slot(8, 'back print', 'TECH_CARD_BOM_SECTION_DECORATION', 'screen print'),
];

function Harness() {
  const { band, isLoading } = useDesignBand(1);
  const paint = usePaint(1, band, SLOTS, 11);
  const artworks = useMemo(() => artworksOf(band, 11, MATERIAL_SLOTS), [band]);
  (window as unknown as { __paint: unknown }).__paint = paint;
  if (isLoading) return null;
  return (
    <PictureGalleryProvider techCardId={1} band={band}>
      <div data-probe='parts-artwork' style={{ padding: 24, maxWidth: 1400 }}>
        <Section title='fabric render' question='· the cloth on the flats' className='space-y-5'>
          <div>
            <GroupLabel flush>colourway</GroupLabel>
            <div className='pt-1.5 text-micro uppercase'>rosso</div>
          </div>
          <MaterialsPack
            band={band}
            colorwayId={11}
            colorwayLabel='ROSSO'
            slots={SLOTS}
            onEdit={() => {}}
            paint={paint}
            artworks={artworks}
          />
          <PartsCanvas session={paint} band={band} artworks={artworks} />
        </Section>
      </div>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <MemoryRouter>
      <DesignCapabilityProvider value>
        <DictionaryProvider>
          <Harness />
        </DictionaryProvider>
      </DesignCapabilityProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
