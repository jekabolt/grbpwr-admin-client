import { cn } from 'lib/utility';
import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';

const OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'all' },
  { value: 'active', label: 'active' },
  { value: 'hidden', label: 'hidden' },
  { value: 'archived', label: 'archived' },
];

// One explicit lifecycle filter (all / active / hidden / archived) replacing the two overlapping
// checkboxes ("show drafts & hidden" + "archived only") that made the state model hard to read. Drives
// a single `status` URL param; getProductPagedParans maps it to the backend `statuses` set (and still
// honours the legacy hidden/archived params for old links).
export default function StatusFilter() {
  const [searchParams, setSearchParams] = useSearchParams();

  const current =
    searchParams.get('status') ||
    (searchParams.get('archived') === 'true'
      ? 'archived'
      : searchParams.get('hidden') === 'false'
        ? 'active'
        : '');

  const select = (value: string) => {
    const next = new URLSearchParams(searchParams);
    // Single source of truth: set `status`, retire the legacy toggles.
    next.delete('hidden');
    next.delete('archived');
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className='space-y-2'>
      <Text variant='uppercase'>status</Text>
      <div className='flex w-full border border-textColor'>
        {OPTIONS.map((opt, idx) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value || 'all'}
              type='button'
              aria-pressed={active}
              onClick={() => select(opt.value)}
              className={cn(
                'flex-1 px-2 py-1.5 text-small uppercase transition-colors cursor-pointer',
                idx > 0 && 'border-l border-textColor',
                active
                  ? 'bg-textColor text-bgColor'
                  : 'bg-bgColor text-textColor hover:bg-textColor hover:text-bgColor',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
