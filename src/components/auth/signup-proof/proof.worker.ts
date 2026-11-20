// Solves one sign-up task off the page (see solve.ts).
import { solve } from './solve';

self.onmessage = async (
  ev: MessageEvent<{ challenge: string; maxnumber: number; salt: string }>,
) => {
  try {
    self.postMessage({ number: await solve(ev.data) });
  } catch {
    self.postMessage({ number: null });
  }
};
