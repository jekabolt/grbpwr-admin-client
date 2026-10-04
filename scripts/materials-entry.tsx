// СТЕНД ШАГА MATERIALS — визуальный, не тест. Настоящий `FabricsHardware` над поддельной полосой:
// три колорвея (ROSSO выбран), ткани MAIN FABRIC (привязана) + LINING, фурнитура FRONT BUTTON
// (привязана) + ZIP + BRAND LABEL + SNAP. Сеть — прокси в `materials-shot.mjs`;
// `SetDesignAssetBinding` правит `window.__band`, так что `clear` и `undo` видны как в жизни.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
} from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { FabricsHardware } from 'components/managers/tech-card/components/design/pattern/fabrics-hardware';
import {
  materialSlots,
  type BomLineLike,
  type MaterialSlot,
} from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

const svg = (body: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'>${body}</svg>`,
  );

/* Wool twill in ROSSO: diagonal wales over the base red. */
const TWILL = svg(
  `<defs><pattern id='t' width='12' height='12' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>` +
    `<rect width='12' height='12' fill='#b3262b'/><rect width='5' height='12' fill='#8f1d22'/></pattern></defs>` +
    `<rect width='600' height='600' fill='url(#t)'/>`,
);
/* A four-hole button. */
const BUTTON = svg(
  `<rect width='600' height='600' fill='#f2f2f2'/>` +
    `<circle cx='300' cy='300' r='190' fill='#5a1215'/><circle cx='300' cy='300' r='150' fill='#7a1a1e'/>` +
    `<circle cx='260' cy='260' r='18' fill='#f2f2f2'/><circle cx='340' cy='260' r='18' fill='#f2f2f2'/>` +
    `<circle cx='260' cy='340' r='18' fill='#f2f2f2'/><circle cx='340' cy='340' r='18' fill='#f2f2f2'/>`,
);

const media = (id: number, url: string) =>
  ({
    id,
    media: {
      thumbnail: { mediaUrl: url, width: 600, height: 600 },
      fullSize: { mediaUrl: url, width: 600, height: 600 },
    },
  }) as never;
const asset = (id: number, kind: string, name: string, url: string): common_DesignAsset =>
  ({
    id,
    kind,
    name,
    mediaId: 500 + id,
    media: media(500 + id, url),
  }) as unknown as common_DesignAsset;

/* Round 7: a cut-out chest embroidery — a transparent PNG-like picture (no ground), on the cell's
   checkerboard. Its note carries the `· cut` marker, so no cutout run is chained for it. */
const CHEST = svg(
  `<g transform='translate(300 300)'><circle r='170' fill='none' stroke='#b3262b' stroke-width='34'/>` +
    `<text y='34' font-family='Helvetica, Arial' font-size='108' font-weight='700' text-anchor='middle' fill='#111'>GB</text></g>`,
);
const chest = asset(401, 'hardware', 'rosso · chest logo', CHEST);
(chest as unknown as { note: string }).note = 'embroidery · cut';

const BAND = {
  assets: [
    asset(201, 'fabric', 'rosso · main fabric', TWILL),
    asset(301, 'hardware', 'rosso · front button', BUTTON),
    chest,
  ],
  assetBindings: [
    { colorwayId: 11, bomItemId: 1, assetId: 201 },
    { colorwayId: 11, bomItemId: 3, assetId: 301 },
    { colorwayId: 11, bomItemId: 7, assetId: 401 },
  ],
  bench: [],
  runs: [],
} as unknown as GetDesignBandResponse;
/* `#making`: LINING and ZIP have live pattern runs (the cancel corner and `cancel all`). */
if (location.hash === '#making') {
  const live = (id: number, bomItemId: number) => ({
    id,
    kind: 'pattern',
    status: 'running',
    startedAt: new Date(Date.now() - 12_000).toISOString(),
    params: { colorwayId: 11, pattern: { bomItemId } },
  });
  (BAND as unknown as { runs: unknown[] }).runs = [live(701, 2), live(702, 4)];
}
(window as unknown as { __band: unknown }).__band = BAND;
/* The library the picture slot opens: one horn button reference. */
const HORN = svg(
  `<rect width='600' height='600' fill='#e8e4dc'/>` +
    `<circle cx='300' cy='300' r='200' fill='#1d1a17'/><circle cx='300' cy='300' r='160' fill='#2e2924'/>` +
    `<circle cx='270' cy='300' r='16' fill='#e8e4dc'/><circle cx='330' cy='300' r='16' fill='#e8e4dc'/>`,
);
/* A brand logo artwork: the label slot's `+ logo` picks it (second in the library). */
const LOGO = svg(
  `<rect width='600' height='600' fill='#ffffff'/>` +
    `<text x='300' y='330' font-family='Helvetica, Arial' font-size='96' font-weight='700' ` +
    `text-anchor='middle' fill='#111'>GRBPWR</text>`,
);
(window as unknown as { __library: unknown }).__library = [media(901, HORN), media(902, LOGO)];
/* Card LABELS row of BRAND LABEL (BOM line 5): placement, fold, size seed its words. */
const LABEL_SEEDS = new Map([
  [5, { placement: 'neckline, centre back', folding: 'flat', size: '50 × 20 mm' }],
]);

const cw = (
  colorwayId: number,
  devName: string,
  devHex: string,
  pantone = '',
): common_AdminColorwayRef =>
  ({
    colorwayId,
    devName,
    devHex,
    pantone,
    colorCode: devName.toLowerCase(),
    status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
  }) as unknown as common_AdminColorwayRef;
const COLORWAYS = [
  cw(11, 'ROSSO', '#b3262b', '18-1664 TCX'),
  cw(12, 'OLIVE', '#5b5a2e'),
  cw(13, 'GREY', '#8a8d8f'),
];

const slot = (
  bomItemId: number,
  family: 'fabric' | 'hardware',
  kind: string,
  name: string,
  purposeLabel: string,
  section: string,
  detail = '',
): MaterialSlot => ({
  bomItemId,
  lineKey: `l${bomItemId}`,
  name,
  purpose: '',
  purposeLabel,
  section,
  detail,
  words: [name, detail].filter(Boolean).join(' · '),
  family,
  kind,
});
const SLOTS: MaterialSlot[] = [
  slot(
    1,
    'fabric',
    'fabric',
    'MAIN FABRIC',
    'main material',
    'TECH_CARD_BOM_SECTION_FABRIC',
    '100% wool twill 320 gsm',
  ),
  slot(2, 'fabric', 'fabric', 'LINING', 'lining', 'TECH_CARD_BOM_SECTION_LINING', '100% cupro'),
  slot(3, 'hardware', 'button', 'FRONT BUTTON', '', 'TECH_CARD_BOM_SECTION_TRIM'),
  slot(4, 'hardware', 'zipper', 'ZIP', '', 'TECH_CARD_BOM_SECTION_TRIM'),
  slot(5, 'hardware', 'label', 'BRAND LABEL', '', 'TECH_CARD_BOM_SECTION_LABEL'),
  slot(6, 'hardware', 'snap', 'SNAP', '', 'TECH_CARD_BOM_SECTION_TRIM'),
  slot(7, 'hardware', '', 'CHEST LOGO', '', 'TECH_CARD_BOM_SECTION_DECORATION', 'embroidery'),
  slot(8, 'hardware', '', 'BACK PRINT', '', 'TECH_CARD_BOM_SECTION_DECORATION', 'screen print'),
];

/* `ColourwayCreatePopover` reads the tech-card form; the closed popover needs only a context. */
function Form({ children }: { children: React.ReactNode }) {
  const form = useForm({ defaultValues: { colorways: [], bomItems: [] } as never });
  // The shot reads the born lines (name · spec · kind) straight from the form.
  (window as unknown as { __form: typeof form }).__form = form;
  return <FormProvider {...form}>{children}</FormProvider>;
}

/* Autosave stand-in: a line born from `+ artwork` gets a server id 700 ms later. */
function useBornSlots(): MaterialSlot[] {
  const { setValue, getValues } = useFormContext();
  const lines = (useWatch({ name: 'bomItems' }) ?? []) as (BomLineLike & { id?: number })[];
  useEffect(() => {
    if (!lines.some((l) => !l.id)) return;
    const t = setTimeout(() => {
      const cur = (getValues('bomItems') ?? []) as (BomLineLike & { id?: number })[];
      setValue(
        'bomItems',
        cur.map((l, i) => (l.id ? l : { ...l, id: 800 + i })),
      );
    }, 700);
    return () => clearTimeout(t);
  }, [lines, getValues, setValue]);
  return materialSlots(lines).slots;
}

function Harness() {
  const { band: live, isLoading } = useDesignBand(1);
  const [colorwayId, setColorwayId] = useState(11);
  const born = useBornSlots();
  if (isLoading || !live) return null;
  return (
    <PictureGalleryProvider techCardId={1} band={live}>
      <div data-probe='materials' style={{ padding: 24, maxWidth: 1200 }}>
        <FabricsHardware
          band={live}
          techCardId={1}
          colorways={COLORWAYS}
          colorwayId={colorwayId}
          onColorwayChange={setColorwayId}
          slots={[...SLOTS, ...born]}
          labelSeeds={LABEL_SEEDS}
          onGoStep={() => {}}
        />
      </div>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    {/* The library dialog navigates; it needs a router. */}
    <MemoryRouter>
      <DesignCapabilityProvider value>
        <DictionaryProvider>
          <Form>
            <Harness />
          </Form>
        </DictionaryProvider>
      </DesignCapabilityProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
