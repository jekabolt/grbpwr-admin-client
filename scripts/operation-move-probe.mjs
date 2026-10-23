#!/usr/bin/env node
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `operation-move-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/operation-move-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const { operationMoveMembership } = await import(pathToFileURL(outfile).href);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const inputs = ['CLR_3', 'CLR_4'];
const operation = { inputKeys: inputs, outputUnitKey: '', assemblyBlockDetached: false };
const detached = operationMoveMembership(operation, true);
check(detached.accepted && detached.assemblyBlockDetached === true, 'divider drop must detach');
check(operation.inputKeys === inputs, 'divider drop decision must not replace inputs');
check(inputs.join(',') === 'CLR_3,CLR_4', 'divider drop decision must not mutate inputs');

const joined = operationMoveMembership({ outputUnitKey: ' COLLAR ' }, true);
check(!joined.accepted && joined.outputUnitKey === 'COLLAR', 'producing join must stay attached');

const attached = operationMoveMembership({ assemblyBlockDetached: true }, false);
check(attached.accepted && attached.assemblyBlockDetached === false, 'row drop must clear detach');

if (failures.length) {
  failures.forEach((message) => console.error(`FAIL  ${message}`));
  process.exitCode = 1;
} else {
  console.log('3/3 operation move cases passed');
}
