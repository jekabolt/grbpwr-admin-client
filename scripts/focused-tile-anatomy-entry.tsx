// СТЕНД АНАТОМИИ ПЛИТКИ `FocusedAnnotator` (лейн K, 20-TILE-SPEC §3). Монтирует НАСТОЯЩУЮ галерею
// `layout='grid'` дважды:
//   · `board` — как мудборд: флаг `in the input` у первой картинки, crop низ-слева, edit низ-справа,
//     ✕ «с доски»; зума нет (`zoomable={false}`);
//   · `pick`  — та же доска во взведённом выборе плитки: накладка обязана накрыть ✕ и углы.
// Нажатия — в `#state`. Прогоняется `scripts/focused-tile-anatomy-probe.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { common_MediaFull } from 'api/proto-http/admin';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { TILE_CORNER, TILE_QUIET } from 'ui/components/tile-skin';

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
const VIEWS: FocusedView[] = [
  { key: 'a', mediaId: 11, full: full(11) },
  { key: 'b', mediaId: 12, full: full(12) },
];
const noop = () => {};

function Board({
  probe,
  picking,
  log,
}: {
  probe: string;
  picking: boolean;
  log: (s: string) => void;
}) {
  return (
    <div data-probe={probe} style={{ width: 760 }}>
      <FocusedAnnotator
        layout='grid'
        gridRowHeight={200}
        preferNaturalAspect
        zoomable={false}
        railArrows={false}
        views={VIEWS}
        calloutsFor={() => []}
        onAddCallout={noop}
        onMoveCallout={noop}
        onRemoveCallout={noop}
        onPickMedia={() => []}
        onRemoveMedia={(v) => log(`${probe}:remove:${v.mediaId}`)}
        addLabel='+ picture'
        purpose='probe'
        emptyLabel='empty'
        mediaLabel={(v, i) => `moodboard picture ${i + 1}`}
        tilePick={{ active: picking, onPick: (v) => log(`${probe}:pick:${v.mediaId}`) }}
        removeLabel={(v, i) => `take moodboard picture ${i + 1} off the board`}
        tileFlag={(v) => (v.mediaId === 11 ? { word: 'in the input', tone: 'ink' } : null)}
        tileCorners={(v, i) => ({
          left: (
            <button
              type='button'
              data-mood-crop={v.mediaId}
              aria-label={`crop moodboard picture ${i + 1}`}
              onClick={() => log(`${probe}:crop:${v.mediaId}`)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${TILE_CORNER} ${TILE_QUIET} py-0.5 leading-none`}
            >
              crop
            </button>
          ),
          right: (
            <button
              type='button'
              data-mood-edit={v.mediaId}
              aria-label={`edit moodboard picture ${i + 1}`}
              onClick={() => log(`${probe}:edit:${v.mediaId}`)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${TILE_CORNER} ${TILE_QUIET} py-0.5 leading-none`}
            >
              edit
            </button>
          ),
        })}
      />
    </div>
  );
}

function Harness() {
  const [events, setEvents] = useState<string[]>([]);
  const log = (s: string) => setEvents((e) => [...e, s]);
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 40 }}>
      <Board probe='board' picking={false} log={log} />
      <Board probe='pick' picking log={log} />
      <pre id='state' style={{ position: 'fixed', left: -9999, top: 0 }}>
        {JSON.stringify({ events })}
      </pre>
    </div>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
