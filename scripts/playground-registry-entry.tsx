// Точка входа пробы «реестр PLAYGROUND» (C-05): НАСТОЯЩИЕ модули реестра, а не их копии.
//
// Ничего проверяемого здесь не переписано: проба зовёт `wire()` / `validate()` / `recall()` самих
// плиток, `legacyStep` цепочки, ворота возможностей и сетку — и рисует сетку настоящим React в
// строку, чтобы «плитка приглушена и не открывается» мерилось по разметке, а не по функции,
// которую сетка могла бы перестать звать.
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cardOutputRows } from 'components/managers/tech-card/components/design/bench-kinds';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { ChainRail } from 'components/managers/tech-card/components/design/chain-rail';
import {
  type ChainCtx,
  STEPS,
  THREED_STEP,
  addressedStep,
  defaultStep,
  doneCount,
  legacyStep,
  nearestBlock,
  railSteps,
  stepOfKind,
} from 'components/managers/tech-card/components/design/core/chain';
import {
  WorkflowGrid,
  workflowOpenable,
} from 'components/managers/tech-card/components/design/playground/grid';
import {
  WORKFLOWS,
  runWorkflowWord,
  workflowByKey,
  workflowOfRun,
} from 'components/managers/tech-card/components/design/playground/registry';
import {
  chooseEngine,
  drawnRatios,
  engineSummary,
  formatOf,
  formatSection,
  imageOptionsOf,
  initialDraft,
  workflowOffered,
} from 'components/managers/tech-card/components/design/playground/registry/common';
import {
  EMPTY_DRAFT,
  type Draft,
} from 'components/managers/tech-card/components/design/playground/registry/types';
import { WorkflowPanel } from 'components/managers/tech-card/components/design/playground/workflow-panel';
import { PlaygroundResults } from 'components/managers/tech-card/components/design/playground/results';
import {
  convexHull,
  paintedSamples,
  polygonArea,
  zoneOfStrokes,
} from 'components/managers/tech-card/components/design/playground/mask/geometry';
import {
  RETOUCH_CAVEAT,
  maskableRun,
  retouchOffered,
  retouchRefusal,
  retouchRequest,
} from 'components/managers/tech-card/components/design/playground/registry/tiles/retouch-zone';
import {
  openWorkflow,
  playgroundHistoryMatch,
  playgroundHistoryRep,
} from 'components/managers/tech-card/components/design/playground/studio';
import { plateColorway } from 'components/managers/tech-card/components/design/playground/registry/tiles/image-to-3d';
import { renderToStaticMarkup } from 'react-dom/server';
import { TooltipProvider } from 'ui/components/tooltip';
// C-09 · tile 1 (Virtual Try-On): the two pickers' pools and the owner's option lists.
import {
  modelPhotosOf,
  productColorwaysOf,
  productRendersOf,
} from 'components/managers/tech-card/components/design/playground/fields';
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
} from 'components/managers/tech-card/components/design/playground/registry/tiles/virtual-try-on';

export {
  RETOUCH_CAVEAT,
  convexHull,
  maskableRun,
  paintedSamples,
  polygonArea,
  retouchOffered,
  retouchRefusal,
  retouchRequest,
  zoneOfStrokes,
  EMPTY_DRAFT,
  WORKFLOWS,
  cardOutputRows,
  runWorkflowWord,
  chooseEngine,
  drawnRatios,
  engineSummary,
  formatOf,
  formatSection,
  imageOptionsOf,
  initialDraft,
  workflowOffered,
  legacyStep,
  openWorkflow,
  playgroundHistoryMatch,
  // C-10: the rail without STEP 5, and tile 12's colourway binding.
  STEPS,
  THREED_STEP,
  addressedStep,
  defaultStep,
  doneCount,
  nearestBlock,
  railSteps,
  stepOfKind,
  playgroundHistoryRep,
  plateColorway,
  workflowByKey,
  workflowOfRun,
  workflowOpenable,
};

export { ANGLE_OPTIONS, FRAMING_OPTIONS, modelPhotosOf, productColorwaysOf, productRendersOf };

// C-12 · where «run that again» sends a 3D run (STEP 5 on an old server, tile 12 on a new one).
export { recallTargetKind } from 'components/managers/tech-card/components/design/history-recall';
// G-02 client fix · the per-workflow window caption, the recall's AI-model line, the retouch source.
export { workflowOutputsHorizon } from 'components/managers/tech-card/components/design/bench-kinds';
export { recallEngineNote } from 'components/managers/tech-card/components/design/playground/registry/common';
export { retouchSourceId } from 'components/managers/tech-card/components/design/playground/registry/run-workflow';
export {
  RETOUCH_PRICE,
  RETOUCH_MASKING_KEY,
  RETOUCH_SOURCE_KEY,
} from 'components/managers/tech-card/components/design/playground/registry/tiles/retouch-zone';
// P-06 · the phase-3 keys: the literal every tile starts from, and the band before the server speaks.
export { emptyParams } from 'components/managers/tech-card/components/design/playground/registry/common';
export { EMPTY_BAND } from 'components/managers/tech-card/components/design/use-design-band';
// C-15 · the server's Ideas: the question, the cleaning, the menu as data, the static keys.
export {
  bandSuggestsPrompts,
  cleanServerIdeas,
  ideaMediaIds,
  ideasMenu,
  suggestRequest,
} from 'components/managers/tech-card/components/design/playground/ideas-server';
export { PROMPT_IDEAS } from 'components/managers/tech-card/components/design/playground/ideas';
// C-16 · the card's own past words of a field, and the menu's two groups.
export {
  cardRecentTexts,
  recentMenu,
} from 'components/managers/tech-card/components/design/playground/card-recent';
export { REUSE_LABEL } from 'components/managers/tech-card/components/design/playground/fields';
/** THE CHAIN rail as the person sees it (C-10): its cells and its «N of M steps» counter. */
export function railMarkup(ctx: ChainCtx): string {
  return renderToStaticMarkup(<ChainRail ctx={ctx} onStepChange={() => {}} />);
}

/** The grid as the person sees it, drawn by React into a string. */
export function gridMarkup(band: GetDesignBandResponse): string {
  return renderToStaticMarkup(<WorkflowGrid band={band} onOpen={() => {}} />);
}

/**
 * An open workflow's form as the person sees it (C-08): the real `WorkflowPanel`, drawn by React
 * into a string, so «the AI model fold exists on this server» is measured in the markup.
 */
export function panelMarkup(band: GetDesignBandResponse, key: string, draft?: Draft): string {
  const def = workflowByKey(key);
  if (!def?.run) return '';
  const qc = new QueryClient();
  // A modal of the generate row names `document.body` as its portal container while CLOSED; the
  // string renderer never mounts it, so an empty stand-in for the duration of one render is enough.
  const g = globalThis as { document?: unknown };
  const had = 'document' in g;
  if (!had) g.document = { body: null };
  try {
    return renderPanel(qc, def, band, draft);
  } finally {
    if (!had) delete g.document;
  }
}

function renderPanel(
  qc: QueryClient,
  def: NonNullable<ReturnType<typeof workflowByKey>>,
  band: GetDesignBandResponse,
  draft: Draft | undefined,
): string {
  if (!def.run) return '';
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <DesignCapabilityProvider value={true}>
        {/* The app holds one TooltipProvider at its root (context/index.tsx); a section's ⓘ needs it. */}
        <TooltipProvider>
          <WorkflowPanel
            def={def}
            run={def.run}
            band={band}
            techCardId={7}
            draft={draft ?? initialDraft(def.run)}
            onDraft={() => {}}
          />
        </TooltipProvider>
      </DesignCapabilityProvider>
    </QueryClientProvider>,
  );
}

/**
 * The results block as the person sees it (C-11): the real `PlaygroundResults`, drawn by React
 * into a string, so «the Mask corner is drawn only where the server offers the retouch» is
 * measured on the markup the tiles make.
 */
export function resultsMarkup(band: GetDesignBandResponse, key: string | null): string {
  const def = key ? workflowByKey(key) : null;
  const qc = new QueryClient();
  const g = globalThis as { document?: unknown };
  const had = 'document' in g;
  if (!had) g.document = { body: null };
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <DesignCapabilityProvider value={true}>
          <PlaygroundResults band={band} techCardId={7} def={def} />
        </DesignCapabilityProvider>
      </QueryClientProvider>,
    );
  } finally {
    if (!had) delete g.document;
  }
}
// C-13 · tile 9 Extend Image: the free refusals, the server's «adds nothing» predicate, the gate.
export {
  EXTEND_FORMAT_KEY,
  extendRefusal,
  extendTargetAddsNothing,
} from 'components/managers/tech-card/components/design/playground/registry/tiles/extend-image';
export { runKindOffered } from 'components/managers/tech-card/components/design/playground/registry/common';
export { inPlaygroundRoom } from 'components/managers/tech-card/components/design/playground/registry';
export { runRepresentation } from 'components/managers/tech-card/components/design/bench-kinds';
