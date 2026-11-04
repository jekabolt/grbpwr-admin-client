import type { LibraryFile } from 'api/proto-http/admin';
import { formatBytes } from 'components/managers/files/utils/format';
import { Button, Text, Toolbar, ToolbarSpacer } from 'ui';
import { sheetByline } from './sheet-doc';
import { Centered, SheetTable, type SheetEditing } from './sheet-table';
import type { SheetEditor } from './use-sheet-editor';

function Note({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <Text
      size='micro'
      variant='label'
      component='span'
      className={error ? 'text-error' : undefined}
    >
      {children}
    </Text>
  );
}

function rowsNote(shown: number, total: number): string | undefined {
  return total > shown ? `${shown} of ${total} rows` : undefined;
}

/** Одна таблица: на весь экран и внутри описания. Разница только в рамке и паре кнопок. */
export function SheetView({
  file,
  editor,
  where,
  onOpen,
}: {
  file: LibraryFile;
  editor: SheetEditor;
  where: 'full' | 'embed';
  onOpen?: () => void;
}) {
  const full = where === 'full';
  const { session, data, sheet, sheets, query, book } = editor;
  const busy = session.saving;

  const download = file.downloadUrl ? (
    <Button asChild size='xs' variant='secondary'>
      <a href={file.downloadUrl} target='_blank' rel='noopener noreferrer'>
        download
      </a>
    </Button>
  ) : null;

  const open = onOpen && (
    <Button size='xs' variant='secondary' onClick={onOpen}>
      open
    </Button>
  );
  const close = full && (
    <Button size='xs' variant='secondary' disabled={busy} onClick={editor.requestClose}>
      close
    </Button>
  );

  const edited =
    data?.lastEditedBy || data?.lastEditedAt
      ? sheetByline('edited', data.lastEditedBy, data.lastEditedAt)
      : '';
  const truncated = sheet ? rowsNote(sheet.rows.length, sheet.totalRows) : undefined;

  const conflict = session.conflict;
  const closingHere = full && session.closing;

  const selected = session.sel && book ? book.cell(editor.bookIndex, session.sel) : null;
  const selectedValue =
    session.sel && selected ? selected.formula ?? editor.draft[session.sel] ?? selected.input : '';

  const editing: SheetEditing | undefined =
    session.editing && book && editor.bookIndex >= 0
      ? {
          book,
          bookIndex: editor.bookIndex,
          draft: editor.draft,
          totals: editor.totals,
          sel: session.sel,
          // У двух таблиц одного файла поле ввода одно: у той, где щёлкнули.
          active: session.host === editor.host ? session.active : null,
          press: editor.press,
          setCell: editor.setCell,
          revertCell: editor.revertCell,
          move: editor.move,
        }
      : undefined;

  let body;
  if (query.isLoading && !data) body = <Centered label='loading…' />;
  else if (data?.tooLarge) body = <Centered label='too large' />;
  else if (query.isError && !data) {
    body = (
      <Centered label='not opened'>
        <Button
          size='xs'
          variant='secondary'
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          retry
        </Button>
      </Centered>
    );
  } else if (editor.failed) body = <Centered label='not opened' />;
  else if (!editor.doc) body = <Centered label='loading…' />;
  else if (!sheet || sheet.rows.length === 0) body = <Centered label='empty' />;
  else body = <SheetTable sheet={sheet} editing={editing} />;

  return (
    <div
      data-sheet-embed={full ? undefined : true}
      className={full ? 'flex min-h-0 flex-1 flex-col' : 'my-2 flex w-full min-w-0 flex-col'}
    >
      <Toolbar sticky>
        <b className='max-w-[34ch] truncate'>{file.fileName ?? 'file'}</b>
        {full && <Note>{formatBytes(Number(file.sizeBytes ?? 0))}</Note>}
        {sheets.length > 1 &&
          sheets.map((tab, i) => (
            <Button
              key={tab.name}
              size='xs'
              variant={i === editor.sheetIndex ? 'default' : 'secondary'}
              aria-pressed={i === editor.sheetIndex}
              onClick={() => editor.setSheet(i)}
            >
              {tab.name}
            </Button>
          ))}
        {truncated && <Note>{truncated}</Note>}
        {!session.editing && editor.viewOnly && <Note>view only</Note>}
        {!session.editing && !editor.viewOnly && edited && <Note>{edited}</Note>}
        {session.error && <Note error>{session.error}</Note>}
        <ToolbarSpacer />
        {session.editing ? (
          <>
            <Note>{editor.count ? `${editor.count} changed` : 'no changes'}</Note>
            <Button
              size='xs'
              variant='main'
              disabled={editor.count === 0 || busy}
              onClick={editor.save}
            >
              save
            </Button>
            <Button size='xs' variant='secondary' disabled={busy} onClick={editor.cancel}>
              cancel
            </Button>
            {open}
            {close}
          </>
        ) : (
          <>
            {editor.canEdit && (
              <Button size='xs' variant='secondary' onClick={editor.startEdit}>
                edit
              </Button>
            )}
            {open}
            {download}
            {close}
          </>
        )}
      </Toolbar>

      {closingHere ? (
        <Banner text={`${editor.count} unsaved`}>
          <Button size='xs' variant='main' disabled={busy} onClick={editor.save}>
            save
          </Button>
          <Button size='xs' variant='secondary' disabled={busy} onClick={editor.discard}>
            discard
          </Button>
          <Button size='xs' variant='secondary' disabled={busy} onClick={editor.keepEditing}>
            keep editing
          </Button>
        </Banner>
      ) : conflict ? (
        <Banner text={conflictText(conflict.by, conflict.at)}>
          <Button size='xs' variant='secondary' disabled={busy} onClick={editor.takeTheirs}>
            use theirs
          </Button>
          <Button size='xs' variant='secondary' disabled={busy} onClick={editor.saveAsCopy}>
            save as copy
          </Button>
          <Button size='xs' variant='secondary' disabled={busy} onClick={editor.overwrite}>
            overwrite
          </Button>
        </Banner>
      ) : null}

      {session.editing && (
        <div className='flex min-h-6 min-w-0 items-center gap-2.5 border border-t-0 border-borderColor bg-bgColor px-2.5 py-0.5 text-micro'>
          <span className='min-w-[4ch] text-labelColor'>{session.sel}</span>
          <span className='min-w-0 flex-1 truncate'>{selectedValue}</span>
          {selected?.locked && <Note>locked</Note>}
        </div>
      )}

      <div
        className={
          full
            ? 'min-h-0 flex-1 overflow-auto border border-t-0 border-borderColor bg-bgColor'
            : 'max-h-[19.875rem] min-w-0 overflow-auto border border-t-0 border-borderColor bg-bgColor'
        }
      >
        {body}
      </div>
    </div>
  );
}

function conflictText(by: string, at: string): string {
  return sheetByline(by ? 'changed by' : 'changed', by, at);
}

function Banner({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-wrap items-center gap-2 border-x border-b border-x-borderColor border-b-error bg-bgColor px-2.5 py-1.5'>
      <Text size='micro' component='span' className='text-error'>
        {text}
      </Text>
      <ToolbarSpacer />
      {children}
    </div>
  );
}
