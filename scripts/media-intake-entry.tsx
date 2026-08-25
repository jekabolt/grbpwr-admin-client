// Стенд приёмки ⌘V: НАСТОЯЩИЙ хук слота, настоящая приёмная модалка, настоящий движок очереди.
//
// Здесь не переписано ничего из проверяемого. Стенд даёт только то, без чего компоненты не живут
// (клиент запросов), и рукоятки, которыми проба ЧИТАЕТ результат: сколько раз позвали владельца
// слота, с какими id и жива ли страница под свёрнутой отправкой. Вставка имитируется настоящим
// событием `paste` с настоящим `DataTransfer` — тем же путём, которым её ловит `usePasteFiles`.
//
// «Соседнее поле» рядом со слотом — не украшение: «форма кликабельна во время отправки» иначе
// доказывать нечем, а именно это владелец и просил («не убираемая модалка… так быть не должно»).
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
};

type IntakeProbe = {
  mount: (opts: MountOpts) => void;
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

  return (
    <div>
      <div data-slot {...intake.regionHandlers} style={{ width: 240, height: 160, border: '1px solid' }}>
        slot
      </div>
      <button type='button' data-neighbour onClick={() => setClicks((c) => c + 1)}>
        neighbour field
      </button>
      <input data-text-field defaultValue='' />
      {intake.dialog}
    </div>
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
