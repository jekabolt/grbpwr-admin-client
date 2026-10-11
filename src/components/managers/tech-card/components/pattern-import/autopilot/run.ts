// A10 · AUTOPILOT — the two moves of an autopilot run outside the policy, shared by the wizard and
// the metric:
//   · `autopilotApply`: on check with a green gate, the EXPLICIT gated path to the card — check →
//     apply with the default "replace the previous import" (never a resolver event: the drive
//     always stops on check, and apply is this function's alone);
//   · `hookDriveCtx`: the drive tick's context (auto-drive.ts) over the wizard API, for a caller
//     that drives the hook from outside (the e2e probe over the React shim) — the wizard's own
//     effect builds the same context over its refs.
import type { WizardEvent, WizardStep } from 'lib/pattern-import/types';
import type { DriveCtx } from '../auto-drive';
import type { AutoResolver } from '../auto-advance';
import type { CardContext } from '../client';
import type { ImportSessionApi, Inputs } from '../use-import-session';
import { autopilotResolver, type AutopilotStop } from './policy';

/** The gate's blocking checks on the check step ("main G3-coverage"), empty = green. */
export function gateBlocks(api: Pick<ImportSessionApi, 'session'>): string[] {
  return Object.entries(api.session.gate).flatMap(([scope, g]) =>
    g.checks
      .filter((c) => !c.ok && c.severity === 'block')
      .map((c) => `${scope.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()} ${c.id}`),
  );
}

export type ApplyOutcome =
  | { ok: true; downloadOnly: boolean }
  | { ok: false; reason: string; step: 'check' | 'apply' };

/**
 * check → apply → the card, on a green gate only (a gate block is never answered: the export would
 * be known wrong). The previous import of a scope is replaced (the apply step's default).
 */
export async function autopilotApply(
  get: () => ImportSessionApi,
  card: CardContext,
  settle: () => Promise<void> = async () => {},
): Promise<ApplyOutcome> {
  const step = (): WizardStep => get().session.step;
  if (step() !== 'check') return { ok: false, step: 'check', reason: `not on check (${step()})` };
  const stale = get().cardStale();
  if (stale) return { ok: false, step: 'check', reason: stale };
  const blocks = gateBlocks(get());
  if (blocks.length)
    return { ok: false, step: 'check', reason: `the gate blocks: ${blocks.join(', ')}` };
  if (card.downloadOnly) {
    await get().next();
    await settle();
    if (step() !== 'apply')
      return { ok: false, step: 'check', reason: get().session.error ?? 'did not reach apply' };
    return { ok: true, downloadOnly: true };
  }
  // the lock first (synchronous): an apply already running or done for this draft refuses this one
  const token = get().lockApply();
  if (token == null)
    return { ok: false, step: 'check', reason: 'this draft is already being applied, or was' };
  await get().next();
  await settle();
  if (step() !== 'apply') {
    get().unlockApply(token);
    return { ok: false, step: 'check', reason: get().session.error ?? 'did not reach apply' };
  }
  await get().dispatch({ type: 'apply', token });
  await settle();
  const a = get().apply;
  if (a.phase !== 'done') return { ok: false, step: 'apply', reason: 'the apply did not finish' };
  if (!a.result.ok)
    return { ok: false, step: 'apply', reason: `the card refused: ${a.result.message}` };
  return { ok: true, downloadOnly: false };
}

/**
 * The drive tick's context over the wizard API (a caller outside React: `get()` is the latest
 * render's API, `settle()` lets the hook re-render between moves).
 */
export function hookDriveCtx(
  get: () => ImportSessionApi,
  settle: () => Promise<void>,
  resolve: AutoResolver<Inputs>,
): DriveCtx<Inputs> {
  const api = get();
  return {
    session: api.session,
    inputs: api.inputs,
    blocker: api.blocker,
    offer: api.offer,
    notice: api.notice,
    busy: false,
    resolve,
    current: () => ({ session: get().session, inputs: get().inputs }),
    forward: async () => {
      const from = get().session.step;
      await get().next();
      await settle();
      return get().session.step !== from;
    },
    patch: async (p) => {
      get().patchInputs(p);
      await settle();
    },
    dispatch: async (ev: WizardEvent) => {
      await get().dispatch(ev);
      await settle();
    },
    live: () => true,
    failed: () => !!get().session.error,
  };
}

/** The autopilot's resolver with the hook's extras (the first run's seeds, the DXF fast path). */
export const resolverFor = (
  card: CardContext,
  get: () => Pick<ImportSessionApi, 'baseSeeds' | 'extracted' | 'runCard'>,
  onStop?: (stop: AutopilotStop) => void,
) =>
  autopilotResolver(card, {
    onStop,
    extra: () => ({
      baseSeeds: get().baseSeeds,
      presegmented: !!get().extracted.presegmented,
      card: get().runCard,
    }),
  });
