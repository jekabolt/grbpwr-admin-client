import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Optional test evidence only. No output is produced unless the caller selects a directory. */
export function writeObservedPlacementEvidenceV1(
  fileName: string,
  serializedEvidence: string,
): void {
  const directory = process.env.CLOTH_OBSERVED_EVIDENCE_DIR;
  if (!directory) return;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(fileName))
    throw new TypeError('Observed placement evidence requires a plain JSON filename.');
  const destination = resolve(directory);
  mkdirSync(destination, { recursive: true });
  writeFileSync(resolve(destination, fileName), serializedEvidence, 'utf8');
}
