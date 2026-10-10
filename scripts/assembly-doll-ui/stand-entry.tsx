// UI stand of the 3D paper doll (01-DESIGN-L0 §6, P3): the CONSTRUCTION column in miniature — the
// REAL AssemblyMap (with its 3D chip) + the REAL SeamsDoor under the REAL providers, with the REAL
// piece-shape chain (usePieceShapes over the card's DXF parse) and the REAL DictionaryProvider.
//
// NOTHING LEAVES THE PAGE: `fetch` is replaced before anything runs. The dictionary, the size chart
// and the seams RPCs answer from memory (stand data, not prod); every other request answers `{}`.
// The DXF parse is seeded into the query cache under the very key useDxfGeometry reads (the bytes
// come from the probe, parsed here with the nesting worker's own parseSheets). The doll worker is a
// separate bundle the probe serves at the URL the client asks for. The probe also routes every
// non-stand URL to a stub, so a request that slipped past this fetch would still go nowhere.
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { common_TechCard } from 'api/proto-http/admin';
import { ActiveStepProvider } from 'components/managers/tech-card/components/assembly-map/active-step';
import { AssemblyMap } from 'components/managers/tech-card/components/assembly-map/assembly-map';
import { SeamsDoor } from 'components/managers/tech-card/components/assembly-seams/seams-door';
import {
  CardUnitPicturesProvider,
  useCardSeamGraph,
} from 'components/managers/tech-card/components/card-unit-pictures';
import {
  AutosaveContext,
  AUTOSAVE_OFF,
} from 'components/managers/tech-card/components/design/autosave-contract';
import { useCardDxfPack } from 'components/managers/tech-card/components/nesting/card-dxf-pack';
import {
  dxfGeometryQuery,
  type DxfBundle,
} from 'components/managers/tech-card/components/nesting/dxf-geometry';
import type { PieceCloth } from 'components/managers/tech-card/components/piece-cloth';
import {
  mapTechCardToForm,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { usePieceShapes } from 'components/managers/tech-card/components/use-piece-shapes';
import { useDollStore } from 'components/managers/tech-card/components/assembly-doll/doll-store';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { seamFromCandidate, toWire, type StoredSeam, type TechCardSeamWire } from 'lib/seams';
import { useSeamsStore } from 'components/managers/tech-card/components/assembly-seams/seams-store';
import { useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

type StandCard = {
  code: string;
  /** A form (prod-run stand) or a card read (built from prod-data/cards.json). */
  form?: TechCardFormData;
  card?: common_TechCard;
  categoryNames: string[];
  cloth: [string, PieceCloth][] | null;
  /** pattern url → DXF bytes, base64. */
  files: Record<string, string>;
  /** STAND DATA: size chart cells (size name, measurement name, value in the card's unit). */
  chart?: { size: string; name: string; value: number }[];
};

// ── the fake backend ────────────────────────────────────────────────────────────────────────────
const SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'os'].map((name, i) => ({
  id: i + 1,
  name,
  skuOrd: i + 1,
}));
const MEASURES = [
  'waist',
  'inseam',
  'length',
  'rise',
  'hips',
  'shoulders',
  'chest',
  'sleeve',
  'width',
  'leg-opening',
  'hip',
  'bottom-width',
].map((name, i) => ({ id: 100 + i, name }));

const table = new Map<string, TechCardSeamWire>();
const calls: { method: string; path: string }[] = [];
/** Bodies of every seam write the page sent (what the stand checks the keys of). */
const puts: { seamKey: string; status: string }[][] = [];
let chartCells: { sizeId: number; measurementNameId: number; value: { value: string } }[] = [];

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  const method = (init?.method ?? 'GET').toUpperCase();
  calls.push({ method, path: url.pathname });
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  if (/\/api\/admin\/dictionary$/.test(url.pathname))
    return json({ dictionary: { sizes: SIZES, measurements: MEASURES } });
  if (/\/size-chart$/.test(url.pathname)) return json({ chart: { cells: chartCells } });
  if (/\/tech-card\/\d+\/seams:delete$/.test(url.pathname)) {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    for (const k of body?.seamKeys ?? []) table.delete(k);
    return json({ seams: [...table.values()] });
  }
  // The card read (a write reads the card's rows again when its list is old): today's table.
  if (/\/tech-card\/\d+$/.test(url.pathname) && method === 'GET')
    return json({ techCard: { id: 6, seams: [...table.values()] } });
  if (/\/tech-card\/\d+\/seams$/.test(url.pathname) && method === 'PUT') {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    puts.push(
      (body?.seams ?? []).map((r: TechCardSeamWire) => ({
        seamKey: r.seamKey ?? '',
        status: r.status ?? '',
      })),
    );
    for (const r of body?.seams ?? []) table.set(r.seamKey, { ...r, stale: false });
    return json({ seams: [...table.values()] });
  }
  return json({});
};

// The dictionary loads only with a live token: a stand token that never expires (no signature is
// checked client-side; nothing is sent anywhere but the fake fetch above).
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
localStorage.setItem(
  'authToken',
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ exp: 4102444800, sub: 'stand' })}.stand`,
);

// ── the stand ───────────────────────────────────────────────────────────────────────────────────
let root: Root | null = null;
let graph: SeamGraph | null = null;
let lastForm: TechCardFormData | null = null;

function GraphTap() {
  graph = useCardSeamGraph().graph;
  return null;
}

/** The card's DXF parse, in the cache under the key every passive reader asks for. */
function SeedParse({ bundle, children }: { bundle: DxfBundle; children: ReactNode }) {
  const qc = useQueryClient();
  const pack = useCardDxfPack();
  const [seeded] = useState(() => {
    const scopeByFile = new Map<number, string>();
    pack.forEach((f, i) => scopeByFile.set(i, f.scopeKey));
    qc.setQueryData(dxfGeometryQuery(pack).queryKey, { ...bundle, scopeByFile });
    return true;
  });
  return seeded ? <>{children}</> : null;
}

function Column({ c, card, frozen }: { c: StandCard; card: common_TechCard; frozen: boolean }) {
  const { shapeByKey } = usePieceShapes(false);
  const [cloth] = useState(() => (c.cloth ? new Map(c.cloth) : null));
  return (
    <ActiveStepProvider>
      <CardUnitPicturesProvider shapes={shapeByKey} cloth={cloth} categoryNames={c.categoryNames}>
        <GraphTap />
        <div className='w-[320px] shrink-0 space-y-2.5' data-map-column>
          <AssemblyMap
            sketch={
              <div className='flex aspect-[3/4] items-center justify-center border border-borderColor bg-bgZebra text-micro text-labelColor uppercase'>
                technical sketch (stand stub)
              </div>
            }
          />
          <SeamsDoor techCard={card} frozen={frozen} shapes={shapeByKey} />
        </div>
      </CardUnitPicturesProvider>
    </ActiveStepProvider>
  );
}

function Harness({
  c,
  form,
  card,
  bundle,
  frozen,
}: {
  c: StandCard;
  form: TechCardFormData;
  card: common_TechCard;
  bundle: DxfBundle;
  frozen: boolean;
}) {
  const methods = useForm<TechCardFormData>({ mode: 'onChange', defaultValues: form });
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <DictionaryProvider>
        <MemoryRouter initialEntries={['/tech-cards/6']}>
          <AutosaveContext.Provider value={{ ...AUTOSAVE_OFF, status: 'idle', request: () => {} }}>
            <FormProvider {...methods}>
              <form className='min-h-screen bg-pageBg p-6'>
                <SeedParse bundle={bundle}>
                  <Column c={c} card={card} frozen={frozen} />
                </SeedParse>
              </form>
            </FormProvider>
          </AutosaveContext.Provider>
        </MemoryRouter>
      </DictionaryProvider>
    </QueryClientProvider>
  );
}

const bytesOf = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

/**
 * Gold rows (scripts/doll/gold — keyed by the DXF block) onto this card's piece line keys, through
 * the card's own block links: the same rows a technologist would have stored on this card.
 */
function goldWire(rows: StoredSeam[], form: TechCardFormData): TechCardSeamWire[] {
  const byBlock = new Map<string, string>();
  for (const a of form.pieceDxfAliases ?? [])
    if (a.blockName && a.pieceLineKey && !byBlock.has(a.blockName))
      byBlock.set(a.blockName, a.pieceLineKey);
  const remap = (side: StoredSeam['sideA']) =>
    side.map((x) => {
      const key = byBlock.get(x.piece) ?? x.piece;
      const hint = x.edgeHint ? x.edgeHint.replace(/^[^#]+/, key) : x.edgeHint;
      return { ...x, piece: key, edgeHint: hint };
    });
  return rows.map((r) => ({
    ...toWire({ ...r, sideA: remap(r.sideA), sideB: remap(r.sideB) }),
    stale: false,
    createdBy: 'gold fixture (stand)',
    createdAt: '2026-10-10T00:00:00Z',
    updatedBy: 'gold fixture (stand)',
    updatedAt: '2026-10-10T00:00:00Z',
  }));
}

declare global {
  interface Window {
    __doll: {
      mount: (
        c: StandCard,
        o?: { gold?: StoredSeam[]; frozen?: boolean; seams?: TechCardSeamWire[] },
      ) => Promise<number>;
      /** Rows the way the review writes them (seamFromCandidate on the live graph), by piece NAME
       *  pairs «BP_2#5» ↔ «BP#5». */
      rowsFor: (
        pairs: [string, string, 'graph' | 'manual'][],
        size: string,
        keys?: string[],
      ) => TechCardSeamWire[];
      /** Another client writes straight to the server (not into this page's card read). */
      serverWrite: (w: TechCardSeamWire[]) => void;
      table: () => TechCardSeamWire[];
      puts: () => typeof puts;
      hasGraph: () => boolean;
      calls: () => typeof calls;
      solves: () => Record<
        string,
        {
          status: string;
          firstFrameMs?: number;
          doneMs?: number;
          graphMs?: number;
          vertices?: number;
          size: string;
        }
      >;
      seamsSeen: () => number;
    };
    __dollFrames?: number;
  }
}

window.__doll = {
  mount: async (c, o = {}) => {
    root?.unmount();
    graph = null;
    table.clear();
    useDollStore.setState({ solves: {}, poms: {}, live: null, hoverPom: null, open: false });
    const form = c.form ?? mapTechCardToForm(c.card!);
    const t0 = performance.now();
    const files = (form.patterns ?? []).filter((p) => p.url && c.files[p.url]);
    const parsed = await parseSheets(
      files.map((p) => ({
        name: p.filename || 'pattern.dxf',
        open: async () => bytesOf(c.files[p.url!]),
      })),
      { unit: 'auto', tol: 0.05, tolChain: 0.05 },
    );
    const parseMs = performance.now() - t0;
    const bundle: DxfBundle = {
      pieces: parsed.pieces,
      scopeByFile: new Map(),
      warnings: parsed.warnings,
    };
    lastForm = form;
    const seams = o.seams ?? (o.gold ? goldWire(o.gold, form) : []);
    for (const w of seams) table.set(w.seamKey!, w);
    chartCells = (c.chart ?? []).flatMap((x) => {
      const s = SIZES.find((z) => z.name === x.size.toLowerCase());
      const m = MEASURES.find((z) => z.name === x.name);
      return s && m
        ? [{ sizeId: s.id, measurementNameId: m.id, value: { value: String(x.value) } }]
        : [];
    });
    const host = document.getElementById('root')!;
    host.innerHTML = '';
    root = createRoot(host);
    const card = {
      id: 6,
      seams,
      techCard: { styleNumber: form.styleNumber },
    } as unknown as common_TechCard;
    root.render(<Harness c={c} form={form} card={card} bundle={bundle} frozen={!!o.frozen} />);
    return parseMs;
  },
  hasGraph: () => !!graph,
  rowsFor: (pairs, size, keys) => {
    const byName = new Map((lastForm?.pieces ?? []).map((p) => [p.name ?? '', p.lineKey ?? '']));
    const id = (x: string) => {
      const at = x.lastIndexOf('#');
      return `${byName.get(x.slice(0, at)) ?? x.slice(0, at)}#${x.slice(at + 1)}`;
    };
    const grainDeg = useSeamsStore.getState().grainDeg ?? undefined;
    return pairs.flatMap(([a, b, source], i) => {
      const r = seamFromCandidate(
        { a: id(a), b: id(b), kind: 'edge', score: 1, evidence: {} as never },
        graph?.pieces ?? [],
        {
          seamKey: keys?.[i] ?? `01STAND${String(i).padStart(19, '0')}`,
          status: 'confirmed',
          source,
          anchoredSize: size,
          ...(grainDeg ? { grainDeg } : {}),
        },
      );
      return r
        ? [
            {
              ...toWire(r),
              stale: false,
              createdBy: 'other client (stand)',
              createdAt: '2026-10-10T18:00:00Z',
              updatedBy: 'other client (stand)',
              updatedAt: '2026-10-10T18:00:00Z',
            },
          ]
        : [];
    });
  },
  serverWrite: (ws) => {
    for (const w of ws) table.set(w.seamKey!, w);
  },
  table: () => [...table.values()],
  puts: () => puts,
  calls: () => calls,
  solves: () =>
    Object.fromEntries(
      Object.entries(useDollStore.getState().solves).map(([k, s]) => [
        k,
        {
          status: s.status,
          firstFrameMs: s.firstFrameMs,
          doneMs: s.doneMs,
          graphMs: s.graphMs,
          vertices: s.report?.stats.vertices,
          size: s.size,
        },
      ]),
    ),
  seamsSeen: () => table.size,
};
