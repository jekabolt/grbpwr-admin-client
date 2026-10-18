// Точка входа пробы «ЛЕДЖЕР FLAT» (scripts/flat-run-ledger-probe.mjs): НАСТОЯЩИЙ `useStartRun` —
// та самая дверь, которую жмёт GENERATE флэта (`flat-run-row.tsx`), — под настоящим react-query,
// сеть заглушена (проба сама отвечает на `StartDesignRun`: когда захочет и как захочет).
//
// Ряда флэта здесь нет, и это нарочно: леджер и тело запроса живут в хуке, а ряд только собирает
// `params` и снимок. Проба подаёт их сама — так она может прислать ОДНО намерение, собранное
// по-разному (порядок ключей, пробелы по краям), и увидеть, какой ключ оно получило, не подделывая
// ни одной строки хука.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useStartRun,
  type StartRunInput,
} from 'components/managers/tech-card/components/design/generation/use-generation';
import type { RunRefusal } from 'components/managers/tech-card/components/design/generation/refusal';
import { settleRunLedger } from 'components/managers/tech-card/components/design/generation/run-ledger';
import { createRoot, type Root } from 'react-dom/client';

const CARD = 7;

let start: ((input: StartRunInput) => Promise<RunRefusal | null>) | null = null;
function Door() {
  start = useStartRun(CARD).start;
  return <output id='flat-door'>ready</output>;
}

type Probe = {
  mount: () => void;
  /** Press GENERATE; its final result (after beta's automatic retry, if any) lands in `settled`. */
  press: (input: StartRunInput) => void;
  /** Make an accepted run observable in the band, which releases beta's acceptance hold. */
  show: (runId: number) => void;
  settled: Array<RunRefusal | null>;
};

declare global {
  interface Window {
    __fl: Probe;
  }
}

let root: Root | null = null;
window.__fl = {
  mount: () => {
    root?.unmount();
    root = createRoot(document.getElementById('root')!);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    root.render(
      <QueryClientProvider client={qc}>
        <Door />
      </QueryClientProvider>,
    );
  },
  press: (input) => {
    void start?.(input).then((r) => window.__fl.settled.push(r));
  },
  show: (runId) => settleRunLedger(CARD, { runs: [{ id: runId }] }),
  settled: [],
};
