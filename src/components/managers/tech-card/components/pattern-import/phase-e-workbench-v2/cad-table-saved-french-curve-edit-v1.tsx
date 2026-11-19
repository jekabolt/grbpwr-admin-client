import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, CalloutBox } from 'ui';
import { num as dxfCoordinate } from 'lib/pattern-import/write/format';
import { readPatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
} from './cad-command-compiled-reimport-handoff-v1';
import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import {
  recordSavedFrenchCurveHandleV1,
  type selectSavedFrenchCurveTableEditV1,
} from './draft-cad-saved-french-curve-v1';
import {
  activeDraftCadTransactionsV1,
  redoPatternImportDxfPhaseEDraftCadSessionV1,
  undoPatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';
import { createPatternImportDxfPhaseEDraftCadTopologySessionV1 } from './draft-cad-topology-session-v1';
import { createSavedGeometryReviewRuntimeV1 } from './saved-row-production-runtime-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

export default function CadTableSavedFrenchCurveEditV1({
  candidate,
  generation,
  authority,
  onClose,
}: Readonly<{
  candidate: NonNullable<ReturnType<typeof selectSavedFrenchCurveTableEditV1>>;
  generation: number;
  authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  onClose: () => void;
}>) {
  const { input, row, target, curve } = candidate;
  const { projection, selection } = input;
  const pieceIndex = projection.pieces.findIndex(
    (piece) => piece.pieceId === target.pieceId && piece.pieceLineKey === target.pieceLineKey,
  );
  const [session, setSession] = useState(input.session);
  const sessionRef = useRef(session);
  const [preparing, setPreparing] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const runtimeRef = useRef<ReturnType<typeof createSavedGeometryReviewRuntimeV1> | null>(null);
  const topology = useMemo(
    () =>
      createPatternImportDxfPhaseEDraftCadTopologySessionV1(
        input.session.source.catalog.canonicalSha256,
      ),
    [input.session],
  );
  useLayoutEffect(() => {
    const runtime = createSavedGeometryReviewRuntimeV1({
      resolveCard: authority.resolveCard,
      readAuthoritativeRow: authority.authority.readAuthoritativeRow,
    });
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, [authority]);

  const publish = (next: PatternImportDxfPhaseEDraftCadSessionV1) => {
    if (pending.current) return;
    const commands = activeDraftCadTransactionsV1(next).flatMap((tx) => tx.commands);
    const [command] = commands;
    if (
      next.cursor !== 0 &&
      (commands.length !== 1 ||
        command?.tool !== 'french-curve' ||
        command.payload.savedCurve?.sourcePathId !== curve.savedCurve.sourcePathId ||
        command.target.pieceId !== target.pieceId ||
        command.target.pieceLineKey !== target.pieceLineKey)
    )
      return;
    sessionRef.current = next;
    setSession(next);
    setError('');
  };

  const review = async () => {
    const runtime = runtimeRef.current;
    const captured = sessionRef.current;
    if (!runtime || captured.cursor === 0 || pending.current) return;
    const sizeToken = selection.selection.sizeToken;
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
      const result = await runtime.prepareSavedGeometryReview(row, readCurrent);
      if (!readCurrent()) return;
      if (!result.ok)
        throw new Error(
          result.blockers[0]?.detail ?? 'The saved French curve could not be compiled.',
        );
      const opened = requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
        artifact: result.artifact,
        confirmedImportGenerationAtCompile: generation,
        cadSessionCursorAtCompile: captured.cursor,
      });
      if (!opened.ok) throw new Error(opened.blocker.detail);
    } catch (err) {
      if (readCurrent())
        setError(err instanceof Error ? err.message : 'Could not review the saved French curve.');
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
      data-cad-saved-french-curve-edit=''
      data-cad-saved-french-curve-size={selection.selection.sizeToken}
    >
      <div className='border-b border-borderColor'>
        <div className='flex flex-wrap items-center gap-2 px-2 py-1'>
          <Button
            type='button'
            variant='main'
            size='xs'
            disabled={session.cursor === 0 || preparing}
            onClick={() => void review()}
          >
            {preparing ? 'Checking saved French curve…' : 'Review French curve'}
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={session.cursor === 0 || preparing}
            onClick={() => {
              const undone = undoPatternImportDxfPhaseEDraftCadSessionV1(session);
              if (undone.ok) publish(undone.session);
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
              const redone = redoPatternImportDxfPhaseEDraftCadSessionV1(session);
              if (redone.ok) publish(redone.session);
            }}
          >
            Redo
          </Button>
          <Button type='button' variant='secondary' size='xs' onClick={onClose}>
            Close French curve
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
        scopeKey={selection.selection.scopeKey}
        activePieceIndex={pieceIndex}
        activeTool='french-curve'
        savedFrenchCurveOnly
        savedFrenchCurve={
          session.cursor === 0
            ? {
                key: String(curve.savedCurve.sourcePathId),
                pointsMm: curve.pointsMm,
                primitive: {
                  kind: 'curve',
                  role: 'french-curve',
                  tool: 'french-curve',
                  commandId: 'saved-french-curve',
                  entityId: 'saved-french-curve',
                  target,
                  controlPointsMm: curve.controlPointsMm,
                },
                onEdit: (handle, point) => {
                  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                  const edit = recordSavedFrenchCurveHandleV1(
                    { ...input, session },
                    target,
                    handle,
                    {
                      x: Number(dxfCoordinate(point.x)),
                      y: Number(dxfCoordinate(point.y)),
                    },
                  );
                  if (edit?.ok) publish(edit.session);
                },
              }
            : null
        }
        panActive={preparing}
        topologySession={topology}
        activeTopologyTool={null}
        onSessionChange={publish}
        onTopologyAnchor={() => {}}
      />
    </div>
  );
}
