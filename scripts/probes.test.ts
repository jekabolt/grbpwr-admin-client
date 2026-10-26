import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { beforeAll, describe, expect, it } from 'vitest';

// Every probe in scripts/probes.assert.txt runs as its own child process and must exit 0.
//
// scripts/probes.known-red.txt is a SHRINK-ONLY ratchet (like the backend's known-red list): a
// listed probe that fails is reported, not fatal; a listed probe that passes prints «можно убрать»;
// any unlisted failure is red. A listed probe must still be in the assert list, so the ratchet can
// never become a place where a probe silently stops running.
//
// The probes run in a pool owned by this file, not by vitest's `describe.concurrent`: browser probes
// are heavy (esbuild + Chromium each), and a vitest-level limit would count the time a probe spends
// queued against its own timeout. PROBE_CONCURRENCY overrides the pool size.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (path: string) => resolve(repositoryRoot, path);

/** First token of every non-comment line; the rest of the line is the human reason. */
function readList(path: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (!existsSync(path)) return entries;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [probe, ...rest] = line.split(/\s+/);
    entries.set(probe, rest.join(' ').replace(/^(—|-|#)\s*/, ''));
  }
  return entries;
}

const assertList = readList(fromRoot('scripts/probes.assert.txt'));
const knownRed = readList(fromRoot('scripts/probes.known-red.txt'));
const loose = readList(fromRoot('scripts/probes.loose.txt'));
// PROBES_LIST narrows a local run to another list file; the gate itself always runs the assert list.
const probes = [
  ...(process.env.PROBES_LIST ? readList(fromRoot(process.env.PROBES_LIST)) : assertList).keys(),
];

// A hang guard, not a speed budget: the slowest probe (operation-work-apply, 99 page loads) takes
// ~2 min on a laptop core, and a CI core is slower.
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS) || 300_000;
const CONCURRENCY = Math.max(
  1,
  Number(process.env.PROBE_CONCURRENCY) || Math.min(4, availableParallelism()),
);

type ProbeResult = {
  code: number | null;
  ms: number;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

function runProbe(relativePath: string): Promise<ProbeResult> {
  return new Promise((complete, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [fromRoot(relativePath)], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    let timedOut = false;

    child.stderr.setEncoding('utf8');
    child.stdout.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, PROBE_TIMEOUT_MS);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      complete({ code, ms: Date.now() - started, signal, stderr, stdout, timedOut });
    });
  });
}

const results = new Map<string, ProbeResult>();

// Probes print «skipped» / «пропущена» / «скип» and exit 0 when a half had nothing to look at.
const SKIP_LINE = /(?<![\p{L}\p{N}_])(skipped|пропущен\p{L}*|скип)(?![\p{L}\p{N}_])/iu;
// A check label may contain the word («… is skipped, the next one moves»); a check result is no skip.
const CHECK_RESULT = /^(ok|pass|fail|✓|✔|✗)\b/i;
const skipLines = (result: ProbeResult) =>
  result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => SKIP_LINE.test(line) && !CHECK_RESULT.test(line));

async function runAll() {
  const queue = [...probes];
  const worker = async () => {
    for (let probe = queue.shift(); probe; probe = queue.shift()) {
      const result = await runProbe(probe);
      results.set(probe, result);
      const ok = !result.timedOut && result.code === 0;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${probe} ${(result.ms / 1000).toFixed(1)}s` +
          (knownRed.has(probe) ? ' (known-red)' : ''),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, probes.length) }, worker));
}

function report(probe: string, result: ProbeResult) {
  return [
    `${probe} ${result.timedOut ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s` : `exited ${result.code}`}`,
    result.signal ? `signal: ${result.signal}` : '',
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

describe('probe lists', () => {
  it('every listed probe exists, and the known-red ratchet only names probes that still run', () => {
    const missing = [...assertList.keys(), ...knownRed.keys()].filter(
      (p) => !existsSync(fromRoot(p)),
    );
    expect(missing, 'listed probes that do not exist').toEqual([]);
    const notRunning = [...knownRed.keys()].filter((p) => !assertList.has(p));
    expect(notRunning, 'known-red probes that are not in probes.assert.txt').toEqual([]);
    const both = [...assertList.keys()].filter((p) => loose.has(p));
    expect(both, 'probes listed as both asserting and loose').toEqual([]);
    const reasonless = [...knownRed].filter(([, reason]) => !reason).map(([p]) => p);
    expect(reasonless, 'known-red probes without a reason').toEqual([]);
  });

  it('playwright chromium is installed', () => {
    // Browser probes exit 0 («playwright не найден — проба пропущена») when there is no browser, so
    // without this check a runner that lost Chromium would turn the whole DOM half silently green.
    const executable = chromium.executablePath();
    expect(
      existsSync(executable),
      `no chromium at ${executable}: yarn playwright install chromium`,
    ).toBe(true);
  });
});

describe('asserting probes', () => {
  beforeAll(async () => {
    console.log(
      `${probes.length} probes, ${CONCURRENCY} at a time, ${PROBE_TIMEOUT_MS / 1000}s each`,
    );
    await runAll();
  }, 60 * 60_000);

  for (const probe of probes) {
    it(probe, () => {
      const result = results.get(probe);
      expect(result, `${probe} did not run`).toBeDefined();
      if (!result) return;
      const green = !result.timedOut && result.code === 0;
      if (knownRed.has(probe)) {
        const skipped = skipLines(result);
        if (!green) console.log(`known-red, still red: ${probe} — ${knownRed.get(probe)}`);
        else if (skipped.length)
          console.log(`known-red, green only because it skipped: ${probe}: ${skipped.join(' | ')}`);
        else console.log(`можно убрать из known-red: ${probe}`);
        return;
      }
      const output = report(probe, result);
      expect(result.timedOut, output).toBe(false);
      expect(result.code, output).toBe(0);
      // A green probe that skipped a half (no dist css, no sibling repo) must say so in the log.
      for (const line of skipLines(result))
        console.log(`skipped inside a green probe: ${probe}: ${line}`);
    });
  }
});
