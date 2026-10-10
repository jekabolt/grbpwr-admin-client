// Worker entry: one solve per request; frames posted every ~20 passes so the UI can animate the
// doll closing. Everything heavy stays here; the main thread receives typed arrays.
import { solveDoll } from '../doll';
import type { DollInput, DollReport } from '../types';

export type DollWorkerRequest = {
  id: number;
  input: Omit<DollInput, 'options'> & {
    options?: Omit<NonNullable<DollInput['options']>, 'onFrame'>;
  };
};
export type DollWorkerResponse =
  | { id: number; type: 'frame'; positions: Float32Array; pass: number }
  | { id: number; type: 'done'; report: DollReport }
  | { id: number; type: 'error'; message: string };

const post = (msg: DollWorkerResponse, transfer: Transferable[] = []) =>
  (
    self as unknown as { postMessage: (m: DollWorkerResponse, t: Transferable[]) => void }
  ).postMessage(msg, transfer);

self.onmessage = (ev: MessageEvent<DollWorkerRequest>) => {
  const { id, input } = ev.data;
  try {
    const report = solveDoll({
      ...input,
      options: {
        ...input.options,
        onFrame: (positions, pass) =>
          post({ id, type: 'frame', positions, pass }, [positions.buffer]),
      },
    });
    post({ id, type: 'done', report });
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
