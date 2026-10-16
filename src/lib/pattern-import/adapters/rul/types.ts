// RUL · the grade rule table of an AAMA / ASTM D6673 pattern exchange (base-size DXF + .rul).
// Format notes, sources and what is assumed: tmp/plans/pdf-to-dxf/auto/RUL-SPEC.md.

export type RulUnits = 'metric' | 'english';

export type RulDelta = { dx: number; dy: number };

export type RulTable = {
  /** The first line as written (`ASTM/D13Proposal 1 VERSION: D6673-04`, `AAMA-VERSION: …`). */
  version: string;
  product: string | null;
  author: string | null;
  date: string | null;
  time: string | null;
  units: RulUnits;
  /** Millimetres per RUL unit: METRIC = 1 (mm), ENGLISH = 25.4 (inch). */
  mmPerUnit: number;
  /** `GRADE RULE TABLE:` name. */
  name: string;
  /** Size names in grade order, as written. */
  sizes: string[];
  /** `SAMPLE SIZE:` as written, and its index in `sizes`. */
  sample: string;
  sampleIndex: number;
  /** Size indices that are break sizes (`BREAK:` lines), when the file lists them. */
  breaks: number[];
  /**
   * Rule number → one delta per size (index = `sizes` index), RUL units, MEASURED FROM THE SAMPLE
   * SIZE: the sample's own delta is (0, 0). The parser normalises the file to this form.
   */
  rules: Map<number, RulDelta[]>;
  /** Things the parser accepted but the operator should know (non-zero sample rows, …). */
  warnings: string[];
};
