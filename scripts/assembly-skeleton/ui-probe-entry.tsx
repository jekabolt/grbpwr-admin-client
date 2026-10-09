// UI probe stand for the assembly skeleton (lane D, D4): the REAL door, the REAL panel and the REAL
// OperationsField, on a real RHF form — only the proposal source is a mock.
//
// THE MOCK PROVIDER LIVES HERE AND NOWHERE ELSE. It is injected through `SkeletonProviderContext`,
// the same seam the production provider plugs into; no file under src/ imports it.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SkeletonFacts, SkeletonProposal, SkeletonStep } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';
import { SectionHeader } from 'ui/components/section-header';

import {
  assemblySweep,
  classifyAssemblyInputs,
} from 'components/managers/tech-card/components/assembly-frontier';
import { useSkeletonDoor } from 'components/managers/tech-card/components/assembly-skeleton-panel';
import {
  SkeletonProviderContext,
  type SkeletonProvider,
} from 'components/managers/tech-card/components/assembly-skeleton-source';
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
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
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

/** What a rules engine would plausibly return for the tee — shape, not truth. */
export function mockProposal(facts: SkeletonFacts): SkeletonProposal {
  const has = (k: string) => facts.pieces.some((p) => p.pieceKey === k);
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
        confidence: 0.9,
        reason: 'press the shoulder seams before the neckband crosses them',
        source: 'template',
      },
      MACHINE({
        inputs: ['SHOULDERS', 'NB'],
        outputUnitKey: 'NECK',
        outputUnitName: 'Body with neckband',
        zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE',
        seams: [
          seam('NB', 'FP', 460, 518, 2, {
            curvature: 'complementary',
            rule: 'band eased 11 % into the neckline',
          }),
        ],
        confidence: 0.66,
        reason: '',
        alternatives: [
          {
            inputs: ['SHOULDERS', 'PKT'],
            seams: [seam('PKT', 'FP', 140, 142, 0)],
            reason: 'the pocket top is as long as the band end — weaker, no notches',
          },
        ],
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

// ── the stand ───────────────────────────────────────────────────────────────────────────────────

type Mount = {
  frozen?: boolean;
  noDxf?: boolean;
  noProvider?: boolean;
  ops?: Record<string, unknown>[];
  machines?: { machineType: string }[];
  failProvider?: boolean;
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
const CLOTH = new Map<string, PieceCloth>([
  ['FP', { state: 'main' }],
  ['BP', { state: 'main' }],
  ['SL_L', { state: 'main' }],
  ['SL_R', { state: 'main' }],
  ['NB', { state: 'contrast' }],
  ['PKT', { state: 'main' }],
]);

function Stand({ m }: { m: Mount }) {
  const skeleton = useSkeletonDoor({
    frozen: !!m.frozen,
    shapes: shapesFor(!!m.noDxf),
    cloth: CLOTH,
    categoryNames: [],
  });
  return (
    <section className='border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title='operations — assembly order'
        question='— what each step does, where, on which pieces, and how long it takes'
        action={skeleton.headerAction}
      />
      <OperationsField
        frozen={!!m.frozen}
        pieceShapes={shapesFor(!!m.noDxf).shapeByKey}
        applyRequest={skeleton.applyRequest}
        onSkeletonApplied={skeleton.onSkeletonApplied}
        emptyAction={skeleton.emptyAction}
      />
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
      pieces: PIECES.map((p) => ({
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
  const provider: SkeletonProvider = (facts) => {
    calls += 1;
    if (m.failProvider) throw new Error('mock engine failed');
    return mockProposal(facts);
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
            <FormProvider {...methods}>
              <form className='bg-pageBg p-6'>
                <Stand m={m} />
              </form>
            </FormProvider>
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
    const pieces = PIECES.map((p) => ({ lineKey: p.lineKey as string, name: p.name as string }));
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
};
