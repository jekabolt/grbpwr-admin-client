import { FC, ReactNode } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';

/** Column header for the two-up verdict lists (stub `.col-h`): 11px uppercase, underlined;
 *  red when it flags a problem (losing margin / sold-out sizes). */
export const ColHead: FC<{ children: ReactNode; crit?: boolean }> = ({ children, crit }) => (
  <GroupLabel flush className={crit ? 'border-error' : undefined}>
    {children}
  </GroupLabel>
);

/** Small bordered action / amount pill (stub `.act`): green (good), red (crit), or ink (neutral). */
export const ActPill: FC<{ children: ReactNode; tone?: 'good' | 'crit' | 'neutral' }> = ({
  children,
  tone = 'neutral',
}) => {
  const cls = tone === 'good' ? 'ok' : tone === 'crit' ? 'warn' : 'ink';
  return (
    <Pill tone={cls} className='shrink-0 font-bold'>
      {children}
    </Pill>
  );
};

/** Tiny inline badge (stub `.pill`): gray, or red border+text when crit. */
export const MiniPill: FC<{ children: ReactNode; crit?: boolean }> = ({ children, crit }) => (
  <Pill tone={crit ? 'warn' : 'mut'} className='mr-1 inline-block'>
    {children}
  </Pill>
);

/** One verdict row (stub `ul.rows li`): bold 12px name, optional gray reason, right-aligned
 *  act pill. Wraps on narrow widths. */
export const VerdictRow: FC<{ name: ReactNode; why?: ReactNode; act?: ReactNode }> = ({
  name,
  why,
  act,
}) => (
  <li className='flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1 border-b border-hairline py-1.5 last:border-0'>
    <span className='min-w-0 flex-[1_1_40%] truncate text-textBaseSize font-bold'>{name}</span>
    {why != null && <span className='text-labelColor flex-[1_1_34%] text-textBaseSize'>{why}</span>}
    {act}
  </li>
);

/** Two-column verdict layout (stub `.two`). */
export const VerdictColumns: FC<{ children: ReactNode }> = ({ children }) => (
  <div className='grid gap-x-6 gap-y-3 md:grid-cols-2'>{children}</div>
);

/** Reset-styled `<ul>` for verdict rows. */
export const VerdictList: FC<{ children: ReactNode }> = ({ children }) => (
  <ul className='m-0 list-none p-0'>{children}</ul>
);
