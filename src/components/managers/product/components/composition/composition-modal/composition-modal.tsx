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
export function CompositionModal({
  isOpen,
  selectedComposition,
  onClose,
  selectComposition,
}: CompositionModalProps) {
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
  } = useCompositionForm(selectedComposition, selectComposition);

  if (!isOpen) return null;

  const invalid = hasInvalidParts(localComposition);

  return (
    <ConfirmationModal
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      onConfirm={onClose}
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
