import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

interface MaterialsListProps {
  compositionGarment: [string, string][];
  isSelected: (materialKey: string) => boolean;
  onToggleMaterial: (materialKey: string, materialCode: string) => void;
}

// The fibre catalog for the currently browsed category, as toggle chips. Picking one adds a 0% row
// to the selected part above; picking it again removes it. A scroll box rather than a grid of cards
// so the dialog stays a narrow column no matter how long the category is.
export function MaterialsList({
  compositionGarment,
  isSelected,
  onToggleMaterial,
}: MaterialsListProps) {
  if (compositionGarment.length === 0) {
    return (
      <Text variant='label' size='micro'>
        no fibres in this category
      </Text>
    );
  }
  return (
    <div className='max-h-40 overflow-y-auto border border-borderColor p-1.5'>
      <ChipRow>
        {compositionGarment.map(([key, code]) => (
          <Chip
            key={key}
            selected={isSelected(key)}
            pressed={isSelected(key)}
            title={code}
            onClick={() => onToggleMaterial(key, code)}
          >
            {key}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}
