// СТЕНД PAINT THE PARTS — визуальный, не тест. Настоящие `MaterialsPack` (палитра) + `PartsCanvas`
// над поддельной полосой: три стороны с флэтами Ф0 (c49-p122/123/124), колорвей ROSSO, слоты
// MAIN FABRIC, CONTRAST, POCKET. Сеть — прокси в `paint-shot.mjs`: UploadContentImage отдаёт
// data-URL обратно, SetDesignColourPlan пишет план в `window.__band` с проверкой ревизии.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PartsCanvas } from 'components/managers/tech-card/components/design/paint/parts-canvas';
import { paintRun } from 'components/managers/tech-card/components/design/paint/plan-run';
import { usePaint } from 'components/managers/tech-card/components/design/paint/use-paint';
import type { ClothSlot } from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { MaterialsPack } from 'components/managers/tech-card/components/design/render/materials-pack';
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

const TWILL = texture('#b3262b', '#7d1519', 'twill');
const CHECK = texture('#efe9dc', '#2a2a2a', 'check');
const DENIM = texture('#2d4a7a', '#c9d3e6', 'denim');

const asset = (id: number, name: string, url: string, colourHex: string) => ({
  id,
  kind: 'fabric',
  name,
  mediaId: 500 + id,
  media: media(500 + id, url),
  colourHex,
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
    asset(201, 'rosso twill', TWILL, '#b3262b'),
    asset(202, 'ecru check', CHECK, '#efe9dc'),
    asset(203, 'indigo denim', DENIM, '#2d4a7a'),
  ],
  assetBindings: [
    { colorwayId: 11, bomItemId: 1, assetId: 201 },
    { colorwayId: 11, bomItemId: 2, assetId: 202 },
    { colorwayId: 11, bomItemId: 3, assetId: 203 },
  ],
  bench: [
    bench(1, 'front', 'c49-p122.png', 555, 852),
    bench(2, 'back', 'c49-p123.png', 556, 851),
    bench(3, 'side_l', 'c49-p124-side.png', 328, 851),
  ],
  runs: [],
  colourPlan: { techCardId: 1, rev: 0, maps: [], cloths: [] },
} as unknown as GetDesignBandResponse;
/* A second page of the stand opens on the plan the first one saved (`__seedPlan`). */
const seed = (window as unknown as { __seedPlan?: unknown }).__seedPlan;
if (seed) (BAND as unknown as { colourPlan: unknown }).colourPlan = seed;
(window as unknown as { __band: unknown }).__band = BAND;

const slot = (bomItemId: number, name: string): ClothSlot =>
  ({
    bomItemId,
    lineKey: `l${bomItemId}`,
    name,
    purpose: '',
    purposeLabel: name.toLowerCase(),
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    detail: '',
    words: name,
  }) as ClothSlot;
const SLOTS = [slot(1, 'MAIN FABRIC'), slot(2, 'CONTRAST'), slot(3, 'POCKET')];

function Harness() {
  const { band, isLoading } = useDesignBand(1);
  const paint = usePaint(1, band, SLOTS, 11);
  (window as unknown as { __paint: unknown }).__paint = paint;
  (window as unknown as { __run: unknown }).__run = () =>
    paintRun({ band, plan: paint.plan(), slots: SLOTS, colorwayId: 11, colorwayLabel: 'ROSSO' });
  if (isLoading) return null;
  return (
    <PictureGalleryProvider techCardId={1} band={band}>
      <div data-probe='paint' style={{ padding: 24, maxWidth: 1400 }}>
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
          <PartsCanvas session={paint} />
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
