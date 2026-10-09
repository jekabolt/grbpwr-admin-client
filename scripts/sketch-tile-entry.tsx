// СТЕНД ПЛИТКИ ЭСКИЗА (лейн N2; sketch-tab.tsx `TechCardGallery`). Монтирует НАСТОЯЩУЮ галерею
// листа над настоящей формой (react-hook-form), два кадра: front и back.
//   · вид — в ярлыке (`1 · front`) и угол-меню `front ▾` внизу справа; выбор пишет форму;
//   · первый кадр — флаг `preview`; под кадром ни `kind`-селекта, ни плашки.
// Значения формы — в `window.__form()`. Прогоняется `scripts/sketch-tile-probe.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_MediaFull } from 'api/proto-http/admin';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { TechCardGallery } from 'components/managers/tech-card/components/sketch-tab';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#ddd'/></svg>",
  );
const full = (id: number) =>
  ({
    id,
    media: {
      fullSize: { mediaUrl: PIC, width: 300, height: 300 },
      thumbnail: { mediaUrl: PIC, width: 300, height: 300 },
    },
  }) as unknown as common_MediaFull;
const mediaById = new Map([
  [11, full(11)],
  [12, full(12)],
]);
const history = { record: () => {}, undo: () => {}, canUndo: () => false, reset: () => {} };

declare global {
  interface Window {
    __form: () => { values: unknown; dirty: boolean };
  }
}

function Harness({ frozen, probe }: { frozen: boolean; probe: string }) {
  const form = useForm({
    defaultValues: {
      technicalMedia: [
        { mediaId: 11, kind: 'TECH_CARD_MEDIA_KIND_FRONT' },
        { mediaId: 12, kind: 'TECH_CARD_MEDIA_KIND_BACK' },
      ],
      moodboardMedia: [],
      callouts: [],
      measurementUnit: '',
    } as never,
  });
  // Чтение в рендере подписывает прокси `formState` на флаг — иначе он не считается.
  void form.formState.isDirty;
  if (!frozen)
    window.__form = () => ({
      values: form.getValues(),
      dirty: form.formState.isDirty,
    });
  return (
    <FormProvider {...form}>
      <div data-probe={probe} style={{ width: 900 }}>
        <TechCardGallery
          listName='technicalMedia'
          mediaById={mediaById}
          onPickedMedia={() => {}}
          emptyLabel='empty'
          addLabel='+ view'
          purpose='tech sketch'
          frozen={frozen}
          cardPieces={[]}
          shapeOf={() => null}
          history={history as never}
        />
      </div>
    </FormProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness frozen={false} probe='live' />
    <Harness frozen probe='frozen' />
  </QueryClientProvider>,
);
