import { ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1 } from '../../body/actual-body-triangle-aabb-tree-v1';
import {
  ACTUAL_BODY_CONTACT_AABB_ABI_V1,
  type prepareActualBodyContactAabbPacketV1,
} from './actual-body-contact-aabb-packet-v1';

export const ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1 = Object.freeze({
  version: 'actual-body-contact-nearest-candidate/1',
  entryPoint: 'queryActualBodyContactNearestCandidateV1',
  workgroupSize: 64,
  paramsBytes: 32,
  resultStrideBytes: 48,
  maximumQueries: 2000,
  maximumAcceleratedWorkPerQuery: 4096,
  mode: Object.freeze({ tree: 0, exhaustive: 1 }),
  status: Object.freeze({ found: 0, fixed: 1, invalid: 2, exhausted: 3, noTriangle: 4 }),
} as const);

const abi = ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_ABI_V1;
const geometryLimits = ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1;
const treeAbi = ACTUAL_BODY_CONTACT_AABB_ABI_V1;

export function packActualBodyContactNearestCandidateParamsV1(
  input: Readonly<{
    body: ReturnType<typeof prepareActualBodyContactAabbPacketV1>;
    queryCount: number;
    normalFloor: number;
    outwardSign: 1 | -1;
    traversal: Readonly<{ mode: 'tree'; visitBudget: number }> | Readonly<{ mode: 'exhaustive' }>;
  }>,
): ArrayBuffer {
  const { body, queryCount, outwardSign, traversal } = input;
  const normalFloor = Math.fround(input.normalFloor);
  const boundedInteger = (value: number, min: number, max: number) =>
    Number.isSafeInteger(value) && value >= min && value <= max;
  const visitBudget = traversal.mode === 'tree' ? traversal.visitBudget : body.bodyTriangleCount;
  if (
    !boundedInteger(queryCount, 1, abi.maximumQueries) ||
    body.version !== treeAbi.version ||
    !boundedInteger(body.bodyVertexCount, 4, geometryLimits.maximumBodyVertices) ||
    !boundedInteger(body.bodyTriangleCount, 4, geometryLimits.maximumBodyTriangles) ||
    !boundedInteger(body.nodeCount, 1, treeAbi.maxNodes) ||
    (traversal.mode !== 'tree' && traversal.mode !== 'exhaustive') ||
    (traversal.mode === 'tree' &&
      !boundedInteger(visitBudget, 1, abi.maximumAcceleratedWorkPerQuery)) ||
    !(normalFloor >= Math.fround(1e-30) && normalFloor <= 1) ||
    (outwardSign !== 1 && outwardSign !== -1)
  )
    throw new RangeError('Actual-body query is outside the admitted candidate limits.');

  const buffer = new ArrayBuffer(abi.paramsBytes);
  const view = new DataView(buffer);
  view.setUint32(0, queryCount, true);
  view.setUint32(4, body.bodyVertexCount, true);
  view.setUint32(8, body.bodyTriangleCount, true);
  view.setUint32(12, body.nodeCount, true);
  view.setUint32(16, visitBudget, true);
  view.setUint32(20, abi.mode[traversal.mode], true);
  view.setFloat32(24, normalFloor, true);
  view.setFloat32(28, outwardSign, true);
  return buffer;
}

/** Read-only numeric candidate. Both traversals evaluate the same triangle at one callsite. */
export const ACTUAL_BODY_CONTACT_NEAREST_CANDIDATE_WGSL_V1 = /* wgsl */ `
struct Params {
  queryCount: u32,
  vertexCount: u32,
  triangleCount: u32,
  nodeCount: u32,
  visitBudget: u32,
  mode: u32,
  normalFloor: f32,
  outwardSign: f32,
};
struct AabbNode {
  low: vec3<u32>,
  first: u32,
  high: vec3<u32>,
  second: u32,
};
struct Hit {
  pointAndScore: vec4<f32>,
  normal: vec4<f32>,
  ordinalStatusWork: vec4<u32>,
};
struct Feature {
  surfacePoint: vec3<f32>,
  score: u32,
};
const NO_TRIANGLE = 0xffffffffu;
const ABS_MASK = 0x7fffffffu;
const SIGN_MASK = 0x80000000u;
const MIN_NORMAL = 0x00800000u;
const LEAF_FLAG = ${treeAbi.leafFlag}u;
const STACK_DEPTH = ${treeAbi.maxDepth}u;
@group(0) @binding(0) var<storage, read> query: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read> body: array<u32>;
@group(0) @binding(2) var<storage, read> triangles: array<u32>;
@group(0) @binding(3) var<storage, read> nodes: array<AabbNode>;
@group(0) @binding(4) var<storage, read> ordinals: array<u32>;
@group(0) @binding(5) var<uniform> params: Params;
@group(0) @binding(6) var<storage, read_write> result: array<Hit>;

fn coordinateKey(raw: u32) -> u32 {
  if ((raw & ABS_MASK) == 0u) { return SIGN_MASK; }
  return select(raw | SIGN_MASK, ~raw, (raw & SIGN_MASK) != 0u);
}
fn nativeMinimum(a: u32, b: u32) -> u32 {
  return select(b, a, coordinateKey(a) <= coordinateKey(b));
}
fn nativeMaximum(a: u32, b: u32) -> u32 {
  return select(b, a, coordinateKey(a) >= coordinateKey(b));
}
fn clampToBox(p: vec3<u32>, low: vec3<u32>, high: vec3<u32>) -> vec3<u32> {
  return vec3<u32>(
    nativeMaximum(low.x, nativeMinimum(p.x, high.x)),
    nativeMaximum(low.y, nativeMinimum(p.y, high.y)),
    nativeMaximum(low.z, nativeMinimum(p.z, high.z)),
  );
}
fn normalOrZero(raw: u32) -> f32 {
  return bitcast<f32>(select(raw, 0u, (raw & ABS_MASK) < MIN_NORMAL));
}
// Q discards subnormal values and the last significand bit. The node uses
// Q of one predecessor after each operation, which is <= Q of any allowed
// adjacent rounding at the same exact value. Consuming the changed bits
// at each operation also prevents reassociation across the quantization.
fn scoreBits(value: f32, lower: bool) -> u32 {
  let bits = bitcast<u32>(value) & ABS_MASK;
  let guarded = select(bits, max(bits, 1u) - 1u, lower);
  return select(guarded & 0xfffffffeu, 0u, guarded < MIN_NORMAL);
}
fn scoreAxis(a: u32, b: u32, lower: bool) -> f32 {
  let difference = bitcast<f32>(scoreBits(normalOrZero(a) - normalOrZero(b), lower));
  return bitcast<f32>(scoreBits(difference * difference, lower));
}
fn distanceScore(p: vec3<u32>, q: vec3<u32>, lower: bool) -> u32 {
  let x = scoreAxis(p.x, q.x, lower);
  let y = scoreAxis(p.y, q.y, lower);
  let z = scoreAxis(p.z, q.z, lower);
  let xy = bitcast<f32>(scoreBits(x + y, lower));
  return scoreBits(xy + z, lower);
}
fn nodeScore(p: vec3<u32>, index: u32) -> u32 {
  return distanceScore(p, clampToBox(p, nodes[index].low, nodes[index].high), true);
}
fn bodyVertex(index: u32) -> vec3<u32> {
  let offset = index * 3u;
  return vec3<u32>(body[offset], body[offset + 1u], body[offset + 2u]);
}
fn projectEdge(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
  let edge = b - a;
  let parameter = dot(p - a, edge);
  if (parameter <= 0.0) { return a; }
  let edgeLengthSquared = dot(edge, edge);
  if (parameter >= edgeLengthSquared) { return b; }
  return a + edge * (parameter / edgeLengthSquared);
}
fn scoreFeature(p: vec3<u32>, candidate: vec3<f32>, low: vec3<u32>, high: vec3<u32>) -> Feature {
  let raw = clampToBox(bitcast<vec3<u32>>(candidate), low, high);
  return Feature(bitcast<vec3<f32>>(raw), distanceScore(p, raw, false));
}
fn closestFeature(
  p: vec3<u32>,
  aRaw: vec3<u32>, bRaw: vec3<u32>, cRaw: vec3<u32>,
  rawNormal: vec3<f32>, unitNormal: vec3<f32>,
) -> Feature {
  let a = bitcast<vec3<f32>>(aRaw);
  let b = bitcast<vec3<f32>>(bRaw);
  let c = bitcast<vec3<f32>>(cRaw);
  let worldPosition = bitcast<vec3<f32>>(p);
  let low = vec3<u32>(
    nativeMinimum(aRaw.x, nativeMinimum(bRaw.x, cRaw.x)),
    nativeMinimum(aRaw.y, nativeMinimum(bRaw.y, cRaw.y)),
    nativeMinimum(aRaw.z, nativeMinimum(bRaw.z, cRaw.z)),
  );
  let high = vec3<u32>(
    nativeMaximum(aRaw.x, nativeMaximum(bRaw.x, cRaw.x)),
    nativeMaximum(aRaw.y, nativeMaximum(bRaw.y, cRaw.y)),
    nativeMaximum(aRaw.z, nativeMaximum(bRaw.z, cRaw.z)),
  );
  let projected = worldPosition - dot(worldPosition - a, unitNormal) * unitNormal;
  if (dot(cross(b - a, projected - a), rawNormal) >= 0.0 &&
      dot(cross(c - b, projected - b), rawNormal) >= 0.0 &&
      dot(cross(a - c, projected - c), rawNormal) >= 0.0) {
    return scoreFeature(p, projected, low, high);
  }
  var nearest = scoreFeature(p, projectEdge(worldPosition, a, b), low, high);
  let bc = scoreFeature(p, projectEdge(worldPosition, b, c), low, high);
  if (bc.score < nearest.score) { nearest = bc; }
  let ca = scoreFeature(p, projectEdge(worldPosition, c, a), low, high);
  if (ca.score < nearest.score) { nearest = ca; }
  return nearest;
}
fn emptyHit(status: u32, work: u32) -> Hit {
  return Hit(vec4<f32>(0.0), vec4<f32>(0.0), vec4<u32>(NO_TRIANGLE, status, work, 0u));
}
fn validParams(groups: vec3<u32>) -> bool {
  let expectedGroups = (params.queryCount + ${abi.workgroupSize - 1}u) / ${abi.workgroupSize}u;
  let validBudget = select(
    params.visitBudget > 0u && params.visitBudget <= ${abi.maximumAcceleratedWorkPerQuery}u,
    params.visitBudget == params.triangleCount,
    params.mode == ${abi.mode.exhaustive}u,
  );
  return params.queryCount > 0u && params.queryCount <= ${abi.maximumQueries}u &&
    all(groups == vec3<u32>(expectedGroups, 1u, 1u)) && validBudget &&
    params.vertexCount >= 4u && params.vertexCount <= ${geometryLimits.maximumBodyVertices}u &&
    params.triangleCount >= 4u && params.triangleCount <= ${geometryLimits.maximumBodyTriangles}u &&
    params.nodeCount >= 1u && params.nodeCount <= ${treeAbi.maxNodes}u &&
    params.mode <= ${abi.mode.exhaustive}u &&
    params.normalFloor >= 1.0e-30 && params.normalFloor <= 1.0 &&
    (params.outwardSign == 1.0 || params.outwardSign == -1.0) &&
    arrayLength(&query) == params.queryCount && arrayLength(&result) == params.queryCount &&
    arrayLength(&body) == params.vertexCount * 3u &&
    arrayLength(&triangles) == params.triangleCount * 3u &&
    arrayLength(&ordinals) == params.triangleCount && arrayLength(&nodes) == params.nodeCount;
}
@compute @workgroup_size(${abi.workgroupSize})
fn ${abi.entryPoint}(@builtin(global_invocation_id) id: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let q = id.x;
  if (q >= arrayLength(&result)) { return; }
  if (!validParams(groups)) {
    result[q] = emptyHit(${abi.status.invalid}u, 0u);
    return;
  }
  let packed = query[q];
  if (any((packed.xyz & vec3<u32>(ABS_MASK)) > vec3<u32>(bitcast<u32>(${geometryLimits.maximumAbsoluteCoordinateM}.0))) ||
      (packed.w & ABS_MASK) >= 0x7f800000u ||
      ((packed.w & ABS_MASK) != 0u && (packed.w & SIGN_MASK) != 0u)) {
    result[q] = emptyHit(${abi.status.invalid}u, 0u);
    return;
  }
  if ((packed.w & ABS_MASK) == 0u) {
    result[q] = emptyHit(${abi.status.fixed}u, 0u);
    return;
  }
  let useTree = params.mode == ${abi.mode.tree}u;
  var stackNode: array<u32, ${treeAbi.maxDepth}>;
  var stackScore: array<u32, ${treeAbi.maxDepth}>;
  var stackCount = 0u;
  var work = 0u;
  if (useTree) {
    stackNode[0] = 0u;
    stackScore[0] = nodeScore(packed.xyz, 0u);
    stackCount = 1u;
    work = 1u;
  }
  var leafStart = 0u;
  var leafCount = 0u;
  var exhaustiveOrdinal = 0u;
  var best = emptyHit(${abi.status.noTriangle}u, 0u);
  var bestScore = NO_TRIANGLE;
  loop {
    var ordinal = NO_TRIANGLE;
    if (useTree) {
      loop {
        if (leafCount != 0u) {
          ordinal = ordinals[leafStart];
          leafStart += 1u;
          leafCount -= 1u;
          break;
        }
        if (stackCount == 0u) { break; }
        stackCount -= 1u;
        if (stackScore[stackCount] > bestScore) { continue; }
        let index = stackNode[stackCount];
        let node = nodes[index];
        if ((node.second & LEAF_FLAG) != 0u) {
          leafStart = node.first;
          leafCount = node.second & ~LEAF_FLAG;
          if (leafCount == 0u || leafCount > ${treeAbi.maxLeafTriangles}u ||
              leafStart > params.triangleCount - leafCount) {
            result[q] = emptyHit(${abi.status.invalid}u, work);
            return;
          }
        } else {
          if (node.first <= index || node.second <= node.first || node.second >= params.nodeCount ||
              stackCount + 2u > STACK_DEPTH) {
            result[q] = emptyHit(${abi.status.invalid}u, work);
            return;
          }
          if (work + 2u > params.visitBudget) {
            result[q] = emptyHit(${abi.status.exhausted}u, work);
            return;
          }
          work += 2u;
          let left = nodeScore(packed.xyz, node.first);
          let right = nodeScore(packed.xyz, node.second);
          stackNode[stackCount] = select(node.first, node.second, left < right);
          stackScore[stackCount] = max(left, right);
          stackNode[stackCount + 1u] = select(node.second, node.first, left < right);
          stackScore[stackCount + 1u] = min(left, right);
          stackCount += 2u;
        }
      }
      if (ordinal == NO_TRIANGLE) { break; }
    } else {
      if (exhaustiveOrdinal == params.triangleCount) { break; }
      ordinal = exhaustiveOrdinal;
      exhaustiveOrdinal += 1u;
    }
    if (work >= params.visitBudget) {
      result[q] = emptyHit(${abi.status.exhausted}u, work);
      return;
    }
    work += 1u;
    if (ordinal >= params.triangleCount) {
      result[q] = emptyHit(${abi.status.invalid}u, work);
      return;
    }
    let offset = ordinal * 3u;
    let ia = triangles[offset];
    let ib = triangles[offset + 1u];
    let ic = triangles[offset + 2u];
    if (max(max(ia, ib), ic) >= params.vertexCount) {
      result[q] = emptyHit(${abi.status.invalid}u, work);
      return;
    }
    let a = bodyVertex(ia);
    let b = bodyVertex(ib);
    let c = bodyVertex(ic);
    let rawNormal = cross(bitcast<vec3<f32>>(b) - bitcast<vec3<f32>>(a), bitcast<vec3<f32>>(c) - bitcast<vec3<f32>>(a));
    let normalLengthSquared = dot(rawNormal, rawNormal);
    if (normalLengthSquared <= params.normalFloor) { continue; }
    let unitNormal = rawNormal * inverseSqrt(normalLengthSquared);
    let hit = closestFeature(packed.xyz, a, b, c, rawNormal, unitNormal);
    if (hit.score < bestScore || (hit.score == bestScore && ordinal < best.ordinalStatusWork.x)) {
      bestScore = hit.score;
      best = Hit(
        vec4<f32>(hit.surfacePoint, bitcast<f32>(hit.score)), vec4<f32>(unitNormal * params.outwardSign, 0.0),
        vec4<u32>(ordinal, ${abi.status.found}u, 0u, 0u),
      );
    }
  }
  best.ordinalStatusWork.z = work;
  result[q] = best;
}
`.trim();
