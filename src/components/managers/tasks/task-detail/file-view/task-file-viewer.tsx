import * as Dialog from '@radix-ui/react-dialog';
import type { LibraryFile } from 'api/proto-http/admin';
import { formatBytes } from 'components/managers/files/utils/format';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import type { ReactNode } from 'react';
import { Button, Text, Toolbar, ToolbarSpacer } from 'ui';
import { useTaskFileContent } from '../../hooks/useTasks';
import { FileContentViewer } from './file-content-viewer';
import { taskFileViewOf } from './file-view';
import { sheetSessionKey, useSheetSessions } from './sheet-session';
import { SheetView } from './sheet-view';
import { useSheetEditor } from './use-sheet-editor';

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
  const view = taskFileViewOf(file.fileName, file.contentType);
  return view === 'sheet' || view === 'delimited' ? (
    <SheetViewer taskId={taskId} file={file} onClose={onClose} />
  ) : (
    <PlainViewer taskId={taskId} file={file} onClose={onClose} />
  );
}

function ViewerShell({
  name,
  onEscape,
  onClose,
  children,
}: {
  name: string;
  onEscape?: (event: KeyboardEvent) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='files-reader-overlay fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          onEscapeKeyDown={onEscape}
          className='files-reader-content fixed inset-0 z-[var(--z-modal)] flex flex-col gap-2.5 bg-pageBg p-2.5 focus:outline-none'
        >
          <Dialog.Title className='sr-only'>{name}</Dialog.Title>
          <Dialog.Description className='sr-only'>attached file</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Таблица: общая правка с описанием задачи. */
function SheetViewer({
  taskId,
  file,
  onClose,
}: {
  taskId: number;
  file: LibraryFile;
  onClose: () => void;
}) {
  const editor = useSheetEditor(taskId, file, onClose);
  const key = sheetSessionKey(taskId, file.id ?? 0);
  return (
    <ViewerShell
      name={file.fileName ?? 'file'}
      onClose={onClose}
      onEscape={(event) => {
        // Radix слушает клавишу на документе раньше поля ввода. Esc в ячейке возвращает ячейку,
        // а просмотр закрывается только дверью с вопросом про несохранённое.
        event.preventDefault();
        if (!useSheetSessions.getState().sessions[key]?.active) editor.requestClose();
      }}
    >
      <SheetView file={file} editor={editor} where='full' />
    </ViewerShell>
  );
}

function PlainViewer({
  taskId,
  file,
  onClose,
}: {
  taskId: number;
  file: LibraryFile;
  onClose: () => void;
}) {
  const name = file.fileName ?? 'file';
  const { data, isLoading, isError, refetch, isFetching } = useTaskFileContent(
    taskId,
    file.id ?? 0,
  );

  return (
    <ViewerShell name={name} onClose={onClose}>
      <FileContentViewer
        file={file}
        content={data?.content}
        tooLarge={data?.tooLarge}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => refetch()}
        bodyClassName='min-h-0 flex-1 overflow-auto border border-borderColor bg-bgColor'
        renderControls={() => (
          <Toolbar sticky>
            <b className='max-w-[34ch] truncate'>{name}</b>
            <Text size='micro' variant='label' component='span'>
              {formatBytes(Number(file.sizeBytes ?? 0))}
            </Text>
            <ToolbarSpacer />
            {file.downloadUrl && (
              <Button asChild size='xs' variant='secondary'>
                <a href={file.downloadUrl} target='_blank' rel='noopener noreferrer'>
                  download
                </a>
              </Button>
            )}
            <Dialog.Close asChild>
              <Button size='xs' variant='secondary'>
                close
              </Button>
            </Dialog.Close>
          </Toolbar>
        )}
      />
    </ViewerShell>
  );
}
