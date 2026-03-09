import { useCallback, useRef, useState } from 'react';

const MESSAGE = 'Are you sure you want to change the size quantity?';

export function useEditConfirmation(editMode: boolean) {
  const [hasChangedSize, setHasChangedSize] = useState<{ [key: number]: boolean }>({});
  const [hasConfirmedSizeChange, setHasConfirmedSizeChange] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const sizeIdRef = useRef<number | null>(null);

  const requireConfirmation = useCallback(
    (sizeId: number | undefined): Promise<boolean> => {
      if (!sizeId) return Promise.resolve(false);

      if (!editMode || hasChangedSize[sizeId] || hasConfirmedSizeChange) {
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        sizeIdRef.current = sizeId;
        setModalOpen(true);
      });
    },
    [editMode, hasChangedSize, hasConfirmedSizeChange],
  );

  const onConfirm = useCallback(() => {
    const sizeId = sizeIdRef.current;
    resolveRef.current?.(true);
    resolveRef.current = null;
    sizeIdRef.current = null;
    setModalOpen(false);
    if (sizeId != null) {
      setHasChangedSize((prev) => ({ ...prev, [sizeId]: true }));
    }
    setHasConfirmedSizeChange(true);
  }, []);

  const onCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    sizeIdRef.current = null;
    setModalOpen(false);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
      sizeIdRef.current = null;
    }
    setModalOpen(open);
  }, []);

  return {
    requireConfirmation,
    confirmationModal: {
      open: modalOpen,
      message: MESSAGE,
      onConfirm,
      onCancel,
      onOpenChange: handleOpenChange,
    },
  };
}
