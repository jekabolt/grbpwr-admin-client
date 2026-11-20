// CHOOSE FILE: a label's own file, from the library or uploaded here. What is chosen gets a secret
// link with no expiry, like any file behind a label's QR.
import { failureText } from 'components/managers/files/api/rpc-error';
import type { LibraryItem, LibraryKind, LibraryRef } from 'components/managers/library/api/types';
import { LibraryPicker } from 'components/managers/library/picker/library-picker';
import { notify } from 'lib/stores/store';
import { useState, type JSX } from 'react';
import { publicLinkOf, uploadPublicFile } from '../label-artwork-upload';

export type ChosenFile = { libraryFileId: number; publicUrl: string };

const printable = (contentType?: string): boolean => {
  const type = (contentType ?? '').toLowerCase();
  return type === 'application/pdf' || type.startsWith('image/');
};

/** Only printable rows are listed; documents of another type never show up here. */
const listable = (item: LibraryItem): boolean =>
  printable(item.contentType ?? item.file?.contentType);

/**
 * What `printable` lets through, said in library kinds (the server narrowing). Documents also
 * hold non-PDF files, so `listable` narrows the loaded rows and a pick is checked once more.
 */
const PRINTABLE_KINDS: LibraryKind[] = [
  'LIBRARY_KIND_IMAGE',
  'LIBRARY_KIND_VECTOR',
  'LIBRARY_KIND_DOCUMENT',
];

export function ChooseFileModal({
  onChosen,
  onClose,
}: {
  onChosen: (file: ChosenFile) => void;
  onClose: () => void;
}): JSX.Element {
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<LibraryRef[]>([]);

  const finish = async (get: () => Promise<ChosenFile>) => {
    setBusy(true);
    try {
      const file = await get();
      if (!file.publicUrl) throw new Error('no link');
      onChosen(file);
      onClose();
    } catch (e) {
      setSelected([]);
      notify({ sev: 'error', subject: '', text: '', bad: failureText(e, 'file not attached') });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const choose = (refs: LibraryRef[], items: LibraryItem[]) => {
    const ref = refs[0];
    const item = items[0];
    if (!ref || ref.source !== 'file' || busy) return;
    if (!printable(item?.contentType ?? item?.file?.contentType)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'not printable' });
      return;
    }
    setSelected([ref]);
    void finish(async () => ({ libraryFileId: ref.id, publicUrl: await publicLinkOf(ref.id) }));
  };

  return (
    <LibraryPicker
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title='choose file'
      accept='any'
      sources={['file']}
      kinds={PRINTABLE_KINDS}
      multiple={false}
      selected={selected}
      onSelectionChange={choose}
      onUpload={(files) => {
        const file = files[0];
        if (!file || busy) return;
        // A drop on the grid skips the input's `accept`.
        if (!printable(file.type)) {
          notify({ sev: 'error', subject: '', text: '', bad: 'not printable' });
          return;
        }
        void finish(() => uploadPublicFile(file, setProgress));
      }}
      itemFilter={listable}
      hint={progress === null ? undefined : `${Math.round(progress * 100)}%`}
      busy={busy}
    />
  );
}
