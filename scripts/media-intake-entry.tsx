// Стенд приёмки ⌘V: НАСТОЯЩИЙ хук слота, настоящая приёмная модалка, настоящий движок очереди.
//
// Здесь не переписано ничего из проверяемого. Стенд даёт только то, без чего компоненты не живут
// (клиент запросов), и рукоятки, которыми проба ЧИТАЕТ результат: сколько раз позвали владельца
// слота, с какими id и жива ли страница под свёрнутой отправкой. Вставка имитируется настоящим
// событием `paste` с настоящим `DataTransfer` — тем же путём, которым её ловит `usePasteFiles`.
//
// «Соседнее поле» рядом со слотом — не украшение: «форма кликабельна во время отправки» иначе
// доказывать нечем, а именно это владелец и просил («не убираемая модалка… так быть не должно»).
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { common_MediaFull } from 'api/proto-http/admin';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { useSnackBarStore } from 'lib/stores/store';
import type { PasteAccept } from 'components/managers/media/utils/usePasteFiles';

type MountOpts = {
  limit?: number;
  accept?: PasteAccept;
  lockAspect?: boolean;
  aspect?: number;
  purpose?: string;
  /**
   * СЛОТ ВНУТРИ ЧУЖОГО МОДАЛЬНОГО ОКНА — рабочая конфигурация, а не экзотика: ровно так приёмка
   * живёт внутри диалога выбора медиа (`media-selector.tsx`) и внутри вложений задачи. Пока
   * открыт ЛЮБОЙ модальный слой Radix, `document.body` стоит в `pointer-events: none`
   * (`react-dismissable-layer`: `ownerDocument.body.style.pointerEvents = 'none'`), и «auto»
   * возвращается только самим слоям. Свёрнутая пилюля порталится в body — то есть НЕ слой.
   */
  insideModal?: boolean;
};

type IntakeProbe = {
  mount: (opts: MountOpts) => void;
  /** Открыто ли ещё чужое модальное окно, внутри которого живёт слот. */
  hostOpen: () => boolean;
  /** Сколько РАЗ позвали владельца слота: пачка обязана прийти одним вызовом, а не тремя. */
  calls: () => number;
  /** id всего доставленного, по порядку. Число, а не наличие. */
  delivered: () => number[];
  /** Клики по соседнему полю: страница под свёрнутой отправкой обязана оставаться живой. */
  clicks: () => number;
  /** Слот сообщает «идёт приёмка» — та же величина, которую читают чужие потребители. */
  busy: () => boolean;
  /** Последнее сказанное вслух: отброшенное по потолку обязано быть названо. */
  said: () => string;
};

declare global {
  interface Window {
    __intake: IntakeProbe;
  }
}

const probe = {} as IntakeProbe;
window.__intake = probe;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

probe.said = () => {
  const alerts = useSnackBarStore.getState().alerts;
  return alerts.length ? alerts[alerts.length - 1].message : '';
};

function Harness({ opts }: { opts: MountOpts }) {
  const [got, setGot] = useState<common_MediaFull[][]>([]);
  const [clicks, setClicks] = useState(0);
  const [hostOpen, setHostOpen] = useState(true);
  probe.hostOpen = () => hostOpen;

  const intake = useMediaIntake({
    enabled: true,
    accept: opts.accept ?? 'image',
    limit: opts.limit,
    aspect: opts.aspect,
    lockAspect: opts.lockAspect,
    purpose: opts.purpose,
    onMedia: (media) => setGot((prev) => [...prev, media]),
  });

  probe.calls = () => got.length;
  probe.delivered = () => got.flat().map((m) => Number(m.id));
  probe.clicks = () => clicks;
  probe.busy = () => intake.busy;

  const body = (
    <>
      <div
        data-slot
        {...intake.regionHandlers}
        style={{ width: 240, height: 160, border: '1px solid' }}
      >
        slot
      </div>
      <button type='button' data-neighbour onClick={() => setClicks((c) => c + 1)}>
        neighbour field
      </button>
      <input data-text-field defaultValue='' />
      {intake.dialog}
    </>
  );

  if (!opts.insideModal) return <div>{body}</div>;

  // Тот же каркас, что у диалога выбора медиа: модальный Radix-диалог, а приёмка смонтирована
  // ВНУТРИ его содержимого.
  return (
    <DialogPrimitive.Root open={hostOpen} onOpenChange={setHostOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-host-overlay style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.4)' }} />
        <DialogPrimitive.Content
          data-host-content
          style={{ position: 'fixed', left: 40, top: 40, zIndex: 50, width: 700, height: 500, background: '#fff' }}
        >
          <DialogPrimitive.Title>host picker</DialogPrimitive.Title>
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

probe.mount = (opts) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <Harness opts={opts} />
    </QueryClientProvider>,
  );
};
