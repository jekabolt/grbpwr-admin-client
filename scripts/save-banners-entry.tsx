// Точка входа для ЖИВОЙ разметки двух баннеров сохранения: настоящие компоненты карточки,
// настоящий React, настоящий DOM.
//
// Функциональная половина обеих проб (классификатор Ф5, аудит присутствия Ф7) считается в node —
// она не про экран. Но «баннер ПОКАЗАН» доказывается только смонтированной разметкой: возврат
// функции говорит, что данные для баннера собраны, и ровно ничего не говорит о том, дошли ли они
// до экрана. В этом репозитории уже была зелёная проба, склеившая соседние узлы, — поэтому органы
// ищутся по `data-*`-якорям, а не по тексту страницы.
import { createRoot } from 'react-dom/client';

import {
  PresenceLossBanner,
  VersionSkewBanner,
  type VersionSkew,
} from 'components/managers/tech-card/components/save-audit-banners';
import type { PresenceAudit } from 'components/managers/tech-card/components/operations-presence';

type BannerProbe = {
  skew: (s: VersionSkew) => void;
  presence: (a: PresenceAudit) => void;
  dismissed: () => number;
};

declare global {
  interface Window {
    __banners: BannerProbe;
  }
}

let dismissed = 0;

const host = () => {
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  return createRoot(el);
};

window.__banners = {
  skew: (s) => host().render(<VersionSkewBanner skew={s} onDismiss={() => (dismissed += 1)} />),
  presence: (a) =>
    host().render(<PresenceLossBanner audit={a} onDismiss={() => (dismissed += 1)} />),
  dismissed: () => dismissed,
};
