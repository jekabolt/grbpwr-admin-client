'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React from 'react';

import { cn } from 'lib/utility';

// Re-exported so a screen only needs this one import to use <Tooltip>. Wrap a group of them in
// one <TooltipProvider> (same raw-Radix pattern already used ad hoc in
// components/managers/fitting/components/fitting-media.tsx) — it shares hover timing so
// adjacent triggers re-open instantly instead of each re-waiting the full delay.
export const TooltipProvider = TooltipPrimitive.Provider;

type Props = {
  // Single element that opens the tooltip on hover *and* focus (Radix wires both handlers).
  // Rendered via `asChild`, so Radix merges its handlers onto this exact node instead of
  // wrapping it — no extra element is introduced, which matters when the trigger sits inside
  // something like a <label>.
  trigger: React.ReactElement;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
};

// Minimal hover/focus tooltip (Radix Tooltip), styled to match the app's other portalled
// surfaces (bordered, bg-bgColor, z-popover so it clears modals).
export default function Tooltip({
  trigger,
  children,
  className,
  side = 'top',
  align = 'center',
  delayDuration,
}: Props) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            // Reference metrics: 10px, hairline-grey box, tight padding, no arrow.
            // A tooltip is a footnote, not a panel — it must not compete with a popover.
            'z-[var(--z-popover)] border border-borderColor bg-bgColor px-1.5 py-1 text-micro text-textColor',
            className,
          )}
        >
          {children}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
