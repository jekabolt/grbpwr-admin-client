import type { LibraryFile } from 'api/proto-http/admin';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Text } from 'ui';
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

export type FileContentControls = {
  tabs: { name: string; index: number }[];
  activeTab: number;
  onTabChange: (index: number) => void;
  note?: string;
};

/** Shared bytes renderer for task attachments and library-file cards. */
export function FileContentViewer({
  file,
  content,
  tooLarge,
  isLoading,
  isError,
  isFetching,
  onRetry,
  renderControls,
  bodyClassName,
}: {
  file: LibraryFile;
  content?: string;
  tooLarge?: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  onRetry: () => void;
  renderControls?: (controls: FileContentControls) => ReactNode;
  bodyClassName?: string;
}) {
  const view = taskFileViewOf(file.fileName, file.contentType);
  const parsed = useMemo(() => {
    if (content === undefined || tooLarge || view === 'sheet') return null;
    try {
      return renderable(file, decodeText(bytesFromBase64(content)));
    } catch {
      return null;
    }
  }, [content, file, tooLarge, view]);

  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetFailed, setSheetFailed] = useState(false);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    if (view !== 'sheet' || content === undefined || tooLarge) return;
    let alive = true;
    readSheets(content)
      .then((read) => alive && setSheets(read))
      .catch(() => alive && setSheetFailed(true));
    return () => {
      alive = false;
    };
  }, [content, tooLarge, view]);

  const sheet = sheets?.[activeSheet];
  let body: ReactNode;
  let note = parsed?.note;

  if (isLoading) {
    body = <Centered label='loading…' />;
  } else if (tooLarge) {
    body = <Centered label='too large' />;
  } else if (isError) {
    body = (
      <Centered label='not opened'>
        <Button size='xs' variant='secondary' disabled={isFetching} onClick={onRetry}>
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

  const controls: FileContentControls = {
    tabs: (sheets ?? []).map((tab, index) => ({ name: tab.name, index })),
    activeTab: activeSheet,
    onTabChange: setActiveSheet,
    note,
  };

  return (
    <>
      {renderControls?.(controls)}
      <div className={bodyClassName}>{body}</div>
    </>
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

function TableView({ rows }: { rows: TableCell[][] }) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: width }, (_, index) => index);
  return (
    <table className='min-w-full border-separate border-spacing-0 text-textBaseSize'>
      <thead>
        <tr>
          <th className={`${EDGE} left-0 top-0 z-[3] h-6`} />
          {columns.map((column) => (
            <th key={column} className={`${EDGE} top-0 z-[2] h-6 text-center font-normal`}>
              {columnLabel(column)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            <th
              className={`${EDGE} left-0 text-right font-normal ${
                rowIndex === 0 ? 'top-6 z-[3]' : 'z-[1]'
              }`}
            >
              {rowIndex + 1}
            </th>
            {columns.map((column) => {
              const cell = row[column];
              return (
                <td
                  key={column}
                  style={
                    cell?.fill
                      ? { backgroundColor: `#${cell.fill}`, color: inkOn(cell.fill) }
                      : undefined
                  }
                  className={`${CELL} whitespace-nowrap bg-bgColor ${
                    cell?.numeric ? 'text-right tabular-nums' : 'text-left'
                  } ${rowIndex === 0 ? 'sticky top-6 z-[1]' : ''}`}
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
