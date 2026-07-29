import { FC } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { cn } from 'lib/utility';
import { CARE_CODE_META } from './care-codes';

// One swatch footprint, shared by a filled symbol and an empty slot so a gap in the tag lines up
// with the picks around it instead of being a differently-sized hole.
const SWATCH = 'flex w-11 flex-col items-center justify-center gap-0.5 border p-1';

/**
 * One selected care symbol as it appears OUTSIDE the picker: on the field, on a colourway's
 * read-only display, and on the tag rail inside the modal. Shared so those can never drift — they
 * are the same token in three places.
 *
 * Both the picture and the code are shown: the code is what prints on the tag and what a spec is
 * checked against, the picture is what a person actually reads.
 */
export function CareSymbol({ code, onRemove }: { code: string; onRemove?: () => void }) {
  const meta = CARE_CODE_META[code];
  const label = meta?.name ?? code;
  const symbol = (
    <>
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
    </>
  );

  if (!onRemove) {
    return (
      <span title={label} className={cn(SWATCH, 'border-borderColor')}>
        {symbol}
      </span>
    );
  }
  return (
    <button
      type='button'
      title={`${label} — click to remove`}
      onClick={onRemove}
      className={cn(
        SWATCH,
        // hover: OUTSIDE the arbitrary variant — `[&_img]:hover:` would key off hovering the image
        // itself, so the swatch would only react over part of its own surface.
        'border-borderColor hover:border-error hover:[&_span]:text-error',
        // The symbol is artwork, not ink — dim it rather than trying to recolour it.
        'hover:[&_img]:opacity-40',
      )}
    >
      {symbol}
    </button>
  );
}

/**
 * A category with no pick yet, holding its place in the tag. Dashed because the outline is a
 * placeholder rather than a border, and labelled because "which one is missing" is the only thing
 * an empty slot has to say.
 */
export function CareSlotEmpty({ label, name }: { label: string; name: string }) {
  return (
    <span
      title={`no ${name} symbol picked`}
      className={cn(SWATCH, 'border-dashed border-borderColor')}
    >
      <Text component='span' size='nano' variant='label' className='text-center uppercase'>
        {label}
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
