import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { FlushResult } from './design/autosave-contract';
import type { TechCardFormData } from './schema';
import { type AutosaveController, writeFormDiff } from './useTechCardAutosave';
import {
  cloneHistoryValue,
  diffHistoryValues,
  emptyUndoHistory,
  historyBarrier,
  recordUndoStep,
  redoHistoryStep,
  undoHistoryStep,
  type HistoryPatch,
  type UndoHistoryState,
} from './undo-history-core';

const TEXT_BURST_MS = 1000;
const HISTORY_OWNER = '[data-history-owner], [data-paint-parts], [data-assembly-screen]';

export type UndoHistoryApi = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  /** Flush the ordinary autosave queue, then cut history before an irreversible action. */
  barrier: (reason: string) => Promise<FlushResult>;
};

const OFF: UndoHistoryApi = {
  canUndo: false,
  canRedo: false,
  undo: async () => {},
  redo: async () => {},
  clear: () => {},
  barrier: async () => 'off',
};

export const UndoHistoryContext = createContext<UndoHistoryApi>(OFF);

export function useUndoHistory(): UndoHistoryApi {
  return useContext(UndoHistoryContext);
}

export function UndoHistoryProvider({
  value,
  children,
}: {
  value: UndoHistoryApi;
  children: ReactNode;
}) {
  return <UndoHistoryContext.Provider value={value}>{children}</UndoHistoryContext.Provider>;
}

type CaptureEvent = {
  target: EventTarget | null;
  nativeEvent: Event;
};

export type UndoHistoryCaptureProps = {
  onBlurCapture: (event: CaptureEvent) => void;
  onChangeCapture: (event: CaptureEvent) => void;
  onClickCapture: (event: CaptureEvent) => void;
  onCutCapture: (event: CaptureEvent) => void;
  onDropCapture: (event: CaptureEvent) => void;
  onFocusCapture: (event: CaptureEvent) => void;
  onInputCapture: (event: CaptureEvent) => void;
  onKeyDownCapture: (event: CaptureEvent) => void;
  onKeyUpCapture: (event: CaptureEvent) => void;
  onPasteCapture: (event: CaptureEvent) => void;
  onPointerDownCapture: (event: CaptureEvent) => void;
  onPointerUpCapture: (event: CaptureEvent) => void;
};

type Gesture = {
  token: string;
  before: TechCardFormData;
  label?: string;
  textPath?: string;
};

const ROOT_LABELS: Record<string, string> = {
  approvalState: 'approval',
  auxSubtype: 'auxiliary type',
  baseModelId: 'base model',
  baseSampleSizeId: 'sample size',
  bomItems: 'BOM',
  callouts: 'callouts',
  careLabel: 'care label',
  categoryId: 'category',
  construction: 'construction',
  costing: 'costing',
  details: 'details',
  fit: 'fit',
  garmentLabels: 'garment labels',
  issues: 'issues',
  labels: 'labels',
  moodboardMedia: 'moodboard',
  name: 'name',
  operations: 'operations',
  packaging: 'packaging',
  packagingItems: 'packaging items',
  patterns: 'patterns',
  pieces: 'pieces',
  purpose: 'purpose',
  requiredSeamAllowanceMm: 'seam allowance',
  revisions: 'revisions',
  season: 'season',
  signoffs: 'sign-offs',
  sizeIds: 'size range',
  stage: 'stage',
  styleNumber: 'style number',
  technicalMedia: 'technical media',
};

function eventElement(event: CaptureEvent): HTMLElement | null {
  return event.target instanceof HTMLElement ? event.target : null;
}

function isOwned(target: HTMLElement | null): boolean {
  return !!target?.closest(HISTORY_OWNER);
}

function isNativeText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(target.type);
}

function fieldPath(target: HTMLElement | null): string | undefined {
  const named = target?.closest<HTMLElement>('[name]')?.getAttribute('name');
  if (named) return named;
  return target?.closest<HTMLElement>('[data-field]')?.dataset.field;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

function rootOfPatch(patch: HistoryPatch): string | undefined {
  const token = patch.path.find((part) => typeof part === 'string');
  return typeof token === 'string' ? token : undefined;
}

function labelOf(path: string | undefined, patches: HistoryPatch[]): string {
  const root = (path || rootOfPatch(patches[0]) || 'card').split('.')[0];
  return ROOT_LABELS[root] ?? humanize(root).split(' ').slice(0, 3).join(' ');
}

function flushPassed(result: FlushResult): boolean {
  return result === 'ok' || result === 'nothing' || result === 'off';
}

export function useTechCardUndoHistory({
  scope,
  enabled,
  form,
  autosave,
}: {
  scope?: string | number;
  enabled: boolean;
  form: UseFormReturn<TechCardFormData>;
  autosave: AutosaveController;
}): { api: UndoHistoryApi; captureProps: UndoHistoryCaptureProps } {
  const core = useRef<UndoHistoryState>(emptyUndoHistory());
  const [view, setView] = useState(core.current);
  const gesture = useRef<Gesture | null>(null);
  const gestureSeq = useRef(0);
  const textTimer = useRef<number | null>(null);
  const discreteTimer = useRef<number | null>(null);
  const applying = useRef(false);

  const publish = useCallback((next: UndoHistoryState) => {
    core.current = next;
    setView(next);
  }, []);

  const cancelTimers = useCallback(() => {
    if (textTimer.current !== null) window.clearTimeout(textTimer.current);
    if (discreteTimer.current !== null) window.clearTimeout(discreteTimer.current);
    textTimer.current = null;
    discreteTimer.current = null;
  }, []);

  const closeGesture = useCallback(() => {
    cancelTimers();
    gesture.current = null;
  }, [cancelTimers]);

  const clear = useCallback(() => {
    closeGesture();
    publish(historyBarrier(core.current));
  }, [closeGesture, publish]);

  useEffect(() => clear(), [scope, clear]);
  useEffect(() => {
    if (!enabled) clear();
  }, [enabled, clear]);
  useEffect(() => {
    if (autosave.status === 'conflict') clear();
  }, [autosave.status, clear]);
  useEffect(() => () => cancelTimers(), [cancelTimers]);

  const begin = useCallback(
    (target: HTMLElement | null, text: boolean) => {
      if (!enabled || isOwned(target)) return;
      const path = fieldPath(target);
      const current = gesture.current;
      if (text && current?.textPath === path) {
        if (textTimer.current !== null) window.clearTimeout(textTimer.current);
        textTimer.current = window.setTimeout(closeGesture, TEXT_BURST_MS);
        return;
      }
      if (!text && current && current.textPath === undefined) {
        if (discreteTimer.current !== null) window.clearTimeout(discreteTimer.current);
        discreteTimer.current = window.setTimeout(closeGesture, 0);
        return;
      }
      closeGesture();
      let before: TechCardFormData;
      try {
        before = cloneHistoryValue(form.getValues());
      } catch {
        return;
      }
      const sequence = ++gestureSeq.current;
      gesture.current = {
        token: `${text ? 'text' : 'gesture'}:${sequence}`,
        before,
        label: path ? labelOf(path, []) : undefined,
        ...(text ? { textPath: path ?? '' } : {}),
      };
      if (text) textTimer.current = window.setTimeout(closeGesture, TEXT_BURST_MS);
    },
    [closeGesture, enabled, form],
  );

  const closeDiscreteSoon = useCallback(() => {
    if (discreteTimer.current !== null) window.clearTimeout(discreteTimer.current);
    discreteTimer.current = window.setTimeout(closeGesture, 0);
  }, [closeGesture]);

  useEffect(() => {
    const subscription = form.watch(() => {
      if (applying.current) return;
      const active = gesture.current;
      if (!active) return;
      queueMicrotask(() => {
        if (applying.current || gesture.current?.token !== active.token) return;
        const current = form.getValues();
        const patches = diffHistoryValues(active.before, current);
        const label = active.label || labelOf(active.textPath, patches);
        const next = recordUndoStep(core.current, active.before, current, label, active.token);
        if (next !== core.current) publish(next);
      });
    });
    return () => subscription.unsubscribe();
  }, [form, publish]);

  const apply = useCallback(
    async (direction: 'undo' | 'redo') => {
      closeGesture();
      await autosave.whenSettled();
      const current = form.getValues();
      const result =
        direction === 'undo'
          ? undoHistoryStep(core.current, current)
          : redoHistoryStep(core.current, current);
      if (!result.step) return;
      applying.current = true;
      try {
        const next = result.value as Record<string, unknown>;
        const now = current as Record<string, unknown>;
        for (const key of new Set([...Object.keys(now), ...Object.keys(next)])) {
          writeFormDiff(
            (path, value) =>
              form.setValue(path as never, value as never, {
                shouldDirty: true,
                shouldTouch: true,
              }),
            key,
            now[key],
            next[key],
          );
        }
        publish(result.state);
        autosave.request(direction);
      } finally {
        applying.current = false;
      }
    },
    [autosave, closeGesture, form, publish],
  );

  const barrier = useCallback(
    async (reason: string) => {
      closeGesture();
      const result = await autosave.flush(`barrier:${reason}`);
      if (flushPassed(result)) publish(historyBarrier(core.current));
      return result;
    },
    [autosave, closeGesture, publish],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey)
        return;
      const undo = (event.metaKey || event.ctrlKey) && event.code === 'KeyZ' && !event.shiftKey;
      const redo =
        (event.metaKey || event.ctrlKey) && event.code === 'KeyZ' && event.shiftKey
          ? true
          : event.ctrlKey && !event.metaKey && event.code === 'KeyY';
      if (!undo && !redo) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : target;
      if (isNativeText(target) || target?.closest(HISTORY_OWNER) || active?.closest(HISTORY_OWNER))
        return;
      if (active?.closest('[role="dialog"], [aria-modal="true"]')) return;
      if (undo ? core.current.undo.length === 0 : core.current.redo.length === 0) return;
      event.preventDefault();
      void apply(undo ? 'undo' : 'redo');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [apply, enabled]);

  const captureProps = useMemo<UndoHistoryCaptureProps>(() => {
    const trusted = (event: CaptureEvent) => event.nativeEvent.isTrusted;
    const text = (event: CaptureEvent) => isNativeText(event.target);
    const start = (event: CaptureEvent) => {
      if (!trusted(event)) return;
      begin(eventElement(event), text(event));
      if (!text(event)) closeDiscreteSoon();
    };
    return {
      onBlurCapture: (event) => {
        if (trusted(event) && text(event)) closeDiscreteSoon();
      },
      onChangeCapture: start,
      onClickCapture: start,
      onCutCapture: start,
      onDropCapture: start,
      onFocusCapture: (event) => {
        if (!trusted(event)) return;
        const path = fieldPath(eventElement(event));
        if (gesture.current?.textPath !== undefined && gesture.current.textPath !== (path ?? ''))
          closeGesture();
      },
      onInputCapture: start,
      onKeyDownCapture: (event) => {
        const native = event.nativeEvent as KeyboardEvent;
        if (
          !trusted(event) ||
          native.isComposing ||
          native.metaKey ||
          native.ctrlKey ||
          native.altKey
        )
          return;
        begin(eventElement(event), text(event));
        if (!text(event)) closeDiscreteSoon();
      },
      onKeyUpCapture: (event) => {
        if (trusted(event) && !text(event)) closeDiscreteSoon();
      },
      onPasteCapture: start,
      onPointerDownCapture: (event) => {
        if (!trusted(event)) return;
        begin(eventElement(event), text(event));
      },
      onPointerUpCapture: (event) => {
        if (trusted(event) && !text(event)) closeDiscreteSoon();
      },
    };
  }, [begin, closeDiscreteSoon, closeGesture]);

  const api = useMemo<UndoHistoryApi>(
    () => ({
      canUndo: view.undo.length > 0,
      canRedo: view.redo.length > 0,
      undoLabel: view.undo.at(-1)?.label,
      redoLabel: view.redo.at(-1)?.label,
      undo: () => apply('undo'),
      redo: () => apply('redo'),
      clear,
      barrier,
    }),
    [apply, barrier, clear, view],
  );

  return { api, captureProps };
}
