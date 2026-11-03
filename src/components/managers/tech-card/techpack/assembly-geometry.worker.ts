import { announceWorkerReady } from 'lib/worker-load';
import {
  buildAssemblyPiecesFromInput,
  type AssemblyCardInput,
  type BuiltAssemblyPieces,
} from './assembly-geometry-build';
import type { FoundPiece } from '../components/nesting/dxf-geometry';

export type AssemblyGeometryWorkerRequest = {
  id: number;
  input: AssemblyCardInput;
  found: Map<string, FoundPiece>;
  grainLayer: string;
};

export type AssemblyGeometryWorkerResponse =
  | { id: number; result: BuiltAssemblyPieces }
  | { id: number; error: string };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<AssemblyGeometryWorkerRequest>) => void) | null;
  postMessage: (message: AssemblyGeometryWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  try {
    workerScope.postMessage({
      id: request.id,
      result: buildAssemblyPiecesFromInput(request.input, request.found, request.grainLayer),
    } satisfies AssemblyGeometryWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies AssemblyGeometryWorkerResponse);
  }
};

announceWorkerReady();
