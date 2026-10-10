// UI stand of the PROD RUN (prod-run-ui.mjs): a real card's form (mapTechCardToForm of its read
// DTO — pieces, BOM, aliases, the technologist's operations, equipment park), its contour map as
// usePieceShapes built it in node (prod-run-entry.ts), its category chain — under the REAL door,
// panel, OperationsField and CardUnitPicturesProvider, with the production skeleton provider.
// Only what needs a server is stubbed (autosave: off and recorded).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PieceDTO } from 'lib/nesting/types';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';
import { SectionHeader } from 'ui/components/section-header';

import { useSkeletonDoor } from 'components/managers/tech-card/components/assembly-skeleton-panel';
import {
  DEFAULT_SKELETON_PROVIDER,
  SkeletonProviderContext,
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
import { OperationsField } from 'components/managers/tech-card/components/operations-field';
import type { PieceCloth } from 'components/managers/tech-card/components/piece-cloth';
import type { TechCardFormData } from 'components/managers/tech-card/components/schema';
import type { PieceShapes } from 'components/managers/tech-card/components/use-piece-shapes';

type StandCard = {
  code: string;
  form: TechCardFormData;
  categoryNames: string[];
  shapes: [string, FoundPiece | null][];
  cloth: [string, PieceCloth][] | null;
};

let form: UseFormReturn<TechCardFormData> | null = null;
let root: Root | null = null;
const requests: string[] = [];

function Stand({ c }: { c: StandCard }) {
  const [shapes] = useState<PieceShapes>(() => {
    const m = new Map<string, FoundPiece | null>(c.shapes);
    return {
      shapeByKey: m,
      hasDxf: true,
      foundCount: [...m.values()].filter(Boolean).length,
      isLoading: false,
      error: null,
    };
  });
  const [cloth] = useState(() => (c.cloth ? new Map(c.cloth) : null));
  const [categoryNames] = useState(() => c.categoryNames);
  const skeleton = useSkeletonDoor({
    frozen: false,
    shapes,
    cloth,
    categoryNames,
    renderUnit: renderProposalUnit,
  });
  return (
    <section className='border border-borderColor bg-bgColor p-4' data-stand-section>
      <SectionHeader
        title={`operations — assembly order · ${c.code}`}
        question='— what each step does, where, on which pieces, and how long it takes'
        action={skeleton.headerAction}
      />
      <CardUnitPicturesProvider
        shapes={shapes.shapeByKey}
        cloth={cloth}
        categoryNames={categoryNames}
      >
        <OperationsField
          storedHasMedia={false}
          storedHasUnits={(c.form.operations ?? []).some((o) => !!o.outputUnitKey)}
          frozen={false}
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

function Harness({ c }: { c: StandCard }) {
  const methods = useForm<TechCardFormData>({ mode: 'onChange', defaultValues: c.form });
  form = methods;
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <AutosaveContext.Provider
          value={{ ...AUTOSAVE_OFF, status: 'idle', request: (r) => void requests.push(r) }}
        >
          <SkeletonProviderContext.Provider value={DEFAULT_SKELETON_PROVIDER}>
            <FormProvider {...methods}>
              <form className='bg-pageBg p-6'>
                <Stand c={c} />
              </form>
            </FormProvider>
          </SkeletonProviderContext.Provider>
        </AutosaveContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

declare global {
  interface Window {
    __pr: {
      mount: (c: StandCard) => void;
      ops: () => number;
      requests: () => string[];
    };
  }
}

window.__pr = {
  mount: (c) => {
    root?.unmount();
    const host = document.getElementById('root')!;
    host.innerHTML = '';
    root = createRoot(host);
    root.render(<Harness c={c} />);
  },
  ops: () => (form?.getValues('operations') ?? []).length,
  requests: () => [...requests],
};

export type { PieceDTO };
