// Точка входа пробы полосы входов DESIGN (T-8, круг 4).
//
// ДВЕ ПОЛОСЫ ПОД ОДНИМ ПРОВАЙДЕРОМ — и это весь смысл стенда. Предмет требования не «есть ли зум
// на плитке», а «листается ли из него ЧУЖОЙ блок»: до правки каждый экран монтировал свой
// `MediaViewer` со своим рядом, и ряд кончался на краю блока. Одна полоса этого не показала бы
// вовсе — с одним блоком «свой просмотрщик» и «общий» неразличимы.
//
// Компоненты НАСТОЯЩИЕ, из репозитория: подменять здесь нечего, сеть эти органы не трогают.
import { createRoot } from 'react-dom/client';

import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import {
  Strip,
  StripCell,
} from 'components/managers/tech-card/components/design/render/strip-cell';

type Cell = { id: string; src: string; alt: string; badge?: string; emphasis?: boolean };
type Probe = { mount: (strips: { key: string; cells: Cell[] }[]) => void };

declare global {
  interface Window {
    __strip: Probe;
  }
}
const probe = {} as Probe;
window.__strip = probe;

probe.mount = (strips) => {
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  createRoot(el).render(
    <PictureGalleryProvider>
      <div style={{ width: 900 }}>
        {strips.map((s) => (
          <div key={s.key} data-strip={s.key}>
            <Strip>
              {s.cells.map((c) => (
                <div key={c.id} data-cell={c.id} className='contents'>
                  <StripCell
                    src={c.src}
                    alt={c.alt}
                    badge={c.badge}
                    emphasis={c.emphasis}
                    gallery={{ src: c.src, thumbnail: c.src, type: 'image', alt: c.alt }}
                    lines={['line one', 'line two']}
                  />
                </div>
              ))}
            </Strip>
          </div>
        ))}
      </div>
    </PictureGalleryProvider>,
  );
};
