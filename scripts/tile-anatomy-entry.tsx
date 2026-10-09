// СТЕНД АНАТОМИИ ПЛИТКИ (лейн P, 20-TILE-SPEC §3). Монтирует НАСТОЯЩИЙ `PictureTile` трижды:
//   · `full`  — ярлык + флаг + ✕ + crop + menu + edit (все роли спеки, кроме split/mask/select);
//   · `plain` — только edit: эталон места `edit`, которое меню не имеет права сдвинуть;
//   · `busy`  — меню с `pending`: угол виден в покое и не нажимается.
// Выборы меню — в `#state`. Прогоняется `scripts/tile-anatomy-probe.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PictureGalleryProvider,
  PictureTile,
} from 'components/managers/tech-card/components/design/picture-tile';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#ddd'/></svg>",
  );

const noop = () => {};

function Harness() {
  const [picks, setPicks] = useState<string[]>([]);
  const [removed, setRemoved] = useState(0);
  const items = [
    { value: 'front', label: 'front' },
    { value: 'back', label: 'back', current: true },
    { value: 'side', label: 'side', disabled: true },
    { value: 'delete', label: 'delete…', tone: 'danger' as const },
  ];
  const cell = { width: 220, position: 'relative' as const };
  return (
    <PictureGalleryProvider>
      <div style={{ display: 'flex', gap: 24, padding: 120 }}>
        <div data-probe='full' style={cell}>
          <PictureTile
            url={PIC}
            alt='run 7 · b'
            aspect='1/1'
            gallery={{ src: PIC, alt: 'run 7 · b' }}
            badge='front'
            flag={{ word: 'proposed', tone: 'attention', title: 'drafted by the run' }}
            onRemove={{ onClick: () => setRemoved((n) => n + 1), ariaLabel: 'take run 7 · b off' }}
            onCrop={{ onClick: noop, ariaLabel: 'crop run 7 · b' }}
            onEdit={{ onClick: noop, ariaLabel: 'edit run 7 · b' }}
            menu={{
              label: 'slot',
              ariaLabel: 'put run 7 · b into a slot',
              items,
              onPick: (v) => setPicks((p) => [...p, v]),
              'data-menu': 'slot:7',
            }}
          />
        </div>
        <div data-probe='plain' style={cell}>
          <PictureTile
            url={PIC}
            alt='plain'
            aspect='1/1'
            onEdit={{ onClick: noop, ariaLabel: 'edit plain' }}
          />
        </div>
        <div data-probe='busy' style={cell}>
          <PictureTile
            url={PIC}
            alt='busy'
            aspect='1/1'
            menu={{
              label: 'slot',
              ariaLabel: 'put busy into a slot',
              items,
              onPick: (v) => setPicks((p) => [...p, `busy:${v}`]),
              pending: true,
              'data-menu': 'slot:busy',
            }}
          />
        </div>
      </div>
      <button type='button' data-probe='away' style={{ position: 'fixed', right: 8, bottom: 8 }}>
        away
      </button>
      <pre id='state' style={{ position: 'fixed', left: -9999, top: 0 }}>
        {JSON.stringify({ picks, removed })}
      </pre>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
