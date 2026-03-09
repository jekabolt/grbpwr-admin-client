import { CompositionStructure } from 'constants/garment-composition';
import { CareCompositionModal } from '../../care-composition-modal';
import { CompositionModalActions } from './composition-modal-actions';
import { CompositionSummary } from './composition-summary';
import { GarmentPartTabs } from './garment-part-tabs';
import { MaterialCategorySelector } from './material-category-selector';
import { MaterialsList } from './materials-list';
import { useCompositionForm } from './use-composition-form';

interface CompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedComposition: CompositionStructure;
  selectComposition: (composition: CompositionStructure) => void;
}

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
    getPercentageForMaterial,
    handlePercentageChange,
    handleToggleMaterial,
    handleRemovePart,
    handleAutoAdjust,
  } = useCompositionForm(selectedComposition, selectComposition);

  if (!isOpen) return null;

  return (
    <CareCompositionModal
      title='composition'
      open={isOpen}
      onOpenChange={onClose}
      footer={
        <div className='flex justify-between items-center'>
          <CompositionSummary
            selectedPart={selectedPart}
            totalPercentage={totalPercentage}
            currentPartItemsCount={currentPartItems.length}
            onAutoAdjust={handleAutoAdjust}
          />
          <CompositionModalActions localComposition={localComposition} onClose={onClose} />
        </div>
      }
    >
      <div className='space-y-7'>
        <GarmentPartTabs
          selectedPart={selectedPart}
          onPartChange={setSelectedPart}
          localComposition={localComposition}
          onRemovePart={handleRemovePart}
        />
        <MaterialCategorySelector
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
        <MaterialsList
          compositionGarment={compositionGarment}
          selectedPart={selectedPart}
          isSelected={isSelected}
          getPercentageForMaterial={getPercentageForMaterial}
          onToggleMaterial={handleToggleMaterial}
          onPercentageChange={handlePercentageChange}
          totalPercentage={totalPercentage}
        />
      </div>
    </CareCompositionModal>
  );
}
