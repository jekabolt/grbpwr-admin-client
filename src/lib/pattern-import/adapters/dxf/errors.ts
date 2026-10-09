// Typed refusals of the DXF adapter. The wizard shows `message`; code paths branch on `kind`,
// never on the wording (the wording gets rewritten, the kind does not).

export type DxfImportErrorKind =
  /** Zero bytes, or only whitespace / comments. */
  | 'empty'
  /** `AutoCAD Binary DXF` sentinel — refused (no binary sample exists to validate a reader). */
  | 'binary-dxf'
  /** DWG magic (`AC10xx` at offset 0) — not a DXF at all. */
  | 'dwg'
  /** Bytes that are not a group-code/value pair stream (a PDF, a ZIP, a text file). */
  | 'not-dxf'
  /** A DXF that starts right but breaks: odd pair count, a non-numeric code, a non-numeric
   * coordinate, an unterminated section/block/polyline. Carries the 1-based line. */
  | 'corrupt';

export class DxfImportError extends Error {
  readonly kind: DxfImportErrorKind;
  /** 1-based line of the offending group code, when known. */
  readonly line: number | null;
  constructor(kind: DxfImportErrorKind, message: string, line: number | null = null) {
    super(line != null ? `${message} (line ${line})` : message);
    this.name = 'DxfImportError';
    this.kind = kind;
    this.line = line;
  }
}

export function isDxfImportError(e: unknown): e is DxfImportError {
  return e instanceof DxfImportError;
}
