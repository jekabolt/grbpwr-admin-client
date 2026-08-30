import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { readBench } from '../bench-slot';
import { viewLabel } from '../views';

/**
 * FIX MODE — «generate this side again, from the bench rather than from the references».
 *
 * It is transient state shared by two organs that must not own it: the BENCH asks for a fix (the
 * `fix ▸` door sits under a slot), and the GENERATION FORM carries it out. Neither can hold it —
 * the bench would have to reach into the form, the form would have to know which slot asked — so it
 * lives above both, exactly like `pick-mode.tsx`, and for exactly the same reason.
 *
 * IT IS NOT PART OF THE CARD. A fix context that survived a reload would be a screen that looks
 * broken for reasons no field explains, so it dies on Esc and on unmount and is never persisted.
 *
 * WHAT A FIX ACTUALLY CHANGES, and why the form cannot simply add a checkbox: `params.fix_target`
 * replaces the whole question. The views matrix and the layout switch are NOT drawn while a fix is
 * armed, because a fix asks for exactly one picture of exactly one side — leaving them on screen
 * would make three organs lie at once (the ticks, the count and the price line), each of them about
 * a request the server is not being sent. The prototype notes the same rule as П4.
 *
 * SILHOUETTE SIDES ONLY. The contract refuses a detail here on purpose: a bare view key cannot name
 * one of several details, and the target is frozen into the run's history where an ambiguity could
 * never be repaired afterwards.
 */

export type FixTarget = {
  /** front | back | side_l | side_r — normalised, as the wire spells it. */
  viewKey: string;
  /** What to say out loud: FRONT, SIDE L. */
  label: string;
};

type FixContextValue = {
  target: FixTarget | null;
  start: (target: FixTarget) => void;
  cancel: () => void;
};

/**
 * DEFAULT IS INERT, and that is deliberate. An organ rendered outside the provider reports «no fix
 * armed» and draws nothing, rather than throwing — the same failure posture `capability.tsx` takes.
 * Nothing in the band currently OPENS a fix (the `fix ▸` door under a slot is not built yet), so
 * outside a provider this is silence, not a dead button.
 */
const FixCtx = createContext<FixContextValue>({
  target: null,
  start: () => {},
  cancel: () => {},
});

export function FixContextProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<FixTarget | null>(null);
  const cancel = useCallback(() => setTarget(null), []);

  // Esc cancels, and the bar promises it in words — so it has to be true even when focus is nowhere
  // in particular. Same document-level listener, same reason, as pick mode's.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setTarget(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [target]);

  const value = useMemo<FixContextValue>(
    () => ({ target, start: setTarget, cancel }),
    [target, cancel],
  );

  return <FixCtx.Provider value={value}>{children}</FixCtx.Provider>;
}

export function useFixContext(): FixContextValue {
  return useContext(FixCtx);
}

/**
 * THE FIX BAR — what the run is about to be given, said before it is paid for.
 *
 * It names the OTHER filled slots because those are the inputs: a fix reads the bench, not the
 * references, and the difference decides what comes back. `none filled` is stated rather than
 * hidden — a fix with an empty bench is a legal request and a bad one, and the human should see
 * which of the two they are making.
 */
export function FixContext({
  band,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId?: number;
  disabled?: boolean;
}) {
  const { target, cancel } = useFixContext();
  if (!target) return null;

  const bench = readBench(band);
  const others = bench.sides
    .filter((s) => s.view !== target.viewKey && (s.slot?.pictureId ?? 0) > 0)
    .map((s) => viewLabel(s.view));

  return (
    <CalloutBox tone='note' className='bg-bgColor'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <Text size='micro' component='span' className='uppercase tracking-label'>
          <b>fix: {target.label}</b>
        </Text>
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          inputs: the slots ({others.length ? others.join(', ') : 'none filled'}) — the same
          GENERATE and the same money; what comes back lands in the history and displaces nothing by
          itself.
        </Text>
        <span className='ml-auto'>
          <Button variant='secondary' size='xs' onClick={cancel} disabled={disabled}>
            cancel fix
          </Button>
        </span>
      </div>
    </CalloutBox>
  );
}
