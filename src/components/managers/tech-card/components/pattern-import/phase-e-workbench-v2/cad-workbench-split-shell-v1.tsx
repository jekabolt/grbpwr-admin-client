import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Button, Text } from 'ui';

import type { PatternImportDxfPhaseEMeasurementUnitV1 } from './measurement-units-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_SPLIT_SHELL_V1 =
  'pattern-import-dxf-phase-e-cad-workbench-split-shell/1' as const;

export type PatternImportDxfPhaseECadWorkbenchViewModeV1 =
  | 'desktop-only'
  | 'split'
  | 'mannequin-only';
export type PatternImportDxfPhaseECadWorkbenchOperationsModeV1 =
  | 'docked'
  | 'floating'
  | 'collapsed';

type MeasurementUnitContextV1 = Readonly<{
  unit: PatternImportDxfPhaseEMeasurementUnitV1;
  setUnit: (unit: PatternImportDxfPhaseEMeasurementUnitV1) => void;
}>;

const MeasurementUnitContext = createContext<MeasurementUnitContextV1 | null>(null);

export function usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1(): MeasurementUnitContextV1 | null {
  return useContext(MeasurementUnitContext);
}

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_WORKBENCH_SPLIT_SHELL_CLAIMS_V1 = Object.freeze({
  existingMannequinOwnerRequired: true,
  createsMannequinRuntime: false,
  createsClothAuthority: false,
  desktopAndMannequinResizable: true,
  desktopOnlyFocusMode: true,
  mannequinOnlyFocusMode: true,
  operationsWindowDockedFloatingCollapsed: true,
  operationsWindowCollapsesToRail: true,
  operationsWindowResizable: true,
  floatingOperationsWindowMovable: true,
  floatingOperationsWindowClampedToShell: true,
  operationsWindowCreatesOperationAuthority: false,
  typedSelectionContextForwarded: true,
  selectionAuthorityRemainsCallerOwned: true,
  layoutStateSessionOnly: true,
  splitPointerChangesOnlyDuringCapturedDrag: true,
  splitSupportsKeyboard: true,
  splitHandleHoverDoesNotChangeLayout: true,
  compactLayoutMenu: true,
  redundantWorkbenchTitleRemoved: true,
  measurementUnitsAdjacentToLayout: true,
  productionReady: false,
} as const);

const DESKTOP_MIN_WIDTH = 272; // The 2D tool rail, its largest flyout and their two gaps.
const DESKTOP_PREFERRED_MIN_WIDTH = 544;
const MANNEQUIN_MIN_WIDTH = 288;
const MIN_DOCK_WIDTH = 260;
const SPLIT_TRAVEL = 48;
const DIVIDER_WIDTH = 1;
const COLLAPSED_DOCK_WIDTH = 32;
const MIN_SPLIT_TRACK_WIDTH =
  DESKTOP_MIN_WIDTH + SPLIT_TRAVEL + DIVIDER_WIDTH + MANNEQUIN_MIN_WIDTH;
const SPLIT_LIMITS = { min: 28, max: 78 };

export function clampPatternImportDxfPhaseECadWorkbenchSplitPercentV1(value: number): number {
  return Math.min(SPLIT_LIMITS.max, Math.max(SPLIT_LIMITS.min, value));
}

export function clampPatternImportDxfPhaseECadWorkbenchOperationsWidthV1(value: number): number {
  return Math.min(520, Math.max(MIN_DOCK_WIDTH, value));
}

export function resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(
  availableWidth: number | null,
  view: PatternImportDxfPhaseECadWorkbenchViewModeV1,
  operations: PatternImportDxfPhaseECadWorkbenchOperationsModeV1,
  dockWidth: number,
  splitPercent: number,
) {
  const railWidth = operations === 'collapsed' ? COLLAPSED_DOCK_WIDTH : 0;
  const canSplit = availableWidth === null || availableWidth - railWidth >= MIN_SPLIT_TRACK_WIDTH;
  const viewMode = view === 'split' && !canSplit ? 'desktop-only' : view;
  const workspaceMinimum =
    viewMode === 'split' ? MIN_SPLIT_TRACK_WIDTH : Math.max(DESKTOP_MIN_WIDTH, MANNEQUIN_MIN_WIDTH);
  const inlineDockLimit =
    availableWidth === null ? dockWidth : availableWidth - workspaceMinimum - DIVIDER_WIDTH;
  // The dock opens inside the workspace on narrower screens, where reserving its width would
  // either make the splitter immovable or hide the canvas and its tools.
  const compactDock = operations === 'docked' && inlineDockLimit < MIN_DOCK_WIDTH;
  const docked = operations === 'docked' && !compactDock;
  const inlineDockWidth = docked ? Math.min(dockWidth, inlineDockLimit) : dockWidth;
  const trackWidth =
    availableWidth === null
      ? null
      : availableWidth - railWidth - (docked ? inlineDockWidth + DIVIDER_WIDTH : 0);
  let splitLimits = SPLIT_LIMITS;
  if (viewMode === 'split' && trackWidth !== null) {
    const max = Math.min(
      SPLIT_LIMITS.max,
      ((trackWidth - MANNEQUIN_MIN_WIDTH - DIVIDER_WIDTH) / trackWidth) * 100,
    );
    const minimumWidth = Math.max(
      DESKTOP_MIN_WIDTH,
      Math.min(DESKTOP_PREFERRED_MIN_WIDTH, (max / 100) * trackWidth - SPLIT_TRAVEL),
    );
    splitLimits = { min: Math.max(SPLIT_LIMITS.min, (minimumWidth / trackWidth) * 100), max };
  }
  return {
    canSplit,
    viewMode,
    compactDock,
    inlineDockWidth,
    splitLimits,
    splitPercent: Math.min(splitLimits.max, Math.max(splitLimits.min, splitPercent)),
  };
}

export function resolvePatternImportDxfPhaseECadWorkbenchSplitFromPointerV1(
  clientX: number,
  shellLeft: number,
  shellWidth: number,
): number {
  const percent = ((clientX - shellLeft) / shellWidth) * 100;
  return clampPatternImportDxfPhaseECadWorkbenchSplitPercentV1(percent);
}

export function resolvePatternImportDxfPhaseECadWorkbenchSplitFromDragV1(
  startPercent: number,
  deltaClientX: number,
  trackWidth: number,
): number {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0)
    return clampPatternImportDxfPhaseECadWorkbenchSplitPercentV1(startPercent);
  const deltaPercent = (deltaClientX / trackWidth) * 100;
  return clampPatternImportDxfPhaseECadWorkbenchSplitPercentV1(startPercent + deltaPercent);
}

export function resolvePatternImportDxfPhaseECadWorkbenchOperationsWidthFromPointerV1(
  clientX: number,
  shellRight: number,
): number {
  return clampPatternImportDxfPhaseECadWorkbenchOperationsWidthV1(shellRight - clientX);
}

export type PatternImportDxfPhaseECadWorkbenchFloatingPositionV1 = Readonly<{
  x: number;
  y: number;
}>;

export function resolvePatternImportDxfPhaseECadWorkbenchFloatingPositionV1(
  x: number,
  y: number,
  contentWidth: number,
  contentHeight: number,
  panelWidth: number,
  panelHeight: number,
  gutter = 12,
): PatternImportDxfPhaseECadWorkbenchFloatingPositionV1 {
  const safeGutter = Number.isFinite(gutter) ? Math.max(0, gutter) : 12;
  const maxX = Math.max(safeGutter, contentWidth - panelWidth - safeGutter);
  const maxY = Math.max(safeGutter, contentHeight - panelHeight - safeGutter);
  return Object.freeze({
    x: Math.min(maxX, Math.max(safeGutter, Number.isFinite(x) ? x : safeGutter)),
    y: Math.min(maxY, Math.max(safeGutter, Number.isFinite(y) ? y : safeGutter)),
  });
}

export type PatternImportDxfPhaseECadWorkbenchSelectionV1 = Readonly<{
  operationNumber: number | null;
  pieceId?: string | null;
  seamId?: string | null;
}>;

export type PatternImportDxfPhaseECadWorkbenchSelectionSourceV1 =
  | 'desktop'
  | 'mannequin'
  | 'operations';

export type PatternImportDxfPhaseECadWorkbenchSelectionEventV1 = Readonly<{
  source: PatternImportDxfPhaseECadWorkbenchSelectionSourceV1;
  selection: PatternImportDxfPhaseECadWorkbenchSelectionV1 | null;
}>;

export type PatternImportDxfPhaseECadWorkbenchSlotContextV1 = Readonly<{
  source: PatternImportDxfPhaseECadWorkbenchSelectionSourceV1;
  selection: PatternImportDxfPhaseECadWorkbenchSelectionV1 | null;
  focusSelection: (selection?: PatternImportDxfPhaseECadWorkbenchSelectionV1 | null) => void;
}>;

export type PatternImportDxfPhaseECadWorkbenchSlotV1 =
  | ReactNode
  | ((context: PatternImportDxfPhaseECadWorkbenchSlotContextV1) => ReactNode);

type DragState =
  | Readonly<{
      kind: 'split';
      startClientX: number;
      startSplitPercent: number;
      trackWidth: number;
    }>
  | Readonly<{
      kind: 'operations';
      operationsRight: number;
      contentLeft: number;
      contentWidth: number;
      contentHeight: number;
      panelHeight: number;
      floating: boolean;
    }>
  | Readonly<{
      kind: 'floating-move';
      contentLeft: number;
      contentTop: number;
      contentWidth: number;
      contentHeight: number;
      panelWidth: number;
      panelHeight: number;
      pointerOffsetX: number;
      pointerOffsetY: number;
    }>;

export type PatternImportDxfPhaseECadWorkbenchSplitShellPropsV1 = Readonly<{
  objectSidebar?: PatternImportDxfPhaseECadWorkbenchSlotV1;
  desktop: PatternImportDxfPhaseECadWorkbenchSlotV1;
  mannequin: PatternImportDxfPhaseECadWorkbenchSlotV1;
  operationsPanel: PatternImportDxfPhaseECadWorkbenchSlotV1;
  selection?: PatternImportDxfPhaseECadWorkbenchSelectionV1 | null;
  onSelectionFocus?: (event: PatternImportDxfPhaseECadWorkbenchSelectionEventV1) => void;
  defaultViewMode?: PatternImportDxfPhaseECadWorkbenchViewModeV1;
  defaultSplitPercent?: number;
  splitPercent?: number;
  onSplitPercentChange?: (splitPercent: number) => void;
  defaultOperationsMode?: PatternImportDxfPhaseECadWorkbenchOperationsModeV1;
  defaultOperationsWidthPx?: number;
  operationsWidthPx?: number;
  onOperationsWidthPxChange?: (operationsWidthPx: number) => void;
}>;

function renderSlot(
  slot: PatternImportDxfPhaseECadWorkbenchSlotV1,
  source: PatternImportDxfPhaseECadWorkbenchSelectionSourceV1,
  selection: PatternImportDxfPhaseECadWorkbenchSelectionV1 | null,
  onSelectionFocus:
    | ((event: PatternImportDxfPhaseECadWorkbenchSelectionEventV1) => void)
    | undefined,
): ReactNode {
  if (typeof slot !== 'function') return slot;
  return slot({
    source,
    selection,
    focusSelection(nextSelection = selection) {
      onSelectionFocus?.(Object.freeze({ source, selection: nextSelection }));
    },
  });
}

/**
 * Layout-only workbench owner. The 2D editor, mannequin runtime and Assembly Order editor remain
 * caller-owned slots; this component stores only ephemeral panel geometry and focus mode.
 */
export function PatternImportDxfPhaseECadWorkbenchSplitShellV1({
  objectSidebar = null,
  desktop,
  mannequin,
  operationsPanel,
  selection = null,
  onSelectionFocus,
  defaultViewMode = 'split',
  defaultSplitPercent = 64,
  splitPercent: controlledSplitPercent,
  onSplitPercentChange,
  defaultOperationsMode = 'docked',
  defaultOperationsWidthPx = 320,
  operationsWidthPx: controlledOperationsWidthPx,
  onOperationsWidthPxChange,
}: PatternImportDxfPhaseECadWorkbenchSplitShellPropsV1) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const splitTrackRef = useRef<HTMLDivElement | null>(null);
  const layoutMenuRef = useRef<HTMLDetailsElement | null>(null);
  const floatingOperationsRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [requestedViewMode, setViewMode] =
    useState<PatternImportDxfPhaseECadWorkbenchViewModeV1>(defaultViewMode);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [uncontrolledSplitPercent, setUncontrolledSplitPercent] = useState(() =>
    clampPatternImportDxfPhaseECadWorkbenchSplitPercentV1(defaultSplitPercent),
  );
  const [operationsMode, setOperationsMode] =
    useState<PatternImportDxfPhaseECadWorkbenchOperationsModeV1>(defaultOperationsMode);
  const [compactDockOpen, setCompactDockOpen] = useState(false);
  const [measurementUnit, setMeasurementUnit] =
    useState<PatternImportDxfPhaseEMeasurementUnitV1>('mm');
  const [uncontrolledOperationsWidthPx, setUncontrolledOperationsWidthPx] = useState(() =>
    clampPatternImportDxfPhaseECadWorkbenchOperationsWidthV1(defaultOperationsWidthPx),
  );
  const [floatingPosition, setFloatingPosition] =
    useState<PatternImportDxfPhaseECadWorkbenchFloatingPositionV1 | null>(null);
  const [dragging, setDragging] = useState<DragState['kind'] | null>(null);
  const operationsWidthPx = clampPatternImportDxfPhaseECadWorkbenchOperationsWidthV1(
    controlledOperationsWidthPx ?? uncontrolledOperationsWidthPx,
  );
  const { canSplit, viewMode, compactDock, inlineDockWidth, splitLimits, splitPercent } =
    resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(
      availableWidth,
      requestedViewMode,
      operationsMode,
      operationsWidthPx,
      controlledSplitPercent ?? uncontrolledSplitPercent,
    );
  const hasSidebar = Boolean(objectSidebar);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const sidebar = sidebarRef.current;
    const measure = () => {
      const width = content.clientWidth;
      if (width > 0) setAvailableWidth(Math.max(0, width - (sidebar?.clientWidth ?? 0)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (sidebar) observer.observe(sidebar);
    return () => observer.disconnect();
  }, [hasSidebar]);

  const updateSplitPercent = (nextSplitPercent: number) => {
    const next = Math.min(splitLimits.max, Math.max(splitLimits.min, nextSplitPercent));
    if (controlledSplitPercent === undefined) setUncontrolledSplitPercent(next);
    onSplitPercentChange?.(next);
  };

  const updateOperationsWidthPx = (nextOperationsWidthPx: number) => {
    const next = clampPatternImportDxfPhaseECadWorkbenchOperationsWidthV1(nextOperationsWidthPx);
    if (controlledOperationsWidthPx === undefined) setUncontrolledOperationsWidthPx(next);
    onOperationsWidthPxChange?.(next);
  };

  const beginDrag = (kind: 'split' | 'operations', event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = shellRef.current?.getBoundingClientRect();
    if (!bounds) return;
    if (kind === 'split') {
      const track = splitTrackRef.current?.getBoundingClientRect();
      if (!track || track.width <= 0) return;
      dragRef.current = {
        kind,
        startClientX: event.clientX,
        startSplitPercent: splitPercent,
        trackWidth: track.width,
      };
    } else {
      const content = contentRef.current?.getBoundingClientRect() ?? bounds;
      const floatingPanel = floatingOperationsRef.current?.getBoundingClientRect();
      dragRef.current = {
        kind,
        operationsRight: floatingPanel?.right ?? bounds.right,
        contentLeft: content.left,
        contentWidth: content.width,
        contentHeight: content.height,
        panelHeight: floatingPanel?.height ?? content.height,
        floating: operationsMode === 'floating',
      };
    }
    setDragging(kind);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginFloatingMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const content = contentRef.current?.getBoundingClientRect();
    const panel = floatingOperationsRef.current?.getBoundingClientRect();
    if (!content || !panel) return;
    dragRef.current = {
      kind: 'floating-move',
      contentLeft: content.left,
      contentTop: content.top,
      contentWidth: content.width,
      contentHeight: content.height,
      panelWidth: panel.width,
      panelHeight: panel.height,
      pointerOffsetX: event.clientX - panel.left,
      pointerOffsetY: event.clientY - panel.top,
    };
    setFloatingPosition(
      resolvePatternImportDxfPhaseECadWorkbenchFloatingPositionV1(
        panel.left - content.left,
        panel.top - content.top,
        content.width,
        content.height,
        panel.width,
        panel.height,
      ),
    );
    setDragging('floating-move');
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (drag.kind === 'split') {
      updateSplitPercent(
        resolvePatternImportDxfPhaseECadWorkbenchSplitFromDragV1(
          drag.startSplitPercent,
          event.clientX - drag.startClientX,
          drag.trackWidth,
        ),
      );
      return;
    }
    if (drag.kind === 'operations') {
      const width = resolvePatternImportDxfPhaseECadWorkbenchOperationsWidthFromPointerV1(
        event.clientX,
        drag.operationsRight,
      );
      updateOperationsWidthPx(width);
      if (drag.floating)
        setFloatingPosition((previous) =>
          resolvePatternImportDxfPhaseECadWorkbenchFloatingPositionV1(
            drag.operationsRight - drag.contentLeft - width,
            previous?.y ?? 12,
            drag.contentWidth,
            drag.contentHeight,
            width,
            drag.panelHeight,
          ),
        );
      return;
    }
    setFloatingPosition(
      resolvePatternImportDxfPhaseECadWorkbenchFloatingPositionV1(
        event.clientX - drag.contentLeft - drag.pointerOffsetX,
        event.clientY - drag.contentTop - drag.pointerOffsetY,
        drag.contentWidth,
        drag.contentHeight,
        drag.panelWidth,
        drag.panelHeight,
      ),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const clearLostPointerCapture = () => {
    dragRef.current = null;
    setDragging(null);
  };

  const desktopVisible = viewMode !== 'mannequin-only';
  const mannequinVisible = viewMode !== 'desktop-only';
  const split = desktopVisible && mannequinVisible;
  const dockedOperations = operationsMode === 'docked' && !compactDock;
  const floatingOperations = operationsMode === 'floating';
  const compactOperationsVisible = compactDock && compactDockOpen;

  return (
    <MeasurementUnitContext.Provider value={{ unit: measurementUnit, setUnit: setMeasurementUnit }}>
      <section
        ref={shellRef}
        className='relative flex h-[calc(100dvh-6rem)] min-h-0 w-full flex-col overflow-hidden bg-pageBg'
        data-cad-workbench-split-shell-v1=''
        data-view-mode={viewMode}
        data-operations-mode={operationsMode}
        data-selected-operation={selection?.operationNumber ?? undefined}
        data-selected-piece={selection?.pieceId ?? undefined}
        data-selected-seam={selection?.seamId ?? undefined}
        data-active-drag={dragging ?? undefined}
        style={
          {
            '--cad-split-percent': `${splitPercent}%`,
            '--cad-operations-width': `${operationsWidthPx}px`,
          } as CSSProperties
        }
      >
        <header
          className='flex min-h-9 shrink-0 flex-wrap items-center justify-end border-b border-borderColor bg-bgColor px-2 py-1'
          aria-label='Workbench layout controls'
        >
          {dockedOperations || compactDock ? (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='mr-auto'
              aria-label={
                compactDock && !compactOperationsVisible
                  ? 'Open Current operation'
                  : 'Collapse Current operation'
              }
              aria-expanded={dockedOperations || compactOperationsVisible}
              onClick={() => {
                if (compactDock && !compactOperationsVisible) setCompactDockOpen(true);
                else {
                  setCompactDockOpen(false);
                  setOperationsMode('collapsed');
                }
              }}
            >
              Current operation {dockedOperations || compactOperationsVisible ? '›' : '‹'}
            </Button>
          ) : null}
          {desktopVisible ? (
            <div className='mr-1 flex items-center' role='group' aria-label='Measurement unit'>
              {(['mm', 'cm', 'in'] as const).map((unit) => (
                <Button
                  key={unit}
                  type='button'
                  size='xs'
                  variant={measurementUnit === unit ? 'main' : 'underline'}
                  aria-pressed={measurementUnit === unit}
                  onClick={() => setMeasurementUnit(unit)}
                >
                  {unit}
                </Button>
              ))}
            </div>
          ) : null}
          <details ref={layoutMenuRef} className='group relative z-40' data-cad-layout-menu=''>
            <summary className='flex h-7 cursor-pointer list-none items-center gap-1 px-2 text-micro font-bold marker:hidden hover:bg-pageBg'>
              Layout
              <span aria-hidden className='text-labelColor'>
                ▾
              </span>
            </summary>
            <div className='absolute right-0 top-[calc(100%+0.25rem)] w-56 border border-borderColor bg-bgColor p-2'>
              <Text component='p' size='micro' variant='label' className='mb-1 uppercase'>
                Workspace
              </Text>
              <div className='grid grid-cols-1 gap-1' aria-label='Workbench focus mode'>
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  className={
                    viewMode === 'desktop-only' ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'
                  }
                  aria-pressed={viewMode === 'desktop-only'}
                  onClick={() => {
                    setViewMode('desktop-only');
                    layoutMenuRef.current?.removeAttribute('open');
                  }}
                >
                  2D table
                </Button>
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  className={viewMode === 'split' ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'}
                  aria-pressed={viewMode === 'split'}
                  disabled={!canSplit}
                  onClick={() => {
                    setViewMode('split');
                    layoutMenuRef.current?.removeAttribute('open');
                  }}
                >
                  2D table + mannequin
                </Button>
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  className={
                    viewMode === 'mannequin-only' ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'
                  }
                  aria-pressed={viewMode === 'mannequin-only'}
                  onClick={() => {
                    setViewMode('mannequin-only');
                    layoutMenuRef.current?.removeAttribute('open');
                  }}
                >
                  Mannequin
                </Button>
              </div>
              <Text component='p' size='micro' variant='label' className='mt-3 mb-1 uppercase'>
                Assembly Order panel
              </Text>
              <div className='grid grid-cols-1 gap-1' aria-label='Assembly Order window mode'>
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  className={
                    operationsMode === 'docked' ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'
                  }
                  aria-pressed={operationsMode === 'docked'}
                  onClick={() => {
                    setOperationsMode('docked');
                    setCompactDockOpen(true);
                    layoutMenuRef.current?.removeAttribute('open');
                  }}
                >
                  Docked
                </Button>
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  className={
                    operationsMode === 'floating' ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'
                  }
                  aria-pressed={operationsMode === 'floating'}
                  onClick={() => {
                    setOperationsMode('floating');
                    layoutMenuRef.current?.removeAttribute('open');
                  }}
                >
                  Floating
                </Button>
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  className={
                    operationsMode === 'collapsed' ? 'bg-textColor text-bgColor' : 'hover:bg-pageBg'
                  }
                  aria-pressed={operationsMode === 'collapsed'}
                  onClick={() => {
                    setOperationsMode('collapsed');
                    layoutMenuRef.current?.removeAttribute('open');
                  }}
                >
                  Collapsed
                </Button>
              </div>
            </div>
          </details>
        </header>

        <div ref={contentRef} className='relative isolate flex min-h-0 flex-1 overflow-hidden'>
          {objectSidebar ? (
            <div
              ref={sidebarRef}
              className='h-full min-h-0 shrink-0 overflow-hidden'
              data-cad-workbench-object-sidebar-slot=''
            >
              {renderSlot(objectSidebar, 'desktop', selection, onSelectionFocus)}
            </div>
          ) : null}
          <div ref={splitTrackRef} className='flex min-h-0 min-w-0 flex-1 overflow-hidden'>
            {desktopVisible ? (
              <div
                className='h-full min-h-0 min-w-0 overflow-hidden bg-bgColor'
                data-cad-desktop-zone=''
                style={{
                  width: split ? 'var(--cad-split-percent)' : '100%',
                }}
              >
                {renderSlot(desktop, 'desktop', selection, onSelectionFocus)}
              </div>
            ) : null}

            {split ? (
              <Button
                type='button'
                variant='default'
                className='group relative z-10 w-px shrink-0 cursor-col-resize bg-borderColor before:absolute before:-inset-x-2 before:inset-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
                role='separator'
                aria-label='Resize 2D and mannequin zones'
                aria-orientation='vertical'
                aria-valuemin={splitLimits.min}
                aria-valuemax={splitLimits.max}
                aria-valuenow={splitPercent}
                onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
                  beginDrag('split', event)
                }
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={clearLostPointerCapture}
                onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                  let next: number;
                  switch (event.key) {
                    case 'ArrowLeft':
                      next = splitPercent - 2;
                      break;
                    case 'ArrowRight':
                      next = splitPercent + 2;
                      break;
                    case 'Home':
                      next = splitLimits.min;
                      break;
                    case 'End':
                      next = splitLimits.max;
                      break;
                    default:
                      return;
                  }
                  event.preventDefault();
                  updateSplitPercent(next);
                }}
                style={{ touchAction: 'none' }}
              >
                <span className='absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-labelColor group-hover:bg-textColor' />
              </Button>
            ) : null}

            {mannequinVisible ? (
              <aside
                className='h-full min-h-0 flex-1 overflow-hidden bg-pageBg'
                data-cad-mannequin-zone=''
                aria-label='Mannequin and sewn cloth preview'
                style={{ minWidth: split ? MANNEQUIN_MIN_WIDTH : 0 }}
              >
                {renderSlot(mannequin, 'mannequin', selection, onSelectionFocus)}
              </aside>
            ) : null}
          </div>

          {dockedOperations ? (
            <>
              <Button
                type='button'
                variant='default'
                className='group relative z-10 w-px shrink-0 cursor-col-resize bg-borderColor before:absolute before:-inset-x-2 before:inset-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
                aria-label='Resize Assembly Order window'
                aria-orientation='vertical'
                onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
                  beginDrag('operations', event)
                }
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={clearLostPointerCapture}
                style={{ touchAction: 'none' }}
              >
                <span className='absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-labelColor group-hover:bg-textColor' />
              </Button>
              <aside
                className='relative shrink-0 overflow-hidden bg-bgColor'
                style={{ width: inlineDockWidth }}
                data-cad-operations-window='docked'
                aria-label='Assembly Order window'
              >
                <div className='h-full overflow-auto'>
                  {renderSlot(operationsPanel, 'operations', selection, onSelectionFocus)}
                </div>
              </aside>
            </>
          ) : null}

          {floatingOperations || compactOperationsVisible ? (
            <aside
              ref={floatingOperations ? floatingOperationsRef : undefined}
              className='absolute z-40 flex max-h-[calc(100%-1.5rem)] flex-col overflow-hidden border border-borderColor bg-bgColor'
              style={{
                width: 'min(var(--cad-operations-width), calc(100% - 24px))',
                height: 'min(640px, calc(100% - 24px))',
                ...(floatingOperations && floatingPosition
                  ? {
                      left: `clamp(12px, ${floatingPosition.x}px, calc(100% - min(var(--cad-operations-width), calc(100% - 24px)) - 12px))`,
                      top: `clamp(12px, ${floatingPosition.y}px, max(12px, calc(100% - 652px)))`,
                    }
                  : { right: 12, top: 12 }),
              }}
              data-cad-operations-window={floatingOperations ? 'floating' : 'docked'}
              data-cad-operations-compact={compactOperationsVisible ? '' : undefined}
              aria-label={
                floatingOperations ? 'Floating Assembly Order window' : 'Assembly Order window'
              }
            >
              {floatingOperations ? (
                <>
                  <Button
                    type='button'
                    variant='default'
                    className='absolute bottom-0 left-0 top-0 w-2 cursor-col-resize border-r border-borderColor bg-pageBg'
                    aria-label='Resize floating Assembly Order window'
                    onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
                      beginDrag('operations', event)
                    }
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onLostPointerCapture={clearLostPointerCapture}
                  >
                    <span className='sr-only'>Resize floating Assembly Order window</span>
                  </Button>
                  <Button
                    type='button'
                    variant='default'
                    className='ml-2 flex min-h-8 shrink-0 cursor-move items-center border-b border-borderColor bg-pageBg px-2 text-left text-micro font-bold uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
                    aria-label='Move floating Assembly Order window'
                    onPointerDown={beginFloatingMove}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onLostPointerCapture={clearLostPointerCapture}
                  >
                    Assembly Order · move
                  </Button>
                </>
              ) : null}
              <div className={`min-h-0 flex-1 overflow-auto ${floatingOperations ? 'pl-2' : ''}`}>
                {renderSlot(operationsPanel, 'operations', selection, onSelectionFocus)}
              </div>
            </aside>
          ) : null}

          {operationsMode === 'collapsed' ? (
            <aside
              className='h-full w-8 shrink-0 border-l border-borderColor bg-bgColor'
              data-cad-operations-window='collapsed'
              aria-label='Collapsed Current operation'
            >
              <Button
                type='button'
                variant='default'
                className='flex h-full w-full items-start justify-center pt-3 text-lg leading-none hover:bg-pageBg'
                aria-label='Expand Current operation'
                title='Expand Current operation'
                onClick={() => {
                  setOperationsMode('docked');
                  setCompactDockOpen(true);
                }}
              >
                ‹
              </Button>
            </aside>
          ) : null}
        </div>
      </section>
    </MeasurementUnitContext.Provider>
  );
}
