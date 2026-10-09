// Step 9 · APPLY — the one irreversible move, said in full before the click (PRODUCT.md: guard the
// irreversible). Every DXF uploads first; only when ALL of them landed does the card form get one
// batch of writes (Codex C5, F7 `applyDraft`). A failed upload leaves the card untouched. The same
// files can also just be downloaded.
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import type { ImportSessionApi } from '../use-import-session';
import { Panel, fmtBytes } from '../ui-bits';

/** The card save answered something other than "saved" / "nothing to save". */
const saveFailed = (save?: string) => !!save && save !== 'ok' && save !== 'nothing';

export function ApplyStep({
  api,
  card,
  stub,
  onClose,
}: {
  api: ImportSessionApi;
  card: CardContext;
  stub: boolean;
  onClose: () => void;
}) {
  const { session, apply } = api;
  const draft = session.draft;
  if (!draft) return null;
  const running = apply.phase === 'running';
  const done = apply.phase === 'done' ? apply.result : null;
  const progress = apply.phase === 'idle' ? {} : apply.progress;
  const created = draft.pieces.filter((p) => !p.existingLineKey);
  const reused = draft.pieces.filter((p) => p.existingLineKey);
  const toUpload = draft.scopes.filter((s) => !s.alreadyOnCard).length;
  const existingName = (lineKey: string) =>
    card.existingPieces.find((p) => p.lineKey === lineKey)?.name ?? lineKey;

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
                  <td>{s.filename}</td>
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
                  identical
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
          symmetry is always identical: the file already carries both hands of a pair and the
          unfolded fold piece, so the marker must not mirror or fold them again.
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
            {draft.aliases.length} block links to the card form in one step, and saves the card. if
            any upload fails, the card is not changed.
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
        {done && !done.ok && (
          <CalloutBox tone='error' className='mb-2'>
            <Text size='micro' component='p'>
              <b>! {done.failedScope}:</b> {done.message}. nothing was written to the card.
            </Text>
            {done.uploaded.length > 0 && (
              <Text size='micro' component='p' className='mt-1'>
                uploaded before the failure and left unused in storage:{' '}
                {done.uploaded.map((u) => u.filename).join(', ')}. applying again uploads them anew.
              </Text>
            )}
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
