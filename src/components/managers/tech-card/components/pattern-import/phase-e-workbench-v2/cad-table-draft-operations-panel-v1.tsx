import { Fragment, useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button, CalloutBox, Pill, Text } from 'ui';

import {
  resolvePatternImportDxfPhaseECadOperationSwitchIndexV1,
  type PatternImportDxfPhaseECadOperationNavigationItemV1,
  type PatternImportDxfPhaseECadOperationNavigationV1,
} from './cad-operation-navigation-v1';
import type {
  PatternImportDxfPhaseECadCommandDraftResultV1,
  PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1,
} from './cad-table-draft-operation-session-bridge-v1';
import type { PatternImportDxfPhaseEStitchVisualV1 } from './stitch-visual-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_AUTHORING_HANDOFF_V1,
  type PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1,
  type PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1,
} from './cad-command-draft-authoring-handoff-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 } from './cad-workbench-stitch-editor-handoff-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1 } from './cad-workbench-stitch-route-intent-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_DRAFT_OPERATIONS_PANEL_V1 =
  'pattern-import-dxf-phase-e-cad-table-draft-operations-panel/1' as const;

function ContextGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className='min-w-0 space-y-1'>
      <Text component='p' size='micro' variant='label' className='uppercase'>
        {label}
      </Text>
      <div className='flex min-w-0 flex-wrap gap-1'>{children}</div>
    </div>
  );
}

function EmptyContext() {
  return (
    <Text component='span' size='micro' variant='label'>
      —
    </Text>
  );
}

function CurrentOperationStatus({
  item,
}: Readonly<{ item: PatternImportDxfPhaseECadOperationNavigationItemV1 | null }>) {
  if (!item) return <Pill tone='gap'>operation unavailable</Pill>;
  const { status } = item;
  return (
    <div className='flex flex-wrap gap-1' data-cad-current-operation-status=''>
      {status.missing ? <Pill tone='warn'>missing</Pill> : null}
      {status.broken ? <Pill tone='warn'>broken</Pill> : null}
      {status.review ? <Pill tone='attention'>review</Pill> : null}
      {status.draft ? <Pill tone='attention'>draft</Pill> : null}
      {!status.problem && !status.review && !status.draft ? <Pill tone='ok'>ready</Pill> : null}
    </div>
  );
}

function StitchContext({
  stitch,
  capabilities,
  onEditStitchField,
}: Readonly<{
  stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
  capabilities?: PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1;
  onEditStitchField?: (field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1) => void;
}>) {
  if (!stitch) return <EmptyContext />;
  const facts = [
    { value: stitch.seam.classLabel ?? stitch.seam.kind },
    {
      field: 'density' as const,
      value: stitch.stitch.densityPerCm === null ? null : `${stitch.stitch.densityPerCm}/cm`,
    },
    { value: stitch.stitch.widthMm === null ? null : `${stitch.stitch.widthMm} mm stitch` },
    { field: 'type' as const, value: stitch.topstitch.modeLabel },
    {
      field: 'offset' as const,
      value: stitch.topstitch.offsetMm === null ? null : `${stitch.topstitch.offsetMm} mm offset`,
    },
    { value: stitch.topstitch.rows === null ? null : `${stitch.topstitch.rows} row` },
    {
      field: 'gauge' as const,
      value:
        stitch.machine.needleGaugeMm === null ? null : `${stitch.machine.needleGaugeMm} mm gauge`,
    },
    {
      value:
        stitch.machine.rowSpacingMm === null
          ? null
          : `${stitch.machine.rowSpacingMm} mm row spacing`,
    },
    {
      field: 'thread' as const,
      value: stitch.thread.bomLineKey ? `thread ${stitch.thread.bomLineKey}` : null,
    },
  ].filter(
    (
      fact,
    ): fact is { value: string; field?: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 } =>
      Boolean(fact.value),
  );
  return facts.length ? (
    <Text component='span' size='micro' className='leading-snug'>
      {facts.map((fact, index) => {
        const editable = fact.field && capabilities?.[fact.field]?.editable && onEditStitchField;
        return (
          <Fragment key={`${fact.field ?? 'fact'}:${fact.value}`}>
            {index ? ' · ' : null}
            {editable && fact.field ? (
              <Button
                type='button'
                size='xs'
                variant='underline'
                className='inline !p-0 normal-case tracking-normal'
                data-cad-edit-stitch-field={fact.field}
                onClick={() =>
                  onEditStitchField(
                    fact.field as PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1,
                  )
                }
              >
                {fact.value}
              </Button>
            ) : (
              fact.value
            )}
          </Fragment>
        );
      })}
    </Text>
  ) : (
    <EmptyContext />
  );
}

function CadCommandDraftHandoffSection({
  drafts,
  owner,
  sourceLocked,
  operationNumber,
  onHandoff,
}: Readonly<{
  drafts: PatternImportDxfPhaseECadCommandDraftResultV1;
  owner?: PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1;
  sourceLocked: boolean;
  operationNumber: number;
  onHandoff?: (result: PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1) => void;
}>) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [handoffResult, setHandoffResult] =
    useState<PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1 | null>(null);
  const draftIdentity = drafts.ok
    ? drafts.drafts.map(({ draftOperationId }) => draftOperationId).join('\u0000')
    : '';

  useEffect(() => {
    setSelectedIds([]);
    setHandoffResult(null);
  }, [draftIdentity, operationNumber]);

  if (!drafts.ok)
    return (
      <CalloutBox tone='error'>
        <Text component='p' className='font-bold'>
          Pattern edit draft blocked
        </Text>
        <Text component='p' size='micro'>
          {drafts.blocker.detail} [{drafts.blocker.code}]
        </Text>
      </CalloutBox>
    );
  if (!drafts.drafts.length) return null;

  const toggle = (draftOperationId: string) =>
    setSelectedIds((current) =>
      current.includes(draftOperationId)
        ? current.filter((id) => id !== draftOperationId)
        : [...current, draftOperationId],
    );
  const handoff = () => {
    if (owner?.status !== 'available' || sourceLocked) return;
    const first = drafts.drafts[0];
    if (!first) return;
    const result = owner.ingest({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_AUTHORING_HANDOFF_V1,
      sourceRevision: first.sourceRevision,
      operationRef: first.operationRef,
      operationNumber: first.operationNumber,
      assemblyRevision: owner.assemblyRevision,
      selectedDraftIds: selectedIds,
      candidates: drafts,
    });
    setHandoffResult(result);
    onHandoff?.(result);
    if (result.ok) setSelectedIds([]);
  };

  return (
    <div className='space-y-2 border-t border-hairline pt-3'>
      <div className='flex items-center justify-between gap-2'>
        <Text component='p' size='micro' className='font-bold'>
          Pattern edits
        </Text>
        <Pill tone={sourceLocked ? 'ok' : 'attention'}>
          {sourceLocked ? 'handed off · source locked' : 'draft'}
        </Pill>
      </div>
      {owner?.status === 'available' && !sourceLocked ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Button
            type='button'
            size='xs'
            variant='underline'
            onClick={() =>
              setSelectedIds(
                selectedIds.length === drafts.drafts.length
                  ? []
                  : drafts.drafts.map(({ draftOperationId }) => draftOperationId),
              )
            }
          >
            {selectedIds.length === drafts.drafts.length ? 'Clear selection' : 'Select batch'}
          </Button>
          <Button
            type='button'
            size='xs'
            variant='main'
            disabled={!selectedIds.length}
            onClick={handoff}
            data-cad-command-authoring-handoff=''
          >
            Add {selectedIds.length || 'selected'} to Assembly Order
          </Button>
        </div>
      ) : !sourceLocked ? (
        <Text component='p' size='micro' variant='label' data-cad-command-authoring-unavailable=''>
          {owner?.status === 'unavailable'
            ? `${owner.blocker.detail} [${owner.blocker.code}]`
            : 'Assembly Order authoring owner unavailable [authoring-owner-unavailable]'}
        </Text>
      ) : null}
      <ol className='divide-y divide-borderColor' data-cad-command-draft-list=''>
        {drafts.drafts.map((draft) => (
          <li
            key={draft.draftOperationId}
            className='space-y-1 py-2'
            data-cad-command-draft={draft.draftOperationId}
            data-cad-command-kind={draft.processKind}
          >
            <div className='flex items-start justify-between gap-2'>
              {owner?.status === 'available' && !sourceLocked ? (
                <input
                  type='checkbox'
                  className='mt-0.5 h-4 w-4 shrink-0 accent-textColor'
                  aria-label={`Select ${draft.label}`}
                  checked={selectedIds.includes(draft.draftOperationId)}
                  onChange={() => toggle(draft.draftOperationId)}
                />
              ) : null}
              <div className='min-w-0'>
                <Text component='p' size='micro' className='truncate font-bold'>
                  {draft.label}
                </Text>
                <Text component='p' size='micro' variant='label'>
                  revision {draft.sourceRevision} · order {draft.order + 1}
                </Text>
              </div>
              <Pill tone='mut'>{draft.processKind}</Pill>
            </div>
            <div className='flex flex-wrap gap-x-2 gap-y-1 text-micro'>
              {draft.parameters.map((parameter) => (
                <span key={parameter.label}>
                  <span className='text-labelColor'>{parameter.label}</span>{' '}
                  <span className='font-bold'>{parameter.value}</span>
                </span>
              ))}
            </div>
            <Text component='p' size='micro' variant='label'>
              Depends on:{' '}
              <span data-cad-command-dependencies={draft.draftOperationId}>
                {draft.dependsOnDraftIds.length ? draft.dependsOnDraftIds.join(' → ') : 'none'}
              </span>
            </Text>
          </li>
        ))}
      </ol>
      {handoffResult && !handoffResult.ok ? (
        <CalloutBox tone='error'>
          <Text component='p' className='font-bold'>
            Pattern edit handoff blocked
          </Text>
          <Text component='p' size='micro'>
            {handoffResult.blocker.detail} [{handoffResult.blocker.code}]
          </Text>
        </CalloutBox>
      ) : handoffResult?.ok ? (
        <CalloutBox tone='note'>
          <Text component='p' size='micro'>
            Added {handoffResult.inserted} draft operation
            {handoffResult.inserted === 1 ? '' : 's'} to the existing Assembly Order form.
          </Text>
        </CalloutBox>
      ) : null}
    </div>
  );
}

export function PatternImportDxfPhaseECadTableDraftOperationsPanelV1({
  editor,
  result,
  operationNumber,
  navigation = null,
  stitchVisual = null,
  cadCommandDrafts = null,
  cadCommandAuthoringHandoff,
  cadCommandSourceLocked = false,
  onCadCommandAuthoringHandoff,
  onSelectOperation,
  onFocusOperation,
  stitchEditCapabilities,
  onEditStitchField,
}: Readonly<{
  /** The one caller-owned OperationEditor node. This component never creates another owner. */
  editor: ReactNode;
  result: PatternImportDxfPhaseECadTableDraftOperationSessionBridgeResultV1;
  operationNumber: number;
  /** Read-only projection built beside the sole OperationsField useFieldArray owner. */
  navigation?: PatternImportDxfPhaseECadOperationNavigationV1 | null;
  stitchVisual?: PatternImportDxfPhaseEStitchVisualV1 | null;
  cadCommandDrafts?: PatternImportDxfPhaseECadCommandDraftResultV1 | null;
  cadCommandAuthoringHandoff?: PatternImportDxfPhaseECadCommandAuthoringHandoffOwnerV1;
  cadCommandSourceLocked?: boolean;
  onCadCommandAuthoringHandoff?: (
    result: PatternImportDxfPhaseECadCommandAuthoringHandoffResultV1,
  ) => void;
  /** Routes selection back to OperationsField.setSelected; this panel owns no operation state. */
  onSelectOperation?: (index: number) => void;
  onFocusOperation?: (operationNumber: number) => void;
  /** Read-only capability projection; absent/blocked facts stay plain text, never dead buttons. */
  stitchEditCapabilities?: PatternImportDxfPhaseECadWorkbenchStitchEditCapabilitiesV1;
  /** Routes a supported fact back to the one caller-owned OperationEditor. */
  onEditStitchField?: (field: PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1) => void;
}>) {
  const currentItem =
    navigation?.items.find(({ index }) => index === navigation.selectedIndex) ?? null;
  const previousIndex = navigation
    ? resolvePatternImportDxfPhaseECadOperationSwitchIndexV1(navigation, 'previous')
    : null;
  const nextIndex = navigation
    ? resolvePatternImportDxfPhaseECadOperationSwitchIndexV1(navigation, 'next')
    : null;
  const selectOperation = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = Number(event.currentTarget.value);
    if (Number.isSafeInteger(next)) onSelectOperation?.(next);
  };
  const issueCount =
    (currentItem?.context.warnings.length ?? 0) +
    (result.ok ? 0 : 1) +
    (cadCommandDrafts && !cadCommandDrafts.ok ? 1 : 0);
  const canSwitchOperation = Boolean(navigation?.items.length && onSelectOperation);

  return (
    <div className='min-h-full bg-bgColor' data-cad-draft-operations-panel-v1=''>
      <div data-cad-current-operation-content=''>
        <header className='sticky top-0 z-10 space-y-2 border-b border-borderColor bg-bgColor p-2'>
          {canSwitchOperation ? (
            <div className='flex items-center gap-1' aria-label='Assembly Order operation switcher'>
              {previousIndex !== null ? (
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  aria-label='Previous operation'
                  data-cad-operation-switch='previous'
                  onClick={() => onSelectOperation?.(previousIndex)}
                >
                  ←
                </Button>
              ) : (
                <span
                  aria-hidden
                  className='h-8 w-8 shrink-0'
                  data-cad-operation-switch-boundary='previous'
                />
              )}
              <label className='min-w-0 flex-1'>
                <span className='sr-only'>Current Assembly Order operation</span>
                <select
                  className='h-8 w-full border border-borderColor bg-bgColor px-2 text-micro font-bold text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
                  aria-label='Current Assembly Order operation'
                  value={navigation?.selectedIndex ?? ''}
                  onChange={selectOperation}
                >
                  {(navigation?.items ?? []).map((item) => (
                    <option key={item.index} value={item.index}>
                      #{item.operationNumber} · {item.title}
                    </option>
                  ))}
                </select>
              </label>
              {nextIndex !== null ? (
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  aria-label='Next operation'
                  data-cad-operation-switch='next'
                  onClick={() => onSelectOperation?.(nextIndex)}
                >
                  →
                </Button>
              ) : (
                <span
                  aria-hidden
                  className='h-8 w-8 shrink-0'
                  data-cad-operation-switch-boundary='next'
                />
              )}
            </div>
          ) : null}

          <div className='flex min-w-0 items-start justify-between gap-2'>
            <div className='min-w-0'>
              <Text component='p' size='micro' variant='label' className='tabular-nums'>
                OPERATION #{currentItem?.operationNumber ?? operationNumber}
              </Text>
              <Text
                component='p'
                className='truncate font-bold'
                data-cad-current-operation-title=''
              >
                {currentItem?.title ?? 'Linked Assembly Order operation'}
              </Text>
            </div>
            <div className='flex flex-wrap justify-end gap-1'>
              <CurrentOperationStatus item={currentItem} />
              {issueCount ? <Pill tone='warn'>{issueCount} issues</Pill> : null}
            </div>
          </div>
        </header>

        <div
          className='flex min-h-8 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-hairline bg-pageBg px-2 py-1'
          aria-label='Current operation summary'
          data-cad-current-operation-summary=''
        >
          {currentItem?.work ? <Pill tone='ink'>{currentItem.work}</Pill> : null}
          {currentItem?.typeLabel && currentItem.typeLabel !== currentItem.work ? (
            <Text component='span' size='micro' variant='label'>
              {currentItem.typeLabel}
            </Text>
          ) : null}
          <Text component='span' size='micro' className='font-bold'>
            {currentItem?.context.inputs.map(({ label }) => label).join(' + ') || 'No inputs'}
          </Text>
          <Text component='span' size='micro' variant='label'>
            →
          </Text>
          {currentItem?.context.seamKeys.length ? (
            <Text component='span' size='micro' className='font-bold'>
              {currentItem.context.seamKeys.join(' + ')}
            </Text>
          ) : (
            <Text component='span' size='micro' variant='label'>
              no seam
            </Text>
          )}
          <Text component='span' size='micro' variant='label'>
            →
          </Text>
          <Text component='span' size='micro' className='font-bold'>
            {currentItem?.context.output?.label ?? 'No output'}
          </Text>
          <span className='mx-1 h-4 w-px shrink-0 bg-borderColor' />
          <StitchContext
            stitch={stitchVisual}
            capabilities={stitchEditCapabilities}
            onEditStitchField={onEditStitchField}
          />
          {currentItem?.context.bomRefs.map((material) => (
            <Pill key={material.key} tone='mut' title={material.key}>
              {material.label}
            </Pill>
          ))}
        </div>

        <details className='border-b border-hairline' data-cad-operation-context-pane=''>
          <summary className='cursor-pointer bg-bgColor px-3 py-2 text-micro font-bold uppercase tracking-label'>
            Context
          </summary>
          <section
            className='grid grid-cols-1 gap-3 bg-pageBg p-3'
            aria-label='Current operation context'
            data-cad-current-operation-context=''
          >
            <div className='grid grid-cols-2 gap-3'>
              <ContextGroup label='Inputs / pieces'>
                {currentItem?.context.inputs.length ? (
                  currentItem.context.inputs.map((input) => (
                    <Pill key={input.key} tone='mut'>
                      {input.label}
                    </Pill>
                  ))
                ) : (
                  <EmptyContext />
                )}
              </ContextGroup>
              <ContextGroup label='Output'>
                {currentItem?.context.output ? (
                  <Pill tone='ink'>{currentItem.context.output.label}</Pill>
                ) : (
                  <EmptyContext />
                )}
              </ContextGroup>
              <ContextGroup label='Seams'>
                {currentItem?.context.seamKeys.length ? (
                  currentItem.context.seamKeys.map((key) => (
                    <Pill key={key} tone='mut'>
                      {key}
                    </Pill>
                  ))
                ) : (
                  <EmptyContext />
                )}
              </ContextGroup>
              <ContextGroup label='BOM / materials'>
                {currentItem?.context.bomRefs.length ? (
                  currentItem.context.bomRefs.map((material) => (
                    <Pill key={material.key} tone='mut' title={material.key}>
                      {material.label}
                    </Pill>
                  ))
                ) : (
                  <EmptyContext />
                )}
              </ContextGroup>
            </div>
            <ContextGroup label='Stitch / gauge / offset / thread'>
              <StitchContext
                stitch={stitchVisual}
                capabilities={stitchEditCapabilities}
                onEditStitchField={onEditStitchField}
              />
            </ContextGroup>
            {currentItem?.context.warnings.length ? (
              <ContextGroup label='Warnings'>
                {currentItem.context.warnings.map((warning) => (
                  <Pill key={warning} tone='warn'>
                    {warning}
                  </Pill>
                ))}
              </ContextGroup>
            ) : null}
          </section>
        </details>
      </div>

      <details className='border-b border-hairline' data-cad-operation-spec-pane=''>
        <summary className='cursor-pointer bg-bgColor px-3 py-2 text-micro font-bold uppercase tracking-label'>
          Spec · authoritative editor
        </summary>
        <div data-cad-current-operation-editor-owner=''>{editor}</div>
      </details>

      <details data-cad-operation-draft-pane=''>
        <summary className='cursor-pointer bg-bgColor px-3 py-2 text-micro font-bold uppercase tracking-label'>
          Draft · Pattern edits
        </summary>
        <section className='space-y-3 p-3' aria-label='Session Draft Operations'>
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <Text component='p' size='micro' variant='label' tracking='label'>
              DRAFT OPERATIONS
            </Text>
            <Pill tone='attention'>Unsaved</Pill>
          </div>

          {result.ok ? (
            <ol className='space-y-2' data-cad-draft-operation-list=''>
              {result.plan.operations.map((operation) => (
                <li
                  key={operation.operationRef}
                  className='space-y-2 border-t border-hairline py-2 first:border-t-0 first:pt-0'
                  data-draft-operation-ref={operation.operationRef}
                  data-draft-operation-readiness={operation.readiness}
                >
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      {onFocusOperation ? (
                        <Button
                          type='button'
                          size='xs'
                          variant='underline'
                          onClick={() => onFocusOperation(operation.operationNumber)}
                        >
                          #{operation.operationNumber} · {operation.processKind}
                        </Button>
                      ) : (
                        <Text component='p' size='micro' className='font-bold'>
                          #{operation.operationNumber} · {operation.processKind}
                        </Text>
                      )}
                      <Text component='p' size='micro' variant='label' className='tabular-nums'>
                        order {operation.order + 1} · stage {operation.stage} ·{' '}
                        {operation.route.drafts.length} exact seam
                        {operation.route.drafts.length === 1 ? '' : 's'}
                      </Text>
                    </div>
                    <Pill
                      tone={operation.readiness === 'complete-session-draft' ? 'ok' : 'attention'}
                    >
                      {operation.readiness === 'complete-session-draft' ? 'ready' : 'incomplete'}
                    </Pill>
                  </div>

                  {operation.route.drafts.length ? (
                    <div
                      className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-micro'
                      aria-label='Exact seams joined on the table'
                    >
                      <Text component='span' size='micro' variant='label'>
                        Seams joined on table
                      </Text>
                      {operation.route.drafts.map((draft) => (
                        <span
                          key={draft.draftOperationId}
                          className='min-w-0'
                          data-cad-draft-seam={draft.draftOperationId}
                        >
                          <span className='block font-bold tabular-nums'>
                            {draft.connection?.intentId ?? draft.draftOperationId}
                          </span>
                          {draft.connection?.sides?.length === 2 ? (
                            <span className='block text-labelColor'>
                              {draft.connection.sides[0].pieceLineKey}{' '}
                              {draft.connection.sides[0].boundaryVertexIds.join(' → ')} ↔{' '}
                              {draft.connection.sides[1].pieceLineKey}{' '}
                              {draft.connection.sides[1].boundaryVertexIds.join(' → ')}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className='grid grid-cols-1 gap-2 text-micro'>
                    <div>
                      <Text component='p' size='micro' variant='label'>
                        Current operation dependencies
                      </Text>
                      <Text component='p' size='micro' className='break-all'>
                        {operation.dependsOnOperationRefs.length
                          ? operation.dependsOnOperationRefs.join(' → ')
                          : 'none in this session projection'}
                      </Text>
                    </div>
                    <div>
                      <Text component='p' size='micro' variant='label'>
                        Incomplete Assembly Order fields
                      </Text>
                      <div className='mt-1 flex flex-wrap gap-1'>
                        {operation.incompleteFields.length ? (
                          operation.incompleteFields.map((field) => (
                            <Pill key={field} tone='attention'>
                              {field}
                            </Pill>
                          ))
                        ) : (
                          <Text component='span' size='micro'>
                            none
                          </Text>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <CalloutBox tone='error'>
              <Text component='p' className='font-bold'>
                Draft Operation #{result.blocker.operationNumber ?? operationNumber} blocked
              </Text>
              <Text component='p' size='micro'>
                {result.blocker.detail} [{result.blocker.code}]
              </Text>
            </CalloutBox>
          )}

          {cadCommandDrafts ? (
            <CadCommandDraftHandoffSection
              drafts={cadCommandDrafts}
              owner={cadCommandAuthoringHandoff}
              sourceLocked={cadCommandSourceLocked}
              operationNumber={operationNumber}
              onHandoff={onCadCommandAuthoringHandoff}
            />
          ) : null}
        </section>
      </details>
    </div>
  );
}
