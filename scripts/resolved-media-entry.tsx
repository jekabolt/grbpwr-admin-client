// Entry of the resolved-media probe (live bug 06.10, card 38): the REAL `useResolvedMediaQuery`
// over the REAL adminService, the library served by the probe's route stub.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_MediaFull } from 'api/proto-http/admin';
import { useResolvedMediaQuery } from 'components/managers/media/utils/useMediaQuery';
import { createRoot } from 'react-dom/client';

type Out = { resolved: number[]; pending: boolean; error: boolean };
type Probe = { mount: (ids: number[], knownIds: number[]) => void; out: Out | null };
declare global {
  interface Window {
    __resolved: Probe;
  }
}

const probe: Probe = { mount: () => undefined, out: null };
window.__resolved = probe;

function Harness({ ids, knownIds }: { ids: number[]; knownIds: number[] }) {
  const known = new Map<number, common_MediaFull>(
    knownIds.map((id) => [id, { id } as common_MediaFull]),
  );
  const { byId, isPending, isError } = useResolvedMediaQuery(ids, known);
  probe.out = {
    resolved: ids.filter((id) => byId.has(id)),
    pending: isPending,
    error: isError,
  };
  return null;
}

probe.mount = (ids, knownIds) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={qc}>
      <Harness ids={ids} knownIds={knownIds} />
    </QueryClientProvider>,
  );
};
