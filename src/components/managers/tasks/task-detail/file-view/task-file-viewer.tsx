import * as Dialog from '@radix-ui/react-dialog';
import type { LibraryFile } from 'api/proto-http/admin';
import { formatBytes } from 'components/managers/files/utils/format';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import { Button, Text, Toolbar, ToolbarSpacer } from 'ui';
import { useTaskFileContent } from '../../hooks/useTasks';
import { FileContentViewer } from './file-content-viewer';

/** Просмотр вложения прямо в задаче, на весь экран. Оформление как у читалки PDF в файлах. */
export function TaskFileViewer({
  taskId,
  file,
  onClose,
}: {
  taskId: number;
  file: LibraryFile;
  onClose: () => void;
}) {
  // Как в читалке: ⌘V поверх просмотра не должен открывать загрузку в задачу под ним.
  usePasteFiles({ claims: true, accepts: false, accept: 'any' }, () => {});

  const name = file.fileName ?? 'file';
  const { data, isLoading, isError, refetch, isFetching } = useTaskFileContent(
    taskId,
    file.id ?? 0,
  );

  const download = file.downloadUrl ? (
    <Button asChild size='xs' variant='secondary'>
      <a href={file.downloadUrl} target='_blank' rel='noopener noreferrer'>
        download
      </a>
    </Button>
  ) : null;

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='files-reader-overlay fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content className='files-reader-content fixed inset-0 z-[var(--z-modal)] flex flex-col gap-2.5 bg-pageBg p-2.5 focus:outline-none'>
          <Dialog.Title className='sr-only'>{name}</Dialog.Title>
          <Dialog.Description className='sr-only'>attached file</Dialog.Description>
          <FileContentViewer
            file={file}
            content={data?.content}
            tooLarge={data?.tooLarge}
            isLoading={isLoading}
            isError={isError}
            isFetching={isFetching}
            onRetry={() => refetch()}
            bodyClassName='min-h-0 flex-1 overflow-auto border border-borderColor bg-bgColor'
            renderControls={({ tabs, activeTab, onTabChange, note }) => (
              <Toolbar sticky>
                <b className='max-w-[34ch] truncate'>{name}</b>
                <Text size='micro' variant='label' component='span'>
                  {formatBytes(Number(file.sizeBytes ?? 0))}
                </Text>
                {tabs.length > 1 &&
                  tabs.map((tab) => (
                    <Button
                      key={tab.name}
                      size='xs'
                      variant={tab.index === activeTab ? 'default' : 'secondary'}
                      aria-pressed={tab.index === activeTab}
                      onClick={() => onTabChange(tab.index)}
                    >
                      {tab.name}
                    </Button>
                  ))}
                {note && (
                  <Text size='micro' variant='label' component='span'>
                    {note}
                  </Text>
                )}
                <ToolbarSpacer />
                {download}
                <Dialog.Close asChild>
                  <Button size='xs' variant='secondary'>
                    close
                  </Button>
                </Dialog.Close>
              </Toolbar>
            )}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
