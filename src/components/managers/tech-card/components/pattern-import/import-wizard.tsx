// IMPORT PATTERN — the full-screen wizard (F13 shell, 08-CONTRACT §4.2).
//
// Lives only in the card's Patterns tab (owner decision 15). Shape = the assembly fullscreen's:
// a Radix dialog over the whole viewport on the grey ground, a chrome strip on top, the stage in
// the middle, an action strip below. Nine steps read as words in a `Stepper`; a reached step is a
// door back (contract: `back{to}` keeps that step's inputs, drops the outputs after it).
import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useRef, useState } from 'react';
import type { ImportSession } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Progress } from 'ui/components/progress';
import { HeaderNote } from 'ui/components/section-header';
import { Stepper } from 'ui/components/stepper';
import Text from 'ui/components/text';
import type {
  ApplyDraftFn,
  CardContext,
  DraftBuilder,
  ImportClient,
  NameSuggester,
} from './client';
import { createAiNamer } from './ai-namer';
import { ApplyStep } from './steps/apply';
import { CheckStep } from './steps/check';
import { DetailsStep } from './steps/details';
import { FabricsStep } from './steps/fabrics';
import { FilesStep } from './steps/files';
import { PiecesStep } from './steps/pieces';
import { ScaleStep } from './steps/scale';
import { SheetStep } from './steps/sheet';
import { SizesStep } from './steps/sizes';
import { ImportWorkerClient } from 'lib/pattern-import/worker/client';
import { createStubClient, createStubNamer, stubApplyDraft, stubBuildDraft } from './stub-client';
import { STEPS, stepIndex, useImportSession } from './use-import-session';

const STAGE_WORD: Record<string, string> = {
  extract: 'reading files',
  scale: 'applying scale',
  assemble: 'assembling the sheet',
  chains: 'tracing lines',
  sizes: 'reading sizes',
  pieces: 'finding pieces',
  'render-som': 'naming pieces',
  semantics: 'building pieces',
  fabrics: 'proposing fabrics',
  write: 'writing DXF + gate',
};

type WizardProps = {
  card: CardContext;
  onClose: () => void;
  client?: ImportClient;
  namer?: NameSuggester;
  buildDraft?: DraftBuilder;
  applyDraft?: ApplyDraftFn;
};

/**
 * Fixture mode (the F13 stub: fixture data, writes nothing) is for building the later steps before
 * their stages land. `VITE_PATTERN_IMPORT_STUB=1` starts in it; dev builds can switch on the files
 * step. Everything else runs the real worker.
 */
const STUB_BY_DEFAULT = import.meta.env.VITE_PATTERN_IMPORT_STUB === '1';

export function ImportWizard(props: WizardProps) {
  const [stub, setStub] = useState(STUB_BY_DEFAULT);
  // A new mode is a new run: the keyed body drops its client and session with it.
  return (
    <WizardBody
      key={stub ? 'stub' : 'worker'}
      {...props}
      onToggleStub={props.client || !import.meta.env.DEV ? undefined : () => setStub((v) => !v)}
      stub={stub}
    />
  );
}

/** Names when there is no AI to ask (VITE_PATTERN_IMPORT_AI=stub on real data): none, honestly. */
const noNames: NameSuggester = async () => [];

function WizardBody({
  card,
  onClose,
  client: clientProp,
  namer: namerProp,
  buildDraft = stubBuildDraft,
  applyDraft = stubApplyDraft,
  stub,
  onToggleStub,
}: WizardProps & { stub: boolean; onToggleStub?: () => void }) {
  // One client per wizard run. useState, not useMemo: the client owns the worker session and must
  // outlive any re-render (React may drop a memo; fast refresh re-runs one).
  const [client] = useState<ImportClient>(
    () => clientProp ?? (stub ? createStubClient() : new ImportWorkerClient()),
  );
  const latest = useRef<ImportSession | null>(null);
  // The real AI namer (F10) needs real renders, so it rides with the real worker; the stub client's
  // render-som draws nothing and keeps the fixture namer. VITE_PATTERN_IMPORT_AI=stub turns the AI
  // off on the worker (no paid calls while the pipeline is tuned): no names, never fixture names
  // on a real file.
  const namer = useMemo(
    () =>
      namerProp ??
      (client.kind === 'worker'
        ? import.meta.env.VITE_PATTERN_IMPORT_AI === 'stub'
          ? noNames
          : createAiNamer()
        : createStubNamer(
            () => latest.current?.pieces?.seeds ?? [],
            () => latest.current?.pieces?.families ?? [],
          )),
    [namerProp, client],
  );
  const api = useImportSession({ client, card, namer, buildDraft, applyDraft });
  latest.current = api.session;
  const { session, blocker } = api;
  const [askClose, setAskClose] = useState(false);

  const at = stepIndex(session.step);
  const nextStep = STEPS[at + 1];
  const applied = api.apply.phase === 'done' && api.apply.result.ok;
  // Leaving discards the run. Nothing is on the card yet (apply is the only writer), but a run
  // with a sheet assembled and pieces named is work — so leaving past the first step asks.
  const requestClose = () => {
    if (at === 0 || applied) onClose();
    else setAskClose(true);
  };

  const body = (() => {
    switch (session.step) {
      case 'files':
        return <FilesStep api={api} stub={client.kind === 'stub'} onToggleStub={onToggleStub} />;
      case 'scale':
        return <ScaleStep api={api} />;
      case 'sheet':
        // Keyed by sheet: the hand-grid form starts from THIS sheet's tiles.
        return <SheetStep key={session.sheet?.sheet.id ?? -1} api={api} />;
      case 'sizes':
        return <SizesStep api={api} card={card} />;
      case 'pieces':
        return <PiecesStep api={api} />;
      case 'meaning':
        return <DetailsStep api={api} card={card} />;
      case 'fabrics':
        return <FabricsStep api={api} card={card} />;
      case 'check':
        return <CheckStep api={api} />;
      case 'apply':
        return <ApplyStep api={api} card={card} stub={client.kind === 'stub'} onClose={onClose} />;
    }
  })();

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          className='fixed inset-0 z-[var(--z-modal)] bg-pageBg p-4 focus:outline-none'
          // The screen itself takes the focus, not the first control: "close" lit up as the
          // focused thing on open read as a prompt to leave.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          onEscapeKeyDown={(e) => {
            // Esc during a stage cancels the stage, not the wizard.
            if (session.busy) {
              e.preventDefault();
              api.cancel();
            }
          }}
        >
          <Dialog.Title className='sr-only'>import pattern</Dialog.Title>
          <Dialog.Description className='sr-only'>
            convert a pattern file of any format into a DXF with named pieces and the card sizes
          </Dialog.Description>
          <div className='grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-2 [&>*]:min-h-0 [&>*]:min-w-0'>
            {/* ── chrome ───────────────────────────────────────────────────────────────── */}
            <header className='flex flex-col gap-1.5 border border-borderColor bg-bgColor px-2 py-1.5'>
              <div className='flex flex-wrap items-center gap-2'>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='label'
                  component='span'
                  className='font-bold'
                >
                  import pattern
                </Text>
                {card.styleLabel && (
                  <Text size='micro' variant='label' component='span'>
                    {card.styleLabel}
                  </Text>
                )}
                {session.files.length > 0 && (
                  <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
                    {session.files.map((f) => f.name).join(', ')}
                  </Text>
                )}
                {client.kind === 'stub' && (
                  <HeaderNote
                    tone='attention'
                    title='the importer core is not wired yet: every step shows fixture data and nothing reaches the card'
                  >
                    stub worker · fixture data
                  </HeaderNote>
                )}
                <span className='ml-auto flex items-center gap-2'>
                  {session.busy && (
                    <span className='flex items-center gap-2' aria-live='polite'>
                      <Text
                        size='micro'
                        variant='label'
                        component='span'
                        className='whitespace-nowrap uppercase tracking-label'
                      >
                        {STAGE_WORD[session.busy.stage] ?? session.busy.stage}
                        {session.busy.note ? ` · ${session.busy.note}` : ''}
                      </Text>
                      <Progress
                        className='w-24'
                        value={(session.busy.done / Math.max(session.busy.total, 1)) * 100}
                      />
                      <Button
                        variant='underline'
                        size='xs'
                        className='text-labelColor hover:text-textColor'
                        onClick={api.cancel}
                        title='stop this stage (esc)'
                      >
                        stop
                      </Button>
                    </span>
                  )}
                  <Chip
                    nonForm
                    onClick={requestClose}
                    title='close the import (the card is not changed)'
                  >
                    close
                  </Chip>
                </span>
              </div>
              <Stepper
                steps={STEPS.map((s, i) => ({
                  done: i < at,
                  current: i === at,
                  label:
                    i < at && !session.busy && !applied ? (
                      <button
                        type='button'
                        className='uppercase underline decoration-borderColor underline-offset-2 hover:decoration-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                        onClick={() => void api.dispatch({ type: 'back', to: s.id })}
                        title={`back to ${s.label} — its answers are kept, later steps re-run`}
                      >
                        {s.label}
                      </button>
                    ) : (
                      s.label
                    ),
                }))}
              />
            </header>

            {/* ── stage ────────────────────────────────────────────────────────────────── */}
            <main className='min-h-0 min-w-0'>{body}</main>

            {/* ── actions ──────────────────────────────────────────────────────────────── */}
            <footer className='flex flex-wrap items-center gap-2 border border-borderColor bg-bgColor px-2 py-1.5'>
              {at > 0 && !applied && (
                <Button
                  variant='secondary'
                  size='sm'
                  disabled={!!session.busy || api.apply.phase === 'running'}
                  onClick={() => void api.dispatch({ type: 'back', to: STEPS[at - 1].id })}
                >
                  ← back
                </Button>
              )}
              <div className='min-w-0 flex-1'>
                {session.error ? (
                  <StageMessage code={api.errorCode} message={session.error} />
                ) : blocker ? (
                  <Text size='micro' component='p' className='text-warning'>
                    ! {blocker}
                  </Text>
                ) : null}
              </div>
              {nextStep && session.step !== 'apply' && (
                <Button
                  variant='main'
                  size='sm'
                  disabled={!!blocker || !!session.busy}
                  loading={!!session.busy}
                  onClick={() => void api.next()}
                >
                  next: {nextStep.label} →
                </Button>
              )}
            </footer>
          </div>

          <ConfirmationModal
            open={askClose}
            onOpenChange={setAskClose}
            onConfirm={() => {
              setAskClose(false);
              onClose();
            }}
            title='discard this import?'
            confirmLabel='discard and close'
            cancelLabel='keep working'
            width='sm'
          >
            <Text size='micro' component='p'>
              the run is not kept: the next import starts from the files again. the card is not
              changed — nothing was applied.
            </Text>
          </ConfirmationModal>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The footer's word on a failed request. A stage that is not built yet is not a failure of the
 * file: it reads as a note (where the import stops today), not as red. A stop is the operator's own.
 */
function StageMessage({ code, message }: { code: string | null; message: string }) {
  if (code === 'stage-unavailable')
    return (
      <CalloutBox tone='note' className='py-1'>
        <Text size='micro' component='p'>
          <b>not built yet:</b> {message}
        </Text>
      </CalloutBox>
    );
  if (code === 'cancelled')
    return (
      <Text size='micro' component='p' className='text-labelColor'>
        {message}
      </Text>
    );
  const head =
    code === 'unsupported-format'
      ? 'cannot read the files'
      : code === 'corrupt'
        ? 'the file is damaged'
        : code === 'crashed'
          ? 'the importer stopped'
          : code === 'no-session'
            ? 'the run was lost'
            : 'stage failed';
  return (
    <CalloutBox tone='error' className='py-1'>
      <Text size='micro' component='p'>
        <b>! {head}:</b> {message}
      </Text>
    </CalloutBox>
  );
}
