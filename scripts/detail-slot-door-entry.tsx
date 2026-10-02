// Точка входа пробы двери слота детали (moodboard-flats-1003, T05 + T10).
// Компонент НАСТОЯЩИЙ, из репозитория; обработчики пишут в журнал окна, чтобы проба читала факты.
import { createRoot, type Root } from 'react-dom/client';

import { DetailSlotDoor } from 'components/managers/tech-card/components/design/bench-slot';

type Cfg = { proposed: boolean; filled: boolean; fail?: boolean };
type Probe = { mount: (cfg: Cfg) => void; log: string[] };

declare global {
  interface Window {
    __door: Probe;
  }
}
const probe: Probe = { mount: () => {}, log: [] };
window.__door = probe;
let root: Root | null = null;

probe.mount = (cfg) => {
  probe.log = [];
  const el = document.getElementById('root')!;
  root?.unmount();
  root = createRoot(el);
  root.render(
    <div style={{ width: 138 }}>
      <div data-outside='' style={{ height: 40 }}>
        outside
      </div>
      <DetailSlotDoor
        label='collar'
        proposed={cfg.proposed}
        filled={cfg.filled}
        onKeep={() => probe.log.push('keep')}
        onRemove={() => {
          probe.log.push('remove');
          return cfg.fail ? Promise.reject(new Error('refused')) : new Promise(() => {});
        }}
      />
    </div>,
  );
};
