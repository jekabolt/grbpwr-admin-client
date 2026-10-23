// Step 9 · APPLY — the one irreversible move, said in full before the click (PRODUCT.md: guard the
// irreversible). Every DXF uploads first; only when ALL of them landed does the card form get one
// batch of writes (Codex C5, F7 `applyDraft`). A failed upload leaves the card untouched. The same
// files can also just be downloaded.
//
// MF-C: a scope that already holds a sheet replaces it in place. Blocks the new file no longer
// draws are listed, never deleted here. After the save, piece areas and the size index are measured.
//
// import-ux PR5: the screen says the consequences (pieces, sizes, fabric files, what is left out)
// and names replacements before apply. The piece list, block links and assumptions are folds.
import type { FollowUpCell, FollowUpRow, FollowUpStep } from 'lib/pattern-import/fabrics/followup';
import type { DraftScope } from 'lib/pattern-import/types';
import { useContext, useState } from 'react';
import { Button, CalloutBox, DataTable, GroupLabel, Pill, Row, Text, EmptyCell } from 'ui';
import type { CardContext } from '../client';
import type { ImportSessionApi } from '../use-import-session';
import { DebugFold, Fold, Panel, ask, fmtBytes } from '../ui-bits';
import { plural, useWizardPrimary } from '../stages';
import { DroppedLabels, leftOut } from './not-in-file';
import { AssumptionList, autopilotSummary } from '../autopilot/view';

const CUT_SYMMETRY_WORD: Record<string, string> = {
  TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL: 'identical',
  TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED: 'mirrored (kept)',
  TECH_CARD_PIECE_CUT_SYMMETRY_FOLD: 'on fold (kept)',
};

/** The card save answered something other than "saved" / "nothing to save". */
const saveFailed = (save?: string) => !!save && save !== 'ok' && save !== 'nothing';

function FollowUpValue({ cell, onRetry }: { cell: FollowUpCell; onRetry?: () => void }) {
  switch (cell.state) {
    case 'waiting':
      return <Pill tone='gap'>queued</Pill>;
    case 'running':
      return <Pill tone='attention'>saving…</Pill>;
    case 'ok':
      return <Pill tone='ok'>saved</Pill>;
    case 'failed':
      return (
        <span className='inline-flex items-center gap-1.5'>
          <Pill tone='warn'>! not saved</Pill>
          {onRetry && (
            <Button type='button' variant='underline' size='xs' onClick={onRetry}>
              retry
            </Button>
          )}
        </span>
      );
  }
}

export function ApplyStep({
  api,
  card,
  stub,
  onClose,
  followUp = null,
  onRetryFollowUp,
  onReviewPieces,
}: {
  api: ImportSessionApi;
  card: CardContext;
  stub: boolean;
  onClose: () => void;
  followUp?: FollowUpRow[] | null;
  onRetryFollowUp?: (only?: { scopeKey?: string; step?: FollowUpStep }) => void;
  onReviewPieces?: (scopeKey: string) => void;
}) {
  const { session, apply } = api;
  const { labels } = useContext(DroppedLabels);
  const draft = session.draft;
  if (!draft) return null;
  if (card.downloadOnly) return <DownloadOnly api={api} onClose={onClose} />;
  const running = apply.phase === 'running';
  const done = apply.phase === 'done' ? apply.result : null;
  const progress = apply.phase === 'idle' ? {} : apply.progress;
  const created = draft.pieces.filter((p) => !p.existingLineKey);
  const reused = draft.pieces.filter((p) => p.existingLineKey);
  const existingName = (lineKey: string) =>
    card.existingPieces.find((p) => p.lineKey === lineKey)?.name ?? lineKey;
  const reimports = draft.scopes.filter((sc) => !!sc.replaces);
  const vanishedScopes = reimports.filter((sc) => (sc.vanished ?? []).length > 0);
  const followUpWaitsForSave = !!done?.ok && !!done.writes && done.save !== 'ok' && !stub;
  const sizes = [...new Set(draft.scopes.flatMap((sc) => sc.manifest.sizes.map((z) => z.token)))];
  const left = leftOut(api, labels);
  const leftWords = [
    ...left.pieces.map((p) => `${p.what} (${p.why})`),
    ...(left.sizes.length ? [`${left.sizes.join(', ')} (no source)`] : []),
  ];
  const assumptions = api.inputs.autopilot;
  const result = !!done;

  const uploadState = (s: DraftScope) => {
    if (s.alreadyOnCard)
      return (
        <Pill tone='mut' title={s.alreadyOnCard.url}>
          already on the card
        </Pill>
      );
    if (apply.phase === 'idle') return null;
    const st = progress[s.target.scopeKey];
    return st === 'uploaded' ? (
      <Pill tone='ok'>uploaded</Pill>
    ) : st === 'uploading' ? (
      <Pill tone='attention'>uploading…</Pill>
    ) : st === 'failed' ? (
      <Pill tone='warn'>failed</Pill>
    ) : (
      <Pill tone='gap'>waiting</Pill>
    );
  };

  const consequences = (
    <Panel title='to the card'>
      <Row
        label='pieces'
        value={`${created.length} new${reused.length ? ` · ${reused.length} existing` : ''}`}
      />
      <Row label='sizes' value={sizes.length ? sizes.join(' ') : <EmptyCell />} />
      {draft.scopes.map((s) => (
        <Row
          key={s.target.scopeKey}
          label={
            <span
              title={`${s.manifest.blocks.length} blocks · ${fmtBytes(new Blob([s.dxfText]).size)}`}
            >
              {s.target.label}
            </span>
          }
          value={
            <span className='inline-flex items-center gap-1.5'>
              <Text size='micro' variant='label' component='span'>
                {s.filename}
                {s.replaces ? ` → replaces “${s.replaces.name || s.replaces.filename}”` : ''}
              </Text>
              {uploadState(s)}
            </span>
          }
        />
      ))}
      <RulPackage scopes={draft.scopes} />
      {leftWords.length > 0 && (
        // FLY-final M2: what the files leave out is seen before the click
        <Row
          label={<span className='text-warning'>! left out</span>}
          value={
            <span
              className='text-right text-warning'
              title='← back to pieces or sizes to bring one in'
            >
              {leftWords.join(' · ')}
            </span>
          }
          className='[&>span:first-child]:shrink-0 [&>span:last-child]:shrink'
        />
      )}
      {draft.pieceUpdates.length > 0 && (
        <>
          <GroupLabel>card pieces rewritten</GroupLabel>
          {draft.pieceUpdates.map((u) => (
            <Row key={u.lineKey} label={existingName(u.lineKey)} value={u.reason} />
          ))}
        </>
      )}

      {reimports.length > 0 && (
        <>
          <GroupLabel>previous import</GroupLabel>
          {reimports.map((sc) => {
            const r = sc.replaces!;
            return (
              <div
                key={sc.target.scopeKey}
                className='border-b border-hairline py-1.5 last:border-b-0'
              >
                <Text size='micro' component='p'>
                  {sc.target.label}: “{r.name || r.filename}”
                </Text>
                {(sc.vanished ?? []).length > 0 && (
                  <Fold label={`${plural(sc.vanished!.length, 'block')} no longer drawn`}>
                    <Text
                      size='nano'
                      variant='label'
                      component='p'
                      title='apply deletes nothing: their links and pieces stay until you remove them in “↔ cut pieces”, which shows what each removal takes with it (recipe rows, norms, areas, operations)'
                    >
                      kept until removed in ↔ cut pieces
                    </Text>
                    <DataTable className='mt-1'>
                      <thead>
                        <tr>
                          <th data-align='left'>block</th>
                          <th data-align='left'>card piece</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sc.vanished!.map((v) => (
                          <tr key={v.blockName}>
                            <td data-align='left'>{v.blockName}</td>
                            <td data-align='left'>{v.pieceName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </Fold>
                )}
                {(sc.vanished ?? []).length > 0 && !sc.readsBack && (
                  <Text size='nano' component='p' className='mt-1 text-error'>
                    ! the new file did not read back completely (gate G1), so removal is not offered
                    from here.
                  </Text>
                )}
              </div>
            );
          })}
        </>
      )}

      <Fold label={`piece list (${draft.pieces.length})`}>
        <DataTable>
          <thead>
            <tr>
              <th>piece</th>
              <th>× garment</th>
              <th
                data-align='left'
                title='new pieces are cut identical: the file already carries both hands of a pair and the unfolded fold piece. an existing piece marked mirrored or on fold keeps its mark unless the conversion drew both hands or unfolded it.'
              >
                symmetry
              </th>
              <th data-align='left'>grain</th>
              <th data-align='left'>fused</th>
              <th data-align='left'>card</th>
            </tr>
          </thead>
          <tbody>
            {draft.pieces.map((p) => (
              <tr key={p.lineKey}>
                <td>{p.name}</td>
                <td>{p.piecesPerGarment}</td>
                <td data-align='left' className='text-labelColor'>
                  {CUT_SYMMETRY_WORD[p.cutSymmetry] ?? 'identical'}
                </td>
                <td data-align='left'>{p.grainline}</td>
                <td data-align='left'>{p.fused ? 'yes' : <EmptyCell />}</td>
                <td data-align='left'>
                  {p.existingLineKey ? (
                    <Pill
                      tone='mut'
                      title={
                        p.basis === 'alias'
                          ? 'already bound to these blocks on the card'
                          : 'a card piece with this name exists'
                      }
                    >
                      reuses “{existingName(p.existingLineKey)}”
                    </Pill>
                  ) : (
                    <Pill tone='ink'>new</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Fold>

      {/* A10 (D5): what the autopilot assumed stays one click away — open when any is strong */}
      {/* owner 18.10: the guesses in plain words are the header's «auto · N to check»; the raw list in debug */}
      {assumptions.length > 0 && (
        <DebugFold label={autopilotSummary(assumptions)}>
          <AssumptionList
            bare
            assumptions={assumptions}
            onDoor={
              done?.ok || running
                ? undefined
                : (step) => void api.dispatch({ type: 'back', to: step })
            }
          />
        </DebugFold>
      )}

      <DebugFold label='block → piece links'>
        <Row label='aliases written' value={draft.aliases.length} />
        <Row label='in scopes' value={[...new Set(draft.aliases.map((a) => a.scopeKey))].length} />
      </DebugFold>
    </Panel>
  );

  if (!result) return <div className='mx-auto h-full min-h-0 max-w-[880px]'>{consequences}</div>;

  return (
    <div className='grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px] gap-2 [&>*]:min-h-0 [&>*]:min-w-0'>
      {consequences}
      <Panel title='result'>
        {done?.ok && (
          <CalloutBox tone={saveFailed(done.save) ? 'warning' : 'note'} className='mb-2'>
            {stub ? (
              <Text size='micro' component='p'>
                <b>simulated.</b> nothing was written.
              </Text>
            ) : done.writes === 0 ? (
              <Text size='micro' component='p'>
                <b>nothing to change.</b> already on the card.
              </Text>
            ) : (
              <>
                <Text size='micro' component='p' className='text-success'>
                  <b>applied.</b> {plural(done.uploaded.length, 'file')} uploaded
                  {done.replaced?.length ? ` (${done.replaced.length} replaced)` : ''}
                  {done.reused?.length ? `, ${done.reused.length} already on the card` : ''}
                </Text>
                <Text
                  size='micro'
                  component='p'
                  className='mt-1'
                  title={
                    saveFailed(done.save)
                      ? 'the header shows why; autosave retries with the next edit'
                      : undefined
                  }
                >
                  {done.save === 'ok' || done.save === 'nothing'
                    ? 'card saved'
                    : done.save
                      ? `! card not saved yet (${done.save})`
                      : 'card saving…'}
                </Text>
              </>
            )}
          </CalloutBox>
        )}
        {done?.ok && !stub && followUp && (
          <div className='mb-2'>
            <GroupLabel flush>
              <span title="separate saves after the card's own: a failure here does not undo the import, and costing waits only for the areas">
                after the save
              </span>
            </GroupLabel>
            {followUp.map((r) => (
              <div key={r.scopeKey} className='border-b border-hairline py-1 last:border-b-0'>
                <Text size='micro' component='p'>
                  {r.label}
                </Text>
                {(['areas', 'sizeIndex'] as const).map((step) => (
                  <div key={step}>
                    <Row
                      label={step === 'areas' ? 'piece areas' : 'size index'}
                      value={
                        <FollowUpValue
                          cell={r[step]}
                          onRetry={
                            onRetryFollowUp
                              ? () => onRetryFollowUp({ scopeKey: r.scopeKey, step })
                              : undefined
                          }
                        />
                      }
                    />
                    {r[step].detail && (
                      <Text
                        size='nano'
                        variant={r[step].state === 'failed' ? undefined : 'label'}
                        component='p'
                        className={r[step].state === 'failed' ? 'text-error' : undefined}
                      >
                        {r[step].detail}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {followUpWaitsForSave && (
          <Text
            size='nano'
            variant='label'
            component='p'
            className='mb-2'
            title='once the card has saved, use “∑ piece areas” on the fabric'
          >
            areas and size index: after the card saves
          </Text>
        )}
        {done?.ok && !stub && vanishedScopes.length > 0 && (
          <div className='mb-2'>
            <GroupLabel flush>no longer drawn</GroupLabel>
            {vanishedScopes.map((sc) => (
              <Row
                key={sc.target.scopeKey}
                label={`${sc.target.label}: ${plural(sc.vanished!.length, 'block')}`}
                value={
                  sc.readsBack && onReviewPieces ? (
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      title='close the import and open “↔ cut pieces” for this fabric: it checks the full drawing and shows what each removal takes with it'
                      onClick={() => onReviewPieces(sc.target.scopeKey)}
                    >
                      review in ↔ cut pieces
                    </Button>
                  ) : (
                    <Text size='nano' variant='label' component='span'>
                      kept
                    </Text>
                  )
                }
              />
            ))}
          </div>
        )}
        {done && !done.ok && (
          // the failed apply and its one door: the coach's zone
          <div data-ask-zone=''>
            <CalloutBox tone='error' className='mb-2'>
              <Text size='micro' component='p'>
                <b>! {done.failedScope}:</b> {done.message}. the card was not saved.
              </Text>
              {done.uploaded.length > 0 && (
                <Text
                  size='micro'
                  component='p'
                  className='mt-1'
                  title='there is no delete for uploaded pattern files yet, so they stay in storage; applying again uploads them anew'
                >
                  left unused in storage: {done.uploaded.map((u) => u.filename).join(', ')}
                </Text>
              )}
              <Button
                variant='underline'
                size='xs'
                className='mt-1 whitespace-nowrap'
                title='saves a JSON file: versions, file names, sizes and checksums, the failed step, the gate and your answers; never the files themselves'
                onClick={api.downloadReport}
                {...ask('apply-failed', 'download the report, then apply again')}
              >
                download report
              </Button>
            </CalloutBox>
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * The last step when the BOM has no fabric line (J1): the converted file is the outcome. Nothing
 * is bound or uploaded, so the card-side tables (pieces, links, previous imports) are not shown.
 * The footer's primary downloads; once the file is saved it becomes the way back to the card.
 */
function DownloadOnly({ api, onClose }: { api: ImportSessionApi; onClose: () => void }) {
  const draft = api.session.draft!;
  const { labels } = useContext(DroppedLabels);
  const pieces = new Set(draft.scopes.flatMap((s) => s.identities)).size;
  const left = leftOut(api, labels);
  const leftWords = [
    ...left.pieces.map((p) => `${p.what} (${p.why})`),
    ...(left.sizes.length ? [`${left.sizes.join(', ')} (no source)`] : []),
  ];
  // leaving discards the run: the way back appears once the file is saved
  const [saved, setSaved] = useState(false);
  const download = () => {
    void api.dispatch({ type: 'download' });
    setSaved(true);
  };
  useWizardPrimary(
    saved
      ? { label: 'back to the card', onClick: onClose }
      : { label: `download .dxf (${draft.downloads.length})`, onClick: download },
  );
  return (
    <div className='mx-auto h-full min-h-0 max-w-[880px]'>
      <Panel title='what you download'>
        <Row label='pieces' value={pieces} />
        {draft.scopes.map((s) => (
          <Row
            key={s.target.scopeKey}
            label={s.filename}
            value={`${plural(s.manifest.blocks.length, 'block')} · ${fmtBytes(new Blob([s.dxfText]).size)}`}
          />
        ))}
        <RulPackage scopes={draft.scopes} />
        {leftWords.length > 0 && (
          <Row
            label={<span className='text-warning'>! left out</span>}
            value={
              <span
                className='text-right text-warning'
                title='← back to pieces or sizes to bring one in'
              >
                {leftWords.join(' · ')}
              </span>
            }
            className='[&>span:first-child]:shrink-0 [&>span:last-child]:shrink'
          />
        )}
        {saved && (
          <Button variant='underline' size='xs' className='mt-2' onClick={download}>
            download again
          </Button>
        )}
      </Panel>
    </div>
  );
}

function saveText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * RUL-SPEC §6 (write `storage: 'rul'`): a scope packed as base-size DXF + grade rule table offers
 * the two files as downloads (rules, base and the worst expansion error in the tooltip). When it
 * cannot be packed, the first reason in one quiet line; the per-size DXF stays the file either
 * way. A scope written without the option (`rul` absent) shows nothing.
 */
function RulPackage({ scopes }: { scopes: readonly DraftScope[] }) {
  const withRul = scopes.filter((s) => s.rul);
  if (!withRul.length) return null;
  const many = scopes.length > 1;
  return (
    <>
      {withRul.map((s) => {
        const r = s.rul!;
        const label = many ? `${s.target.label} · base + .rul` : 'base + .rul';
        if (!r.ok)
          return (
            <Text
              key={s.target.scopeKey}
              size='micro'
              variant='label'
              component='p'
              className='truncate py-1'
              title={r.reasons.slice(0, 3).join('\n')}
            >
              no .rul{many ? ` for ${s.target.label}` : ''}: {r.reasons[0] ?? 'not gradable'}
            </Text>
          );
        const info = `${plural(r.rules, 'rule')} · base ${r.base} · ${r.sizes.join(' ')} · max error ${r.maxErrMm.toFixed(3)} mm`;
        return (
          <Row
            key={s.target.scopeKey}
            label={<span title={info}>{label}</span>}
            value={
              <span className='inline-flex items-center gap-2' title={info}>
                <button
                  type='button'
                  className='text-micro underline hover:text-labelColor'
                  data-testid='pattern-import-rul-dxf'
                  onClick={() => saveText(r.dxfFilename, r.dxfText, 'application/dxf')}
                >
                  {r.dxfFilename}
                </button>
                <button
                  type='button'
                  className='text-micro underline hover:text-labelColor'
                  data-testid='pattern-import-rul-rul'
                  onClick={() => saveText(r.rulFilename, r.rulText, 'text/plain')}
                >
                  {r.rulFilename}
                </button>
              </span>
            }
          />
        );
      })}
    </>
  );
}
