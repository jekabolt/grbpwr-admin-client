// THE PAPER DOLL OF THE OPEN CARD — one store for the column's still and the fullscreen view
// (01-DESIGN-L0 §6). A solve is keyed by what it was built from (the provider's facts read, the
// size, the stored rows, lining), so the column's base-size doll is the overlay's first frame and a
// decision in SEAMS (a re-read: new facts, new rows) is a new key, i.e. a new doll.
//
// Frames stream into `live` and are read IMPERATIVELY by the canvas (subscribe): the closing doll
// redraws at the worker's pace without re-rendering React on every frame.

import type { DollMesh, DollReport } from 'lib/doll/types';
import { DollWorkerClient, type DollSolved } from 'lib/doll/worker/client';
import type { PomReport } from 'lib/pom/types';
import { create } from 'zustand';

export type DollSolve = {
  key: string;
  size: string;
  lining: boolean;
  status: 'solving' | 'done' | 'error';
  report?: DollReport;
  /** The column's still (object URL of the worker's PNG). */
  thumbUrl?: string;
  error?: string;
  /** ms from the request to the first frame on screen data (mesh + first positions). */
  firstFrameMs?: number;
  /** ms from the request to the report. */
  doneMs?: number;
  graphMs?: number;
};

export type PomRead = {
  key: string;
  status: 'reading' | 'done' | 'error';
  report?: PomReport;
  error?: string;
  ms?: number;
};

/** The frames of the solve on screen: topology once, positions every ~20 passes. */
export type LiveFrames = {
  key: string;
  mesh: DollMesh | null;
  positions: Float32Array | null;
  pass: number;
};

type DollState = {
  solves: Record<string, DollSolve>;
  poms: Record<string, PomRead>;
  live: LiveFrames | null;
  /** The POM row under the pointer (rail ↔ canvas), by code. */
  hoverPom: string | null;
  /** The fullscreen view is open (the map's 3D chip opens it). */
  open: boolean;
};

export const useDollStore = create<DollState>(() => ({
  solves: {},
  poms: {},
  live: null,
  hoverPom: null,
  open: false,
}));

export const openDoll = () => useDollStore.setState({ open: true });
export const closeDoll = () => useDollStore.setState({ open: false, hoverPom: null });

let dollClient: DollWorkerClient | null = null;
let pomClient: DollWorkerClient | null = null;
let solvingKey: string | null = null;
const KEEP = 8;

/** The column's still: 240 × 300 shown, painted at 2×. */
export const THUMB = { w: 480, h: 600 } as const;

const ms = () => performance.now();

/** Forget the oldest solves beyond KEEP (their stills' object URLs are revoked). */
function trim(solves: Record<string, DollSolve>): Record<string, DollSolve> {
  const keys = Object.keys(solves);
  if (keys.length <= KEEP) return solves;
  const out = { ...solves };
  for (const k of keys.slice(0, keys.length - KEEP)) {
    if (out[k].thumbUrl) URL.revokeObjectURL(out[k].thumbUrl!);
    delete out[k];
  }
  return out;
}

export type DollRequest = Parameters<DollWorkerClient['solve']>[0];

/**
 * Solve the doll for `key` unless it is solved or solving. Another key in flight is cancelled
 * (the worker is restarted): the person asked for a different size, the old one is not wanted.
 */
export function requestDoll(
  key: string,
  meta: { size: string; lining: boolean },
  input: DollRequest,
  thumb?: { w: number; h: number },
): void {
  const s = useDollStore.getState();
  const have = s.solves[key];
  if (have && have.status !== 'error') return;
  if (solvingKey && solvingKey !== key) {
    dollClient?.terminate();
    const solves = { ...useDollStore.getState().solves };
    delete solves[solvingKey];
    useDollStore.setState({ solves });
  }
  dollClient ??= new DollWorkerClient();
  solvingKey = key;
  const t0 = ms();
  let first = false;
  useDollStore.setState((st) => ({
    solves: trim({ ...st.solves, [key]: { key, ...meta, status: 'solving' } }),
    live: { key, mesh: null, positions: null, pass: 0 },
  }));
  const mark = () => {
    if (first) return;
    first = true;
    const at = ms() - t0;
    useDollStore.setState((st) =>
      st.solves[key]
        ? { solves: { ...st.solves, [key]: { ...st.solves[key], firstFrameMs: at } } }
        : {},
    );
  };
  dollClient
    .solve(
      input,
      {
        onMesh: (mesh) =>
          useDollStore.setState((st) =>
            st.live?.key === key ? { live: { ...st.live, mesh } } : {},
          ),
        onFrame: (positions, pass) => {
          useDollStore.setState((st) =>
            st.live?.key === key ? { live: { ...st.live, positions, pass } } : {},
          );
          mark();
        },
      },
      thumb,
    )
    .then((r: DollSolved) => {
      if (solvingKey === key) solvingKey = null;
      mark();
      const thumbUrl = r.thumb ? URL.createObjectURL(r.thumb) : undefined;
      useDollStore.setState((st) => ({
        solves: {
          ...st.solves,
          [key]: {
            ...(st.solves[key] ?? { key, ...meta }),
            status: 'done',
            report: r.report,
            thumbUrl,
            doneMs: ms() - t0,
            graphMs: r.graphMs,
          },
        },
        // The canvas draws a finished solve from its report; frames are for the closing only.
        live: st.live?.key === key ? null : st.live,
      }));
    })
    .catch((e: Error) => {
      if (solvingKey === key) solvingKey = null;
      if (e.message === 'cancelled') return;
      useDollStore.setState((st) => ({
        solves: {
          ...st.solves,
          [key]: { ...(st.solves[key] ?? { key, ...meta }), status: 'error', error: e.message },
        },
      }));
    });
}

/** A solve is in flight (any size): the column does not start its own over it. */
export const isSolving = () => solvingKey !== null;

export type PomRequest = Parameters<DollWorkerClient['measure']>[0];

/** Read the POM values of every size for `key` unless read or reading. */
export function requestPoms(key: string, input: PomRequest): void {
  const have = useDollStore.getState().poms[key];
  if (have && have.status !== 'error') return;
  pomClient ??= new DollWorkerClient();
  const t0 = ms();
  useDollStore.setState((st) => {
    // The last few reads only: a card read is a new key, and each holds every size's POMs.
    const poms = { ...st.poms, [key]: { key, status: 'reading' as const } };
    const keys = Object.keys(poms);
    for (const k of keys.slice(0, Math.max(0, keys.length - 3))) delete poms[k];
    return { poms };
  });
  pomClient
    .measure(input)
    .then((report) =>
      useDollStore.setState((st) =>
        st.poms[key]
          ? { poms: { ...st.poms, [key]: { key, status: 'done', report, ms: ms() - t0 } } }
          : {},
      ),
    )
    .catch((e: Error) => {
      if (e.message === 'cancelled') return;
      useDollStore.setState((st) => ({
        poms: { ...st.poms, [key]: { key, status: 'error', error: e.message } },
      }));
    });
}

export const setHoverPom = (code: string | null) => {
  if (useDollStore.getState().hoverPom !== code) useDollStore.setState({ hoverPom: code });
};

/** The card closed: workers stopped, stills released. */
export function resetDoll(): void {
  dollClient?.terminate();
  pomClient?.terminate();
  dollClient = null;
  pomClient = null;
  solvingKey = null;
  for (const s of Object.values(useDollStore.getState().solves))
    if (s.thumbUrl) URL.revokeObjectURL(s.thumbUrl);
  useDollStore.setState({ solves: {}, poms: {}, live: null, hoverPom: null, open: false });
}
