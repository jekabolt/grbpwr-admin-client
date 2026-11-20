import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { type ChangeEvent, type ReactNode, useRef } from 'react';
import { Button, ConfirmationModal } from 'ui';
import type { LibraryItem, LibraryKind, LibraryRef, LibrarySourceKey } from '../api/types';
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
  /** An own upload door (labels): a footer «+ upload» and drops on the grid go here. */
  onUpload?: (files: File[]) => void;
  uploadAccept?: string;
  uploadLabel?: string;
  /** Work in flight: the window does not close and the footer controls wait. */
  busy?: boolean;
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
  uploadAccept,
  uploadLabel = '+ upload',
  busy = false,
}: LibraryPickerProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const uploadInput = useRef<HTMLInputElement | null>(null);

  const actions =
    onUpload || footerActions ? (
      <>
        {onUpload && (
          <Button
            type='button'
            variant='secondary'
            size='default'
            className='mr-auto'
            disabled={busy}
            onClick={() => uploadInput.current?.click()}
          >
            {uploadLabel}
          </Button>
        )}
        {footerActions}
      </>
    ) : undefined;

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
      footerActions={actions}
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
        />
      </div>
      {onUpload && (
        <input
          ref={uploadInput}
          type='file'
          hidden
          multiple={multiple}
          accept={uploadAccept}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) onUpload(files);
          }}
        />
      )}
    </ConfirmationModal>
  );
}
