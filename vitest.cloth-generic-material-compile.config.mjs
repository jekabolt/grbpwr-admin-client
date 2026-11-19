import base from './vitest.cloth-observed-placement.config.mjs';

// Separate CPU-only compile/placement stages; the frozen two-panel runtime suite is unchanged.
export default {
  ...base,
  test: {
    ...base.test,
    maxWorkers: 1,
    fileParallelism: false,
    include: [
      'src/lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test.ts',
      'src/lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1.test.ts',
      'src/components/cloth-simulation-spike/dxf-garment-observed-body-initial-preflight-v1.test.ts',
      'src/lib/cloth/runtime/webgpu/xpbd-material-velocity-kernel-v2.test.ts',
      'src/lib/cloth/runtime/webgpu/garment-material-run-plan-v1.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-snapshot-production-v1.test.ts',
      'src/lib/cloth/domain/dxf-exact-assembly-graph-v1.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test.ts',
      'src/lib/cloth/runtime/webgpu/garment-material-contact-execution-layout-v1.test.ts',
      'src/components/cloth-simulation-spike/dxf-garment-observed-frame-validation-v1.test.ts',
      'src/components/cloth-simulation-spike/dxf-garment-observed-webgpu-replay-v1.test.ts',
      'src/components/cloth-simulation-spike/dxf-garment-observed-strain-heatmap-preview-v1.test.ts',
      'src/lib/cloth/domain/dxf-garment-physical-initialization-v1.test.ts',
      'src/components/cloth-simulation-spike/saved-generic-observed-physical-host-v1.test.ts',
      // The additive generic dispatcher shares this registry with the preserved legacy routes.
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2*.test.ts',
    ],
  },
};
