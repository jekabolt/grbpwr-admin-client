import base from './vitest.cloth-observed-placement.config.mjs';

// Bounded canonical+observed runtime overlay CPU checks; no browser or GPU.
export default {
  ...base,
  test: {
    ...base.test,
    maxWorkers: 1,
    fileParallelism: false,
    include: [
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-runtime-source-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-16-frame-contact-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-32-frame-contact-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-contract-v4.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2.hostile.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-runtime-source-v1.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-runtime-lifetime.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-runtime-integration.test.ts',
      'src/components/cloth-simulation-spike/saved-observed-physical-host-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/use-saved-cloth-physical-host-v1.test.ts',
      'src/components/cloth-simulation-spike/saved-observed-placement-authoring-v1.test.tsx',
      'src/components/cloth-simulation-spike/saved-physical-preview-panel-v1.test.tsx',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1.lifecycle.test.ts',
      'src/components/cloth-simulation-spike/saved-cloth-physical-controls-v1.test.tsx',
      'src/lib/cloth/domain/observed-bounded-radial-initialization-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-bounded-initialization-v1.test.ts',
      'src/components/cloth-simulation-spike/qualified-two-panel-observed-placement-authoring-v1.test.ts',
      'src/components/cloth-simulation-spike/saved-observed-physical-host-v1.diagnostic-retention.test.ts',
      'src/lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-observed16-safeguarded-diagnostic-abi-v1.test.ts',
      'src/components/cloth-simulation-spike/saved-cloth-bend-executor-trace-v2.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-observed32-static-carrier-state-audit-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-observed32-static-carrier-integration-v1.test.ts',
    ],
  },
};
