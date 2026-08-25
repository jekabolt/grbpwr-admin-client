// Точка входа пробы плитки тех-карты (пп. 11 и 20 волны ux-0825).
//
// Плитка НАСТОЯЩАЯ и ОДНА И ТА ЖЕ для листа и для доски конвейера — это и есть предмет решения
// «не кропать»: свойство миниатюры, а не экрана. Имена категорий приезжают через настоящий
// DictionaryProvider (плитка резолвит их сама, пропом их никто не передаёт), роутер нужен из-за
// useNavigate внутри плитки.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { TechCardTile } from 'components/managers/tech-cards/components/tech-card-tile';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { Tiles } from 'ui/components/tiles';

type Probe = { mount: (cards: Record<string, unknown>[]) => void };
declare global {
  interface Window {
    __tile: Probe;
  }
}
const probe = {} as Probe;
window.__tile = probe;

probe.mount = (cards) => {
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  createRoot(el).render(
    <MemoryRouter>
      <DictionaryProvider>
        <div style={{ width: 900 }}>
          <Tiles min={140}>
            {cards.map((c: any) => (
              <div key={c.id} data-tile={c.id}>
                <TechCardTile card={c} compact={!!c.__compact} />
              </div>
            ))}
          </Tiles>
        </div>
      </DictionaryProvider>
    </MemoryRouter>,
  );
};
