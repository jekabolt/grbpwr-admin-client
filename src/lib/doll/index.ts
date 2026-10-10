// lib/doll — the paper doll (level 0). Worker-safe: no DOM. The main thread imports only ./types
// and talks to worker/client.ts; node probes import this file directly.
export { solveDoll } from './doll';
export { liftMeasureLine, liftPoint } from './lift';
export type * from './types';
