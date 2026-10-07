// DOM-стенд `render-start-retry-probe.mjs` (M7b, 07.10): НАСТОЯЩИЙ `useStartDesignRun` (FABRIC
// RENDER, 3D, ON MODEL, PATTERN, PLAYGROUND) под react-query с умолчаниями приложения — мутации
// повторяются ОДИН раз, как в `src/index.tsx`. Сеть подменена одним слоем (`api/api` →
// `window.__api[метод]`, вызовы пишутся в `window.__calls`); проба сама решает, чем ответит
// `StartDesignRun`: успехом, отказом с кодом или обрывом без кода. `window.__rs.focus(false)` —
// вкладка «спрятана» (react-query держит повтор, пока она не покажется снова).
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import {
  useStartDesignRun,
  type StartRunInput,
} from 'components/managers/tech-card/components/design/render/use-design-run';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    __api: Record<string, (body: unknown) => unknown>;
    __calls: { name: string; body: unknown }[];
    __rs: {
      start: (input: StartRunInput) => void;
      focus: (on: boolean) => void;
    };
  }
}

const CARD = 7;
let start: ((input: StartRunInput) => void) | null = null;

function Stand() {
  const run = useStartDesignRun(CARD);
  start = run.start;
  return (
    <div data-probe-state='ready'>
      <output id='pending'>{run.isPending ? 'pending' : 'idle'}</output>
      <output id='refusal'>{run.refusal ? run.refusal.words : ''}</output>
    </div>
  );
}

const qc = new QueryClient({
  // The app's own mutation default (src/index.tsx): every mutation is retried once.
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: 1 } },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <Stand />
  </QueryClientProvider>,
);

window.__rs = {
  start: (input) => start?.(input),
  focus: (on) => focusManager.setFocused(on),
};
