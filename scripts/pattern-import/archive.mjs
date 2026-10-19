#!/usr/bin/env node
// PATTERN-IMPORT · ARCHIVE RUNNER — the autopilot (0 clicks, no AI) over the owner's PDF archive:
// bundles archive-entry.ts once (React aliased to the one-component shim, so the REAL wizard hook
// runs), then every file in its own node process (ARCHIVE_PAR at a time, ARCHIVE_CAP_S each),
// appending one JSON line per file to <out>/results.jsonl. Resumable: a file already in the JSONL is
// skipped. The archive is read in place and never written.
//   node scripts/pattern-import/archive.mjs [cat/file.pdf …]     run (default: the whole archive)
//   node scripts/pattern-import/archive.mjs --summary            <out>/summary.md + summary.json
//   node scripts/pattern-import/archive.mjs --png [N]            re-run N representative failures
//                                                                with a sheet PNG into <out>/png/
//   yarn patimport:archive
//   env PATIMPORT_ARCHIVE_DIR (the archive), PATIMPORT_ARCHIVE_FILTER (glob on "cat/file.pdf"),
//   ARCHIVE_OUT (default /private/tmp/patimport-runs/archive; must stay under it),
//   ARCHIVE_PAR (3), ARCHIVE_CAP_S (600), ARCHIVE_PAGE_PASS=0 (no page-role pass, see the entry),
//   ARCHIVE_CARD=sheet (a card of the sheet's own printed sizes, see the entry) or =read with
//   ARCHIVE_CARD_READ=<results.jsonl> (a card of the sizes that run read), ARCHIVE_MOOD_ONLY=1,
//   ARCHIVE_WEAK=1 (record each aside set aside on a guess and which proof failed),
//   ARCHIVE_PNG_DIR=<dir> (a sheet PNG of every file run)
import { build as esbuild } from 'esbuild';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ROOT = '/private/tmp/patimport-runs/archive';
const OUT = resolve(process.env.ARCHIVE_OUT ?? ROOT);
// a run's own dir: archive/…, or a sibling archive<tag>/… (archive2 = the re-run on a later beta)
if (!/^\/private\/tmp\/patimport-runs\/archive[\w-]*(\/|$)/.test(OUT)) {
  console.error(`ARCHIVE_OUT must be under ${ROOT} or a sibling ${ROOT}<tag>`);
  process.exit(2);
}
const DIR = process.env.PATIMPORT_ARCHIVE_DIR ?? '/Users/jekabolt/Downloads/archive 600 pcs';
const JSONL = resolve(OUT, 'results.jsonl');

if (process.env.AR_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.AR_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

mkdirSync(OUT, { recursive: true });
const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const readResults = () =>
  existsSync(JSONL)
    ? readFileSync(JSONL, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

// ── the archive's files ──────────────────────────────────────────────────────────────────────
const globRe = (g) =>
  new RegExp(
    `^${g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/\u0000/g, '.*')}$`,
    'i',
  );
function listArchive() {
  const out = [];
  for (const cat of readdirSync(DIR).sort()) {
    const p = resolve(DIR, cat);
    if (!statSync(p).isDirectory()) continue;
    for (const f of readdirSync(p).sort()) if (/\.pdf$/i.test(f)) out.push(`${cat}/${f}`);
  }
  const g = process.env.PATIMPORT_ARCHIVE_FILTER;
  const picked = g ? out.filter((x) => globRe(g).test(x)) : out;
  // ARCHIVE_MOOD_ONLY=1: the Mood Fabrics files only (the matching-card variant)
  return process.env.ARCHIVE_MOOD_ONLY === '1'
    ? picked.filter((x) => /^(mdf|moodfabrics)/i.test(x.split('/').pop()))
    : picked;
}

// ── the summary ──────────────────────────────────────────────────────────────────────────────
const norm = (s) =>
  String(s ?? '')
    .replace(/«[^»]*»/g, '«…»')
    .replace(/[\w.-]+\.pdf/gi, 'FILE')
    .replace(/\(seed \d+\)/g, '(seed N)')
    .replace(/\b[A-Z]{1,3}\d{1,3}\b/g, 'ID')
    .replace(/\d+(\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .slice(0, 130);
// "N regions do not close … — A - FRONT: leak; seed 3: refused (…)" → one key per kind mix
const regionsKey = (reason) => {
  const [head, tail = ''] = String(reason).split(' — ');
  const kinds = [...new Set([...tail.matchAll(/:\s*(leak|refused|tiny|open)/g)].map((m) => m[1]))]
    .sort()
    .join('+');
  return `${norm(head).replace(/N regions? (do|does) not close or (have|has)/, 'N region(s) do not close or have')} — ${kinds || '?'}`;
};
const stopKey = (r) =>
  r.verdict === 'apply'
    ? 'apply'
    : r.verdict === 'timeout' || r.verdict === 'crashed'
      ? r.verdict
      : /regions? (do|does) not close/.test(r.stop?.reason ?? '')
        ? `${r.stop?.step}: ${regionsKey(r.stop.reason)}`
        : `${r.stop?.step}: ${norm(r.stop?.reason)
            .replace(/N piece-sized outlines? set aside/, 'N piece-sized outline(s) set aside')
            .replace(/N pages? (is|are) missing/, 'N page(s) missing')}`;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');

// the generation as archive-entry's moodGen gives it (recomputed: older lines may predate a fix)
function genOf(r) {
  if (!r.mood) return null;
  if (r.printedKey == null) {
    if (r.pages == null) return r.gen ?? '?';
    const n = /^(?:moodfabrics\.com-)?mdf0*(\d+)/i.exec(r.file);
    return (n ? +n[1] < 300 : /^moodfabrics\.com-/i.test(r.file)) ? 'G0' : 'no-key';
  }
  const labs = r.printedKey;
  if (!labs.length) return 'other-key';
  const pairs = labs.filter((l) => /^\d+\s*[-/]\s*\d+$/.test(l)).length;
  const nums = labs.filter((l) => /^\d+$/.test(l)).length;
  const lets = labs.length - pairs - nums;
  if (pairs && !nums && !lets) return 'G2p';
  if (nums && lets) return 'mixed';
  return nums ? 'G1' : lets ? 'G2' : 'other-key';
}

function summarize() {
  const rs = readResults();
  for (const r of rs) if (r.mood) r.gen = genOf(r);
  const V = ['apply', 'stopped', 'refused', 'crashed', 'timeout'];
  const tally = (xs) => {
    const t = Object.fromEntries(V.map((v) => [v, 0]));
    for (const r of xs) t[r.verdict] = (t[r.verdict] ?? 0) + 1;
    t.n = xs.length;
    t.strictApply = xs.filter((r) => r.strictVerdict === 'apply').length;
    t.wrote = xs.filter((r) => r.write).length;
    t.gatePassed = xs.filter((r) => r.write?.passed).length;
    t.judged = xs.filter((r) => r.judge && !r.judge.error).length;
    t.wrongPassing = xs.reduce((a, r) => a + (r.wrongPassing ?? 0), 0);
    t.wrongApplied = xs.reduce((a, r) => a + (r.wrongApplied ?? 0), 0);
    t.filesWrongPassing = xs.filter((r) => (r.wrongPassing ?? 0) > 0).length;
    t.assumptions = xs.reduce((a, r) => a + (r.assumptions?.total ?? 0), 0);
    t.strong = xs.reduce((a, r) => a + (r.assumptions?.strong ?? 0), 0);
    const ms = xs.map((r) => r.ms ?? (r.wallS ?? 0) * 1000).sort((a, b) => a - b);
    t.medianS = ms.length ? Math.round(ms[ms.length >> 1] / 1000) : 0;
    t.stepStops = {};
    for (const r of xs)
      if (r.verdict === 'stopped') t.stepStops[r.stop?.step] = (t.stepStops[r.stop?.step] ?? 0) + 1;
    return t;
  };
  const group = (f) => {
    const m = new Map();
    for (const r of rs) {
      const k = f(r);
      if (k == null) continue;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m].sort((a, b) => b[1].length - a[1].length);
  };
  const total = tally(rs);
  const byCat = group((r) => r.cat).map(([k, xs]) => [k, tally(xs)]);
  const byGen = group((r) => (r.mood ? r.gen ?? '?' : 'non-Mood')).map(([k, xs]) => [k, tally(xs)]);
  const reasons = group((r) => (r.verdict === 'apply' ? null : stopKey(r)));
  const strictReasons = group((r) =>
    r.strictVerdict === 'stopped' && r.strictStop ? `files: ${norm(r.strictStop.reason)}` : null,
  );
  const gates = {};
  for (const r of rs) for (const g of r.write?.gateBlocks ?? []) gates[g] = (gates[g] ?? 0) + 1;
  const strongKinds = {};
  const kinds = {};
  for (const r of rs) {
    for (const [k, v] of Object.entries(r.assumptions?.strongByKind ?? {}))
      strongKinds[k] = (strongKinds[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.assumptions?.byKind ?? {}))
      kinds[k] = (kinds[k] ?? 0) + v;
  }
  // pieces and sizes against what the document says
  const piecesRows = rs
    .filter((r) => r.pieces)
    .map((r) => {
      const exp = r.pieces.expectedPassport || r.pieces.expectedLetters || null;
      return { r, exp, got: r.write?.piecesWritten ?? null, named: r.pieces.named };
    });
  const withExp = piecesRows.filter((x) => x.exp && x.got != null);
  // found = families (seeded regions) on the sheet, closed = every size closes
  const foundRows = piecesRows.filter((x) => x.exp && x.r.pieces.families);
  const found = {
    files: foundRows.length,
    expected: foundRows.reduce((a, x) => a + x.exp, 0),
    families: foundRows.reduce((a, x) => a + x.r.pieces.families, 0),
    closed: foundRows.reduce((a, x) => a + (x.r.pieces.familiesClosed ?? 0), 0),
    leak: foundRows.reduce((a, x) => a + (x.r.pieces.familiesLeak ?? 0), 0),
    refused: foundRows.reduce((a, x) => a + (x.r.pieces.familiesRefused ?? 0), 0),
    fewerFamilies: foundRows.filter((x) => x.r.pieces.families < x.exp).length,
    moreFamilies: foundRows.filter((x) => x.r.pieces.families > x.exp).length,
  };
  const keyRows = rs.filter((r) => r.keyMatch);
  const keyFull = keyRows.filter((r) => r.keyMatch.found === r.keyMatch.printed);
  const rightBlocked = {};
  for (const r of rs)
    for (const [k, v] of Object.entries(r.judge?.rightBlockedBy ?? {}))
      rightBlocked[k] = (rightBlocked[k] ?? 0) + v;
  const sum = {
    files: rs.length,
    total,
    byCat,
    byGen,
    topStops: reasons.map(([k, xs]) => ({ reason: k, n: xs.length, example: xs[0].id })),
    strictStops: strictReasons.map(([k, xs]) => ({ reason: k, n: xs.length, example: xs[0].id })),
    gates,
    assumptionsByKind: kinds,
    strongByKind: strongKinds,
    found,
    pieces: {
      withExpectation: withExp.length,
      exact: withExp.filter((x) => x.got === x.exp).length,
      fewer: withExp.filter((x) => x.got < x.exp).length,
      more: withExp.filter((x) => x.got > x.exp).length,
    },
    keys: {
      printed: keyRows.length,
      fullyRead: keyFull.length,
      meanShare: keyRows.length
        ? +(
            keyRows.reduce((a, r) => a + r.keyMatch.found / r.keyMatch.printed, 0) / keyRows.length
          ).toFixed(2)
        : null,
    },
    rightBlockedBy: rightBlocked,
    wrongPassingFiles: rs
      .filter((r) => (r.wrongPassing ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        gen: r.gen,
        verdict: r.verdict,
        n: r.wrongPassing,
        list: r.judge?.wrongList?.slice(0, 3),
      })),
    // a written size whose card token is not the printed size: a paired source size («4/6»,
    // «2-4») on a plain card size («46», «24») — the label check the mood truth does not make
    sizeTokenWrong: rs.flatMap((r) =>
      (r.write?.scopes?.[0]?.sizes ?? [])
        .filter((z) => {
          const [src, tok] = z.split('→');
          return /^\d+\s*[-/–]\s*\d+$/.test(src) && !/[-/–]/.test(tok);
        })
        .map((z) => ({ id: r.id, verdict: r.verdict, size: z })),
    ),
    // the size map as proposed (whether written or not): a paired source size on a plain card size
    pairedOnPlain: rs.filter((r) =>
      (r.sizesRead?.map ?? []).some((m) => {
        const [src, tok] = m.split('→');
        return /^\d+\s*[-/–]\s*\d+$/.test(src) && tok !== '—' && !/[-/–]/.test(tok);
      }),
    ).length,
    // …of them, the matches the automatic map made itself (an answer or an assumption excluded):
    // the silent class of the archive run 13.10 — must be 0
    pairedOnPlainAuto: rs.filter((r) =>
      (r.sizesRead?.auto ?? []).some((m) => {
        const [src, rest] = m.split('→');
        const tok = rest.replace(/@[\d.]+$/, '');
        return /^\d+\s*[-/–]\s*\d+$/.test(src) && !/[-/–]/.test(tok);
      }),
    ).length,
    crashes: rs
      .filter((r) => r.verdict === 'crashed' || r.verdict === 'timeout')
      .map((r) => ({
        id: r.id,
        verdict: r.verdict,
        error: String(r.error ?? r.stderr ?? '').slice(0, 200),
      })),
  };
  writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(sum, null, 1));
  const row = (k, t) =>
    `| ${k} | ${t.n} | ${t.apply} (${pct(t.apply, t.n)}) | ${t.strictApply} | ${t.stopped} | ${t.refused} | ${t.crashed + t.timeout} | ${t.wrote} | ${t.gatePassed} | ${t.wrongPassing}${t.judged ? `/${t.judged}f` : ''} | ${t.strong}/${t.assumptions} | ${t.medianS} | ${Object.entries(
      t.stepStops,
    )
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} ${n}`)
      .join(', ')} |`;
  const head =
    '| group | files | apply | strict apply | stopped | refused | crash/timeout | wrote | gate ok | wrongPassing (judged files) | strong/assumptions | median s | stops by step |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const md = [
    `# ARCHIVE RUN — ${new Date().toISOString().slice(0, 16)} · ${rs.length} files`,
    '',
    head,
    row('**total**', total),
    '',
    '## by category',
    head,
    ...byCat.map(([k, t]) => row(k, t)),
    '',
    '## by Mood generation',
    head,
    ...byGen.map(([k, t]) => row(k, t)),
    '',
    '## stop reasons (after the page-role pass)',
    ...sum.topStops.map((x) => `- ${x.n} × ${x.reason} — e.g. ${x.example}`),
    '',
    '## strict first stops (page-role question, no AI page roles)',
    ...sum.strictStops.slice(0, 15).map((x) => `- ${x.n} × ${x.reason} — e.g. ${x.example}`),
    '',
    `## gate blocks (files): ${JSON.stringify(gates)}`,
    `## strong assumptions by kind: ${JSON.stringify(strongKinds)}`,
    `## assumptions by kind: ${JSON.stringify(kinds)}`,
    `## pieces found on the sheet vs expected (families; closed = every size closes): ${JSON.stringify(found)}`,
    `## pieces written vs expected (passport list or overview letters): ${JSON.stringify(sum.pieces)}`,
    `## printed size key read: ${JSON.stringify(sum.keys)}`,
    `## paired source size mapped onto a plain card size (files): ${sum.pairedOnPlain} (by the automatic map itself: ${sum.pairedOnPlainAuto}) · written: ${sum.sizeTokenWrong.map((x) => `${x.id} ${x.size} (${x.verdict})`).join(', ') || 'none'}`,
    `## pen-verified right blocks held back by: ${JSON.stringify(rightBlocked)}`,
    '',
    '## wrongPassing (Mood truth)',
    ...sum.wrongPassingFiles.map(
      (x) => `- ${x.id} (${x.gen}, ${x.verdict}): ${x.n} — ${(x.list ?? []).join(' | ')}`,
    ),
    '',
    '## crashes / timeouts',
    ...sum.crashes.map((x) => `- ${x.id}: ${x.verdict} ${x.error}`),
  ].join('\n');
  writeFileSync(resolve(OUT, 'summary.md'), md);
  console.log(md);
  console.log(`→ ${resolve(OUT, 'summary.md')}`);
}

if (FLAGS.includes('--summary') && !FLAGS.includes('--png')) {
  summarize();
  process.exit(0);
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────
const bundle = resolve(tmpdir(), `patimport-archive-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'archive-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const PAR = Number(process.env.ARCHIVE_PAR ?? 3);
const CAP = Number(process.env.ARCHIVE_CAP_S ?? 600) * 1000;
const scratch = resolve(OUT, 'scratch');
mkdirSync(scratch, { recursive: true });
const env = {
  ...process.env,
  AR_CHILD: bundle,
  PATIMPORT_REPO: REPO,
  PATIMPORT_ARCHIVE_DIR: DIR,
  // nothing the imported probes write may land in the plans tree
  PATIMPORT_E2E_OUT: scratch,
  E2E_OUT: scratch,
  PATIMPORT_REPORTS: scratch,
};
const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    for (const ch of children) ch.kill('SIGKILL');
    process.exit(130);
  });

const runOne = (rel, extraEnv = {}) =>
  new Promise((done) => {
    const t = Date.now();
    const ch = spawn(
      process.execPath,
      ['--expose-gc', '--max-old-space-size=6144', fileURLToPath(import.meta.url), rel],
      { env: { ...env, ...extraEnv } },
    );
    children.add(ch);
    let out = '';
    let err = '';
    let timedOut = false;
    ch.stdout.on('data', (d) => {
      out += d;
      if (out.length > 64e6) out = out.slice(-32e6);
    });
    ch.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const timer = setTimeout(() => {
      timedOut = true;
      ch.kill('SIGKILL');
    }, CAP);
    ch.on('close', (code, signal) => {
      clearTimeout(timer);
      children.delete(ch);
      const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      // ARCHIVE_ECHO=<regex>: the child's own debug lines matching it, to the runner's stderr
      if (process.env.ARCHIVE_ECHO) {
        const re = new RegExp(process.env.ARCHIVE_ECHO);
        for (const l of out.split('\n')) if (re.test(l)) console.error(l);
      }
      const cat = rel.split('/')[0];
      const file = rel.slice(cat.length + 1);
      const r = line
        ? JSON.parse(line.slice(9))
        : {
            id: rel,
            cat,
            file,
            mood: /^(mdf|moodfabrics)/i.test(file),
            verdict: timedOut ? 'timeout' : 'crashed',
            code,
            signal,
            stderr: err.slice(-800),
          };
      r.wallS = +((Date.now() - t) / 1000).toFixed(1);
      done(r);
    });
  });

if (FLAGS.includes('--png')) {
  // representative failures: the first file of each of the top stop reasons (a sheet was read)
  const n = Number(ARGS[0] ?? 6);
  const rs = readResults();
  const seen = new Set();
  const picks = [];
  for (const r of rs) {
    if (r.verdict === 'apply' || !r.pieces?.families) continue;
    const k = stopKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    picks.push([k, r]);
  }
  const counts = {};
  for (const r of rs) counts[stopKey(r)] = (counts[stopKey(r)] ?? 0) + 1;
  picks.sort((a, b) => counts[b[0]] - counts[a[0]]);
  const dir = resolve(OUT, 'png');
  mkdirSync(dir, { recursive: true });
  for (const [k, r] of picks.slice(0, n)) {
    const png = resolve(dir, `${r.id.replace(/[^\w.-]+/g, '_').slice(0, 80)}.png`);
    const x = await runOne(r.id, { ARCHIVE_PNG: png });
    console.log(
      `${x.png ? '✓' : '✗'} ${png} — ${counts[k]} × ${k}${x.pngError ? ` ${x.pngError}` : ''}`,
    );
  }
  process.exit(0);
}

const all = ARGS.length ? ARGS : listArchive();
const have = new Set(readResults().map((r) => r.id));
const queue = all.filter((x) => !have.has(x));
console.log(
  `archive ${DIR}: ${all.length} file(s), ${all.length - queue.length} already in ${JSONL}, ${queue.length} to run · par ${PAR} · cap ${CAP / 1000}s`,
);
let k = 0;
await Promise.all(
  Array.from({ length: Math.min(PAR, queue.length) }, async () => {
    while (queue.length) {
      const rel = queue.shift();
      // ARCHIVE_PNG_DIR: a sheet PNG of every file run (with ARCHIVE_WEAK: its guessed asides boxed)
      const pd = process.env.ARCHIVE_PNG_DIR;
      if (pd) mkdirSync(pd, { recursive: true });
      const r = await runOne(
        rel,
        pd ? { ARCHIVE_PNG: resolve(pd, `${rel.replace(/[^\w.-]+/g, '_').slice(0, 80)}.png`) } : {},
      );
      appendFileSync(JSONL, `${JSON.stringify(r)}\n`);
      k++;
      const stop = r.stop ? `${r.stop.step}: ${String(r.stop.reason).slice(0, 100)}` : '';
      console.log(
        `[${k}/${all.length - have.size}] ${String(r.verdict).padEnd(8)} ${String(r.wallS).padStart(6)}s ${String(r.gen ?? '-').padEnd(8)} as ${String(r.assumptions?.total ?? '—').padStart(3)}/${String(r.assumptions?.strong ?? '—').padStart(2)}! wp ${r.wrongPassing ?? '-'} ${rel.slice(0, 70)}  ${stop}${r.error ? ` ERROR ${String(r.error).split('\n')[0].slice(0, 120)}` : ''}`,
      );
    }
  }),
);
summarize();
