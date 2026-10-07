// СТЕНД R9 Ф1 · HARDWARE AS PARTS — визуальный, не тест. Настоящие `MaterialsPack` (палитра PARTS:
// ткань │ фурнитура) + `PartsCanvas` над поддельной полосой: пиджак карточки 51 (флэты Ф0
// c51-front/back), колорвей ROSSO, слот MAIN FABRIC (твил) + два слота фурнитуры — FRONT BUTTON с
// белым снимком пуговицы (asset 301) и CUFF BUTTON без картинки в колорвее (пиктограмма, слова).
// Сеть — прокси в `parts-hardware-shot.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PartsCanvas } from 'components/managers/tech-card/components/design/paint/parts-canvas';
import { usePaint } from 'components/managers/tech-card/components/design/paint/use-paint';
import type {
  ClothSlot,
  MaterialSlot,
} from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { MaterialsPack } from 'components/managers/tech-card/components/design/render/materials-pack';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';

/** A twill drawn on a canvas — PNG, so `createImageBitmap` reads it like a real swatch. */
function twill(base: string, wale: string): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 240;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 240, 240);
  g.globalAlpha = 0.5;
  g.strokeStyle = wale;
  g.lineWidth = 4;
  for (let i = -240; i < 480; i += 10) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 240, 240);
    g.stroke();
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

const TWILL = twill('#6f7a86', '#3e4650');
const BUTTON = 'http://probe.local/hw/hw73-front-button.png';

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

const BAND = {
  assets: [
    asset(201, 'fabric', 'charcoal twill', TWILL, '', '#6f7a86'),
    asset(301, 'hardware', 'front closure button', BUTTON, 'horn, black · 20L'),
  ],
  assetBindings: [
    { colorwayId: 11, bomItemId: 1, assetId: 201 },
    { colorwayId: 11, bomItemId: 31, assetId: 301 },
  ],
  assetPlacements: [],
  bench: [bench(1, 'front', 'c51-front.png', 770, 770), bench(2, 'back', 'c51-back.png', 812, 812)],
  partsSuggestions: [],
  runs: [],
  colourPlan: { techCardId: 1, rev: 0, maps: [], cloths: [] },
} as unknown as GetDesignBandResponse;
(window as unknown as { __band: unknown }).__band = BAND;

const SLOTS: ClothSlot[] = [
  {
    bomItemId: 1,
    lineKey: 'l1',
    name: 'MAIN FABRIC',
    purpose: '',
    purposeLabel: '',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    detail: '',
    words: 'MAIN FABRIC',
  },
];
const hw = (bomItemId: number, name: string, detail: string): MaterialSlot => ({
  bomItemId,
  lineKey: `l${bomItemId}`,
  name,
  purpose: '',
  purposeLabel: 'button',
  section: 'TECH_CARD_BOM_SECTION_TRIM',
  detail,
  words: `${name} · button · ${detail}`,
  family: 'hardware',
  kind: 'TECH_CARD_BOM_KIND_BUTTON',
});
const HARDWARE = [hw(31, 'FRONT BUTTON', 'horn · 20L'), hw(32, 'CUFF BUTTON', 'horn · 16L')];

function Harness() {
  const { band, isLoading } = useDesignBand(1);
  const paint = usePaint(1, band, SLOTS, 11, HARDWARE);
  (window as unknown as { __paint: unknown }).__paint = paint;
  if (isLoading) return null;
  return (
    <PictureGalleryProvider techCardId={1} band={band}>
      <div data-probe='parts-hardware' style={{ padding: 24, maxWidth: 1400 }}>
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
          />
          <PartsCanvas session={paint} band={band} />
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
