// СТЕНД ПЛИТКИ: ОДИН КЛИК ИЛИ ДВА (hotfix HX2). Монтирует НАСТОЯЩИЙ `PictureTile` дважды:
//   · `arb`   — одиночный клик занят `onOpen` (переключатель выбора), двойной открывает зум;
//   · `plain` — `onOpen` без зума (у плитки нет ряда просмотрщика): клик срабатывает сразу.
//   · `clip`  — лицо-видео (TF1): родные контролы живы, большой вид — двойным кликом по картинке
//     (не по полосе контролов) и скрытым `open large` с клавиатуры.
// Счётчики вызовов — в `#state`. Прогоняется `scripts/picture-tile-click-probe.mjs`.
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
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'><rect width='300' height='400' fill='%23ddd'/></svg>",
  );

const CLIP = 'http://probe.local/clip.mp4';

function Harness() {
  const [arb, setArb] = useState(0);
  const [plain, setPlain] = useState(0);
  return (
    <PictureGalleryProvider>
      <div style={{ display: 'flex', gap: 16 }}>
        <div data-probe='arb' style={{ width: 200, height: 250, position: 'relative' }}>
          <PictureTile
            url={PIC}
            alt='arb'
            gallery={{ src: PIC, alt: 'arb' }}
            selected={arb % 2 === 1}
            onOpen={() => setArb((n) => n + 1)}
          />
        </div>
        <div data-probe='plain' style={{ width: 200, height: 250, position: 'relative' }}>
          <PictureTile url={PIC} alt='plain' onOpen={() => setPlain((n) => n + 1)} />
        </div>
        <div data-probe='clip' style={{ width: 200, height: 250, position: 'relative' }}>
          <PictureTile url={CLIP} alt='clip' gallery={{ src: CLIP, type: 'video', alt: 'clip' }} />
        </div>
      </div>
      <pre id='state' style={{ position: 'fixed', left: -9999, top: 0 }}>
        {JSON.stringify({ arb, plain })}
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
