// Селектор группы (скоупа ткани) — крупные пилюли под палец. Показывается только когда групп
// больше одной; преселект из ?g деградирует в первую группу молча (см. page.tsx).
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { bomPurposeLabel } from 'components/managers/tech-card/components/bom-purpose-labels';
import type { PvGroup } from './manifest';

// Ключ группы приходит в СЕРВЕРНОМ написании (строчный суффикс энума: «main»), а словарь
// подписей заведён по имени proto-энума. Конвенция «энум = префикс + верхний регистр значения»
// уже закреплена в pattern-size-index.ts (wireFabricPurpose — та же операция в обратную
// сторону); незнакомое назначение bomPurposeLabel вернёт как есть, без падения в ключи.
const PURPOSE_PREFIX = 'TECH_CARD_BOM_PURPOSE_';

export function groupLabel(g: PvGroup): string {
  const key = (g.key ?? '').trim();
  if (key === '_unbound') return 'unbound sheets';
  if (g.by_purpose) return bomPurposeLabel(`${PURPOSE_PREFIX}${key.toUpperCase()}`);
  return (g.line_name ?? '').trim() || 'BOM line';
}

export function GroupSelect({
  groups,
  activeKey,
  onSelect,
}: {
  groups: PvGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  if (groups.length < 2) return null;
  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p' className='uppercase' tracking='label'>
        pattern
      </Text>
      <div className='flex flex-wrap gap-1.5'>
        {groups.map((g, i) => {
          const key = g.key ?? String(i);
          return (
            <Button
              key={key}
              type='button'
              variant={key === activeKey ? 'main' : 'secondary'}
              size='lg'
              className='min-h-11'
              onClick={() => onSelect(key)}
            >
              {groupLabel(g)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
