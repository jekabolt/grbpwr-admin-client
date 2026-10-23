#!/usr/bin/env node
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `auto-fuse-override-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/auto-fuse-override-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const {
  acceptOperationDrops,
  auditOperationPresence,
  autoFuseRefusal,
  fusingOverrideText,
  fusingSaveOverrides,
  mergeOperationsAfterSave,
} = await import(pathToFileURL(outfile).href);

const FUSING = 'TECH_CARD_OPERATION_TYPE_FUSING';
const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';
const pieces = [
  { lineKey: 'CLR_3', fused: true },
  { lineKey: 'CLR_4', fused: true },
  { lineKey: 'SLV_1', fused: false },
];
const operations = [
  { operationType: FUSING, operationNumber: 10, inputKeys: ['CLR_3'], draft: true },
  { operationType: FUSING, operationNumber: 20, inputKeys: [], draft: false },
  { operationType: MACHINE, operationNumber: 30, inputKeys: [], draft: false },
];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const refused = autoFuseRefusal(operations, pieces, 1, 'CLR_3');
check(refused?.autoStepNumber === 10, 'manual FUSING must refuse a piece owned by auto step 10');
check(
  autoFuseRefusal(operations, pieces, 0, 'CLR_3') === null,
  'the owning auto step must accept its existing piece',
);
check(
  autoFuseRefusal(operations, pieces, 1, 'CLR_4') === null,
  'a fused piece with no auto step must not be guessed',
);
check(
  autoFuseRefusal(operations, pieces, 1, 'SLV_1') === null,
  'a non-fused piece must remain available',
);
check(
  autoFuseRefusal(operations, pieces, 2, 'CLR_3') === null,
  'a non-FUSING target must remain available',
);

const reviewedOwner = [
  { operationType: FUSING, operationNumber: 10, inputKeys: ['CLR_3'], draft: false },
  operations[1],
];
check(
  autoFuseRefusal(reviewedOwner, pieces, 1, 'CLR_3')?.autoStepNumber === 10,
  'a reviewed auto step must still own its fused piece',
);

const sent = [
  { operationType: FUSING, operationNumber: 10, inputKeys: ['CLR_3'], draft: false },
  { operationType: MACHINE, operationNumber: 20, inputKeys: ['CLR_4'], draft: false },
  { operationType: FUSING, operationNumber: 30, inputKeys: ['CLR_3'], draft: true },
];
const read = [
  { operationType: FUSING, operationNumber: 10, inputKeys: [], draft: false },
  { operationType: MACHINE, operationNumber: 20, inputKeys: ['CLR_4'], draft: false },
  { operationType: FUSING, operationNumber: 30, inputKeys: ['CLR_3'], draft: true },
];
const overrides = fusingSaveOverrides(sent, read, [0, 1, -1], pieces);
check(overrides.length === 1, 'save comparison must find one overridden manual FUSING step');
check(
  overrides[0]?.manualStepNumber === 10 && overrides[0]?.autoStepNumbers.join(',') === '30',
  'save comparison must name manual step 10 and auto step 30',
);
check(
  fusingOverrideText(overrides) === 'fuse 10 → auto 30',
  'save warning must use the short fuse-to-auto copy',
);

const removedStep = fusingSaveOverrides(
  [{ operationType: FUSING, operationNumber: 10, inputKeys: ['CLR_3'], draft: false }, sent[2]],
  [read[2]],
  [-1, -1],
  pieces,
);
check(
  removedStep.length === 1 && removedStep[0]?.manualStepNumber === 10,
  'a manual step deleted after losing its only input must be reported',
);
const removedSent = [
  { operationType: FUSING, operationNumber: 10, inputKeys: ['CLR_3'], draft: false },
  sent[2],
];
const removedRead = [read[2]];
const rawAudit = auditOperationPresence(removedSent, removedRead);
const settledAudit = acceptOperationDrops(
  rawAudit,
  removedStep.map((override) => override.manualIndex),
);
const settled = mergeOperationsAfterSave(removedSent, removedRead, settledAudit);
check(
  settled.operations.length === 1 && settled.operations[0] === removedRead[0],
  'the presence safety merge must not restore an intentionally deleted manual step',
);

if (failures.length) {
  failures.forEach((message) => console.error(`FAIL  ${message}`));
  process.exitCode = 1;
} else {
  console.log('10/10 auto fuse override cases passed');
}
