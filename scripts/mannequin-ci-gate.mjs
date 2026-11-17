import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestCli = resolve(repositoryRoot, 'node_modules/vitest/vitest.mjs');
const playwrightCli = resolve(repositoryRoot, 'node_modules/@playwright/test/cli.js');

// Deliberately allowlisted: every entry exercises a production mannequin module. Research-only
// experiments and legacy V1 document compatibility tests stay out of the required beta gate.
const unitFiles = Object.freeze([
  'src/components/managers/model/components/83-model-form-mannequin-binding-audit-v1.test.tsx',
  'src/components/managers/model/components/measurement-protocol-guide.test.tsx',
  'src/components/managers/model/components/measurements-fields-audit.test.tsx',
  'src/components/managers/model/components/measurements-grouped-table.test.tsx',
  'src/components/managers/model/components/measurements-quiz.test.tsx',
  'src/components/managers/model/components/model-create-pose-handoff-v1.test.ts',
  'src/components/managers/model/components/model-mannequin-pose-document-v2.test.ts',
  'src/components/managers/model/components/model-mannequin-pose-draft-owner-v1.test.ts',
  'src/components/managers/model/components/model-mannequin-pose-session-v1.test.ts',
  'src/components/managers/model/components/model-mannequin-pose-transport-v1.test.ts',
  'src/components/managers/model/components/model-measurement-field-audit.test.ts',
  'src/components/managers/model/components/model-open-reference-direct-joint-ring-v9.test.ts',
  'src/components/managers/model/components/model-open-reference-direct-pose-control-v9.test.ts',
  'src/components/managers/model/components/model-open-reference-direct-pose-edit-toggle.test.tsx',
  'src/components/managers/model/components/model-open-reference-direct-pose-v9.test.ts',
  'src/components/managers/model/components/model-open-reference-measurement-application-v1.test.ts',
  'src/components/managers/model/components/model-open-reference-measurement-status-contract-v1.test.ts',
  'src/components/managers/model/components/model-open-reference-preview-input-v1.test.ts',
  'src/components/managers/model/components/model-open-reference-preview.test.tsx',
  'src/components/managers/model/components/use-model-mannequin-pose-transport-v1.test.ts',
  'src/components/managers/models/components/model-card-list-identity-v1.test.ts',
  'src/components/managers/models/components/model-card-mannequin-input-v1.test.ts',
  'src/components/managers/models/components/model-card-mannequin-pose-v1.test.ts',
  'src/components/managers/models/components/model-card-mannequin-preview-v1.test.tsx',
  'src/components/shared/measurement-guide-visibility-v1.test.ts',
  'src/components/shared/measurement-surface-active-measurement-guide-v1.test.ts',
  'src/components/shared/measurement-surface-live-positions-v1.test.ts',
  'src/components/shared/measurement-watertight-surface-v1-stage.test.ts',
  'src/lib/cloth/body/makehuman-arm-body-part-ik-v1.test.ts',
  'src/lib/cloth/body/makehuman-clo-like-pose-display-v3.test.ts',
  'src/lib/cloth/body/makehuman-live-pose-admissibility-v1.test.ts',
  'src/lib/cloth/body/makehuman-arm-side-seam-assist-worker-v1.test.ts',
  'src/lib/cloth/body/makehuman-third-party-asset-manifest-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-card-detail-shape-parity-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-display-quality-gate-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-display-quality-worker-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-beta-torso-worker-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-female-bust-proxy-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-beta-torso-female-bust-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-beta-torso-male-neutral-parity-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-torso-depth-proxy-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-high-hip-proxy-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-knee-proxy-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-knee-proxy-worker-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-neck-proxy-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-beta-neck-wiring-v1.test.ts',
  'src/lib/cloth/body/measurement-adapter.test.ts',
  'src/lib/cloth/body/measurement-open-reference-limb-final-closure-worker-v1.test.ts',
  'src/lib/cloth/body/measurement-open-reference-limb-subset-runtime-loader-v1.test.ts',
  'src/lib/cloth/body/measurement-watertight-surface-worker-v1.test.ts',
  'src/lib/cloth/body/measurement-protocol-v1.test.ts',
  'src/lib/cloth/body/mesh-surface-topology-v1.test.ts',
  'src/lib/cloth/body/mesh-surface-path-v1.test.ts',
  'src/lib/cloth/body/mesh-surface-geodesic-v1.test.ts',
  'src/lib/cloth/body/measurement-surface-anchors-v1.test.ts',
  'src/lib/cloth/body/measurement-surface-anchors-morph-v1.test.ts',
]);

const browserSuites = Object.freeze([
  Object.freeze({
    label: 'mobile touch pose ownership and guided/table form continuity',
    config: 'playwright.model-form-direct-pose-touch-v1.config.ts',
  }),
  Object.freeze({
    label: 'V9 live pose, camera, arms-at-sides and anatomical rejection',
    config: 'playwright.model-form-direct-pose-v9.config.ts',
    grep: [
      'shoulder marker live-drags posture without taking wrist, torso, or camera controls',
      'ModelForm V9 live-drags head and leg while empty space remains the camera',
      'clean ModelForm V9 lowers linked arms beside the thighs with a 56 px wrist target',
      'direct ankle and wrist drags retain a non-crossing last-valid pose across limb families',
      'side-view elbow ring admits anterior flexion and cannot reverse past neutral',
      'side-view wrist drag detents a visibly straight arm to exact neutral',
      'hostile wrist drag keeps the last-valid source and canvas',
      'desktop pair keeps the mannequin and the focused field on screen',
      'joints do not drag while edit pose is off',
    ].join('|'),
  }),
  Object.freeze({
    label: 'durable detail pose round trip',
    config: 'playwright.model-detail-durable-pose-v1.config.ts',
    grep: 'durable pose loads, saves with lossless CAS, survives ordinary Save and reload',
  }),
  Object.freeze({
    label: 'saved pose on model card',
    config: 'playwright.model-card-saved-pose-v1.config.ts',
  }),
  Object.freeze({
    label: 'measurement-to-mannequin form binding',
    config: 'playwright.model-form-mannequin-binding.config.ts',
  }),
  Object.freeze({
    label: 'mobile guided measurement entry',
    config: 'playwright.model-form-measurement-quiz-v1.config.ts',
  }),
  Object.freeze({
    label: 'measurement morph, body basis and last-valid canvas coverage',
    config: 'playwright.model-form-personalized-preview.config.ts',
    grep: [
      'real ModelForm auto-binds edit/create measurements to its V9 mannequin',
      'continuous measurement typing retains the last-valid V9 canvas until replacement is ready',
      'rapid valid measurement edits coalesce while the quality gate leaves animation frames live',
      'real ModelForm admits female, male and neutral open-reference bases',
      'high hip and knee apply as bounded proxies on female, male and neutral bases',
      'neck applies as a bounded proxy on female and neutral, and is honestly not applied on male',
      'female chest and under bust reshape the bust; male keeps its chest path',
      'hidden measurement lines read through the body and from their own view',
      'measurement lines read on a phone portrait stage while a field is typed',
      'a posed wrist ring draws on the posed body',
    ].join('|'),
  }),
  Object.freeze({
    label: 'new-model durable pose handoff and duplicate-safe retry',
    config: 'playwright.model-create-pose-handoff-v1.config.ts',
  }),
]);

function run(label, cli, args) {
  const started = Date.now();
  process.stdout.write(`\n[mannequin-ci] ${label}\n`);
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  const elapsedSeconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) {
    process.stderr.write(
      `[mannequin-ci] ${label} failed after ${elapsedSeconds}s` +
        (result.signal ? ` (signal ${result.signal})\n` : ` (exit ${result.status})\n`),
    );
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[mannequin-ci] ${label} passed in ${elapsedSeconds}s\n`);
}

function runUnits() {
  run('production unit allowlist', vitestCli, [
    'run',
    '--maxWorkers=1',
    '--reporter=dot',
    ...unitFiles,
  ]);
}

function runBrowsers(listOnly) {
  for (const suite of browserSuites) {
    run(`${listOnly ? 'list' : 'browser'}: ${suite.label}`, playwrightCli, [
      'test',
      `--config=${suite.config}`,
      ...(suite.grep ? ['--grep', suite.grep] : []),
      ...(listOnly ? ['--list'] : []),
    ]);
  }
}

function usage() {
  process.stdout.write(`Usage: node scripts/mannequin-ci-gate.mjs <mode>\n\n`);
  process.stdout.write(`Modes:\n`);
  process.stdout.write(`  all           Run the production unit allowlist and browser contour.\n`);
  process.stdout.write(`  unit          Run only the production unit allowlist.\n`);
  process.stdout.write(`  browser       Run only the browser contour.\n`);
  process.stdout.write(
    `  browser-list  List the exact selected browser tests without starting servers.\n`,
  );
}

const mode = process.argv[2] ?? 'all';
if (mode === 'all') {
  runUnits();
  runBrowsers(false);
} else if (mode === 'unit') {
  runUnits();
} else if (mode === 'browser') {
  runBrowsers(false);
} else if (mode === 'browser-list') {
  runBrowsers(true);
} else if (mode === '--help' || mode === '-h' || mode === 'help') {
  usage();
} else {
  usage();
  process.exit(2);
}
