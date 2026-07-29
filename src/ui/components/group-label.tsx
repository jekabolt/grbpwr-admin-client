import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * A lightweight sub-group divider inside a section — one step below `SectionHeader`.
 * 10px uppercase grey over a hairline-weight rule.
 */
export function GroupLabel({
  children,
  action,
  flush,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Drop the top margin — for a label that opens a box rather than divides one. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-1 flex items-baseline gap-2 border-b border-borderColor pb-0.5',
        flush ? 'mt-0' : 'mt-3',
        className,
      )}
    >
      <Text
        size='micro'
        variant='label'
        tracking='group'
        component='span'
        className='font-bold uppercase'
      >
        {children}
      </Text>
      {action && <div className='ml-auto'>{action}</div>}
    </div>
  );
}
