// Step 1 · FILES — drop anything (owner decision 1: every format), several files = one per size
// (decision 5, merged into one run). Reading runs `open` + `extract`: the worker sniffs each file by
// its CONTENT (adapters/sniff `pickExtractor`), so the "read as" column before reading is only the
// extension's guess and the pages panel says what the file really is. The page classification is
// shown at once so a wrong file is caught before the scale is asked about.
import { useRef, useState } from 'react';
import { refusalMessage } from 'lib/pattern-import/adapters/sniff/errors';
import { refusalForName } from 'lib/pattern-import/adapters/sniff/native';
import type { PageClass } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { kindOfName } from '../formats';
import type { ImportSessionApi } from '../use-import-session';
import { Panel, fmtBytes, fmtPct } from '../ui-bits';
import { CleanBlock, roleEdit } from './files-clean';

const ACCEPT = '.pdf,.dxf,.plt,.hpgl,.hpg,.svg,.ai,.eps,.png,.jpg,.jpeg,.tif,.tiff';
const KIND_LABEL: Record<string, string> = {
  pdf: 'vector PDF',
  dxf: 'DXF',
  raster: 'scan',
  hpgl: 'PLT / HPGL',
  svg: 'SVG',
  ai: 'Illustrator PDF',
};
const CLASS_ORDER: PageClass[] = ['tile', 'overview', 'instructions', 'cover', 'blank', 'unknown'];

export function FilesStep({
  api,
  stub,
  onToggleStub,
}: {
  api: ImportSessionApi;
  stub: boolean;
  /** Dev builds only: switch between the real worker and the F13 fixture. */
  onToggleStub?: () => void;
}) {
  const { session, inputs, extracted } = api;
  const [staged, setStaged] = useState<File[]>(inputs.fileList);
  const [over, setOver] = useState(false);
  /** The page drawn with its mask (`file:page`); null = the first page with something set aside. */
  const [shownPage, setShownPage] = useState<string | null>(null);
  const masks = new Map(
    (session.clean?.pages ?? []).map((m) => [
      `${m.file}:${m.page}`,
      m.items.reduce((a, it) => a + (it.applied ? it.lines : 0), 0),
    ]),
  );
  const setRole = (file: string, page: number, role: PageClass) =>
    void api.dispatch({
      type: 'clean',
      edits: roleEdit(inputs.cleanEdits, file, page, role),
    });
  const pick = useRef<HTMLInputElement>(null);
  const read = session.files.length > 0 && session.scale.candidates.length > 0;
  const dirty =
    staged.length !== inputs.fileList.length || staged.some((f, i) => f !== inputs.fileList[i]);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    setStaged((prev) => [...prev, ...files.filter((f) => !prev.some((p) => p.name === f.name))]);
  };

  const counts = CLASS_ORDER.map(
    (c) => [c, session.pages.filter((p) => p.cls === c).length] as const,
  ).filter(([, n]) => n > 0);

  return (
    <div className='grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 [&>*]:min-h-0'>
      <Panel
        title='files'
        aside={
          <Text size='micro' variant='label' component='span'>
            {staged.length || '—'}
          </Text>
        }
      >
        <div className='flex h-full flex-col gap-2'>
          <input
            ref={pick}
            type='file'
            multiple
            accept={ACCEPT}
            className='sr-only'
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          {/* The drop target is the striped "slot" surface the admin uses for every empty place
              a thing goes into; a dragged file over it turns the edge to ink. */}
          <div
            role='button'
            tabIndex={0}
            onClick={() => pick.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pick.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add(e.dataTransfer.files);
            }}
            style={PLACEHOLDER_SURFACE}
            className={cn(
              'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-4 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              over ? 'border-textColor' : 'border-borderColor',
              staged.length === 0 && 'flex-1',
            )}
          >
            <Text size='control' variant='uppercase' tracking='label' component='span'>
              drop pattern files here, or click to choose
            </Text>
            <Text size='micro' variant='label' component='span'>
              vector PDF · DXF from CLO / Gerber / Optitex · PLT / HPGL · SVG · AI · scans (PNG,
              JPG, TIFF with a known dpi)
            </Text>
            <Text size='micro' variant='label' component='span'>
              several files are read as one file per size and merged into one run
            </Text>
          </div>

          {staged.length > 0 && (
            <DataTable>
              <thead>
                <tr>
                  <th>file</th>
                  <th data-align='left'>read as</th>
                  <th>size</th>
                  <th aria-label='remove' />
                </tr>
              </thead>
              <tbody>
                {staged.map((f) => {
                  const ext = f.name.split('.').pop()?.toLowerCase();
                  const kind = kindOfName(f.name);
                  return (
                    <tr key={f.name}>
                      <td className='max-w-0 truncate'>{f.name}</td>
                      <td data-align='left'>
                        {ext === 'eps' ? (
                          <Pill
                            tone='warn'
                            title='EPS is not read — export the pattern as PDF or AI'
                          >
                            unsupported
                          </Pill>
                        ) : kind ? (
                          KIND_LABEL[kind]
                        ) : refusalForName(f.name) ? (
                          <Pill tone='warn'>not read</Pill>
                        ) : (
                          <Pill tone='warn'>unknown format</Pill>
                        )}
                      </td>
                      <td>{f.size ? fmtBytes(f.size) : <EmptyCell />}</td>
                      <td>
                        <Button
                          variant='underline'
                          size='xs'
                          className='text-labelColor hover:text-textColor'
                          onClick={() => setStaged((p) => p.filter((x) => x !== f))}
                          aria-label={`remove ${f.name}`}
                        >
                          ✕
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
          {/* F17: a native CAD / office / archive file is named by its extension before reading,
              with the export that makes it importable (the worker says the same after sniffing). */}
          {staged.some((f) => !kindOfName(f.name) && refusalForName(f.name)) && (
            <CalloutBox tone='warning' className='py-1'>
              {staged.map((f) => {
                const code = kindOfName(f.name) ? null : refusalForName(f.name);
                return code ? (
                  <Text key={f.name} size='micro' component='p'>
                    <b>{f.name}:</b> {refusalMessage(code)}
                  </Text>
                ) : null;
              })}
            </CalloutBox>
          )}

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='main'
              size='sm'
              disabled={
                staged.length === 0 ||
                !!session.busy ||
                staged.some((f) => f.name.toLowerCase().endsWith('.eps'))
              }
              loading={session.busy?.stage === 'extract'}
              onClick={() => void api.dispatch({ type: 'files', files: staged })}
            >
              {read && !dirty ? 're-read files' : 'read files'}
            </Button>
            {stub && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                onClick={() => {
                  const sample = new File(['%PDF-1.7 fixture'], 'palto-tiles-44-52.pdf', {
                    type: 'application/pdf',
                  });
                  setStaged([sample]);
                  void api.dispatch({ type: 'files', files: [sample] });
                }}
              >
                use the sample pattern
              </Button>
            )}
            {read && dirty && (
              <Text size='micro' component='span' className='text-warning'>
                ! the list changed — read the files again
              </Text>
            )}
            {onToggleStub && (
              <Button
                variant='underline'
                size='xs'
                className='ml-auto text-labelColor hover:text-textColor'
                disabled={!!session.busy}
                onClick={onToggleStub}
                title='dev only: the fixture walks every step with made-up data; the worker reads your files'
              >
                {stub ? 'use the real importer' : 'use fixture data'}
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title='pages'
        aside={
          counts.length > 0 && (
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              {counts.map(([c, n]) => `${n} ${c}`).join(' · ')}
            </Text>
          )
        }
      >
        {!read ? (
          <Text size='micro' variant='label' component='p'>
            each page is sorted before anything is drawn: tiles are assembled into the sheet, the
            overview checks the sizes, instructions and covers are set aside.
          </Text>
        ) : (
          <div className='space-y-2'>
            {!extracted.presegmented && <CleanBlock api={api} page={shownPage} />}
            {session.files.map((f) => (
              <div key={f.id}>
                <GroupLabel flush>
                  {f.name} · {KIND_LABEL[f.kind] ?? f.kind} · {f.pages}{' '}
                  {f.pages === 1 ? 'page' : 'pages'}
                </GroupLabel>
                <DataTable>
                  <thead>
                    <tr>
                      <th>page</th>
                      <th data-align='left'>read as</th>
                      <th>sure</th>
                      <th data-align='left'>why</th>
                      {session.clean && !extracted.presegmented && (
                        <>
                          <th title='lines set aside on this page before reading'>set aside</th>
                          <th aria-label='page role' />
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {session.pages
                      .filter((p) => p.file === f.id)
                      .map((p) => (
                        <tr
                          key={p.page}
                          className={
                            shownPage === `${p.file}:${p.page}` ? 'bg-hairline' : 'cursor-pointer'
                          }
                          onClick={() => p.cls === 'tile' && setShownPage(`${p.file}:${p.page}`)}
                        >
                          <td>{p.page + 1}</td>
                          <td data-align='left'>
                            <Pill
                              tone={
                                p.cls === 'tile' ? 'ink' : p.cls === 'unknown' ? 'attention' : 'mut'
                              }
                            >
                              {p.cls}
                            </Pill>
                          </td>
                          <td className={p.confidence < 0.7 ? 'text-warning' : undefined}>
                            {fmtPct(p.confidence, 0)}
                          </td>
                          <td data-align='left' className='text-labelColor'>
                            {p.why}
                          </td>
                          {session.clean && !extracted.presegmented && (
                            <>
                              <td className='tabular-nums'>
                                {masks.get(`${p.file}:${p.page}`) || '—'}
                              </td>
                              <td>
                                {/* the door: a tile set aside, a set-aside page read as a tile */}
                                <Button
                                  variant='underline'
                                  size='xs'
                                  className='text-labelColor hover:text-textColor'
                                  disabled={!!session.busy}
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setRole(p.file, p.page, p.cls === 'tile' ? 'blank' : 'tile');
                                  }}
                                >
                                  {p.cls === 'tile' ? 'set aside' : 'read as tile'}
                                </Button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </DataTable>
              </div>
            ))}
            {session.files.length > 1 && (
              <CalloutBox tone='note'>
                {session.files.length} files — read as one file per size and merged into one run.
              </CalloutBox>
            )}
            {extracted.presegmented && (
              <CalloutBox tone='note'>
                the DXF already carries its pieces as blocks, one per size — the sheet, legend and
                seed steps are answered from the file.
              </CalloutBox>
            )}
            {extracted.warnings.length > 0 && (
              <CalloutBox tone='warning'>
                <Text size='micro' component='p' className='mb-0.5'>
                  <b>
                    {extracted.warnings.length} {extracted.warnings.length === 1 ? 'note' : 'notes'}{' '}
                    from reading
                  </b>
                </Text>
                <ul className='max-h-32 space-y-0.5 overflow-y-auto'>
                  {extracted.warnings.slice(0, 40).map((w, i) => (
                    <li key={i}>
                      <Text size='micro' component='span'>
                        {w}
                      </Text>
                    </li>
                  ))}
                  {extracted.warnings.length > 40 && (
                    <li>
                      <Text size='micro' component='span'>
                        + {extracted.warnings.length - 40} more
                      </Text>
                    </li>
                  )}
                </ul>
              </CalloutBox>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
