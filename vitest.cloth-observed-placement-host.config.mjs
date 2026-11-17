import base from './vitest.cloth-observed-placement.config.mjs';

// Adds production-adapter/context coverage to the portable source-to-world CPU suite.
export default {
  ...base,
  test: {
    ...base.test,
    include: [
      ...base.test.include,
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1.observed.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-observed-placement-production-v3.integration.test.ts',
      'src/components/cloth-simulation-spike/qualified-two-panel-placement-authoring-v1.test.tsx',
      'src/components/cloth-simulation-spike/qualified-two-panel-observed-placement-authoring-v1.test.ts',
    ],
  },
};
