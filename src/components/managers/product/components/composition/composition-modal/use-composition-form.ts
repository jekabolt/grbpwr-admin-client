import { composition, CompositionItem, CompositionStructure } from 'constants/garment-composition';
import { useMemo, useState } from 'react';

// A part's fibres, by key. Indexed loosely on purpose: a stored composition may carry a key
// `garment_parts` has no tab for (`fibre`, from a material snapshot), and that data has to be
// readable and removable rather than silently dropped.
const partItems = (structure: CompositionStructure, part: string): CompositionItem[] =>
  (structure as Record<string, CompositionItem[] | undefined>)[part] ?? [];

// Set a part's fibres, DELETING the key when none are left rather than assigning `undefined`:
// `{ body: undefined }` serialises to '{}', and every "is composition set" check downstream is
// string-truthiness, so '{}' reads as a filled composition that then generates nothing.
const withPart = (
  structure: CompositionStructure,
  part: string,
  items: CompositionItem[],
): CompositionStructure => {
  const next = { ...structure } as Record<string, CompositionItem[] | undefined>;
  if (items.length > 0) next[part] = items;
  else delete next[part];
  return next as CompositionStructure;
};

export function useCompositionForm(selectedComposition: CompositionStructure) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Natural Fibers');
  const [selectedPart, setSelectedPart] = useState<string>('body');
  // The DRAFT, and the only thing every handler below touches. Nothing reaches the outer form until
  // the dialog is SAVED (composition-modal.tsx commits it once, from the confirm handler). This hook
  // is mounted with the open dialog and dies with it, so the draft is seeded from the stored value
  // on every opening and discarded on close — which is what makes `close` / ✕ / Esc / the overlay
  // abandon an unfinished blend instead of leaving a 60%-only body behind in the field, past a save
  // button that was disabled precisely because the blend was not savable.
  const [localComposition, setLocalComposition] =
    useState<CompositionStructure>(selectedComposition);

  const compositionGarment = Object.entries(
    composition.garment_composition[
      selectedCategory as keyof typeof composition.garment_composition
    ],
  );

  const currentPartItems = partItems(localComposition, selectedPart);

  const totalPercentage = useMemo(
    () => currentPartItems.reduce((acc, curr) => acc + curr.percent, 0),
    [currentPartItems],
  );

  const isSelected = (materialKey: string) => {
    const code = compositionGarment.find(([key]) => key === materialKey)?.[1];
    return currentPartItems.some((item) => item.code === code);
  };

  const updatePart = (updater: (part: CompositionItem[]) => CompositionItem[]) => {
    setLocalComposition((prev) =>
      withPart(prev, selectedPart, updater(partItems(prev, selectedPart))),
    );
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
      const current = partItems(prev, selectedPart);
      const existingIndex = current.findIndex((item) => item.code === materialCode);
      return withPart(
        prev,
        selectedPart,
        existingIndex >= 0
          ? current.filter((_, index) => index !== existingIndex)
          : [...current, { code: materialCode, percent: 0 }],
      );
    });
  };

  const handleRemovePart = (part: string) => {
    setLocalComposition((prev) => withPart(prev, part, []));
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
