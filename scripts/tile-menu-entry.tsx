// СТЕНД УГЛОВЫХ МЕНЮ ПЛИТОК (гейт волны плиток, TF2–TF4). Настоящие компоненты над поддельной
// полосой; сеть — прокси в пробе (`window.__calls`, `window.__hold`), полоса читается настоящим
// `useDesignBand`, так что запись инвалидирует ключ и экран перечитывает её, как в жизни.
//   · `fabric`  — карусель LAST FABRICS: 201 надета на ROSSO · outer, 202 свободна (TF2);
//   · `nobind`  — та же карусель на сервере без привязок: пар нет, угол `more ▾` с одним delete (TF2);
//   · `palette` — сетка CLOTHS рендера: угол `more ▾` с одним delete, ✕ нет (TF2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
} from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { FabricCarousel } from 'components/managers/tech-card/components/design/pattern/fabric-carousel';
import type { ClothSlot } from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { TextureGrid } from 'components/managers/tech-card/components/design/render/palette';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#ddd'/></svg>",
  );

const media = (id: number) =>
  ({ id, thumbnail: { mediaUrl: PIC }, fullSize: { mediaUrl: PIC } }) as never;
const asset = (id: number, name: string): common_DesignAsset =>
  ({
    id,
    kind: 'fabric',
    name,
    mediaId: 500 + id,
    media: media(500 + id),
  }) as unknown as common_DesignAsset;

const BAND = {
  assets: [asset(201, 'twill'), asset(202, 'canvas')],
  assetBindings: [{ colorwayId: 11, bomItemId: 1, assetId: 201 }],
  bench: [],
  runs: [],
} as unknown as GetDesignBandResponse;
(window as unknown as { __band: unknown }).__band = BAND;

const colorways = [{ colorwayId: 11, devName: 'ROSSO' }] as common_AdminColorwayRef[];
const slots = [
  { bomItemId: 1, lineKey: 'a', name: 'outer', purpose: '', purposeLabel: '' },
] as unknown as ClothSlot[];
const none = new Set<string>();
const draft = { recipe: { fabrics: [] }, echo: () => {} } as never;
const cell = { width: 420, position: 'relative' as const };

function Harness() {
  /* The band the screen reads — the query every write invalidates (TF4 waits on its refetch). */
  const { band: live, isLoading } = useDesignBand(1);
  if (isLoading) return null;
  return (
    <PictureGalleryProvider>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 40 }}>
        <div data-probe='fabric' style={cell}>
          <FabricCarousel
            band={live}
            techCardId={1}
            bindings
            colorways={colorways}
            slots={slots}
            live={[]}
            making={none}
            failed={null}
          />
        </div>
        <div data-probe='nobind' style={cell}>
          <FabricCarousel
            band={live}
            techCardId={1}
            bindings={false}
            colorways={colorways}
            slots={slots}
            live={[]}
            making={none}
            failed={null}
          />
        </div>
        <div data-probe='palette' style={cell}>
          <TextureGrid band={live} techCardId={1} state={draft} />
        </div>
      </div>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <DesignCapabilityProvider value>
      <Harness />
    </DesignCapabilityProvider>
  </QueryClientProvider>,
);
