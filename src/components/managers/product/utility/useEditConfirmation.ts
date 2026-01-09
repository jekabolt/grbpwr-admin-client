import { useState } from 'react';

export function useEditConfirmation(isEditMode: boolean, isAddingProduct: boolean) {
  const [hasChangedSize, setHasChangedSize] = useState<{ [key: number]: boolean }>({});
  const [hasConfirmedSizeChange, setHasConfirmedSizeChange] = useState(false);

  const requireConfirmation = (sizeId: number | undefined): boolean => {
    if (!sizeId) return false;

    if (!isAddingProduct && isEditMode && !hasChangedSize[sizeId] && !hasConfirmedSizeChange) {
      const confirmed = window.confirm('Are you sure you want to change the size quantity?');
      if (!confirmed) return false;
      setHasChangedSize((prev) => ({ ...prev, [sizeId]: true }));
      setHasConfirmedSizeChange(true);
    }

    return true;
  };

  return { requireConfirmation };
}
