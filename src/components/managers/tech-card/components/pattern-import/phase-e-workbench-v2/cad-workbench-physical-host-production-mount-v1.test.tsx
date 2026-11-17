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

function attribute(tree: ts.SourceFile, node: ts.JsxOpeningLikeElement, name: string) {
  const item = node.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute =>
      ts.isJsxAttribute(candidate) && candidate.name.getText(tree) === name,
  );
  if (!item?.initializer || !ts.isJsxExpression(item.initializer)) return null;
  return item.initializer.expression?.getText(tree) ?? null;
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
    expect(entry.text.match(/\{physicalHost\.viewport\}/gu)).toHaveLength(2);
    expect(entry.text).not.toContain('physicalHost?.panel ?');
    expect(elements(entry.tree, 'CadWorkbenchPhysicalHostPanelV1')).toHaveLength(2);
  });

  it('mounts only Preview/Retry controls and a cloth canvas over the base model', () => {
    const mount = source('./cad-workbench-physical-host-production-mount-v1.tsx');
    const controls = source('./cad-workbench-physical-host-controls-v1.tsx');
    const panel = source('./cad-workbench-physical-host-panel-v1.tsx');

    expect(elements(mount.tree, 'CadWorkbenchPhysicalHostControlsV1')).toHaveLength(1);
    expect(controls.text).toContain("'Preview'");
    expect(controls.text).toContain('Retry');
    expect(controls.text).toContain('Place pieces on mannequin.');
    expect(controls.text).toContain("data-cad-physical-host-viewport=''");
    expect(controls.text).not.toContain('Canonical reference mannequin');
    expect(controls.text).not.toContain('Choose a mannequin profile');
    expect(panel.text).toContain("className='pointer-events-none absolute inset-0");
    expect(panel.text).not.toContain('max-h-[50%]');
    expect(panel.text).not.toContain('overflow-y-auto');
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

  it('lets the zero-operation mount borrow a host without creating another owner', () => {
    const zero = source('./cad-table-zero-operation-production-mount-v1.tsx');
    const pickers = elements(zero.tree, 'PatternImportDxfPhaseECadMannequinModelPickerV1');

    expect(pickers).toHaveLength(1);
    expect(attribute(zero.tree, pickers[0], 'onDisplayedBodyInputV1')).toBe(
      'physicalHost?.onDisplayedBodyInputV1',
    );
    expect(zero.text).toContain('physicalHost?: CadWorkbenchPhysicalHostV1');
    expect(zero.text).toContain('{physicalHost.panel}');
    expect(elements(zero.tree, 'CadWorkbenchPhysicalHostPanelV1')).toHaveLength(1);
    expect(zero.text).not.toContain('useSavedClothPhysicalHostV1(');
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
