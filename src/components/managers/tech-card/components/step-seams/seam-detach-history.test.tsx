import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useForm, type UseFormReturn } from 'react-hook-form';

import type { CutStrip } from '../cut-strip-editor/use-cut-strip';
import type { TechCardFormData } from '../schema';
import {
  useTechCardUndoHistory,
  type UndoHistoryApi,
  type UndoHistoryCaptureProps,
} from '../undo-history';
import type { AutosaveController } from '../useTechCardAutosave';
import { finishStepSeamDetach } from './seam-detach-finish';

// U1 #1 with the REAL card history and react-hook-form: a seam removed in the step panel that the
// server deletes must not come back on a binding strip through the card's UNDO.

class FakeElement {
  dataset: Record<string, string> = {};
  closest() {
    return null;
  }
  getAttribute() {
    return null;
  }
}

const g = globalThis as Record<string, unknown>;
const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.HTMLElement ??= FakeElement;
  g.HTMLInputElement ??= class extends FakeElement {};
  g.HTMLTextAreaElement ??= class extends FakeElement {};
  g.window ??= Object.assign(globalThis, listeners);
});

type Op = {
  historyKey: string;
  operationNumber: number;
  work: string;
  inputKeys: string[];
  bomLineKeys: string[];
  seamKeys: string[];
};
type Form = { name: string; operations: Op[]; cutStrips: CutStrip[] };

const strip = (seamKey: string): CutStrip =>
  ({
    lineKey: 'strip-a',
    bomLineKey: 'bias',
    placement: '__binding__',
    lengthMode: 'from_seam',
    seamKey,
    sizes: [],
  }) as unknown as CutStrip;

const autosave = {
  status: 'idle',
  whenSettled: async () => undefined,
  request: () => undefined,
  holdWrites: () => () => undefined,
  flush: async () => 'ok',
} as unknown as AutosaveController;

const latest: {
  api?: UndoHistoryApi;
  capture?: UndoHistoryCaptureProps;
  form?: UseFormReturn<Form>;
} = {};

function Harness() {
  const form = useForm<Form>({
    defaultValues: {
      name: 'card',
      operations: [
        {
          historyKey: 'h1',
          operationNumber: 10,
          work: 'bind_tape_edge',
          inputKeys: ['strip-a'],
          bomLineKeys: ['bias'],
          seamKeys: ['s-a'],
        },
      ],
      cutStrips: [strip('s-a')],
    },
  });
  const { api, captureProps } = useTechCardUndoHistory({
    enabled: true,
    form: form as unknown as UseFormReturn<TechCardFormData>,
    autosave,
  });
  latest.api = api;
  latest.capture = captureProps;
  latest.form = form;
  return null;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const outside = () => ({ nativeEvent: { isTrusted: true }, target: new FakeElement() }) as never;
const clickOutside = () => {
  latest.capture!.onPointerDownCapture(outside());
  latest.capture!.onPointerUpCapture(outside());
  latest.capture!.onClickCapture(outside());
};

let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  const view = { document: { activeElement: null }, HTMLIFrameElement: class {} };
  const doc = { nodeType: 9, defaultView: view, ...listeners };
  const container = {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc,
    ...listeners,
  };
  root = createRoot(container as never);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe('U1 #1: a seam the server deleted from the panel', () => {
  it('cuts the card history: a card UNDO cannot put the wiped seam back on the strip', async () => {
    const form = latest.form!;
    // A user gesture earlier: the strip moved from s-a to s-b; the entry remembers s-a.
    await act(async () => {
      clickOutside();
      form.setValue('cutStrips.0.seamKey' as never, 's-b' as never, { shouldDirty: true });
      await tick();
    });
    expect(latest.api!.canUndo).toBe(true);
    // The panel's removal answered: the server deleted s-a (its last link).
    await act(async () => {
      finishStepSeamDetach(
        {
          operation: (at) => form.getValues(`operations.${at}`),
          strips: () => form.getValues('cutStrips'),
          setSeamKeys: (at, keys) => form.setValue(`operations.${at}.seamKeys`, keys),
          setStrips: (strips) => form.setValue('cutStrips', strips),
          setInputs: (at, inputKeys, bomLineKeys) => {
            form.setValue(`operations.${at}.inputKeys`, inputKeys);
            form.setValue(`operations.${at}.bomLineKeys`, bomLineKeys);
          },
          cutHistory: () => latest.api!.cut('seam-delete'),
        },
        0,
        's-a',
        ['s-a'],
      );
      await tick();
    });
    expect(form.getValues('cutStrips').map((s) => s.seamKey)).toEqual(['s-b']);
    expect(form.getValues('operations.0.seamKeys')).toEqual([]);
    await act(async () => {
      await latest.api!.undo();
      await tick();
    });
    const keys = form.getValues('cutStrips').map((s) => s.seamKey);
    expect(keys).not.toContain('s-a');
    expect(latest.api!.canUndo).toBe(false);
  });
});
