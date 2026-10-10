// THE AI SECOND OPINION IN THE SKELETON PANEL (lane E) — the asking half and its bar.
//
// One press = one paid request (SuggestAssemblySkeleton, chat.assembly_skeleton) — usually one model
// call, but a provider fallback or the one retry of an unusable answer adds calls, and the server
// reports every one of them (calls, unknown_calls, cost_usd; on a refusal as an AI_SPEND detail),
// which the bar prints, the refusal included. The model reads the
// skeleton on screen as data and answers an order, a reading per ambiguous join and doubts. The
// answer is SHOWN, marked AI, beside the engine's own reading — the steps, their order and the form
// do not move until «use AI order» or «use AI readings» is pressed (and the form only on «apply»).
//
// THE ASKER IS INJECTED (`SkeletonAIAskContext`), like the skeleton provider: production asks the
// server; the UI probe mounts a stub through the same seam. Answers are kept for the session
// (module memory, keyed by the request), so reopening the panel or pressing again on the same
// skeleton costs nothing; «ask again» is a new, paid request.
import { adminService } from 'api/api';
import type {
  SuggestAssemblySkeletonRequest,
  SuggestAssemblySkeletonResponse,
} from 'api/proto-http/admin';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { techCardErrorMessage } from 'components/managers/tech-cards/components/utils';

export type SkeletonAIAsk = (
  req: SuggestAssemblySkeletonRequest,
) => Promise<SuggestAssemblySkeletonResponse>;

export const SkeletonAIAskContext = createContext<SkeletonAIAsk | null>((req) =>
  adminService.SuggestAssemblySkeleton(req),
);

export type SkeletonAIAnswer = {
  answer: SuggestAssemblySkeletonResponse;
  /** Signatures of the steps the request carried: s1 = sent[0] … (lib/assembly-skeleton/ai.ts). */
  sent: string[];
  /** Answered from this session's memory or the server's hour cache: nothing was charged. */
  free: boolean;
};

export type SkeletonAIState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'ready'; result: SkeletonAIAnswer }
  | { status: 'error'; message: string; spend: SkeletonAISpend | null };

/** What a press was charged, as the server reports it (the answer, or a refusal's AI_SPEND detail). */
export type SkeletonAISpend = { calls: number; unknownCalls: number; costUsd: string };

/** The AI_SPEND detail of a refused press (grpc-gateway `details`), or null when nothing was called. */
export function skeletonAISpendOfError(e: unknown): SkeletonAISpend | null {
  const details = (e as { details?: unknown[] })?.details;
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    const info = d as { reason?: string; metadata?: Record<string, string> };
    if (info?.reason !== 'AI_SPEND' || !info.metadata) continue;
    const calls = Number(info.metadata.calls ?? 0);
    if (!Number.isFinite(calls) || calls <= 0) return null;
    return {
      calls,
      unknownCalls: Number(info.metadata.unknown_calls ?? 0) || 0,
      costUsd: info.metadata.cost_usd ?? '',
    };
  }
  return null;
}

/** «2 calls · $0.0300 · 1 with no known charge» — what a press cost, never a silent zero. */
export function skeletonAISpendWords(sp: SkeletonAISpend): string {
  const n = Number(sp.costUsd);
  const money = sp.costUsd && Number.isFinite(n) ? `$${n < 0.1 ? n.toFixed(4) : n.toFixed(3)}` : '';
  return [
    `${sp.calls} ${sp.calls === 1 ? 'call' : 'calls'}`,
    money || (sp.unknownCalls > 0 ? '' : 'cost not reported'),
    sp.unknownCalls > 0
      ? sp.unknownCalls === sp.calls
        ? 'charge not known'
        : `${sp.unknownCalls} with no known charge`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// The session's answers, by request (the card id and force are not part of the question).
const sessionAnswers = new Map<string, SuggestAssemblySkeletonResponse>();
const sessionKey = (req: SuggestAssemblySkeletonRequest) =>
  JSON.stringify({ ...req, techCardId: 0, force: false });

export function useSkeletonAI(): {
  available: boolean;
  state: SkeletonAIState;
  ask: (req: SuggestAssemblySkeletonRequest, sent: string[], again?: boolean) => void;
  clear: () => void;
} {
  const asker = useContext(SkeletonAIAskContext);
  const [state, setState] = useState<SkeletonAIState>({ status: 'idle' });
  const gen = useRef(0);
  const ask = useCallback(
    (req: SuggestAssemblySkeletonRequest, sent: string[], again = false) => {
      if (!asker) return;
      const my = ++gen.current;
      const key = sessionKey(req);
      const kept = again ? undefined : sessionAnswers.get(key);
      if (kept) {
        setState({ status: 'ready', result: { answer: kept, sent, free: true } });
        return;
      }
      setState({ status: 'asking' });
      asker({ ...req, force: again })
        .then((answer) => {
          sessionAnswers.set(key, answer);
          if (gen.current === my)
            setState({ status: 'ready', result: { answer, sent, free: !!answer.cached } });
        })
        .catch((e: unknown) => {
          if (gen.current === my)
            setState({
              status: 'error',
              message: techCardErrorMessage(e, 'the AI did not answer'),
              spend: skeletonAISpendOfError(e),
            });
        });
    },
    [asker],
  );
  const clear = useCallback(() => {
    gen.current += 1;
    setState({ status: 'idle' });
  }, []);
  return { available: !!asker, state, ask, clear };
}

/** What the answer on screen cost: every call of the press, or why nothing was charged. */
export function skeletonAICost(r: SkeletonAIAnswer): string {
  if (r.free) return 'no charge: the same skeleton was answered earlier';
  return skeletonAISpendWords({
    // An older server reports no count: one call is the floor of a non-cached answer.
    calls: r.answer.calls || 1,
    unknownCalls: r.answer.unknownCalls ?? 0,
    costUsd: r.answer.costUsd ?? '',
  });
}

const KIND_WORD: Record<string, string> = {
  order: 'order',
  lining: 'lining',
  missing: 'missing',
  closure: 'closure',
  pressing: 'pressing',
  other: 'check',
};

/**
 * THE AI BAR — one ruled line under the template line: the door, then (with an answer) what it
 * says and the two explicit doors that act on it, then its doubts, one per line, in words.
 */
export function SkeletonAIBar({
  state,
  available,
  canAsk,
  whyNot,
  onAsk,
  onAskAgain,
  readings,
  order,
  stepName,
}: {
  state: SkeletonAIState;
  available: boolean;
  /** The skeleton on screen can be sent (null = it can; else why not, in words). */
  canAsk: boolean;
  whyNot: string;
  onAsk: () => void;
  onAskAgain: () => void;
  /** The readings door: how many picks differ, whether it is locked and why, and the press. */
  readings: { changed: number; total: number; locked: string; onUse: () => void };
  /** The order door: how many steps the AI moves, why it cannot apply, and the press. */
  order: { moved: number; blocked: string; inUse: boolean; onUse: () => void };
  /** A step id of the answer → its words on screen («Set sleeves»), or null when not on screen. */
  stepName: (stepId: string) => string | null;
}) {
  if (!available) return null;
  const asking = state.status === 'asking';
  const ready = state.status === 'ready' ? state.result : null;
  const ans = ready?.answer;
  const warnings = ans?.warnings ?? [];
  const notes = ans?.notes ?? [];
  const orderOffered = (ans?.order?.length ?? 0) > 0;

  return (
    <div className='mb-1.5 flex flex-col gap-1' data-skeleton-ai={state.status}>
      <div className='flex flex-wrap items-center gap-2'>
        <Pill
          tone='attention'
          title='a second opinion from a language model, never applied by itself'
        >
          AI
        </Pill>
        {!ready && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={!canAsk || asking}
            onClick={onAsk}
            data-skeleton-ai-ask='1'
            title={
              canAsk
                ? 'a paid request, usually one model call (about $0.05–0.50); a provider fallback or one retry of an unusable answer adds calls, and every call is shown here. The model suggests an order, a reading per open join and doubts; nothing changes until you use it'
                : whyNot
            }
          >
            {asking ? 'asking the AI…' : 'ask AI for a second opinion'}
          </Button>
        )}
        {!ready && !asking && !canAsk && whyNot && (
          <Text size='micro' variant='label' component='span'>
            {whyNot}
          </Text>
        )}
        {ready && ans && (
          <>
            <Text
              size='micro'
              variant='label'
              component='span'
              data-skeleton-ai-cost={ans.costUsd ?? ''}
            >
              {[ans.model, skeletonAICost(ready)].filter(Boolean).join(' · ')}
            </Text>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={!orderOffered || order.moved === 0 || !!order.blocked}
              onClick={order.onUse}
              data-skeleton-ai-use-order={order.moved}
              title={
                !orderOffered
                  ? 'the AI gave no order that fits this skeleton'
                  : order.blocked ||
                    (order.moved === 0
                      ? 'the AI keeps the order on screen'
                      : 'reorder the steps as the AI suggests; nothing is written until you apply')
              }
            >
              {!orderOffered
                ? 'no AI order'
                : order.inUse
                  ? 'AI order in use'
                  : order.moved === 0
                    ? 'AI keeps this order'
                    : `use AI order (${order.moved} moved)`}
            </Button>
            {readings.total > 0 && (
              <Button
                type='button'
                variant='secondary'
                size='xs'
                disabled={readings.changed === 0 || !!readings.locked}
                onClick={readings.onUse}
                data-skeleton-ai-use-readings={readings.changed}
                title={
                  readings.locked ||
                  (readings.changed === 0
                    ? 'the AI agrees with the readings on screen'
                    : 'rebuild the skeleton on the AI’s readings; the steps after each change are read again')
                }
              >
                {readings.changed === 0
                  ? 'AI agrees on the joins'
                  : `use AI readings (${readings.changed} of ${readings.total})`}
              </Button>
            )}
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={onAskAgain}
              data-skeleton-ai-again='1'
              title='a new paid request on the skeleton as it is now (every call it makes is shown)'
            >
              ask again
            </Button>
          </>
        )}
        {state.status === 'error' && (
          <Text size='micro' variant='error' component='span' data-skeleton-ai-error='1'>
            {state.message}
            {state.spend && (
              <span data-skeleton-ai-error-spend={state.spend.calls}>
                {' '}
                · charged anyway: {skeletonAISpendWords(state.spend)}
              </span>
            )}
          </Text>
        )}
      </div>
      {ready && order.blocked && orderOffered && (
        <Text size='micro' variant='label' component='p' data-skeleton-ai-order-blocked='1'>
          AI order: {order.blocked}
        </Text>
      )}
      {warnings.length > 0 && (
        <ul className='flex flex-col gap-0.5' data-skeleton-ai-warnings={warnings.length}>
          {warnings.map((w, i) => {
            const on = (w.stepIds ?? []).map(stepName).filter(Boolean) as string[];
            return (
              <li key={i} className='flex flex-wrap items-baseline gap-1.5'>
                <Text size='micro' variant='uppercase' component='span' className='text-warning'>
                  {KIND_WORD[w.kind ?? ''] ?? 'check'}
                </Text>
                <Text size='micro' component='span'>
                  {w.message}
                  {on.length > 0 && <span className='text-labelColor'> · {on.join(', ')}</span>}
                </Text>
              </li>
            );
          })}
        </ul>
      )}
      {ready && warnings.length === 0 && (
        <Text size='micro' variant='label' component='p'>
          the AI has no doubts about this skeleton
        </Text>
      )}
      {notes.length > 0 && (
        <Text size='micro' variant='label' component='p' data-skeleton-ai-notes={notes.length}>
          checked by the server: {notes.join(' · ')}
        </Text>
      )}
    </div>
  );
}
