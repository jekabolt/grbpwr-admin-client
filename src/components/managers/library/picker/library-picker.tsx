import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import type { ReactNode } from 'react';
import { ConfirmationModal } from 'ui';
import type { LibraryItem, LibraryKind, LibraryRef, LibrarySourceKey, RefKey } from '../api/types';
import { LibraryBrowser } from '../browser/library-browser';

export type LibraryPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  accept: 'visual' | 'any';
  kinds?: LibraryKind[];
  sources?: LibrarySourceKey[];
  multiple: boolean;
  /** Controlled: the caller holds the draft and decides what a click means. */
  selected: LibraryRef[];
  onSelectionChange: (refs: LibraryRef[], items: LibraryItem[]) => void;
  /** With it, the footer carries cancel + this main action; without it, only `footerActions`. */
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  /** Left of the footer actions, one short line (e.g. «2 selected»). */
  hint?: ReactNode;
  /** Extra footer actions between cancel and done (notes: «as table», «as link»). */
  footerActions?: ReactNode;
  /**
   * An own upload door (labels): the browser's «+ upload», drops and paste go here instead of the
   * library queue. The browser's upload is the one door; the window adds none of its own.
   */
  onUpload?: (files: File[]) => void;
  /** Work in flight: the window does not close and the footer controls wait. */
  busy?: boolean;
  /** Client-side narrowing of the listed rows (labels: printable only). */
  itemFilter?: (item: LibraryItem) => boolean;
  /** A 1–2 word problem on a tile, by ref key. */
  errors?: Partial<Record<RefKey, string>>;
  /** Tiles being worked on (dimmed, «copying»). */
  busyKeys?: RefKey[];
};

/**
 * The one library window for fields that take any file (tasks, notes, labels). Fields for pictures
 * and video open the same browser inside MediaSelector's own dialog, with crop and tray.
 */
export function LibraryPicker({
  open,
  onOpenChange,
  title,
  accept,
  kinds,
  sources,
  multiple,
  selected,
  onSelectionChange,
  onDone,
  doneLabel = 'done',
  doneDisabled,
  hint,
  footerActions,
  onUpload,
  busy = false,
  itemFilter,
  errors,
  busyKeys,
}: LibraryPickerProps) {
  const phone = useMediaQuery(PHONE_QUERY);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
      onConfirm={() => onDone?.()}
      title={title}
      width='lg'
      lowercase
      fullScreen={phone}
      hideActions={!onDone}
      confirmLabel={doneLabel}
      confirmDisabled={doneDisabled || busy}
      cancelDisabled={busy}
      footerHint={hint}
      footerActions={footerActions}
    >
      <div className='min-h-[60vh]'>
        <LibraryBrowser
          mode='pick'
          accept={accept}
          kinds={kinds}
          sources={sources}
          multiple={multiple}
          selected={selected}
          onSelectionChange={busy ? () => undefined : onSelectionChange}
          onFilesPicked={onUpload}
          itemFilter={itemFilter}
          errors={errors}
          busyKeys={busyKeys}
        />
      </div>
    </ConfirmationModal>
  );
}
