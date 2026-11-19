import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import type { SourceCutPrincipalStrainV1 } from 'lib/cloth/runtime/cpu/source-cut-principal-strain-v1';
import type { CadWorkbenchBoundedClothPreviewHostV1 } from './cad-workbench-preview-lifecycle-v1';
import SavedCompleteAssemblyNativePreviewControlsV8 from './saved-complete-assembly-native-preview-controls-v8';
import type { SavedWholeAssemblyPreviewProgressV1 } from './saved-whole-assembly-staged-preview-v1';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('./saved-whole-assembly-staged-preview-v1', () => ({
  runSavedWholeAssemblyStagedPreviewV1: mocks.run,
}));
vi.mock('./cad-workbench-preview-lifecycle-v1', () => ({
  createCadWorkbenchPreviewLifecycleV1: () => ({ start: mocks.start, cancel: mocks.cancel }),
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
  return {
    root: createRoot(host as unknown as HTMLElement),
    click(title: string) {
      const target = host.find((node) => node.tagName === 'BUTTON' && node.text() === title);
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
  const progress: SavedWholeAssemblyPreviewProgressV1 = {
    cloth: {
      positionsM: Float32Array.of(number, 0, 0, number, 1, 0, number, 0, 1),
      frameNumber: number,
      ranges: [{ triangleOffset: 0, triangleCount: 1, color: 0x305070 }],
      isCurrent,
    },
    readPrincipalStrain: read,
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
  return { progress, read };
}

afterEach(() => vi.unstubAllGlobals());

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
