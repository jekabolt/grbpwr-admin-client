/* global GPUShaderModuleDescriptor */
import {
  XPBD_EMBEDDED_SCALAR_BEND_ABI_V1,
  XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1,
  XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V1,
  validateXpbdEmbeddedScalarBendBufferContractV1,
} from './xpbd-embedded-scalar-bend-kernel-v1';

// Color ordering, four-vertex conflict checks and the 16-byte uniform packet are unchanged.
export {
  packXpbdEmbeddedScalarBendColorParamsV1 as packXpbdEmbeddedScalarBendColorParamsV2,
  createXpbdEmbeddedScalarBendColorScheduleV1 as createXpbdEmbeddedScalarBendColorScheduleV2,
} from './xpbd-embedded-scalar-bend-kernel-v1';

export const XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2 = 'xpbd-embedded-scalar-bend-kernel/v2' as const;
export const XPBD_EMBEDDED_SCALAR_BEND_SOURCE_REVISION_V2 =
  'xpbd-embedded-scalar-bend-wgsl/2' as const;
export const XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V2 =
  'solveXpbdEmbeddedScalarBendColorV2' as const;
export const XPBD_EMBEDDED_SCALAR_BEND_WORKGROUP_SIZE_V2 = 64;
export const XPBD_EMBEDDED_SCALAR_BEND_PARAMS_BYTES_V2 = 16;
export const XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2 = 8;
export const XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_OFFSETS_V2 = Object.freeze({
  invalidConstraintCount: 0,
  limitedStepCount: 4,
} as const);
export const XPBD_EMBEDDED_SCALAR_BEND_ABI_V2 = Object.freeze({
  version: XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
  sourceRevision: XPBD_EMBEDDED_SCALAR_BEND_SOURCE_REVISION_V2,
  entryPoint: XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V2,
  workgroupSize: XPBD_EMBEDDED_SCALAR_BEND_WORKGROUP_SIZE_V2,
  bindings: Object.freeze({
    ...XPBD_EMBEDDED_SCALAR_BEND_ABI_V1.bindings,
    invalidConstraintCount: Object.freeze({
      ...XPBD_EMBEDDED_SCALAR_BEND_ABI_V1.bindings.invalidConstraintCount,
      sizeBytes: XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2,
      offsets: XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_OFFSETS_V2,
    }),
  }),
  bindingCounts: XPBD_EMBEDDED_SCALAR_BEND_ABI_V1.bindingCounts,
  colorParamsOffsets: XPBD_EMBEDDED_SCALAR_BEND_ABI_V1.colorParamsOffsets,
  schedule: XPBD_EMBEDDED_SCALAR_BEND_ABI_V1.schedule,
  diagnostics: Object.freeze({
    lifecycle: 'run-cumulative',
    increment: 'saturating-u32',
    limitedStepCount: 'successfully-written-constraints-with-scale-below-one',
    invalidConstraintCount: 'failed-constraints-including-rounded-candidate-orientation-loss',
  }),
  safeguard: Object.freeze({
    radius: 'min-current-incident-triangle-minimum-altitude-divided-by-eight',
    lambdaAndPositionUseSameScale: true,
    exactArithmeticProjectedAreaFractionFloor: 37 / 64,
    roundedCandidateOrientationCheck: 'both-old-normal-dot-new-normal-strictly-positive',
    protectsOtherIncidentTriangles: false,
    globalClothStabilityClaimed: false,
    materialRestAndPinsChanged: false,
  }),
} as const);

/** Keep all unchanged V1 algebra byte-for-byte. Every surgery anchor is exact and unique; V2 has
 * its own pinned final source digest. A V1 source change cannot silently alter this kernel.
 */
function replaceOnce(source: string, before: string, after: string): string {
  const offset = source.indexOf(before);
  if (offset < 0 || source.indexOf(before, offset + before.length) >= 0)
    throw new Error('V2 bend source requires the exact frozen V1 algebra anchor.');
  return source.slice(0, offset) + after + source.slice(offset + before.length);
}
let source = replaceOnce(
  XPBD_EMBEDDED_SCALAR_BEND_WGSL_V1,
  XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V1,
  XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V2,
);
source = replaceOnce(
  source,
  'struct BendDiagnostics{invalidConstraintCount:atomic<u32>,};',
  'struct BendDiagnostics{invalidConstraintCount:atomic<u32>,limitedStepCount:atomic<u32>,};',
);
source = replaceOnce(
  source,
  'fn rejectConstraint(){loop{let oldValue=atomicLoad(&diagnostics.invalidConstraintCount);if(oldValue==0xffffffffu){break;}let result=atomicCompareExchangeWeak(&diagnostics.invalidConstraintCount,oldValue,oldValue+1u);if(result.exchanged){break;}}}',
  `fn rejectConstraint(){loop{let oldValue=atomicLoad(&diagnostics.invalidConstraintCount);if(oldValue==0xffffffffu){break;}let result=atomicCompareExchangeWeak(&diagnostics.invalidConstraintCount,oldValue,oldValue+1u);if(result.exchanged){break;}}}
// Direct global references preserve the V1 WGSL language-feature requirements.
fn recordLimitedStep(){loop{let oldValue=atomicLoad(&diagnostics.limitedStepCount);if(oldValue==0xffffffffu){break;}let result=atomicCompareExchangeWeak(&diagnostics.limitedStepCount,oldValue,oldValue+1u);if(result.exchanged){break;}}}`,
);
source = replaceOnce(
  source,
  'let deltaLambda=(-constraintValue-alpha*previousLambda)/denominator;let nextLambda=previousLambda+deltaLambda;let nextEdgeA=edgeA.xyz+edgeA.w*deltaLambda*gradientEdgeA;let nextEdgeB=edgeB.xyz+edgeB.w*deltaLambda*gradientEdgeB;let nextOppositeA=oppositeA.xyz+oppositeA.w*deltaLambda*gradientOppositeA;let nextOppositeB=oppositeB.xyz+oppositeB.w*deltaLambda*gradientOppositeB;',
  `// A2 is twice-area, L the maximum incident edge, h=A2/L the minimum altitude.
  // Every vertex moves at most r=min(hA,hB)/8 in exact arithmetic. For either face,
  // |delta A2| <= r*perimeter+3*r*r <= (3/8+3/64)*A2; old-normal area remains >=37/64.
  // The slack is geometric, not fitted to a fixture or final strain. F32 candidates are checked below.
  let trustRadiusM=min(normalLengthA/max(edgeLength,max(length(firstA),length(firstB))),normalLengthB/max(edgeLength,max(length(secondA),length(secondB))))*0.125;
  let rawDeltaLambda=(-constraintValue-alpha*previousLambda)/denominator;
  let rawEdgeA=edgeA.w*rawDeltaLambda*gradientEdgeA;
  let rawEdgeB=edgeB.w*rawDeltaLambda*gradientEdgeB;
  let rawOppositeA=oppositeA.w*rawDeltaLambda*gradientOppositeA;
  let rawOppositeB=oppositeB.w*rawDeltaLambda*gradientOppositeB;
  let rawMaximumCorrectionM=max(max(length(rawEdgeA),length(rawEdgeB)),max(length(rawOppositeA),length(rawOppositeB)));
  if(!finiteScalar(trustRadiusM)||trustRadiusM<=0.0||!finiteScalar(rawDeltaLambda)||!finiteScalar(rawMaximumCorrectionM)||!finiteVector(rawEdgeA)||!finiteVector(rawEdgeB)||!finiteVector(rawOppositeA)||!finiteVector(rawOppositeB)){rejectConstraint();return;}
  var limiterScale=1.0;
  if(rawMaximumCorrectionM>trustRadiusM){limiterScale=trustRadiusM/rawMaximumCorrectionM;}
  let deltaLambda=rawDeltaLambda*limiterScale;
  let nextLambda=previousLambda+deltaLambda;
  let nextEdgeA=select(edgeA.xyz+rawEdgeA*limiterScale,edgeA.xyz,edgeA.w==0.0);
  let nextEdgeB=select(edgeB.xyz+rawEdgeB*limiterScale,edgeB.xyz,edgeB.w==0.0);
  let nextOppositeA=select(oppositeA.xyz+rawOppositeA*limiterScale,oppositeA.xyz,oppositeA.w==0.0);
  let nextOppositeB=select(oppositeB.xyz+rawOppositeB*limiterScale,oppositeB.xyz,oppositeB.w==0.0);`,
);
source = replaceOnce(
  source,
  'lambdas[constraintIndex]=nextLambda;positions[quad.x]=vec4<f32>(nextEdgeA,edgeA.w);',
  `// Validate actual f32 candidates before committing either lambda or XYZ. Invalid is fatal to the run.
  let candidateNormalA=cross(nextEdgeA-nextOppositeA,nextEdgeB-nextOppositeA);
  let candidateNormalB=cross(nextEdgeB-nextOppositeB,nextEdgeA-nextOppositeB);
  let projectedAreaA=dot(rawNormalA,candidateNormalA);
  let projectedAreaB=dot(rawNormalB,candidateNormalB);
  if(!finiteVector(candidateNormalA)||!finiteVector(candidateNormalB)||!finiteScalar(projectedAreaA)||!finiteScalar(projectedAreaB)||projectedAreaA<=0.0||projectedAreaB<=0.0){rejectConstraint();return;}
  if(limiterScale<1.0){recordLimitedStep();}
  lambdas[constraintIndex]=nextLambda;positions[quad.x]=vec4<f32>(nextEdgeA,edgeA.w);`,
);
export const XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2 = source;
export const XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2 =
  '4e349e703819ed1bc5715cd7792955974379a0d9c6689dc5ea0836308ff423ad' as const;

export function validateXpbdEmbeddedScalarBendBufferContractV2(
  resources: Parameters<typeof validateXpbdEmbeddedScalarBendBufferContractV1>[0],
  counts: Parameters<typeof validateXpbdEmbeddedScalarBendBufferContractV1>[1],
): void {
  if (resources.invalidConstraintCount.size !== XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2)
    throw new RangeError('V2 bend diagnostics must contain exactly two u32 words.');
  validateXpbdEmbeddedScalarBendBufferContractV1(
    {
      ...resources,
      invalidConstraintCount: { ...resources.invalidConstraintCount, size: 4 },
    },
    counts,
  );
}

export async function hashXpbdEmbeddedScalarBendSourceV2(
  value: string,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
): Promise<string> {
  const crypto = Object.prototype.hasOwnProperty.call(options, 'crypto')
    ? options.crypto
    : globalThis.crypto;
  if (!crypto?.subtle) throw new Error('XPBD embedded scalar bend V2 requires Web Crypto SHA-256.');
  const bytes = new TextEncoder().encode(value);
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function getXpbdEmbeddedScalarBendPipelineIdentityV2(
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> | null }> = {},
) {
  const sha256 = await hashXpbdEmbeddedScalarBendSourceV2(
    XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2,
    options,
  );
  if (sha256 !== XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2)
    throw new Error('XPBD embedded scalar bend V2 source differs from its pinned identity.');
  return Object.freeze({ sha256, entryPoint: XPBD_EMBEDDED_SCALAR_BEND_ENTRY_POINT_V2 });
}
export function xpbdEmbeddedScalarBendShaderDescriptorV2(): GPUShaderModuleDescriptor {
  return {
    label: 'XPBD embedded scalar bend V2 altitude trust bound',
    code: XPBD_EMBEDDED_SCALAR_BEND_WGSL_V2,
  };
}
