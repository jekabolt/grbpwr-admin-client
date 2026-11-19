import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { XpbdDeviceLease } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import type { SourceCutPrincipalStrainV1 } from 'lib/cloth/runtime/cpu/source-cut-principal-strain-v1';
import { resolveCadTableSavedReviewSizeV1 } from './cad-table-zero-operation-production-mount-v1';
import type { CadWorkbenchBoundedClothPreviewHostV1 } from './cad-workbench-preview-lifecycle-v1';
import SavedCompleteAssemblyNativePreviewControlsV8 from './saved-complete-assembly-native-preview-controls-v8';
import type { SavedWholeAssemblyPreviewProgressV1 } from './saved-whole-assembly-staged-preview-v1';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  createLifecycle: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('./saved-whole-assembly-staged-preview-v1', () => ({
  runSavedWholeAssemblyStagedPreviewV1: mocks.run,
}));
vi.mock('./cad-workbench-preview-lifecycle-v1', () => ({
  createCadWorkbenchPreviewLifecycleV1: () =>
    mocks.createLifecycle() ?? { start: mocks.start, cancel: mocks.cancel },
}));
vi.mock('components/cloth-simulation-spike/model-displayed-triangle-body-input-v1', () => ({
  projectCurrentModelDisplayedTriangleBodyInputV1: () => ({}),
  subscribeModelDisplayedTriangleBodyInputInvalidationV1: mocks.invalidate,
}));

function mountTestRoot() {
  const noop = () => {};
  const view = { HTMLIFrameElement: class {}, addEventListener: noop, removeEventListener: noop };
  const document = {
    nodeType: 9,
    activeElement: null as Node | null,
    defaultView: view,
    addEventListener: noop,
    removeEventListener: noop,
    createElement: (tag: string) => new Node(tag),
    createTextNode: (value: string) => Object.assign(new Node('#text'), { nodeValue: value }),
  };
  class Node {
    readonly nodeType: number;
    readonly nodeName: string;
    readonly tagName: string;
    readonly ownerDocument = document;
    readonly namespaceURI = 'http://www.w3.org/1999/xhtml';
    readonly attrs = new Map<string, string>();
    readonly listeners = new Map<string, (event: object) => void>();
    readonly style = { setProperty: noop };
    readonly children: Node[] = [];
    parentNode: Node | null = null;
    textContent = '';
    nodeValue = '';

    constructor(tag: string) {
      this.nodeType = tag === '#text' ? 3 : 1;
      this.nodeName = this.tagName = tag.toUpperCase();
    }

    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    }
    removeAttribute(name: string) {
      this.attrs.delete(name);
    }
    addEventListener(name: string, listener: (event: object) => void, capture: boolean) {
      this.listeners.set(name + '/' + capture, listener);
    }
    removeEventListener() {}
    appendChild(child: Node) {
      this.insertBefore(child, null);
    }
    insertBefore(child: Node, before: Node | null) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
    }
    removeChild(child: Node) {
      this.children.splice(this.children.indexOf(child), 1);
      child.parentNode = null;
    }
    text(): string {
      return (
        this.nodeValue || this.textContent + this.children.map((child) => child.text()).join('')
      );
    }
    find(query: (node: Node) => boolean): Node | undefined {
      if (query(this)) return this;
      for (const child of this.children) {
        const found = child.find(query);
        if (found) return found;
      }
    }
  }

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', { ...view, document });
  vi.stubGlobal('document', document);
  const host = new Node('main');
  const button = (title: string) =>
    host.find((node) => node.tagName === 'BUTTON' && node.text() === title);
  return {
    root: createRoot(host as unknown as HTMLElement),
    button,
    click(title: string) {
      const target = button(title);
      if (!target) throw new Error(`Missing mounted button ${title}.`);
      document.activeElement = target;
      host.listeners.get('click/false')?.({ target, type: 'click', button: 0 });
    },
    focused: () => document.activeElement,
    element: (attribute: string) => host.find((node) => node.attrs.has(attribute)),
    text: () => host.text(),
  };
}

function frame(number: number, isCurrent: () => boolean) {
  const read = vi.fn<(signal: AbortSignal) => Promise<SourceCutPrincipalStrainV1 | null>>();
  const measureSurfaceTape = vi.fn<SavedWholeAssemblyPreviewProgressV1['measureSurfaceTape']>();
  const progress: SavedWholeAssemblyPreviewProgressV1 = {
    cloth: {
      positionsM: Float32Array.of(number, 0, 0, number, 1, 0, number, 0, 1),
      frameNumber: number,
      ranges: [{ triangleOffset: 0, triangleCount: 1, color: 0x305070 }],
      isCurrent,
    },
    readPrincipalStrain: read,
    measureSurfaceTape,
    action: 'activate',
    activeSeams: [],
    contact: {
      passed: true,
      bodyIntersections: 0,
      clothIntersections: 0,
      bodyPairsWithoutClearance: 0,
    },
    drawWinding: {
      triangleCount: 1,
      comparedTriangleCount: 1,
      oppositeTriangleCount: 0,
      indeterminateTriangleCount: 0,
    },
    maximumGapMm: 0,
    rmsGapMm: null,
    maximumGapOperationNumber: null,
    totalStages: 2,
    frameWork: {},
  };
  return { progress, read, measureSurfaceTape };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('toggles the current ordinary whole frame, ignores late readings and keeps the focused control', async () => {
  const page = mountTestRoot();
  type Props = ComponentProps<typeof SavedCompleteAssemblyNativePreviewControlsV8>;
  let bodyCurrent = true;
  const body = { isCurrent: () => bodyCurrent } as NonNullable<Props['body']>;
  const review = {
    wholeAssembly: { load: async () => ({}) },
  } as unknown as Props['review'];
  let invalidate: () => void;
  mocks.invalidate.mockImplementation((_body, callback: () => void) => {
    invalidate = callback;
  });
  const first = frame(1, body.isCurrent);
  const second = frame(2, body.isCurrent);
  const late = Promise.withResolvers<SourceCutPrincipalStrainV1>();
  const current = Promise.withResolvers<SourceCutPrincipalStrainV1>();
  const available = {
    valuesInDrawOrder: Float32Array.of(0.8),
    summary: { minimum: 0.8, maximum: 0.8, triangleCount: 1, carrierFaceCount: 1 },
  };
  first.read.mockReturnValue(late.promise);
  second.read
    .mockReturnValueOnce(current.promise)
    .mockRejectedValueOnce(new Error('No exact mapping'));

  let accept!: (progress: SavedWholeAssemblyPreviewProgressV1) => void;
  const run = Promise.withResolvers<SavedWholeAssemblyPreviewProgressV1>();
  mocks.run.mockImplementation(({ onAccepted }) => {
    accept = onAccepted;
    accept(first.progress);
    return run.promise;
  });
  mocks.start.mockImplementation((host: CadWorkbenchBoundedClothPreviewHostV1) =>
    host.runBounded({} as Parameters<typeof host.runBounded>[0], new AbortController().signal),
  );
  let rendered: MeasurementSurfaceAcceptedClothV1 | undefined;
  const onAcceptedCloth = (cloth: MeasurementSurfaceAcceptedClothV1 | undefined) => {
    rendered = cloth;
  };
  const button = () => page.element('data-whole-assembly-strain-toggle');
  const legend = () => page.element('data-whole-assembly-strain-frame');

  try {
    await act(async () =>
      page.root.render(
        createElement(SavedCompleteAssemblyNativePreviewControlsV8, {
          review,
          body,
          disabled: false,
          onAcceptedCloth,
        }),
      ),
    );
    expect(button()).toBeUndefined();
    await act(async () => page.click('Preview full layout'));
    expect(rendered).toBe(first.progress.cloth);
    expect(first.read).not.toHaveBeenCalled();
    await act(async () => page.click('Principal strain'));
    const toggle = button();
    expect(toggle?.attrs.get('aria-pressed')).toBe('true');
    expect(page.focused()).toBe(toggle);
    expect(first.read).toHaveBeenCalledTimes(1);
    expect(legend()).toBeUndefined();

    await act(async () => accept(second.progress));
    expect(first.read.mock.calls[0][0].aborted).toBe(true);
    expect(rendered).toBe(second.progress.cloth);
    await act(async () => current.resolve(available));
    expect(rendered?.positionsM).toBe(second.progress.cloth.positionsM);
    expect(rendered?.principalStrain?.valuesInDrawOrder).toBe(available.valuesInDrawOrder);
    expect(legend()?.attrs.get('data-whole-assembly-strain-frame')).toBe('2');
    expect(page.text()).toContain('Measured range +80% to +80%');
    expect(button()).toBe(toggle);
    expect(page.focused()).toBe(toggle);
    const strainOverlay = rendered?.principalStrain;
    await act(async () => page.click('Show backside'));
    expect(rendered?.principalStrain).toBe(strainOverlay);
    await act(async () => page.click('Show backside'));
    expect(rendered?.principalStrain).toBe(strainOverlay);
    expect(second.read).toHaveBeenCalledTimes(1);
    await act(async () => late.resolve(available));
    expect(rendered?.frameNumber).toBe(2);
    await act(async () => run.resolve(second.progress));

    await act(async () => page.click('Principal strain'));
    expect(rendered).toBe(second.progress.cloth);
    expect(legend()).toBeUndefined();
    expect(button()).toBe(toggle);
    expect(toggle?.attrs.get('aria-pressed')).toBe('false');
    await act(async () => page.click('Principal strain'));
    expect(page.text()).toContain('Principal strain is unavailable for this accepted frame.');
    expect(rendered).toBe(second.progress.cloth);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(page.focused()).toBe(toggle);

    await act(async () => {
      bodyCurrent = false;
      invalidate();
    });
    expect(rendered).toBeUndefined();
    expect(button()).toBeUndefined();
    expect(legend()).toBeUndefined();
  } finally {
    await act(async () => page.root.unmount());
  }
});

it('keeps the displayed frame and tape point owner through backside toggles, then cancels on mannequin change', async () => {
  const page = mountTestRoot();
  type Props = ComponentProps<typeof SavedCompleteAssemblyNativePreviewControlsV8>;
  let bodyCurrent = true;
  const body = { isCurrent: () => bodyCurrent } as NonNullable<Props['body']>;
  const review = { wholeAssembly: { load: async () => ({}) } } as unknown as Props['review'];
  const frameOne = frame(1, body.isCurrent);
  let invalidate!: () => void;
  let rendered: MeasurementSurfaceAcceptedClothV1 | undefined;
  const onAcceptedCloth: Props['onAcceptedCloth'] = (cloth) => {
    rendered = cloth;
  };
  mocks.invalidate.mockImplementation((_body, callback: () => void) => {
    invalidate = callback;
  });
  mocks.run.mockImplementation(async ({ onAccepted }) => {
    onAccepted(frameOne.progress);
    return frameOne.progress;
  });
  mocks.start.mockImplementation((host: CadWorkbenchBoundedClothPreviewHostV1) =>
    host.runBounded({} as Parameters<typeof host.runBounded>[0], new AbortController().signal),
  );
  const first = { triangleIndex: 0, barycentric: [0.5, 0.25, 0.25] as const };
  const second = { triangleIndex: 0, barycentric: [0.25, 0.5, 0.25] as const };
  const late = Promise.withResolvers<number>();
  frameOne.measureSurfaceTape.mockResolvedValueOnce(0.5154).mockReturnValueOnce(late.promise);
  const backside = () => page.element('data-whole-assembly-backside-toggle');

  try {
    await act(async () =>
      page.root.render(
        createElement(SavedCompleteAssemblyNativePreviewControlsV8, {
          review,
          body,
          disabled: false,
          onAcceptedCloth,
        }),
      ),
    );
    expect(page.element('data-whole-assembly-tape-toggle')).toBeUndefined();
    expect(backside()).toBeUndefined();
    await act(async () => page.click('Preview full layout'));
    expect(backside()?.attrs.get('aria-pressed')).toBe('true');
    expect(rendered).toBe(frameOne.progress.cloth);
    await act(async () => page.click('Surface tape'));
    const pick = rendered?.onMeasurePoint;
    expect(pick).toBeDefined();
    expect(rendered?.positionsM).toBe(frameOne.progress.cloth.positionsM);
    await act(async () => pick?.(first));
    expect(page.text()).toContain('Pick a second point on the same piece.');
    const frameStatus = page.element('data-whole-assembly-frame');
    const cancelCount = mocks.cancel.mock.calls.length;
    await act(async () => page.click('Show backside'));
    expect(backside()?.attrs.get('aria-pressed')).toBe('false');
    expect(page.focused()).toBe(backside());
    expect(rendered).toMatchObject({ frameNumber: 1, showBackside: false });
    expect(rendered?.positionsM).toBe(frameOne.progress.cloth.positionsM);
    expect(rendered?.ranges).toBe(frameOne.progress.cloth.ranges);
    expect(rendered?.isCurrent).toBe(frameOne.progress.cloth.isCurrent);
    expect(rendered?.onMeasurePoint).toBe(pick);
    expect(frameStatus?.attrs.get('data-whole-assembly-contact')).toBe(
      JSON.stringify(frameOne.progress.contact),
    );
    expect(page.element('data-whole-assembly-frame')).toBe(frameStatus);
    expect(page.text()).toContain('Pick a second point on the same piece.');
    await act(async () => page.click('Show backside'));
    expect(backside()?.attrs.get('aria-pressed')).toBe('true');
    expect(rendered?.showBackside).toBeUndefined();
    expect(rendered?.onMeasurePoint).toBe(pick);
    expect(mocks.cancel).toHaveBeenCalledTimes(cancelCount);
    await act(async () => pick?.(second));
    expect(frameOne.measureSurfaceTape).toHaveBeenCalledWith(
      first,
      second,
      expect.any(AbortSignal),
    );
    expect(page.text()).toContain('Surface distance · 515.4 mm');

    await act(async () => {
      pick?.(first);
      pick?.(second);
    });
    expect(page.text()).toContain('Measuring surface path…');
    await act(async () => {
      bodyCurrent = false;
      invalidate();
    });
    expect(frameOne.measureSurfaceTape.mock.calls[1][2].aborted).toBe(true);
    await act(async () => late.resolve(1.23));
    expect(rendered).toBeUndefined();
    expect(backside()).toBeUndefined();
    expect(page.element('data-whole-assembly-tape')).toBeUndefined();
    expect(mocks.start).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => page.root.unmount());
  }
});

it('resumes on a fresh lease and permanently retires the accepted source when Pattern set size is changed and restored', async () => {
  const { createCadWorkbenchPreviewLifecycleV1 } = await vi.importActual<
    typeof import('./cad-workbench-preview-lifecycle-v1')
  >('./cad-workbench-preview-lifecycle-v1');
  const page = mountTestRoot();
  function device() {
    const release = vi.fn();
    const drain = vi.fn(async () => {});
    const lease = {
      release,
      device: { queue: { onSubmittedWorkDone: drain } },
    } as unknown as XpbdDeviceLease;
    const dispose = vi.fn(async () => ({
      contextUnconfigured: true as const,
      deviceDestroyed: true as const,
      releasedLeaseCount: 1,
    }));
    return { acquireExclusive: () => lease, dispose, drain, release, lease };
  }
  const firstDevice = device();
  const nextDevice = device();
  const openDevice = vi
    .fn<() => Promise<ReturnType<typeof device>>>()
    .mockResolvedValueOnce(firstDevice)
    .mockResolvedValueOnce(nextDevice);
  mocks.createLifecycle.mockReturnValueOnce(createCadWorkbenchPreviewLifecycleV1(openDevice));

  type Props = ComponentProps<typeof SavedCompleteAssemblyNativePreviewControlsV8>;
  const body = { isCurrent: () => true } as NonNullable<Props['body']>;
  const m = { sizeId: 58, sizeToken: 'M', label: 'm_32bo_m', rank: 2 };
  const l = { sizeId: 59, sizeToken: 'L', label: 'l_34bo_m', rank: 3 };
  const patternSize: Props['review']['patternSize'] = {
    row: {
      techCardId: 2,
      scopeKey: 'main',
      patternLineKey: '01M5HJEQ163VWKDHWH5Y2XV5H6',
      revision: 2,
      cardLockVersion: 6,
      url: 'https://cdn.roundtrip.test/tech-card-patterns/20261118225736744e4db.dxf',
      sizeBytes: 1_178_320,
      sha256: '7768166262f2cb48ccb505756ae426b4b9e0ae965f5082329999e0f7945abd2d',
    },
    operationNumber: 170,
    sizeId: m.sizeId,
    sizeToken: m.sizeToken,
  };
  const review: Props['review'] = {
    cardId: patternSize.row.techCardId,
    lockVersion: patternSize.row.cardLockVersion,
    operationNumber: patternSize.operationNumber,
    sha256: 'f31c7f64fbd4027d8da69e69ac1228a4b91afd30e8b71a5671d59147327927c9',
    patternSize,
    load: vi.fn(),
    verify: vi.fn(),
    wholeAssembly: { load: vi.fn().mockResolvedValue({}), prepare: vi.fn() },
  };
  // First native cut draw face reprojected from the accepted Card11/M frame 1 and 29 downloads
  // (SHA 285eb194…d49 and 62a4dad9…fd5) with the same pinned runtime candidate 128cb777…bb1.
  const f1 = Float32Array.of(
    0.21822403371334076,
    0.8139187693595886,
    0.024524759501218796,
    0.21816596388816833,
    0.8137776255607605,
    0.024577345699071884,
    0.2181069552898407,
    0.8136361241340637,
    0.024625858291983604,
  );
  const f29 = Float32Array.of(
    0.21838906407356262,
    0.813962996006012,
    0.024578187614679337,
    0.21833117306232452,
    0.8138214349746704,
    0.024631060659885406,
    0.21827232837677002,
    0.8136796355247498,
    0.024679867550730705,
  );
  const pausedOne = { lastAcceptedFrame: 1 };
  const pausedNext = { lastAcceptedFrame: 29 };
  const releaseFirstPause = Promise.withResolvers<void>();
  const releaseNextPause = Promise.withResolvers<void>();
  const strain = Promise.withResolvers<SourceCutPrincipalStrainV1 | null>();
  const readStrain = vi.fn<(signal: AbortSignal) => Promise<SourceCutPrincipalStrainV1 | null>>(
    () => strain.promise,
  );
  let accepted: MeasurementSurfaceAcceptedClothV1 | undefined;
  const onAcceptedCloth: Props['onAcceptedCloth'] = (value) => {
    accepted = value;
  };
  type Run =
    typeof import('./saved-whole-assembly-staged-preview-v1').runSavedWholeAssemblyStagedPreviewV1;
  function replay(
    paused: typeof pausedOne,
    positionsM: Float32Array,
    pauseBoundary: Promise<void>,
  ): Run {
    return async ({ onAccepted, isCurrent, pauseAfterAccepted }) => {
      const { progress } = frame(paused.lastAcceptedFrame, isCurrent);
      const exact = {
        ...progress,
        cloth: { ...progress.cloth, positionsM },
        readPrincipalStrain: readStrain,
      };
      onAccepted(exact);
      await pauseBoundary;
      if (!pauseAfterAccepted?.()) throw new Error('The operator must request pause.');
      return { ...exact, paused };
    };
  }
  mocks.run
    .mockImplementationOnce(replay(pausedOne, f1, releaseFirstPause.promise))
    .mockImplementationOnce(replay(pausedNext, f29, releaseNextPause.promise));

  const selectSize = (sizeId: number) => {
    const choice = { sizeId, review: patternSize };
    const { matchesReview } = resolveCadTableSavedReviewSizeV1([m, l], choice, patternSize);
    return act(async () =>
      page.root.render(
        createElement(SavedCompleteAssemblyNativePreviewControlsV8, {
          review,
          body,
          disabled: !matchesReview,
          onAcceptedCloth,
        }),
      ),
    );
  };
  const frameStatus = () => page.element('data-whole-assembly-frame');

  try {
    await selectSize(m.sizeId);
    await act(async () => page.click('Preview full layout'));
    const first = accepted;
    const retainedStatus = frameStatus();
    const [[initialRun, runSignal]] = mocks.run.mock.calls as Parameters<Run>[];
    expect(initialRun.ownedLease).toBe(firstDevice.lease);
    expect(initialRun.resume).toBeUndefined();
    expect(first?.positionsM).toBe(f1);
    expect(retainedStatus?.attrs.get('data-whole-assembly-frame')).toBe('1');
    await act(async () => page.click('Pause after frame'));
    await act(async () => releaseFirstPause.resolve());
    expect(page.text()).toContain('Paused after accepted frame 1.');
    expect(firstDevice.drain).toHaveBeenCalledOnce();
    expect(firstDevice.release).toHaveBeenCalledOnce();
    expect(firstDevice.dispose).toHaveBeenCalledOnce();
    expect(runSignal.aborted).toBe(false);
    expect(first?.isCurrent()).toBe(true);

    await selectSize(m.sizeId);
    expect(accepted).toBe(first);
    expect(frameStatus()).toBe(retainedStatus);
    expect(page.text()).toContain('Resume full layout');

    await act(async () => page.click('Resume full layout'));
    const [, [nextRun, nextSignal]] = mocks.run.mock.calls as Parameters<Run>[];
    const resumed = accepted;
    expect(nextRun.resume).toBe(pausedOne);
    expect(nextRun.ownedLease).toBe(nextDevice.lease);
    expect(nextSignal).toBe(runSignal);
    expect(nextSignal.aborted).toBe(false);
    expect(resumed?.positionsM).toBe(f29);
    expect(frameStatus()?.attrs.get('data-whole-assembly-frame')).toBe('29');
    await act(async () => page.click('Pause after frame'));
    await act(async () => releaseNextPause.resolve());
    expect(page.text()).toContain('Paused after accepted frame 29.');
    expect(nextDevice.drain).toHaveBeenCalledOnce();
    expect(nextDevice.release).toHaveBeenCalledOnce();
    expect(nextDevice.dispose).toHaveBeenCalledOnce();
    expect(resumed?.isCurrent()).toBe(true);
    await act(async () => page.click('Principal strain'));
    const [[strainSignal]] = readStrain.mock.calls;
    expect(strainSignal.aborted).toBe(false);

    await selectSize(l.sizeId);
    expect(body.isCurrent()).toBe(true);
    expect(runSignal.aborted).toBe(true);
    expect(resumed?.isCurrent()).toBe(false);
    expect(strainSignal.aborted).toBe(true);
    expect(accepted).toBeUndefined();
    expect(frameStatus()).toBeUndefined();
    expect(page.text()).not.toContain('Resume full layout');
    expect(page.button('Step one frame')?.attrs.get('disabled')).toBe('');

    await selectSize(m.sizeId);
    await act(async () =>
      strain.resolve({
        valuesInDrawOrder: Float32Array.of(0.1),
        summary: { minimum: 0.1, maximum: 0.1, triangleCount: 1, carrierFaceCount: 1 },
      }),
    );
    expect(accepted).toBeUndefined();
    expect(frameStatus()).toBeUndefined();
    expect(page.element('data-whole-assembly-strain-frame')).toBeUndefined();
    expect(page.button('Step one frame')?.attrs.has('disabled')).toBe(false);
    expect(page.text()).not.toContain('Resume full layout');
    expect(first?.isCurrent()).toBe(false);
    expect(resumed?.isCurrent()).toBe(false);
    expect(openDevice).toHaveBeenCalledTimes(2);
    expect(mocks.run).toHaveBeenCalledTimes(2);
    for (const current of [firstDevice, nextDevice]) {
      expect(current.release).toHaveBeenCalledOnce();
      expect(current.dispose).toHaveBeenCalledOnce();
    }
  } finally {
    releaseFirstPause.resolve();
    releaseNextPause.resolve();
    strain.resolve(null);
    await act(async () => page.root.unmount());
  }
});
