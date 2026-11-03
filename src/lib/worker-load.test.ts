import { describe, expect, it } from 'vitest';
import { classifyWorkerError, retryWorkerLoad, WorkerLoadError } from './worker-load';

// What Chrome hands `onerror`, measured on a built worker: a file that did not load (and a module with
// a syntax error) gives a plain Event with no message, a throw inside gives an ErrorEvent with one.
const wordless = () => ({ type: 'error' }) as Event;
const thrown = (message: string) => ({ type: 'error', message }) as unknown as Event;

describe('classifyWorkerError', () => {
  it('a wordless failure before the script ran is a load failure: one retry, then load', () => {
    expect(classifyWorkerError(wordless(), false, false)).toBe('retry');
    expect(classifyWorkerError(wordless(), false, true)).toBe('load');
  });

  it('a real throw is a crash, retried or not', () => {
    expect(classifyWorkerError(thrown('boom'), false, false)).toBe('crash');
    expect(classifyWorkerError(thrown('boom'), false, true)).toBe('crash');
    expect(classifyWorkerError(thrown('boom'), true, false)).toBe('crash');
  });

  it('a wordless failure after the script ran is a crash, not an old version', () => {
    expect(classifyWorkerError(wordless(), true, false)).toBe('crash');
    expect(classifyWorkerError(wordless(), true, true)).toBe('crash');
  });
});

describe('retryWorkerLoad', () => {
  const queryWith = (error: unknown) => ({ state: { error } });

  it('a query that failed on a worker load goes again; every other failure stays', () => {
    expect(retryWorkerLoad(queryWith(new WorkerLoadError()))).toBe(true);
    expect(retryWorkerLoad(queryWith(new Error('no DXF downloaded')))).toBe(false);
    expect(retryWorkerLoad(queryWith(null))).toBe(false);
  });
});
