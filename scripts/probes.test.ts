import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const probeListPath = process.env.PROBES_LIST
  ? resolve(repositoryRoot, process.env.PROBES_LIST)
  : resolve(repositoryRoot, 'scripts/probes.assert.txt');
const probeList = readFileSync(probeListPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

type ProbeResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

function runProbe(relativePath: string): Promise<ProbeResult> {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [resolve(repositoryRoot, relativePath)], {
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
    }, 120_000);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      complete({ code, signal, stderr, stdout, timedOut });
    });
  });
}

describe.concurrent('asserting probes', () => {
  for (const probe of probeList) {
    it(
      probe,
      async () => {
        const result = await runProbe(probe);
        const output = [
          `${probe} ${result.timedOut ? 'timed out after 120s' : `exited ${result.code}`}`,
          result.signal ? `signal: ${result.signal}` : '',
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        expect(result.timedOut, output).toBe(false);
        expect(result.code, output).toBe(0);
      },
      125_000,
    );
  }
});
