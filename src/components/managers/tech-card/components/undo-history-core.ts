export const UNDO_HISTORY_LIMIT = 50;
export const UNDO_HISTORY_BYTE_LIMIT = 8 * 1024 * 1024;

type PrimitiveKey = string | number;

export type HistoryPathToken = string | number | { kind: 'row'; key: string; value: PrimitiveKey };

type StoredValue = {
  exists: boolean;
  value?: unknown;
};

export type HistoryPatch =
  | {
      kind: 'value';
      path: HistoryPathToken[];
      before: StoredValue;
      after: StoredValue;
    }
  | {
      kind: 'row';
      path: HistoryPathToken[];
      key: string;
      value: PrimitiveKey;
      before: StoredValue;
      after: StoredValue;
      beforeIndex: number;
      afterIndex: number;
    }
  | {
      kind: 'order';
      path: HistoryPathToken[];
      key: string;
      before: PrimitiveKey[];
      after: PrimitiveKey[];
    };

export type UndoHistoryStep = {
  id: number;
  label: string;
  mergeKey?: string;
  patches: HistoryPatch[];
  bytes: number;
};

export type UndoHistoryState = {
  undo: UndoHistoryStep[];
  redo: UndoHistoryStep[];
  bytes: number;
  nextId: number;
};

const ROW_KEY_PREFERENCE = [
  'historyKey',
  'lineKey',
  'profileKey',
  'rowKey',
  'clientRef',
  'mediaId',
  'patternId',
  'calloutId',
  'issueId',
  'signoffId',
  'section',
  'labelType',
  'number',
  'key',
] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isPrimitiveKey = (value: unknown): value is PrimitiveKey =>
  (typeof value === 'string' && value.trim() !== '') ||
  (typeof value === 'number' && Number.isFinite(value) && value !== 0);

export function cloneHistoryValue<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return (a ?? undefined) === (b ?? undefined);
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((value, index) => sameValue(value, bb[index]));
  }
  const aa = a as Record<string, unknown>;
  const bb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aa), ...Object.keys(bb)]);
  for (const key of keys) if (!sameValue(aa[key], bb[key])) return false;
  return true;
}

function keyCandidates(rows: Record<string, unknown>[]): string[] {
  const found = new Set<string>();
  for (const preferred of ROW_KEY_PREFERENCE) found.add(preferred);
  for (const row of rows) {
    for (const key of Object.keys(row)) if (/Id$/.test(key)) found.add(key);
  }
  return [...found];
}

function stableRowKey(before: unknown[], after: unknown[]): string | null {
  const rows = [...before, ...after];
  if (rows.length === 0 || !rows.every(isObject)) return null;
  const objects = rows as Record<string, unknown>[];
  for (const key of keyCandidates(objects)) {
    const valid = (list: unknown[]) => {
      const values = list.map((row) => (row as Record<string, unknown>)[key]);
      return values.every(isPrimitiveKey) && new Set(values).size === values.length;
    };
    if (valid(before) && valid(after)) return key;
  }
  return null;
}

function diffInto(
  before: unknown,
  after: unknown,
  path: HistoryPathToken[],
  patches: HistoryPatch[],
  beforeExists = true,
  afterExists = true,
) {
  if (beforeExists === afterExists && sameValue(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    const key = stableRowKey(before, after);
    if (key) {
      const beforeByKey = new Map(
        before.map((row, index) => [
          (row as Record<string, unknown>)[key] as PrimitiveKey,
          { row, index },
        ]),
      );
      const afterByKey = new Map(
        after.map((row, index) => [
          (row as Record<string, unknown>)[key] as PrimitiveKey,
          { row, index },
        ]),
      );
      const identities = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
      for (const identity of identities) {
        const old = beforeByKey.get(identity);
        const next = afterByKey.get(identity);
        if (!old || !next) {
          patches.push({
            kind: 'row',
            path: [...path],
            key,
            value: identity,
            before: old ? { exists: true, value: cloneHistoryValue(old.row) } : { exists: false },
            after: next ? { exists: true, value: cloneHistoryValue(next.row) } : { exists: false },
            beforeIndex: old?.index ?? -1,
            afterIndex: next?.index ?? -1,
          });
          continue;
        }
        diffInto(old.row, next.row, [...path, { kind: 'row', key, value: identity }], patches);
      }
      const beforeOrder = before.map(
        (row) => (row as Record<string, unknown>)[key] as PrimitiveKey,
      );
      const afterOrder = after.map((row) => (row as Record<string, unknown>)[key] as PrimitiveKey);
      if (!sameValue(beforeOrder, afterOrder)) {
        patches.push({
          kind: 'order',
          path: [...path],
          key,
          before: beforeOrder,
          after: afterOrder,
        });
      }
      return;
    }

    // A row without a durable identity can never be addressed safely after an insert or reorder.
    // Keep the array atomic instead of emitting numeric paths which may later hit another row.
  }

  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      diffInto(
        before[key],
        after[key],
        [...path, key],
        patches,
        Object.prototype.hasOwnProperty.call(before, key),
        Object.prototype.hasOwnProperty.call(after, key),
      );
    }
    return;
  }

  patches.push({
    kind: 'value',
    path: [...path],
    before: beforeExists ? { exists: true, value: cloneHistoryValue(before) } : { exists: false },
    after: afterExists ? { exists: true, value: cloneHistoryValue(after) } : { exists: false },
  });
}

export function diffHistoryValues(before: unknown, after: unknown): HistoryPatch[] {
  const patches: HistoryPatch[] = [];
  diffInto(before, after, [], patches);
  return patches;
}

function nestedArrayIdentityChanged(before: unknown, after: unknown): boolean {
  if (Array.isArray(before) && Array.isArray(after)) {
    const key = stableRowKey(before, after);
    if (!key) return !sameValue(before, after);
    const beforeKeys = before.map(
      (row) => (row as Record<string, unknown>)[key] as PrimitiveKey,
    );
    const afterKeys = after.map((row) => (row as Record<string, unknown>)[key] as PrimitiveKey);
    if (!sameValue(beforeKeys, afterKeys)) return true;
    const afterByKey = new Map(
      after.map((row) => [(row as Record<string, unknown>)[key] as PrimitiveKey, row]),
    );
    return before.some((row) => {
      const object = row as Record<string, unknown>;
      const next = afterByKey.get(object[key] as PrimitiveKey) as
        | Record<string, unknown>
        | undefined;
      if (!next) return true;
      // A server id is not the row selector, but replacing 0 with the stored id invalidates every
      // pre-save row snapshot. Cut before an undo can write the placeholder back.
      if (('id' in object || 'id' in next) && !Object.is(object.id ?? 0, next.id ?? 0)) return true;
      const fields = new Set([...Object.keys(object), ...Object.keys(next)]);
      for (const field of fields) {
        if (Array.isArray(object[field]) || Array.isArray(next[field])) {
          if (nestedArrayIdentityChanged(object[field], next[field])) return true;
        } else if (isObject(object[field]) && isObject(next[field])) {
          if (nestedArrayIdentityChanged(object[field], next[field])) return true;
        }
      }
      return false;
    });
  }
  if (isObject(before) && isObject(after)) {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const field of fields) {
      if (Array.isArray(before[field]) || Array.isArray(after[field])) {
        if (nestedArrayIdentityChanged(before[field], after[field])) return true;
      } else if (isObject(before[field]) && isObject(after[field])) {
        if (nestedArrayIdentityChanged(before[field], after[field])) return true;
      }
    }
  }
  return false;
}

/** True when server reconciliation makes existing row-addressed history unsafe to replay. */
export function historyArrayIdentityChanged(before: unknown, after: unknown): boolean {
  return nestedArrayIdentityChanged(before, after);
}

function valueAt(root: unknown, path: HistoryPathToken[]): unknown {
  let value = root;
  for (const token of path) {
    if (typeof token === 'object') {
      if (!Array.isArray(value)) return undefined;
      value = value.find((row) => isObject(row) && Object.is(row[token.key], token.value));
    } else {
      if (value == null || typeof value !== 'object') return undefined;
      value = (value as Record<string | number, unknown>)[token];
    }
  }
  return value;
}

function parentAt(root: unknown, path: HistoryPathToken[]) {
  if (path.length === 0) return null;
  const parent = valueAt(root, path.slice(0, -1));
  return { parent, token: path[path.length - 1] };
}

function applyStored(root: unknown, path: HistoryPathToken[], value: StoredValue) {
  const found = parentAt(root, path);
  if (!found || typeof found.token === 'object') return;
  const { parent, token } = found;
  if (Array.isArray(parent) && typeof token === 'number') {
    if (value.exists) parent[token] = cloneHistoryValue(value.value);
    return;
  }
  if (!isObject(parent) || typeof token !== 'string') return;
  if (value.exists) parent[token] = cloneHistoryValue(value.value);
  else delete parent[token];
}

function applyRow(
  root: unknown,
  patch: Extract<HistoryPatch, { kind: 'row' }>,
  side: 'before' | 'after',
) {
  const rows = valueAt(root, patch.path);
  if (!Array.isArray(rows)) return;
  const target = patch[side];
  const current = rows.findIndex((row) => isObject(row) && Object.is(row[patch.key], patch.value));
  if (!target.exists) {
    if (current >= 0) rows.splice(current, 1);
    return;
  }
  const index = side === 'before' ? patch.beforeIndex : patch.afterIndex;
  const row = cloneHistoryValue(target.value);
  if (current >= 0) rows[current] = row;
  else rows.splice(Math.max(0, Math.min(index, rows.length)), 0, row);
}

function applyOrder(
  root: unknown,
  patch: Extract<HistoryPatch, { kind: 'order' }>,
  side: 'before' | 'after',
) {
  const rows = valueAt(root, patch.path);
  if (!Array.isArray(rows)) return;
  const byKey = new Map<PrimitiveKey, unknown>();
  for (const row of rows) {
    if (!isObject(row)) continue;
    const value = row[patch.key];
    if (isPrimitiveKey(value)) byKey.set(value, row);
  }
  const ordered: unknown[] = [];
  for (const key of patch[side]) {
    const row = byKey.get(key);
    if (row !== undefined) {
      ordered.push(row);
      byKey.delete(key);
    }
  }
  ordered.push(...byKey.values());
  rows.splice(0, rows.length, ...ordered);
}

export function applyHistoryPatches<T>(
  current: T,
  patches: HistoryPatch[],
  side: 'before' | 'after',
): T {
  const next = cloneHistoryValue(current);
  for (const patch of patches) if (patch.kind === 'row') applyRow(next, patch, side);
  for (const patch of patches)
    if (patch.kind === 'value') applyStored(next, patch.path, patch[side]);
  for (const patch of patches) if (patch.kind === 'order') applyOrder(next, patch, side);
  return next;
}

export function emptyUndoHistory(nextId = 1): UndoHistoryState {
  return { undo: [], redo: [], bytes: 0, nextId };
}

function stepBytes(step: Omit<UndoHistoryStep, 'bytes'>): number {
  try {
    return new TextEncoder().encode(JSON.stringify(step)).byteLength;
  } catch {
    return UNDO_HISTORY_BYTE_LIMIT + 1;
  }
}

export function recordUndoStep(
  state: UndoHistoryState,
  before: unknown,
  after: unknown,
  label: string,
  mergeKey?: string,
  limits: { steps?: number; bytes?: number } = {},
): UndoHistoryState {
  const patches = diffHistoryValues(before, after);
  return recordUndoPatches(state, patches, label, mergeKey, limits);
}

/** Records already-computed patches so a watcher never deep-diffs the same change twice. */
export function recordUndoPatches(
  state: UndoHistoryState,
  patches: HistoryPatch[],
  label: string,
  mergeKey?: string,
  limits: { steps?: number; bytes?: number } = {},
): UndoHistoryState {
  if (patches.length === 0) return state;
  const id =
    mergeKey && state.undo.at(-1)?.mergeKey === mergeKey ? state.undo.at(-1)!.id : state.nextId;
  const draft = { id, label, ...(mergeKey ? { mergeKey } : {}), patches };
  const bytes = stepBytes(draft);
  if (bytes > (limits.bytes ?? UNDO_HISTORY_BYTE_LIMIT)) return emptyUndoHistory(state.nextId + 1);

  const replaces = !!mergeKey && state.undo.at(-1)?.mergeKey === mergeKey;
  const undo = replaces ? state.undo.slice(0, -1) : [...state.undo];
  const redoBytes = state.redo.reduce((total, step) => total + step.bytes, 0);
  let total = state.bytes - redoBytes - (replaces ? state.undo.at(-1)!.bytes : 0);
  undo.push({ ...draft, bytes });
  total += bytes;
  const maxSteps = limits.steps ?? UNDO_HISTORY_LIMIT;
  const maxBytes = limits.bytes ?? UNDO_HISTORY_BYTE_LIMIT;
  while (undo.length > maxSteps || total > maxBytes) total -= undo.shift()!.bytes;
  return {
    undo,
    redo: [],
    bytes: total,
    nextId: replaces ? state.nextId : state.nextId + 1,
  };
}

export function undoHistoryStep<T>(state: UndoHistoryState, current: T) {
  const step = state.undo.at(-1);
  if (!step) return { state, value: current, step: undefined };
  return {
    state: {
      ...state,
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, step],
    },
    value: applyHistoryPatches(current, step.patches, 'before'),
    step,
  };
}

export function redoHistoryStep<T>(state: UndoHistoryState, current: T) {
  const step = state.redo.at(-1);
  if (!step) return { state, value: current, step: undefined };
  return {
    state: {
      ...state,
      undo: [...state.undo, step],
      redo: state.redo.slice(0, -1),
    },
    value: applyHistoryPatches(current, step.patches, 'after'),
    step,
  };
}

export function historyBarrier(state: UndoHistoryState): UndoHistoryState {
  return emptyUndoHistory(state.nextId);
}
