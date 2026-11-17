/* global GPU, GPUAdapter, GPUCanvasContext, GPUDevice, GPUDeviceLostInfo, GPUQueue, GPUTextureFormat, GPUUncapturedErrorEvent */

export const XPBD_DEVICE_SESSION_VERSION = 'xpbd-device-session/1' as const;

declare const runtimeSessionIdBrand: unique symbol;
declare const deviceGenerationBrand: unique symbol;

/** Opaque on the evidence boundary; the runtime currently creates a canonical UUID value. */
export type XpbdRuntimeSessionId = string & { readonly [runtimeSessionIdBrand]: true };

/** Positive integer identifying one GPUDevice incarnation inside a logical runtime session. */
export type XpbdDeviceGeneration = number & { readonly [deviceGenerationBrand]: true };

export type XpbdRuntimeIdentity = {
  readonly runtimeSessionId: XpbdRuntimeSessionId;
  readonly deviceGeneration: XpbdDeviceGeneration;
};

export type XpbdDeviceSessionState = 'ready' | 'lost' | 'disposed';

export type XpbdDeviceCapabilities = {
  readonly maxBufferSize: number;
  readonly maxStorageBufferBindingSize: number;
  readonly maxUniformBufferBindingSize: number;
  readonly maxComputeWorkgroupsPerDimension: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxBindingsPerBindGroup: number;
  readonly maxStorageBuffersPerShaderStage: number;
  readonly maxUniformBuffersPerShaderStage: number;
  readonly maxBindGroups: number;
  readonly preferredCanvasFormat: GPUTextureFormat;
};

export type XpbdDeviceSessionDiagnostics = {
  readonly deviceLossCount: number;
  readonly uncapturedErrors: readonly string[];
  readonly activeLease: boolean;
};

export type XpbdDeviceLease = {
  readonly active: boolean;
  readonly identity: XpbdRuntimeIdentity;
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvas: HTMLCanvasElement;
  readonly format: GPUTextureFormat;
  readonly capabilities: XpbdDeviceCapabilities;
  readonly lost: Promise<GPUDeviceLostInfo>;
  assertActive(): void;
  release(): void;
};

export type OwnedActiveXpbdDeviceLeaseInspectionV1 = Readonly<{
  ok: true;
  device: GPUDevice;
  queue: GPUQueue;
  identity: XpbdRuntimeIdentity;
  limits: Omit<XpbdDeviceCapabilities, 'preferredCanvasFormat'>;
  lost: Promise<GPUDeviceLostInfo>;
  assertActive(): void;
  release(): void;
}>;

type OwnedLeaseRecord = Readonly<{
  device: GPUDevice;
  queue: GPUQueue;
  identity: XpbdRuntimeIdentity;
  limits: Omit<XpbdDeviceCapabilities, 'preferredCanvasFormat'>;
  lost: Promise<GPUDeviceLostInfo>;
  isActive(): boolean;
  assertActive(): void;
  release(): void;
}>;

const ownedLeaseRecords = new WeakMap<object, OwnedLeaseRecord>();

export function inspectOwnedActiveXpbdDeviceLeaseV1(
  candidate: unknown,
): OwnedActiveXpbdDeviceLeaseInspectionV1 | Readonly<{ ok: false; code: 'invalid' | 'inactive' }> {
  if (candidate === null || (typeof candidate !== 'object' && typeof candidate !== 'function'))
    return Object.freeze({ ok: false, code: 'invalid' });
  const record = ownedLeaseRecords.get(candidate as object);
  if (!record) return Object.freeze({ ok: false, code: 'invalid' });
  if (!record.isActive()) return Object.freeze({ ok: false, code: 'inactive' });
  return Object.freeze({
    ok: true,
    device: record.device,
    queue: record.queue,
    identity: record.identity,
    limits: record.limits,
    lost: record.lost,
    assertActive: record.assertActive,
    release: record.release,
  });
}

export type XpbdDeviceSessionCleanup = {
  readonly contextUnconfigured: true;
  readonly deviceDestroyed: true;
  readonly releasedLeaseCount: number;
};

export type XpbdDeviceSession = {
  readonly schemaVersion: typeof XPBD_DEVICE_SESSION_VERSION;
  readonly identity: XpbdRuntimeIdentity;
  readonly state: XpbdDeviceSessionState;
  readonly capabilities: XpbdDeviceCapabilities;
  acquireExclusive(): XpbdDeviceLease;
  diagnostics(): XpbdDeviceSessionDiagnostics;
  dispose(): Promise<XpbdDeviceSessionCleanup>;
};

type XpbdGpuProvider = Pick<GPU, 'getPreferredCanvasFormat' | 'requestAdapter'>;

export type CreateXpbdDeviceSessionOptions = {
  readonly gpu?: XpbdGpuProvider;
  readonly sessionIdFactory?: () => XpbdRuntimeSessionId;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo, identity: XpbdRuntimeIdentity) => void;
  readonly onUncapturedError?: (message: string, identity: XpbdRuntimeIdentity) => void;
};

export function createXpbdRuntimeSessionId(): XpbdRuntimeSessionId {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('A cryptographically unique runtime session id is unavailable.');
  }
  return `gpu-session:${globalThis.crypto.randomUUID()}` as XpbdRuntimeSessionId;
}

function validSessionId(value: string): value is XpbdRuntimeSessionId {
  return /^gpu-session:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Owns one adapter/device/context generation. Recovery is deliberately absent in v1: device loss
 * is terminal, so callers cannot accidentally mix evidence from two physical GPUDevice objects.
 */
export async function createXpbdDeviceSession(
  canvas: HTMLCanvasElement,
  options: CreateXpbdDeviceSessionOptions = {},
): Promise<XpbdDeviceSession> {
  const gpu = options.gpu ?? navigator.gpu;
  if (!gpu) throw new Error('WebGPU is unavailable in this browser.');
  const runtimeSessionId = (options.sessionIdFactory ?? createXpbdRuntimeSessionId)();
  if (!validSessionId(runtimeSessionId)) {
    throw new Error('runtimeSessionId must be a canonical gpu-session UUID.');
  }

  const adapter: GPUAdapter | null = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) throw new Error('The browser did not provide a WebGPU adapter.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    throw new Error('The canvas could not create a WebGPU context.');
  }
  const format = gpu.getPreferredCanvasFormat();
  try {
    context.configure({ device, format, alphaMode: 'opaque' });
  } catch (error) {
    device.destroy();
    throw error;
  }

  const identity = Object.freeze({
    runtimeSessionId,
    deviceGeneration: 1 as XpbdDeviceGeneration,
  });
  const capabilities: XpbdDeviceCapabilities = Object.freeze({
    maxBufferSize: device.limits.maxBufferSize,
    maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
    maxUniformBufferBindingSize: device.limits.maxUniformBufferBindingSize,
    maxComputeWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
    maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
    maxBindingsPerBindGroup: device.limits.maxBindingsPerBindGroup,
    maxStorageBuffersPerShaderStage: device.limits.maxStorageBuffersPerShaderStage,
    maxUniformBuffersPerShaderStage: device.limits.maxUniformBuffersPerShaderStage,
    maxBindGroups: device.limits.maxBindGroups,
    preferredCanvasFormat: format,
  });
  let state: XpbdDeviceSessionState = 'ready';
  let activeLeaseToken: symbol | null = null;
  let releasedLeaseCount = 0;
  let deviceLossCount = 0;
  const uncapturedErrors: string[] = [];

  const onUncapturedError = (event: GPUUncapturedErrorEvent) => {
    if (state === 'disposed') return;
    const message = event.error.message || 'Unknown WebGPU uncaptured error.';
    uncapturedErrors.push(message);
    options.onUncapturedError?.(message, identity);
  };
  device.addEventListener('uncapturederror', onUncapturedError);

  void device.lost.then((info) => {
    if (state === 'disposed') return;
    if (state !== 'lost') {
      state = 'lost';
      deviceLossCount += 1;
      options.onDeviceLost?.(info, identity);
    }
  });

  return {
    schemaVersion: XPBD_DEVICE_SESSION_VERSION,
    identity,
    get state() {
      return state;
    },
    capabilities,
    acquireExclusive() {
      if (state !== 'ready') {
        throw new Error('Cannot acquire an XPBD device lease from a ' + state + ' session.');
      }
      if (activeLeaseToken !== null) {
        throw new Error('The XPBD device session already has an active engine lease.');
      }
      const token = Symbol('xpbd-device-lease');
      activeLeaseToken = token;
      let released = false;
      const lease = {
        get active() {
          return !released && state === 'ready' && activeLeaseToken === token;
        },
        identity,
        device,
        context,
        canvas,
        format,
        capabilities,
        lost: device.lost,
        assertActive() {
          if (released || state !== 'ready' || activeLeaseToken !== token) {
            throw new Error('The XPBD device lease is no longer active and exclusive.');
          }
        },
        release() {
          if (released) return;
          released = true;
          if (activeLeaseToken === token) {
            activeLeaseToken = null;
            releasedLeaseCount += 1;
          }
        },
      };
      const limits = Object.freeze({
        maxBufferSize: capabilities.maxBufferSize,
        maxStorageBufferBindingSize: capabilities.maxStorageBufferBindingSize,
        maxUniformBufferBindingSize: capabilities.maxUniformBufferBindingSize,
        maxComputeWorkgroupsPerDimension: capabilities.maxComputeWorkgroupsPerDimension,
        maxComputeInvocationsPerWorkgroup: capabilities.maxComputeInvocationsPerWorkgroup,
        maxComputeWorkgroupSizeX: capabilities.maxComputeWorkgroupSizeX,
        maxBindingsPerBindGroup: capabilities.maxBindingsPerBindGroup,
        maxStorageBuffersPerShaderStage: capabilities.maxStorageBuffersPerShaderStage,
        maxUniformBuffersPerShaderStage: capabilities.maxUniformBuffersPerShaderStage,
        maxBindGroups: capabilities.maxBindGroups,
      });
      ownedLeaseRecords.set(
        lease,
        Object.freeze({
          device,
          queue: device.queue,
          identity,
          limits,
          lost: device.lost,
          isActive: () => !released && state === 'ready' && activeLeaseToken === token,
          assertActive: () => lease.assertActive(),
          release: () => lease.release(),
        }),
      );
      return Object.freeze(lease);
    },
    diagnostics() {
      return {
        deviceLossCount,
        uncapturedErrors: [...uncapturedErrors],
        activeLease: activeLeaseToken !== null,
      };
    },
    async dispose() {
      if (state === 'disposed') {
        return { contextUnconfigured: true, deviceDestroyed: true, releasedLeaseCount };
      }
      if (activeLeaseToken !== null) {
        throw new Error('Cannot dispose an XPBD device session while an engine lease is active.');
      }
      state = 'disposed';
      device.removeEventListener('uncapturederror', onUncapturedError);
      context.unconfigure();
      device.destroy();
      return { contextUnconfigured: true, deviceDestroyed: true, releasedLeaseCount };
    },
  };
}
