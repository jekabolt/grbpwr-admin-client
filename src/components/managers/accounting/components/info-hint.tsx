import { cn } from 'lib/utility';
import { ReactNode } from 'react';
import Tooltip from 'ui/components/tooltip';

type Props = {
  // The explanation. Keep it to one or two plain sentences — longer copy belongs in a screen intro,
  // not a hover tooltip.
  children: ReactNode;
  // Names the term for screen readers ("what is DSO?"). Optional; falls back to a generic label.
  label?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

// A neutral "?" hover/focus hint — the plain-language counterpart to CaveatBadge's red "!". It sits
// next to a jargon term or column header and reveals a short explanation on hover or keyboard focus,
// so the layout stays clean for anyone who already knows the term while a non-accountant can always
// ask "what is this?". Square marker to match the brutalist kit (CaveatBadge's shape, neutral
// colour). All accounting routes share one TooltipProvider (index.tsx), so this works module-wide.
export function InfoHint({ children, label, side = 'top', className }: Props) {
  return (
    <Tooltip
      side={side}
      trigger={
        <button
          type='button'
          aria-label={label ? `what is ${label}?` : 'explanation'}
          className={cn(
            'inline-flex size-4 shrink-0 cursor-help items-center justify-center border border-textInactiveColor align-middle text-[10px] font-bold leading-none text-textInactiveColor hover:border-textColor hover:text-textColor',
            className,
          )}
        >
          ?
        </button>
      }
    >
      <span className='block max-w-72 text-textBaseSize'>{children}</span>
    </Tooltip>
  );
}
