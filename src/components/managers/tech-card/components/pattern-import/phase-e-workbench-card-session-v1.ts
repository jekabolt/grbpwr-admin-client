import type { ApplyResult, CardDraft } from 'lib/pattern-import/types';

import type { createPatternImportDxfProductSidecarCardControllerV1 } from './product-semantic-sidecar-card-controller-v1';
import type { PatternImportDxfPhaseEDocumentEvidenceV1 } from './phase-e-workbench-document-authority-v1';

type ConfirmedApply = Extract<ApplyResult, { ok: true }> & {
  commitReceipt: NonNullable<Extract<ApplyResult, { ok: true }>['commitReceipt']>;
};

export type PatternImportDxfPhaseECardSessionControllerV1 = Pick<
  ReturnType<typeof createPatternImportDxfProductSidecarCardControllerV1>,
  | 'preparePhaseEWorkbench'
  | 'authorChoices'
  | 'bindAuthoredAuthorityToConfirmedCommit'
  | 'afterConfirmedSave'
>;

export type PatternImportDxfPhaseECardSessionV1 = Readonly<{
  techCardId: number;
  /** Monotonic card-lifetime import identity. A new confirmed registration always advances it. */
  importGeneration: number;
  draft: CardDraft;
  confirmedApply: ConfirmedApply;
  controller: PatternImportDxfPhaseECardSessionControllerV1;
  loadDocumentEvidence: (scopeKey: string) => Promise<
    | Readonly<{ ok: true; evidence: PatternImportDxfPhaseEDocumentEvidenceV1; blocker: null }>
    | Readonly<{
        ok: false;
        evidence: null;
        blocker: Readonly<{ code: string; detail: string }>;
      }>
  >;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_CARD_SESSION_CONTRACT_V1 = Object.freeze({
  owner: 'card-lifetime-memory-only',
  keyedByTechCardId: true,
  registeredOnlyAfterConfirmedPatternImportSave: true,
  monotonicImportGenerationPerTechCard: true,
  draftSnapshotDetached: true,
  rawDxfRetained: false,
  rawDxfIncludedInStructuredCloneSource: false,
  survivesPageReload: false,
  persistsDraftCarrier: false,
  topologyWrites: false,
} as const);

const sessions = new Map<number, PatternImportDxfPhaseECardSessionV1>();
const generations = new Map<number, number>();
const listeners = new Map<number, Set<() => void>>();

function publish(techCardId: number): void {
  for (const listener of listeners.get(techCardId) ?? []) listener();
}

function descriptorSafeDataGraph(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  try {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null && !array) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === 'symbol') return false;
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !descriptor.enumerable ||
        !descriptorSafeDataGraph(descriptor.value, seen)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

function deepFreezeDataGraph<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      deepFreezeDataGraph(descriptor.value, seen);
  return Object.freeze(value);
}

function detachedCarrierDraft(draft: CardDraft): CardDraft | null {
  if (!descriptorSafeDataGraph(draft)) return null;
  try {
    // Build the clone source without raw strings first. This avoids a transient second full raw-DXF
    // graph while preserving every detached replay/provenance carrier used by explicit open.
    const detached = structuredClone({
      ...draft,
      scopes: draft.scopes.map((scope) => ({
        ...scope,
        dxfText: '',
        ...(scope.rul?.ok
          ? { rul: { ...scope.rul, dxfText: '', rulText: '' } }
          : scope.rul
            ? { rul: scope.rul }
            : {}),
      })),
      downloads: [],
    } satisfies CardDraft);
    return deepFreezeDataGraph(detached);
  } catch {
    return null;
  }
}

function detachedConfirmedApply(confirmedApply: ConfirmedApply): ConfirmedApply | null {
  if (!descriptorSafeDataGraph(confirmedApply)) return null;
  try {
    return deepFreezeDataGraph(structuredClone(confirmedApply));
  } catch {
    return null;
  }
}

export function readPatternImportDxfPhaseECardSessionV1(
  techCardId: number | undefined,
): PatternImportDxfPhaseECardSessionV1 | null {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId <= 0) return null;
  return sessions.get(techCardId) ?? null;
}

export function subscribePatternImportDxfPhaseECardSessionV1(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId <= 0) return () => {};
  const cardListeners = listeners.get(techCardId) ?? new Set<() => void>();
  cardListeners.add(listener);
  listeners.set(techCardId, cardListeners);
  return () => {
    cardListeners.delete(listener);
    if (!cardListeners.size) listeners.delete(techCardId);
  };
}

export function registerPatternImportDxfPhaseECardSessionV1(
  techCardId: number | undefined,
  draft: CardDraft,
  confirmedApply: ConfirmedApply,
  controller: PatternImportDxfPhaseECardSessionControllerV1,
  loadDocumentEvidence: PatternImportDxfPhaseECardSessionV1['loadDocumentEvidence'],
): boolean {
  const detachedDraft = detachedCarrierDraft(draft);
  const detachedApply = detachedConfirmedApply(confirmedApply);
  if (
    !techCardId ||
    !Number.isSafeInteger(techCardId) ||
    techCardId <= 0 ||
    !detachedDraft ||
    detachedDraft.techCardId !== techCardId ||
    !detachedApply ||
    !detachedApply.ok ||
    !detachedApply.commitReceipt ||
    !controller ||
    typeof loadDocumentEvidence !== 'function'
  )
    return false;
  const importGeneration = (generations.get(techCardId) ?? 0) + 1;
  if (!Number.isSafeInteger(importGeneration) || importGeneration <= 0) return false;
  generations.set(techCardId, importGeneration);
  sessions.set(
    techCardId,
    Object.freeze({
      techCardId,
      importGeneration,
      draft: detachedDraft,
      confirmedApply: detachedApply,
      controller,
      loadDocumentEvidence,
    }),
  );
  publish(techCardId);
  return true;
}

export function clearPatternImportDxfPhaseECardSessionV1(
  techCardId: number | undefined,
  expectedController?: PatternImportDxfPhaseECardSessionControllerV1,
): void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId <= 0) return;
  const current = sessions.get(techCardId);
  if (!current || (expectedController && current.controller !== expectedController)) return;
  sessions.delete(techCardId);
  publish(techCardId);
}
