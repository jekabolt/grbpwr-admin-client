// Seeded genetic search over (instance order, rotation per instance) — SVGnest-shaped:
// OX crossover, adjacent-swap/rotation-reroll mutation, rank selection, elitism 1.
// The PRIMARY stop is maxGenerations, so identical input reproduces the identical marker
// on any machine that gets there; the wall-clock budget is the secondary stop for
// machines that don't (determinism is then deliberately traded for responsiveness).
import type { RotationDeg } from '../types';
import type { NfpCache } from './nfp';
import { placeOrder, type Gene, type PlacementResult } from './place';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

type Individual = { order: number[]; rots: RotationDeg[]; fitness: number };

export type GaProgress = {
  generation: number;
  best: PlacementResult;
  evaluated: number;
};

export type GaOptions = {
  // Seed order (descending area); each gene carries its own allowed rotation set (the
  // rotations in which the piece fits the fabric width).
  genesBase: Gene[];
  fabricWidthCm: number;
  edgeMarginCm: number;
  lMaxCm: number;
  nfps: NfpCache;
  // Absolute epoch-ms deadline (the NFP prepass has already eaten into the budget).
  deadlineMs: number;
  maxGenerations: number;
  seed: number;
  isCancelled: () => boolean;
  onGeneration: (p: GaProgress) => void;
};

const POP = 10;
const MUTATION_P = 0.1;

// Fitness cost of ONE unplaced instance, DERIVED from the strip bound rather than asserted.
//
// Load-bearing, not cosmetic. Fitness is «how long is the marker», and the moment the placer
// became able to answer «не влезло» (Ф0), a run that DROPS a piece scores SHORTER than one
// that seats it — so plain length would have made the search actively seek out orders that
// lose pieces, and the winner would look like the best marker on the screen.
//
// lMax is every piece laid end to end, i.e. the longest marker this job can physically
// produce, so one unplaced instance costs more than any complete layout ever can and seating
// more instances always wins. A hard-coded constant would have been a claim about the input
// («no marker is ever this long») that nothing checks.
function fitnessOf(res: PlacementResult, lMaxCm: number): number {
  return res.usedLengthCm + res.unplaced.length * (lMaxCm + 1);
}

function evaluate(ind: Individual, opts: GaOptions, abort?: () => boolean): PlacementResult | null {
  // rots are indexed by GENE, not by slot — they survive order crossover intact and can
  // never assign a piece a rotation outside its own allowed set.
  const genes = ind.order.map((gi) => ({ ...opts.genesBase[gi], rot: ind.rots[gi] }));
  const res = placeOrder(genes, opts.fabricWidthCm, opts.edgeMarginCm, opts.lMaxCm, opts.nfps, abort);
  if (res) ind.fitness = fitnessOf(res, opts.lMaxCm);
  return res;
}

function orderCrossover(a: number[], b: number[], rnd: () => number): number[] {
  const n = a.length;
  if (n < 2) return [...a];
  let i = Math.floor(rnd() * n);
  let j = Math.floor(rnd() * n);
  if (i > j) [i, j] = [j, i];
  const slice = a.slice(i, j + 1);
  const inSlice = new Set(slice);
  const rest = b.filter((g) => !inSlice.has(g));
  return [...rest.slice(0, i), ...slice, ...rest.slice(i)];
}

function mutate(ind: Individual, genesBase: readonly Gene[], rnd: () => number): void {
  for (let k = 0; k < ind.order.length; k++) {
    if (rnd() < MUTATION_P && k + 1 < ind.order.length) {
      [ind.order[k], ind.order[k + 1]] = [ind.order[k + 1], ind.order[k]];
    }
    const gi = ind.order[k];
    const allowed = genesBase[gi].allowedRots;
    if (rnd() < MUTATION_P) {
      ind.rots[gi] = allowed[Math.floor(rnd() * allowed.length)];
    }
  }
}

// Rank-weighted pick: weight ∝ (POP − rank).
function pick(sorted: Individual[], rnd: () => number, skip?: Individual): Individual {
  const total = (sorted.length * (sorted.length + 1)) / 2;
  for (;;) {
    let r = rnd() * total;
    for (let i = 0; i < sorted.length; i++) {
      r -= sorted.length - i;
      if (r <= 0) {
        const cand = sorted[i];
        if (cand !== skip || sorted.length < 2) return cand;
        break;
      }
    }
  }
}

export async function runGa(
  opts: GaOptions,
): Promise<{ best: PlacementResult | null; generation: number; evaluated: number }> {
  const n = opts.genesBase.length;
  const rnd = mulberry32(opts.seed);
  const deadline = opts.deadlineMs;

  const seedInd: Individual = {
    order: opts.genesBase.map((_, i) => i),
    rots: opts.genesBase.map((g) => g.allowedRots[0]),
    fitness: Infinity,
  };
  const pop: Individual[] = [seedInd];
  for (let i = 1; i < POP; i++) {
    const ind: Individual = { order: [...seedInd.order], rots: [...seedInd.rots], fitness: Infinity };
    mutate(ind, opts.genesBase, rnd);
    pop.push(ind);
  }

  let best: PlacementResult | null = null;
  let bestFitness = Infinity;
  let generation = 0;
  let evaluated = 0;

  const abort = () => opts.isCancelled() || Date.now() > deadline;

  // Yield TIME-BASED, not per individual: chained setTimeout(0) hits the browser's 4 ms
  // nested-timer clamp, and POP×maxGenerations awaits would burn tens of seconds of the
  // budget on pure timers (measured 1.15 ms/await in node, ≥4 ms in a worker). ~16 ms
  // cadence keeps cancel/progress responsive at ~1/250 of that cost.
  let lastYield = Date.now();
  const evalPop = async (): Promise<boolean> => {
    for (const ind of pop) {
      if (abort()) return false;
      // abort is also polled INSIDE placement — an individual interrupted mid-placement
      // comes back null and is discarded rather than scored short.
      const res = evaluate(ind, opts, abort);
      if (!res) return false;
      evaluated++;
      if (ind.fitness < bestFitness) {
        bestFitness = ind.fitness;
        best = res;
      }
      if (Date.now() - lastYield >= 16) {
        // Drain the message queue so cancel can land mid-generation.
        await new Promise((r) => setTimeout(r, 0));
        lastYield = Date.now();
      }
    }
    return true;
  };

  for (;;) {
    const completed = await evalPop();
    if (best) opts.onGeneration({ generation, best, evaluated });
    if (!completed || generation + 1 >= opts.maxGenerations || abort()) break;

    pop.sort((a, b) => a.fitness - b.fitness);
    const next: Individual[] = [{ order: [...pop[0].order], rots: [...pop[0].rots], fitness: Infinity }];
    while (next.length < POP) {
      const pa = pick(pop, rnd);
      const pb = pick(pop, rnd, pa);
      const child: Individual = {
        order: orderCrossover(pa.order, pb.order, rnd),
        rots: [...pa.rots],
        fitness: Infinity,
      };
      mutate(child, opts.genesBase, rnd);
      next.push(child);
    }
    pop.splice(0, pop.length, ...next);
    generation++;
  }

  if (!best) {
    // Budget was too small to finish even one individual. The seed is evaluated once more
    // WITHOUT the clock so a run that merely ran out of time still returns a layout — small
    // jobs make this cheap, and «пусто» would be the wrong answer for a slow machine.
    //
    // CANCELLATION is honoured here even so (Ф0): this was the tail that turned «стоп» into
    // a 30-second wait on the 45-piece file — the deadline had passed, every individual came
    // back null, and this line then re-ran the whole placement with the lazy NFP misses that
    // made it slow in the first place. Cancel now means cancel; the caller reports an empty
    // result as cancelled rather than as a marker.
    //
    // The queue is drained FIRST, and that is not decoration: in the worker `cancel` is a
    // MESSAGE, so a stop posted while the GA was grinding has not been delivered yet, and
    // polling the flag without yielding reads the value from before the operator pressed it.
    // One await is the difference between honouring that stop and re-running the slowest
    // placement in the job to answer it.
    await new Promise((r) => setTimeout(r, 0));
    best = evaluate(seedInd, opts, () => opts.isCancelled());
    evaluated++;
  }
  return { best, generation, evaluated };
}
