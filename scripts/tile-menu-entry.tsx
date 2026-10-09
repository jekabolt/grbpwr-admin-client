// СТЕНД УГЛОВЫХ МЕНЮ ПЛИТОК (гейт волны плиток, TF2–TF4). Настоящие компоненты над поддельной
// полосой; сеть — прокси в пробе (`window.__calls`, `window.__hold`), полоса читается настоящим
// `useDesignBand`, так что запись инвалидирует ключ и экран перечитывает её, как в жизни.
//   · `palette` — сетка CLOTHS рендера: угол `more ▾` с одним delete, ✕ нет (TF2).
//   · `render`  — правка рендера на верстаке FABRIC RENDER: `mark ▾` с `delete…` последним; пока
//     удаление летит, меню занято, а вопрос открыт и занят до ответа (TF3); `mark` держит меню
//     занятым до перечитывания полосы (TF4).
//   · `flat`    — свободная плита FLAT: `slot ▾` занят до перечитывания полосы (TF4).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignPicture,
} from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { TextureGrid } from 'components/managers/tech-card/components/design/render/palette';
import { RunTile } from 'components/managers/tech-card/components/design/generation/run-tile';
import {
  RenderDoorsHost,
  RenderStepScope,
} from 'components/managers/tech-card/components/design/render/render-tile';
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

const pic = (id: number, extra: Partial<common_DesignPicture> = {}): common_DesignPicture =>
  ({ id, runId: 7, kind: 'flat', media: media(100 + id), ...extra }) as common_DesignPicture;
/* A render's media in the shape the render tile reads (`media.media.full`). */
const renderMedia = (id: number) =>
  ({
    id,
    thumbnail: { mediaUrl: PIC },
    fullSize: { mediaUrl: PIC },
    media: { full: { mediaUrl: PIC, width: 300, height: 300 }, thumbnail: { mediaUrl: PIC } },
  }) as never;
const flatFree = pic(11, { ghostView: 'back' });
const renderRoot = pic(21, { runId: 8, kind: 'render', colorwayId: 0, media: renderMedia(121) });
const renderEdit = pic(22, {
  runId: 8,
  kind: 'render',
  colorwayId: 0,
  derivedFrom: 21,
  media: renderMedia(122),
});
const renderRun = { id: 8, kind: 'render', pictures: [renderRoot, renderEdit] };

const BAND = {
  assets: [asset(201, 'twill'), asset(202, 'canvas')],
  assetBindings: [{ colorwayId: 11, bomItemId: 1, assetId: 201 }],
  bench: [
    { id: 1, viewKey: 'back', kind: 'flat', pictureId: 0, slotRev: 3 },
    { id: 2, viewKey: 'front', kind: 'flat', pictureId: 0, slotRev: 5 },
    { id: 3, viewKey: 'front', kind: 'render', colorwayId: 0, pictureId: 0, slotRev: 2 },
  ],
  runs: [{ id: 7, kind: 'flat', pictures: [flatFree] }, renderRun],
} as unknown as GetDesignBandResponse;
(window as unknown as { __band: unknown }).__band = BAND;

const draft = { recipe: { fabrics: [] }, echo: () => {} } as never;
const cell = { width: 420, position: 'relative' as const };
const tile = { width: 190, position: 'relative' as const };
const noop = () => {};

function Harness() {
  /* The band the screen reads — the query every write invalidates (TF4 waits on its refetch). */
  const { band: live, isLoading } = useDesignBand(1);
  if (isLoading) return null;
  return (
    <PictureGalleryProvider>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 40 }}>
        <div data-probe='palette' style={cell}>
          <TextureGrid band={live} techCardId={1} state={draft} />
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div data-probe='flat' style={tile}>
            <RunTile
              band={live}
              techCardId={1}
              picture={flatFree}
              siblings={[flatFree]}
              rep='flat'
              galleryKey='g'
              onSplit={noop}
              workbench
              cardFit=''
              runFit=''
            />
          </div>
          <RenderStepScope step={{ colorways: [], cardColorways: [], adopts: false }}>
            <RenderDoorsHost
              band={live}
              techCardId={1}
              pictures={[renderRoot, renderEdit]}
              membersOf={new Map()}
              openDeck={null}
              onDeck={noop}
              runOf={() => renderRun as never}
            >
              <div data-probe='render' style={tile}>
                <RunTile
                  band={live}
                  techCardId={1}
                  picture={renderEdit}
                  siblings={[renderRoot, renderEdit]}
                  rep='render'
                  galleryKey='g'
                  onSplit={noop}
                  workbench
                  cardFit=''
                  runFit=''
                />
              </div>
            </RenderDoorsHost>
          </RenderStepScope>
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
