// The pattern pieces the assembly drawings are made of: the card's DXF, read the same way the
// editor reads it (patterns -> scoped sheets -> nesting/dxf-geometry -> block refs -> findPiece),
// then segmented by the assembly engine so the stored seams resolve on today's edges.
//
// Segmenting and classifying the internal paths is deliberately done in a worker. Card 61 spends
// hundreds of milliseconds there (and much longer under load); doing it in this hook used to make
// the already-hidden construction tab stop the whole card after the DXF worker had answered.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { common_TechCard } from 'api/proto-http/admin';
import { depStatus, type PrintDep } from 'components/managers/print/use-print-ready';
import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import {
  filesSignature,
  findPiece,
  useDxfGeometry,
  useDxfIndex,
  type FoundPiece,
} from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { patternSheetName } from 'components/managers/tech-card/components/nesting/sheet-name';
import {
  pieceBlockRefs,
  pieceRefKey,
  rollGoodsScopes,
} from 'components/managers/tech-card/components/piece-block-refs';
import { isDxfUrl } from 'utils/pattern';

import {
  assemblyCardInput,
  type AssemblyCardInput,
  type BuiltAssemblyPieces,
} from './assembly-geometry-build';
import type {
  AssemblyGeometryWorkerRequest,
  AssemblyGeometryWorkerResponse,
} from './assembly-geometry.worker';
import type { TechpackPieceGeometry } from './derive-pieces';

export { buildAssemblyPieces } from './assembly-geometry-build';

const EMPTY_BUILT: BuiltAssemblyPieces = { pieces: new Map(), grainDeg: new Map() };

function buildInWorker(
  input: AssemblyCardInput,
  found: Map<string, FoundPiece>,
  grainLayer: string,
  signal: AbortSignal,
): Promise<BuiltAssemblyPieces> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('assembly geometry cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./assembly-geometry.worker.ts', import.meta.url), {
      type: 'module',
    });
    const finish = () => {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException('assembly geometry cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<AssemblyGeometryWorkerResponse>) => {
      const message = event.data;
      finish();
      if ('error' in message) reject(new Error(message.error));
      else resolve(message.result);
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'assembly geometry worker failed'));
    };
    worker.postMessage({ id: 1, input, found, grainLayer } satisfies AssemblyGeometryWorkerRequest);
  });
}

function inputSignature(
  filesSig: string,
  input: AssemblyCardInput,
  refs: ReadonlyMap<string, readonly { scopeKey: string; block: string }[]>,
  found: ReadonlyMap<string, FoundPiece>,
  grainLayer: string,
): string {
  return JSON.stringify([
    filesSig,
    grainLayer,
    (input.pieces ?? []).map((piece) => [
      piece.lineKey,
      piece.name,
      piece.piecesPerGarment,
      piece.cutSymmetry,
      piece.materials?.[0]?.bomLineKey,
    ]),
    (input.bomItems ?? []).map((item) => [item.lineKey, item.purpose]),
    [...refs].map(([key, pieceRefs]) => [key, pieceRefs.map((ref) => [ref.scopeKey, ref.block])]),
    [...found].map(([key, hit]) => [
      key,
      hit.piece.id,
      hit.block,
      hit.size,
      hit.layers?.map((piece) => piece.id),
    ]),
  ]);
}

export type AssemblyGeometry = {
  pieces: BuiltAssemblyPieces['pieces'];
  grainDeg: BuiltAssemblyPieces['grainDeg'];
  /** Each card piece's DXF block, for the cut-pieces sheet (null while the DXF is unread). */
  shapes: TechpackPieceGeometry;
  dep: PrintDep;
};

/** The card's DXF pieces for the assembly drawings; `dep` feeds the print-ready gate. */
export function useAssemblyGeometry(techCard: common_TechCard, enabled = true): AssemblyGeometry {
  const ins = techCard.techCard;
  const scopes = useMemo(() => rollGoodsScopes((ins?.bomItems ?? []) as never), [ins?.bomItems]);
  const files = useMemo(() => {
    const sheets = bindingScopes(scopes, ins?.patterns ?? []);
    return (ins?.patterns ?? [])
      .filter((pattern) => pattern.url && isDxfUrl(pattern.url))
      .map((pattern) => ({
        scopeKey: scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, sheets),
        name: patternSheetName(pattern),
        url: pattern.url ?? '',
      }));
  }, [ins?.patterns, scopes]);
  const refs = useMemo(
    () => pieceBlockRefs((ins?.pieceDxfAliases?.items ?? []) as never, scopes),
    [ins?.pieceDxfAliases, scopes],
  );
  const geometry = useDxfGeometry(files, enabled);
  // A passive hidden reader may receive another tab's cached parse. Indexing is cheap after the
  // shared cache, but assembly segmentation is not, so the hidden construction tab stops here.
  const index = useDxfIndex(enabled ? geometry.data : undefined);
  const matched = useMemo(() => {
    const found = new Map<string, FoundPiece>();
    const shapeByKey = index ? new Map<string, FoundPiece | null>() : null;
    for (const piece of ins?.pieces ?? []) {
      const key = piece.lineKey ?? '';
      const hit = key ? findPiece(index, refs.get(pieceRefKey(key)) ?? []) : null;
      if (hit) found.set(key, hit);
      if (key) shapeByKey?.set(pieceRefKey(key), hit);
    }
    return { found, shapes: { shapeByKey, grainLayer: index?.grainLayer ?? '' } };
  }, [ins?.pieces, index, refs]);
  const input = useMemo(() => assemblyCardInput(techCard), [ins?.pieces, ins?.bomItems]);
  const signature = useMemo(
    () =>
      inputSignature(filesSignature(files), input, refs, matched.found, index?.grainLayer ?? ''),
    [files, input, refs, matched.found, index?.grainLayer],
  );
  const built = useQuery<BuiltAssemblyPieces, Error>({
    queryKey: ['techpack-assembly-geometry', signature],
    queryFn: ({ signal }) => buildInWorker(input, matched.found, index?.grainLayer ?? '', signal),
    enabled: enabled && files.length > 0 && !!index,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });

  const parseStatus = files.length ? depStatus(geometry.isLoading, geometry.isError) : 'ok';
  const buildStatus =
    files.length === 0 ? 'ok' : index ? depStatus(built.isLoading, built.isError) : 'pending';
  const status = parseStatus === 'ok' ? buildStatus : parseStatus;
  return {
    ...(built.data ?? EMPTY_BUILT),
    shapes: matched.shapes,
    dep: {
      label: 'pattern geometry',
      status,
    },
  };
}
