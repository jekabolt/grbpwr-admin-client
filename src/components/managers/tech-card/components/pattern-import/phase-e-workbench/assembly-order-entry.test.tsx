import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./assembly-order-entry.tsx', import.meta.url), 'utf8');
const zeroConnectCanvasSource = readFileSync(
  new URL('../phase-e-workbench-v2/cad-table-zero-connect-canvas-v1.tsx', import.meta.url),
  'utf8',
);
const tree = ts.createSourceFile(
  'assembly-order-entry.tsx',
  source,
  ts.ScriptTarget.ESNext,
  true,
  ts.ScriptKind.TSX,
);
function nodes<T extends ts.Node>(guard: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (guard(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}
function variable(name: string): ts.Expression {
  const matches = nodes(ts.isVariableDeclaration).filter(
    (node) => ts.isIdentifier(node.name) && node.name.text === name,
  );
  expect(matches).toHaveLength(1);
  expect(matches[0].initializer).toBeDefined();
  return matches[0].initializer!;
}
function declaration(name: string): ts.FunctionDeclaration {
  const matches = nodes(ts.isFunctionDeclaration).filter((node) => node.name?.text === name);
  expect(matches).toHaveLength(1);
  return matches[0];
}
/** Evaluates only the actual pure source expression with explicit synthetic lifecycle/data ports. */
function evaluate<T>(expression: string, scope: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(`(${expression.replace(/^export\s+/u, '')})`, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  return new Function(...Object.keys(scope), `return ${code}`)(...Object.values(scope)) as T;
}
function attribute(node: ts.JsxOpeningLikeElement, name: string): string | null {
  const attr = node.attributes.properties.find(
    (item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(tree) === name,
  );
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer)) return null;
  return attr.initializer.expression?.getText(tree) ?? null;
}
function elements(name: string): ts.JsxOpeningLikeElement[] {
  return nodes(
    (node): node is ts.JsxOpeningLikeElement =>
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node),
  ).filter((node) => node.tagName.getText(tree) === name);
}
const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-a',
  revision: 7,
  cardLockVersion: 8,
  url: 'https://example.invalid/pattern.dxf',
  sizeBytes: 123,
  sha256: 'a'.repeat(64),
});

describe('V1 selected durable physical source handoff', () => {
  it('admits every qualified saved projection without a selected-seam cardinality gate', () => {
    const expression = variable('physicalRow').getText(tree);
    for (const count of [0, 1, 2, 3, 4]) {
      const actual = evaluate(expression, {
        savedProjection: { ok: true, row },
        selectedSeamKeys: Array.from({ length: count }, (_, i) => `exact-seam-${i}`),
      });
      expect(actual).toBe(row);
    }
    expect(
      evaluate(expression, { savedProjection: { ok: false }, selectedSeamKeys: ['a', 'b'] }),
    ).toBeNull();
  });

  it('binds the durable hook to the current saved card projection without a legacy owner', () => {
    const hook = variable('savedClothPhysicalHost');
    expect(ts.isCallExpression(hook)).toBe(true);
    if (!ts.isCallExpression(hook)) throw new Error('Expected the selected source hook.');
    expect(hook.expression.getText(tree)).toBe('useSavedClothPhysicalHostV1');
    const input = hook.arguments[0];
    expect(ts.isObjectLiteralExpression(input)).toBe(true);
    if (!ts.isObjectLiteralExpression(input)) throw new Error('Expected hook input.');
    const properties = new Map(
      input.properties
        .filter(ts.isPropertyAssignment)
        .map((prop) => [prop.name.getText(tree), prop.initializer.getText(tree)]),
    );
    expect(properties.get('row')).toBe('physicalRow');
    expect(properties.get('cardProjection')).toBe(
      'savedProjection.ok ? savedProjection.projection : null',
    );
    expect(properties.has('createCanonicalOwner')).toBe(false);
    expect(source).not.toContain('savedPhysicalDownstream');
    const mount = declaration('PatternImportDxfPhaseEAssemblyOrderEntryMountV1');
    const statements = mount.body!.statements;
    const hookStatement = statements.find(
      (statement) => statement.pos <= hook.pos && statement.end >= hook.end,
    );
    expect(hookStatement && ts.isVariableStatement(hookStatement)).toBe(true);
    expect(hook.pos).toBeLessThan(variable('savedSession').pos);
    const firstRouteReturn = statements.find(
      (statement) => ts.isIfStatement(statement) && ts.isReturnStatement(statement.thenStatement),
    );
    expect(firstRouteReturn).toBeDefined();
    expect(hook.pos).toBeLessThan(firstRouteReturn!.pos);
    expect(mount.getText(tree)).not.toMatch(/\.consume\s*\(/u);
    expect(mount.getText(tree)).not.toContain('const savedGarmentCompileOwner = useMemo');
  });

  it('keeps 2D saved-session editing independent from the physical restore path', () => {
    const memo = variable('savedSession');
    if (!ts.isCallExpression(memo)) throw new Error('Expected saved session memo.');
    const callback = memo.arguments[0];
    const runtime = {};
    const onConfirm = vi.fn();
    const prepareAllMaterialScopeStaging = vi.fn();
    const prepareAllMaterialScopeEditors = vi.fn();
    const create = (ok = true, currentRuntime: unknown = runtime) =>
      evaluate<() => Record<string, unknown> | null>(callback.getText(tree), {
        savedProjection: { ok, row, selectedOperationNumber: 2 },
        savedRuntimeResolution: { runtime: currentRuntime },
        savedConfirm: onConfirm,
        prepareSavedAllMaterialScopeStaging: prepareAllMaterialScopeStaging,
        prepareSavedAllMaterialScopeEditors: prepareAllMaterialScopeEditors,
      })();
    const session = create();
    expect(session).not.toBeNull();
    expect(session?.row).toBe(row);
    expect(session?.runtime).toBe(runtime);
    expect(session?.onConfirm).toBe(onConfirm);
    expect(session?.prepareAllMaterialScopeStaging).toBe(prepareAllMaterialScopeStaging);
    expect(session?.prepareAllMaterialScopeEditors).toBe(prepareAllMaterialScopeEditors);
    expect(Object.hasOwn(session!, 'downstream')).toBe(false);
    expect(prepareAllMaterialScopeStaging).not.toHaveBeenCalled();
    expect(prepareAllMaterialScopeEditors).not.toHaveBeenCalled();
    expect(create(false)).toBeNull();
    expect(create(true, null)).toBeNull();
  });

  it('forwards the same borrowed host to V2 and the beta nested zero-operation fallback', () => {
    const host = variable('physicalHost');
    expect(ts.isObjectLiteralExpression(host)).toBe(true);
    if (!ts.isObjectLiteralExpression(host)) throw new Error('Expected shared host input.');
    expect(
      host.properties.some(
        (property) =>
          ts.isShorthandPropertyAssignment(property) &&
          property.name.getText(tree) === 'onDisplayedBodyInputV1',
      ),
    ).toBe(true);
    const dispatch = variable('onDisplayedBodyInputV1');
    if (!ts.isCallExpression(dispatch)) throw new Error('Expected the shared body callback.');
    const setDisplayedBodyInput = vi.fn();
    const onDisplayedBodyInputV1 = vi.fn();
    const observe = evaluate<(input: unknown) => void>(dispatch.arguments[0]!.getText(tree), {
      setDisplayedBodyInput,
      savedClothPhysicalHost: { onDisplayedBodyInputV1 },
    });
    const displayedBody = Object.freeze({ fixture: 'displayed body' });
    observe(displayedBody);
    observe(null);
    for (const consumer of [setDisplayedBodyInput, onDisplayedBodyInputV1]) {
      expect(consumer.mock.calls).toEqual([[displayedBody], [null]]);
    }
    const controls = elements('CadWorkbenchPhysicalHostProductionMountV1');
    expect(controls).toHaveLength(1);
    expect(attribute(controls[0], 'state')).toBe('savedClothPhysicalHost');
    expect(attribute(controls[0], 'disabled')).toBe('frozen');
    const viewport = host.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) && property.name.getText(tree) === 'viewport',
    );
    expect(viewport).toBeDefined();
    for (const name of [
      'PatternImportDxfPhaseEMultiseamAssemblyOrderEntryV2',
      'PatternImportDxfPhaseECadTableZeroOperationProductionMountV1',
    ]) {
      const routes = elements(name);
      expect(routes).toHaveLength(1);
      expect(attribute(routes[0], 'physicalHost')).toBe('physicalHost');
    }
    expect(variable('physicalHost').pos).toBeLessThan(
      elements('PatternImportDxfPhaseECadTableZeroOperationProductionMountV1')[0].pos,
    );
  });

  it('routes cross-material review to the ordinary editor without the single-row draft fallback', () => {
    const ordinary = elements('PatternImportDxfPhaseECadTableDraftOperationsPanelV1');
    expect(ordinary).toHaveLength(1);
    expect(attribute(ordinary[0], 'editor')).toBe('operationsPanel');
    expect(attribute(ordinary[0], 'navigation')).toBe('operationNavigation');
    const result = attribute(ordinary[0], 'result');
    const fallbackResult = { ok: false, blocker: { code: 'exact-connection-incomplete' } };
    expect(evaluate(result!, { savedCrossMaterialActions: {}, fallbackResult })).toBeNull();
    expect(evaluate(result!, { savedCrossMaterialActions: null, fallbackResult })).toBe(
      fallbackResult,
    );
    expect(elements('SavedCompleteAssemblyNativeReviewActionV8')).toHaveLength(1);
    expect(source).toContain('!savedCrossMaterialActions && durableReloadBlocker');
  });

  it('preserves beta auto-open and incomplete-operation browse-fallback routing', () => {
    const requested = evaluate<(open: boolean, auto: boolean) => boolean>(
      declaration('resolvePatternImportDxfPhaseEWorkbenchRequestedV1').getText(tree),
    );
    expect(requested(false, true)).toBe(true);
    expect(requested(true, false)).toBe(true);
    expect(requested(false, false)).toBe(false);
    const fallback = evaluate<
      (input: {
        workbenchOpen: boolean;
        exactNSessionAvailable: boolean;
        savedProjectionBlockerCode: string | null;
        selectedSeamKeys: readonly string[];
        savedOrderedSeamKeys: readonly string[] | null;
      }) => boolean
    >(declaration('shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1').getText(tree));
    const input = {
      workbenchOpen: true,
      exactNSessionAvailable: false,
      savedProjectionBlockerCode: null,
      selectedSeamKeys: ['seam-a'],
      savedOrderedSeamKeys: ['seam-a'],
    };
    expect(fallback(input)).toBe(true);
    expect(
      fallback({
        ...input,
        savedProjectionBlockerCode: 'saved-operation-missing',
        savedOrderedSeamKeys: null,
      }),
    ).toBe(false);
    expect(fallback({ ...input, savedOrderedSeamKeys: ['saved-a', 'saved-b'] })).toBe(false);
    expect(fallback({ ...input, savedOrderedSeamKeys: ['saved-a', 'saved-b', 'saved-c'] })).toBe(
      false,
    );
    expect(fallback({ ...input, exactNSessionAvailable: true })).toBe(false);
    expect(fallback({ ...input, workbenchOpen: false })).toBe(false);
    expect(fallback({ ...input, savedProjectionBlockerCode: 'different-failure' })).toBe(false);
  });

  it('keeps durable reload retry read-only and renders its refusal inside the N1 table', () => {
    const retry = variable('retryDurableReload').getText(tree);
    expect(retry).toContain('retryPatternImportDxfPhaseEDurableReloadRetryV1');
    expect(retry).not.toMatch(/persist|save|seamWrite|onConfirm/);
    const fallbackCall = nodes(ts.isCallExpression).find(
      (call) =>
        call.expression.getText(tree) ===
        'shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1',
    );
    expect(fallbackCall?.arguments[0]?.getText(tree)).toContain(
      'savedOrderedSeamKeys: savedProjection.ok ? savedProjection.orderedSeamKeys : null',
    );
    expect(tree.getFullText()).toContain('data-durable-reload-blocker={durableReloadBlocker.code}');
    expect(tree.getFullText()).toContain('onClick={retryDurableReload}');
  });

  it('admits legacy N1 only when live and authoritative saved ordered seam keys match exactly', () => {
    const expression = variable('savedOperationSeamsMatch').getText(tree);
    const matches = (selectedSeamKeys: readonly string[], orderedSeamKeys: readonly string[]) =>
      evaluate<boolean>(expression, {
        selectedSeamKeys,
        savedProjection: { ok: true, seamCount: orderedSeamKeys.length, orderedSeamKeys },
      });
    expect(matches(['seam-a'], ['seam-a'])).toBe(true);
    expect(matches(['stale-live'], ['saved-a', 'saved-b'])).toBe(false);
    expect(matches(['stale-live'], ['saved-a', 'saved-b', 'saved-c'])).toBe(false);
    expect(matches(['seam-b', 'seam-a'], ['seam-a', 'seam-b'])).toBe(false);
  });

  it('routes empty and qualified existing N1 operations to the live owner', () => {
    const fallbackMount = elements(
      'PatternImportDxfPhaseECadTableZeroOperationProductionMountV1',
    )[0];
    expect(attribute(fallbackMount, 'zeroConnectAuthoringHandoff')).toContain(
      '(savedEmptyOperation || savedLinkedN1) && zeroConnectAuthoringHandoff',
    );
    expect(attribute(fallbackMount, 'zeroConnectAuthoringHandoff')).toContain(
      'EXISTING_OPERATION_REBUILD_ONLY_HANDOFF',
    );
    const expression = variable('EXISTING_OPERATION_REBUILD_ONLY_HANDOFF').getText(tree);
    expect(expression).not.toMatch(/ingest|append|seamWrite|zeroConnectAuthoringHandoff/u);
    expect(evaluate<Record<string, unknown>>(expression)).toMatchObject({
      status: 'unavailable',
      blocker: { code: 'zero-connect-authoring-write-refused' },
    });
    expect(attribute(fallbackMount, 'sourceSurface')).toContain(
      "useSavedSewingEdges ? 'explicit-native-drawn-sewing' : undefined",
    );
    expect(tree.getFullText()).toContain("data-legacy-n1-rebuild-required=''");
    expect(tree.getFullText()).not.toContain('data-empty-operation-rebuild-required');
    expect(zeroConnectCanvasSource).toContain(
      "const connectDisabled = disabled || zeroConnectAuthoringHandoff?.status === 'unavailable';",
    );
    expect(zeroConnectCanvasSource).toContain('disabled={connectDisabled}');
    expect(zeroConnectCanvasSource).toContain('if (connectDisabled) return;');
  });

  it('retains the caf373 saved-card staging authority without requiring a physical profile', async () => {
    const callback = variable('prepareSavedAllMaterialScopeStaging');
    if (!ts.isCallExpression(callback)) throw new Error('Expected staging callback.');
    const prepare = vi.fn().mockResolvedValue({ ok: true });
    const techCard = Object.freeze({ syntheticSavedCard: true });
    const authority = Object.freeze({ syntheticAuthorityPort: true });
    const orderSizeIds = vi.fn();
    const sizeNameById = Object.freeze({});
    const current = Object.freeze({ syntheticCurrentSource: true });
    const signal = new AbortController().signal;
    const request = { current, sizeToken: 'M', signal };
    const create = (ok: boolean, data: unknown) =>
      evaluate<(input: typeof request) => Promise<unknown>>(callback.arguments[0].getText(tree), {
        savedProjection: { ok, row, selectedOperationNumber: 2 },
        savedCard: { data },
        orderSizeIds,
        sizeNameById,
        savedAllScopeAuthority: authority,
        preparePatternImportDxfPhaseECadMannequinSavedAllScopeStagingV1: prepare,
      });
    for (const [ok, data] of [
      [false, techCard],
      [true, undefined],
    ] as const) {
      await expect(create(ok, data)(request)).resolves.toMatchObject({
        ok: false,
        sources: [current],
        blocker: { code: 'saved-material-scope-set-invalid' },
      });
    }
    expect(prepare).not.toHaveBeenCalled();
    await create(true, techCard)(request);
    expect(prepare).toHaveBeenCalledExactlyOnceWith({
      techCard,
      orderSizeIds,
      sizeNameById,
      sizeToken: 'M',
      current,
      authority,
      preparationKey: 'saved-ao:156:8:2',
      signal,
    });
  });

  it('retains d903 material editor reconstruction and generation cleanup with synthetic preparation ports', async () => {
    const callback = variable('prepareSavedAllMaterialScopeEditors');
    if (!ts.isCallExpression(callback)) throw new Error('Expected editor callback.');
    const generation = Object.freeze({ syntheticGeneration: true });
    const generationOwner = {
      beginSaved: vi.fn().mockReturnValue(generation),
      dispose: vi.fn(),
    };
    const createGenerationOwner = vi.fn().mockReturnValue(generationOwner);
    const active = Object.freeze({
      ok: true,
      scopeKey: 'main',
      sizeToken: 'M',
      preparationGeneration: 'exact-generation',
      selection: {},
      catalog: {},
      projection: {},
      draftCadCompileSource: {},
    });
    const prepareActive = vi.fn().mockResolvedValue(active);
    const result = Object.freeze({ syntheticPreparedEditors: true });
    const prepareEditors = vi.fn().mockResolvedValue(result);
    const techCard = Object.freeze({ id: 156, lockVersion: 8 });
    const authority = Object.freeze({ syntheticAuthorityPort: true });
    const orderSizeIds = vi.fn();
    const sizeNameById = Object.freeze({});
    const signal = new AbortController().signal;
    const request = { scopeKey: 'main', sizeToken: 'M', signal };
    const create = (ok = true) =>
      evaluate<(input: typeof request) => Promise<unknown>>(callback.arguments[0].getText(tree), {
        savedProjection: { ok, row },
        savedCard: { data: techCard },
        orderSizeIds,
        sizeNameById,
        savedAllScopeAuthority: authority,
        PATTERN_IMPORT_DXF_PHASE_E_CAD_SAVED_MATERIAL_SCOPE_EDITOR_PREPARATION_CLAIMS_V1: {},
        createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1: createGenerationOwner,
        preparePatternImportDxfPhaseECadTableZeroOperationSavedV1: prepareActive,
        preparePatternImportDxfPhaseECadSavedMaterialScopeEditorsV1: prepareEditors,
      });
    await expect(create(false)(request)).resolves.toMatchObject({
      ok: false,
      blocker: { code: 'saved-editor-scope-preparation-blocked' },
    });
    expect(createGenerationOwner).not.toHaveBeenCalled();
    await expect(create()(request)).resolves.toBe(result);
    expect(generationOwner.beginSaved).toHaveBeenCalledWith('saved-editor-active:156:8:M:main');
    expect(prepareActive).toHaveBeenCalledExactlyOnceWith(
      {
        techCard,
        orderSizeIds,
        sizeNameById,
        scopeKey: 'main',
        sizeToken: 'M',
        authority,
        generation,
      },
      signal,
    );
    expect(prepareEditors).toHaveBeenCalledExactlyOnceWith({
      techCard,
      orderSizeIds,
      sizeNameById,
      sizeToken: 'M',
      active: {
        scopeKey: active.scopeKey,
        sizeToken: active.sizeToken,
        sourceRevision: active.preparationGeneration,
        selection: active.selection,
        catalog: active.catalog,
        projection: active.projection,
        compileSource: active.draftCadCompileSource,
      },
      authority,
      signal,
    });
    expect(generationOwner.dispose).toHaveBeenCalledTimes(1);
    prepareActive.mockResolvedValueOnce({ ok: false, blocker: { detail: 'source drift' } });
    await expect(create()(request)).resolves.toMatchObject({
      ok: false,
      blocker: { detail: expect.stringContaining('source drift') },
    });
    prepareActive.mockRejectedValueOnce(new Error('source unavailable'));
    await expect(create()(request)).resolves.toMatchObject({
      ok: false,
      blocker: { detail: expect.stringContaining('source unavailable') },
    });
    expect(prepareEditors).toHaveBeenCalledTimes(1);
    expect(generationOwner.dispose).toHaveBeenCalledTimes(3);
  });

  it('retains the lazy canonical ready-before-consume boundary with synthetic compiler ports', async () => {
    const create = evaluate<
      (loader: () => Promise<unknown>) => {
        downstream: {
          targetEdgeMm: number;
          ready: (signal: AbortSignal) => Promise<void>;
          consume: (request: unknown, signal: AbortSignal) => Promise<unknown>;
        };
        dispose: () => void;
      }
    >(declaration('createPatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1').getText(tree), {
      PATTERN_IMPORT_DXF_PHASE_E_SAVED_GARMENT_TARGET_EDGE_MM_V1: evaluate(
        variable('PATTERN_IMPORT_DXF_PHASE_E_SAVED_GARMENT_TARGET_EDGE_MM_V1').getText(tree),
      ),
    });
    const consume = vi.fn().mockResolvedValue({ ok: false });
    const dispose = vi.fn();
    const load = vi.fn().mockResolvedValue({
      createPatternImportDxfProductSavedGarmentMeshCompileSessionV1: () => ({ consume, dispose }),
    });
    const owner = create(load);
    const signal = new AbortController().signal;
    const request = Object.freeze({ syntheticTest: true });
    expect(owner.downstream.targetEdgeMm).toBe(12.5);
    expect(load).not.toHaveBeenCalled();
    await expect(owner.downstream.consume(request, signal)).rejects.toThrow('ready');
    expect(consume).not.toHaveBeenCalled();
    await owner.downstream.ready(signal);
    await owner.downstream.consume(request, signal);
    expect(load).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(request, signal);
    owner.dispose();
    owner.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(owner.downstream.ready(signal)).rejects.toThrow('disposed');
  });
});
