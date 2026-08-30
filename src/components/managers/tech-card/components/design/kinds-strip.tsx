import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import Tooltip, { TooltipProvider } from 'ui/components/tooltip';

/**
 * THE STRIP OF REPRESENTATIONS — the four ways this card's design can exist as a picture, plus the
 * prompt profile that would drive the ones that are drawn rather than photographed.
 *
 * It is a POLOSA, not a block: the strip is its own surface (border + white fill, ruled internally
 * with hairlines), so it is never wrapped in a `Section` — see DESIGN.md → «tiles, boards and
 * strips are already their own surfaces».
 *
 * WHY THREE OF THE FOUR ARE DEAD, AND WHY THEY ARE STILL ON SCREEN.
 * The generative machine is CUT in this wave — not postponed behind a flag, cut for measured
 * reasons: the backend has no parsing of pictures out of a model's answer at all, there is no 3D
 * provider, and the 4 MiB answer ceiling is smaller than a single base64 PNG. A control that
 * cannot work has exactly two honest shapes: absent, or present WITH ITS REASON. Absent was
 * rejected because the four representations are the vocabulary of the band — a technologist who
 * cannot see «fabric render» on the strip does not conclude «not yet», he concludes «this admin
 * does not have renders», and then goes looking for them in the wrong place.
 *
 * So the reason is a first-class value here, carried on `data-inert` and spoken twice: on hover as
 * a footnote, and on click as a note that STAYS until it is dismissed. This strip is the only
 * carrier of `data-inert` in the wave, which is precisely why it could not be dropped from it.
 *
 * THE REASONS ARE WRITTEN FOR A TECHNOLOGIST. Not «no image parser in the gateway» — that is our
 * problem, not his. Each one says what cannot be done here and what he can do INSTEAD, because a
 * dead end with a way round it is a working screen and a dead end without one is a bug report.
 */

/** What a dead representation says when it is asked. Sentence case: this is prose, not a label. */
const INERT_REASON = {
  render:
    'Fabric renders are not made on this card. Nothing here can colour a flat drawing into a fabric ' +
    'render — make the render outside and bring the file in through the slot it belongs to.',
  threed:
    'No 3D is made on this card. There is nothing here that can turn the renders into a spinning ' +
    'garment — frames made elsewhere can be brought in as files and pinned to a slot like any picture.',
  onModel:
    'On-model pictures are not made on this card. Shoot the garment or take the picture from the ' +
    'shoot, and bring the file in through the slot it belongs to.',
  profile:
    'Prompt profiles are server configuration, not a card field — there is nothing to pick here and ' +
    'nothing on this card would read it. A profile is changed by whoever keeps the server settings.',
} as const;

type InertKey = keyof typeof INERT_REASON;

/**
 * The cell metrics, shared so the live cell and the dead ones sit on exactly one baseline. NOTE
 * that this carries NO flex sizing: the four representations share the strip (`SHARE`) and the
 * profile is pushed to the far end at its own width (`ASIDE`), and mixing the two into one string
 * would leave twMerge to pick a winner between them.
 */
const CELL = 'flex min-w-0 flex-col gap-0.5 px-2.5 py-2 text-left';
/**
 * `flex-1` — grow, shrink AND a zero basis — is load-bearing, and BOTH halves of it are.
 *
 * Without `min-w-0` a `<button>` in a flex strip is measured by its own content, so the cell with
 * the longest sub-line pushes past its share and lies over its neighbour. But a zero basis WITHOUT
 * grow is the same bug mirrored: the cell collapses to nothing and its label wraps one letter per
 * line, which is what this strip actually did until a screenshot showed it. Neither failure is
 * visible to a check that reads text — `innerText` returns the same string at every width.
 */
const SHARE = 'flex-1';
/** The profile sits at the far end, at its own width — it is a setting, not a representation. */
const ASIDE = 'ml-auto shrink-0 grow-0';
function RepCell({
  name,
  sub,
  active,
  inert,
  onInert,
  className,
}: {
  name: string;
  sub: string;
  active?: boolean;
  inert?: string;
  onInert?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn('font-bold', active ? 'text-bgColor' : 'text-textColor')}
      >
        {name}
      </Text>
      <Text
        size='micro'
        component='span'
        className={cn('break-words', active ? 'text-bgColor' : 'text-labelColor')}
      >
        {sub}
      </Text>
    </>
  );

  // The live, current representation is NOT a control: it is where you already are. A button that
  // does nothing when pressed is the very thing this strip exists to avoid.
  if (!inert) {
    return (
      <div
        aria-current={active ? 'true' : undefined}
        className={cn(CELL, active && 'bg-textColor', className)}
      >
        {body}
      </div>
    );
  }

  return (
    <Tooltip
      side='bottom'
      align='start'
      className='max-w-[320px] normal-case'
      trigger={
        <button
          type='button'
          // THE CARRIER OF THE REASON. Read by a human through the tooltip and the note below, and
          // by a probe through the attribute — a dead control that cannot be told apart from a
          // live one is how «it does nothing» ships unnoticed.
          data-inert={inert}
          // NO `aria-disabled` EITHER, and that is not an oversight. `aria-disabled` announces
          // «unavailable», which is only half of what is true here: the representation cannot be
          // made, but the CONTROL is live and answers when pressed. Marking it disabled tells a
          // screen-reader user not to press the one thing that would explain the situation to
          // him — and it makes every automated driver skip it as unactionable, so a probe can no
          // longer prove the reason arrives.
          onClick={onInert}
          className={cn(
            CELL,
            // NOT `disabled`: a disabled button takes no hover, no focus and no click, so the
            // reason would have no way to reach anybody. It stays reachable and answers instead.
            'cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            className,
          )}
        >
          {body}
        </button>
      }
    >
      {inert}
    </Tooltip>
  );
}

export function KindsStrip({ band }: { band: GetDesignBandResponse }): JSX.Element {
  // The reason last asked for, kept until it is dismissed. A toast would take the answer away
  // again while the eye was still on the control that raised the question.
  const [asked, setAsked] = useState<InertKey | null>(null);

  // THE ONE LIVE READING. `latestVersion` unset is honestly «no version yet» and never «version 0»
  // — the wire says so in as many words — so the two states are worded, not numbered.
  const version = band.latestVersion;
  const rev = version?.versionNumber ?? 0;
  const calloutCount = version?.callouts?.length ?? 0;
  const sheetSub =
    rev > 0
      ? `v${rev} · ${calloutCount} callout${calloutCount === 1 ? '' : 's'}`
      : 'draft — no version yet';

  return (
    <div>
      <TooltipProvider>
        <div className='flex items-stretch border border-borderColor bg-bgColor'>
          <RepCell name='flat — sheet' sub={sheetSub} active className={SHARE} />
          <RepCell
            name='fabric render'
            sub='not made here'
            inert={INERT_REASON.render}
            onInert={() => setAsked('render')}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='3d'
            sub='not made here'
            inert={INERT_REASON.threed}
            onInert={() => setAsked('threed')}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='on model'
            sub='not made here'
            inert={INERT_REASON.onModel}
            onInert={() => setAsked('onModel')}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='prompt profile'
            sub='server configuration'
            inert={INERT_REASON.profile}
            onInert={() => setAsked('profile')}
            className={cn(ASIDE, 'border-l border-hairline')}
          />
        </div>
      </TooltipProvider>
      {/* `bg-bgColor` on the note is required, not cosmetic: it sits on the grey page ground
          rather than inside a block, and a bordered box without a fill lets the ground through
          its own text. */}
      {asked && (
        <CalloutBox tone='note' className='mt-1.5 bg-bgColor'>
          <div className='flex items-start gap-2'>
            <Text size='micro' component='span' className='min-w-0 flex-1'>
              {INERT_REASON[asked]}
            </Text>
            <button
              type='button'
              onClick={() => setAsked(null)}
              className='shrink-0 uppercase text-labelColor hover:text-textColor focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='uppercase' tracking='label' component='span'>
                dismiss
              </Text>
            </button>
          </div>
        </CalloutBox>
      )}
    </div>
  );
}
