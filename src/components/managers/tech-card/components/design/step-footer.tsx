import { useRef, useState, type JSX, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

import { InertDoor } from './bench-slot';
import type { StepId } from './core/chain';
import type { Gate } from './render/model';

/**
 * ═══ THE STEP FOOTER — ONE FORWARD DOOR, BOTTOM RIGHT, ON EVERY STEP OF THE GUIDE (onboarding S3) ═
 *
 * The owner: «на CARD DETAILS … внизу карточки справа должна быть кнопка типа next или go to
 * moodboard», «на мудборде снизу справа — go to flats», «когда сгенерировали флеты — go to
 * materials и так далее». So the last child of each step's stack is one row: the step's one
 * primary at the right edge, and nothing else unless the step owns it —
 *   · `aside` — a quiet underlined word at the LEFT (the flat's `skip → fabric render ›` on a guided
 *     card): a second way forward, never a second primary;
 *   · the refusal — while `gate` says no, the door is drawn DEAD (`InertDoor`, the studio's one dead
 *     door) and its reason stands beside it as ONE line in the row's metric (the product `LockBar`
 *     grammar: the reason without the word «locked» — the dead button already says it); `doors`
 *     are the ways to fix it (the moodboard minimum's `moodboard ›` / `description ›` / …).
 * Never hidden: a missing door teaches «there is no next», a dead one with its reason teaches what
 * is left — the same rule as `GenerateRow`.
 *
 * `onGo` may be async (CARD DETAILS of a card that does not exist yet creates it first): the door
 * says `pendingLabel` while it runs and cannot be pressed twice. After the step changes the page is brought
 * back to the top — the footer is pressed at the bottom of a long screen, and the next step starts
 * at the rail.
 */
export function StepFooter({
  step,
  label,
  onGo,
  gate,
  aside,
  doors,
  pendingLabel,
}: {
  step: StepId;
  label: string;
  onGo: () => void | Promise<unknown>;
  gate: Gate;
  aside?: ReactNode;
  doors?: ReactNode;
  pendingLabel?: string;
}): JSX.Element {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const go = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const run = onGo();
      if (run instanceof Promise) {
        setPending(true);
        await run;
      }
      window.scrollTo({ top: 0 });
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <div
      data-step-footer={step}
      className='flex flex-wrap items-center justify-end gap-x-4 gap-y-2'
    >
      {aside && <div className='mr-auto'>{aside}</div>}
      {!gate.ok && (
        <span data-step-footer-reason='' className='flex min-w-0 flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {gate.reason}
          </Text>
          {doors}
        </span>
      )}
      {gate.ok ? (
        <Button variant='main' size='sm' onClick={() => void go()} disabled={pending}>
          {pending ? pendingLabel ?? label : label}
        </Button>
      ) : (
        <InertDoor label={label} reason={gate.reason} size='sm' />
      )}
    </div>
  );
}
