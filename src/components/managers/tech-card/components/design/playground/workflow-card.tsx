import type { JSX } from 'react';
import Text from 'ui/components/text';

import type { WorkflowDef } from './registry/types';
import { WorkflowGlyph } from './workflow-glyph';

/**
 * ═══ «SELECT A WORKFLOW» — THE OPEN WORKFLOW, AND THE ONE WAY BACK TO THE GRID (C-03, 7.png) ═════
 *
 * The owner's reference heads an open workflow with its own card: a picture, the title and a `|→`
 * on the right. The `|→` is THE way back to the grid — the only one on the screen (the browser's
 * own back is the other). The card itself is not a button: a card that is also a door would be a
 * second button for the same action.
 *
 * The LAYOUT is the reference's; the look is the admin's (DESIGN.md): a panel-tinted strip inside
 * the block (a fill, not a new box), square, no shadow, the drawing in ink.
 */
export function WorkflowCard({
  def,
  onBack,
  backDisabled,
}: {
  def: WorkflowDef;
  onBack: () => void;
  /** A run of this workflow is starting: the way back waits for the answer (see `studio.tsx`). */
  backDisabled?: boolean;
}): JSX.Element {
  const backWords = backDisabled
    ? 'back to all workflows once the run is booked'
    : 'back to all workflows';
  return (
    <div className='flex flex-col gap-2' data-workflow-card={def.key}>
      <Text size='micro' variant='label' component='span' tracking='label' className='uppercase'>
        Select a workflow
      </Text>
      <div className='flex items-center gap-4 bg-bgSecondary p-3'>
        <span className='flex h-14 w-14 shrink-0 items-center justify-center bg-bgColor'>
          <WorkflowGlyph workflow={def.key} size={40} />
        </span>
        <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
          {/* Focus lands here when the workflow opens (`studio.tsx`): the title names the screen. */}
          <Text
            size='micro'
            component='span'
            tabIndex={-1}
            data-workflow-heading=''
            className='font-bold uppercase outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            {def.title}
          </Text>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {def.blurb}
          </Text>
        </span>
        <button
          type='button'
          onClick={onBack}
          disabled={backDisabled}
          aria-label={backWords}
          title={backWords}
          className='flex h-8 w-8 shrink-0 items-center justify-center border border-textInactiveColor bg-bgColor text-textColor hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed disabled:text-textInactiveColor disabled:hover:bg-bgColor disabled:hover:text-textInactiveColor'
          data-workflow-back=''
        >
          <svg
            viewBox='0 0 16 16'
            width={14}
            height={14}
            aria-hidden='true'
            focusable='false'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.5}
            strokeLinecap='square'
          >
            <path d='M2.5 2.5v11M6 8h7.5M10.5 5l3 3-3 3' />
          </svg>
        </button>
      </div>
    </div>
  );
}
