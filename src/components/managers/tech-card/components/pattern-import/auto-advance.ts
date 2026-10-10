// N1 (AUTO, A4-lite): the wizard runs forward on its own through every step that asks nothing and
// lands on the first one that does (or on check). What "asks" means is the step's own `blocker`
// (use-import-session.ts) plus the few things a step offers without blocking on them — written
// here, pure, so the e2e probe prices the same stops (scripts/pattern-import/e2e-entry.ts, A7).
// D3: nothing is accepted here; a suggestion waiting for its click is a stop, not a pass.
import type {
  ImportSession,
  MaskItem,
  ScaleCandidate,
  StageIO,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { anisotropyOf, squareSidesOf } from './formats';

/** Where the run always stops: the gate is read and apply / download is a deliberate click. */
export const AUTO_STOPS: readonly WizardStep[] = ['check', 'apply'];

/** Mask items offered but not applied — a suggestion waiting for "accept". */
export const waitingItems = (items: readonly Pick<MaskItem, 'status' | 'applied'>[]) =>
  items.filter((it) => it.status === 'suggest' && !it.applied).length;

/** The files step's open offers: suggested kinds not accepted, set-aside pages framed "check". */
export function cleanWaiting(
  clean: StageIO['clean']['out'] | null | undefined,
  pages: readonly { cls: string }[] = clean?.classes ?? [],
) {
  if (!clean) return { items: 0, pages: 0, unknown: 0 };
  return {
    items: waitingItems(clean.pages.flatMap((p) => p.items)),
    pages: clean.dropped.filter((d) => d.status === 'suggest').length,
    // a page the classifier could not place is drawn in the "needs a human" tone
    unknown: pages.filter((p) => p.cls === 'unknown').length,
  };
}

/** The scale detection is not certain enough to pass without "I checked" (the scale blocker). */
export function scaleUncertain(c: Pick<ScaleCandidate, 'confidence' | 'evidence'>, factor: number) {
  const sides = squareSidesOf(c.evidence?.text);
  return (
    c.confidence < 0.9 ||
    Math.abs(factor - 1) > PATIMPORT.scaleWarnRatio ||
    (!!sides && anisotropyOf(sides) > PATIMPORT.scaleWarnRatio)
  );
}

/**
 * What a step OFFERS without blocking "next" on it, worded — null when there is nothing. The
 * blocker covers every question a step refuses to move without; this adds the offers that are
 * still the operator's call (D3): the clean stage's suggestions and pages to check.
 */
export function stepOffer(
  s: Pick<ImportSession, 'step' | 'clean' | 'pages' | 'sheet'>,
  presegmented: boolean,
): string | null {
  switch (s.step) {
    case 'files': {
      if (presegmented) return null;
      const w = cleanWaiting(s.clean, s.pages);
      if (w.items) return 'suggested to set aside — accept, or go on with the lines kept';
      if (w.pages) return 'pages set aside to check — read one as a tile, or go on';
      if (w.unknown) return 'pages the reader could not place — check their role, or go on';
      return null;
    }
    case 'sheet':
      return waitingItems(s.sheet?.clean?.items ?? [])
        ? 'suggested to set aside on the sheet — accept, or go on with the lines kept'
        : null;
    default:
      return null;
  }
}

/** A snapshot the resolver reads: the session, the operator's inputs, why the step stops. */
export type AutoSnapshot<I> = {
  session: ImportSession;
  inputs: I;
  step: WizardStep;
  /** The step's blocker, else its offer (`stepOffer`): the question the resolver may answer. */
  question: string;
};

/**
 * An answer to the question a step stops on (AUTOPILOT plugs a policy in here): an inputs patch
 * and / or wizard events, applied in order; the step is then checked again. null or `stop` = the
 * resolver has no answer — the run stays on the step for the operator.
 */
export type AutoAnswer<I> = { patch?: Partial<I>; events?: WizardEvent[]; stop?: boolean };
export type AutoResolver<I> = (
  snap: AutoSnapshot<I>,
) => AutoAnswer<I> | null | Promise<AutoAnswer<I> | null>;
