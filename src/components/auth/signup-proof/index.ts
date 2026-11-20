// The sign-up «not a robot» answer (lane X6). The task is fetched when the sign-up screen opens
// and solved off the page; SignUp sends the answer as Grpc-Metadata-X-Signup-Proof. No task
// (an old server, the check off, an error) → no header, and the sign-up goes as before.
import { useEffect, useRef } from 'react';

import { isChallenge, payload, solve, type Challenge } from './solve';

export const PROOF_HEADER = 'Grpc-Metadata-X-Signup-Proof';

/** The server refuses an answer sent sooner than this after the task was issued. */
const MIN_AGE_MS = 2_100;
/** Tasks live 10 minutes on the server; an older one is fetched again. */
const MAX_AGE_MS = 9 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;
/** On the page (no worker): yield to typing every few milliseconds. */
const SLICE_MS = 8;

interface Solved {
  header: string | null;
  fetchedAt: number;
}

async function fetchChallenge(): Promise<Challenge | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const base = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
    const r = await fetch(`${base}/api/auth/signup-challenge`, {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const c: unknown = await r.json();
    return isChallenge(c) ? c : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function solveInWorker(c: Challenge): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./proof.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    w.onmessage = (ev: MessageEvent<{ number: number | null }>) => {
      w.terminate();
      resolve(ev.data.number);
    };
    w.onerror = (e) => {
      w.terminate();
      reject(e);
    };
    w.postMessage({ challenge: c.challenge, maxnumber: c.maxnumber, salt: c.salt });
  });
}

function solveOnPage(c: Challenge): Promise<number | null> {
  let last = performance.now();
  return solve(c, async () => {
    if (performance.now() - last < SLICE_MS) return;
    await new Promise((r) => setTimeout(r, 0));
    last = performance.now();
  });
}

/** Fetch and solve one task. Never throws: any failure is «no answer». */
export async function makeProof(): Promise<Solved> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return { header: null, fetchedAt: 0 };
  const c = await fetchChallenge();
  // Counted from the answer's arrival: the server issued the task before that, never after.
  const fetchedAt = performance.now();
  if (!c) return { header: null, fetchedAt };
  const t0 = performance.now();
  let n: number | null;
  try {
    n = await solveInWorker(c);
  } catch {
    n = await solveOnPage(c).catch(() => null);
  }
  return { header: n === null ? null : payload(c, n, performance.now() - t0), fetchedAt };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One answer per sign-up attempt, solved while the person fills the form. `take()` waits for it
 * (the submit's pending state covers the wait) and keeps the server's minimum age; an answer is
 * good once, so `again()` starts the next one after a failed attempt.
 */
export function useSignupProof(): {
  take: (fresh?: boolean) => Promise<Record<string, string>>;
  again: () => void;
} {
  const next = useRef<Promise<Solved> | null>(null);
  useEffect(() => {
    next.current ??= makeProof();
  }, []);
  const take = async (fresh = false): Promise<Record<string, string>> => {
    let s = await (!fresh && next.current ? next.current : makeProof());
    if (s.header && performance.now() - s.fetchedAt > MAX_AGE_MS) s = await makeProof();
    next.current = null;
    if (!s.header) return {};
    const age = performance.now() - s.fetchedAt;
    if (age < MIN_AGE_MS) await wait(MIN_AGE_MS - age);
    return { [PROOF_HEADER]: s.header };
  };
  const again = () => {
    next.current ??= makeProof();
  };
  return { take, again };
}
