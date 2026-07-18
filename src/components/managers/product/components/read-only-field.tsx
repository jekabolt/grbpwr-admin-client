import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { ReactNode } from 'react';
import { generatePath, Link } from 'react-router-dom';
import Text from 'ui/components/text';

// A clean read-only DISPLAY for a DERIVED / non-editable fact (brand, category, season, composition,
// care…). Deliberately styled UNLIKE an editable input — a small label over plain text/chips, no
// border, no chevron — so an operator never mistakes a frozen style fact for something they can edit
// on this screen. Root cause of the "readOnly input looks editable" confusion (M1).
export function ReadOnlyField({
  label,
  value,
  placeholder = '—',
  children,
  className,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  const hasValue = children != null || (value != null && value !== '');
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <Text variant='label' size='small' component='span'>
        {label}
      </Text>
      {children != null ? (
        children
      ) : (
        <Text size='small' className={hasValue ? undefined : 'text-textInactiveColor'}>
          {hasValue ? value : placeholder}
        </Text>
      )}
    </div>
  );
}

// A read-only chip — for a single derived value that reads better as a tile than a text row.
export function ReadOnlyChip({ children }: { children: ReactNode }) {
  return (
    <span className='inline-flex items-center border border-textInactiveColor px-2 py-0.5'>
      <Text size='small' variant='uppercase' component='span'>
        {children}
      </Text>
    </span>
  );
}

// Turns the old dead "edit them on the tech card" hints into a real navigation target — the owning
// style IS a tech card (same pattern <ProductCostSection/> uses for the cost-source card).
export function TechCardLink({
  styleId,
  label,
  className,
}: {
  styleId?: number;
  label?: string;
  className?: string;
}) {
  if (!styleId) return null;
  return (
    <Link
      to={generatePath(ROUTES.singleTechCard, { id: String(styleId) })}
      className={cn('underline underline-offset-2 hover:opacity-70', className)}
    >
      <Text variant='inactive' size='small' component='span'>
        {label ?? `edit on tech card (style #${styleId})`} ↗
      </Text>
    </Link>
  );
}
