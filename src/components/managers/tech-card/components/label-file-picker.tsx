import type { LibraryFile } from 'api/proto-http/admin';
import { failureText } from 'components/managers/files/api/rpc-error';
import { useLibraryFiles } from 'components/managers/files/hooks/useFiles';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ConfirmationModal, Input, Media, Placeholder, Text, Tile, Tiles } from 'ui';

import { sharePublicFile, uploadPublicFile } from './label-artwork-upload';

export type LabelFilePick = { libraryFileId: number; publicUrl: string };

function FileMedia({ file }: { file: LibraryFile }) {
  if (!file.previewUrl) return <Placeholder label='file' className='aspect-square w-full' />;
  return <Media src={file.previewUrl} alt='' aspectRatio='1/1' fit='contain' />;
}

/** One-file library picker. The final tile uploads through the ordinary public-file flow. */
export function LabelFilePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (file: LabelFilePick) => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const uploadInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!open) {
      setSearch('');
      setQuery('');
      setBusy(false);
    }
  }, [open]);

  const filesQuery = useLibraryFiles(
    { topicIds: [], untopiced: false, search: query, sort: 'new' },
    open,
  );
  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((page) => page.files ?? []),
    [filesQuery.data],
  );

  const choose = async (file: LibraryFile) => {
    const id = Number(file.id) || 0;
    if (!id || busy) return;
    setBusy(true);
    try {
      const picked = await sharePublicFile(id);
      onPick(picked);
      onOpenChange(false);
    } catch (error) {
      notify({ sev: 'error', subject: '', text: '', bad: failureText(error, 'file link failed') });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await uploadPublicFile(file);
      onPick(picked);
      onOpenChange(false);
    } catch (error) {
      notify({ sev: 'error', subject: '', text: '', bad: failureText(error, 'upload failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      title='choose file'
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-3'>
        <Input
          value={search}
          placeholder='search files'
          aria-label='search files'
          disabled={busy}
          className='h-7'
          onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
        />
        <Tiles min={132}>
          {files.map((file) => (
            <Tile
              key={Number(file.id)}
              media={<FileMedia file={file} />}
              name={file.fileName || `file ${file.id}`}
              sub={file.contentType || 'file'}
              title={file.fileName || undefined}
              onClick={busy ? undefined : () => void choose(file)}
            />
          ))}
          <Tile
            dashed
            name={busy ? 'working…' : '+ upload'}
            onClick={busy ? undefined : () => uploadInput.current?.click()}
            className='min-h-24 items-center justify-center'
          />
        </Tiles>
        {!filesQuery.isLoading && files.length === 0 && query ? (
          <Text size='micro' variant='label'>
            no files found
          </Text>
        ) : null}
      </div>
      <input
        ref={uploadInput}
        type='file'
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
    </ConfirmationModal>
  );
}
