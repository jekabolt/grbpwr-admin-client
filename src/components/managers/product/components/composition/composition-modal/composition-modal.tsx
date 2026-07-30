import { CompositionStructure } from 'constants/garment-composition';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { CompositionSummary } from './composition-summary';
import { FibreRow } from './material-row';
import { GarmentPartTabs } from './garment-part-tabs';
import { MaterialCategorySelector } from './material-category-selector';
import { MaterialsList } from './materials-list';
import { useCompositionForm } from './use-composition-form';
import { hasInvalidParts } from './utils';

interface CompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedComposition: CompositionStructure;
  selectComposition: (composition: CompositionStructure) => void;
}

// The fibre-content dialog: pick a garment part, add fibres to it, split them to 100%. On the shared
// modal shell at `sm` — it is a narrow column of rows, not a browser. The live total gates SAVE:
// a part that has fibres must sum to exactly 100 before the dialog will let go.
//
// The dialog is TRANSACTIONAL, and the mount boundary is what makes it so: the draft lives in the
// body below, which exists only while the dialog is open. So it is seeded from the stored value on
// every opening and thrown away on close, and `selectComposition` is called exactly once, from the
// confirm handler the total already gates. Writing through on every keystroke instead meant the
// disabled save button gated nothing — `close`, ✕, Esc and the overlay all left a half-typed blend
// (a 60%-only body) in the field, where the care label and the storefront then read it.
export function CompositionModal({ isOpen, ...props }: CompositionModalProps) {
  if (!isOpen) return null;
  return <CompositionDialog {...props} />;
}

function CompositionDialog({
  selectedComposition,
  onClose,
  selectComposition,
}: Omit<CompositionModalProps, 'isOpen'>) {
  const {
    selectedCategory,
    selectedPart,
    localComposition,
    compositionGarment,
    currentPartItems,
    totalPercentage,
    setSelectedCategory,
    setSelectedPart,
    isSelected,
    handlePercentageByCode,
    handleToggleMaterial,
    handleRemovePart,
    handleAutoAdjust,
  } = useCompositionForm(selectedComposition);

  const invalid = hasInvalidParts(localComposition);

  return (
    <ConfirmationModal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      onConfirm={() => {
        selectComposition(localComposition);
        onClose();
      }}
      closeOnConfirm={false}
      width='sm'
      title='composition'
      confirmLabel='save'
      cancelLabel='close'
      // Every part that carries fibres must total exactly 100 — 90% is not savable.
      confirmDisabled={invalid}
    >
      <div className='flex flex-col gap-1'>
        <GarmentPartTabs
          selectedPart={selectedPart}
          onPartChange={setSelectedPart}
          localComposition={localComposition}
          onRemovePart={handleRemovePart}
        />

        <GroupLabel
          action={
            <CompositionSummary
              totalPercentage={totalPercentage}
              currentPartItemsCount={currentPartItems.length}
              onAutoAdjust={handleAutoAdjust}
            />
          }
        >
          fibres
        </GroupLabel>
        {currentPartItems.length === 0 ? (
          <Text variant='label' size='micro'>
            no fibre yet — pick one below
          </Text>
        ) : (
          currentPartItems.map((item) => (
            <FibreRow
              key={item.code}
              code={item.code}
              percent={item.percent}
              onPercentChange={(v) => handlePercentageByCode(item.code, v)}
              onRemove={() => handleToggleMaterial('', item.code)}
            />
          ))
        )}
        {invalid && (
          <Text variant='error' size='micro'>
            every part with fibres must total 100%
          </Text>
        )}

        <GroupLabel>add fibre</GroupLabel>
        <MaterialCategorySelector
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
        <div className='mt-1'>
          <MaterialsList
            compositionGarment={compositionGarment}
            isSelected={isSelected}
            onToggleMaterial={handleToggleMaterial}
          />
        </div>
      </div>
    </ConfirmationModal>
  );
}
