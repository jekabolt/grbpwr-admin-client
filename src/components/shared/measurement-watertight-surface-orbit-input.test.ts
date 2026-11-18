import { expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bindMeasurementSurfaceOrbitPointersV1 } from './measurement-watertight-surface-v1-stage';

class PointerCanvas {
  readonly style = {};
  readonly faults: unknown[] = [];
  readonly setPointerCapture = vi.fn();
  readonly releasePointerCapture = vi.fn();
  private readonly listeners = new Map<string, Set<(event: PointerEvent) => void>>();

  addEventListener(type: string, listener: (event: PointerEvent) => void) {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }

  removeEventListener(type: string, listener: (event: PointerEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  getRootNode() {
    return this;
  }

  dispatch(type: string, pointerId: number, pointerType: 'mouse' | 'touch') {
    let stopped = false;
    const event = Object.assign(
      {
        type,
        pointerId,
        pointerType,
        button: 0,
        clientX: 10,
        clientY: 10,
        pageX: 10,
        pageY: 10,
        preventDefault() {},
      },
      {
        stopImmediatePropagation() {
          stopped = true;
        },
      },
    ) as PointerEvent;
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (stopped) break;
      try {
        listener(event);
      } catch (error) {
        this.faults.push(error);
      }
    }
  }
}

function exerciseCamera(guarded: boolean) {
  const target = new PointerCanvas();
  const canvas = target as unknown as HTMLCanvasElement;
  let controls: OrbitControls;
  const stageEnds = vi.fn();
  target.addEventListener('pointercancel', stageEnds);
  const remove = guarded
    ? bindMeasurementSurfaceOrbitPointersV1(canvas, () => controls.enabled)
    : undefined;
  controls = new OrbitControls(new PerspectiveCamera(), canvas);
  const starts = vi.fn();
  const ends = vi.fn();
  controls.addEventListener('start', starts);
  controls.addEventListener('end', ends);
  try {
    target.dispatch('pointerdown', 3, 'mouse');
    target.dispatch('pointercancel', 21, 'touch');
    target.dispatch('pointerdown', 3, 'mouse');
    target.dispatch('pointerup', 3, 'mouse');
    target.dispatch('pointerdown', 4, 'mouse');
    target.dispatch('pointerup', 4, 'mouse');
    return {
      faults: target.faults,
      starts: starts.mock.calls.length,
      ends: ends.mock.calls.length,
      stageEnds,
    };
  } finally {
    controls.dispose();
    remove?.();
  }
}

it('keeps the camera gesture after an unrelated cancel and discards duplicate starts', () => {
  expect(String(exerciseCamera(false).faults[0])).toMatch(/reading 'x'/);
  const guarded = exerciseCamera(true);
  expect(guarded.stageEnds).toHaveBeenCalledOnce();
  expect(guarded.faults).toEqual([]);
  expect(guarded.starts).toBe(2);
  expect(guarded.ends).toBe(2);
});
