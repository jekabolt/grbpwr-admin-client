import { AccessLevel, AdminPermission, AdminSectionInfo } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ACCESS } from '../utils/hooks';

const LEVELS: { label: string; value: AccessLevel }[] = [
  { label: 'none', value: ACCESS.NONE },
  { label: 'read', value: ACCESS.READ },
  { label: 'write', value: ACCESS.WRITE },
];

// Connected 3-segment control. Active segment is the inverse fill (brutalist
// monochrome "selected"); inactive segments use labelColor (AA) not the decorative
// inactive gray.
function AccessControl({
  value,
  onChange,
  disabled,
}: {
  value: AccessLevel;
  onChange: (v: AccessLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role='group'
      aria-label='access level'
      className='flex shrink-0 border border-textInactiveColor'
    >
      {LEVELS.map((lvl, i) => {
        const active = value === lvl.value;
        return (
          <button
            key={lvl.value}
            type='button'
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(lvl.value)}
            className={cn(
              'px-3 py-1 text-textBaseSize uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed',
              i > 0 && 'border-l border-textInactiveColor',
              active
                ? 'bg-textColor text-bgColor'
                : 'bg-bgColor text-labelColor hover:bg-textInactiveColor hover:text-textColor',
            )}
          >
            {lvl.label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  sections: AdminSectionInfo[];
  value: AdminPermission[];
  onChange: (next: AdminPermission[]) => void;
  disabled?: boolean;
  loading?: boolean;
}

// Grid of grantable sections × access level. Emits a clean AdminPermission[] carrying
// only the sections with read or write access (none = omitted).
export function PermissionPicker({ sections, value, onChange, disabled, loading }: Props) {
  const levelFor = (key: string): AccessLevel =>
    value.find((p) => p.section === key)?.access ?? ACCESS.NONE;

  const setLevel = (key: string, level: AccessLevel) => {
    const rest = value.filter((p) => p.section !== key);
    onChange(level === ACCESS.NONE ? rest : [...rest, { section: key, access: level }]);
  };

  const setAll = (level: AccessLevel) =>
    onChange(
      level === ACCESS.NONE
        ? []
        : sections.filter((s) => s.key).map((s) => ({ section: s.key as string, access: level })),
    );

  const grantedCount = value.filter((p) => p.access && p.access !== ACCESS.NONE).length;

  if (loading) {
    return (
      <div className='border border-textInactiveColor'>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-12 animate-pulse bg-textInactiveColor/40',
              i > 0 && 'border-t border-textInactiveColor',
            )}
          />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className='border border-textInactiveColor p-4'>
        <Text variant='label' size='small'>
          no grantable sections
        </Text>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', disabled && 'pointer-events-none opacity-40')}>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1'>
        <Text variant='uppercase' size='small'>
          sections{grantedCount > 0 && ` · ${grantedCount} granted`}
        </Text>
        <div className='flex items-center gap-2'>
          <Text variant='label' size='small'>
            set all
          </Text>
          {LEVELS.map((lvl) => (
            <Button
              key={lvl.value}
              type='button'
              variant='underline'
              className='text-small uppercase'
              onClick={() => setAll(lvl.value)}
              disabled={disabled}
            >
              {lvl.label}
            </Button>
          ))}
        </div>
      </div>

      <div className='border border-textInactiveColor'>
        {sections.map((s, i) => {
          const key = s.key ?? '';
          const current = levelFor(key);
          const granted = current !== ACCESS.NONE;
          return (
            <div
              key={key}
              className={cn(
                'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3',
                i > 0 && 'border-t border-textInactiveColor',
                granted && 'bg-textInactiveColor/20',
              )}
            >
              <div className='min-w-0 flex-1'>
                <Text size='small' className='uppercase'>
                  {s.title || key}
                </Text>
                {s.description && (
                  <Text variant='label' size='small'>
                    {s.description}
                  </Text>
                )}
              </div>
              <AccessControl
                value={current}
                onChange={(lvl) => setLevel(key, lvl)}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
