import { composition } from 'constants/garment-composition';
import Text from 'ui/components/text';
import { MaterialRow } from './material-row';

interface MaterialsListProps {
  compositionGarment: [string, string][];
  selectedPart: string;
  isSelected: (materialKey: string) => boolean;
  getPercentageForMaterial: (materialKey: string) => number;
  onToggleMaterial: (materialKey: string, materialCode: string) => void;
  onPercentageChange: (materialKey: string, value: string) => void;
  totalPercentage: number;
}

export function MaterialsList({
  compositionGarment,
  selectedPart,
  isSelected,
  getPercentageForMaterial,
  onToggleMaterial,
  onPercentageChange,
  totalPercentage,
}: MaterialsListProps) {
  const partLabel =
    composition.garment_parts[selectedPart as keyof typeof composition.garment_parts];

  return (
    <div>
      <div className='flex justify-between items-center'>
        <Text variant='uppercase'>
          Materials for {partLabel} (Total: {totalPercentage}%)
        </Text>
        <Text variant='inactive' className='uppercase'>
          Click materials to select/deselect, then set percentages
        </Text>
      </div>
      <div className='grid lg:grid-cols-4 grid-cols-1 gap-2 overflow-y-auto'>
        {compositionGarment.map(([key, value]) => (
          <MaterialRow
            key={key}
            materialKey={key}
            materialCode={value}
            isSelected={isSelected(key)}
            percentage={getPercentageForMaterial(key)}
            onToggle={() => onToggleMaterial(key, value)}
            onPercentageChange={(val) => onPercentageChange(key, val)}
          />
        ))}
      </div>
    </div>
  );
}
