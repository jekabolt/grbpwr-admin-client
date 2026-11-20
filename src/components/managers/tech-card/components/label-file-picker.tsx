import { failureText } from 'components/managers/files/api/rpc-error';
import type { LibraryItem, LibraryRef } from 'components/managers/library/api/types';
import { LibraryPicker } from 'components/managers/library/picker/library-picker';
import { notify } from 'lib/stores/store';
import { useEffect, useState } from 'react';

import { sharePublicFile, uploadPublicFile } from './label-artwork-upload';

export type LabelFilePick = { libraryFileId: number; publicUrl: string; fileName?: string };

/**
 * One-file library picker: the one library window, files only (the label FK points at
 * `library_file`). A pick mints the public print link; «+ upload» goes through the ordinary
 * public-file flow.
 */
export function LabelFilePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (file: LabelFilePick) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<LibraryRef[]>([]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setSelected([]);
    }
  }, [open]);

  const choose = async (refs: LibraryRef[], items: LibraryItem[]) => {
    const ref = refs[0];
    const file = items[0]?.file;
    const id = ref?.source === 'file' ? ref.id : 0;
    if (!id || busy) return;
    setSelected([ref]);
    setBusy(true);
    try {
      const picked = await sharePublicFile(id);
      onPick({ ...picked, fileName: file?.fileName || items[0]?.name || '' });
      onOpenChange(false);
    } catch (error) {
      setSelected([]);
      notify({ sev: 'error', subject: '', text: '', bad: failureText(error, 'file link failed') });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: File[]) => {
    const file = files[0];
    if (!file || busy) return;
    setBusy(true);
    try {
      const picked = await uploadPublicFile(file);
      onPick({ ...picked, fileName: file.name });
      onOpenChange(false);
    } catch (error) {
      notify({ sev: 'error', subject: '', text: '', bad: failureText(error, 'upload failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <LibraryPicker
      open={open}
      onOpenChange={onOpenChange}
      title='choose file'
      accept='any'
      sources={['file']}
      multiple={false}
      selected={selected}
      onSelectionChange={(refs, items) => void choose(refs, items)}
      onUpload={(files) => void upload(files)}
      hint={busy ? 'working…' : undefined}
      busy={busy}
    />
  );
}
