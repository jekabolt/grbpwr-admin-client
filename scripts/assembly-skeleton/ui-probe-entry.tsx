// UI probe stand for the assembly skeleton (lane D, D4): the REAL door, the REAL panel and the REAL
// OperationsField, on a real RHF form — only the proposal source is a mock.
//
// THE MOCK PROVIDER LIVES HERE AND NOWHERE ELSE. It is injected through `SkeletonProviderContext`,
// the same seam the production provider plugs into; no file under src/ imports it.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  SkeletonFacts,
  SkeletonOptions,
  SkeletonProposal,
  SkeletonStep,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';
import { SectionHeader } from 'ui/components/section-header';

import {
  assemblySweep,
  classifyAssemblyInputs,
} from 'components/managers/tech-card/components/assembly-frontier';
import {
  SkeletonAIAskContext,
  type SkeletonAIAsk,
} from 'components/managers/tech-card/components/assembly-skeleton-ai';
import { useSkeletonDoor } from 'components/managers/tech-card/components/assembly-skeleton-panel';
import {
  DEFAULT_SKELETON_PROVIDER,
  SkeletonProviderContext,
  type SkeletonProvider,
} from 'components/managers/tech-card/components/assembly-skeleton-source';
import {
  CardUnitPicturesProvider,
  renderProposalUnit,
} from 'components/managers/tech-card/components/card-unit-pictures';
import {
  AutosaveContext,
  AUTOSAVE_OFF,
} from 'components/managers/tech-card/components/design/autosave-contract';
import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import {
  emptyOperation,
  OperationsField,
} from 'components/managers/tech-card/components/operations-field';
import { pieceRefKey } from 'components/managers/tech-card/components/piece-block-refs';
import type { PieceCloth } from 'components/managers/tech-card/components/piece-cloth';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { settleFormAfterSave } from 'components/managers/tech-card/components/useTechCardAutosave';
import type { PieceShapes } from 'components/managers/tech-card/components/use-piece-shapes';

// ── fixtures: a tee ─────────────────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const dto = (id: number, name: string, poly: Pt[]): PieceDTO => {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return {
    id,
    name,
    blockName: name,
    layer: '1',
    source: 'tee.dxf',
    poly,
    bboxW: w,
    bboxH: h,
    areaCm2: w * h * 0.8,
  } as PieceDTO;
};
const found = (piece: PieceDTO): FoundPiece => ({
  piece,
  block: piece.name,
  size: 'M',
  instances: 1,
  layer: '1',
  sizes: ['S', 'M', 'L'],
});

const BODY = [
  P(0, 0),
  P(50, 0),
  P(50, 52),
  P(44, 62),
  P(34, 70),
  P(25, 66),
  P(16, 70),
  P(6, 62),
  P(0, 52),
];
const BACK = [
  P(0, 0),
  P(50, 0),
  P(50, 52),
  P(44, 62),
  P(34, 70),
  P(25, 69),
  P(16, 70),
  P(6, 62),
  P(0, 52),
];
const SLEEVE = [P(0, 0), P(34, 0), P(40, 18), P(30, 26), P(17, 29), P(4, 26), P(-6, 18)].map((p) =>
  P(p.x + 6, p.y),
);
const BAND = [P(0, 0), P(46, 0), P(46, 3), P(0, 3)];
const POCKET = [P(0, 0), P(14, 0), P(14, 13), P(7, 15), P(0, 13)];

export const PIECES = [
  { lineKey: 'FP', name: 'front', shape: BODY },
  { lineKey: 'BP', name: 'back', shape: BACK },
  { lineKey: 'SL_L', name: 'sleeve left', shape: SLEEVE },
  { lineKey: 'SL_R', name: 'sleeve right', shape: SLEEVE },
  { lineKey: 'NB', name: 'neckband', shape: BAND },
  { lineKey: 'PKT', name: 'chest pocket', shape: POCKET },
  { lineKey: 'LBL', name: 'care label', shape: null },
] as const;

const seam = (
  a: string,
  b: string,
  lenA: number,
  lenB: number,
  notches: number,
  extra: Partial<SkeletonStep['seams'][number]['evidence']> = {},
) => ({
  a: `${a}#0`,
  b: `${b}#0`,
  score: 0.9,
  kind: 'edge' as const,
  evidence: {
    dLenMm: Math.abs(lenA - lenB),
    relLen: Math.abs(lenA - lenB) / lenA,
    notchScore: (notches > 0 ? 1 : null) as 1 | null,
    curvature: 'flat' as const,
    hand: 'neutral' as const,
    twin: 'none' as const,
    self: false,
    aLenMm: lenA,
    bLenMm: lenB,
    notchesMatched: notches,
    ...extra,
  },
});

const MACHINE = (
  s: Omit<SkeletonStep, 'operationType' | 'source'> & Partial<SkeletonStep>,
): SkeletonStep => ({
  operationType: 'MACHINE',
  source: 'geometry',
  ...s,
});

/**
 * What a rules engine would plausibly return for the tee — shape, not truth. It honours a chosen
 * reading the way the engine does: the neck join is REBUILT on the pocket (and the neckband left
 * out), not patched — the steps after it take the unit it now makes.
 */
export function mockProposal(
  facts: SkeletonFacts,
  options: SkeletonOptions = {},
): SkeletonProposal {
  const has = (k: string) => facts.pieces.some((p) => p.pieceKey === k);
  const neck = options.pins?.neck === 1 ? 1 : 0;
  const band = {
    inputs: ['SHOULDERS', 'NB'],
    seams: [
      seam('NB', 'FP', 460, 518, 2, {
        curvature: 'complementary',
        rule: 'band eased 11 % into the neckline',
      }),
    ],
    reason: '',
  };
  const pocket = {
    inputs: ['SHOULDERS', 'PKT'],
    seams: [seam('PKT', 'FP', 140, 142, 0)],
    reason: 'the pocket top is as long as the band end — weaker, no notches',
  };
  const readings = [band, pocket];
  if (!has('FP') || !has('BP'))
    return {
      steps: [],
      unresolved: [],
      template: facts.category,
      warnings: ['the front and the back were not found'],
    };
  return {
    template: facts.category === 'generic' ? 'tee' : facts.category,
    warnings: ['category not set on the card — the tee order is used'],
    unresolved: [seam('PKT', 'FP', 140, 520, 0)],
    steps: [
      MACHINE({
        inputs: ['FP', 'BP'],
        outputUnitKey: 'SHOULDERS',
        outputUnitName: 'Body (shoulders)',
        zone: 'TECH_CARD_GARMENT_ZONE_SHOULDER',
        seams: [seam('FP', 'BP', 128, 128, 1, { hand: 'cross' })],
        confidence: 0.92,
        reason: '',
      }),
      {
        inputs: ['SHOULDERS'],
        outputUnitKey: '',
        outputUnitName: '',
        operationType: 'PRESS_OPEN',
        zone: 'TECH_CARD_GARMENT_ZONE_SHOULDER',
        seams: [],
        confidence: 0.92,
        reason: 'press the shoulder seams before the neckband crosses them',
        source: 'template',
        derivedFrom: 0,
      },
      MACHINE({
        ...readings[neck],
        outputUnitKey: 'NECK',
        outputUnitName: neck ? 'Body with pocket' : 'Body with neckband',
        zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE',
        confidence: 0.66,
        alternatives: [readings[1 - neck]],
        decision: { id: 'neck', chosen: neck },
      }),
      MACHINE({
        inputs: ['NECK', 'SL_L'],
        outputUnitKey: 'BODY-L',
        outputUnitName: 'Body + left sleeve',
        zone: 'TECH_CARD_GARMENT_ZONE_SLEEVE',
        seams: [
          {
            ...seam('SL_L', 'FP', 470, 482, 3, { curvature: 'complementary' }),
            kind: 'composite' as const,
          },
        ],
        confidence: 0.78,
        reason: '',
      }),
      MACHINE({
        inputs: ['BODY-L', 'SL_R'],
        outputUnitKey: 'GARMENT',
        outputUnitName: 'Tee',
        zone: 'TECH_CARD_GARMENT_ZONE_SLEEVE',
        seams: [
          {
            ...seam('SL_R', 'BP', 470, 482, 3, { curvature: 'complementary', twin: 'mirror' }),
            kind: 'composite' as const,
          },
        ],
        confidence: 0.78,
        reason: '',
      }),
      MACHINE({
        inputs: ['GARMENT'],
        outputUnitKey: '',
        outputUnitName: '',
        zone: 'TECH_CARD_GARMENT_ZONE_HEM',
        seams: [],
        confidence: 0.4,
        reason: 'hem — every tee has one; the pattern shows no hem allowance to confirm it',
        source: 'template',
      }),
    ],
  };
}

/** A card whose skeleton has no units at all: two processing steps on loose pieces. */
export function unitlessProposal(): SkeletonProposal {
  return {
    template: 'generic',
    warnings: [],
    unresolved: [],
    steps: [
      MACHINE({
        inputs: ['NB'],
        outputUnitKey: '',
        outputUnitName: '',
        zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE',
        seams: [],
        confidence: 0.9,
        reason: 'close the band into a ring',
        source: 'template',
      }),
    ],
  };
}

// ── the stand ───────────────────────────────────────────────────────────────────────────────────

/** A real card: pieces with their sewing-line contours, read by the REAL engine (scenario G). */
type RealCard = {
  category: string;
  pieces: { lineKey: string; name: string; piece: PieceDTO; cloth?: PieceCloth['state'] }[];
};

type Mount = {
  real?: RealCard;
  frozen?: boolean;
  noDxf?: boolean;
  noProvider?: boolean;
  ops?: Record<string, unknown>[];
  machines?: { machineType: string }[];
  failProvider?: boolean;
  /** The proposal has no unit at all (replace over a card with units → markup cleared). */
  unitless?: boolean;
  /** Clone the contour Map on every BOM change, as `usePieceShapes` does on the card. */
  churnShapes?: boolean;
  /** Mount the STUB AI asker (scenario L; 'fail' = it refuses after being charged); without it the
   *  AI bar is not there at all. */
  ai?: boolean | 'fail';
};

type Probe = {
  mount: (m: Mount) => void;
  form: () => UseFormReturn<TechCardFormData>;
  autosaveRequests: () => string[];
  providerCalls: () => number;
  ops: () => Record<string, unknown>[];
  sweep: () => { rule: number; detail: string; message: string }[];
  opErrors: () => Promise<number>;
  touch: (index: number) => void;
  /** Unmount and mount OperationsField again, with the same door state above it. */
  remountField: () => void;
  /** How many times the stub AI was asked, and the requests it got. */
  aiCalls: () => number;
  /**
   * ONE AUTOSAVE, AS THE PAGE SETTLES IT: the form goes to the wire (the real mapper), comes back as
   * a server that echoes the payload would return it (the real reverse mapper), and the REAL
   * `settleFormAfterSave` writes it into the form — the path index.tsx runs after every body save.
   */
  settleLikeAutosave: () => void;
  /** `draft` of every operation as the WRITE would send it (the real mapper to the wire). */
  wireDrafts: () => (boolean | undefined)[];
  /** The operations as a reload would put them into the form: wire → DTO → the real read mapper. */
  reloadedOps: () => Record<string, unknown>[];
};
declare global {
  interface Window {
    __sk: Probe;
  }
}

let form: UseFormReturn<TechCardFormData> | null = null;
let requests: string[] = [];
let calls = 0;
let root: Root | null = null;
let remount: (() => void) | null = null;
let aiCalls = 0;

/**
 * THE STUB AI (scenario L): answers like the server would after validation — the other reading of
 * every decision, and a DIFFERENT valid order (the latest ready step first), a reason each, plus one
 * doubt on the first ordered step. Pure function of the request: the same skeleton, the same answer.
 */
const stubAI: SkeletonAIAsk = async (req) => {
  aiCalls += 1;
  const steps = req.steps ?? [];
  const byId = new Map(steps.map((st) => [st.id ?? '', st]));
  const rootOf = (id: string): string => {
    const f = byId.get(id)?.follows;
    return f ? rootOf(f) : id;
  };
  const riders = new Map<string, string[]>();
  for (const st of steps)
    if (st.follows) riders.set(st.follows, [...(riders.get(st.follows) ?? []), st.id ?? '']);
  const group = (id: string): string[] => [id, ...(riders.get(id) ?? []).flatMap(group)];
  const maker = new Map(steps.filter((st) => st.outputUnit).map((st) => [st.outputUnit!, st.id!]));
  const ordered = steps.filter((st) => !st.follows).map((st) => st.id ?? '');
  const needs = new Map(
    ordered.map((id) => [
      id,
      new Set(
        group(id)
          .flatMap((g) => byId.get(g)?.inputs ?? [])
          .map((k) => maker.get(k))
          .filter((m): m is string => !!m && rootOf(m) !== id)
          .map(rootOf),
      ),
    ]),
  );
  // Work on a piece / unit (no output unit) comes before the join that sews it on.
  for (const id of ordered) {
    const st = byId.get(id);
    if (!st || st.outputUnit) continue;
    for (const k of st.inputs ?? []) {
      const consumer = ordered.find(
        (c) => c !== id && !!byId.get(c)?.outputUnit && (byId.get(c)?.inputs ?? []).includes(k),
      );
      if (consumer) needs.get(consumer)!.add(id);
    }
  }
  const done = new Set<string>();
  const order: { stepId: string; reason: string }[] = [];
  while (order.length < ordered.length) {
    const ready = ordered.filter(
      (id) => !done.has(id) && [...needs.get(id)!].every((n) => done.has(n)),
    );
    if (!ready.length) break;
    const pick = ready[ready.length - 1];
    done.add(pick);
    order.push({ stepId: pick, reason: 'stub: the latest ready step first' });
  }
  return {
    order,
    picks: (req.decisions ?? []).map((d) => ({
      decisionId: d.id,
      reading: ((d.chosen ?? 0) + 1) % (d.readings?.length ?? 1),
      reason: 'stub: the other reading',
    })),
    warnings: [
      {
        kind: 'order',
        message: 'stub doubt about the first step',
        stepIds: ordered.slice(0, 1),
        pieceKeys: [],
      },
    ],
    model: 'stub/model',
    promptTokens: 1200,
    completionTokens: 300,
    costUsd: '0.0123',
    notes: [],
    cached: false,
    // A fallback after a hung first provider: two calls, one of them with no known charge.
    calls: 2,
    unknownCalls: 1,
  };
};

/** The stub AI refusing after it was charged: the server's AI_SPEND detail on the error. */
const stubAIRefusing: SkeletonAIAsk = async () => {
  aiCalls += 1;
  const err = new Error('the assistant answered nothing usable') as Error & {
    status?: number;
    details?: unknown[];
  };
  err.status = 500;
  err.details = [
    {
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      reason: 'AI_SPEND',
      domain: 'ai.grbpwr.com',
      metadata: { calls: '2', unknown_calls: '0', cost_usd: '0.02' },
    },
  ];
  throw err;
};

const SHAPES_NONE: PieceShapes = {
  shapeByKey: null,
  hasDxf: false,
  foundCount: 0,
  isLoading: false,
  error: null,
};
const SHAPES_DXF: PieceShapes = (() => {
  const m = new Map<string, FoundPiece | null>();
  PIECES.forEach((p, i) =>
    m.set(pieceRefKey(p.lineKey), p.shape ? found(dto(i + 1, p.name, [...p.shape])) : null),
  );
  return {
    shapeByKey: m,
    hasDxf: true,
    foundCount: PIECES.filter((p) => p.shape).length,
    isLoading: false,
    error: null,
  };
})();
const shapesFor = (noDxf: boolean): PieceShapes => (noDxf ? SHAPES_NONE : SHAPES_DXF);
const realShapes = (r: RealCard): PieceShapes => {
  const m = new Map<string, FoundPiece | null>();
  for (const p of r.pieces) m.set(pieceRefKey(p.lineKey), { ...found(p.piece), layers: [p.piece] });
  return { shapeByKey: m, hasDxf: true, foundCount: m.size, isLoading: false, error: null };
};
const realCloth = (r: RealCard) =>
  new Map<string, PieceCloth>(r.pieces.map((p) => [p.lineKey, { state: p.cloth ?? 'main' }]));
const CLOTH = new Map<string, PieceCloth>([
  ['FP', { state: 'main' }],
  ['BP', { state: 'main' }],
  ['SL_L', { state: 'main' }],
  ['SL_R', { state: 'main' }],
  ['NB', { state: 'contrast' }],
  ['PKT', { state: 'main' }],
]);

function Stand({ m }: { m: Mount }) {
  // Stable per mount: the door and the pictures memoise on these identities.
  const [shapes] = useState(() => (m.real ? realShapes(m.real) : shapesFor(!!m.noDxf)));
  const [cloth] = useState(() => (m.real ? realCloth(m.real) : CLOTH));
  const [categoryNames] = useState(() => (m.real ? [m.real.category] : []));
  const [fieldKey, setFieldKey] = useState(0);
  remount = () => setFieldKey((k) => k + 1);
  // The card's contour Map gets a new identity on every BOM keystroke (usePieceShapes rebuilds it
  // from the BOM's roll-goods scopes); the stand reproduces that churn on demand.
  const bom = useWatch<TechCardFormData>({ name: 'bomItems' });
  const shapeByKey = useMemo(
    () => (m.churnShapes && shapes.shapeByKey ? new Map(shapes.shapeByKey) : shapes.shapeByKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapes, bom],
  );
  const skeleton = useSkeletonDoor({
    frozen: !!m.frozen,
    shapes,
    cloth,
    categoryNames,
    renderUnit: m.real ? renderProposalUnit : undefined,
  });
  return (
    <section className='border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title='operations — assembly order'
        question='— what each step does, where, on which pieces, and how long it takes'
        action={skeleton.headerAction}
      />
      <CardUnitPicturesProvider shapes={shapeByKey} cloth={cloth} categoryNames={categoryNames}>
        <OperationsField
          key={fieldKey}
          storedHasMedia={(m.ops ?? []).some((o) => ((o.media as unknown[]) ?? []).length > 0)}
          storedHasUnits={(m.ops ?? []).some((o) => !!o.outputUnitKey)}
          frozen={!!m.frozen}
          pieceShapes={shapes.shapeByKey}
          applyRequest={skeleton.applyRequest}
          onSkeletonApplied={skeleton.onSkeletonApplied}
          skeletonUndoRequest={skeleton.skeletonUndoRequest}
          onSkeletonUndone={skeleton.onSkeletonUndone}
          onSkeletonUndoable={skeleton.onSkeletonUndoable}
          emptyAction={skeleton.emptyAction}
        />
      </CardUnitPicturesProvider>
      {skeleton.panel}
    </section>
  );
}

function Harness({ m }: { m: Mount }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      pieces: (m.real ? m.real.pieces : PIECES).map((p) => ({
        lineKey: p.lineKey,
        name: p.name,
        piecesPerGarment: 1,
      })) as unknown as TechCardFormData['pieces'],
      operations: (m.ops ?? []).map((o) => ({
        ...emptyOperation,
        ...o,
      })) as unknown as TechCardFormData['operations'],
      construction: {
        ...techCardDefaultData.construction,
        equipmentDefaults: { machines: (m.machines ?? []) as never, presses: [] },
      },
    },
  });
  form = methods;
  const provider: SkeletonProvider = (facts, deps, options) => {
    calls += 1;
    if (m.failProvider) throw new Error('mock engine failed');
    // Scenario G runs the PRODUCTION provider — the one the tech card's context defaults to.
    if (m.real && DEFAULT_SKELETON_PROVIDER) return DEFAULT_SKELETON_PROVIDER(facts, deps, options);
    if (m.unitless) return unitlessProposal();
    return mockProposal(facts, options);
  };
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <AutosaveContext.Provider
          value={{ ...AUTOSAVE_OFF, status: 'idle', request: (r) => void requests.push(r) }}
        >
          <SkeletonProviderContext.Provider value={m.noProvider ? null : provider}>
            <SkeletonAIAskContext.Provider
              value={m.ai === 'fail' ? stubAIRefusing : m.ai ? stubAI : null}
            >
              <FormProvider {...methods}>
                <form className='bg-pageBg p-6'>
                  <Stand m={m} />
                </form>
              </FormProvider>
            </SkeletonAIAskContext.Provider>
          </SkeletonProviderContext.Provider>
        </AutosaveContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

window.__sk = {
  mount: (m) => {
    requests = [];
    calls = 0;
    aiCalls = 0;
    root?.unmount();
    const host = document.getElementById('root')!;
    host.innerHTML = '';
    root = createRoot(host);
    root.render(<Harness m={m} />);
  },
  form: () => form!,
  autosaveRequests: () => [...requests],
  providerCalls: () => calls,
  ops: () => (form?.getValues('operations') ?? []) as unknown as Record<string, unknown>[],
  sweep: () => {
    const ops = form?.getValues('operations') ?? [];
    // The card's own pieces (the tee fixture or a real card), as the form holds them.
    const pieces = (form?.getValues('pieces') ?? []).map((p) => ({
      lineKey: (p.lineKey ?? '') as string,
      name: (p.name ?? '') as string,
    }));
    const keys = new Set(pieces.map((p) => p.lineKey));
    const res = assemblySweep(
      pieces,
      ops.map((o) => ({
        inputs: classifyAssemblyInputs(keys, (o.inputKeys ?? []).filter(Boolean)),
        outputUnitKey: (o.outputUnitKey ?? '').trim(),
        outputUnitName: (o.outputUnitName ?? '').trim(),
      })),
    );
    return res.violations.map((v) => ({ rule: v.rule, detail: v.detail, message: v.message }));
  },
  opErrors: async () => {
    await form!.trigger('operations');
    const e = form!.formState.errors.operations as unknown;
    if (!e) return 0;
    return Array.isArray(e) ? e.filter(Boolean).length : 1;
  },
  touch: (index) => {
    form!.setValue(`operations.${index}.smv`, '1.2', { shouldDirty: true });
  },
  remountField: () => remount?.(),
  aiCalls: () => aiCalls,
  wireDrafts: () =>
    (mapFormToTechCardInsert(form!.getValues(), undefined, true).operations ?? []).map(
      (o) => o.draft,
    ),
  reloadedOps: () =>
    mapTechCardToForm({
      id: 1,
      techCard: mapFormToTechCardInsert(form!.getValues(), undefined, true),
    } as never).operations as unknown as Record<string, unknown>[],
  settleLikeAutosave: () => {
    const f = form!;
    const before = structuredClone(f.getValues());
    const insert = mapFormToTechCardInsert(f.getValues(), undefined, true);
    const server = mapTechCardToForm({ id: 1, techCard: insert } as never);
    settleFormAfterSave(f, before, { values: server, server });
  },
};
