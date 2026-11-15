import type { DxfProductPhaseDSizeSelectionResultV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import type { ApplyResult, CardDraft } from '../../pattern-import/types';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from './pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  admitPatternImportDxfProductPhaseEIntentV1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1,
  type PatternImportDxfProductPhaseEIntentV1,
} from './pattern-import-dxf-product-phase-e-intent-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_V1 =
  'pattern-import-dxf-product-phase-e-authority-registry/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHOR_REQUEST_V1 =
  'pattern-import-dxf-product-phase-e-author-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_SNAPSHOT_V1 =
  'pattern-import-dxf-product-phase-e-authority-snapshot/1' as const;

export type PatternImportDxfProductPhaseEAuthorRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHOR_REQUEST_V1;
  draft: CardDraft;
  /** Explicit operator/domain authority. It is validated, never reconstructed from card rows. */
  intent: PatternImportDxfProductPhaseEIntentV1;
}>;

export type PatternImportDxfProductPhaseEAuthorityV1 = Readonly<{
  scopeKey: string;
  selection: DxfProductPhaseDSizeSelectionResultV1;
  intent: PatternImportDxfProductPhaseEIntentV1;
}>;

export type PatternImportDxfProductPhaseEAuthoritySnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_SNAPSHOT_V1;
  key: string;
  techCardId: number;
  scopeKey: string;
  sizeToken: string;
  sizeSelectionCanonicalSha256: string;
  phaseEPlanCanonicalSha256: string;
  status: 'ready';
  rawDxfRetained: false;
  cardRowsUsedAsAssemblyAuthority: false;
  survivesPageReload: false;
  productionReady: false;
}>;

export type PatternImportDxfProductPhaseEAuthorityBlockerV1 = Readonly<{
  code:
    | 'invalid-request'
    | 'phase-d-carrier-unavailable'
    | 'writer-piece-carrier-unavailable'
    | 'size-selection-blocked'
    | 'phase-e-admission-blocked';
  detail: string;
}>;

export type PatternImportDxfProductPhaseEAuthorResultV1 =
  | Readonly<{
      ok: true;
      snapshot: PatternImportDxfProductPhaseEAuthoritySnapshotV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      snapshot: null;
      blockers: readonly [PatternImportDxfProductPhaseEAuthorityBlockerV1];
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_CONTRACT_V1 = Object.freeze({
  explicitIntentRequired: true,
  cardRowsUsedAsAssemblyAuthority: false,
  sizeSelectionFreshBuiltAtAuthoring: true,
  sizeSelectionAndPhaseEAdmissionFreshRebuiltAfterSave: true,
  staleSelectionOrIntentAccepted: false,
  rawDxfRetained: false,
  multipleScopesPerPostApplyAttemptSupported: false,
  survivesPageReload: false,
  productCardConfigured: false,
  productionReady: false,
} as const);

type StoredAuthority = Readonly<{
  techCardId: number;
  scopeKey: string;
  sizeToken: string;
  intent: PatternImportDxfProductPhaseEIntentV1;
  sizeSelectionCanonicalSha256: string;
  phaseEPlanCanonicalSha256: string;
}>;

const MAX_DETAIL_BYTES = 1_024;
const MAX_DATA_NODES = 20_000;
const MAX_DATA_DEPTH = 48;
const textEncoder = new TextEncoder();

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function blocker(
  code: PatternImportDxfProductPhaseEAuthorityBlockerV1['code'],
  detail: string,
): PatternImportDxfProductPhaseEAuthorResultV1 {
  return Object.freeze({
    ok: false as const,
    snapshot: null,
    blockers: Object.freeze([Object.freeze({ code, detail: bounded(detail) })]) as readonly [
      PatternImportDxfProductPhaseEAuthorityBlockerV1,
    ],
  });
}

function exactDataProperty(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    !descriptor ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  )
    return undefined;
  return descriptor.value;
}

/** Copies only bounded JSON-like data and refuses accessors, symbols, cycles and exotic objects. */
function cloneData<T>(input: T): T {
  let nodes = 0;
  const active = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DATA_DEPTH || ++nodes > MAX_DATA_NODES) throw new TypeError('data bound');
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0))
    )
      return value;
    if (!value || typeof value !== 'object' || active.has(value)) throw new TypeError('data shape');
    if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value))
      throw new TypeError('data prototype');
    active.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string'))
        throw new TypeError('symbol key');
      if (Array.isArray(value)) {
        const keys = Object.keys(descriptors).filter((key) => key !== 'length');
        if (
          keys.length !== value.length ||
          keys.some((key, index) => key !== String(index)) ||
          descriptors.length?.value !== value.length
        )
          throw new TypeError('sparse array');
        return keys.map((key) => {
          const descriptor = descriptors[key];
          if (
            !descriptor?.enumerable ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined
          )
            throw new TypeError('array accessor');
          return visit(descriptor.value, depth + 1);
        });
      }
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(descriptors)) {
        const descriptor = descriptors[key];
        if (
          !descriptor?.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        )
          throw new TypeError('object accessor');
        output[key] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      active.delete(value);
    }
  };
  return visit(input, 0) as T;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

async function freshAuthority(
  draft: CardDraft,
  intent: PatternImportDxfProductPhaseEIntentV1,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<
  | Readonly<{
      ok: true;
      authority: PatternImportDxfProductPhaseEAuthorityV1;
      sizeSelectionCanonicalSha256: string;
      phaseEPlanCanonicalSha256: string;
    }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfProductPhaseEAuthorityBlockerV1['code'];
      detail: string;
    }>
> {
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(
    draft,
    intent.scopeKey,
    intent.sizeToken,
    crypto,
  );
  if (!selected.ok)
    return {
      ok: false,
      code:
        selected.blockers[0].code === 'phase-d-carrier-unavailable'
          ? 'phase-d-carrier-unavailable'
          : selected.blockers[0].code === 'writer-piece-carrier-unavailable'
            ? 'writer-piece-carrier-unavailable'
            : 'size-selection-blocked',
      detail: selected.blockers[0].detail,
    };
  const selection = selected.selection;
  const admitted = await admitPatternImportDxfProductPhaseEIntentV1(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ADMISSION_V1,
      draft,
      selection,
      intent,
    },
    crypto,
  );
  if (!admitted.ok)
    return {
      ok: false,
      code: 'phase-e-admission-blocked',
      detail: admitted.blockers
        .map(({ code, field, detail }) => `${code}(${field}): ${detail}`)
        .join('; '),
    };
  return Object.freeze({
    ok: true as const,
    authority: Object.freeze({ scopeKey: intent.scopeKey, selection, intent }),
    sizeSelectionCanonicalSha256: selection.selection.canonicalSha256,
    phaseEPlanCanonicalSha256: admitted.plan.canonicalSha256,
  });
}

export class PatternImportDxfProductPhaseEAuthorityResolutionErrorV1 extends Error {
  readonly code:
    'ambiguous-authored-authority' | 'confirmed-scope-missing' | 'authored-authority-moved';

  constructor(
    code: 'ambiguous-authored-authority' | 'confirmed-scope-missing' | 'authored-authority-moved',
    message: string,
  ) {
    super(message);
    this.name = 'PatternImportDxfProductPhaseEAuthorityResolutionErrorV1';
    this.code = code;
  }
}

/**
 * Keeps explicitly authored Phase-E records for one card lifetime. It stores no draft, source
 * geometry or selection owner: those are rebuilt from the exact draft before and after save.
 */
export function createPatternImportDxfProductPhaseEAuthorityRegistryV1(
  options: Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_V1;
    crypto?: Pick<Crypto, 'subtle'>;
  }>,
) {
  if (
    !options ||
    options.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_V1
  )
    throw new TypeError('Exact product Phase-E authority registry options are required.');
  const crypto = options.crypto ?? globalThis.crypto;
  const records = new Map<string, StoredAuthority>();
  const snapshots = new Map<string, PatternImportDxfProductPhaseEAuthoritySnapshotV1>();

  const author = async (
    request: PatternImportDxfProductPhaseEAuthorRequestV1,
  ): Promise<PatternImportDxfProductPhaseEAuthorResultV1> => {
    if (
      !request ||
      typeof request !== 'object' ||
      Object.getPrototypeOf(request) !== Object.prototype ||
      Reflect.ownKeys(request).length !== 3 ||
      exactDataProperty(request, 'schemaVersion') !==
        PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHOR_REQUEST_V1
    )
      return blocker('invalid-request', 'An exact descriptor-safe author request is required.');
    const draft = exactDataProperty(request, 'draft') as CardDraft | undefined;
    const suppliedIntent = exactDataProperty(request, 'intent');
    if (!draft || !suppliedIntent)
      return blocker('invalid-request', 'Draft and explicit Phase-E intent are required.');
    let intent: PatternImportDxfProductPhaseEIntentV1;
    try {
      intent = cloneData(suppliedIntent) as PatternImportDxfProductPhaseEIntentV1;
    } catch {
      return blocker('invalid-request', 'Phase-E intent must be bounded accessor-free data.');
    }
    const fresh = await freshAuthority(draft, intent, crypto);
    if (!fresh.ok) return blocker(fresh.code, fresh.detail);
    const key = `${draft.techCardId}:${intent.scopeKey}`;
    const record = Object.freeze({
      techCardId: draft.techCardId,
      scopeKey: intent.scopeKey,
      sizeToken: intent.sizeToken,
      intent: deepFreeze(intent),
      sizeSelectionCanonicalSha256: fresh.sizeSelectionCanonicalSha256,
      phaseEPlanCanonicalSha256: fresh.phaseEPlanCanonicalSha256,
    });
    const snapshot = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_SNAPSHOT_V1,
      key,
      techCardId: draft.techCardId,
      scopeKey: intent.scopeKey,
      sizeToken: intent.sizeToken,
      sizeSelectionCanonicalSha256: fresh.sizeSelectionCanonicalSha256,
      phaseEPlanCanonicalSha256: fresh.phaseEPlanCanonicalSha256,
      status: 'ready' as const,
      rawDxfRetained: false as const,
      cardRowsUsedAsAssemblyAuthority: false as const,
      survivesPageReload: false as const,
      productionReady: false as const,
    });
    records.set(key, record);
    snapshots.set(key, snapshot);
    return Object.freeze({
      ok: true as const,
      snapshot,
      blockers: Object.freeze([]) as readonly [],
    });
  };

  const provide = async (
    draft: CardDraft,
    apply: Extract<ApplyResult, { ok: true }>,
  ): Promise<PatternImportDxfProductPhaseEAuthorityV1 | null> => {
    const receipt = apply.commitReceipt;
    if (!receipt || receipt.techCardId !== draft.techCardId) return null;
    const candidates = [...records.values()].filter(
      (record) =>
        record.techCardId === draft.techCardId &&
        receipt.scopes.some(({ scopeKey }) => scopeKey === record.scopeKey),
    );
    if (!candidates.length) return null;
    if (candidates.length !== 1)
      throw new PatternImportDxfProductPhaseEAuthorityResolutionErrorV1(
        'ambiguous-authored-authority',
        'The V1 post-apply host accepts exactly one explicitly authored product scope.',
      );
    const record = candidates[0];
    if (receipt.scopes.filter(({ scopeKey }) => scopeKey === record.scopeKey).length !== 1)
      throw new PatternImportDxfProductPhaseEAuthorityResolutionErrorV1(
        'confirmed-scope-missing',
        'The explicitly authored scope is missing or ambiguous in the confirmed receipt.',
      );
    const fresh = await freshAuthority(draft, record.intent, crypto);
    if (
      !fresh.ok ||
      fresh.sizeSelectionCanonicalSha256 !== record.sizeSelectionCanonicalSha256 ||
      fresh.phaseEPlanCanonicalSha256 !== record.phaseEPlanCanonicalSha256
    )
      throw new PatternImportDxfProductPhaseEAuthorityResolutionErrorV1(
        'authored-authority-moved',
        'Phase-D selection or Phase-E admission moved after authoring; author a new intent.',
      );
    return fresh.authority;
  };

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORITY_REGISTRY_V1,
    author,
    provide,
    read: (key: string) => snapshots.get(key) ?? null,
    remove: (key: string) => {
      const removed = records.delete(key);
      snapshots.delete(key);
      return removed;
    },
    dispose: () => {
      records.clear();
      snapshots.clear();
    },
  });
}
