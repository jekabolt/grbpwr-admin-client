import { useState, type ElementType, type ReactNode } from 'react';
import { BoxIcon, Button, DrawingPinIcon, Pill, RulerSquareIcon, SewingPinIcon, Text } from 'ui';

import type { PatternImportDxfPhaseEDraftCadCompileUiStateV1 } from './draft-cad-compile-ui-v1';
import type { PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 } from './cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseEDraftCadArrangementActionV1 } from './draft-cad-arrangement-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadToolV1,
} from './draft-cad-session-v1';
import { PatternImportDxfPhaseECadWorkbenchToolButtonV1 } from './cad-workbench-tool-button-v1';
import { PatternImportDxfPhaseECadWorkbenchObjectSidebarV1 } from './cad-workbench-object-sidebar-v1';
import type { PatternImportDxfPhaseEDraftCadTopologyToolV1 } from './draft-cad-topology-session-v1';

type ToolGroup = Readonly<{
  id: string;
  label: string;
  tools: readonly PatternImportDxfPhaseEDraftCadToolV1[];
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOOL_GROUPS_V1 = Object.freeze([
  Object.freeze({
    id: 'construct',
    label: 'Construct',
    tools: Object.freeze([
      'rectangle',
      'circle',
      'ellipse',
      'internal-line',
      'pattern-line',
      'french-curve',
      'add-point',
    ] as const),
  }),
  Object.freeze({
    id: 'shape',
    label: 'Shape',
    tools: Object.freeze(['dart', 'cut', 'spread'] as const),
  }),
  Object.freeze({
    id: 'details',
    label: 'Details',
    tools: Object.freeze(['mark', 'notch'] as const),
  }),
] as const satisfies readonly ToolGroup[]);

const TOOL_LABELS = Object.freeze({
  pen: 'Pen',
  rectangle: 'Rectangle',
  circle: 'Circle',
  ellipse: 'Ellipse',
  'add-point': 'Add point',
  'internal-line': 'Internal line',
  'french-curve': 'French curve',
  'draft-point': 'Draft point',
  guideline: 'Guideline',
  'pattern-line': 'Pattern line',
  'point-only': 'Point only',
  dart: 'Dart',
  'fish-eye': 'Fish-eye dart',
  spread: 'Spread',
  gather: 'Gather',
  pleat: 'Pleat',
  cut: 'Cut',
  notch: 'Notch',
  mark: 'Mark',
} as const satisfies Readonly<Record<PatternImportDxfPhaseEDraftCadToolV1, string>>);

const TOPOLOGY_TOOL_LABELS = Object.freeze({
  'measure-point': 'Measure point',
  'measure-line': 'Measure line',
  'measure-edge': 'Measure edge',
  callout: 'Callout',
} as const satisfies Readonly<Record<PatternImportDxfPhaseEDraftCadTopologyToolV1, string>>);

const TOOL_GROUP_ICONS: Readonly<Record<string, ElementType>> = Object.freeze({
  construct: BoxIcon,
  shape: SewingPinIcon,
  details: DrawingPinIcon,
});

function compileReceiptToolLabel(tool: PatternImportDxfPhaseEDraftCadToolV1): string {
  if (tool === 'circle') return 'Circle · bounded polyline';
  if (tool === 'ellipse') return 'Ellipse · bounded polyline';
  return TOOL_LABELS[tool];
}

const groupedTools = PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOOL_GROUPS_V1.flatMap(
  ({ tools }) => tools,
);

if (
  groupedTools.length !== PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1.length ||
  groupedTools.some(
    (tool, index) => tool !== PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PRODUCTIVE_TOOLS_V1[index],
  )
)
  throw new TypeError('Draft CAD tool rail must exact-match the productive tool contract.');

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_EDITOR_SHELL_CONTRACT_V1 = Object.freeze({
  sessionSourceOnly: true,
  allSessionToolsAccessibleFromFamilies: false,
  onlyLosslesslyExecutableToolsVisible: true,
  persistentToolButtonsBounded: true,
  fixedObjectBrowserWithIndependentScroll: true,
  sourceAndHistoryDisclosuresDefaultCollapsed: true,
  disabledApplyControlHidden: true,
  geometryCompileIntegrated: true,
  compiledReceiptContainsRawDxf: false,
  compileWritesProduction: false,
  compiledDxfHandoffOpensExistingImportReview: true,
  compiledDxfHandoffNeverAutosaves: true,
  geometryApplyClaimed: false,
  applyEnabled: false,
  canvasRendererOwnedByCaller: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEDraftCadEditorShellPropsV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  activeTool: PatternImportDxfPhaseEDraftCadToolV1;
  activeTopologyTool?: PatternImportDxfPhaseEDraftCadTopologyToolV1 | null;
  arrangeActive?: boolean;
  onArrangeChange?: (active: boolean) => void;
  panActive?: boolean;
  onPanChange?: (active: boolean) => void;
  connectActive?: boolean;
  onConnectChange?: (active: boolean) => void;
  selectedPieceIds?: readonly string[];
  onArrangeSelectionAction?: (action: PatternImportDxfPhaseEDraftCadArrangementActionV1) => void;
  materialScopes?: readonly Readonly<{
    scopeKey: string;
    label: string;
    pieceCount: number;
    active: boolean;
  }>[];
  onFocusPiece?: (pieceId: string, toggle: boolean) => void;
  onToolChange: (tool: PatternImportDxfPhaseEDraftCadToolV1) => void;
  onTopologyToolChange?: (tool: PatternImportDxfPhaseEDraftCadTopologyToolV1 | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canCompile?: boolean;
  compileState?: PatternImportDxfPhaseEDraftCadCompileUiStateV1 | null;
  compiledReimportAction?: Readonly<{
    available: boolean;
    ready: boolean;
    result: PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 | null;
    onRequest: () => void;
  }>;
  onCompile?: () => void;
  onReleaseCompile?: () => void;
  defaultHistoryOpen?: boolean;
  workspaceContextControl?: ReactNode;
  renderDraft?: (session: PatternImportDxfPhaseEDraftCadSessionV1) => ReactNode;
  children?: ReactNode;
}>;

export function PatternImportDxfPhaseEDraftCadEditorShellV1({
  session,
  activeTool,
  activeTopologyTool = null,
  arrangeActive = false,
  onArrangeChange,
  panActive = false,
  onPanChange,
  connectActive = false,
  onConnectChange,
  selectedPieceIds = [],
  onArrangeSelectionAction,
  materialScopes = [],
  onFocusPiece,
  onToolChange,
  onTopologyToolChange,
  onUndo,
  onRedo,
  canCompile = false,
  compileState = null,
  compiledReimportAction,
  onCompile,
  onReleaseCompile,
  defaultHistoryOpen = false,
  workspaceContextControl,
  renderDraft,
  children,
}: PatternImportDxfPhaseEDraftCadEditorShellPropsV1) {
  const canUndo = session.cursor > 0;
  const canRedo = session.cursor < session.history.length;
  const activeTransactions = session.history.slice(0, session.cursor);
  const [objectSidebarCollapsed, setObjectSidebarCollapsed] = useState(false);
  const [openToolGroupId, setOpenToolGroupId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);
  const activeCommandCount = activeTransactions.reduce(
    (count, transaction) => count + transaction.commands.length,
    0,
  );
  const draftRectanglePieces = activeTransactions.flatMap(({ commands }) =>
    commands.flatMap((command) =>
      command.tool === 'rectangle' && command.payload.newPiece
        ? [
            {
              objectKey: `draft:${command.commandId}`,
              pieceId: command.payload.newPiece.pieceId,
              label: command.payload.newPiece.displayName,
              quantity: 1,
              focusable: false,
              statusLabel: 'Draft',
            },
          ]
        : [],
    ),
  );
  const pieceCount = session.source.catalog.pieces.length + draftRectanglePieces.length;

  return (
    <section
      data-phase-e-draft-cad-editor-shell-v1=''
      data-active-tool={activeTool}
      data-active-topology-tool={activeTopologyTool ?? undefined}
      data-can-undo={canUndo}
      data-can-redo={canRedo}
      data-dirty={session.dirty}
      className='min-w-0 overflow-hidden bg-pageBg'
      aria-label='Pattern Draft editor'
    >
      <header className='flex h-9 items-center gap-2 border-b border-borderColor bg-bgColor px-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <Text
            component='h2'
            size='micro'
            className='truncate font-bold'
            data-draft-cad-tool-context=''
          >
            {connectActive
              ? 'Connect material edges'
              : panActive
                ? 'Hand'
                : arrangeActive
                  ? 'Arrange pieces'
                  : activeTopologyTool
                    ? TOPOLOGY_TOOL_LABELS[activeTopologyTool]
                    : TOOL_LABELS[activeTool]}
          </Text>
          <Text component='p' size='micro' variant='label' className='truncate'>
            Revision {session.source.revision} · {pieceCount}{' '}
            {pieceCount === 1 ? 'piece' : 'pieces'}
          </Text>
        </div>

        {arrangeActive && selectedPieceIds.length > 0 && onArrangeSelectionAction ? (
          <div
            className='flex shrink-0 items-center gap-px border-l border-hairline pl-2'
            role='group'
            aria-label='Selected piece arrangement'
            data-draft-cad-arrange-actions=''
          >
            <Button
              type='button'
              size='xs'
              variant='underline'
              data-draft-cad-arrange-action='rotate-90'
              onClick={() => onArrangeSelectionAction('rotate-90')}
            >
              Rotate 90°
            </Button>
            <Button
              type='button'
              size='xs'
              variant='underline'
              data-draft-cad-arrange-action='flip-horizontal'
              onClick={() => onArrangeSelectionAction('flip-horizontal')}
            >
              Flip
            </Button>
            <Button
              type='button'
              size='xs'
              variant='underline'
              data-draft-cad-arrange-action='reset'
              onClick={() => onArrangeSelectionAction('reset')}
            >
              Reset
            </Button>
          </div>
        ) : null}

        <div className='ml-auto flex shrink-0 items-center gap-2'>
          <Pill tone={session.dirty ? 'attention' : 'ok'}>
            {session.dirty ? 'Unsaved intent' : 'Source clean'}
          </Pill>
          <div className='flex items-center' role='group'>
            <Button
              type='button'
              size='xs'
              variant='secondary'
              data-history-action='undo'
              disabled={!canUndo}
              onClick={onUndo}
            >
              Undo
            </Button>
            <Button
              type='button'
              size='xs'
              variant='secondary'
              data-history-action='redo'
              disabled={!canRedo}
              onClick={onRedo}
            >
              Redo
            </Button>
            <Button
              type='button'
              size='xs'
              variant={historyOpen ? 'main' : 'secondary'}
              aria-expanded={historyOpen}
              aria-controls='draft-cad-command-history'
              data-history-action='history'
              onClick={() => setHistoryOpen((value) => !value)}
            >
              History · {session.cursor}/{session.history.length}
            </Button>
          </div>
          {canCompile && onCompile ? (
            <Button
              type='button'
              size='xs'
              variant='main'
              aria-describedby='draft-cad-compile-status'
              data-draft-cad-compile='action'
              onClick={onCompile}
            >
              Compile draft
            </Button>
          ) : null}
        </div>
      </header>

      <div className='relative min-h-[42rem]'>
        <div className='absolute inset-y-0 left-0 z-30'>
          <PatternImportDxfPhaseECadWorkbenchObjectSidebarV1
            pieces={[
              ...session.source.catalog.pieces.map((piece) => ({
                pieceId: piece.pieceId,
                label: piece.pieceLineKey,
                quantity: 1,
              })),
              ...draftRectanglePieces,
            ]}
            selectedPieceIds={selectedPieceIds}
            materialScopes={materialScopes}
            fabricCount={materialScopes.length}
            collapsed={objectSidebarCollapsed}
            onCollapsedChange={setObjectSidebarCollapsed}
            onFocusPiece={(pieceId, { toggle }) => onFocusPiece?.(pieceId, toggle)}
          />
        </div>
        <div className='relative min-h-[42rem] min-w-0'>
          <nav
            className={`absolute top-0 z-20 flex w-12 min-w-0 flex-col gap-1 overflow-visible border border-borderColor bg-bgColor/95 p-1 ${
              objectSidebarCollapsed ? 'left-[3.25rem]' : 'left-[14.5rem]'
            }`}
            aria-label='Pattern Draft tools'
            data-draft-cad-surface-tools='2d'
          >
            {onArrangeChange ? (
              <div className='flex flex-col gap-1 pb-1' data-draft-cad-tool-group='select'>
                <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                  icon='select'
                  label='Arrange pieces'
                  active={arrangeActive}
                  pressed={arrangeActive}
                  dataAttributes={{ 'data-draft-cad-arrange-tool': '' }}
                  onClick={() => {
                    onPanChange?.(false);
                    onArrangeChange(!arrangeActive);
                  }}
                />
                {onPanChange ? (
                  <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                    icon='hand'
                    label='Hand'
                    active={panActive}
                    pressed={panActive}
                    dataAttributes={{ 'data-draft-cad-pan-tool': '' }}
                    onClick={() => {
                      onArrangeChange(false);
                      onPanChange(!panActive);
                    }}
                  />
                ) : null}
                {onConnectChange ? (
                  <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                    icon='connect'
                    label='Connect material edges'
                    active={connectActive}
                    pressed={connectActive}
                    dataAttributes={{ 'data-draft-cad-cross-scope-connect-tool': '' }}
                    onClick={() => {
                      onArrangeChange(false);
                      onPanChange?.(false);
                      onTopologyToolChange?.(null);
                      onConnectChange(!connectActive);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
            {PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_TOOL_GROUPS_V1.map((group) => {
              const GroupIcon = TOOL_GROUP_ICONS[group.id] ?? BoxIcon;
              const open = openToolGroupId === group.id;
              return (
                <details
                  key={group.id}
                  open={open}
                  data-draft-cad-tool-group={group.id}
                  data-tool-group-open={open}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open;
                    setOpenToolGroupId((current) =>
                      nextOpen ? group.id : current === group.id ? null : current,
                    );
                  }}
                  className='group relative border-t border-hairline pt-1 first:border-t-0 first:pt-0'
                >
                  <summary
                    className={`flex h-10 w-10 cursor-pointer list-none items-center justify-center marker:hidden ${
                      (group.tools as readonly PatternImportDxfPhaseEDraftCadToolV1[]).includes(
                        activeTool,
                      ) &&
                      !panActive &&
                      !activeTopologyTool &&
                      !arrangeActive
                        ? 'bg-textColor text-bgColor'
                        : 'bg-transparent text-textColor hover:bg-pageBg'
                    }`}
                    aria-label={`${group.label} tools`}
                    title={`${group.label} tools`}
                  >
                    <GroupIcon aria-hidden width='16' height='16' />
                  </summary>
                  <div className='absolute top-0 left-[calc(100%+0.5rem)] grid w-52 grid-cols-4 gap-1 border border-borderColor bg-bgColor p-1.5'>
                    <Text component='p' size='micro' className='col-span-4 px-1 font-bold'>
                      {group.label}
                    </Text>
                    {group.tools.map((tool) => (
                      <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                        key={tool}
                        icon={tool}
                        label={TOOL_LABELS[tool]}
                        active={
                          !panActive && !arrangeActive && !activeTopologyTool && activeTool === tool
                        }
                        pressed={
                          !panActive && !arrangeActive && !activeTopologyTool && activeTool === tool
                        }
                        dataAttributes={{ 'data-draft-cad-tool': tool }}
                        onClick={() => {
                          onArrangeChange?.(false);
                          onPanChange?.(false);
                          onToolChange(tool);
                          setOpenToolGroupId(null);
                        }}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
            {onTopologyToolChange ? (
              <div className='flex flex-col gap-1 border-t border-hairline pt-1'>
                <details
                  className='group relative'
                  data-draft-cad-tool-group='measure'
                  data-tool-group-open={openToolGroupId === 'measure'}
                  open={openToolGroupId === 'measure'}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open;
                    setOpenToolGroupId((current) =>
                      nextOpen ? 'measure' : current === 'measure' ? null : current,
                    );
                  }}
                >
                  <summary
                    className={`flex h-10 w-10 cursor-pointer list-none items-center justify-center marker:hidden ${
                      activeTopologyTool?.startsWith('measure-')
                        ? 'bg-textColor text-bgColor'
                        : 'bg-transparent text-textColor hover:bg-pageBg'
                    }`}
                    aria-label='Measure tools'
                    title='Measure tools'
                  >
                    <RulerSquareIcon aria-hidden width='16' height='16' />
                  </summary>
                  <div className='absolute top-0 left-[calc(100%+0.5rem)] grid w-40 grid-cols-3 gap-1 border border-borderColor bg-bgColor p-1.5'>
                    <Text component='p' size='micro' className='col-span-3 px-1 font-bold'>
                      Measure
                    </Text>
                    {(['measure-point', 'measure-line', 'measure-edge'] as const).map((tool) => (
                      <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                        key={tool}
                        icon={tool}
                        label={TOPOLOGY_TOOL_LABELS[tool]}
                        active={activeTopologyTool === tool}
                        pressed={activeTopologyTool === tool}
                        dataAttributes={{ 'data-draft-cad-topology-tool': tool }}
                        onClick={() => {
                          onArrangeChange?.(false);
                          onPanChange?.(false);
                          onTopologyToolChange(activeTopologyTool === tool ? null : tool);
                          setOpenToolGroupId(null);
                        }}
                      />
                    ))}
                  </div>
                </details>
                {(['callout'] as const).map((tool) => (
                  <PatternImportDxfPhaseECadWorkbenchToolButtonV1
                    key={tool}
                    icon={tool}
                    label={TOPOLOGY_TOOL_LABELS[tool]}
                    active={activeTopologyTool === tool}
                    pressed={activeTopologyTool === tool}
                    dataAttributes={{ 'data-draft-cad-topology-tool': tool }}
                    onClick={() => {
                      onArrangeChange?.(false);
                      onPanChange?.(false);
                      onTopologyToolChange(activeTopologyTool === tool ? null : tool);
                    }}
                  />
                ))}
              </div>
            ) : null}
            {workspaceContextControl ? (
              <div
                className='flex flex-col gap-1 border-t border-hairline pt-1'
                data-cad-2d-tool-context-slot=''
              >
                {workspaceContextControl}
              </div>
            ) : null}
          </nav>

          <main
            className={`relative flex min-h-[42rem] min-w-0 flex-col overflow-hidden bg-pageBg ${
              objectSidebarCollapsed ? 'ml-11' : 'ml-56'
            }`}
            aria-label='Pattern Draft canvas'
            data-draft-cad-canvas=''
          >
            {renderDraft ? renderDraft(session) : children}
          </main>
        </div>

        <aside
          id='draft-cad-command-history'
          className={`absolute right-2 top-2 z-30 max-h-[36rem] w-72 overflow-auto border border-borderColor bg-bgColor ${
            historyOpen ? '' : 'hidden'
          }`}
          aria-label='Command history'
          aria-hidden={!historyOpen}
          data-draft-cad-inspector='history'
        >
          <div className='flex items-start justify-between gap-2 border-b border-borderColor p-2.5'>
            <div>
              <Text component='h3' size='micro' className='font-bold'>
                Command history
              </Text>
              <Text component='p' size='micro' variant='label'>
                {session.cursor}/{session.history.length} transactions · {activeCommandCount} active
                commands
              </Text>
            </div>
            <Pill tone='ink'>Intent only</Pill>
          </div>

          {session.history.length ? (
            <ol className='max-h-[28rem] space-y-1 overflow-y-auto p-2'>
              {session.history.map((transaction, index) => {
                const state = index < session.cursor ? 'active' : 'redo';
                return (
                  <li
                    key={transaction.transactionId}
                    data-draft-cad-history-state={state}
                    className='border-t border-hairline py-2 first:border-t-0'
                    aria-current={index === session.cursor - 1 ? 'step' : undefined}
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <Text component='p' size='micro' className='truncate font-bold'>
                          {index + 1}. {transaction.label}
                        </Text>
                        <Text component='p' size='micro' variant='label'>
                          {transaction.status === 'intent-only'
                            ? 'Intent only'
                            : transaction.status}
                        </Text>
                      </div>
                      <Pill tone={state === 'active' ? 'ok' : 'ink'}>
                        {state === 'active' ? 'Active' : 'Redo'}
                      </Pill>
                    </div>
                    <ul className='mt-2 space-y-1 border-t border-hairline pt-1'>
                      {transaction.commands.map((command) => (
                        <li key={command.commandId} className='text-micro'>
                          <span className='font-bold'>{TOOL_LABELS[command.tool]}</span>
                          <span className='text-labelColor'> · {command.target.pieceLineKey}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className='p-3'>
              <Text component='p' size='micro' className='font-bold'>
                No commands yet
              </Text>
              <Text component='p' size='micro' variant='label'>
                The session still matches its source revision.
              </Text>
            </div>
          )}

          <div className='border-t border-borderColor p-2' id='draft-cad-apply-blocker'>
            <Text component='p' size='micro' className='font-bold'>
              Apply blocked ·{' '}
              {compileState?.status === 'compiled-reimport-required'
                ? 'fresh-reimport-required'
                : session.apply.blocker.code}
            </Text>
            <Text component='p' size='micro' variant='label'>
              {compileState?.status === 'compiled-reimport-required'
                ? 'Run the compiled draft through the existing import → semantics → Phase-D → Phase-E boundary before card Apply.'
                : session.apply.blocker.detail}
            </Text>
          </div>

          <div
            className='border-t border-borderColor p-2'
            id='draft-cad-compile-status'
            data-draft-cad-compile-status={compileState?.status ?? 'idle'}
          >
            {compileState?.status === 'compiled-reimport-required' ? (
              <div className='space-y-2'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <Text component='p' size='micro' className='font-bold'>
                      Compiled · re-import required
                    </Text>
                    <Text component='p' size='micro' variant='label'>
                      {compileState.receipt.featureCount} features · scope{' '}
                      {compileState.receipt.scopeKey} · size {compileState.receipt.sizeToken}
                    </Text>
                  </div>
                  <Pill tone='attention'>Session receipt</Pill>
                </div>
                <ul className='space-y-0.5 text-micro'>
                  {compileState.receipt.tools.map(({ tool, count }) => (
                    <li key={tool}>
                      <span className='font-bold'>{compileReceiptToolLabel(tool)}</span>
                      <span className='text-labelColor'> · {count}</span>
                    </li>
                  ))}
                </ul>
                <Text component='p' size='micro' variant='label'>
                  Existing import → semantics → Phase-D → Phase-E boundary required. No card or
                  production data was written.
                </Text>
                {compiledReimportAction?.result?.ok ? (
                  <Text
                    component='p'
                    size='micro'
                    variant='label'
                    data-draft-cad-compiled-reimport-status='review-opened'
                  >
                    Existing Patterns import review opened. Review and Apply there to create a fresh
                    confirmed source generation.
                  </Text>
                ) : compiledReimportAction?.result && 'blocker' in compiledReimportAction.result ? (
                  <Text
                    component='p'
                    size='micro'
                    variant='errorLabel'
                    data-draft-cad-compiled-reimport-status={
                      compiledReimportAction.result.blocker.code
                    }
                  >
                    {compiledReimportAction.result.blocker.detail}
                  </Text>
                ) : compiledReimportAction?.available && compiledReimportAction.ready ? (
                  <Button
                    type='button'
                    size='xs'
                    variant='main'
                    data-draft-cad-compiled-reimport='review'
                    onClick={compiledReimportAction.onRequest}
                  >
                    Review re-import
                  </Button>
                ) : (
                  <Text
                    component='p'
                    size='micro'
                    variant='label'
                    data-draft-cad-compiled-reimport-status={
                      compiledReimportAction?.available ? 'preparing' : 'owner-unavailable'
                    }
                  >
                    {compiledReimportAction?.available
                      ? 'Preparing compiled DXF for the existing import review…'
                      : 'Patterns import review is unavailable for this card.'}
                  </Text>
                )}
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  data-draft-cad-compile-release=''
                  onClick={onReleaseCompile}
                >
                  Release receipt
                </Button>
              </div>
            ) : compileState?.status === 'blocked' ? (
              <div className='space-y-2'>
                <div className='flex items-start justify-between gap-2'>
                  <Text component='p' size='micro' className='font-bold'>
                    Compile blocked
                  </Text>
                  <Pill tone='attention'>Supported subset only</Pill>
                </div>
                <ul className='space-y-1'>
                  {compileState.blockers.map((blocker, index) => (
                    <li
                      key={`${blocker.code}:${blocker.commandId ?? index}`}
                      data-draft-cad-compile-blocker={blocker.code}
                      className='border-l-2 border-borderColor pl-2'
                    >
                      <Text component='p' size='micro' className='font-bold'>
                        {blocker.code}
                        {blocker.tool ? ` · ${TOOL_LABELS[blocker.tool]}` : ''}
                      </Text>
                      <Text component='p' size='micro' variant='label'>
                        {blocker.detail}
                      </Text>
                    </li>
                  ))}
                </ul>
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  data-draft-cad-compile-release=''
                  onClick={onReleaseCompile}
                >
                  Release blockers
                </Button>
              </div>
            ) : (
              <div>
                <Text component='p' size='micro' className='font-bold'>
                  Compile draft
                </Text>
                <Text component='p' size='micro' variant='label'>
                  Supported now: internal and pattern lines, French curve, dart, drill mark and one
                  anchored notch. Receipt stays in this session and never applies to the card.
                </Text>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
