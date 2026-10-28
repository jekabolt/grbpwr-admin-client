export type AsmContextMode = 'unit' | 'crop';
export type AsmMissingMode = 'red' | 'plain';

export type AsmProtoFlags = {
  context: AsmContextMode;
  seamNumbers: boolean;
  missing: AsmMissingMode;
  key: boolean;
};

const DEFAULTS: AsmProtoFlags = {
  context: 'unit',
  seamNumbers: false,
  missing: 'red',
  key: false,
};

let explicit: AsmProtoFlags | undefined;

/** The owner picked the defaults (28.10, artifact XySZv8FmSCg42oKd35PHFt); the other modes stay for comparison renders. */
export function asmProtoFlags(): AsmProtoFlags {
  return explicit ?? DEFAULTS;
}

/** The card-85 renderer sets prototype variants without needing a browser location. */
export function setAsmProtoFlags(flags?: Partial<AsmProtoFlags>): void {
  explicit = flags ? { ...DEFAULTS, ...flags } : undefined;
}
