import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import baseline from './saved-cloth-bend-executor-trace-v2.baseline.json';
import * as predict from 'lib/cloth/runtime/webgpu/xpbd-predict-kernel-v1';
import * as distance from 'lib/cloth/runtime/webgpu/xpbd-distance-kernel-v1';
import * as seam from 'lib/cloth/runtime/webgpu/xpbd-seam-solve-kernel-v1';
import * as bend from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v1';
import * as bendV2 from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';
import * as continuum from 'lib/cloth/runtime/webgpu/triangle-strain-continuum-vnext-kernel';
import * as velocity from 'lib/cloth/runtime/webgpu/xpbd-invalid-state-kernel';
import * as contact from 'lib/cloth/runtime/webgpu/actual-body-triangle-mesh-contact-kernel-v2';
import * as resets from 'lib/cloth/runtime/webgpu/xpbd-initialization-core-reset-kernels';

// A CPU command recorder only: no GPU, kernel execution, source owner or physics admission.
export type TraceRunnerName = keyof typeof baseline.runners;
export const TRACE_RUNNERS = Object.keys(baseline.runners) as TraceRunnerName[];
export const TRACE_BASELINE = baseline;
export type TraceEvent = Record<string, unknown> & { op: string };
type Declaration = { name: string; text: string };
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function bytesOf(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
export function extractTraceDeclarations(source: string): Declaration[] {
  const file = ts.createSourceFile('runner.ts', source, ts.ScriptTarget.Latest, true);
  const result: Declaration[] = [];
  for (const node of file.statements) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      baseline.functionNames.includes(node.name.text)
    )
      result.push({ name: node.name.text, text: node.getText(file) });
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          baseline.constantNames.includes(declaration.name.text)
        )
          result.push({ name: declaration.name.text, text: `const ${declaration.getText(file)};` });
      }
    }
  }
  return result;
}
export function currentTraceDeclarations(name: TraceRunnerName): Declaration[] {
  return extractTraceDeclarations(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
}
export function declarationsDigest(declarations: readonly Declaration[]): string {
  return digest(declarations.map(({ text }) => text).join('\n\n'));
}
function summarize(value: unknown): unknown {
  if (value instanceof ArrayBuffer)
    return { bytes: value.byteLength, sha256: digest(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value))
    return {
      type: value.constructor.name,
      bytes: value.byteLength,
      sha256: digest(bytesOf(value)),
    };
  if (Array.isArray(value)) return value.map(summarize);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, summarize(item)]));
  return value;
}

type RecordedBufferDescriptor = { label?: string; size: number; usage: number };
type RecordedShaderDescriptor = { label?: string; code: string };

class RecorderBuffer {
  readonly bytes: Uint8Array;
  constructor(
    readonly id: number,
    readonly descriptor: RecordedBufferDescriptor,
    private readonly trace: TraceEvent[],
  ) {
    this.bytes = new Uint8Array(descriptor.size);
  }
  get size() {
    return this.bytes.byteLength;
  }
  async mapAsync(mode: number) {
    this.trace.push({ op: 'mapAsync', buffer: this.id, mode });
  }
  getMappedRange() {
    this.trace.push({ op: 'getMappedRange', buffer: this.id });
    return this.bytes.buffer;
  }
  unmap() {
    this.trace.push({ op: 'unmap', buffer: this.id });
  }
  destroy() {
    this.trace.push({ op: 'destroy', buffer: this.id });
  }
}
type RecordedPipeline = {
  id: number;
  getBindGroupLayout: (index: number) => { pipeline: number; index: number };
};
type RecordedCommand = { apply: () => void };
export function tracePositionSentinel(frame: number, previous: boolean): Float32Array {
  // Synthetic transport content, not a simulated state. Keep frame16/current32/previous32 distinct.
  const result = new Float32Array(580 * 4);
  for (let vertex = 0; vertex < 580; vertex += 1) {
    result[vertex * 4] = frame + vertex / 1000 + (previous ? -0.25 : 0.25);
    result[vertex * 4 + 1] = vertex / 100 + (previous ? -2 : 2);
    result[vertex * 4 + 2] = -frame - vertex / 2000;
    result[vertex * 4 + 3] = vertex % 7 === 0 ? 0 : 1 + (vertex % 11);
  }
  return result;
}
function createRecorder(options: {
  abortOnPoll?: number;
  sourceController: AbortController;
  seedPositionSnapshots?: boolean;
}) {
  const trace: TraceEvent[] = [];
  const buffers: RecorderBuffer[] = [];
  let nextId = 0,
    pollCount = 0,
    now = 0;
  const event = (op: string, fields: Record<string, unknown> = {}) => trace.push({ op, ...fields });
  const seedDiagnostics = (frame: number) => {
    // Deliberately distinct, synthetic sentinels expose offset/size/count decoding mistakes.
    for (const buffer of buffers) {
      if (buffer.descriptor.label === 'canonical-medium bend invalid counter') {
        new DataView(buffer.bytes.buffer).setUint32(0, 100 + frame, true);
        if (buffer.size === 8)
          new DataView(buffer.bytes.buffer).setUint32(4, 1000 + frame * 17, true);
      }
      if (options.seedPositionSnapshots) {
        const previous = buffer.descriptor.label === 'canonical-medium previous positions';
        if (previous || buffer.descriptor.label === 'canonical-medium positions physical vec4')
          buffer.bytes.set(bytesOf(tracePositionSentinel(frame, previous)));
      }
    }
  };
  const device = {
    createBuffer(descriptor: RecordedBufferDescriptor) {
      const buffer = new RecorderBuffer(++nextId, descriptor, trace);
      buffers.push(buffer);
      event('createBuffer', { id: buffer.id, descriptor: { ...descriptor } });
      return buffer;
    },
    createShaderModule(descriptor: RecordedShaderDescriptor) {
      const id = ++nextId;
      event('createShaderModule', {
        id,
        label: descriptor.label,
        codeSha256: digest(descriptor.code),
      });
      return {
        id,
        async getCompilationInfo() {
          event('getCompilationInfo', { module: id });
          return { messages: [] };
        },
      };
    },
    async createComputePipelineAsync(descriptor: {
      label?: string;
      layout: string;
      compute: { module: { id: number }; entryPoint: string };
    }): Promise<RecordedPipeline> {
      const id = ++nextId;
      event('createComputePipelineAsync', {
        id,
        label: descriptor.label,
        layout: descriptor.layout,
        module: descriptor.compute.module.id,
        entryPoint: descriptor.compute.entryPoint,
      });
      return {
        id,
        getBindGroupLayout(index: number) {
          event('getBindGroupLayout', { pipeline: id, index });
          return { pipeline: id, index };
        },
      };
    },
    createBindGroup(descriptor: {
      layout: unknown;
      entries: { binding: number; resource: { buffer: RecorderBuffer } }[];
    }) {
      const id = ++nextId;
      event('createBindGroup', {
        id,
        layout: descriptor.layout,
        entries: descriptor.entries.map((entry) => ({
          binding: entry.binding,
          buffer: entry.resource.buffer.id,
        })),
      });
      return { id };
    },
    createCommandEncoder(descriptor: { label: string }) {
      const id = ++nextId,
        commands: RecordedCommand[] = [];
      event('createCommandEncoder', { id, descriptor });
      return {
        beginComputePass(pass: { label: string }) {
          event('beginComputePass', { encoder: id, descriptor: pass });
          return {
            setPipeline(pipeline: RecordedPipeline) {
              event('setPipeline', { encoder: id, pipeline: pipeline.id });
            },
            setBindGroup(index: number, group: { id: number }) {
              event('setBindGroup', { encoder: id, index, group: group.id });
            },
            dispatchWorkgroups(x: number, y?: number, z?: number) {
              event('dispatchWorkgroups', { encoder: id, x, y, z });
            },
            end() {
              event('endComputePass', { encoder: id });
              const match = /^canonical-medium frame (\d+)$/.exec(descriptor.label);
              if (match) commands.push({ apply: () => seedDiagnostics(Number(match[1]) + 1) });
            },
          };
        },
        copyBufferToBuffer(
          source: RecorderBuffer,
          sourceOffset: number,
          target: RecorderBuffer,
          targetOffset: number,
          size: number,
        ) {
          event('copyBufferToBuffer', {
            encoder: id,
            source: source.id,
            sourceOffset,
            target: target.id,
            targetOffset,
            size,
          });
          if (sourceOffset + size > source.size || targetOffset + size > target.size)
            throw new Error('Recorder copy outside exact buffer bounds.');
          if (!(source.descriptor.usage & 0x0004) || !(target.descriptor.usage & 0x0008))
            throw new Error('Recorder copy requires COPY_SRC and COPY_DST buffer usages.');
          commands.push({
            apply: () =>
              target.bytes.set(source.bytes.slice(sourceOffset, sourceOffset + size), targetOffset),
          });
        },
        finish() {
          event('finish', { encoder: id });
          return { id, commands };
        },
      };
    },
    queue: {
      writeBuffer(buffer: RecorderBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = bytesOf(data);
        event('writeBuffer', {
          buffer: buffer.id,
          offset,
          size: bytes.byteLength,
          sha256: digest(bytes),
        });
        buffer.bytes.set(bytes, offset);
      },
      submit(commands: { id: number; commands: RecordedCommand[] }[]) {
        event('submit', { commandBuffers: commands.map((command) => command.id) });
        commands.forEach((command) => command.commands.forEach((operation) => operation.apply()));
      },
      async onSubmittedWorkDone() {
        event('onSubmittedWorkDone');
      },
    },
  };
  return {
    trace,
    buffers,
    device,
    performance: { now: () => ++now },
    currentSource: () => {
      event('currentSource', { poll: ++pollCount });
      if (pollCount === options.abortOnPoll) options.sourceController.abort();
      if (options.sourceController.signal.aborted) throw new Error('Synthetic source revoked.');
    },
  };
}

function syntheticPrepared(frameCount: number) {
  let seed = 0;
  const bytes = (size: number) => {
    const array = new Uint8Array(size);
    const tag = ++seed;
    for (let i = 0; i < size; i++) array[i] = (tag * 13 + i * 7) & 255;
    return array;
  };
  const schedule = (counts: number[]) =>
    counts.map((count) => ({ params: bytes(16), workgroups: Math.ceil(count / 64) }));
  // These are declared transport bytes and the exact workload's dispatch sizes, not a valid owner/package.
  return {
    physical: bytes(580 * 16),
    frameParams: Array.from({ length: frameCount }, () => bytes(32)),
    distancePairs: bytes(1490 * 8),
    distanceRestLengths: bytes(1490 * 4),
    distanceLambdas: bytes(1490 * 4),
    distanceSchedule: schedule([288, 286, 229, 213, 199, 167, 78, 27, 3]),
    seamVertexPairs: bytes(34 * 8),
    seamTargetLengths: bytes(34 * 4),
    seamLambdas: bytes(34 * 4),
    seamActivationRanks: bytes(34 * 4),
    seamActivationParams: bytes(16),
    seamSchedule: schedule([34]),
    bendVertexQuads: bytes(1246 * 16),
    bendRestAngles: bytes(1246 * 4),
    bendLambdas: bytes(1246 * 4),
    bendSchedule: schedule([
      128, 118, 110, 101, 99, 92, 87, 77, 76, 76, 72, 65, 58, 43, 22, 14, 7, 1,
    ]),
    continuumTriangleIndices: bytes(912 * 16),
    continuumRestFrames: bytes(912 * 32),
    continuumMaterialIndices: bytes(912 * 4),
    continuumMaterialRecords: bytes(16),
    continuumLambdas: bytes(912 * 16),
    continuumSchedule: schedule([181, 164, 129, 116, 107, 95, 68, 37, 13, 2]),
    bodyPositions: bytes(13380 * 12),
    bodyTriangles: bytes(26756 * 12),
    contactParams: bytes(32),
    resetPackets: { distance: bytes(16), seam: bytes(16), bend: bytes(16), continuum: bytes(16) },
  };
}

type ExtractedExecutor = {
  resolvePipelineIdentities: (safeguardedBend?: boolean) => Promise<unknown>;
  executeGpuRun: (
    device: unknown,
    tracked: RecorderBuffer[],
    prepared: unknown,
    identities: unknown,
    signal: AbortSignal,
    current: () => void,
    safeguardedBend?: boolean,
  ) => Promise<Record<string, unknown>>;
};
export async function recordExecutorTrace(input: {
  runner: TraceRunnerName;
  revision: 'baseline' | 'current';
  safeguardedBend?: boolean;
  abortOnPoll?: number;
  seedPositionSnapshots?: boolean;
}) {
  const declarations =
    input.revision === 'baseline'
      ? baseline.runners[input.runner].declarations
      : currentTraceDeclarations(input.runner);
  const source = declarations.map(({ text }) => text).join('\n\n');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const controller = new AbortController();
  const recorder = createRecorder({
    sourceController: controller,
    abortOnPoll: input.abortOnPoll,
    seedPositionSnapshots: input.seedPositionSnapshots,
  });
  const context = {
    ...predict,
    ...distance,
    ...seam,
    ...bend,
    ...bendV2,
    ...continuum,
    ...velocity,
    ...contact,
    ...resets,
    ArrayBuffer,
    DataView,
    Uint8Array,
    Uint32Array,
    Float32Array,
    CapturedFloat32Array: Float32Array,
    CapturedUint32Array: Uint32Array,
    CapturedUint8Array: Uint8Array,
    capturedReflectApply: Reflect.apply,
    capturedUint8Set: Uint8Array.prototype.set,
    RunnerAbortError: Error,
    cryptoShim: () => webcrypto,
    performance: recorder.performance,
  };
  const functions = runInNewContext(
    `${javascript}\n({executeGpuRun,resolvePipelineIdentities});`,
    context,
  ) as ExtractedExecutor;
  const identities = await functions.resolvePipelineIdentities(input.safeguardedBend);
  const tracked: RecorderBuffer[] = [];
  const frameCount = input.runner.includes('32-frame') ? 32 : 16;
  let returned: Record<string, unknown> | null = null,
    error: string | null = null;
  try {
    returned = await functions.executeGpuRun(
      recorder.device,
      tracked,
      syntheticPrepared(frameCount),
      identities,
      controller.signal,
      recorder.currentSource,
      input.safeguardedBend,
    );
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  return {
    trace: recorder.trace,
    returned: summarize(returned) as Record<string, unknown> | null,
    error,
    tracked: tracked.map((buffer) => ({
      id: buffer.id,
      label: buffer.descriptor.label,
      size: buffer.size,
      usage: buffer.descriptor.usage,
    })),
    declarationsSha256: digest(source),
  };
}

export function actualExecutorCallSites(name: TraceRunnerName) {
  const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const calls: { parent: string; callee: string; arguments: string[] }[] = [];
  function visit(node: ts.Node, parent: string) {
    if (ts.isFunctionDeclaration(node) && node.name) parent = node.name.text;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['executeGpuRun', 'resolvePipelineIdentities'].includes(node.expression.text)
    )
      calls.push({
        parent,
        callee: node.expression.text,
        arguments: node.arguments.map((arg) => arg.getText(source)),
      });
    ts.forEachChild(node, (child) => visit(child, parent));
  }
  visit(source, '');
  return calls;
}
