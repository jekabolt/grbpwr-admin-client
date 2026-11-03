import * as Dialog from '@radix-ui/react-dialog';
import type { LibraryFile } from 'api/proto-http/admin';
import { formatBytes } from 'components/managers/files/utils/format';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  type TableCell,
} from './file-view';
import { inkOn, readSheets, type Sheet } from './sheet';

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

  const view = taskFileViewOf(file.fileName, file.contentType);

  const parsed = useMemo(() => {
    if (!data || data.tooLarge || view === 'sheet') return null;
    try {
      return renderable(file, decodeText(bytesFromBase64(data.content)));
    } catch {
      return null;
    }
  }, [data, file, view]);

  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetFailed, setSheetFailed] = useState(false);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    if (view !== 'sheet' || !data || data.tooLarge) return;
    let alive = true;
    readSheets(data.content)
      .then((read) => alive && setSheets(read))
      .catch(() => alive && setSheetFailed(true));
    return () => {
      alive = false;
    };
  }, [data, view]);

  const sheet = sheets?.[activeSheet];

  const download = file.downloadUrl ? (
    <Button asChild size='xs' variant='secondary'>
      <a href={file.downloadUrl} target='_blank' rel='noopener noreferrer'>
        download
      </a>
    </Button>
  ) : null;

  let body: ReactNode;
  let note = parsed?.note;
  if (isLoading) {
    body = <Centered label='loading…' />;
  } else if (data?.tooLarge) {
    body = <Centered label='too large' />;
  } else if (isError) {
    body = (
      <Centered label='not opened'>
        <Button size='xs' variant='secondary' disabled={isFetching} onClick={() => refetch()}>
          retry
        </Button>
      </Centered>
    );
  } else if (view === 'sheet') {
    if (sheetFailed) {
      body = <Centered label='not opened' />;
    } else if (!sheets) {
      body = <Centered label='loading…' />;
    } else {
      body = tableBody(sheet?.rows ?? []);
      note = sheet ? rowsNote(sheet.rows.length, sheet.totalRows) : undefined;
    }
  } else {
    body = parsed ? parsed.body : <Centered label='not opened' />;
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
            {sheets &&
              sheets.length > 1 &&
              sheets.map((tab, i) => (
                <Button
                  key={tab.name}
                  size='xs'
                  variant={i === activeSheet ? 'default' : 'secondary'}
                  aria-pressed={i === activeSheet}
                  onClick={() => setActiveSheet(i)}
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
    const shown = rows.slice(0, MAX_TABLE_ROWS);
    return {
      body: tableBody(
        shown.map((row) => row.map((value) => ({ text: value, numeric: looksNumeric(value) }))),
      ),
      note: rowsNote(shown.length, rows.length),
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

function tableBody(rows: TableCell[][]): ReactNode {
  return rows.length === 0 ? <Centered label='empty' /> : <TableView rows={rows} />;
}

function rowsNote(shown: number, total: number): string | undefined {
  return total > shown ? `${shown} of ${total} rows` : undefined;
}

const CELL = 'border-b border-r border-borderColor px-1.5 py-0.5';
const EDGE = `${CELL} sticky bg-pageBg text-labelColor`;

/** Первая строка закреплена, как шапка в Excel. Top 24 = высота строки с буквами колонок. */
function TableView({ rows }: { rows: TableCell[][] }) {
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
              const cell = row[c];
              return (
                <td
                  key={c}
                  style={
                    cell?.fill
                      ? { backgroundColor: `#${cell.fill}`, color: inkOn(cell.fill) }
                      : undefined
                  }
                  className={`${CELL} whitespace-nowrap bg-bgColor ${
                    cell?.numeric ? 'text-right tabular-nums' : 'text-left'
                  } ${r === 0 ? 'sticky top-6 z-[1]' : ''}`}
                >
                  {cell?.text}
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
