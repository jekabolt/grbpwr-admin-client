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
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { createRoot } from 'react-dom/client';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { FabricsHardware } from 'components/managers/tech-card/components/design/pattern/fabrics-hardware';
import type { MaterialSlot } from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
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

const BAND = {
  assets: [
    asset(201, 'fabric', 'rosso · main fabric', TWILL),
    asset(301, 'hardware', 'rosso · front button', BUTTON),
  ],
  assetBindings: [
    { colorwayId: 11, bomItemId: 1, assetId: 201 },
    { colorwayId: 11, bomItemId: 3, assetId: 301 },
  ],
  bench: [],
  runs: [],
} as unknown as GetDesignBandResponse;
(window as unknown as { __band: unknown }).__band = BAND;

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
  slot(3, 'hardware', 'button', 'FRONT BUTTON', '', 'TECH_CARD_BOM_SECTION_TRIMS'),
  slot(4, 'hardware', 'zipper', 'ZIP', '', 'TECH_CARD_BOM_SECTION_TRIMS'),
  slot(5, 'hardware', 'label', 'BRAND LABEL', '', 'TECH_CARD_BOM_SECTION_LABELS'),
  slot(6, 'hardware', 'snap', 'SNAP', '', 'TECH_CARD_BOM_SECTION_TRIMS'),
];

/* `ColourwayCreatePopover` reads the tech-card form; the closed popover needs only a context. */
function Form({ children }: { children: React.ReactNode }) {
  const form = useForm({ defaultValues: { colorways: [] } as never });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function Harness() {
  const { band: live, isLoading } = useDesignBand(1);
  const [colorwayId, setColorwayId] = useState(11);
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
          slots={SLOTS}
          onGoStep={() => {}}
        />
      </div>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <DesignCapabilityProvider value>
      <DictionaryProvider>
        <Form>
          <Harness />
        </Form>
      </DictionaryProvider>
    </DesignCapabilityProvider>
  </QueryClientProvider>,
);
