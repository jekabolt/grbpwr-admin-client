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
  | { phase: 'ready'; pieces: PieceDTO[]; detectedUnit: Exclude<Unit, 'auto'>; warnings: string[] }
  | { phase: 'error'; message: string };

export type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; generation: number; best: NestResult | null; jobId: number }
  | { phase: 'done'; result: NestResult; stopped: boolean };

export function useNesting(files: NestingFile[] | null) {
  const clientRef = useRef<NestingWorkerClient | null>(null);
  const [parse, setParse] = useState<ParseState>({ phase: 'idle' });
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const [unitOverride, setUnitOverride] = useState<Unit>('auto');

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
        const fetched = await Promise.all(
          files.map(async (f) => new File([await fetchMediaBlob(f.url)], f.name)),
        );
        if (dead) return;
        const out = await client().parse(fetched, {
          unit: unitOverride,
          tol: NEST_DEFAULTS.tol,
          tolChain: NEST_DEFAULTS.tolChain,
        });
        if (dead) return;
        setParse({ phase: 'ready', ...out });
      } catch (e) {
        if (!dead) setParse({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      dead = true;
    };
  }, [files, unitOverride, client]);

  // The worker dies with the component — no orphaned GA burning CPU after close.
  useEffect(() => {
    return () => {
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, []);

  const start = useCallback(
    (config: NestConfig) => {
      const { id, done } = client().nest(config, (generation, best) => {
        setRun((prev) =>
          prev.phase === 'running' && prev.jobId === id ? { ...prev, generation, best } : prev,
        );
      });
      setRun({ phase: 'running', generation: 0, best: null, jobId: id });
      done
        .then((result) => {
          setRun((prev) =>
            prev.phase === 'running' && prev.jobId === id
              ? { phase: 'done', result, stopped: false }
              : prev,
          );
        })
        .catch(() => {
          // Terminated (modal closed) or crashed — the error state that matters is parse's.
          setRun((prev) => (prev.phase === 'running' && prev.jobId === id ? { phase: 'idle' } : prev));
        });
    },
    [client],
  );

  const stop = useCallback(() => {
    setRun((prev) => {
      if (prev.phase !== 'running') return prev;
      client().cancel(prev.jobId);
      return prev; // the worker returns best-so-far as the job's result
    });
  }, [client]);

  return { parse, run, start, stop, unitOverride, setUnitOverride };
}
