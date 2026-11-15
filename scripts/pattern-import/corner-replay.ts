// CORNER REPLAY — the dev loop for sizes/corners.ts (the corners analogue of gfit-replay.ts).
// A dxf-shot run with CORNER_PROBES=1 writes every closeCorners call of the final pass as a replayable
// case (<shot>/<file>/corner-probes.json: the exact input + the output of that run). This replays the
// CURRENT corners code on them in seconds and diffs the LINKS (which pair of ends, vertex, gap, arms,
// wide) before vs after, not only the counts.
//   npx vite-node scripts/pattern-import/corner-replay.ts <shotDir> [--only <text>] [--changed]
//     [--verify] [--env KEY=VAL ...] [--near x,y,r] [--chain id] [--last] [--ref <replay.json>]
//     [--out <replay.json>]
// before = the recorded output; with --ref = a previous replay (--out of an earlier run), so two code
// states can be compared without the probes of the first. --env sets env switches for the replay only
// (e.g. --env MOOD_WIDE_OFF=1: the bisect of a wide extend). --near x,y,r / --chain id: print only the
// links with a vertex within r mm of (x, y) / ending on that chain. --verify: replay with no change and
// report calls that do NOT give the recorded output (run it on the code the probes were captured with:
// it must say 0; anything else means the probe is not bit-exact or the code moved).
// Limits: the replay is the corner step ALONE. It cannot tell what the fill does with a closed corner
// (a wrong corner can merge two pieces), and a change upstream (chains, ranks, own / cand, marks) needs
// fresh probes (a new dxf-shot).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CornerOut, CornerProbe } from 'lib/pattern-import/sizes/corners';
import {
  diffCounts,
  diffLinks,
  linksOf,
  outKey,
  replayCornerProbe,
  type LinkView,
} from 'lib/pattern-import/sizes/corner-probe';

type Saved = { card: string[]; calls: CornerProbe[] };
type RefCall = { file: string; call: number; out: Omit<CornerOut, 'walls'>; links: LinkView[] };

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opts = (n: string) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const opt = (n: string) => opts(n)[0];
const VALUE_OPTS = ['--only', '--env', '--near', '--chain', '--ref', '--out'];
const shot = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTS.includes(args[i - 1]));
if (!shot) {
  console.error(
    'usage: corner-replay.ts <shotDir> [--only t] [--changed] [--verify] [--env K=V] [--near x,y,r] [--chain id] [--last] [--ref f] [--out f]',
  );
  process.exit(2);
}
const near = opt('--near')?.split(',').map(Number);
const chainId = opt('--chain') !== undefined ? Number(opt('--chain')) : null;
const ref: RefCall[] | null = opt('--ref')
  ? JSON.parse(readFileSync(resolve(opt('--ref')!), 'utf8'))
  : null;

const show = (l: LinkView) =>
  `${l.rule} ${l.ends.join('+')} r${l.rank ?? '?'} gap ${l.gapMm.toFixed(1)} arms ${l.armA.toFixed(1)}/${l.armB.toFixed(1)}${l.wide ? ' WIDE' : ''}${l.via ? ` via ${l.via.x.toFixed(1)},${l.via.y.toFixed(1)}` : ''}`;
const wanted = (l: LinkView) =>
  (!near || (l.via && Math.hypot(l.via.x - near[0], l.via.y - near[1]) <= near[2])) &&
  (chainId === null || l.ends.some((e) => Number(e.split(':')[0]) === chainId));

// env for the replay only
const saved: Record<string, string | undefined> = {};
for (const kv of opts('--env')) {
  const [k, ...v] = kv.split('=');
  saved[k] = process.env[k];
  process.env[k] = v.join('=') || '1';
}

const out: RefCall[] = [];
let calls = 0;
let identical = 0;
let moved = 0;
const t0 = Date.now();
for (const name of readdirSync(shot).sort()) {
  const f = resolve(shot, name, 'corner-probes.json');
  if (!existsSync(f) || (opt('--only') && !name.includes(opt('--only')!))) continue;
  const { calls: cs } = JSON.parse(readFileSync(f, 'utf8')) as Saved;
  const list = flag('--last') ? cs.slice(-1) : cs;
  const base = flag('--last') ? cs.length - 1 : 0;
  list.forEach((p, i) => {
    calls++;
    const call = base + i;
    const after = replayCornerProbe(p);
    const afterLinks = linksOf(p.rankOf, after);
    const r = ref?.find((x) => x.file === name && x.call === call);
    const beforeLinks = r ? r.links : linksOf(p.rankOf, p.out);
    const beforeOut = r ? ({ ...r.out, walls: [] } as CornerOut) : p.out;
    const same = r
      ? JSON.stringify({ ...r.out }) === JSON.stringify((({ walls: _w, ...o }) => o)(after))
      : outKey(after) === outKey(p.out);
    if (same) identical++;
    out.push({ file: name, call, out: (({ walls: _w, ...o }) => o)(after), links: afterLinks });
    if (flag('--verify')) {
      if (!same)
        console.log(
          `DIFFERS ${name} call ${call}: ${diffCounts(beforeOut, after).join('; ') || 'walls differ'}`,
        );
      return;
    }
    const d = diffLinks(beforeLinks, afterLinks);
    const counts = diffCounts(beforeOut, after);
    const shown = {
      added: d.added.filter(wanted),
      removed: d.removed.filter(wanted),
      moved: d.moved.filter((m) => wanted(m.after)),
    };
    const changed = counts.length || d.added.length || d.removed.length || d.moved.length;
    if (changed) moved++;
    if (flag('--changed') && !changed) return;
    const envNote = Object.keys(p.env).length ? ` recorded env ${JSON.stringify(p.env)}` : '';
    console.log(
      `${changed ? '*' : ' '} ${name} call ${call}: ${d.same} links same, +${d.added.length} −${d.removed.length} ~${d.moved.length}${counts.length ? ` · ${counts.join('; ')}` : ''}${envNote}`,
    );
    for (const l of shown.added) console.log(`    + ${show(l)}`);
    for (const l of shown.removed) console.log(`    − ${show(l)}`);
    for (const m of shown.moved) console.log(`    ~ ${show(m.before)}  →  ${show(m.after)}`);
  });
}
for (const [k, v] of Object.entries(saved)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
console.log(
  `\n${calls} calls in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${flag('--verify') ? `${identical} replay identically, ${calls - identical} do not` : `${moved} changed${ref ? ' vs --ref' : ' vs the recorded run'}`}`,
);
const o = opt('--out');
if (o) writeFileSync(resolve(o), JSON.stringify(out));
