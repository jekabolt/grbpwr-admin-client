import { FC, ReactNode } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

interface ChartCardProps {
  title?: string;
  /** Optional caption under the title (e.g. axis meaning). */
  subtitle?: string;
  /** Warning banner shown above the plot (e.g. unreliable backend values). */
  warning?: string;
  /** Right-aligned header slot (e.g. a download button). */
  action?: ReactNode;
  /** When set, renders this centered instead of children (empty/loading state). */
  emptyMessage?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Chart sub-structure inside a dashboard block. The owning analytics section supplies the
 * block surface; chart titles use the next rung in the shared rule ladder.
 */
export const ChartCard: FC<ChartCardProps> = ({
  title,
  subtitle,
  warning,
  action,
  emptyMessage,
  className,
  children,
}) => {
  return (
    <div className={`flex min-h-[280px] flex-col ${className ?? ''}`}>
      {(title || action) && (
        <GroupLabel flush action={action}>
          {title}
        </GroupLabel>
      )}
      {subtitle && (
        <Text size='micro' variant='label' className='mb-1 block'>
          {subtitle}
        </Text>
      )}
      {warning && (
        <Text size='micro' className='mb-3 block text-warning' title={warning}>
          ⚠ {warning}
        </Text>
      )}
      {emptyMessage ? (
        <div className='flex flex-1 items-center justify-center'>
          <Text size='small' variant='label'>
            {emptyMessage}
          </Text>
        </div>
      ) : (
        <div className='min-h-0 flex-1'>{children}</div>
      )}
    </div>
  );
};
