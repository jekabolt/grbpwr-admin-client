// Where a stopped import is reported. The wizard hook is bundled by the importer's node probes,
// so it must not import the error reporter itself: the wizard component plugs it in.

export type ImportRefusal = {
  stage: string | null;
  code: string | null;
  message: string;
  files: string[];
};

let sink: ((r: ImportRefusal) => void) | null = null;

export function setRefusalSink(fn: (r: ImportRefusal) => void) {
  sink = fn;
}

export function reportRefusal(r: ImportRefusal) {
  try {
    sink?.(r);
  } catch {
    /* reporting must never break the import */
  }
}
