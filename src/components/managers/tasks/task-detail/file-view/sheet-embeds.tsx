import type { LibraryFile } from 'api/proto-http/admin';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { Button, Text, Toolbar, ToolbarSpacer } from 'ui';
import { taskFileViewOf } from './file-view';
import { SheetEmbedsContext, type SheetEmbeds } from './sheet-context';
import { SheetView } from './sheet-view';
import { TaskFileViewer } from './task-file-viewer';
import { useSheetEditor } from './use-sheet-editor';

/** Страница задачи: файлы для токенов и общий просмотр на весь экран, открытый из таблицы. */
export function SheetEmbedsProvider({
  taskId,
  files,
  attachFile,
  children,
}: {
  taskId: number;
  files: LibraryFile[];
  attachFile: SheetEmbeds['attachFile'];
  children: ReactNode;
}) {
  const [fullId, setFullId] = useState<number | null>(null);
  const value = useMemo<SheetEmbeds>(
    () => ({ taskId, files, attachFile, openFull: setFullId, Embed: SheetEmbed }),
    [attachFile, files, taskId],
  );
  // Файл берётся из свежего ответа: после записи старая подписанная ссылка мертва.
  const full = fullId === null ? undefined : files.find((f) => f.id === fullId);
  return (
    <SheetEmbedsContext.Provider value={value}>
      {children}
      {full && <TaskFileViewer taskId={taskId} file={full} onClose={() => setFullId(null)} />}
    </SheetEmbedsContext.Provider>
  );
}

/** То, чем токен `[[sheet:13]]` становится в описании. */
function SheetEmbed({ fileId }: { fileId: number }) {
  const embeds = useContext(SheetEmbedsContext);
  if (!embeds) return null;
  const file = embeds.files.find((f) => f.id === fileId);
  if (!file) {
    return (
      <div data-sheet-embed className='my-2 border border-borderColor bg-bgColor p-4 text-center'>
        <Text size='micro' variant='label' component='span'>
          file removed
        </Text>
      </div>
    );
  }
  const view = taskFileViewOf(file.fileName, file.contentType);
  if (view !== 'sheet' && view !== 'delimited') return <PlainFileBar file={file} />;
  return <LiveEmbed taskId={embeds.taskId} file={file} onOpen={() => embeds.openFull(fileId)} />;
}

function LiveEmbed({
  taskId,
  file,
  onOpen,
}: {
  taskId: number;
  file: LibraryFile;
  onOpen: () => void;
}) {
  const editor = useSheetEditor(taskId, file);
  return <SheetView file={file} editor={editor} where='embed' onOpen={onOpen} />;
}

function PlainFileBar({ file }: { file: LibraryFile }) {
  return (
    <div data-sheet-embed className='my-2'>
      <Toolbar sticky>
        <b className='max-w-[34ch] truncate'>{file.fileName ?? 'file'}</b>
        <ToolbarSpacer />
        {file.downloadUrl && (
          <Button asChild size='xs' variant='secondary'>
            <a href={file.downloadUrl} target='_blank' rel='noopener noreferrer'>
              download
            </a>
          </Button>
        )}
      </Toolbar>
    </div>
  );
}
