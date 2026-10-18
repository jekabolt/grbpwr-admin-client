// Stage 1 · FILE — drop anything (owner decision 1: every format), several files = one per size
// (decision 5, merged into one run). Reading runs `open` + `extract`: the worker sniffs each file by
// its CONTENT (adapters/sniff `pickExtractor`), so the "read as" column before reading is only the
// extension's guess. Reading IS the stage's primary ("read 2 files", the wizard footer). After
// reading the pages panel shows only the pages that ask (a doubtful role) — the rest is a count.
import { useRef, useState } from 'react';
import { refusalMessage } from 'lib/pattern-import/adapters/sniff/errors';
import { refusalForName } from 'lib/pattern-import/adapters/sniff/native';
import type { PageClass } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import {
  Button,
  CalloutBox,
  DataTable,
  EmptyCell,
  GroupLabel,
  HeaderWarnings,
  type HeaderWarning,
  Pill,
  PLACEHOLDER_SURFACE,
  Text,
} from 'ui';
import { kindOfName } from '../formats';
import { plural, useWizardPrimary } from '../stages';
import type { ImportSessionApi } from '../use-import-session';
import { DebugFold, Panel, ask, fmtBytes, fmtPct } from '../ui-bits';
import { CleanBlock, PageRoles, pageRoleWarnings } from './files-clean';

const ACCEPT = '.pdf,.dxf,.plt,.hpgl,.hpg,.svg,.ai,.eps,.png,.jpg,.jpeg,.tif,.tiff,.rul,.zip';
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
/**
 * RUL-SPEC §6: a .rul is a grade rule table read WITH its base DXF (one DXF + one RUL, or a ZIP of
 * the two); the worker decides by content (text pairs, binary is refused). By name: a .rul next to
 * one DXF is "grade rules"; a .rul without one is refused as `rul-alone` — said before reading.
 */
const rulAloneOf = (files: readonly File[]) => {
  const ruls = files.filter((f) => extOf(f.name) === 'rul');
  const dxfs = files.filter((f) => extOf(f.name) === 'dxf');
  return ruls.length > 0 && (ruls.length > 1 || dxfs.length !== 1 || files.length !== 2);
};
/** F17 by name — but a .rul / .zip is the worker's call (by content), never refused by name. */
const byNameRefused = (name: string) =>
  kindOfName(name) || ['rul', 'zip'].includes(extOf(name)) ? null : refusalForName(name);
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
  /** The kinds fold on the files panel; null = its own rule (open while a kind is suggested). */
  const [kindsOpen, setKindsOpen] = useState<boolean | null>(null);
  const masks = new Map(
    (session.clean?.pages ?? []).map((m) => [
      `${m.file}:${m.page}`,
      m.items.reduce((a, it) => a + (it.applied ? it.lines : 0), 0),
    ]),
  );
  const pick = useRef<HTMLInputElement>(null);
  const read = session.files.length > 0 && session.scale.candidates.length > 0;
  const dirty =
    staged.length !== inputs.fileList.length || staged.some((f, i) => f !== inputs.fileList[i]);
  const eps = staged.some((f) => f.name.toLowerCase().endsWith('.eps'));
  const rulAlone = rulAloneOf(staged);

  // reading the staged files IS the stage's primary; once read, the shell's "use N pages" is
  useWizardPrimary(
    staged.length > 0 && (!read || dirty)
      ? {
          label: `${read ? 're-read' : 'read'} ${plural(staged.length, 'file')}`,
          onClick: () => void api.dispatch({ type: 'files', files: staged }),
          disabled: !!session.busy || eps || rulAlone,
          title: eps
            ? 'EPS is not read — export the pattern as PDF or AI'
            : rulAlone
              ? 'a .rul is read with its one base DXF'
              : undefined,
        }
      : null,
  );

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    setStaged((prev) => [...prev, ...files.filter((f) => !prev.some((p) => p.name === f.name))]);
  };

  const counts = CLASS_ORDER.map(
    (c) => [c, session.pages.filter((p) => p.cls === c).length] as const,
  ).filter(([, n]) => n > 0);

  // what is true of the read but is not a question: the panel header's `! N warnings`
  const warnings: HeaderWarning[] = read
    ? [
        ...pageRoleWarnings(api),
        ...extracted.warnings.slice(0, 40),
        ...(extracted.warnings.length > 40
          ? [`+ ${extracted.warnings.length - 40} more notes from reading`]
          : []),
      ]
    : [];

  return (
    <div className='grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 [&>*]:min-h-0'>
      <Panel
        title='files'
        aside={
          <Text size='micro' variant='label' component='span'>
            {staged.length || <EmptyCell />}
          </Text>
        }
      >
        {/* the files' zone (THE ASK CONTRACT, ui-bits): the drop target is its own, the kinds
            block (files-clean KindTable) too */}
        <div data-ask-zone='' className='flex h-full flex-col gap-2'>
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
            data-ask-zone=''
            {...ask('files-drop', staged.length === 0, 'drop the files here, or click to pick')}
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
            title='vector PDF · DXF from CLO / Gerber / Optitex · PLT / HPGL · SVG · AI · scans (PNG, JPG, TIFF with a known dpi) — several files are read as one file per size'
            style={PLACEHOLDER_SURFACE}
            className={cn(
              'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-4 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              over ? 'border-textColor' : 'border-borderColor',
              staged.length === 0 && 'flex-1',
            )}
          >
            <Text size='control' variant='uppercase' tracking='label' component='span'>
              {staged.length ? '+ add files' : 'drop pattern files'}
            </Text>
            <Text size='micro' variant='label' component='span'>
              pdf · dxf · plt · svg · ai · scans
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
                  const ext = extOf(f.name);
                  const kind = kindOfName(f.name);
                  return (
                    <tr key={f.name}>
                      <td className='max-w-0 truncate'>{f.name}</td>
                      <td data-align='left'>
                        {ext === 'rul' ? (
                          rulAlone ? (
                            <Pill tone='warn' title={refusalMessage('rul-alone')}>
                              add its DXF
                            </Pill>
                          ) : (
                            'grade rules'
                          )
                        ) : ext === 'zip' ? (
                          <span title='read when it holds one DXF and its .rul'>
                            DXF + grade rules
                          </span>
                        ) : ext === 'eps' ? (
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
                          {...(ext === 'rul' && rulAlone
                            ? ask('files-rul', true, 'add the DXF it grades, or remove it')
                            : ask(
                                'files-eps',
                                ext === 'eps',
                                'remove it, export the pattern as pdf',
                              ))}
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
          {rulAlone && (
            <Text size='micro' component='p' className='text-warning'>
              a .rul holds only the grading — add the DXF it grades
            </Text>
          )}
          {staged.some((f) => byNameRefused(f.name)) && (
            <CalloutBox tone='warning' className='py-1'>
              {staged.map((f) => {
                const code = byNameRefused(f.name);
                return code ? (
                  <Text key={f.name} size='micro' component='p'>
                    <b>{f.name}:</b> {refusalMessage(code)}
                  </Text>
                ) : null;
              })}
            </CalloutBox>
          )}
          {read && dirty && (
            <Text size='micro' component='p' className='text-warning'>
              ! the list changed — read again
            </Text>
          )}

          {read && !extracted.presegmented && (
            <CleanBlock api={api} page={shownPage} open={kindsOpen} onOpenChange={setKindsOpen} />
          )}

          {(stub || onToggleStub) && (
            // dev only: the fixture walks every step with made-up data
            <div className='mt-auto flex flex-wrap items-center gap-2'>
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
          )}
        </div>
      </Panel>

      <Panel
        title='pages'
        aside={
          <>
            {counts.length > 0 && (
              <Text
                size='micro'
                variant='label'
                component='span'
                className='uppercase tracking-label'
              >
                {counts.map(([c, n]) => `${n} ${c}`).join(' · ')}
              </Text>
            )}
            <HeaderWarnings items={warnings} />
          </>
        }
      >
        {read && (
          <>
            {!extracted.presegmented && (
              <PageRoles
                api={api}
                shown={shownPage}
                onShow={(k) => {
                  // the tile is drawn with its mask in the files panel's fold
                  setShownPage(k);
                  setKindsOpen(true);
                }}
              />
            )}
            <DebugFold>
              {session.files.map((f) => (
                <div key={f.id}>
                  <GroupLabel flush>
                    {f.name} · {KIND_LABEL[f.kind] ?? f.kind} · {plural(f.pages, 'page')}
                  </GroupLabel>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>page</th>
                        <th data-align='left'>read as</th>
                        <th>sure</th>
                        <th data-align='left'>why</th>
                        <th title='lines set aside on this page before reading'>set aside</th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.pages
                        .filter((p) => p.file === f.id)
                        .map((p) => (
                          <tr key={p.page}>
                            <td>{p.page + 1}</td>
                            <td data-align='left'>{p.cls}</td>
                            <td className={p.confidence < 0.7 ? 'text-warning' : undefined}>
                              {fmtPct(p.confidence, 0)}
                            </td>
                            <td data-align='left' className='text-labelColor'>
                              {p.why}
                            </td>
                            <td className='tabular-nums'>
                              {masks.get(`${p.file}:${p.page}`) || <EmptyCell />}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </DataTable>
                </div>
              ))}
            </DebugFold>
          </>
        )}
      </Panel>
    </div>
  );
}
