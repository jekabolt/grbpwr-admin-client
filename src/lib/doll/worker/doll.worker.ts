// Worker entry: everything heavy of the 3D view stays here — the seam graph read, the doll solve,
// the POM read for every size and the column's still. The main thread posts card facts and
// receives typed arrays.
//
//   doll  { input }            → mesh (topology, once) · frame (every ~20 passes) · done (report)
//         input without `graph` reads it here (readSeamGraph); `anchors` = the facts of the sizes
//         the stored rows were confirmed on, segmented here for resolveAcrossSizes;
//         `thumb` = also paint the still (OffscreenCanvas 2D) and send it as a PNG blob.
//   pom   { input }            → pom (measurePattern for every size)
import { readSeamGraph, segmentAll } from 'lib/assembly-skeleton/pipeline';
import type { SeamGraph, SkeletonFacts } from 'lib/assembly-skeleton/types';
import { measurePattern, type PomInput, type PomReport } from 'lib/pom';
import { grainDegOf } from 'lib/seams/frame';
import type { SizePieces } from 'lib/seams/transfer';
import type { StoredSeam } from 'lib/seams/types';

import { solveDoll } from '../doll';
import { paintDollThumb } from '../thumb';
import type { DollInput, DollMesh, DollReport } from '../types';

type DollWorkerOptions = Omit<NonNullable<DollInput['options']>, 'onFrame' | 'onMesh' | 'seams'>;

export type DollWorkerRequest =
  | {
      id: number;
      kind?: 'doll';
      input: {
        graph?: SeamGraph;
        facts: SkeletonFacts;
        options?: DollWorkerOptions & {
          seams?: { rows: readonly StoredSeam[]; size: string; sizes?: readonly SizePieces[] };
        };
        /** Facts of the sizes the stored rows were confirmed on (other than the solved one). */
        anchors?: { size: string; facts: SkeletonFacts }[];
      };
      /** Paint the column's still, w × h px. */
      thumb?: { w: number; h: number };
    }
  | {
      id: number;
      kind: 'pom';
      input: PomInput & { anchors?: { size: string; facts: SkeletonFacts }[] };
    };

export type DollWorkerResponse =
  | { id: number; type: 'mesh'; mesh: DollMesh }
  | { id: number; type: 'frame'; positions: Float32Array; pass: number }
  | { id: number; type: 'done'; report: DollReport; thumb: Blob | null; graphMs: number }
  | { id: number; type: 'pom'; report: PomReport; ms: number }
  | { id: number; type: 'error'; message: string };

const post = (msg: DollWorkerResponse, transfer: Transferable[] = []) =>
  (
    self as unknown as { postMessage: (m: DollWorkerResponse, t: Transferable[]) => void }
  ).postMessage(msg, transfer);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const anchorPieces = (anchors: { size: string; facts: SkeletonFacts }[] | undefined) =>
  (anchors ?? []).map(
    (a): SizePieces => ({
      size: a.size,
      pieces: segmentAll(a.facts),
      grainDeg: grainDegOf(a.facts),
    }),
  );

async function still(report: DollReport, w: number, h: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    paintDollThumb(ctx as unknown as CanvasRenderingContext2D, report, w, h);
    return await canvas.convertToBlob({ type: 'image/png' });
  } catch {
    return null;
  }
}

self.onmessage = async (ev: MessageEvent<DollWorkerRequest>) => {
  const req = ev.data;
  const { id } = req;
  try {
    if (req.kind === 'pom') {
      const t0 = now();
      const { anchors, ...input } = req.input;
      const sized = anchorPieces(anchors);
      const report = measurePattern({
        ...input,
        ...(input.seams
          ? { seams: { ...input.seams, sizes: [...(input.seams.sizes ?? []), ...sized] } }
          : {}),
      });
      post({ id, type: 'pom', report, ms: now() - t0 });
      return;
    }
    const { input } = req;
    const t0 = now();
    const graph = input.graph ?? readSeamGraph(input.facts);
    const graphMs = now() - t0;
    const seams = input.options?.seams;
    const report = solveDoll({
      graph,
      facts: input.facts,
      options: {
        ...input.options,
        ...(seams
          ? {
              seams: {
                ...seams,
                sizes: [...(seams.sizes ?? []), ...anchorPieces(input.anchors)],
              },
            }
          : {}),
        onMesh: (mesh) => post({ id, type: 'mesh', mesh }),
        onFrame: (positions, pass) =>
          post({ id, type: 'frame', positions, pass }, [positions.buffer]),
      },
    });
    const thumb = req.thumb ? await still(report, req.thumb.w, req.thumb.h) : null;
    post({ id, type: 'done', report, thumb, graphMs });
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
