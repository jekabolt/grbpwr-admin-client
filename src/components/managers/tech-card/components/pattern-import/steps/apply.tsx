// Step 9 · APPLY — the one irreversible move, said in full before the click (PRODUCT.md: guard the
// irreversible). Every DXF uploads first; only when ALL of them landed does the card form get one
// batch of writes (Codex C5, F7 `applyDraft`). A failed upload leaves the card untouched. The same
// files can also just be downloaded.
//
// MF-C: a scope that already holds a sheet this importer wrote asks "replace the existing sheet"
// (default) or "add as another sheet"; blocks the new file no longer draws are listed, never
// deleted here — removal goes through the piece-match modal, which shows its consequences. After
// the save, piece areas and the size index are measured (run by the card, shown here with retry).
import type { FollowUpCell, FollowUpRow, FollowUpStep } from 'lib/pattern-import/fabrics/followup';
import type { DraftScope } from 'lib/pattern-import/types';
import { useState } from 'react';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import type { ImportSessionApi } from '../use-import-session';
import { Panel, fmtBytes } from '../ui-bits';

const CUT_SYMMETRY_WORD: Record<string, string> = {
  TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL: 'identical',
  TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED: 'mirrored (kept)',
  TECH_CARD_PIECE_CUT_SYMMETRY_FOLD: 'on fold (kept)',
};

/** The card save answered something other than "saved" / "nothing to save". */
const saveFailed = (save?: string) => !!save && save !== 'ok' && save !== 'nothing';

const MATCHED_BY: Record<NonNullable<DraftScope['replaces']>['matchedBy'], string> = {
  sha256: 'same source file',
  source: 'same source file name',
  scope: 'same fabric',
};

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
  const { session, apply, sheetModes, setSheetMode } = api;
  const draft = session.draft;
  if (!draft) return null;
  if (card.downloadOnly) return <DownloadOnly api={api} onClose={onClose} />;
  const running = apply.phase === 'running';
  const done = apply.phase === 'done' ? apply.result : null;
  const progress = apply.phase === 'idle' ? {} : apply.progress;
  const created = draft.pieces.filter((p) => !p.existingLineKey);
  const reused = draft.pieces.filter((p) => p.existingLineKey);
  const toUpload = draft.scopes.filter((s) => !s.alreadyOnCard).length;
  const existingName = (lineKey: string) =>
    card.existingPieces.find((p) => p.lineKey === lineKey)?.name ?? lineKey;
  const modeOf = (sc: DraftScope) => sheetModes[sc.target.scopeKey] ?? 'replace';
  const reimports = draft.scopes.filter((sc) => !!sc.replaces);
  const replacing = reimports.filter((sc) => modeOf(sc) === 'replace');
  const vanishedScopes = replacing.filter((sc) => (sc.vanished ?? []).length > 0);
  const followUpWaitsForSave = !!done?.ok && !!done.writes && done.save !== 'ok' && !stub;

  return (
    <div className='grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px] gap-2 [&>*]:min-h-0 [&>*]:min-w-0'>
      <Panel title='what goes to the card'>
        <GroupLabel flush>files · uploaded first, all or nothing</GroupLabel>
        <DataTable>
          <thead>
            <tr>
              <th>file</th>
              <th data-align='left'>fabric scope</th>
              <th>blocks</th>
              <th>size</th>
              <th data-align='left'>upload</th>
            </tr>
          </thead>
          <tbody>
            {draft.scopes.map((s) => {
              const st = progress[s.target.scopeKey];
              const onCard = !!s.alreadyOnCard;
              return (
                <tr key={s.target.scopeKey}>
                  <td>
                    {s.filename}
                    {s.replaces && (
                      <span className='block text-nano text-labelColor'>
                        {modeOf(s) === 'replace'
                          ? `replaces “${s.replaces.name || s.replaces.filename}”`
                          : 'added next to the previous import'}
                      </span>
                    )}
                  </td>
                  <td data-align='left'>{s.target.label}</td>
                  <td>{s.manifest.blocks.length}</td>
                  <td>{fmtBytes(new Blob([s.dxfText]).size)}</td>
                  <td data-align='left'>
                    {onCard ? (
                      <Pill tone='mut' title={s.alreadyOnCard!.url}>
                        already on the card
                      </Pill>
                    ) : st === 'uploaded' ? (
                      <Pill tone='ok'>uploaded</Pill>
                    ) : st === 'uploading' ? (
                      <Pill tone='attention'>uploading…</Pill>
                    ) : st === 'failed' ? (
                      <Pill tone='warn'>failed</Pill>
                    ) : (
                      <Pill tone='gap'>waiting</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>

        {reimports.length > 0 && (
          <>
            <GroupLabel>previous import on the card</GroupLabel>
            {reimports.map((sc) => {
              const r = sc.replaces!;
              const mode = modeOf(sc);
              const at = formatTechCardDate(r.convertedAt);
              return (
                <div
                  key={sc.target.scopeKey}
                  className='border-b border-hairline py-1.5 last:border-b-0'
                >
                  <div className='flex flex-wrap items-baseline justify-between gap-2'>
                    <Text size='micro' component='span'>
                      {sc.target.label}: “{r.name || r.filename}”
                    </Text>
                    <Text size='nano' variant='label' component='span'>
                      converted{at !== '—' ? ` ${at}` : ''} · {MATCHED_BY[r.matchedBy]}
                    </Text>
                  </div>
                  <ChipRow className='mt-1'>
                    <Chip
                      selected={mode === 'replace'}
                      pressed={mode === 'replace'}
                      disabled={running || !!done?.ok}
                      onClick={() => setSheetMode(sc.target.scopeKey, 'replace')}
                    >
                      replace the existing sheet
                    </Chip>
                    <Chip
                      selected={mode === 'add'}
                      pressed={mode === 'add'}
                      disabled={running || !!done?.ok}
                      onClick={() => setSheetMode(sc.target.scopeKey, 'add')}
                    >
                      add as another sheet
                    </Chip>
                  </ChipRow>
                  <Text size='nano' variant='label' component='p' className='mt-1'>
                    {mode === 'replace'
                      ? 'the new file goes into that row: its name, fabric binding and storage slot stay, the server numbers the new file. the old file leaves the card.'
                      : 'the old sheet stays. the card reads two sheets of one fabric as revisions: it counts the larger of them, not the sum.'}
                  </Text>
                  {mode === 'replace' && (sc.vanished ?? []).length > 0 && (
                    <div className='mt-1.5'>
                      <Text size='nano' component='p'>
                        <b>no longer in the pattern</b> ({sc.vanished!.length}): the new file does
                        not draw these blocks. apply deletes nothing: their links and pieces stay
                        until you remove them in “↔ cut pieces”, which shows what each removal
                        takes with it (recipe rows, norms, areas, operations).
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
                      {!sc.readsBack && (
                        <Text size='nano' component='p' className='mt-1 text-error'>
                          ! the new file did not read back completely (gate G1), so removal is not
                          offered from here.
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        <GroupLabel>
          cut pieces · {created.length} new{reused.length ? ` · ${reused.length} existing` : ''}
        </GroupLabel>
        <DataTable>
          <thead>
            <tr>
              <th>piece</th>
              <th>× garment</th>
              <th data-align='left'>symmetry</th>
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
                <td data-align='left'>{p.fused ? 'yes' : '—'}</td>
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
        <Text size='micro' variant='label' component='p' className='mt-1'>
          new pieces are cut identical: the file already carries both hands of a pair and the
          unfolded fold piece. an existing piece marked mirrored or on fold keeps its mark unless
          the conversion drew both hands or unfolded it.
        </Text>

        {draft.pieceUpdates.length > 0 && (
          <>
            <GroupLabel>existing pieces rewritten</GroupLabel>
            {draft.pieceUpdates.map((u) => (
              <Row key={u.lineKey} label={existingName(u.lineKey)} value={u.reason} />
            ))}
          </>
        )}

        <GroupLabel>block → piece links</GroupLabel>
        <Row label='aliases written' value={draft.aliases.length} />
        <Row label='in scopes' value={[...new Set(draft.aliases.map((a) => a.scopeKey))].length} />
      </Panel>

      <Panel title='apply'>
        {stub && (
          <CalloutBox tone='warning' className='mb-2'>
            <Text size='micro' component='p'>
              <b>stub worker.</b> uploads are simulated and nothing is written to the card — the
              importer core is not wired yet. the download below is the fixture DXF.
            </Text>
          </CalloutBox>
        )}
        {!done && (
          <Text size='micro' component='p' className='mb-2'>
            applying uploads {toUpload} {toUpload === 1 ? 'file' : 'files'}
            {draft.scopes.length > toUpload
              ? ` (${draft.scopes.length - toUpload} already on the card)`
              : ''}
            , then adds {created.length} cut {created.length === 1 ? 'piece' : 'pieces'} and{' '}
            {draft.aliases.length} block links to the card form in one step, and saves the card.
            {replacing.length > 0
              ? ` ${replacing.length} previous ${replacing.length === 1 ? 'sheet is' : 'sheets are'} replaced in place.`
              : ''}{' '}
            once saved, the piece areas and the size index are measured from the new files. if any
            upload fails, the card is not changed.
          </Text>
        )}
        {done?.ok && (
          <CalloutBox tone={saveFailed(done.save) ? 'warning' : 'note'} className='mb-2'>
            {stub ? (
              <Text size='micro' component='p'>
                <b>walked through (simulated).</b> nothing was written.
              </Text>
            ) : done.writes === 0 ? (
              <Text size='micro' component='p'>
                <b>nothing to change.</b> this import is already on the card: same files, same
                pieces, same block links.
              </Text>
            ) : (
              <>
                <Text size='micro' component='p' className='text-success'>
                  <b>applied.</b> {done.uploaded.length}{' '}
                  {done.uploaded.length === 1 ? 'file' : 'files'} uploaded
                  {done.replaced?.length
                    ? ` (${done.replaced.length} into the previous import's ${done.replaced.length === 1 ? 'row' : 'rows'})`
                    : ''}
                  {done.reused?.length ? `, ${done.reused.length} already on the card` : ''}; the
                  card form is updated.
                </Text>
                <Text size='micro' component='p' className='mt-1'>
                  {done.save === 'ok' || done.save === 'nothing'
                    ? 'card saved.'
                    : done.save
                      ? `card not saved yet (${done.save}): the header shows why; autosave retries with the next edit.`
                      : 'the card saves itself in a moment.'}
                </Text>
              </>
            )}
          </CalloutBox>
        )}
        {done?.ok && !stub && followUp && (
          <div className='mb-2'>
            <GroupLabel flush>after the save · areas and size index</GroupLabel>
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
            <Text size='nano' variant='label' component='p' className='mt-1'>
              these are separate saves after the card's own: a failure here does not undo the
              import, and costing waits only for the areas.
            </Text>
          </div>
        )}
        {followUpWaitsForSave && (
          <Text size='nano' variant='label' component='p' className='mb-2'>
            piece areas and the size index are measured after the card saves. once it has, use “∑
            piece areas” on the fabric.
          </Text>
        )}
        {done?.ok && !stub && vanishedScopes.length > 0 && (
          <div className='mb-2'>
            <GroupLabel flush>no longer in the pattern</GroupLabel>
            {vanishedScopes.map((sc) => (
              <Row
                key={sc.target.scopeKey}
                label={`${sc.target.label}: ${sc.vanished!.length} ${sc.vanished!.length === 1 ? 'block' : 'blocks'}`}
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
          <CalloutBox tone='error' className='mb-2'>
            <Text size='micro' component='p'>
              <b>! {done.failedScope}:</b> {done.message}. nothing was written to the card.
            </Text>
            {done.uploaded.length > 0 && (
              <Text size='micro' component='p' className='mt-1'>
                uploaded before the failure and left unused in storage:{' '}
                {done.uploaded.map((u) => u.filename).join(', ')}. there is no delete for uploaded
                pattern files yet, so they stay in storage; applying again uploads them anew.
              </Text>
            )}
            <Button
              variant='underline'
              size='xs'
              className='mt-1 whitespace-nowrap'
              title='saves a JSON file: versions, file names, sizes and checksums, the failed step, the gate and your answers; never the files themselves'
              onClick={api.downloadReport}
            >
              download report
            </Button>
          </CalloutBox>
        )}
        <div className='flex flex-col gap-2'>
          {!done?.ok ? (
            <Button
              variant='main'
              size='lg'
              loading={running}
              disabled={running}
              onClick={() => void api.dispatch({ type: 'apply' })}
            >
              apply to card · {toUpload} {toUpload === 1 ? 'file' : 'files'}, {created.length}{' '}
              {created.length === 1 ? 'piece' : 'pieces'}
            </Button>
          ) : (
            <Button variant='main' size='lg' onClick={onClose}>
              back to the card
            </Button>
          )}
          <Button
            variant='secondary'
            size='sm'
            disabled={running}
            onClick={() => void api.dispatch({ type: 'download' })}
          >
            download .dxf ({draft.downloads.length})
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/**
 * The last step when the BOM has no fabric line (J1): the converted file is the outcome. Nothing
 * is bound or uploaded, so the card-side tables (pieces, links, previous imports) are not shown.
 */
function DownloadOnly({ api, onClose }: { api: ImportSessionApi; onClose: () => void }) {
  const draft = api.session.draft!;
  const pieces = new Set(draft.scopes.flatMap((s) => s.identities)).size;
  // leaving discards the run: the quiet exit appears once the file is saved
  const [saved, setSaved] = useState(false);
  return (
    <div className='grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px] gap-2 [&>*]:min-h-0 [&>*]:min-w-0'>
      <Panel title='what you download'>
        <GroupLabel flush>files · {pieces} pieces</GroupLabel>
        <DataTable>
          <thead>
            <tr>
              <th>file</th>
              <th data-align='left'>fabric</th>
              <th>blocks</th>
              <th>size</th>
            </tr>
          </thead>
          <tbody>
            {draft.scopes.map((s) => (
              <tr key={s.target.scopeKey}>
                <td>{s.filename}</td>
                <td data-align='left'>{s.target.label}</td>
                <td>{s.manifest.blocks.length}</td>
                <td>{fmtBytes(new Blob([s.dxfText]).size)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <Panel title='download'>
        <CalloutBox tone='note' className='mb-2'>
          <Text size='micro' component='p'>
            <b>download only.</b> the BOM has no fabric line, so this import is not applied to the
            card. to apply one, add the fabric on the BOM tab and import again.
          </Text>
        </CalloutBox>
        <div className='flex flex-col gap-2'>
          <Button
            variant='main'
            size='lg'
            onClick={() => {
              void api.dispatch({ type: 'download' });
              setSaved(true);
            }}
          >
            download .dxf ({draft.downloads.length})
          </Button>
          {saved && (
            <Button variant='secondary' size='sm' onClick={onClose}>
              back to the card
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
