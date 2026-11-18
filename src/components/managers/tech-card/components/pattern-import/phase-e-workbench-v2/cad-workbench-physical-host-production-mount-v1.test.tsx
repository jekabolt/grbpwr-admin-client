import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  return {
    text,
    tree: ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX),
  };
}

function nodes<T extends ts.Node>(tree: ts.SourceFile, guard: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (guard(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

function elements(tree: ts.SourceFile, name: string): ts.JsxOpeningLikeElement[] {
  return nodes(
    tree,
    (node): node is ts.JsxOpeningLikeElement =>
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
  ).filter((node) => node.tagName.getText(tree) === name);
}

function jsxAttribute(tree: ts.SourceFile, node: ts.JsxOpeningLikeElement, name: string) {
  return node.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute =>
      ts.isJsxAttribute(candidate) && candidate.name.getText(tree) === name,
  )?.initializer;
}

function attribute(tree: ts.SourceFile, node: ts.JsxOpeningLikeElement, name: string) {
  const value = jsxAttribute(tree, node, name);
  return value && ts.isJsxExpression(value) ? value.expression?.getText(tree) ?? null : null;
}

function classes(tree: ts.SourceFile, element: ts.JsxOpeningElement) {
  const value = jsxAttribute(tree, element, 'className');
  return value && ts.isStringLiteral(value) ? value.text.split(/\s+/) : [];
}

describe('physical host production receivers', () => {
  it('keeps one borrowed host and its compact preview inside both mannequin viewports', () => {
    const entry = source('./assembly-order-entry.tsx');
    const pickers = elements(entry.tree, 'PatternImportDxfPhaseECadMannequinModelPickerV1');

    expect(pickers).toHaveLength(2);
    for (const picker of pickers)
      expect(attribute(entry.tree, picker, 'onDisplayedBodyInputV1')).toBe(
        'physicalHost?.onDisplayedBodyInputV1',
      );
    expect(entry.text.match(/physicalHost\?\.viewport \?/gu)).toHaveLength(2);
    expect(entry.text.match(/\{physicalHost\.viewport\(/gu)).toHaveLength(2);
    expect(entry.text).not.toContain('physicalHost?.panel ?');
    expect(elements(entry.tree, 'CadWorkbenchPhysicalHostPanelV1')).toHaveLength(2);
  });

  it('mounts compact preview/placement controls and a cloth canvas over the base model', () => {
    const mount = source('./cad-workbench-physical-host-production-mount-v1.tsx');
    const controls = source('./cad-workbench-physical-host-controls-v1.tsx');
    const panel = source('./cad-workbench-physical-host-panel-v1.tsx');

    expect(elements(mount.tree, 'CadWorkbenchPhysicalHostControlsV1')).toHaveLength(1);
    expect(controls.text).toContain("'Preview'");
    expect(controls.text).toContain('Retry');
    expect(controls.text).toContain('Place pieces on mannequin.');
    expect(controls.text).toContain('CadWorkbenchFirstPhysicalAuthoringV1');
    expect(controls.text).toContain("data-cad-physical-host-viewport=''");
    expect(controls.text).not.toContain('Canonical reference mannequin');
    expect(controls.text).not.toContain('Choose a mannequin profile');
    expect(panel.text).toContain("className='pointer-events-none absolute inset-0");
    expect(panel.text).not.toContain('max-h-[50%]');
    expect(panel.text).not.toContain('overflow-y-auto');
  });

  it('keeps the last complete-layout frame visible when contact diagnostics are long', () => {
    const controls = source('./saved-complete-assembly-native-preview-controls-v8.tsx');
    const [details, ...otherDetails] = elements(controls.tree, 'details');

    expect(otherDetails).toHaveLength(0);
    expect(details).toBeDefined();
    expect(jsxAttribute(controls.tree, details!, 'open')).toBeUndefined();
    expect(details!.parent.getText(controls.tree)).toContain('wholeProgress.stopped.detail');
    expect(details!.parent.getText(controls.tree)).toContain('max-h-32 overflow-auto');

    const refusal = elements(controls.tree, 'Text').find((element) =>
      element.parent.getText(controls.tree).includes('refused. Showing the last accepted'),
    );
    expect(refusal).toBeDefined();
    expect(jsxAttribute(controls.tree, refusal!, 'role')?.getText(controls.tree)).toBe("'alert'");
    expect(refusal!.parent.getText(controls.tree)).not.toContain('wholeProgress.stopped.detail');
  });

  it('keeps first authoring focused on exact edges, profile and placements', () => {
    const authoring = source('./cad-workbench-first-physical-authoring-v1.tsx');

    expect(authoring.text).toContain("aria-label='Diagnostic preview profile'");
    expect(authoring.text).toContain('restored exact edges');
    expect(authoring.text).toContain('pivot contour');
    expect(authoring.text).not.toContain('Mesh policy ID');
    expect(authoring.text).not.toContain('Solver iterations');
    expect(authoring.text).not.toContain('Calibration/provenance ID');
    expect(authoring.text).not.toContain('Operation {operationNumber} ID');
  });

  it('reports verified persistence directly instead of a removed legacy downstream failure', () => {
    const entry = source('./assembly-order-entry.tsx');
    const hook = source('./use-saved-cloth-physical-host-v1.ts');
    const submit = nodes(entry.tree, ts.isFunctionDeclaration).find(
      (node) => node.name?.text === 'submitPatternImportDxfPhaseEMultiseamSavedChoicesV2',
    );
    expect(submit).toBeDefined();
    const body = submit!.getText(entry.tree);
    expect(body).toContain('return persisted;');
    expect(body).not.toContain('savedSession.downstream');
    expect(body).not.toContain('savedDownstreamBlocked');
    expect(body).not.toContain('consumeConfirmedCompilerSource');
    expect(hook.text).not.toContain('SavedObservedPhysicalHostV1');
    expect(hook.text).not.toContain('createSavedObservedPhysicalHostV1');
  });

  it('docks the borrowed controls above the zero-operation mannequin and forwards the accepted cloth', () => {
    const zero = source('./cad-table-zero-operation-production-mount-v1.tsx');
    const hosts = elements(zero.tree, 'PatternImportDxfPhaseECadTableZeroOperationHostV1');
    const pickers = elements(zero.tree, 'PatternImportDxfPhaseECadMannequinModelPickerV1');

    expect(hosts).toHaveLength(1);
    expect(pickers).toHaveLength(1);
    expect(attribute(zero.tree, pickers[0], 'onDisplayedBodyInputV1')).toBe(
      'physicalHost?.onDisplayedBodyInputV1',
    );
    expect(attribute(zero.tree, hosts[0], 'acceptedCloth')).toBe('physicalHost?.acceptedCloth');
    expect(attribute(zero.tree, hosts[0], 'savedReviewSize')).toBe('physicalHost?.savedReviewSize');
    expect(zero.text).toContain('if (!tableSizeMatchesReview) return undefined;');
    expect(attribute(zero.tree, pickers[0], 'acceptedCloth')).toBe('acceptedCloth');
    expect(zero.text).toContain('acceptedCloth: selectableCloth');
    expect(zero.text).toContain(
      'selectCadTableAcceptedClothPieceV1(session, row, prepared.projection, hit)',
    );
    expect(zero.text).toContain('physicalHost?: CadWorkbenchPhysicalHostV1');
    expect(zero.text).not.toContain('useSavedClothPhysicalHostV1(');
    expect(zero.text).not.toMatch(/physicalHost(?:\?\.|\.)viewport\b/);
    expect(elements(zero.tree, 'CadWorkbenchPhysicalHostPanelV1')).toHaveLength(0);
    expect(elements(zero.tree, 'CadWorkbenchPhysicalHostControlsV1')).toHaveLength(0);

    const slot = jsxAttribute(zero.tree, hosts[0], 'mannequin');
    const render = slot && ts.isJsxExpression(slot) ? slot.expression : undefined;
    expect(render && ts.isArrowFunction(render)).toBe(true);
    const viewport = pickers[0].parent;
    const column = viewport.parent;
    if (!ts.isJsxElement(viewport) || !ts.isJsxElement(column)) {
      throw new Error('Expected the picker inside its own mannequin viewport');
    }
    expect(column.parent.parent).toBe(render);
    expect(classes(zero.tree, column.openingElement)).toEqual(
      expect.arrayContaining(['flex', 'flex-col']),
    );
    expect(classes(zero.tree, viewport.openingElement)).toEqual(
      expect.arrayContaining(['min-h-0', 'flex-1']),
    );

    const [dock, next] = column.children.filter((child) => !ts.isJsxText(child));
    expect(next).toBe(viewport);
    const branch = ts.isJsxExpression(dock) ? dock.expression : undefined;
    if (!branch || !ts.isConditionalExpression(branch)) {
      throw new Error('Expected the borrowed controls in a dock before the mannequin viewport');
    }
    const panel = ts.isParenthesizedExpression(branch.whenTrue)
      ? branch.whenTrue.expression
      : branch.whenTrue;
    if (!ts.isJsxElement(panel)) throw new Error('Expected the borrowed controls in a dock.');
    expect(branch.condition.getText(zero.tree)).toBe('physicalHost?.panel');
    expect(branch.whenFalse.kind).toBe(ts.SyntaxKind.NullKeyword);
    const dockClasses = classes(zero.tree, panel.openingElement);
    expect(dockClasses).toContain('shrink-0');
    expect(dockClasses.join(' ')).not.toMatch(
      /(?:^|[\s:])(?:absolute|fixed|sticky|pointer-events-none)(?:$|\s)/,
    );
    expect(jsxAttribute(zero.tree, panel.openingElement, 'style')).toBeUndefined();
    const panelChildren = nodes(zero.tree, ts.isJsxExpression).filter(
      ({ expression }) =>
        expression &&
        ts.isCallExpression(expression) &&
        expression.expression.getText(zero.tree) === 'physicalHost.panel' &&
        expression.arguments[0]?.getText(zero.tree) === 'sizeMatches',
    );
    expect(panelChildren).toHaveLength(1);
    expect(panel.children.filter((child) => !ts.isJsxText(child))).toEqual(panelChildren);
  });

  it('drives the existing preview controls with the active table grade and verified review', () => {
    const entry = source('../phase-e-workbench/assembly-order-entry.tsx');
    const controls = elements(entry.tree, 'SavedCompleteAssemblyNativePreviewControlsV8');
    expect(controls).toHaveLength(1);
    expect(attribute(entry.tree, controls[0], 'disabled')).toBe('frozen || !tableSizeMatches');
    expect(entry.text).toContain('savedReviewSize: activeCrossMaterialReview?.patternSize');
    const review = source('./saved-complete-assembly-native-review-action-v8.tsx');
    expect(review.text).toContain('sizeId: restored.document.selection.sizeId');
    expect(review.text).toContain('sizeToken: restored.document.selection.sizeToken');
  });

  it('creates the body-only owner only inside the top-level no-operation branch wrapper', () => {
    const operations = source('../../operations-field.tsx');
    const wrappers = nodes(operations.tree, ts.isFunctionDeclaration).filter(
      (node) => node.name?.text === 'PatternImportDxfPhaseECadTableTopLevelZeroOperationMountV1',
    );

    expect(wrappers).toHaveLength(1);
    const wrapper = wrappers[0].getText(operations.tree);
    expect(wrapper).toContain('useSavedClothPhysicalHostV1({');
    expect(wrapper).toContain('row: null');
    expect(wrapper).toContain('selectedOperationNumber: 0');
    expect(wrapper).toContain('createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1');
    expect(wrapper).toContain('<SavedClothPhysicalControlsV1');
    expect(wrapper).toContain('physicalHost={physicalHost}');

    expect(
      elements(operations.tree, 'PatternImportDxfPhaseECadTableTopLevelZeroOperationMountV1'),
    ).toHaveLength(1);
    expect(
      elements(operations.tree, 'PatternImportDxfPhaseECadTableZeroOperationProductionMountV1'),
    ).toHaveLength(1);
  });
});
