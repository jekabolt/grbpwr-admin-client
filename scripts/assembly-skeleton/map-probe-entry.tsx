// UI stand of the ASSEMBLY MAP probe (map-probe.mjs): the CONSTRUCTION workspace in miniature — the
// REAL AssemblyMap in a 320 px column beside the REAL OperationsField, under the REAL providers
// (ActiveStepProvider, CardUnitPicturesProvider), on a real card's form (prod-run stand JSON:
// mapTechCardToForm of the card read, its contour map as usePieceShapes built it). Only the sketch is a
// stub (ConstructionSketch is private to construction-tab and needs the card read's media).
//
// `propose: true` fills an EMPTY card's order the way the skeleton door's «apply all» does: the
// production pipeline (buildSkeletonFacts → proposeSkeleton) and `rowFromStep`.
// The print half typesets the SEAM MAP sheet through the same seamSheetOf + typesetSeams the print
// page calls, drawn by the same PaperPages.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { proposeSkeleton } from 'lib/assembly-skeleton/pipeline';
import {
  isJoin,
  pairPicture,
  pieceFamilies,
  readMap,
  type MapRead,
} from 'lib/assembly-skeleton/map';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { assemblyPrintModel } from 'components/managers/tech-card/assembly-print/model';
import { typesetSeams } from 'components/managers/tech-card/assembly-print/paper';
import { pdfSize } from 'components/managers/tech-card/assembly-print/paper-pdf';
import { PaperPages } from 'components/managers/tech-card/assembly-print/paper-svg';
import { seamSheetOf } from 'components/managers/tech-card/assembly-print/seam-sheet';
import { ActiveStepProvider } from 'components/managers/tech-card/components/assembly-map/active-step';
import { AssemblyMap } from 'components/managers/tech-card/components/assembly-map/assembly-map';
import { skeletonDeps } from 'components/managers/tech-card/components/assembly-skeleton-deps';
import {
  buildSkeletonFacts,
  skeletonCategoryRead,
  skeletonLined,
} from 'components/managers/tech-card/components/assembly-skeleton-source';
import {
  CardUnitPicturesProvider,
  useCardSeamGraph,
} from 'components/managers/tech-card/components/card-unit-pictures';
import {
  AutosaveContext,
  AUTOSAVE_OFF,
} from 'components/managers/tech-card/components/design/autosave-contract';
import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import {
  OperationsField,
  rowFromStep,
} from 'components/managers/tech-card/components/operations-field';
import type { PieceCloth } from 'components/managers/tech-card/components/piece-cloth';
import {
  toPurposeEnum,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import type { PieceShapeMap } from 'components/managers/tech-card/components/use-piece-shapes';

type StandCard = {
  code: string;
  form: TechCardFormData;
  categoryNames: string[];
  /** null — the card has no DXF at all. */
  shapes: [string, FoundPiece | null][] | null;
  cloth: [string, PieceCloth][] | null;
  propose?: boolean;
};

let form: UseFormReturn<TechCardFormData> | null = null;
let root: Root | null = null;
let graph: SeamGraph | null = null;

function GraphTap() {
  graph = useCardSeamGraph().graph;
  return null;
}

function Stand({ c }: { c: StandCard }) {
  const [shapes] = useState<PieceShapeMap>(() => (c.shapes ? new Map(c.shapes) : null));
  const [cloth] = useState(() => (c.cloth ? new Map(c.cloth) : null));
  return (
    <ActiveStepProvider>
      <CardUnitPicturesProvider shapes={shapes} cloth={cloth} categoryNames={c.categoryNames}>
        <GraphTap />
        <div className='flex items-start gap-3.5'>
          <div className='w-[320px] shrink-0 space-y-2.5' data-map-column>
            <AssemblyMap
              sketch={
                <div
                  data-sketch-stub
                  className='flex aspect-[3/4] items-center justify-center border border-borderColor bg-bgZebra text-micro text-labelColor uppercase'
                >
                  technical sketch (stand stub)
                </div>
              }
            />
          </div>
          <section className='min-w-0 flex-1 border border-borderColor bg-bgColor p-4'>
            <OperationsField
              storedHasMedia={false}
              storedHasUnits={(c.form.operations ?? []).some((o) => !!o.outputUnitKey)}
              frozen={false}
              pieceShapes={shapes}
            />
          </section>
        </div>
      </CardUnitPicturesProvider>
    </ActiveStepProvider>
  );
}

function Harness({ c }: { c: StandCard }) {
  const methods = useForm<TechCardFormData>({ mode: 'onChange', defaultValues: c.form });
  form = methods;
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <AutosaveContext.Provider value={{ ...AUTOSAVE_OFF, status: 'idle', request: () => {} }}>
          <FormProvider {...methods}>
            <form className='bg-pageBg p-6'>
              <Stand c={c} />
            </form>
          </FormProvider>
        </AutosaveContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The skeleton door's «apply all», without the door: the production pipeline → form rows. */
function proposeInto(c: StandCard): StandCard {
  const shapes: PieceShapeMap = c.shapes ? new Map(c.shapes) : null;
  const cloth = c.cloth ? new Map(c.cloth) : null;
  const bomLines = (c.form.bomItems ?? []) as Parameters<typeof buildSkeletonFacts>[0]['bomLines'];
  const lined = skeletonLined({
    cloth,
    pieces: c.form.pieces,
    aliases: c.form.pieceDxfAliases ?? [],
    patterns: c.form.patterns ?? [],
    bomLines,
  });
  const { facts } = buildSkeletonFacts({
    pieces: c.form.pieces,
    shapes,
    cloth,
    bomLines,
    category: skeletonCategoryRead({
      categoryNames: c.categoryNames,
      hasLining: lined,
      pieceNames: c.form.pieces.map((p) => p.name ?? ''),
      purpose: toPurposeEnum(c.form.purpose),
    }).category,
    defaultMachineType: null,
    aliases: c.form.pieceDxfAliases ?? [],
  });
  const P = proposeSkeleton(facts, skeletonDeps, { pressOpen: true });
  const rows = P.steps.map((s) => rowFromStep(s, { machines: [], presses: [] }));
  return { ...c, form: { ...c.form, operations: rows as TechCardFormData['operations'] } };
}

const formSteps = () =>
  (form?.getValues('operations') ?? []).map((o) => ({
    inputs: (o.inputKeys ?? []).filter(Boolean),
    outputUnitKey: (o.outputUnitKey ?? '').trim(),
    sews: o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE',
  }));

function readNow(): MapRead | null {
  return graph ? readMap(graph, formSteps()) : null;
}

/** Steps the probe drives: a drawn geometry join, a join with no read edges, a twin join. */
function pickSteps() {
  const read = readNow();
  if (!read) return null;
  const n = read.steps.length;
  const joins = [...Array(n).keys()].filter((i) => read.steps[i].sews && isJoin(read, i));
  const geometry = joins.find((i) => read.seams[i].length > 0 && pairPicture(read, i) != null);
  const template = joins.find((i) => read.seams[i].length === 0);
  const fams = pieceFamilies(read);
  // A twin join: every leaf it sews belongs to an L·R family whose DRAWN piece is the other hand —
  // its numbers reach PIECES only through the twin's edge mapping.
  const twin = joins.find((i) => {
    if (read.seams[i].length === 0) return false;
    const leaves = read.inputLeaves[i].flat().filter((k) => read.geoms.has(k));
    return (
      leaves.length > 0 &&
      leaves.every((k) => fams.some((f) => f.tag.startsWith('L·R') && f.members.indexOf(k) > 0))
    );
  });
  const twinFamily =
    twin != null
      ? fams.find((f) => f.picture.edges.some((e) => e.steps.includes(twin)))?.leader ?? null
      : null;
  return {
    steps: n,
    firstMachine: read.steps.findIndex((s) => s.sews),
    machineJoins: joins.length,
    withSeams: joins.filter((i) => read.seams[i].length > 0).length,
    geometry: geometry ?? null,
    template: template ?? null,
    twin: twin ?? null,
    twinFamily,
    families: fams.length,
    numbered: fams.reduce((s, f) => s + f.picture.edges.length, 0),
  };
}

function printSeams(code: string, plain = false) {
  const ops = form?.getValues('operations') ?? [];
  const pieces = (form?.getValues('pieces') ?? []).map((p) => ({
    lineKey: p.lineKey ?? '',
    name: p.name ?? '',
  }));
  const M = assemblyPrintModel({
    pieces,
    steps: ops.map((o, i) => ({
      number: (i + 1) * 10,
      verb: (o.work ?? '').replace(/_/g, ' ') || 'join',
      zone: '',
      inputKeys: (o.inputKeys ?? []).filter(Boolean),
      outputUnitKey: (o.outputUnitKey ?? '').trim(),
      outputUnitName: (o.outputUnitName ?? '').trim(),
    })),
  });
  const c = form?.getValues('construction');
  const sheet = seamSheetOf(
    graph,
    ops.map((o) => ({
      // `plain`: the sheet without the «how it is sewn» words — the base layout D8 sizes for A4.
      ...(plain ? {} : o),
      inputKeys: o.inputKeys ?? [],
      outputUnitKey: o.outputUnitKey ?? '',
      sews: o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE',
    })),
    M,
    plain
      ? { machines: [] }
      : {
          defaultSeamClass: c?.defaultSeamClass,
          machines: c?.equipmentDefaults?.machines ?? [],
        },
  );
  const doc = typesetSeams(
    M,
    {
      code,
      name: '',
      season: '',
      revision: 'UNRELEASED',
      unreleased: true,
      warnings: [],
      printedOn: '2026-10-10',
    },
    sheet,
  );
  root?.unmount();
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  root = createRoot(host);
  root.render(
    <div style={{ background: '#fff', display: 'inline-block' }} data-print-stage>
      <PaperPages doc={doc} size={pdfSize(doc, null)} gapMm={6} />
    </div>,
  );
  // Out-of-sheet check on the primitives (text by the monospace metric the typesetter uses).
  let out = 0;
  const em = 0.6 * (25.4 / 72);
  for (const p of doc.prims) {
    if (p.k === 'text') {
      const w = p.s.length * em * p.size;
      const x0 = p.align === 'right' ? p.x - w : p.x;
      if (x0 < -0.01 || x0 + w > doc.w + 0.01 || p.y > doc.h + 0.01 || p.y < 0) out++;
    } else if (p.k === 'poly') {
      if (p.pts.some(([x, y]) => x < 0 || y < 0 || x > doc.w || y > doc.h)) out++;
    } else if (p.k === 'line') {
      if (
        [p.x1, p.x2].some((x) => x < 0 || x > doc.w) ||
        [p.y1, p.y2].some((y) => y < 0 || y > doc.h)
      )
        out++;
    }
  }
  const texts = doc.prims.filter((p) => p.k === 'text') as { size: number }[];
  return {
    w: doc.w,
    h: doc.h,
    out,
    minPt: Math.min(...texts.map((t) => t.size)),
    families: sheet?.families.length ?? 0,
    key: sheet?.key.length ?? 0,
    unread: sheet?.key.filter((k) => k.unread).length ?? 0,
    legend: sheet?.legend ?? [],
    keyText: sheet?.key.map((k) => `${k.number} ${k.text}`) ?? [],
  };
}

declare global {
  interface Window {
    __map: {
      mount: (c: StandCard) => void;
      pick: () => ReturnType<typeof pickSteps>;
      hasGraph: () => boolean;
      print: (code: string, plain?: boolean) => ReturnType<typeof printSeams>;
      set: (path: string, value: unknown) => void;
      get: (path: string) => unknown;
    };
  }
}

window.__map = {
  mount: (c) => {
    root?.unmount();
    graph = null;
    const host = document.getElementById('root')!;
    host.innerHTML = '';
    root = createRoot(host);
    root.render(<Harness c={c.propose ? proposeInto(c) : c} />);
  },
  pick: pickSteps,
  hasGraph: () => !!graph,
  print: printSeams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (path, value) => form?.setValue(path as any, value as any, { shouldDirty: true }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (path) => form?.getValues(path as any),
};
