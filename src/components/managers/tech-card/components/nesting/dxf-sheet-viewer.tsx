// Модальная обёртка просмотра DXF для авторизованных экранов. Тело живёт в dxf-sheet-view.tsx:
// его же показывает публичный вьюер выкроек (/p/:token), только токены размеров там строятся из
// манифеста карты, а здесь — из словаря (useDictionarySizeTokens, за авторизацией).
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DxfSheetView } from './dxf-sheet-view';
import { useDictionarySizeTokens } from './use-block-sizes';
import { type NestingFile } from './use-nesting';

export function DxfSheetViewer({
  files,
  title,
  onClose,
}: {
  files: NestingFile[] | null; // null = закрыт
  title?: string;
  onClose: () => void;
}) {
  const dictTokens = useDictionarySizeTokens();

  return (
    <ConfirmationModal
      open={files != null}
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={title || 'pattern (DXF)'}
      width='lg'
      hideActions
    >
      <DxfSheetView files={files} dictTokens={dictTokens} />
    </ConfirmationModal>
  );
}
