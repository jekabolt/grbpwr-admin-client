import { abortableAdminService } from 'api/api';
import type { GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { DxfExactAssemblyGraphAoSnapshotV1 } from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import { mapPatternImportDxfPhaseESavedAssemblySnapshotRpcResponseV1 } from './saved-assembly-snapshot-rpc-bridge-v1';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
} from './saved-assembly-topology-hash-v1';
import type { PatternImportDxfPhaseESavedAssemblyTransportResponseV1 } from './saved-assembly-authority-transport-v1';

export const SAVED_FULL_ASSEMBLY_SNAPSHOT_V1 = 'saved-full-assembly-snapshot/1' as const;
export const SAVED_FULL_ASSEMBLY_SNAPSHOT_CLAIMS_V1 = Object.freeze({
  generatedProductionRpc: true,
  sameRevisionBoundedJoin: true,
  sameOuterBytesAtEveryRead: true,
  finalReadPerformed: true,
  freshAtReadPublicationOnly: true,
  storedSeamConsistencyOnly: true,
  exactDxfTopologyAuthority: false,
  durableFullGraphAvailable: false,
  productAuthority: false,
  runtimeAuthority: false,
} as const);
export type SavedFullAssemblySnapshotRequestV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  seedOperationNumber: number;
}>;
export type SavedFullAssemblySnapshotProjectionV1 = DxfExactAssemblyGraphAoSnapshotV1 &
  Readonly<{
    /** Complete operation wire payload, including workflow fields outside topology SHA V1. */
    operationsPayloadCanonicalJson: string;
    selectedTopologyReceipts: readonly Readonly<{
      sourceOperationNumber: number;
      sha256: string;
      canonicalJson: string;
    }>[];
    /** Exact bytes, not a decoded exact-topology claim. CAS must use this complete outer SHA. */
    outer:
      | Readonly<{ status: 'absent' }>
      | Readonly<{
          status: 'present';
          mediaType: string;
          sha256: string;
          byteLength: number;
          bytes: Uint8Array;
          persistedCardLockVersion: number;
          persistedSavedRowRevision: number;
          currentRowBound: boolean;
        }>;
    snapshotSha256: string;
    rpcReadCount: number;
    claims: typeof SAVED_FULL_ASSEMBLY_SNAPSHOT_CLAIMS_V1;
  }>;
export type SavedFullAssemblySnapshotReceiptV1 = Readonly<{
  version: typeof SAVED_FULL_ASSEMBLY_SNAPSHOT_V1;
  opaque: 'module-private-ao-read-receipt';
}>;
export class SavedFullAssemblySnapshotErrorV1 extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'SavedFullAssemblySnapshotErrorV1';
  }
}
const states = new WeakMap<
  object,
  {
    projection: SavedFullAssemblySnapshotProjectionV1;
    controller: AbortController;
    unlink: () => void;
  }
>();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const maxBytes = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const shaPattern = /^[0-9a-f]{64}$/;
const structural = new Set([
  'join_lockstitch',
  'topstitch',
  'overlock_serge',
  'coverstitch',
  'coverlock',
  'chainstitch',
  'blindhem',
  'zigzag',
  'amf_handstitch_imitation',
]);
function fail(code: string, detail: string): never {
  throw new SavedFullAssemblySnapshotErrorV1(code, detail);
}
function check(signal: AbortSignal): void {
  if (aborted.call(signal)) fail('cancelled', 'Full Assembly read cancelled.');
}
function canonical(value: unknown): string {
  return canonicalizePatternImportDxfPhaseESavedAssemblyValueV1(value, 16 * 1024 * 1024);
}
async function hash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
function capture(value: unknown): unknown {
  let nodes = 0;
  let characters = 0;
  const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 100_000 || depth > 24) fail('bounds', 'Snapshot shape exceeds bounds.');
    if (v === undefined || v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return v;
    if (typeof v === 'string') {
      characters += v.length;
      if (characters > 16 * 1024 * 1024) fail('bounds', 'Snapshot text exceeds bounds.');
      return v;
    }
    if (!v || typeof v !== 'object' || active.has(v))
      fail('invalid-data', 'Snapshot must be acyclic plain data.');
    const array = Array.isArray(v);
    const ds = Object.getOwnPropertyDescriptors(v);
    if (
      Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype) ||
      Reflect.ownKeys(ds).some((k) => typeof k !== 'string')
    )
      fail('invalid-data', 'Snapshot prototypes/symbols are unsupported.');
    if (array && (ds.length.value > 4096 || Object.keys(ds).length !== ds.length.value + 1))
      fail('bounds', 'Snapshot arrays must be dense and bounded.');
    active.add(v);
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const [k, d] of Object.entries(ds)) {
      if (array && k === 'length') continue;
      if (
        !('value' in d) ||
        !d.enumerable ||
        k === '__proto__' ||
        (array && !/^(0|[1-9][0-9]*)$/.test(k))
      )
        fail('invalid-data', 'Snapshot accessors and hidden fields are unsupported.');
      Object.defineProperty(out, k, { value: copy(d.value, depth + 1), enumerable: true });
    }
    active.delete(v);
    return Object.freeze(out);
  };
  return copy(value, 0);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-shape', 'Expected a snapshot record.');
  return value as Record<string, unknown>;
}
function int(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    fail('invalid-number', 'Expected a bounded integer.');
  return value;
}
function text(value: unknown, max = 4096): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > max ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail('invalid-text', 'Expected bounded nonempty text.');
  return value;
}
function sha(value: unknown): string {
  const v = text(value, 64);
  if (!shaPattern.test(v)) fail('invalid-sha', 'Expected lowercase SHA-256.');
  return v;
}
function decode(value: unknown, length?: number): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    fail('invalid-base64', 'Canonical bounded base64 is required.');
  const raw = atob(value);
  if (
    btoa(raw) !== value ||
    raw.length > maxBytes ||
    (length !== undefined && raw.length !== length)
  )
    fail('invalid-base64', 'Base64 byte length or pad bits differ.');
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
type Outer = SavedFullAssemblySnapshotProjectionV1['outer'];
async function outer(value: unknown, row: DxfProductSavedRowIdentityV1): Promise<Outer> {
  if (value === undefined) return Object.freeze({ status: 'absent' });
  const v = object(value);
  const mediaType = text(v.mediaType);
  if (!/^application\/vnd\.grbpwr\.pattern-dxf-product-composite\.v[34567]\+json$/.test(mediaType))
    fail('unsupported-sidecar', 'Only existing Composite V3–V7 byte envelopes are supported.');
  const byteLength = int(v.byteLength, 1);
  if (byteLength > maxBytes) fail('bounds', 'Sidecar exceeds the backend 4 MiB bound.');
  const bytes = decode(v.sidecarBytes, byteLength);
  const digest = sha(v.sidecarSha256);
  if ((await hash(bytes)) !== digest)
    fail('sidecar-integrity', 'Outer bytes do not match their SHA.');
  if (
    int(v.techCardId, 1) !== row.techCardId ||
    text(v.patternLineKey) !== row.patternLineKey ||
    sha(v.dxfSha256) !== row.sha256
  )
    fail('row-drift', 'Outer sidecar names another saved source.');
  const lock = int(v.cardLockVersion);
  const revision = int(v.savedRowRevision, 1);
  // An old carrier remains readable after an AO edit. Record its staleness; never promote it.
  return Object.freeze({
    status: 'present',
    mediaType,
    sha256: digest,
    byteLength,
    bytes,
    persistedCardLockVersion: lock,
    persistedSavedRowRevision: revision,
    currentRowBound: lock === row.cardLockVersion && revision === row.revision,
  });
}
function sameOuter(a: Outer, b: Outer): boolean {
  return (
    a.status === b.status &&
    (a.status === 'absent' ||
      (b.status === 'present' &&
        a.mediaType === b.mediaType &&
        a.sha256 === b.sha256 &&
        a.byteLength === b.byteLength &&
        a.persistedCardLockVersion === b.persistedCardLockVersion &&
        a.persistedSavedRowRevision === b.persistedSavedRowRevision &&
        equalBytes(a.bytes, b.bytes)))
  );
}
function topology(response: PatternImportDxfPhaseESavedAssemblyTransportResponseV1): unknown {
  const anchor = (
    a: PatternImportDxfPhaseESavedAssemblyTransportResponseV1['selectedSeams'][number]['sideA'][number],
  ) => ({
    contourSig: a.contourSig,
    edgeHint: a.edgeHint,
    lenMm: a.lenMm,
    pieceLineKey: a.pieceLineKey,
    range: [a.rangeFrom, a.rangeTo],
    samples: a.samples.map(({ u, v }) => [u, v]),
    ...(a.layer ? { layer: a.layer } : {}),
  });
  return {
    operations: response.operations.map((op) => ({
      authoringOperationId: null,
      inputKeys: op.inputKeys,
      number: op.operationNumber,
      phaseEKind: structural.has(op.work) ? 'stitch' : null,
      outputUnitKey: op.outputUnitKey,
      outputUnitName: op.outputUnitName,
      seamKeys: op.seamKeys,
      work: op.work,
    })),
    seams: response.selectedSeams.map((s) => ({
      anchoredSize: s.anchoredSize,
      direction: s.direction,
      kind: s.kind,
      confirmed: s.status === 'confirmed',
      seamKey: s.seamKey,
      sideA: s.sideA.map(anchor),
      sideB: s.sideB.map(anchor),
      source: s.source,
      stale: s.stale,
    })),
    selectedOperationNumber: response.selectedOperationNumber,
  };
}
function operations(response: PatternImportDxfPhaseESavedAssemblyTransportResponseV1): void {
  const numbers = new Set<number>();
  const keys = new Set<string>();
  if (!response.operations.length || response.operations.length > 4096)
    fail('bounds', 'AO operation count is unsupported.');
  for (const op of response.operations) {
    int(op.operationNumber, 1);
    if (numbers.has(op.operationNumber))
      fail('duplicate-operation', 'AO operation numbers repeat.');
    numbers.add(op.operationNumber);
    if (op.seamKeys.length > 64) fail('bounds', 'Operation exceeds 64 seams.');
    if (op.seamKeys.length && !structural.has(op.work))
      fail(
        'unsupported-operation',
        'Every seam-bearing operation must be a supported structural stitch.',
      );
    for (const key of op.seamKeys) {
      text(key, 256);
      if (keys.has(key)) fail('duplicate-seam-owner', 'A seam belongs to more than one operation.');
      keys.add(key);
    }
  }
  if (keys.size < 1 || keys.size > 400)
    fail('bounds', 'The full graph must contain 1–400 distinct seams.');
}

/** Fixed generated transport; no injected read callback or caller-supplied snapshot can mint this receipt.
 * Backend revision protects operations + seam writes. Outer bytes have independent CAS, so every
 * selected read and the final seed read must agree on them too. No partial join is retained/retried. */
export async function readSavedFullAssemblySnapshotV1(
  raw: SavedFullAssemblySnapshotRequestV1,
  signal?: AbortSignal,
): Promise<SavedFullAssemblySnapshotReceiptV1> {
  if (signal !== undefined) aborted.call(signal);
  const request = object(capture(raw));
  if (Object.keys(request).sort().join('|') !== 'row|seedOperationNumber')
    fail('invalid-request', 'Exact row and seed operation are required.');
  const row = object(request.row) as DxfProductSavedRowIdentityV1;
  if (
    Object.keys(row).sort().join('|') !==
    'cardLockVersion|patternLineKey|revision|scopeKey|sha256|sizeBytes|techCardId|url'
  )
    fail('invalid-row', 'All eight exact row fields are required.');
  int(row.techCardId, 1);
  int(row.revision, 1);
  int(row.cardLockVersion);
  int(row.sizeBytes, 1);
  text(row.scopeKey);
  text(row.patternLineKey);
  text(row.url);
  sha(row.sha256);
  const seed = int(request.seedOperationNumber, 1);
  const controller = new AbortController();
  let receipt: SavedFullAssemblySnapshotReceiptV1 | null = null;
  const cancel = () => {
    controller.abort();
    if (receipt) disposeSavedFullAssemblySnapshotV1(receipt);
  };
  const unlink = () => {
    if (signal) remove.call(signal, 'abort', cancel);
  };
  try {
    if (signal) {
      add.call(signal, 'abort', cancel, { once: true });
      if (aborted.call(signal)) cancel();
    }
    check(controller.signal);
    let reads = 0;
    const read = async (selected: number, expectedRevision?: string) => {
      check(controller.signal);
      const rpc: GetTechCardSavedAssemblySnapshotRequest = {
        techCardId: row.techCardId,
        patternLineKey: row.patternLineKey,
        expectedScopeKey: row.scopeKey,
        expectedSavedRowRevision: row.revision,
        expectedCardLockVersion: row.cardLockVersion,
        expectedUrl: row.url,
        expectedSizeBytes: row.sizeBytes,
        expectedSha256: row.sha256,
        selectedOperationNumber: selected,
        ...(expectedRevision ? { expectedServerAssemblyRevision: expectedRevision } : {}),
      };
      let rawResponse: unknown;
      try {
        rawResponse = await abortableAdminService(
          controller.signal,
        ).GetTechCardSavedAssemblySnapshot(rpc);
      } catch {
        check(controller.signal);
        fail('rpc-failed', 'Transactional saved Assembly read failed.');
      }
      check(controller.signal);
      reads++;
      const response = object(capture(rawResponse));
      // Omit undefined optional fields exactly as protobuf JSON does; preserve every wire field.
      const operationsPayloadCanonicalJson = canonical(
        JSON.parse(JSON.stringify(response.operations)),
      );
      // Reuse existing strict row/operation/seam mapper; outer parsing here deliberately supports
      // all admitted media and keeps historical lock evidence instead of coercing it into V3.
      const { semanticSidecar, ...rowAndAo } = response;
      const mapped =
        mapPatternImportDxfPhaseESavedAssemblySnapshotRpcResponseV1(rowAndAo).transportResponse;
      if (canonical(mapped.row) !== canonical(row) || mapped.selectedOperationNumber !== selected)
        fail('row-drift', 'Snapshot row/operation differs from the request.');
      if (
        !/^asm:v1:[0-9a-f]{32}:[1-9][0-9]*$/.test(mapped.serverAssemblyRevision) ||
        (expectedRevision && mapped.serverAssemblyRevision !== expectedRevision)
      )
        fail('assembly-drift', 'Assembly lineage/revision moved.');
      operations(mapped);
      const op = mapped.operations.find((o) => o.operationNumber === selected);
      if (
        !op ||
        op.seamKeys.length === 0 ||
        canonical(op.seamKeys) !== canonical(mapped.selectedSeams.map((s) => s.seamKey))
      )
        fail('seam-coverage', 'Selected seam order/coverage differs.');
      for (const seam of mapped.selectedSeams) {
        if (
          seam.status !== 'confirmed' ||
          seam.stale ||
          !['edge', 'partial', 'composite'].includes(seam.kind) ||
          seam.direction === 'unknown' ||
          !seam.anchoredSize ||
          seam.sideA.length !== 1 ||
          seam.sideB.length !== 1 ||
          !seam.sideA[0].pieceLineKey ||
          !seam.sideB[0].pieceLineKey ||
          seam.sideA[0].pieceLineKey === seam.sideB[0].pieceLineKey
        )
          fail(
            'unsupported-seam',
            'A seam is missing, unconfirmed, stale, or outside the two-sided structural profile.',
          );
      }
      const canonicalJson = canonical(topology(mapped));
      const wireCanonical = new TextDecoder('utf-8', { fatal: true }).decode(
        decode(response.topologyCanonicalJson),
      );
      if (
        wireCanonical !== canonicalJson ||
        (await hash(
          encoder.encode(
            `${PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1}\0${canonicalJson}`,
          ),
        )) !== mapped.serverTopologySha256
      )
        fail(
          'topology-integrity',
          'Selected server topology bytes/hash differ from the complete mapped response.',
        );
      const envelope = await outer(semanticSidecar, row);
      check(controller.signal);
      return { mapped, envelope, canonicalJson, operationsPayloadCanonicalJson };
    };
    const first = await read(seed);
    check(controller.signal);
    const revision = first.mapped.serverAssemblyRevision;
    const ops = canonical(first.mapped.operations);
    const joined = [first];
    const same = (next: typeof first) => {
      if (
        canonical(next.mapped.operations) !== ops ||
        next.operationsPayloadCanonicalJson !== first.operationsPayloadCanonicalJson ||
        !sameOuter(first.envelope, next.envelope)
      )
        fail('join-drift', 'Complete AO or exact outer sidecar changed during the bounded join.');
    };
    for (const op of first.mapped.operations) {
      if (!op.seamKeys.length || op.operationNumber === seed) continue;
      const next = await read(op.operationNumber, revision);
      check(controller.signal);
      same(next);
      joined.push(next);
    }
    const final = await read(seed, revision);
    check(controller.signal);
    same(final);
    if (final.canonicalJson !== first.canonicalJson)
      fail('join-drift', 'Seed selected seams changed before publication.');
    const byNumber = new Map(joined.map((r) => [r.mapped.selectedOperationNumber, r]));
    const active = first.mapped.operations.filter((op) => op.seamKeys.length > 0);
    const selectedTopologyReceipts = active.map((op) => {
      const r = byNumber.get(op.operationNumber)!;
      return {
        sourceOperationNumber: op.operationNumber,
        sha256: r.mapped.serverTopologySha256,
        canonicalJson: r.canonicalJson,
      };
    });
    const seams = active.flatMap((op) =>
      byNumber.get(op.operationNumber)!.mapped.selectedSeams.map((s) => ({
        seamKey: s.seamKey,
        sourceOperationNumber: op.operationNumber,
        anchoredSize: s.anchoredSize,
        direction: s.direction as 'same' | 'reversed',
        pieceLineKeys: [s.sideA[0].pieceLineKey, s.sideB[0].pieceLineKey] as const,
      })),
    );
    const snapshotSha256 = await hash(
      encoder.encode(
        `saved-full-assembly-snapshot/1\0${canonical({ row, serverAssemblyRevision: revision, operations: first.mapped.operations, operationsPayloadCanonicalJson: first.operationsPayloadCanonicalJson, seams, selectedTopologyReceipts, outer: first.envelope.status === 'absent' ? first.envelope : { status: first.envelope.status, mediaType: first.envelope.mediaType, sha256: first.envelope.sha256, byteLength: first.envelope.byteLength, persistedCardLockVersion: first.envelope.persistedCardLockVersion, persistedSavedRowRevision: first.envelope.persistedSavedRowRevision, currentRowBound: first.envelope.currentRowBound } })}`,
      ),
    );
    check(controller.signal);
    const projection = {
      row,
      serverAssemblyRevision: revision,
      operations: first.mapped.operations,
      operationsPayloadCanonicalJson: first.operationsPayloadCanonicalJson,
      seams,
      selectedTopologyReceipts,
      outer: first.envelope,
      snapshotSha256,
      rpcReadCount: reads,
      claims: SAVED_FULL_ASSEMBLY_SNAPSHOT_CLAIMS_V1,
    };
    receipt = Object.freeze({
      version: SAVED_FULL_ASSEMBLY_SNAPSHOT_V1,
      opaque: 'module-private-ao-read-receipt',
    });
    states.set(receipt, { projection, controller, unlink });
    check(controller.signal);
    return receipt;
  } catch (error) {
    unlink();
    controller.abort();
    if (receipt) states.delete(receipt);
    throw error;
  }
}

/** Historical detached projection; a later compile/save must perform another fresh bounded read. */
export function projectSavedFullAssemblySnapshotV1(
  receipt: unknown,
): SavedFullAssemblySnapshotProjectionV1 {
  if (!receipt || typeof receipt !== 'object')
    fail('forged-receipt', 'The AO receipt is not genuine.');
  const state = states.get(receipt);
  if (!state) fail('forged-receipt', 'The AO receipt is unavailable.');
  check(state.controller.signal);
  return structuredClone(state.projection);
}
export function disposeSavedFullAssemblySnapshotV1(receipt: unknown): void {
  if (!receipt || typeof receipt !== 'object') return;
  const state = states.get(receipt);
  if (!state) return;
  states.delete(receipt);
  state.unlink();
  state.controller.abort();
}
