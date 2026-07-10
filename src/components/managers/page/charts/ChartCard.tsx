import { FC, ReactNode } from 'react';
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
 * The shared bordered frame every dashboard chart sits in — extracted from the
 * `border border-textInactiveColor p-4` + uppercase title pattern that was
 * copy-pasted across ~12 chart components.
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
    <div
      className={`flex min-h-[280px] flex-col border border-textInactiveColor p-4 ${className ?? ''}`}
    >
      {(title || action) && (
        <div className='mb-1 flex items-start justify-between gap-2'>
          <div>
            {title && (
              <Text variant='uppercase' className='block font-bold'>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text className='mt-0.5 block text-[10px] text-labelColor'>{subtitle}</Text>
            )}
          </div>
          {action}
        </div>
      )}
      {warning && (
        <Text className='mb-3 block text-[10px] text-warning' title={warning}>
          ⚠ {warning}
        </Text>
      )}
      {emptyMessage ? (
        <div className='flex flex-1 items-center justify-center'>
          <Text className='text-[11px] text-labelColor'>{emptyMessage}</Text>
        </div>
      ) : (
        <div className='min-h-0 flex-1'>{children}</div>
      )}
    </div>
  );
};
