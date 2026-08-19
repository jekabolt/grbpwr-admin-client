import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * A lightweight sub-group divider inside a section — one step below `SectionHeader`.
 * 10px uppercase grey over a hairline-weight rule.
 */
export function GroupLabel({
  children,
  lead,
  action,
  flush,
  className,
}: {
  children: React.ReactNode;
  /**
   * A control that belongs to the title itself — a view switch, a unit toggle. Sits right after
   * the label, anchored to the LEFT edge, so its position does not depend on how wide the group
   * happens to be in the current layout. `action` is the right-edge slot; a control that has to
   * stay put across layout changes belongs here instead.
   */
  lead?: React.ReactNode;
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
      {/* Ряд выровнен по базовой линии текста — органу с рамкой это не подходит: он выше подписи и
          свесился бы под линейку группы. `self-center` центрирует ровно его, не трогая остальные
          места, где `action` — это текст. */}
      {lead && <div className='self-center'>{lead}</div>}
      {action && <div className='ml-auto'>{action}</div>}
    </div>
  );
}
