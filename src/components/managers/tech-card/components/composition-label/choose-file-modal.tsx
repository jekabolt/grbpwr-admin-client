// CHOOSE FILE: a label's own file, from the library or uploaded here. What is chosen gets a secret
// link with no expiry, like any file behind a label's QR.
import { failureText } from 'components/managers/files/api/rpc-error';
import { useLibraryFiles } from 'components/managers/files/hooks/useFiles';
import { extensionOf } from 'components/managers/files/utils/format';
import { notify } from 'lib/stores/store';
import { useRef, useState, type JSX } from 'react';
import { Button, ConfirmationModal, Media, Text, Tile, Tiles } from 'ui';
import { publicLinkOf, uploadPublicFile } from '../label-artwork-upload';

export type ChosenFile = { libraryFileId: number; publicUrl: string };

const printable = (contentType?: string): boolean => {
  const type = (contentType ?? '').toLowerCase();
  return type === 'application/pdf' || type.startsWith('image/');
};

export function ChooseFileModal({
  onChosen,
  onClose,
}: {
  onChosen: (file: ChosenFile) => void;
  onClose: () => void;
}): JSX.Element {
  const input = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useLibraryFiles({ topicIds: [], untopiced: false, search: '', sort: 'new' });
  const files = (query.data?.pages ?? [])
    .flatMap((p) => p.files ?? [])
    .filter((f) => printable(f.contentType));

  const finish = async (get: () => Promise<ChosenFile>) => {
    setBusy(true);
    try {
      const file = await get();
      if (!file.publicUrl) throw new Error('no link');
      onChosen(file);
      onClose();
    } catch (e) {
      notify({ sev: 'error', subject: '', text: '', bad: failureText(e, 'file not attached') });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      onConfirm={onClose}
      title='Choose file'
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-2.5' data-choose-file=''>
        <input
          ref={input}
          type='file'
          hidden
          accept='application/pdf,image/*'
          data-choose-file-input=''
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void finish(() => uploadPublicFile(file, setProgress));
          }}
        />
        <Tiles min={150}>
          <Tile
            dashed
            onClick={busy ? undefined : () => input.current?.click()}
            name={progress === null ? '+ upload' : `${Math.round(progress * 100)}%`}
          />
          {files.map((file) => {
            const id = Number(file.id);
            const name = file.fileName ?? '';
            return (
              <Tile
                key={id}
                title={name}
                name={name}
                onClick={
                  busy
                    ? undefined
                    : () =>
                        void finish(async () => ({
                          libraryFileId: id,
                          publicUrl: await publicLinkOf(id),
                        }))
                }
                media={
                  <div className='flex aspect-square w-full items-center justify-center bg-pageBg'>
                    {file.previewUrl ? (
                      <Media src={file.previewUrl} alt='' aspectRatio='1/1' fit='contain' />
                    ) : (
                      <Text variant='label' className='uppercase'>
                        {extensionOf(name)}
                      </Text>
                    )}
                  </div>
                }
              />
            );
          })}
        </Tiles>
        {query.hasNextPage ? (
          <div>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              show more
            </Button>
          </div>
        ) : null}
      </div>
    </ConfirmationModal>
  );
}
