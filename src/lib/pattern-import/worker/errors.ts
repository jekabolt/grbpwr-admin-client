// Typed failures of the import worker (worker graph). Every error crosses the boundary as
// `{type:'error', code, message}`; the message is written for the operator, the code is what the
// wizard branches on (types.ts `ImportErrorCode`).
import type { ImportErrorCode, StageName } from '../types';
import { isUnsupportedFormat } from '../adapters/sniff';
import { isDxfImportError } from '../adapters/dxf';

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly stage?: StageName;
  constructor(code: ImportErrorCode, message: string, stage?: StageName) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.stage = stage;
  }
}

/** Which lane owns a stage that has not landed, and what it does — said to the operator as is. */
const PENDING: Partial<Record<StageName, string>> = {
  chains: 'line tracing and the size legend (F3)',
  sizes: 'reading the size run and mapping it to the card (F3 / F5)',
  pieces: 'finding pieces from seeds (F4)',
  semantics: 'piece details — cut/seam, fold, pairs, grainline (F5)',
  fabrics: 'fabric proposal per piece (F7)',
};

/** The honest placeholder: a stage whose module is still being built. Never fake data. */
export function stageUnavailable(stage: StageName): ImportError {
  return new ImportError(
    'stage-unavailable',
    `${PENDING[stage] ?? stage} — the import stops here for now`,
    stage,
  );
}

export const cancelled = (stage?: StageName) =>
  new ImportError('cancelled', 'stopped by the operator', stage);

/** Any thrown value → what the wire carries. Adapter errors keep their operator wording. */
export function toWireError(
  e: unknown,
  stage?: StageName,
): { code: ImportErrorCode; message: string } {
  if (e instanceof ImportError) return { code: e.code, message: e.message };
  if (isUnsupportedFormat(e)) return { code: 'unsupported-format', message: e.message };
  if (isDxfImportError(e))
    return {
      code:
        e.kind === 'binary-dxf' || e.kind === 'dwg' || e.kind === 'not-dxf'
          ? 'unsupported-format'
          : 'corrupt',
      message: e.message,
    };
  // adapters cannot import ImportError (worker graph): a size guard there names its error
  // (adapters/budget.ts: InputTooLarge, CorruptInput)
  if (e instanceof Error && e.name === 'InputTooLarge')
    return { code: 'too-large', message: e.message };
  if (e instanceof Error && e.name === 'CorruptInput')
    return { code: 'corrupt', message: e.message };
  if (e instanceof RangeError && /memory|allocation|Array buffer/i.test(e.message))
    return {
      code: 'crashed',
      message: `the browser ran out of memory${stage ? ` in ${stage}` : ''}: ${e.message}`,
    };
  const message = e instanceof Error ? e.message : String(e);
  if (/password|encrypt/i.test(message) && /pdf/i.test(message))
    return { code: 'unsupported-format', message: `the PDF is password-protected: ${message}` };
  if (/Invalid PDF|InvalidPDFException|Missing PDF/i.test(message))
    return { code: 'corrupt', message: `the PDF cannot be read: ${message}` };
  return { code: 'internal', message };
}
