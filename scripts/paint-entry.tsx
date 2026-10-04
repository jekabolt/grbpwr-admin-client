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
import { REGIONS_ALGO_REV } from 'components/managers/tech-card/components/design/paint/regions';
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

/*
 * Ф2 stand (`window.__stand === 'f2'`): the shirt flats c49-p111 (front) / c49-p112 (back) with
 * auto parts. The groups are Sonnet's from f0/out/c49-p11x/som-claude-sonnet-5.5.json, renumbered to the
 * TS cutter (its first-seen order differs from the probe's) and named by the wearer's left, as the
 * server prompt asks. FRONT comes with the band; BACK is asked through SuggestDesignParts (stub).
 */
const STAND = (window as unknown as { __stand?: string }).__stand ?? '';
const F2 = STAND.startsWith('f2');
/*
 * Ф2.1 stand (`__stand === 'f5'`): the four sides of c49-p122/123/124 (the right side is the left
 * one mirrored). The band holds only a STALE front row (no part_key, from the side-by-side call):
 * it names the front meanwhile and asks the card-level call, which answers every side with keys
 * (`__fakeCard`, authored over the TS cutter's marks — see `paint-shot.mjs`).
 */
const F5 = STAND.startsWith('f5');
const FAKE_PARTS: Record<string, unknown> = {
  front: {
    view: 'front',
    baseMediaId: 101,
    algoRev: REGIONS_ALGO_REV,
    parts: [
      { label: 'collar stand', regions: [1, 5] },
      { label: 'collar', regions: [2, 3] },
      { label: 'yoke', regions: [4, 6, 11] },
      { label: 'right front', regions: [8, 10, 18] },
      { label: 'left front', regions: [7, 19] },
      { label: 'placket', regions: [9, 21] },
      { label: 'right sleeve', regions: [12] },
      { label: 'left sleeve', regions: [13] },
      { label: 'pocket flap', regions: [14] },
      { label: 'pocket', regions: [15] },
      { label: 'right cuff', regions: [16] },
      { label: 'left cuff', regions: [17] },
      { label: 'hem band', regions: [20] },
    ],
    splitNeeded: [{ region: 20, why: 'hem band and front share it' }],
    model: 'anthropic/claude-sonnet-5.5',
  },
  back: {
    view: 'back',
    baseMediaId: 102,
    algoRev: REGIONS_ALGO_REV,
    parts: [
      { label: 'collar', regions: [1] },
      { label: 'yoke', regions: [2] },
      { label: 'back body', regions: [3] },
      { label: 'left sleeve', regions: [4] },
      { label: 'right sleeve', regions: [5] },
      { label: 'left sleeve placket', regions: [6] },
      { label: 'right sleeve placket', regions: [7] },
      { label: 'left cuff', regions: [8, 10] },
      { label: 'right cuff', regions: [9, 11] },
      { label: 'hem band', regions: [12, 13] },
    ],
    splitNeeded: [],
    model: 'anthropic/claude-sonnet-5.5',
  },
};
(window as unknown as { __fakeParts: unknown }).__fakeParts = FAKE_PARTS;
/* The card-level answer of the f5 stand, read off the TS cutter's marks (shots/f5-marks-*.png):
   one part = one key on every side it shows on; side views carry their own side's parts. */
const card = (view: string, parts: [string, string, number[]][]) => ({
  view,
  algoRev: REGIONS_ALGO_REV,
  parts: parts.map(([partKey, label, regions]) => ({ label, regions, partKey })),
  splitNeeded: [],
  model: 'anthropic/claude-sonnet-5.5',
});
(window as unknown as { __fakeCard: unknown }).__fakeCard = F5
  ? {
      front: card('front', [
        ['collar', 'collar', [1, 2, 3, 6]],
        ['right-front-body', 'right front body', [4]],
        ['left-front-body', 'left front body', [5]],
        ['front-placket', 'front placket', [7, 8, 11, 14, 15, 16, 17, 18, 19]],
        ['left-pocket', 'left pocket', [12, 13]],
        ['right-sleeve', 'right sleeve', [9]],
        ['left-sleeve', 'left sleeve', [10]],
        ['right-cuff', 'right cuff', [20]],
        ['left-cuff', 'left cuff', [21]],
      ]),
      back: card('back', [
        ['collar', 'collar', [1]],
        ['back-yoke', 'back yoke', [2]],
        ['back-body', 'back body', [3]],
        ['left-sleeve', 'left sleeve', [4, 6]],
        ['right-sleeve', 'right sleeve', [5, 7]],
        ['left-cuff', 'left cuff', [8, 10]],
        ['right-cuff', 'right cuff', [9, 11]],
      ]),
      side_l: card('side_l', [
        ['collar', 'collar', [1]],
        ['back-yoke', 'back yoke', [2]],
        ['left-front-body', 'left front body', [3]],
        ['left-pocket', 'left pocket', [6, 7]],
        ['left-sleeve', 'left sleeve', [5, 8]],
        ['back-body', 'back body', [4]],
        ['left-cuff', 'left cuff', [9, 10]],
      ]),
      side_r: card('side_r', [
        ['collar', 'collar', [1]],
        ['back-yoke', 'back yoke', [2]],
        ['right-front-body', 'right front body', [3, 6, 7]],
        ['right-sleeve', 'right sleeve', [5, 8]],
        ['back-body', 'back body', [4]],
        ['right-cuff', 'right cuff', [9, 10]],
      ]),
    }
  : undefined;

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
  bench: F5
    ? [
        bench(1, 'front', 'c49-p122.png', 555, 852),
        bench(2, 'back', 'c49-p123.png', 556, 851),
        bench(3, 'side_l', 'c49-p124-side.png', 328, 851),
        bench(4, 'side_r', 'c49-p124-side-mirror.png', 328, 851),
      ]
    : F2
      ? [bench(1, 'front', 'c49-p111.png', 807, 851), bench(2, 'back', 'c49-p112.png', 807, 851)]
      : [
          bench(1, 'front', 'c49-p122.png', 555, 852),
          bench(2, 'back', 'c49-p123.png', 556, 851),
          bench(3, 'side_l', 'c49-p124-side.png', 328, 851),
        ],
  partsSuggestions: F2
    ? [FAKE_PARTS.front]
    : F5
      ? [
          {
            view: 'front',
            baseMediaId: 101,
            algoRev: REGIONS_ALGO_REV,
            parts: [{ label: 'front body', regions: [1, 2, 3] }],
            splitNeeded: [],
          },
        ]
      : [],
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
    paintRun({
      band,
      plan: paint.plan(),
      slots: SLOTS,
      colorwayId: 11,
      colorwayLabel: 'ROSSO',
      partNames: paint.partNames(),
    });
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
