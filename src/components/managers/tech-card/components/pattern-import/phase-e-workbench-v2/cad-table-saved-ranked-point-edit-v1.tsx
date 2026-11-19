import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, CalloutBox } from 'ui';

import { readPatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import { openSavedRankedPointInPatternsV1 } from './cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';
import { createPatternImportDxfPhaseEDraftCadTopologySessionV1 } from './draft-cad-topology-session-v1';
import { createSavedRankedPointReviewRuntimeV1 } from './saved-row-production-runtime-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;

/** A single point editor for a verified saved size. Its only handoff is the ordinary Patterns review. */
export default function CadTableSavedRankedPointEditV1({
  prepared,
  pieceIndex,
  generation,
  authority,
  onClose,
}: Readonly<{
  prepared: SavedPrepared;
  pieceIndex: number;
  generation: number;
  authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  onClose: () => void;
}>) {
  const { authoringAuthority, catalog, projection, selection, sizeToken, scopeKey } = prepared;
  const { row } = authoringAuthority;
  const piece = catalog.pieces[pieceIndex];
  const initial = useMemo(
    () =>
      createPatternImportDxfPhaseEDraftCadSessionV1({
        revision: row.revision,
        phaseD: {
          sourceFileId: catalog.sourceFileId,
          sourceSha256: row.sha256,
          selectedGeometrySha256: selection.selection.selectedGeometrySha256,
        },
        catalog,
      }),
    [catalog, row, selection],
  );
  const topology = useMemo(
    () => createPatternImportDxfPhaseEDraftCadTopologySessionV1(catalog.canonicalSha256),
    [catalog],
  );
  const [session, setSession] = useState(initial.session);
  const sessionRef = useRef(session);
  const [preparing, setPreparing] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const runtimeRef = useRef<ReturnType<typeof createSavedRankedPointReviewRuntimeV1> | null>(null);
  useLayoutEffect(() => {
    const runtime = createSavedRankedPointReviewRuntimeV1({
      resolveCard: authority.resolveCard,
      readAuthoritativeRow: authority.authority.readAuthoritativeRow,
    });
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, [authority]);

  if (!initial.ok || !session || !piece)
    return (
      <div className='space-y-2 p-2'>
        <CalloutBox tone='error'>The selected saved piece is unavailable.</CalloutBox>
        <Button type='button' variant='secondary' size='xs' onClick={onClose}>
          Close
        </Button>
      </div>
    );

  const record = (next: PatternImportDxfPhaseEDraftCadSessionV1) => {
    const command = next.history[0]?.commands[0];
    if (
      pending.current ||
      sessionRef.current?.cursor !== 0 ||
      next.cursor !== 1 ||
      next.history[0].commands.length !== 1 ||
      command?.tool !== 'draft-point' ||
      command.target.pieceId !== piece.pieceId ||
      command.target.pieceLineKey !== piece.pieceLineKey
    )
      return;
    sessionRef.current = next;
    setSession(next);
    setError('');
  };
  const review = async () => {
    const runtime = runtimeRef.current;
    const captured = sessionRef.current;
    if (!runtime || !captured || captured.cursor !== 1 || pending.current) return;
    const readCurrent = () =>
      runtimeRef.current === runtime &&
      sessionRef.current === captured &&
      (readPatternImportDxfPhaseECardSessionV1(row.techCardId)?.importGeneration ?? 0) ===
        generation
        ? { row, sizeToken, generation, session: captured }
        : null;
    pending.current = true;
    setPreparing(true);
    setError('');
    try {
      const review = await runtime.prepareSavedRankedPointReview(row, readCurrent);
      if (!readCurrent()) return;
      if (!review) throw new Error('This saved DXF has no retained ranked Point review.');
      openSavedRankedPointInPatternsV1(row.techCardId, review);
    } catch (err) {
      if (readCurrent())
        setError(err instanceof Error ? err.message : 'Could not review the saved point.');
    } finally {
      if (runtimeRef.current === runtime) {
        pending.current = false;
        setPreparing(false);
      }
    }
  };

  return (
    <div
      className='grid min-h-[30rem] min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-bgColor'
      data-cad-saved-ranked-point-edit=''
      data-cad-draft-point-size={sizeToken}
    >
      <div className='border-b border-borderColor'>
        <div className='flex flex-wrap items-center gap-2 px-2 py-1'>
          <Button
            type='button'
            variant='main'
            size='xs'
            disabled={session.cursor !== 1 || preparing}
            onClick={() => void review()}
          >
            {preparing ? 'Checking saved point…' : `Review point for ${sizeToken}`}
          </Button>
          {session.cursor === 1 && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={preparing}
              onClick={() => {
                sessionRef.current = initial.session;
                setSession(initial.session);
                setError('');
              }}
            >
              Clear point
            </Button>
          )}
          <Button type='button' variant='secondary' size='xs' onClick={onClose}>
            Cancel point
          </Button>
        </div>
        {error && (
          <CalloutBox tone='error' className='m-2'>
            {error}
          </CalloutBox>
        )}
      </div>
      <PatternImportDxfPhaseEDraftCadCanvasV1
        session={session}
        projection={projection}
        scopeKey={scopeKey}
        activePieceIndex={pieceIndex}
        activeTool='draft-point'
        panActive={session.cursor === 1}
        topologySession={topology}
        activeTopologyTool={null}
        onSessionChange={record}
        onTopologyAnchor={() => {}}
      />
    </div>
  );
}
