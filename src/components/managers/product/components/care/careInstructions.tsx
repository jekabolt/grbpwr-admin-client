import { FC, useMemo, useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { CareMethodsList, CareSlotEmpty, CareSymbol } from './care-card';
import { CareSymbolView, SelectedInstructions } from './care-codes';
import { useCareVocabulary } from './use-care-vocabulary';

interface CareInstructionsProps {
  isCareTableOpen: boolean;
  close: () => void;
  onSelectCareInstruction: (symbol: CareSymbolView) => void;
  selectedInstructions: SelectedInstructions;
  // Raw prior value when it's legacy free-text that matched no known code (nothing shows as
  // selected below) — surfaced so the operator sees what their first pick is about to replace.
  legacyValue?: string;
}

/**
 * The care picker, on the app's one modal shell (phase 04) instead of the bespoke dialog it used to
 * carry — that one hard-coded `lg:h-[600px] lg:w-4/5`, which is exactly the ad-hoc modal sizing the
 * shell's `width` prop exists to end.
 *
 * Categories are CHIPS, not buttons. They are a filter over one list — the same grammar as the
 * card's chip filter bar — and rendering them as buttons made five equally-weighted "actions" out
 * of what is really one selected state.
 *
 * Above them is the TAG RAIL, which is the point of the dialog. A care tag is read as a set, so the
 * question being answered here is "is it complete", and a tabbed picker hides the answer by
 * construction: all but one category is always off-screen. The rail holds one slot per possible
 * pick — dashed and labelled while empty — so a missing symbol is a visible hole rather than
 * something you have to go looking for. Clicking a symbol on the rail removes it, which is the only
 * way to undo a pick without first navigating back to the tab it was made on.
 *
 * Everything the picker offers — the categories, their order, which of them nest — comes from the
 * backend dictionary, so a symbol added server-side appears here without a client release.
 */
export const CareInstructions: FC<CareInstructionsProps> = ({
  isCareTableOpen,
  selectedInstructions,
  close,
  onSelectCareInstruction,
  legacyValue,
}) => {
  const vocabulary = useCareVocabulary();
  const [selectedCare, setSelectedCare] = useState<string>('');

  // Which category is open is DERIVED rather than initialised, because the first category is only
  // knowable once the dictionary has loaded — which may be after this mounts. Falling back to the
  // first group keeps the tab from opening empty without pinning a category name in the client.
  const group = vocabulary.groups.find((g) => g.category === selectedCare) ?? vocabulary.groups[0];
  const activeCategory = group?.category ?? '';

  // How many picks each category holds — a nesting category counts its sub-categories, everything
  // else is one or nothing.
  const countByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const { category } of vocabulary.groups) {
      out[category] = Object.keys(selectedInstructions).filter(
        (k) => k === category || k.startsWith(`${category}-`),
      ).length;
    }
    return out;
  }, [vocabulary.groups, selectedInstructions]);

  const totalPicked = Object.values(selectedInstructions).filter(Boolean).length;

  return (
    <ConfirmationModal
      open={isCareTableOpen}
      onOpenChange={(o) => !o && close()}
      onConfirm={close}
      onCancel={close}
      title='care instructions'
      confirmLabel='done'
      cancelLabel='close'
      // A grid of 40 symbols is a browser, not a form.
      width='lg'
    >
      <div className='flex flex-col gap-2.5'>
        {legacyValue && (
          <CalloutBox tone='warning'>
            <Text size='micro'>
              currently stored as free text: “{legacyValue}” — picking a symbol below replaces it
            </Text>
          </CalloutBox>
        )}

        {!vocabulary.loaded ? (
          <CalloutBox tone='warning'>
            <Text size='micro'>
              the care vocabulary is not in this dictionary — nothing can be picked until the
              backend serves it
            </Text>
          </CalloutBox>
        ) : (
          <>
            {/* Sticky so the tag and the category set stay reachable while scrolling a long grid;
                the ink rule under it keeps them from floating over the tiles as they pass beneath. */}
            <div className='sticky top-0 z-10 -mx-2.5 space-y-2 border-b border-hairline bg-bgColor px-2.5 pb-2'>
              {/* The thing being assembled. Without it the dialog never shows its own output: you
                  pick across five tabs and can only verify the result by closing and reading the
                  field. */}
              <div className='flex items-center gap-2 border border-borderColor bg-bgZebra px-2 py-1'>
                <Text
                  component='span'
                  size='nano'
                  variant='label'
                  tracking='group'
                  className='w-12 shrink-0 uppercase'
                >
                  on the tag
                </Text>
                {/* items-stretch so an empty slot matches the height of a filled one — a gap has to
                    line up with its neighbours to read as a gap rather than as a smaller thing. */}
                <div className='flex flex-1 flex-wrap items-stretch gap-1.5'>
                  {vocabulary.slots.map((slot) => {
                    const code = selectedInstructions[slot.key];
                    const symbol = code ? vocabulary.byCode[code] : undefined;
                    return symbol ? (
                      <CareSymbol
                        key={slot.key}
                        code={code}
                        onRemove={() => onSelectCareInstruction(symbol)}
                      />
                    ) : (
                      <CareSlotEmpty key={slot.key} label={slot.label} name={slot.name} />
                    );
                  })}
                </div>
              </div>

              <ChipRow>
                {vocabulary.groups.map(({ category }) => {
                  const count = countByCategory[category] ?? 0;
                  return (
                    <Chip
                      key={category}
                      selected={activeCategory === category}
                      pressed={activeCategory === category}
                      onClick={() => setSelectedCare(category)}
                    >
                      {category}
                      {count > 0 && ` · ${count}`}
                    </Chip>
                  );
                })}
              </ChipRow>
            </div>

            {group && (
              <div className='flex flex-col gap-4'>
                <CareMethodsList
                  group={group}
                  selectedInstructions={selectedInstructions}
                  onSelect={onSelectCareInstruction}
                />
              </div>
            )}

            <Text size='micro' variant='label'>
              {totalPicked === 0
                ? 'nothing picked yet — one symbol per category; picking again in the same category replaces it'
                : `${totalPicked} of ${vocabulary.slots.length} picked · click a symbol on the tag above to remove it`}
            </Text>
          </>
        )}
      </div>
    </ConfirmationModal>
  );
};
