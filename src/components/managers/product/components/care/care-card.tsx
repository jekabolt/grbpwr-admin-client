import { FC } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { CARE_CODE_META } from './care-codes';

/**
 * One selected care symbol as it appears OUTSIDE the picker: on the field, and on a colourway's
 * read-only display. Shared so those two can never drift — they are the same token in two places.
 *
 * Both the picture and the code are shown: the code is what prints on the tag and what a spec is
 * checked against, the picture is what a person actually reads.
 */
export function CareSymbol({ code }: { code: string }) {
  const meta = CARE_CODE_META[code];
  return (
    <span
      title={meta?.name ?? code}
      className='flex w-11 flex-col items-center gap-0.5 border border-borderColor p-1'
    >
      {meta?.img ? (
        <img src={meta.img} alt={meta.name} className='size-6' />
      ) : (
        // A code with no symbol is real data — from before the symbol set, or a code retired since.
        // Show it rather than dropping it silently.
        <span className='flex size-6 items-center justify-center text-nano'>?</span>
      )}
      <Text component='span' size='nano' variant='label' className='truncate uppercase'>
        {code}
      </Text>
    </span>
  );
}

interface CareCardProps {
  method: string;
  code: string;
  img: string;
  isSelected: boolean;
  selectedCare: string;
  subCategory?: string;
  onSelectCareInstruction: (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => void;
}

/**
 * One laundry symbol as a picked-by-looking-at-it tile (phase 03's `Tile`, the same primitive the
 * material swatches and the aux-card picker use).
 *
 * The name and the CODE are both always shown. The old card swapped one for the other on selection,
 * so reading back what you had picked meant deselecting it — and the code is the thing that ends up
 * on the tag, so hiding it until selection had it backwards.
 */
export const CareCard: FC<CareCardProps> = ({
  method,
  code,
  img,
  isSelected,
  onSelectCareInstruction,
  selectedCare,
  subCategory,
}) => (
  <Tile
    selected={isSelected}
    onClick={() => onSelectCareInstruction(selectedCare, method, code, subCategory)}
    media={
      <div className='bg-bgZebra p-1'>
        <Media src={img} alt={method} aspectRatio='1/1' fit='contain' />
      </div>
    }
    name={method}
    sub={code}
    className={isSelected ? 'bg-bgZebra' : undefined}
  />
);

interface CareMethodsListProps {
  methods: Record<string, unknown>;
  selectedCare: string;
  selectedInstructions: Record<string, string>;
  subCategory?: string;
  onSelectCareInstruction: (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => void;
}

/**
 * A category's symbols. Flat categories render as one grid; Professional Care nests one level
 * (dry / wet), and each sub-category gets its own labelled grid because a pick there is scoped to
 * the sub-category, not to the category.
 */
export const CareMethodsList: FC<CareMethodsListProps> = ({
  methods,
  selectedCare,
  selectedInstructions,
  subCategory,
  onSelectCareInstruction,
}) => {
  const entries = Object.entries(methods).filter(
    ([, v]) => typeof v === 'object' && v !== null,
  ) as Array<[string, Record<string, unknown>]>;

  const leaves = entries.filter(([, v]) => 'code' in v || 'img' in v);
  const groups = entries.filter(([, v]) => !('code' in v) && !('img' in v));

  return (
    <>
      {leaves.length > 0 && (
        <Tiles min={104}>
          {leaves.map(([method, v]) => {
            const { code, img } = v as unknown as { code: string; img: string };
            const selectionKey = subCategory ? `${selectedCare}-${subCategory}` : selectedCare;
            return (
              <CareCard
                key={`${method}-${code}`}
                method={method}
                code={code}
                img={img}
                isSelected={selectedInstructions[selectionKey] === code}
                selectedCare={selectedCare}
                subCategory={subCategory}
                onSelectCareInstruction={onSelectCareInstruction}
              />
            );
          })}
        </Tiles>
      )}
      {groups.map(([group, sub]) => (
        <div key={`subcategory-${group}`} className='flex flex-col gap-1.5'>
          <GroupLabel>{group}</GroupLabel>
          <CareMethodsList
            methods={sub}
            selectedCare={selectedCare}
            selectedInstructions={selectedInstructions}
            subCategory={group}
            onSelectCareInstruction={onSelectCareInstruction}
          />
        </div>
      ))}
    </>
  );
};
