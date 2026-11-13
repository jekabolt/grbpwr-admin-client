// Heavy yes/no checks taken off the render path: each runs once per input, a few milliseconds'
// worth per browser task, so the dialog stays responsive while they finish in the background.

import { useEffect, useRef, useState } from 'react';

export type DeferredCheck = {
  key: string;
  /** Everything the answer depends on: the check runs again only when this changes. */
  input: string;
  /** True when the check fails. A throw counts as a failure. */
  run: () => boolean;
};

const SLICE_MS = 30;

export function useDeferredChecks(
  checks: readonly DeferredCheck[],
  ready: boolean,
): { failed: boolean; pending: boolean } {
  const answers = useRef(new Map<string, { input: string; failed: boolean }>());
  const latest = useRef(checks);
  latest.current = checks;
  const [, setDone] = useState(0);
  const answerOf = (check: DeferredCheck) => {
    const answer = answers.current.get(check.key);
    return answer?.input === check.input ? answer : undefined;
  };
  const pending = checks.some((check) => !answerOf(check));
  const failed = checks.some((check) => answerOf(check)?.failed);
  useEffect(() => {
    if (!ready || !pending) return;
    const timer = setTimeout(() => {
      const started = performance.now();
      for (const check of latest.current) {
        if (answerOf(check)) continue;
        let bad: boolean;
        try {
          bad = check.run();
        } catch {
          bad = true;
        }
        answers.current.set(check.key, { input: check.input, failed: bad });
        if (performance.now() - started > SLICE_MS) break;
      }
      setDone((n) => n + 1);
    }, 0);
    return () => clearTimeout(timer);
  });
  return { failed, pending };
}
