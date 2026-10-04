// СТЕНД ПЛИТЫ ЛИСТА (T17, лейн M). Монтирует НАСТОЯЩИЙ `PlateGrid` панели артефактов с одной
// плитой и ВЗВЕДЁННЫМ инструментом — так, как лист живёт всегда. Открытия крупного вида (`onZoom`)
// и поставленные выноски пишутся в `#state`. Прогоняется `scripts/plate-open-probe.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PlateGrid,
  type DocumentPlate,
} from 'components/managers/tech-card/components/design/artifacts-panel';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'><rect width='400' height='500' fill='#ddd'/></svg>",
  );

const plate: DocumentPlate = {
  key: 'p1',
  name: 'front flat',
  caption: 'front',
  mediaId: 77,
  origin: 'card',
  media: {
    id: 77,
    media: {
      fullSize: { mediaUrl: PIC, width: 400, height: 500 },
      compressed: { mediaUrl: PIC, width: 400, height: 500 },
      thumbnail: { mediaUrl: PIC, width: 400, height: 500 },
    },
  } as DocumentPlate['media'],
};

const noop = () => {};

function Harness() {
  const [zooms, setZooms] = useState<number[]>([]);
  const [added, setAdded] = useState(0);
  return (
    <div style={{ padding: 40 }}>
      <PlateGrid
        cells={[{ type: 'plate', plate, index: 0 }]}
        layout='strip'
        hoverIndex={null}
        onView3d={noop}
        calloutsOf={() => []}
        selected={null}
        canPlaceOn={() => true}
        tool='label'
        onToolDone={noop}
        onAddCallout={() => setAdded((n) => n + 1)}
        bindings={{}}
        onZoom={(i) => setZooms((z) => [...z, i])}
        sheetFieldOf={() => undefined}
        detachInert='read only'
        editInert='read only'
        marksChosen={false}
      />
      <pre id='state'>{JSON.stringify({ zooms, added })}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Harness />
  </QueryClientProvider>,
);
