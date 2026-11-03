import * as Dialog from '@radix-ui/react-dialog';
import type { LibraryFile } from 'api/proto-http/admin';
import { formatBytes } from 'components/managers/files/utils/format';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import { useMemo, type ReactNode } from 'react';
import { Button, Text, Toolbar, ToolbarSpacer } from 'ui';
import { useTaskFileContent } from '../../hooks/useTasks';
import {
  bytesFromBase64,
  columnLabel,
  decodeText,
  looksNumeric,
  MAX_TABLE_ROWS,
  parseDelimited,
  sandboxedHtml,
  taskFileViewOf,
} from './file-view';

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
  const { data, isLoading, isError, refetch, isFetching } = useTaskFileContent(taskId, file.id ?? 0);

  const parsed = useMemo(() => {
    if (!data || data.tooLarge) return null;
    try {
      return renderable(file, decodeText(bytesFromBase64(data.content)));
    } catch {
      return null;
    }
  }, [data, file]);

  const download = file.downloadUrl ? (
    <Button asChild size='xs' variant='secondary'>
      <a href={file.downloadUrl} target='_blank' rel='noopener noreferrer'>
        download
      </a>
    </Button>
  ) : null;

  let body: ReactNode;
  if (isLoading) {
    body = <Centered label='loading…' />;
  } else if (data?.tooLarge) {
    body = <Centered label='too large' />;
  } else if (isError || !parsed) {
    body = (
      <Centered label='not opened'>
        <Button size='xs' variant='secondary' disabled={isFetching} onClick={() => refetch()}>
          retry
        </Button>
      </Centered>
    );
  } else {
    body = parsed.body;
  }

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
          <Toolbar sticky>
            <b className='max-w-[34ch] truncate'>{name}</b>
            <Text size='micro' variant='label' component='span'>
              {formatBytes(Number(file.sizeBytes ?? 0))}
            </Text>
            {parsed?.note && (
              <Text size='micro' variant='label' component='span'>
                {parsed.note}
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
          <div className='min-h-0 flex-1 overflow-auto border border-borderColor bg-bgColor'>
            {body}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function renderable(file: LibraryFile, text: string): { body: ReactNode; note?: string } {
  const view = taskFileViewOf(file.fileName, file.contentType);
  if (view === 'html') {
    return {
      body: (
        <iframe
          title={file.fileName ?? 'file'}
          sandbox=''
          referrerPolicy='no-referrer'
          srcDoc={sandboxedHtml(text)}
          className='block h-full w-full border-0 bg-bgColor'
        />
      ),
    };
  }
  if (view === 'delimited') {
    const rows = parseDelimited(text);
    if (rows.length === 0) return { body: <Centered label='empty' /> };
    const shown = rows.slice(0, MAX_TABLE_ROWS);
    return {
      body: <TableView rows={shown} />,
      note: rows.length > shown.length ? `${shown.length} of ${rows.length} rows` : undefined,
    };
  }
  return {
    body: (
      <pre className='m-0 max-w-[90ch] whitespace-pre-wrap p-3 font-mono text-textBaseSize [overflow-wrap:anywhere]'>
        {text}
      </pre>
    ),
  };
}

const CELL = 'border-b border-r border-borderColor px-1.5 py-0.5';
const EDGE = `${CELL} sticky bg-pageBg text-labelColor`;

/** Первая строка закреплена, как шапка в Excel. Top 24 = высота строки с буквами колонок. */
function TableView({ rows }: { rows: string[][] }) {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const columns = Array.from({ length: width }, (_, i) => i);
  return (
    <table className='min-w-full border-separate border-spacing-0 text-textBaseSize'>
      <thead>
        <tr>
          <th className={`${EDGE} left-0 top-0 z-[3] h-6`} />
          {columns.map((c) => (
            <th key={c} className={`${EDGE} top-0 z-[2] h-6 text-center font-normal`}>
              {columnLabel(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            <th
              className={`${EDGE} left-0 text-right font-normal ${r === 0 ? 'top-6 z-[3]' : 'z-[1]'}`}
            >
              {r + 1}
            </th>
            {columns.map((c) => {
              const value = row[c] ?? '';
              return (
                <td
                  key={c}
                  className={`${CELL} whitespace-nowrap bg-bgColor ${
                    looksNumeric(value) ? 'text-right tabular-nums' : 'text-left'
                  } ${r === 0 ? 'sticky top-6 z-[1]' : ''}`}
                >
                  {value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Centered({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-2 p-4'>
      <Text size='micro' variant='label' component='span'>
        {label}
      </Text>
      {children}
    </div>
  );
}
