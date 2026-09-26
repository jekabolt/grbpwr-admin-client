import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useCallback, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { useWorkflowAddress } from './address';
import { WorkflowGrid, workflowOpenable } from './grid';
import { PlaygroundRecallIntake } from './recall';
import { workflowByKey } from './registry';
import { NOT_ON_THIS_SERVER } from './registry/common';
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
 * `?wf=` IS THIS SCREEN'S (`useWorkflowAddress`, `./address.ts`). Opening a workflow from the grid
 * is a history entry, so the browser's Back returns to the grid (C-05); the recall intake and the
 * legacy `?step=aside` rewrite stay `replace`; |→ walks back to the grid it was opened from, or
 * writes the grid over a workflow a link landed on.
 *
 * ⚠ A WORKFLOW THIS SERVER CANNOT RUN IS NEVER OPENED INTO A FORM. An address naming one (an old
 * link, a server rolled back) draws the grid with one line saying which and why — a form whose
 * GENERATE the server refuses would be worse than no form.
 *
 * The drafts live per `{card, workflow}` (`useWorkflowDrafts`) and die with the card.
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
  const { asked, setWf, openFromGrid, backToGrid } = useWorkflowAddress();

  const def = workflowByKey(asked);
  const open = openWorkflow(asked, band);
  const flow = open?.run ?? null;

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
            <WorkflowCard def={open} onBack={backToGrid} />
            <WorkflowPanel
              /* One panel per workflow: its run state (refusal, pending) is about THAT form. */
              key={open.key}
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
            <WorkflowGrid band={band} onOpen={openFromGrid} />
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

function whyNotOpen(
  asked: string,
  def: ReturnType<typeof workflowByKey>,
  band: GetDesignBandResponse,
): string {
  if (!def) return `«${asked}» is not a workflow of this playground — pick one below.`;
  const gate = def.gate(band);
  const reason = !def.run ? NOT_ON_THIS_SERVER : gate.available ? '' : gate.reason;
  return `${def.title} is ${reason || 'not available'} — pick another workflow below.`;
}
