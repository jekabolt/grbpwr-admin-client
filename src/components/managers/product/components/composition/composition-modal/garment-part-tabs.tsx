import { composition, CompositionStructure } from 'constants/garment-composition';
import { Chip, ChipRow } from 'ui/components/chip';
import { getPartTotal } from './utils';

interface GarmentPartTabsProps {
  selectedPart: string;
  localComposition: CompositionStructure;
  onPartChange: (part: string) => void;
  onRemovePart: (part: string) => void;
}

// Garment parts as toggle chips rather than a scrolling tab rail — eight of them fit a narrow
// dialog when they wrap, and the running total rides along on each chip. That matters because SAVE
// is gated on EVERY part summing to 100: without the per-chip total, a modal blocked by a broken
// `lining` while you are looking at `body` is unexplainable.
export function GarmentPartTabs({
  selectedPart,
  localComposition,
  onPartChange,
  onRemovePart,
}: GarmentPartTabsProps) {
  const garmentParts = Object.keys(composition.garment_parts);

  // Keys the stored composition carries that `garment_parts` has no tab for — `fibre` from a material
  // snapshot, or a part retired from the dictionary. They are not decoration: such a part still
  // counts toward the save gate and still prints on the care label, so without a chip of its own it
  // is data the operator can neither see nor delete. `selectedPart` is kept in the list even once its
  // last fibre is gone, so the chip you are standing on does not vanish under you.
  const extraParts = [...new Set([...Object.keys(localComposition), selectedPart])].filter(
    (part) => !garmentParts.includes(part),
  );

  return (
    <ChipRow>
      {[...garmentParts, ...extraParts].map((part) => {
        const items = localComposition[part as keyof CompositionStructure];
        const filled = !!items && items.length > 0;
        const total = getPartTotal(items);
        const label =
          composition.garment_parts[part as keyof typeof composition.garment_parts] ?? part;
        return (
          <Chip
            key={part}
            selected={selectedPart === part}
            pressed={selectedPart === part}
            tone={filled && total !== 100 ? 'error' : 'default'}
            onClick={() => onPartChange(part)}
            onRemove={filled ? () => onRemovePart(part) : undefined}
          >
            {filled ? `${label} ${total}%` : label}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
