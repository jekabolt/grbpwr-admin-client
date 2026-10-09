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
              return (
                <tr key={s.target.scopeKey}>
                  <td>{s.filename}</td>
                  <td data-align='left'>{s.target.label}</td>
                  <td>{s.manifest.blocks.length}</td>
                  <td>{fmtBytes(new Blob([s.dxfText]).size)}</td>
                  <td data-align='left'>
                    {st === 'uploaded' ? (
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
                    <Pill tone='mut'>reuses “{existingName(p.existingLineKey)}”</Pill>
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
              <Row
                key={u.lineKey}
                label={existingName(u.lineKey)}
                value={`→ identical · ${u.reason}`}
              />
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
            applying uploads {draft.scopes.length} {draft.scopes.length === 1 ? 'file' : 'files'},
            then adds {created.length} cut {created.length === 1 ? 'piece' : 'pieces'} and{' '}
            {draft.aliases.length} block links to the card form in one step. if any upload fails,
            the card is not changed. the card still has to be saved afterwards.
          </Text>
        )}
        {done?.ok && (
          <CalloutBox tone='note' className='mb-2'>
            <Text size='micro' component='p' className='text-success'>
              <b>applied.</b> {done.uploaded.length} {done.uploaded.length === 1 ? 'file' : 'files'}{' '}
              {stub
                ? 'walked through (simulated) — nothing was written.'
                : 'uploaded, the form is updated — save the card to keep it.'}
            </Text>
          </CalloutBox>
        )}
        {done && !done.ok && (
          <CalloutBox tone='error' className='mb-2'>
            <Text size='micro' component='p'>
              <b>! upload of {done.failedScope} failed:</b> {done.message}. nothing was written to
              the card.
            </Text>
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
              apply to card · {draft.scopes.length} {draft.scopes.length === 1 ? 'file' : 'files'},{' '}
              {created.length} {created.length === 1 ? 'piece' : 'pieces'}
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
