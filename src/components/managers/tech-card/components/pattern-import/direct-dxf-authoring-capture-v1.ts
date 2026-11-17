import { sha256Hex } from 'lib/features/sha256';
import type { PatternImportOpenFile, StageIO, StageName } from 'lib/pattern-import/types';

/** The same content identity is used on first open and cancelled-worker reconstruction. */
export async function directDxfAuthoringOpenFileV1(
  file: Pick<File, 'name' | 'arrayBuffer'>,
  index: number,
  generatedFusing = false,
): Promise<PatternImportOpenFile> {
  const bytes = await file.arrayBuffer();
  const sha = /\.dxf$/i.test(file.name) ? await sha256Hex(bytes) : '';
  let dxfPathProvenance: PatternImportOpenFile['dxfPathProvenance'];
  if (sha) {
    const digest = Array.from(sha.match(/../g) ?? [], (octet) => parseInt(octet, 16));
    // Curve IDs hex-encode this ID and append the block/insert and entity identities.
    const contentId = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    dxfPathProvenance = { sourceFileId: `dxf:${contentId}:${index.toString(36)}` };
  }
  return {
    name: file.name,
    bytes,
    ...(generatedFusing ? { generatedFusing: true } : {}),
    ...(dxfPathProvenance ? { dxfPathProvenance } : {}),
  };
}

type Run = <S extends StageName>(stage: S, input: StageIO[S]['in']) => Promise<StageIO[S]['out']>;
/** Runs against the final semantics in the original worker; no derived or inferred sewing view. */
export async function captureDirectDxfAuthoringV1(files: readonly { name: string }[], run: Run) {
  if (
    files.filter((file) => /\.dxf$/i.test(file.name)).length !== 1 ||
    files.some((file) => !/\.(dxf|rul)$/i.test(file.name))
  )
    return {};
  const dxfProvenance = await run('dxf-provenance', {
    schemaVersion: 'dxf-pipeline-provenance-request/1',
  });
  const dxfPhaseDReplay = await run('dxf-phase-d-replay', {
    schemaVersion: 'dxf-product-phase-d-replay-request/1',
  });
  const dxfNativeSewingReplay = await run('dxf-native-sewing-replay', {
    schemaVersion: 'dxf-native-sewing-replay-request/1',
  });
  return { dxfProvenance, dxfPhaseDReplay, dxfNativeSewingReplay };
}
