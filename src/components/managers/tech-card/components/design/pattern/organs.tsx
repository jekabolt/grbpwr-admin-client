import { cn } from 'lib/utility';
import type { JSX, ReactNode } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { type DesignKind } from '../bench-kinds';
import { stepOfKind } from '../core/chain';
import { studioSwitchSolo, useStudioSwitchAvailable } from '../history-recall';
import { LockBar } from '../render/generate-row';

/**
 * THE LOCK BAR AS THE RAIL SPELLS IT: the word LOCKED in bold, the reason in label grey, the door
 * at the right edge — the prototype's `lockBar`, composed over the band's `LockBar` exactly the way
 * `chain-rail.tsx` composes it, so the two bars on one screen read as one organ. A refusal is
 * never spoken as a button's `title` alone.
 */
export function LockLine({
  reason,
  children,
  ...rest
}: {
  reason: string;
  children?: ReactNode;
  [k: string]: unknown;
}): JSX.Element {
  return (
    <LockBar>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='font-bold'
      >
        locked
      </Text>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='min-w-0 flex-1 normal-case'
        {...rest}
      >
        {reason}
      </Text>
      {children}
    </LockBar>
  );
}

/**
 * THE PATTERN STEP'S LOCAL ORGANS — three small printers this screen needs and the core does not
 * yet carry. Each is written once here and used by every file of this folder; none holds state or
 * reads the wire. ⚠ ALL THREE ASK TO LIVE IN `core/`: the colour tile of FABRIC RENDER and the
 * detached ON MODEL draw the same corner labels and the same «go to step» door, and a second copy
 * there would part from this one silently. The core is frozen in this round, so they stand here.
 */

/**
 * A LABEL IN A CORNER OF A TILE'S FACE — the prototype's `.frole` / `.fbadge` / `.fmark`.
 *
 * Solid ink for a verdict or a kind (`seamless`, `pattern`, `colour`, `in`); `gap` — white with
 * a dashed edge, label grey — for «not the case» (`join visible`, `not kept`). No red: red in this
 * admin means loss, and a tile whose join shows is not a loss, it is a fact about the picture.
 *
 * It is positioned absolutely, so the parent must be `relative` — `PictureTile`'s box and the
 * face span of a colour tile both are. `stack` lifts a bottom label one storey up, for a corner
 * already taken by another label.
 */
export function CornerLabel({
  at,
  gap,
  stack,
  children,
  className,
  ...rest
}: {
  at: 'tl' | 'tr' | 'bl' | 'br';
  gap?: boolean;
  stack?: boolean;
  children: ReactNode;
  className?: string;
  [k: string]: unknown;
}): JSX.Element {
  const place =
    at === 'tl'
      ? 'left-1 top-1'
      : at === 'tr'
        ? 'right-1 top-1'
        : at === 'bl'
          ? cn('left-1', stack ? 'bottom-6' : 'bottom-1')
          : cn('right-1', stack ? 'bottom-6' : 'bottom-1');
  return (
    <span
      {...rest}
      className={cn(
        'pointer-events-none absolute z-20 inline-block max-w-[calc(100%-8px)] px-1 py-0.5',
        place,
        gap
          ? 'border border-dashed border-borderColor bg-bgColor'
          : 'border border-textColor bg-textColor',
        className,
      )}
    >
      <Text
        size='nano'
        variant='uppercase'
        component='span'
        className={cn('block truncate', gap ? 'text-labelColor' : '!text-bgColor')}
      >
        {children}
      </Text>
    </span>
  );
}

/**
 * THE FACE OF A REPEATING TILE: the picture laid out 2×2, so the ONE join of four copies runs
 * through the middle of the face — the most visible place on the card. A tile that does not join
 * gives itself away with a cross in the centre, without being opened.
 *
 * `background-size: 50% 50%` is EXACTLY four copies, not «about four»: the fraction is taken from
 * the box, and the box is square, so each copy keeps the tile's own square and the join is not
 * stretched. `contain` or pixels would let the vertical period drift from the horizontal one on
 * a card of any other width, and the cross in the centre would stop being the join.
 */
export function TiledFace({ url, alt }: { url: string; alt: string }): JSX.Element {
  return (
    <div
      role='img'
      aria-label={`${alt} — the tile repeated four times, so the join runs through the middle`}
      data-tiled-face
      className='h-full w-full bg-bgColor'
      style={{
        backgroundImage: `url(${JSON.stringify(url)})`,
        backgroundSize: '50% 50%',
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

/**
 * A DOOR TO ANOTHER STEP OF THE STUDIO — `FABRIC RENDER ›` under an empty colour grid, under an
 * unbound tile, on a full shelf. It goes through the studio's own switch registry
 * (`useStudioKindSwitch`, the door history recall already uses), so the ONE writer of `?step=`
 * stays the studio; this file writes no address. When no studio has registered (a bandless card,
 * a screen mounted alone) the door is inert WITH its reason rather than absent: a missing door
 * teaches «there is no such step».
 */
export function GoToStep({
  kind,
  label,
  className,
  techCardId,
}: {
  kind: DesignKind;
  label?: string;
  className?: string;
  /** The card whose studio registered the switch — the registry is keyed by card. */
  techCardId: number;
}): JSX.Element {
  const registered = useStudioSwitchAvailable(techCardId);
  const available = registered || studioSwitchSolo() != null;
  const step = stepOfKind(kind);
  const text = label ?? `${step.label} ›`;
  if (!available) {
    return (
      <InertDoor
        label={text}
        reason='the studio has not registered its rail here, so this door has nowhere to lead'
        className={className}
      />
    );
  }
  return (
    <Button
      variant='secondary'
      size='xs'
      className={className}
      data-go-step={step.id}
      onClick={() => studioSwitchSolo()?.go(kind)}
    >
      {text}
    </Button>
  );
}
