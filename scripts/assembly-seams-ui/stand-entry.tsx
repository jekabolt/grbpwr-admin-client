// UI stand of the SEAMS review (03-SEAMS-DESIGN §6 L3): the CONSTRUCTION column in miniature — the
// REAL AssemblyMap + the REAL SeamsDoor under the REAL providers (ActiveStepProvider,
// CardUnitPicturesProvider with the Need A wiring) on a real card's form (prod-run stand JSON).
//
// NOTHING LEAVES THE PAGE: `fetch` is replaced before anything runs. The seams RPCs answer from an
// in-memory table (keyed upsert / delete, echo of the whole list, the server's who / when stamped);
// every other request answers `{}`. The probe also routes every non-stand URL to a stub, so a
// request that slipped past this fetch would still never reach a backend.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_TechCard } from 'api/proto-http/admin';
import { ActiveStepProvider } from 'components/managers/tech-card/components/assembly-map/active-step';
import { AssemblyMap } from 'components/managers/tech-card/components/assembly-map/assembly-map';
import { SeamsDoor } from 'components/managers/tech-card/components/assembly-seams/seams-door';
import { useSeamsStore } from 'components/managers/tech-card/components/assembly-seams/seams-store';
import {
  CardUnitPicturesProvider,
  useCardSeamGraph,
} from 'components/managers/tech-card/components/card-unit-pictures';
import {
  AutosaveContext,
  AUTOSAVE_OFF,
} from 'components/managers/tech-card/components/design/autosave-contract';
import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import type { PieceCloth } from 'components/managers/tech-card/components/piece-cloth';
import type { TechCardFormData } from 'components/managers/tech-card/components/schema';
import type { PieceShapeMap } from 'components/managers/tech-card/components/use-piece-shapes';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import {
  newSeamKey,
  seamFromCandidate,
  toWire,
  type StoredSeam,
  type TechCardSeamWire,
} from 'lib/seams';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

type StandCard = {
  code: string;
  form: TechCardFormData;
  categoryNames: string[];
  shapes: [string, FoundPiece | null][] | null;
  cloth: [string, PieceCloth][] | null;
};

// ── the fake backend ────────────────────────────────────────────────────────────────────────────
const table = new Map<string, TechCardSeamWire>();
const calls: { method: string; path: string; body: unknown }[] = [];
let refuseNext: string | null = null;
const nowIso = () => new Date('2026-10-10T12:00:00Z').toISOString();

const realFetch = window.fetch.bind(window);
void realFetch; // kept only so nobody «restores» it by accident: it is never called
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: unknown = null;
  try {
    body = init?.body ? JSON.parse(String(init.body)) : null;
  } catch {
    body = init?.body ?? null;
  }
  calls.push({ method, path: url.pathname, body });
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  if (/\/tech-card\/\d+\/seams:delete$/.test(url.pathname)) {
    for (const k of (body as { seamKeys?: string[] })?.seamKeys ?? []) table.delete(k);
    return json({ seams: [...table.values()], deleted: 1 });
  }
  if (/\/tech-card\/\d+\/seams$/.test(url.pathname) && method === 'PUT') {
    if (refuseNext) {
      const m = refuseNext;
      refuseNext = null;
      return json({ code: 3, message: m }, 400);
    }
    const rows = (body as { seams?: TechCardSeamWire[] })?.seams ?? [];
    for (const r of rows) {
      const was = table.get(r.seamKey!);
      table.set(r.seamKey!, {
        ...r,
        stale: false,
        createdBy: was?.createdBy ?? 'anna@grbpwr.com',
        createdAt: was?.createdAt ?? nowIso(),
        updatedBy: 'anna@grbpwr.com',
        updatedAt: new Date(Date.now()).toISOString(),
      });
    }
    return json({ seams: [...table.values()], written: rows.length });
  }
  return json({});
};

// ── the stand ───────────────────────────────────────────────────────────────────────────────────
let root: Root | null = null;
let graph: SeamGraph | null = null;

function GraphTap() {
  graph = useCardSeamGraph().graph;
  return null;
}

function Stand({ c, card, frozen }: { c: StandCard; card: common_TechCard; frozen: boolean }) {
  const [shapes] = useState<PieceShapeMap>(() => (c.shapes ? new Map(c.shapes) : null));
  const [cloth] = useState(() => (c.cloth ? new Map(c.cloth) : null));
  return (
    <ActiveStepProvider>
      <CardUnitPicturesProvider shapes={shapes} cloth={cloth} categoryNames={c.categoryNames}>
        <GraphTap />
        <div className='w-[320px] shrink-0 space-y-2.5' data-map-column>
          <AssemblyMap
            sketch={
              <div className='flex aspect-[3/4] items-center justify-center border border-borderColor bg-bgZebra text-micro text-labelColor uppercase'>
                technical sketch (stand stub)
              </div>
            }
          />
          <SeamsDoor techCard={card} frozen={frozen} shapes={shapes} />
        </div>
      </CardUnitPicturesProvider>
    </ActiveStepProvider>
  );
}

function Harness({ c, card, frozen }: { c: StandCard; card: common_TechCard; frozen: boolean }) {
  const methods = useForm<TechCardFormData>({ mode: 'onChange', defaultValues: c.form });
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/6']}>
        <AutosaveContext.Provider value={{ ...AUTOSAVE_OFF, status: 'idle', request: () => {} }}>
          <FormProvider {...methods}>
            <form className='min-h-screen bg-pageBg p-6'>
              <Stand c={c} card={card} frozen={frozen} />
            </form>
          </FormProvider>
        </AutosaveContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Stored rows for a fixture, written by the product's own anchor code on the graph as read: the
 * first `confirm` chosen seams confirmed, the next one rejected, then one the server reports stale
 * (it still fits), and one whose anchors were moved off the piece (the edge is not found).
 */
function fixtureRows(o: { confirm: number; reject: number; stale: number; lost: number }) {
  if (!graph) return [];
  const grainDeg = useSeamsStore.getState().grainDeg ?? undefined;
  // The weakest first: the sure ones stay proposals, so «accept all sure» has work to do.
  const chosen = graph.chosen
    .filter((x) => x.kind === 'edge' && !x.provenance)
    .sort((x, y) => x.score - y.score);
  const out: TechCardSeamWire[] = [];
  let i = 0;
  const take = (status: 'confirmed' | 'rejected', patch: Partial<StoredSeam> = {}) => {
    const c = chosen[i++];
    if (!c) return;
    const row = seamFromCandidate(c, graph!.pieces, {
      seamKey: newSeamKey(Date.UTC(2026, 9, 9, 10, i)),
      status,
      source: 'graph',
      ...(grainDeg ? { grainDeg } : {}),
      note: status === 'rejected' ? 'wrong shoulder' : '',
    });
    if (!row) return;
    const r = { ...row, ...patch };
    out.push({
      ...toWire(r),
      stale: !!patch.stale,
      createdBy: 'anna@grbpwr.com',
      createdAt: '2026-10-09T10:00:00Z',
      updatedBy: 'anna@grbpwr.com',
      updatedAt: '2026-10-09T10:00:00Z',
    });
  };
  for (let k = 0; k < o.confirm; k++) take('confirmed');
  for (let k = 0; k < o.reject; k++) take('rejected');
  for (let k = 0; k < o.stale; k++) take('confirmed', { stale: true });
  for (let k = 0; k < o.lost; k++) {
    const c = chosen[i];
    take('confirmed');
    const last = out[out.length - 1];
    if (c && last?.sideA?.parts?.[0]) {
      // The DXF was redrawn: the run's shape moved to the other side of the piece.
      last.sideA.parts[0] = {
        ...last.sideA.parts[0],
        edgeHint: '',
        contourSig: '0000000000000000',
        samples: (last.sideA.parts[0].samples ?? []).map((s) => ({
          u: 1 - (s.u ?? 0) * 0.5,
          v: (s.v ?? 0) * 0.3,
        })),
      };
    }
  }
  return out;
}

declare global {
  interface Window {
    __seams: {
      mount: (c: StandCard, o?: { seams?: TechCardSeamWire[]; frozen?: boolean }) => void;
      hasGraph: () => boolean;
      fixture: typeof fixtureRows;
      graphInfo: () => {
        sure: number;
        pieces: number;
        chosen: number;
        forced: number;
        rejectedByPerson: number;
      };
      calls: () => typeof calls;
      scores: () => string[];
      refuseNext: (m: string) => void;
    };
  }
}

window.__seams = {
  mount: (c, o = {}) => {
    root?.unmount();
    graph = null;
    table.clear();
    for (const w of o.seams ?? []) table.set(w.seamKey!, w);
    const host = document.getElementById('root')!;
    host.innerHTML = '';
    root = createRoot(host);
    const card = {
      id: 6,
      seams: o.seams ?? [],
      techCard: { styleNumber: c.form.styleNumber },
    } as unknown as common_TechCard;
    root.render(<Harness c={c} card={card} frozen={!!o.frozen} />);
  },
  hasGraph: () => !!graph,
  fixture: fixtureRows,
  graphInfo: () => ({
    sure:
      graph?.chosen.filter(
        (x) => !x.provenance && x.score >= 0.9 && !(x.ambiguousWith?.length ?? 0),
      ).length ?? 0,
    pieces: graph?.pieces.length ?? 0,
    chosen: graph?.chosen.length ?? 0,
    forced: graph?.chosen.filter((x) => x.provenance?.status === 'confirmed').length ?? 0,
    rejectedByPerson:
      graph?.rejected.filter((x) => JSON.stringify(x).includes('rejected by')).length ?? 0,
  }),
  calls: () => calls,
  scores: () =>
    (graph?.chosen ?? []).map(
      (x) =>
        `${x.provenance ? 'F' : ''}${x.score.toFixed(2)}${x.ambiguousWith?.length ? `~${x.ambiguousWith.length}` : ''}`,
    ),
  refuseNext: (m) => {
    refuseNext = m;
  },
};
