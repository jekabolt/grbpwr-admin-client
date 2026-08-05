// Worker lifecycle + run state for the раскладка modal. The worker spawns on first parse,
// survives re-runs (pieces stay parsed in it), and dies with the modal.
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NestConfig, NestResult, PieceDTO, Unit } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';

export type NestingFile = { name: string; url: string };

export type ParseState =
  | { phase: 'idle' }
  | { phase: 'loading' } // CDN fetch + worker parse
  | {
      phase: 'ready';
      parseId: number;
      pieces: PieceDTO[];
      detectedUnit: Exclude<Unit, 'auto'>;
      warnings: string[];
    }
  | { phase: 'error'; message: string };

export type RunState =
  | { phase: 'idle' }
  | {
      phase: 'running';
      jobId: number;
      generation: number;
      best: NestResult | null;
      nfp: { done: number; total: number } | null;
      stopping: boolean;
    }
  | { phase: 'done'; result: NestResult; stopped: boolean };

// «стоп» is a soft cancel first (the GA returns best-so-far); if the worker stays silent
// this long, it gets terminated — and since the parsed pieces died with it, parse reruns.
const HARD_STOP_MS = 1500;
// Progress frames closer than this are dropped — every frame re-renders a full SVG.
const PROGRESS_MIN_MS = 250;

export function useNesting(files: NestingFile[] | null) {
  const clientRef = useRef<NestingWorkerClient | null>(null);
  const [parse, setParse] = useState<ParseState>({ phase: 'idle' });
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const [unitOverride, setUnitOverride] = useState<Unit>('auto');
  // Bumped when a hard stop kills the worker (the parse lived in it) — reruns the effect.
  const [parseNonce, setParseNonce] = useState(0);
  const jobRef = useRef<number | null>(null);
  const hardStopTimer = useRef<number | null>(null);
  const lastFrameTs = useRef(0);

  const client = useCallback((): NestingWorkerClient => {
    if (!clientRef.current) clientRef.current = new NestingWorkerClient();
    return clientRef.current;
  }, []);

  // Parse whenever the modal opens with files or the unit override changes. Files are
  // fetched from the CDN (direct → media-proxy) and posted to the worker as File objects.
  useEffect(() => {
    if (!files || files.length === 0) {
      setParse({ phase: 'idle' });
      setRun({ phase: 'idle' });
      return;
    }
    let dead = false;
    setParse({ phase: 'loading' });
    setRun({ phase: 'idle' });
    (async () => {
      try {
        // allSettled: one unreachable CDN object must not discard the files that fetched.
        const settled = await Promise.allSettled(
          files.map(async (f) => new File([await fetchMediaBlob(f.url)], f.name)),
        );
        if (dead) return;
        const fetched: File[] = [];
        const fetchWarnings: string[] = [];
        settled.forEach((s, i) => {
          if (s.status === 'fulfilled') fetched.push(s.value);
          else fetchWarnings.push(`${files[i].name}: не удалось скачать файл`);
        });
        if (fetched.length === 0) {
          setParse({ phase: 'error', message: 'не удалось скачать ни один DXF с CDN' });
          return;
        }
        const out = await client().parse(fetched, {
          unit: unitOverride,
          tol: NEST_DEFAULTS.tol,
          tolChain: NEST_DEFAULTS.tolChain,
        });
        if (dead) return;
        setParse({ phase: 'ready', ...out, warnings: [...fetchWarnings, ...out.warnings] });
      } catch (e) {
        if (!dead) setParse({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      dead = true;
    };
  }, [files, unitOverride, client, parseNonce]);

  // The worker dies with the component — no orphaned GA burning CPU after close.
  useEffect(() => {
    return () => {
      if (hardStopTimer.current != null) window.clearTimeout(hardStopTimer.current);
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, []);

  const start = useCallback(
    (parseId: number, config: NestConfig) => {
      lastFrameTs.current = 0;
      const { id, done } = client().nest(parseId, config, (p) => {
        // Coalesce frames — but never drop the first one or NFP-phase ticks (cheap).
        const now = Date.now();
        if (p.phase === 'ga' && now - lastFrameTs.current < PROGRESS_MIN_MS) return;
        lastFrameTs.current = now;
        setRun((prev) => {
          if (prev.phase !== 'running' || prev.jobId !== id) return prev;
          if (p.phase === 'nfp') {
            return { ...prev, nfp: { done: p.nfpDone ?? 0, total: p.nfpTotal ?? 0 } };
          }
          return { ...prev, nfp: null, generation: p.generation ?? prev.generation, best: p.best ?? prev.best };
        });
      });
      jobRef.current = id;
      setRun({ phase: 'running', jobId: id, generation: 0, best: null, nfp: null, stopping: false });
      done
        .then((result) => {
          if (jobRef.current === id) jobRef.current = null;
          if (hardStopTimer.current != null) {
            window.clearTimeout(hardStopTimer.current);
            hardStopTimer.current = null;
          }
          setRun((prev) =>
            prev.phase === 'running' && prev.jobId === id
              ? { phase: 'done', result, stopped: prev.stopping }
              : prev,
          );
        })
        .catch(() => {
          // Terminated (modal closed / hard stop) or crashed — run state resolves elsewhere.
          if (jobRef.current === id) jobRef.current = null;
          setRun((prev) => (prev.phase === 'running' && prev.jobId === id ? { phase: 'idle' } : prev));
        });
    },
    [client],
  );

  const stop = useCallback(() => {
    const id = jobRef.current;
    if (id == null) return;
    setRun((prev) => (prev.phase === 'running' && prev.jobId === id ? { ...prev, stopping: true } : prev));
    client().cancel(id);
    // Hard fallback: a worker stuck inside uninterruptible geometry gets terminated. The
    // parsed pieces die with it, so the parse effect reruns via the nonce.
    if (hardStopTimer.current != null) window.clearTimeout(hardStopTimer.current);
    hardStopTimer.current = window.setTimeout(() => {
      hardStopTimer.current = null;
      if (jobRef.current !== id) return; // soft cancel delivered in time
      jobRef.current = null;
      client().terminate();
      setRun((prev) => {
        if (prev.phase !== 'running' || prev.jobId !== id) return prev;
        return prev.best ? { phase: 'done', result: prev.best, stopped: true } : { phase: 'idle' };
      });
      setParseNonce((n) => n + 1);
    }, HARD_STOP_MS);
  }, [client]);

  const resetRun = useCallback(() => {
    setRun((prev) => (prev.phase === 'done' ? { phase: 'idle' } : prev));
  }, []);

  return { parse, run, start, stop, resetRun, unitOverride, setUnitOverride };
}
