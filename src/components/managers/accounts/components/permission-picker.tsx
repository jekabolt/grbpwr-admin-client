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

interface Props {
  sections: AdminSectionInfo[];
  value: AdminPermission[];
  onChange: (next: AdminPermission[]) => void;
  disabled?: boolean;
  loading?: boolean;
}

// Grid of grantable sections × access level. Emits a clean AdminPermission[] with only
// the sections that carry read or write access (none = omitted).
export function PermissionPicker({ sections, value, onChange, disabled, loading }: Props) {
  const levelFor = (key: string): AccessLevel =>
    value.find((p) => p.section === key)?.access ?? ACCESS.NONE;

  const setLevel = (key: string, level: AccessLevel) => {
    const rest = value.filter((p) => p.section !== key);
    onChange(level === ACCESS.NONE ? rest : [...rest, { section: key, access: level }]);
  };

  const setAll = (level: AccessLevel) => {
    onChange(
      level === ACCESS.NONE
        ? []
        : sections.filter((s) => s.key).map((s) => ({ section: s.key as string, access: level })),
    );
  };

  if (loading) {
    return (
      <Text variant='inactive' size='small'>
        loading sections…
      </Text>
    );
  }

  if (sections.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        no grantable sections
      </Text>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', disabled && 'pointer-events-none opacity-40')}>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='inactive' size='small'>
          per-section access
        </Text>
        <div className='flex items-center gap-2'>
          <Text variant='inactive' size='small'>
            set all:
          </Text>
          {LEVELS.map((lvl) => (
            <Button
              key={lvl.value}
              type='button'
              variant='underline'
              onClick={() => setAll(lvl.value)}
              disabled={disabled}
            >
              {lvl.label}
            </Button>
          ))}
        </div>
      </div>

      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-9'>
            <tr>
              <th className='border border-textColor px-2 text-left'>
                <Text variant='uppercase' size='small'>
                  section
                </Text>
              </th>
              <th className='border border-textColor px-2'>
                <Text variant='uppercase' size='small'>
                  access
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const key = s.key ?? '';
              const current = levelFor(key);
              return (
                <tr key={key} className='border-b border-textColor last:border-b-0'>
                  <td className='border border-textColor px-2 py-1.5 align-top'>
                    <Text size='small'>{s.title || key}</Text>
                    {s.description && (
                      <Text variant='inactive' size='small'>
                        {s.description}
                      </Text>
                    )}
                  </td>
                  <td className='border border-textColor px-2 py-1.5'>
                    <div className='flex items-center gap-0.5'>
                      {LEVELS.map((lvl) => {
                        const active = current === lvl.value;
                        return (
                          <button
                            key={lvl.value}
                            type='button'
                            disabled={disabled}
                            onClick={() => setLevel(key, lvl.value)}
                            className={cn(
                              'border border-textColor px-2 py-0.5 text-small uppercase cursor-pointer',
                              active
                                ? 'bg-textColor text-bgColor'
                                : 'bg-bgColor text-textColor hover:bg-textInactiveColor',
                              'disabled:cursor-not-allowed',
                            )}
                          >
                            {lvl.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
