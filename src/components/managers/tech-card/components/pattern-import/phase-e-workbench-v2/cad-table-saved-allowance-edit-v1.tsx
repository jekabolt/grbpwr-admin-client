import type { AuthoredAllowanceCornerVariant } from 'lib/pattern-import/types';
import {
  captureSavedFixedEndAuthorityV1,
  type SavedFixedEndAuthorityV1,
} from './saved-fixed-end-outline-authority-v1';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, CalloutBox, Selector } from 'ui';
import { readPatternImportDxfPhaseECardSessionV1 } from '../phase-e-workbench-card-session-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
} from './cad-command-compiled-reimport-handoff-v1';
import { stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1 } from './cad-command-semantic-reimport-session-owner-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import { readCompiledPairedAllowanceReviewV1 } from './draft-cad-geometry-compile-v1';
import {
  applyDraftSavedAllowanceCornerV1,
  type draftSavedAllowanceCornerOptionsV1,
} from './draft-cad-allowance-corner-geometry-v1';
import { compileDraftForOrdinaryReviewV1 } from './draft-cad-saved-add-point-review-v1';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';
import { createPatternImportDxfPhaseEDraftCadTopologySessionV1 } from './draft-cad-topology-session-v1';
import { createSavedPairedAllowanceReviewRuntimeV1 } from './saved-row-production-runtime-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;

type AllowanceTool = 'allowance-offset' | 'edge-length' | 'allowance-corner';
const cornerLabels: Record<AuthoredAllowanceCornerVariant, string> = {
  square: 'Square',
  mitre: 'Mitre',
  clip: 'Clip',
  auto: 'Auto',
};

/** Open one exact native cut-edge edit from the current saved material and grade. */
export default function CadTableSavedAllowanceEditV1({
  prepared,
  pieceIndex,
  canOffset,
  canSetLength,
  cornerOptions,
  generation,
  authority,
  onClose,
}: Readonly<{
  prepared: SavedPrepared;
  pieceIndex: number;
  canOffset: boolean;
  canSetLength: boolean;
  cornerOptions: ReturnType<typeof draftSavedAllowanceCornerOptionsV1>;
  generation: number;
  authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  onClose: () => void;
}>) {
  const { authoringAuthority, catalog, projection, selection, sizeToken, scopeKey } = prepared;
  const { row } = authoringAuthority;
  const piece = catalog.pieces[pieceIndex];
  const writer = prepared.draftCadCompileSource?.scopes.find(
    ({ target }) => target.scopeKey === scopeKey,
  )?.writerReplay?.job;
  const writerPiece = writer?.pieces.find(({ identity }) => identity === piece?.pieceId);
  const savedTurn = writerPiece?.sizes
    .find((size) => size.sizeToken === sizeToken)
    ?.internal.find(({ authoredTurnAllowance }) => authoredTurnAllowance)?.authoredTurnAllowance;
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
  const [tool, setActiveTool] = useState<AllowanceTool>('allowance-offset');
  const modes: { value: AllowanceTool; label: string }[] = [];
  if (canOffset) modes.push({ value: 'allowance-offset', label: 'Offset' });
  if (canSetLength) modes.push({ value: 'edge-length', label: 'Edge length' });
  if (cornerOptions.length) modes.push({ value: 'allowance-corner', label: 'Corner allowance' });
  const activeTool = modes.find(({ value }) => value === tool)?.value ?? modes[0]?.value;
  const [cornerKey, setCornerKey] = useState('select');
  const corner = cornerOptions.find(({ at }) => `${at.x},${at.y}` === cornerKey);
  const [variant, setVariant] = useState<AuthoredAllowanceCornerVariant>('square');
  const choice = corner?.choices.find((c) => c.variant === variant) ?? corner?.choices[0];
  const sessionRef = useRef(session);
  const pending = useRef(false);
  const capture = useRef<AbortController | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const runtimeRef = useRef<ReturnType<typeof createSavedPairedAllowanceReviewRuntimeV1> | null>(
    null,
  );
  useLayoutEffect(() => {
    const runtime = createSavedPairedAllowanceReviewRuntimeV1({
      resolveCard: authority.resolveCard,
      readAuthoritativeRow: authority.authority.readAuthoritativeRow,
    });
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = null;
      capture.current?.abort();
      runtime.dispose();
    };
  }, [authority]);

  if (!initial.ok || !session || !piece || !activeTool)
    return (
      <div className='space-y-2 p-2'>
        <CalloutBox tone='error'>The selected saved piece is unavailable.</CalloutBox>
        <Button type='button' variant='secondary' size='xs' onClick={onClose}>
          Close
        </Button>
      </div>
    );

  const recorded = session.cursor === 1 ? session.history[0]?.commands[0] : undefined;
  const cornerPreview =
    recorded?.tool === 'allowance-corner' && writer && writerPiece
      ? applyDraftSavedAllowanceCornerV1(writerPiece, writer.sizes, recorded.payload.corner)?.find(
          (size) => size.sizeToken === sizeToken,
        )?.cut
      : undefined;

  const record = (next: PatternImportDxfPhaseEDraftCadSessionV1) => {
    const command = next.history[0]?.commands[0];
    if (
      pending.current ||
      sessionRef.current?.cursor !== 0 ||
      next.cursor !== 1 ||
      next.history[0].commands.length !== 1 ||
      command?.tool !== activeTool ||
      command.target.pieceId !== piece.pieceId ||
      command.target.pieceLineKey !== piece.pieceLineKey
    )
      return;
    sessionRef.current = next;
    setSession(next);
    setError('');
  };

  const recordCorner = () => {
    if (!choice || session.cursor !== 0) return;
    const result = recordPatternImportDxfPhaseEDraftCadTransactionV1(session, {
      transactionId: 'saved-allowance-corner',
      label: 'Corner allowance for all sizes',
      commands: [
        {
          commandId: 'saved-allowance-corner',
          tool: 'allowance-corner',
          target: { pieceId: piece.pieceId, pieceLineKey: piece.pieceLineKey },
          payload: {
            entityId: 'saved-allowance-corner',
            sizeToken,
            allRanks: true,
            corner: choice,
          },
        },
      ],
    });
    if (!result.ok) setError(result.blocker.detail);
    else record(result.session);
  };

  const review = async () => {
    const runtime = runtimeRef.current;
    const captured = sessionRef.current;
    if (!runtime || !captured || captured.cursor !== 1 || pending.current) return;
    let guardedAuthority: SavedFixedEndAuthorityV1 | undefined;
    const readCurrent = () =>
      runtimeRef.current === runtime &&
      sessionRef.current === captured &&
      (readPatternImportDxfPhaseECardSessionV1(row.techCardId)?.importGeneration ?? 0) ===
        generation
        ? { row, sizeToken, generation, session: captured, fixedEndAuthority: guardedAuthority }
        : null;
    pending.current = true;
    setPreparing(true);
    setError('');
    try {
      const command = captured.history[0]?.commands[0];
      if (
        command?.tool === 'edge-length' ||
        command?.tool === 'allowance-corner' ||
        (command?.tool === 'allowance-offset' && command.payload.turnAllowance)
      ) {
        const controller = new AbortController();
        capture.current = controller;
        guardedAuthority = await captureSavedFixedEndAuthorityV1(
          row,
          command.target.pieceLineKey,
          authority.resolveExactCurrentCard,
          controller.signal,
        );
        if (!readCurrent()) return;
      }
      const result =
        command?.tool === 'allowance-corner'
          ? await runtime.prepareSavedGeometryReview(row, readCurrent)
          : await compileDraftForOrdinaryReviewV1(
              {
                session: captured,
                projection,
                selection,
                compileSource: prepared.draftCadCompileSource,
              },
              undefined,
              () => runtime.prepareSavedPairedAllowance(row, readCurrent, guardedAuthority),
            );
      if (!readCurrent()) return;
      if (!result.ok)
        throw new Error(result.blockers[0]?.detail ?? 'The saved allowance could not be compiled.');
      if (
        guardedAuthority &&
        command?.tool !== 'allowance-corner' &&
        readCompiledPairedAllowanceReviewV1(result.artifact)?.fixedEndReplacement !==
          guardedAuthority.replacement
      )
        throw new Error('The saved edit requires a verified cut and sewing allowance pair.');
      const staged = await stagePatternImportDxfPhaseECadSemanticCompiledArtifactV1(
        result.artifact,
        {
          confirmedImportGenerationAtCompile: generation,
        },
      );
      if (!readCurrent()) return;
      if (!staged) throw new Error('The saved allowance changed before review.');
      const opened = requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
        artifact: result.artifact,
        confirmedImportGenerationAtCompile: generation,
        cadSessionCursorAtCompile: captured.cursor,
      });
      if (!opened.ok) throw new Error(opened.blocker.detail);
    } catch (err) {
      if (readCurrent())
        setError(err instanceof Error ? err.message : 'Could not review the saved allowance.');
    } finally {
      if (runtimeRef.current === runtime) {
        capture.current = null;
        pending.current = false;
        setPreparing(false);
      }
    }
  };

  return (
    <div
      className='grid min-h-[30rem] min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-bgColor'
      data-cad-saved-allowance-edit=''
      data-cad-saved-allowance-size={sizeToken}
    >
      <div className='border-b border-borderColor'>
        <div className='flex flex-wrap items-center gap-2 px-2 py-1'>
          {modes.length > 1 && (
            <div role='group' aria-label='Allowance edit'>
              <Selector
                label='Allowance edit'
                compact
                disabled={preparing || session.cursor !== 0}
                value={activeTool}
                options={modes}
                onChange={(value: string) => {
                  const selected = modes.find((mode) => mode.value === value);
                  if (selected) setActiveTool(selected.value);
                  setError('');
                }}
              />
            </div>
          )}
          {activeTool === 'allowance-corner' && (
            <>
              <div role='group' aria-label='Sewing corner'>
                <Selector
                  label='Sewing corner'
                  compact
                  disabled={preparing || session.cursor !== 0}
                  value={cornerKey}
                  onChange={(value: string) => {
                    setCornerKey(value);
                    setVariant('square');
                    setError('');
                  }}
                  options={[
                    { value: 'select', label: 'Select sewing corner' },
                    ...cornerOptions.map(({ at, current }) => ({
                      value: `${at.x},${at.y}`,
                      label: `${at.x}, ${at.y} mm${current ? ' · ' + cornerLabels[current.variant] : ''}`,
                    })),
                  ]}
                />
              </div>
              {corner && choice && (
                <div role='group' aria-label='Corner treatment'>
                  <Selector
                    label='Corner treatment'
                    compact
                    disabled={preparing || session.cursor !== 0}
                    value={choice.variant}
                    onChange={(value: string) => {
                      const selected = corner.choices.find((c) => c.variant === value);
                      if (selected) setVariant(selected.variant);
                    }}
                    options={corner.choices.map((c) => ({
                      value: c.variant,
                      label: cornerLabels[c.variant],
                    }))}
                  />
                </div>
              )}
              <Button
                type='button'
                variant='secondary'
                size='xs'
                disabled={preparing || session.cursor !== 0 || !choice}
                onClick={recordCorner}
              >
                Set corner for all five sizes
              </Button>
            </>
          )}
          <Button
            type='button'
            variant='main'
            size='xs'
            disabled={session.cursor !== 1 || preparing}
            onClick={() => void review()}
          >
            {preparing
              ? 'Checking saved allowance…'
              : activeTool === 'allowance-corner'
                ? 'Review allowance for all sizes'
                : `Review allowance for ${sizeToken}`}
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
              {activeTool === 'allowance-corner'
                ? 'Undo allowance corner'
                : activeTool === 'edge-length'
                  ? 'Undo edge length'
                  : 'Undo allowance offset'}
            </Button>
          )}
          {savedTurn && (
            <span className='text-small'>
              {savedTurn.variant === 'single-turn-hem' ? 'Single-turn hem' : 'Cut-on facing'}
            </span>
          )}
          <Button type='button' variant='secondary' size='xs' onClick={onClose}>
            Cancel allowance
          </Button>
        </div>
        {error && (
          <CalloutBox tone='error' className='m-2'>
            {error}
          </CalloutBox>
        )}
      </div>
      <PatternImportDxfPhaseEDraftCadCanvasV1
        key={activeTool}
        session={session}
        projection={projection}
        scopeKey={scopeKey}
        activePieceIndex={pieceIndex}
        activeTool={activeTool}
        savedTurnAllowance={canOffset && !savedTurn}
        savedAllowanceCornerPreview={cornerPreview}
        panActive={session.cursor === 1 || activeTool === 'allowance-corner'}
        topologySession={topology}
        activeTopologyTool={null}
        onSessionChange={record}
        onTopologyAnchor={() => {}}
      />
    </div>
  );
}
