import { authoredQuadraticGrid } from 'lib/pattern-import/manifest/authored-internal';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, CalloutBox } from 'ui';
import { readPatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
} from './cad-command-compiled-reimport-handoff-v1';
import { createPatternImportDxfPhaseEBoundDraftCadSessionV1 } from './draft-cad-binding-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import { draftOutlineMoveHistoryV1 } from './draft-cad-outline-move-history-v1';
import { roundDraftConvexOrthogonalCornerV1 } from './draft-cad-round-corner-v1';
import {
  activeDraftCadTransactionsV1,
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';
import { createPatternImportDxfPhaseEDraftCadTopologySessionV1 } from './draft-cad-topology-session-v1';
import { createSavedGeometryReviewRuntimeV1 } from './saved-row-production-runtime-v1';
import {
  captureSavedFixedEndAuthorityV1,
  type SavedFixedEndAuthorityV1,
} from './saved-fixed-end-outline-authority-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

export default function CadTableSavedSharedOutlineEditV1({
  prepared,
  pieceIndex,
  block,
  generation,
  authority,
  onClose,
}: Readonly<{
  prepared: Extract<
    PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
    { ok: true }
  >;
  pieceIndex: number;
  block: string;
  generation: number;
  authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  onClose: () => void;
}>) {
  const { authoringAuthority, catalog, projection, selection, sizeToken, scopeKey } = prepared;
  const { row } = authoringAuthority;
  const piece = catalog.pieces[pieceIndex];
  const initial = useMemo(
    () =>
      createPatternImportDxfPhaseEBoundDraftCadSessionV1({
        projection,
        source: {
          revision: row.revision,
          phaseD: {
            sourceFileId: catalog.sourceFileId,
            sourceSha256: row.sha256,
            selectedGeometrySha256: selection.selection.selectedGeometrySha256,
          },
          catalog,
        },
      }),
    [projection, catalog, row, selection],
  );
  const topology = useMemo(
    () => createPatternImportDxfPhaseEDraftCadTopologySessionV1(catalog.canonicalSha256),
    [catalog],
  );
  const [session, setSession] = useState(initial.session);
  const outlineSize = prepared.draftCadCompileSource.scopes
    .find(({ target }) => target.scopeKey === scopeKey)
    ?.writerReplay?.job.pieces.find(({ identity }) => identity === piece?.pieceId)?.sizes[0];
  const savedRoundCorner = useMemo(() => {
    const authored = outlineSize?.authoredOutlineCorner;
    return authored ? authoredQuadraticGrid(authored) ?? undefined : undefined;
  }, [outlineSize]);
  const canStartRounding = useMemo(() => {
    if (!outlineSize || outlineSize.cutLoops?.length || outlineSize.fold) return false;
    const contour = projection.pieces[pieceIndex]?.contours.find(
      ({ role }) => role === 'cut-boundary',
    );
    if (!contour?.closed) return false;
    const points = contour.vertices.map(({ pointMm }) => pointMm);
    return points.some((_, index) => roundDraftConvexOrthogonalCornerV1(points, index, 1));
  }, [outlineSize, pieceIndex, projection]);
  const [tool, setTool] = useState<'move-point' | 'round-corner'>(
    savedRoundCorner ? 'round-corner' : 'move-point',
  );
  const sessionRef = useRef(session);
  const runtimeRef = useRef<ReturnType<typeof createSavedGeometryReviewRuntimeV1> | null>(null);
  const pending = useRef(false);
  const reviewCapture = useRef<AbortController | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const runtime = createSavedGeometryReviewRuntimeV1({
      resolveCard: authority.resolveCard,
      readAuthoritativeRow: authority.authority.readAuthoritativeRow,
    });
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = null;
      reviewCapture.current?.abort();
      runtime.dispose();
    };
  }, [authority]);

  const publish = (next: PatternImportDxfPhaseEDraftCadSessionV1) => {
    if (pending.current) return;
    const commands = activeDraftCadTransactionsV1(next).flatMap((tx) => tx.commands);
    const [command] = commands;
    const validHistory =
      tool === 'round-corner'
        ? commands.length === 1 && command?.tool === 'round-corner'
        : draftOutlineMoveHistoryV1(commands);
    if (
      next.cursor &&
      (!validHistory ||
        !command ||
        !piece ||
        command.target.pieceId !== piece.pieceId ||
        command.target.pieceLineKey !== piece.pieceLineKey)
    )
      return;
    sessionRef.current = next;
    setSession(next);
    setError('');
  };
  const review = async () => {
    const runtime = runtimeRef.current;
    const captured = sessionRef.current;
    if (!runtime || !captured?.cursor || pending.current) return;
    let fixedEndAuthority: SavedFixedEndAuthorityV1 | undefined;
    const readCurrent = () =>
      runtimeRef.current === runtime &&
      sessionRef.current === captured &&
      (readPatternImportDxfPhaseECardSessionV1(row.techCardId)?.importGeneration ?? 0) ===
        generation
        ? {
            row,
            sizeToken,
            generation,
            session: captured,
            sharedOutlineBlock: block,
            fixedEndAuthority,
          }
        : null;
    pending.current = true;
    setPreparing(true);
    setError('');
    try {
      const [command] = activeDraftCadTransactionsV1(captured).flatMap(({ commands }) => commands);
      if (command?.tool === 'round-corner' && command.payload.fixedEnd) {
        const controller = new AbortController();
        reviewCapture.current = controller;
        fixedEndAuthority = await captureSavedFixedEndAuthorityV1(
          row,
          command.target.pieceLineKey,
          authority.resolveExactCurrentCard,
          controller.signal,
        );
        if (!readCurrent()) return;
      }
      const result = await runtime.prepareSavedGeometryReview(row, readCurrent);
      if (!readCurrent()) return;
      if (!result.ok)
        throw new Error(result.blockers[0]?.detail ?? 'The shared outline could not be compiled.');
      const opened = requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
        artifact: result.artifact,
        confirmedImportGenerationAtCompile: generation,
        cadSessionCursorAtCompile: captured.cursor,
      });
      if (!opened.ok) throw new Error(opened.blocker.detail);
    } catch (err) {
      if (readCurrent())
        setError(err instanceof Error ? err.message : 'Could not review the shared outline.');
    } finally {
      if (runtimeRef.current === runtime) {
        reviewCapture.current = null;
        pending.current = false;
        setPreparing(false);
      }
    }
  };

  return (
    <div
      className='grid min-h-[30rem] min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-bgColor'
      data-cad-saved-shared-outline-edit={block}
    >
      <div className='space-y-1 border-b border-borderColor p-2'>
        <p className='text-small'>
          This outline is shared by all sizes. Its authoring size is {sizeToken}.
        </p>
        {session && piece ? (
          <div className='flex flex-wrap items-center gap-2'>
            {canStartRounding && !savedRoundCorner && (
              <Button
                type='button'
                size='xs'
                variant='secondary'
                disabled={session.history.length > 0 || preparing}
                onClick={() => setTool(tool === 'move-point' ? 'round-corner' : 'move-point')}
              >
                {tool === 'move-point' ? 'Round corner' : 'Move points'}
              </Button>
            )}
            <Button
              type='button'
              variant='main'
              size='xs'
              disabled={!session.cursor || preparing}
              onClick={() => void review()}
            >
              {preparing ? 'Checking saved outline…' : 'Review for all sizes'}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={!session.cursor || preparing}
              onClick={() => {
                const result = undoPatternImportDxfPhaseEDraftCadSessionV1(session);
                if (result.ok) publish(result.session);
              }}
            >
              Undo
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={session.cursor === session.history.length || preparing}
              onClick={() => {
                const result = redoPatternImportDxfPhaseEDraftCadSessionV1(session);
                if (result.ok) publish(result.session);
              }}
            >
              Redo
            </Button>
          </div>
        ) : (
          <CalloutBox tone='error'>The shared outline is unavailable.</CalloutBox>
        )}
        <Button type='button' variant='secondary' size='xs' onClick={onClose}>
          Close outline
        </Button>
        {error && <CalloutBox tone='error'>{error}</CalloutBox>}
      </div>
      {session && piece && (
        <PatternImportDxfPhaseEDraftCadCanvasV1
          session={session}
          projection={projection}
          scopeKey={scopeKey}
          activePieceIndex={pieceIndex}
          activeTool={tool}
          moveSharedOutline
          savedRoundCorner={savedRoundCorner}
          panActive={preparing || (tool === 'round-corner' && session.cursor > 0)}
          topologySession={topology}
          activeTopologyTool={null}
          onSessionChange={publish}
          onTopologyAnchor={() => {}}
        />
      )}
    </div>
  );
}
