import { cn } from 'lib/utility';

/**
 * Inline message box. Three tones, matching the system's colour semantics:
 *   error   — something is broken / blocking / about to be destroyed
 *   warning — mid-flight, needs a human (BLUE in this system, never amber)
 *   note    — neutral context
 */
export function CalloutBox({
  tone = 'note',
  children,
  className,
}: {
  tone?: 'error' | 'warning' | 'note';
  children: React.ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-error text-textColor [&_b]:text-error'
      : tone === 'warning'
        ? 'border-warning bg-warning/5 text-warning [&_b]:text-warning'
        : 'border-borderColor text-labelColor [&_b]:text-textColor';
  return <div className={cn('border px-2.5 py-2', toneClass, className)}>{children}</div>;
}
