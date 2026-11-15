import { embedManifest } from '../../pattern-import/manifest';
import { isAsciiDxf } from '../../pattern-import/write/format';
import { writeDxfDetailed } from '../../pattern-import/write';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type ConversionManifest,
  type DraftWriterReplayV1,
} from '../../pattern-import/types';

export const PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1 =
  'pattern-import-dxf-product-writer-replay/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_RECEIPT_V1 =
  'pattern-import-dxf-product-writer-replay-receipt/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_WRITER_ID_V1 =
  'grbpwr.pattern-import.writeDxfDetailed' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1 = 'r12' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_WRITER_FORMAT_V1 = 'AAMA-DXF-AC1009' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 40 * 1024 * 1024;
const textEncoder = new TextEncoder();

export type PatternImportDxfProductWriterReplayInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1;
  replay: DraftWriterReplayV1;
  finalManifest: ConversionManifest;
  expected: Readonly<{ scopeKey: string; exportSha256: string }>;
}>;

export type PatternImportDxfProductWriterReplayBlockerV1 = Readonly<{
  code:
    | 'invalid-input'
    | 'unsupported-writer-dialect'
    | 'writer-replay-failed'
    | 'base-manifest-mismatch'
    | 'writer-output-invalid'
    | 'export-sha-mismatch'
    | 'sha256-unavailable';
  detail: string;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CLAIMS_V1 = Object.freeze({
  productionWriteDxfDetailedInvoked: true,
  productR12DialectReplayed: true,
  finalManifestEmbedded: true,
  completeProductBytesHashed: true,
  callerSuppliedDxfBytesAccepted: false,
  callerSuppliedDigestAcceptedAsAuthority: false,
  g4f1MappingBound: false,
  g4f3Integrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  productionWriteDxfDetailedInvoked: false as const,
  productR12DialectReplayed: false as const,
  finalManifestEmbedded: false as const,
  completeProductBytesHashed: false as const,
  callerSuppliedDxfBytesAccepted: false as const,
  callerSuppliedDigestAcceptedAsAuthority: false as const,
  g4f1MappingBound: false as const,
  g4f3Integrated: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductWriterReplayResultV1 =
  | Readonly<{
      ok: true;
      receipt: Readonly<{
        schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_RECEIPT_V1;
        writer: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_ID_V1;
        dialect: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1;
        format: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_FORMAT_V1;
        scopeKey: string;
        createdAt: string;
        manifestGateEmbedded: boolean;
        exportSha256: string;
        byteLength: number;
        blockCount: number;
      }>;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blockers: readonly [PatternImportDxfProductWriterReplayBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

function blocked(
  code: PatternImportDxfProductWriterReplayBlockerV1['code'],
  detail: string,
): PatternImportDxfProductWriterReplayResultV1 {
  return Object.freeze({
    ok: false as const,
    receipt: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      PatternImportDxfProductWriterReplayBlockerV1,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('non-data value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function sha256(
  crypto: Pick<Crypto, 'subtle'> | undefined,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Rebuilds the complete product byte stream from typed writer inputs and the final manifest. Raw
 * DXF text is neither accepted nor returned. This owner establishes byte parity only; a later
 * composition must still bind the replay job to fresh G4F1 mapping authority before G4F3 can use it.
 */
export async function replayPatternImportDxfProductWriterV1(
  input: PatternImportDxfProductWriterReplayInputV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductWriterReplayResultV1> {
  if (
    !input ||
    input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1 ||
    input.replay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 ||
    !input.expected?.scopeKey ||
    !SHA256.test(input.expected.exportSha256) ||
    input.replay.createdAt !== input.finalManifest?.createdAt ||
    input.replay.job?.scope?.scopeKey !== input.expected.scopeKey
  )
    return blocked('invalid-input', 'Replay identity, clock, scope, or expected SHA is invalid.');
  if (input.replay.job.dialect !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1)
    return blocked(
      'unsupported-writer-dialect',
      'The product replay owner currently admits only the wizard AAMA R12 route.',
    );

  const date = new Date(input.replay.createdAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== input.replay.createdAt)
    return blocked('invalid-input', 'Replay createdAt must be one exact ISO instant.');

  let detail: ReturnType<typeof writeDxfDetailed>;
  try {
    detail = writeDxfDetailed(input.replay.job, { embed: null, now: () => date });
  } catch {
    return blocked('writer-replay-failed', 'The production writer could not replay the typed job.');
  }
  try {
    if (canonical(detail.manifest) !== canonical({ ...input.finalManifest, gate: null }))
      return blocked(
        'base-manifest-mismatch',
        'The final manifest does not equal the fresh product manifest before its gate report.',
      );
  } catch (error) {
    return blocked(
      'invalid-input',
      `The replay manifest contains non-canonical data (${error instanceof Error ? error.message : 'unknown value'}).`,
    );
  }

  let completeText: string;
  try {
    completeText = embedManifest(detail.bareText, input.finalManifest);
  } catch {
    return blocked('writer-output-invalid', 'The final manifest could not be embedded.');
  }
  if (!isAsciiDxf(completeText))
    return blocked('writer-output-invalid', 'Rebuilt product DXF is not exact ASCII.');
  const bytes = textEncoder.encode(completeText);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES)
    return blocked('writer-output-invalid', 'Rebuilt product DXF exceeds the byte bound.');
  const exportSha256 = await sha256(crypto, bytes);
  if (!exportSha256) return blocked('sha256-unavailable', 'SHA-256 is unavailable.');
  if (exportSha256 !== input.expected.exportSha256)
    return blocked(
      'export-sha-mismatch',
      'Fresh complete product bytes do not match expected SHA.',
    );

  return Object.freeze({
    ok: true as const,
    receipt: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_RECEIPT_V1,
      writer: PATTERN_IMPORT_DXF_PRODUCT_WRITER_ID_V1,
      dialect: PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1,
      format: PATTERN_IMPORT_DXF_PRODUCT_WRITER_FORMAT_V1,
      scopeKey: input.expected.scopeKey,
      createdAt: input.replay.createdAt,
      manifestGateEmbedded: input.finalManifest.gate !== null,
      exportSha256,
      byteLength: bytes.byteLength,
      blockCount: detail.plan.blocks.length,
    }),
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CLAIMS_V1,
  });
}
