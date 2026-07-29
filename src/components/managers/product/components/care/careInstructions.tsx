import { FC, useMemo, useState } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { CareMethodsList } from './care-card';
import { careInstruction } from './careInstruction';

interface SelectedInstructions {
  [category: string]: string;
}

interface CareInstructionsProps {
  isCareTableOpen: boolean;
  close: () => void;
  onSelectCareInstruction: (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => void;
  selectedInstructions: SelectedInstructions;
  // Raw prior value when it's legacy free-text that matched no known code (nothing shows as
  // selected below) — surfaced so the operator sees what their first pick is about to replace.
  legacyValue?: string;
}

// Whether a category's methods are nested one level deeper (Professional Care → dry / wet), which
// is the only thing that changes the body layout.
function isNested(methods: Record<string, unknown>): boolean {
  const first = Object.values(methods)[0];
  return !!first && typeof first === 'object' && !('code' in (first as object));
}

/**
 * The care picker, on the app's one modal shell (phase 04) instead of the bespoke dialog it used to
 * carry — that one hard-coded `lg:h-[600px] lg:w-4/5`, which is exactly the ad-hoc modal sizing the
 * shell's `width` prop exists to end.
 *
 * Categories are CHIPS, not buttons. They are a filter over one list — the same grammar as the
 * card's chip filter bar — and rendering them as buttons made six equally-weighted "actions" out of
 * what is really one selected state. The count on each chip is load-bearing: a care tag is read as
 * a set, so "which of the six have I answered" is the question this dialog exists to answer, and it
 * used to be invisible until you clicked through every tab.
 *
 * Selection is per category (picking a second wash symbol replaces the first), so the chip count is
 * always 0 or 1 outside Professional Care, which has one per sub-category.
 */
export const CareInstructions: FC<CareInstructionsProps> = ({
  isCareTableOpen,
  selectedInstructions,
  close,
  onSelectCareInstruction,
  legacyValue,
}) => {
  const careCategories = Object.keys(careInstruction.care_instructions);
  const [selectedCare, setSelectedCare] = useState<string>('Washing');

  const methods = careInstruction.care_instructions[
    selectedCare as keyof typeof careInstruction.care_instructions
  ] as Record<string, unknown>;
  const nested = isNested(methods);

  // How many picks each category holds — Professional Care counts its sub-categories, everything
  // else is one or nothing.
  const countByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const category of careCategories) {
      out[category] = Object.keys(selectedInstructions).filter(
        (k) => k === category || k.startsWith(`${category}-`),
      ).length;
    }
    return out;
  }, [careCategories, selectedInstructions]);

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

        {/* Sticky so the category set stays reachable while scrolling a long grid; the ink rule
            under it keeps the chips from floating over the tiles as they pass beneath. */}
        <div className='sticky top-0 z-10 -mx-2.5 border-b border-hairline bg-bgColor px-2.5 pb-2'>
          <ChipRow>
            {careCategories.map((category) => {
              const count = countByCategory[category] ?? 0;
              return (
                <Chip
                  key={category}
                  selected={selectedCare === category}
                  pressed={selectedCare === category}
                  onClick={() => setSelectedCare(category)}
                >
                  {category}
                  {count > 0 && ` · ${count}`}
                </Chip>
              );
            })}
          </ChipRow>
        </div>

        <div className={nested ? 'flex flex-col gap-4' : ''}>
          <CareMethodsList
            methods={methods}
            selectedCare={selectedCare}
            selectedInstructions={selectedInstructions}
            onSelectCareInstruction={onSelectCareInstruction}
          />
        </div>

        <Text size='micro' variant='label'>
          {totalPicked === 0
            ? 'nothing picked yet — one symbol per category; picking again in the same category replaces it'
            : `${totalPicked} symbol${totalPicked === 1 ? '' : 's'} on the tag · click a selected one to remove it`}
        </Text>
      </div>
    </ConfirmationModal>
  );
};
