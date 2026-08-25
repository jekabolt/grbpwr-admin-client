import { sha256Hex } from './analysis-identity';

// THE OPERATION FINGERPRINT — the TypeScript half of ONE serialization shared with the server
// (design §9; Go side: `internal/techcardanalysis/fingerprint.go`).
//
// WHY A FINGERPRINT EXISTS AT ALL. A finding is anchored by `operation_number`, and the server
// re-stamps those numbers POSITIONALLY on every save. While somebody reads a run, another save can
// move #460 onto a different step — the anchor would still navigate, just to the wrong place. The
// fingerprint closes exactly that hole and nothing else: «is #460 still the step the run read» stops
// being a guess and becomes a comparison of eight hex characters.
//
//     fp(op) = hex(sha256(payload))[0:8]
//     payload = "tcfp1" 0x00 output_unit_key 0x00 k_1 0x00 k_2 … 0x00 k_n   (UTF-8 bytes)
//
// `k_i` is the RAW key of the i-th input in display order — a piece's `line_key` (a 26-character
// ULID) or an earlier step's `unit_key`, byte for byte.
//
// WHAT IS NOT HERE AND CANNOT BE: sorting, trimming, case folding, a per-kind prefix. Input ORDER
// is a fact of the step (swapping two inputs makes a different step); a space inside a key is part
// of the key; case distinguishes units («Base» and «base» are two different units). A kind prefix
// is unnecessary because a unit key can never equal a piece line_key in a saved card.
//
// ANY «NORMALISATION» ADDED HERE OUT OF TIDINESS DIVERGES FROM THE SERVER SILENTLY, and the visible
// result is false amber — «this operation changed since the run» on every step of every card. The
// nine canonical vectors of `fingerprint_test.go` are re-checked against THIS module by
// `scripts/construction-audit-probe.mjs`; they are a contract, never a snapshot of output, and a
// disagreement means the port is wrong rather than that the numbers are stale.
//
// SHA-256 COMES FROM `analysis-identity`, NOT FROM `crypto.subtle`. `crypto.subtle` is undefined
// outside a secure context, so on a plain-http stand every fingerprint would be empty — and empty
// compares equal to empty, which is a silent all-clear in the one place built to detect change. It
// is also async, and an anchor's colour must be decided in the render that draws it.

/** The version tag of the payload. It changes only together with the payload's SHAPE — and then
 *  every stored fingerprint stops matching DELIBERATELY, rather than by oversight. */
export const FP_PREFIX = 'tcfp1';

/** The field separator: NUL. Unit keys are free text a technologist types, and NUL is the one byte
 *  that never occurs in it; any printable separator («|», ":") would let two different key pairs
 *  produce one payload. Written as an escape — a raw NUL byte in a source file makes grep call the
 *  file binary and quietly return nothing. */
const SEP = '\u0000';

/** Eight hex characters, as the server slices it. */
const FP_LEN = 8;

/**
 * The fp8 of ONE step, from its output unit key and its raw input keys IN DISPLAY ORDER.
 *
 * An empty output (a processing step, which assembles nothing) serializes as an EMPTY STRING, not
 * as a skipped field: dropping it would make a processing step over `[x]` and an assembling step
 * `x → ""` hash the same material.
 */
export function operationFingerprint(outputUnitKey: string, inputKeys: string[]): string {
  return sha256Hex([FP_PREFIX, outputUnitKey, ...inputKeys].join(SEP)).slice(0, FP_LEN);
}

/** The shape this module needs off a form operation — the two fields §9 names, and the number the
 *  map is keyed by. Deliberately structural rather than `TechCardFormData['operations'][number]`:
 *  the form row carries sixty other fields, none of which this hashing may ever start depending on. */
export type FingerprintableOperation = {
  operationNumber?: number;
  outputUnitKey?: string;
  inputKeys?: string[];
};

/**
 * `operation_number → fp8` for the operations of the FORM, mirroring the server's `Fingerprints`.
 *
 * KEYED BY STRING, because that is the shape the wire map arrives in: protojson renders a
 * `map<int32, string>` with string keys, so `operationFingerprints` on both audit responses is
 * `{ "460": "1bd85c4d" }`. Keying this one by number would mean converting at every comparison
 * site, and one forgotten conversion reads as «no fingerprint» — which degrades to a silent green.
 *
 * A STEP WITHOUT A NUMBER IS SKIPPED, exactly as on the server: it has no anchor anyone could ask
 * about, and the map's key IS the number. In the form that means a row the operator has just added
 * and not yet saved — its number is stamped by the write, and until then no finding can name it.
 */
export function formOperationFingerprints(
  operations: readonly FingerprintableOperation[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of operations ?? []) {
    const n = o?.operationNumber ?? 0;
    if (!Number.isFinite(n) || n <= 0) continue;
    out[String(n)] = operationFingerprint(o.outputUnitKey ?? '', o.inputKeys ?? []);
  }
  return out;
}
