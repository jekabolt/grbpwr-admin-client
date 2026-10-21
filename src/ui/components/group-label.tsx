import { cn } from 'lib/utility';
import Text from './text';

/**
 * A lightweight sub-group divider inside a section — one step below `SectionHeader`.
 * 10px uppercase grey over a hairline-weight rule.
 */
export function GroupLabel({
  children,
  lead,
  action,
  flush,
  swatch,
  rule = 'below',
  plain,
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
  /** Visual identity that sits before the one-line label. */
  swatch?: React.ReactNode;
  /** Put the group rule above in ink, or retain the default grey rule below. */
  rule?: 'below' | 'above';
  /** Body-size ink label; children may supply their own emphasis and secondary tone. */
  plain?: boolean;
  className?: string;
}) {
  return (
    <div
      // A total right under a label draws no rule of its own — the label's rule stands there
      // (`Row`, O-48 review); this mark is how it knows.
      data-group-label=''
      className={cn(
        'flex gap-2',
        swatch ? 'items-center' : 'items-baseline',
        rule === 'above'
          ? 'border-t border-textColor py-2'
          : 'mb-1 border-b border-borderColor pb-0.5',
        flush ? 'mt-0' : 'mt-3',
        className,
      )}
    >
      {swatch ? <span className='flex shrink-0 items-center'>{swatch}</span> : null}
      <Text
        size={plain ? 'default' : 'micro'}
        variant={plain ? 'default' : 'label'}
        tracking={plain ? 'none' : 'group'}
        component='span'
        className={cn(
          !plain && 'font-bold uppercase',
          swatch && 'min-w-0 truncate whitespace-nowrap',
        )}
      >
        {children}
      </Text>
      {/* БЕЗ `self-center`. Ряд выровнен по базовой линии, и орган с рамкой встаёт в неё сам:
          у него тот же кегль, а рамка с отступом симметричны, поэтому его текст садится ровно на
          линию подписи. Центрирование ЕГО ОДНОГО в ряду, наоборот, опускало текст на 2px — «текст
          и тоггл на разной высоте, выглядит криво» (замерено: Range по текстовым узлам, вариант с
          `self-center` даёт +2px, без него 0px, высота ряда одинаковая). */}
      {lead && <div>{lead}</div>}
      {action && <div className='ml-auto'>{action}</div>}
    </div>
  );
}
