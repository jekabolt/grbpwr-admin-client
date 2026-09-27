import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useCallback, useEffect, useRef, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { useStartRunPending } from '../render/use-design-run';
import { playgroundRunScope, useWorkflowAddress } from './address';
import { WorkflowGrid, workflowOpenable } from './grid';
import { PlaygroundRecallIntake } from './recall';
import { workflowByKey } from './registry';
import { whyNot } from './registry/common';
import type { Draft, ResultsDef, WorkflowDef, WorkflowKey } from './registry/types';
import { PlaygroundResults } from './results';
import { WorkflowCard } from './workflow-card';
import { useWorkflowDrafts } from './workflow-drafts';
import { WorkflowPanel } from './workflow-panel';

/**
 * ═══ PLAYGROUND — A GRID OF WORKFLOWS, THEN ONE OPEN WORKFLOW (C-03) ═════════════════════════════
 *
 * The one aside of THE CHAIN (C-01). The owner: «они будут сначала гридом показываться и
 * пользователь будет выбирать». So the screen has two states and the address says which:
 *
 *   · no `?wf=`    → the grid of twelve (`WorkflowGrid`) and every picture the room made;
 *   · `?wf=<key>`  → «Select a workflow» with the open one (`WorkflowCard`, whose |→ is the one way
 *                    back), its form (`WorkflowPanel`) and its own results.
 *
 * `?wf=` IS THIS SCREEN'S (`useWorkflowAddress`, `./address.ts`), and every write of it REPLACES:
 * |→ is the way back to the grid, and the browser's Back leaves the playground (G-01 r2 — why the
 * C-05 history entry per opened workflow was taken out is argued in `./address.ts`).
 *
 * ⚠ A WORKFLOW THIS SERVER CANNOT RUN IS NEVER OPENED INTO A FORM. An address naming one (an old
 * link, a server rolled back) draws the grid with one line saying which and why — a form whose
 * GENERATE the server refuses would be worse than no form.
 *
 * The drafts live per `{card, workflow}` (`useWorkflowDrafts`) and die with the card.
 *
 * ⚠ WHILE A RUN OF THE OPEN WORKFLOW IS STARTING, |→ WAITS. That is courtesy, not the guard: the
 * browser's Back and the rail still unmount the form, and what keeps a second press from buying a
 * second run is the idempotency ledger the form's hook keeps above it (`render/run-ledger.ts`).
 *
 * FOCUS FOLLOWS THE PERSON (G-01): opening a workflow unmounts the tile that was pressed, and |→
 * unmounts itself — either way focus fell to `<body>`. When it did, it is put on the open
 * workflow's title, or back on the tile of the workflow just left. Focus that is somewhere real (a
 * recall pressed in the history below) is left where it is.
 */
export function PlaygroundStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const drafts = useWorkflowDrafts(techCardId);
  const { asked, setWf } = useWorkflowAddress();
  const backToGrid = useCallback(() => setWf(null), [setWf]);

  const def = workflowByKey(asked);
  const open = openWorkflow(asked, band);
  const flow = open?.run ?? null;
  const starting = useStartRunPending(techCardId, open ? playgroundRunScope(open.key) : '');
  useFocusFollows(open?.key ?? null);

  const onRecall = useCallback(
    (key: WorkflowKey, draft: Draft) => {
      drafts.put(key, draft);
      setWf(key);
    },
    [drafts, setWf],
  );

  /** Why the address's workflow is not open, in words — or nothing when there is nothing to say. */
  const refused = asked && !open ? whyNotOpen(asked, def, band) : '';

  return (
    <>
      {/* «RUN THAT AGAIN» FROM THE HISTORY LANDS HERE — the receiver draws nothing (see its file). */}
      <PlaygroundRecallIntake techCardId={techCardId} disabled={disabled} onRecall={onRecall} />

      <Section
        id='design-playground'
        title='playground'
        question={open ? `· ${open.title.toLowerCase()}` : '· pick a workflow'}
      >
        {open && flow ? (
          <div className='flex flex-col gap-8' data-playground-open={open.key}>
            <WorkflowCard def={open} onBack={backToGrid} backDisabled={starting} />
            <WorkflowPanel
              /* One panel per card and workflow: its refusal, its open inventory and a prompt's
                 undo or late «Improve» answer are about THAT form — never carried into card B's. */
              key={`${techCardId}:${open.key}`}
              def={open}
              run={flow}
              band={band}
              techCardId={techCardId}
              draft={drafts.of(open)}
              onDraft={(fn) => drafts.update(open, fn)}
              disabled={disabled}
            />
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {refused && (
              <CalloutBox tone='note'>
                <Text size='micro' component='p' className='normal-case'>
                  {refused}
                </Text>
              </CalloutBox>
            )}
            <WorkflowGrid band={band} onOpen={setWf} />
          </div>
        )}
      </Section>

      <PlaygroundResults band={band} techCardId={techCardId} disabled={disabled} def={open} />
    </>
  );
}

/**
 * The workflow the address opens, or `null` for the grid: a key this playground knows AND this server
 * can run. The screen and the history under it (`playgroundHistoryMatch`) read the same answer.
 */
export function openWorkflow(
  asked: string | null | undefined,
  band: GetDesignBandResponse,
): WorkflowDef | null {
  const def = workflowByKey((asked ?? '').trim());
  return def && workflowOpenable(def, band) ? def : null;
}

/**
 * ═══ THE HISTORY UNDER AN OPEN WORKFLOW NARROWS TO IT (C-05) ════════════════════════════════════
 *
 * The open workflow's own results matcher (`def.run.results.match`), or `null` on the grid — the
 * studio tab then passes the whole room. The matcher is a constant of its tile module, so the
 * reference is stable per workflow (`GenerationHistory` memoises on it).
 */
export function playgroundHistoryMatch(
  asked: string | null | undefined,
  band: GetDesignBandResponse,
): ResultsDef['match'] | null {
  return openWorkflow(asked, band)?.run?.results.match ?? null;
}

/**
 * WHICH LIST THE HISTORY UNDER THE PLAYGROUND IS (G-01, Codex 4): the open workflow's registry key,
 * or the room's. Every playground workflow shares `defaultRep='playground'`, so without this the
 * history's page and its autofill budget could not tell Change a Color's list from Create or
 * edit's — a budget spent on one left the other with rows the server holds and never fetched.
 */
export function playgroundHistoryScope(
  asked: string | null | undefined,
  band: GetDesignBandResponse,
): string {
  return openWorkflow(asked, band)?.key ?? 'playground-room';
}

function whyNotOpen(
  asked: string,
  def: ReturnType<typeof workflowByKey>,
  band: GetDesignBandResponse,
): string {
  if (!def) return `«${asked}» is not a workflow of this playground — pick one below.`;
  return `${def.title} is ${whyNot(def, band) || 'not available'} — pick another workflow below.`;
}

/** See the file head: focus that fell to `<body>` when the screen changed is put back in view. */
function useFocusFollows(openKey: WorkflowKey | null): void {
  const shown = useRef(openKey);
  useEffect(() => {
    const was = shown.current;
    shown.current = openKey;
    if (was === openKey) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target = openKey
      ? document.querySelector<HTMLElement>(
          `[data-workflow-card="${openKey}"] [data-workflow-heading]`,
        )
      : was
        ? document.querySelector<HTMLElement>(`[data-workflow-tile="${was}"]`)?.closest('button')
        : null;
    target?.focus();
  }, [openKey]);
}
