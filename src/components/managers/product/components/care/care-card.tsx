import { FC } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { cn } from 'lib/utility';
import { CareGroup, CareSymbolView } from './care-codes';
import { useCareVocabulary } from './use-care-vocabulary';

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
  const vocabulary = useCareVocabulary();
  const meta = vocabulary.byCode[code];
  const label = meta?.name ?? code;
  const symbol = (
    <>
      {meta?.img ? (
        <img src={meta.img} alt={meta.name} className='size-6' />
      ) : (
        // A code with no symbol is real data — from before the symbol set, a code retired since, or
        // simply the dictionary not loaded yet. Show it rather than dropping it silently.
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
  symbol: CareSymbolView;
  isSelected: boolean;
  onSelect: (symbol: CareSymbolView) => void;
}

/**
 * One laundry symbol as a picked-by-looking-at-it tile (phase 03's `Tile`, the same primitive the
 * material swatches and the aux-card picker use).
 *
 * The name and the CODE are both always shown. The old card swapped one for the other on selection,
 * so reading back what you had picked meant deselecting it — and the code is the thing that ends up
 * on the tag, so hiding it until selection had it backwards.
 */
export const CareCard: FC<CareCardProps> = ({ symbol, isSelected, onSelect }) => (
  <Tile
    selected={isSelected}
    onClick={() => onSelect(symbol)}
    media={
      <div className='bg-bgZebra p-1'>
        {symbol.img ? (
          <Media src={symbol.img} alt={symbol.name} aspectRatio='1/1' fit='contain' />
        ) : (
          // The dictionary offers a code this build has no drawing for. Offering it anyway beats
          // hiding a valid pick, so the tile falls back to its code.
          <div className='flex aspect-square items-center justify-center'>
            <Text size='micro' variant='label' component='span'>
              {symbol.code}
            </Text>
          </div>
        )}
      </div>
    }
    name={symbol.name}
    sub={symbol.code}
    className={isSelected ? 'bg-bgZebra' : undefined}
  />
);

interface CareMethodsListProps {
  group: CareGroup;
  selectedInstructions: Record<string, string>;
  onSelect: (symbol: CareSymbolView) => void;
}

/**
 * One category's symbols. A flat category renders as a single grid; a nesting one (Professional
 * Care → dry / wet) gets a labelled grid per sub-category, because a pick there is scoped to the
 * sub-category rather than to the category.
 */
export const CareMethodsList: FC<CareMethodsListProps> = ({
  group,
  selectedInstructions,
  onSelect,
}) => (
  <>
    {group.sections.map((section) => {
      const selectionKey = section.subCategory
        ? `${group.category}-${section.subCategory}`
        : group.category;
      const grid = (
        <Tiles min={104}>
          {section.symbols.map((symbol) => (
            <CareCard
              key={symbol.code}
              symbol={symbol}
              isSelected={selectedInstructions[selectionKey] === symbol.code}
              onSelect={onSelect}
            />
          ))}
        </Tiles>
      );
      if (!section.subCategory) return <div key={selectionKey}>{grid}</div>;
      return (
        <div key={selectionKey} className='flex flex-col gap-1.5'>
          <GroupLabel>{section.subCategory}</GroupLabel>
          {grid}
        </div>
      );
    })}
  </>
);
