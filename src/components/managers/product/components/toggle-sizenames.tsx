import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { MeasurementsToggleState } from '../utility/useSizeMeasurementsToggle';

export function ToggleSizeNames({
  subCategoryName,
  typeName,
  measurementsNames,
  onToggleChange,
}: {
  subCategoryName?: string;
  typeName?: string;
  measurementsNames: MeasurementsToggleState;
  onToggleChange: (type: 'bottoms' | 'tailored', checked: boolean) => void;
}) {
  const tailored =
    subCategoryName?.toLowerCase() === 'vests' ||
    typeName?.toLowerCase() === 'blazer' ||
    subCategoryName?.toLowerCase() === 'shirts';

  const bottoms =
    subCategoryName?.toLowerCase() === 'pants' ||
    subCategoryName?.toLowerCase() === 'shorts' ||
    subCategoryName?.toLowerCase() === 'skirts';

  const shouldShowToggle = tailored || bottoms;

  return (
    <div
      className={cn('flex items-center justify-center gap-2', {
        'justify-start': shouldShowToggle,
      })}
    >
      <Text variant='uppercase' className='leading-none'>
        size names
      </Text>
      {shouldShowToggle && (
        <>
          {(bottoms ? measurementsNames.bottoms : measurementsNames.tailored) && (
            <Text variant='uppercase'>{`| ${bottoms ? 'bottoms' : 'tailored'}`}</Text>
          )}
          <ToggleSwitch
            checked={bottoms ? measurementsNames.bottoms : measurementsNames.tailored}
            onCheckedChange={(checked) => onToggleChange(bottoms ? 'bottoms' : 'tailored', checked)}
          />
        </>
      )}
    </div>
  );
}
