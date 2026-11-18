import { act, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  useCadWorkbenchRetainMannequinPreviewV1,
} from './cad-workbench-split-shell-v1';

function installChromeRoot(initialWidth: number) {
  let width = initialWidth;
  let resize: (() => void) | undefined;
  const noOp = () => {};
  const view = { HTMLIFrameElement: class {}, addEventListener: noOp, removeEventListener: noOp };
  const document = {
    nodeType: 9,
    activeElement: null,
    defaultView: view,
    addEventListener: noOp,
    removeEventListener: noOp,
    createElement: (tag: string) => new Element(tag),
    createTextNode: (value: string) => Object.assign(new Element('#text'), { nodeValue: value }),
  };

  class Element {
    readonly nodeType: number;
    readonly nodeName: string;
    readonly tagName: string;
    readonly namespaceURI = 'http://www.w3.org/1999/xhtml';
    readonly ownerDocument = document;
    readonly children: Element[] = [];
    readonly attributes = new Map<string, string>();
    readonly listeners = new Map<string, (event: object) => void>();
    readonly style = { setProperty: noOp };
    parentNode: Element | null = null;
    textContent = '';

    constructor(tag: string) {
      this.nodeType = tag === '#text' ? 3 : 1;
      this.nodeName = this.tagName = tag.toUpperCase();
    }

    get clientWidth() {
      return width;
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
    }

    addEventListener(name: string, listener: (event: object) => void, capture: boolean) {
      this.listeners.set(name + '/' + capture, listener);
    }

    removeEventListener() {}

    appendChild(child: Element) {
      this.insertBefore(child, null);
    }

    insertBefore(child: Element, before: Element | null) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      const index = before === null ? this.children.length : this.children.indexOf(before);
      this.children.splice(index, 0, child);
    }

    removeChild(child: Element) {
      this.children.splice(this.children.indexOf(child), 1);
      child.parentNode = null;
    }

    find(predicate: (node: Element) => boolean): Element | undefined {
      if (predicate(this)) return this;
      for (const child of this.children) {
        const match = child.find(predicate);
        if (match) return match;
      }
    }
  }

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', { ...view, document });
  vi.stubGlobal('document', document);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {
        resize = undefined;
      }
    },
  );

  const container = new Element('main');
  const root = createRoot(container as unknown as HTMLElement);
  return {
    root,
    resize(nextWidth: number) {
      width = nextWidth;
      resize?.();
    },
    slot(attribute: string) {
      return container.find((node) => node.attributes.has(attribute));
    },
    canvas() {
      return container.find((node) => node.tagName === 'CANVAS');
    },
    clickButton(title: string) {
      const target = container.find(
        (node) => node.tagName === 'BUTTON' && node.textContent === title,
      );
      if (!target) throw new Error('Expected button was not mounted.');
      container.listeners.get('click/false')?.({ target, type: 'click', button: 0 });
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('preview retention in compact Workbench', () => {
  it('keeps the actual mounted canvas across automatic resize and unmounts it on explicit 2D', async () => {
    const chrome = installChromeRoot(1280);
    const mounted = vi.fn();
    const stopped = vi.fn();
    function Mannequin() {
      const [current, setCurrent] = useState(false);
      const retain = useCadWorkbenchRetainMannequinPreviewV1(current);
      useLayoutEffect(() => {
        mounted();
        return () => stopped();
      }, []);
      return (
        <>
          <button
            type='button'
            onClick={() => {
              retain(true);
              setCurrent(true);
            }}
          >
            Start preview
          </button>
          <canvas />
        </>
      );
    }
    const workbench = (
      <PatternImportDxfPhaseECadWorkbenchSplitShellV1
        desktop={<div>Desktop</div>}
        mannequin={<Mannequin />}
        operationsPanel={null}
      />
    );
    try {
      await act(async () => chrome.root.render(workbench));
      const canvas = chrome.canvas();
      const mannequin = chrome.slot('data-cad-mannequin-zone');
      expect(canvas && mannequin).toBeDefined();
      expect(mounted).toHaveBeenCalledOnce();

      await act(async () => {
        chrome.clickButton('Start preview');
        chrome.resize(319);
      });
      expect(chrome.slot('data-cad-desktop-zone')).toBeUndefined();
      expect(chrome.slot('data-cad-mannequin-zone')).toBe(mannequin);
      expect(chrome.canvas()).toBe(canvas);
      expect(stopped).not.toHaveBeenCalled();

      await act(async () => chrome.resize(1280));
      expect(chrome.slot('data-cad-desktop-zone')).toBeDefined();
      expect(chrome.canvas()).toBe(canvas);
      expect(mounted).toHaveBeenCalledOnce();

      await act(async () => chrome.resize(319));
      await act(async () => chrome.clickButton('2D table'));
      expect(chrome.slot('data-cad-desktop-zone')).toBeDefined();
      expect(chrome.canvas()).toBeUndefined();
      expect(stopped).toHaveBeenCalledOnce();
    } finally {
      await act(async () => chrome.root.unmount());
    }
  });

  it('keeps the compact default at 2D with no active preview', async () => {
    const chrome = installChromeRoot(319);
    try {
      await act(async () =>
        chrome.root.render(
          <PatternImportDxfPhaseECadWorkbenchSplitShellV1
            desktop={<div>Desktop</div>}
            mannequin={<canvas />}
            operationsPanel={null}
          />,
        ),
      );
      expect(chrome.slot('data-cad-desktop-zone')).toBeDefined();
      expect(chrome.canvas()).toBeUndefined();
    } finally {
      await act(async () => chrome.root.unmount());
    }
  });
});
