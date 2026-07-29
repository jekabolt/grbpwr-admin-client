import { composition, CompositionItem, CompositionStructure } from 'constants/garment-composition';
import { useEffect, useMemo, useState } from 'react';

export function useCompositionForm(
  selectedComposition: CompositionStructure,
  selectComposition: (composition: CompositionStructure) => void,
) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Natural Fibers');
  const [selectedPart, setSelectedPart] = useState<string>('body');
  const [localComposition, setLocalComposition] =
    useState<CompositionStructure>(selectedComposition);

  const compositionGarment = Object.entries(
    composition.garment_composition[
      selectedCategory as keyof typeof composition.garment_composition
    ],
  );

  const currentPartItems = localComposition[selectedPart as keyof CompositionStructure] || [];

  const totalPercentage = useMemo(
    () => currentPartItems.reduce((acc, curr) => acc + curr.percent, 0),
    [currentPartItems],
  );

  useEffect(() => {
    setLocalComposition(selectedComposition);
  }, [selectedComposition]);

  const isSelected = (materialKey: string) => {
    const code = compositionGarment.find(([key]) => key === materialKey)?.[1];
    return currentPartItems.some((item) => item.code === code);
  };

  const updatePart = (updater: (part: CompositionItem[]) => CompositionItem[]) => {
    setLocalComposition((prev) => {
      const newComposition = { ...prev };
      const currentPart = newComposition[selectedPart as keyof CompositionStructure] || [];
      const updatedPart = updater(currentPart);
      newComposition[selectedPart as keyof CompositionStructure] =
        updatedPart.length > 0 ? updatedPart : undefined;
      selectComposition(newComposition);
      return newComposition;
    });
  };

  // Keyed by CODE, not by the dictionary display key: a part's selected fibres are edited as rows
  // regardless of which category is currently being browsed, and a code is the only identity that
  // survives switching categories. Over-100 is no longer blocked with an alert() — the live total
  // pill turns red and the modal's save button is disabled until the part sums to exactly 100.
  const handlePercentageByCode = (code: string, value: string) => {
    if (!code) return;
    const parsed = parseInt(value, 10);
    const percentage = Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : 0));
    updatePart((part) =>
      part.map((item) => (item.code === code ? { ...item, percent: percentage } : item)),
    );
  };

  const handleToggleMaterial = (materialKey: string, materialCode: string) => {
    setLocalComposition((prev) => {
      const newComposition = { ...prev };
      const currentPart = newComposition[selectedPart as keyof CompositionStructure] || [];
      const existingIndex = currentPart.findIndex((item) => item.code === materialCode);

      if (existingIndex >= 0) {
        const updatedPart = currentPart.filter((_, index) => index !== existingIndex);
        newComposition[selectedPart as keyof CompositionStructure] =
          updatedPart.length > 0 ? updatedPart : undefined;
      } else {
        newComposition[selectedPart as keyof CompositionStructure] = [
          ...currentPart,
          { code: materialCode, percent: 0 },
        ];
      }

      selectComposition(newComposition);
      return newComposition;
    });
  };

  const handleRemovePart = (part: string) => {
    setLocalComposition((prev) => {
      const newComposition = { ...prev };
      delete newComposition[part as keyof CompositionStructure];
      selectComposition(newComposition);
      return newComposition;
    });
  };

  const handleAutoAdjust = () => {
    if (currentPartItems.length === 0) return;

    const difference = 100 - totalPercentage;
    const highestItem = currentPartItems.reduce((max, item) =>
      item.percent > max.percent ? item : max,
    );
    const newPercent = Math.max(0, highestItem.percent + difference);

    updatePart((part) =>
      part.map((item) =>
        item.code === highestItem.code ? { ...item, percent: newPercent } : item,
      ),
    );
  };

  return {
    selectedCategory,
    setSelectedCategory,
    selectedPart,
    setSelectedPart,
    localComposition,
    compositionGarment,
    currentPartItems,
    totalPercentage,
    isSelected,
    handlePercentageByCode,
    handleToggleMaterial,
    handleRemovePart,
    handleAutoAdjust,
  };
}
