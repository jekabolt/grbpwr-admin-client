import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  runBetaSkirtSavedAnnularObservedPlacement16FrameContactV1 as run,
  projectBetaSkirtSavedAnnularObservedPlacement16FrameContactV1 as project,
  getBetaSkirtSavedAnnularObservedPlacement16FrameContactLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularObservedPlacement16FrameContactV1 as dispose,
} from './beta-skirt-saved-annular-observed-placement-16-frame-contact-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2 as canonicalProject,
  disposeBetaSkirtCanonicalMediumWebgpu16FrameContactV2 as canonicalDispose,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';

// Exact AST baselines captured before this additive change from source bfc85f8bccf6e570… .
// This is code parity, explicitly NOT GPU execution or actual observed-body acceptance evidence.
const BASELINE = {
  canonicalReportPayload: 'fb114978617b80c2ea79989f1513ca91b69707f2837d55a07a912ecb5f9604a5',
  prepareRun: '16523aa69f809d2d8dce4139603076615a16ffd3ae70b131b56fee8f5a79ac29',
  executeGpuRun: '9b519b76f04993924fcffe1d5cadeec93e5f3ba4db9c7a6e072778e12c864823',
  inspectFinalState: '0cf97c6bf17c55dc8d028c4d795d68f938114cf7b8a5db7776d0f9e6f94ccb78',
};
function coreHashes() {
  const source = ts.createSourceFile(
    'runner.ts',
    readFileSync(
      new URL(
        './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  const printer = ts.createPrinter({ removeComments: true });
  const hashes: Record<string, string> = {};
  const hash = (node: ts.Node, skipLifecycle = false) => {
    const printed = printer.printNode(ts.EmitHint.Unspecified, node, source);
    // The additive currentSource callback only observes lifetime; no expression/dispatch is removed.
    return createHash('sha256')
      .update(skipLifecycle ? printed.replace(/^\s*currentSource\?\.\(\);\n/gm, '') : printed)
      .digest('hex');
  };
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.body &&
      ['prepareRun', 'executeGpuRun', 'inspectFinalState'].includes(node.name.text)
    )
      hashes[node.name.text] = hash(node.body, node.name.text === 'executeGpuRun');
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'reportWithoutSeal' &&
      node.initializer
    )
      hashes.canonicalReportPayload = hash(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return hashes;
}
describe('fixed observed16 source boundary; no GPU or positive body qualification in these tests', () => {
  it('preserves full canonical receipt payload, preparation, GPU dispatch body and final-state validator AST', () => {
    expect(coreHashes()).toEqual(BASELINE);
  });
  it('deeply seals the exact observed publication helper against nested pointer, contact and claims mutation', () => {
    const source = ts.createSourceFile(
      'runner.ts',
      readFileSync(
        new URL(
          './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      ts.ScriptTarget.Latest,
      true,
    );
    let helper: ts.FunctionDeclaration | undefined;
    let observedPublicationUsesHelper = false;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'freezeObservedReport')
        helper = node;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'report' &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'freezeObservedReport'
      )
        observedPublicationUsesHelper = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(observedPublicationUsesHelper).toBe(true);
    if (!helper) throw new Error('Actual private publication helper missing.');
    // Execute only that exact pure data helper. No source/runner owner or GPU success is forged.
    const script = ts.transpileModule(
      ts.createPrinter().printNode(ts.EmitHint.Unspecified, helper, source),
      { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None } },
    ).outputText;
    const seal = runInNewContext(script + '\nfreezeObservedReport;') as <T>(value: T) => T;
    const report = seal({
      seal: { canonicalSha256: 'a'.repeat(64) },
      claims: { runtimeAuthority: false },
      observedPostgate: {
        collision: { clearance: { penetratingVertexCount: 1 } },
        signedRefresh: { contacts: [{ vertexIndex: 402, bodyVertexIndices: [0, 3, 2] }] },
      },
    });
    expect(Reflect.set(report.observedPostgate, 'signedRefresh', null)).toBe(false);
    expect(
      Reflect.set(report.observedPostgate.collision.clearance, 'penetratingVertexCount', 0),
    ).toBe(false);
    expect(Reflect.set(report.claims, 'runtimeAuthority', true)).toBe(false);
    expect(() =>
      report.observedPostgate.signedRefresh.contacts.push({
        vertexIndex: 1,
        bodyVertexIndices: [],
      }),
    ).toThrow();
    expect(
      Reflect.set(report.observedPostgate.signedRefresh.contacts[0].bodyVertexIndices, '0', 99),
    ).toBe(false);
    expect(report.observedPostgate.collision.clearance.penetratingVertexCount).toBe(1);
    expect(report.claims.runtimeAuthority).toBe(false);
    expect(report.seal.canonicalSha256).toBe('a'.repeat(64));
    expect(() => seal({ mutable: new Uint8Array([1]) })).toThrow('mutable binary carriers');
  });

  it('rejects lookalikes before even reading the GPU provider and never invokes owner getters', async () => {
    let touches = 0;
    const options = Object.defineProperty({}, 'gpu', {
      get() {
        touches++;
        throw new Error('no GPU');
      },
    });
    const owner = Object.defineProperty({}, 'report', {
      get() {
        touches++;
        throw new Error('no owner callback');
      },
    });
    for (const input of [{}, owner, null]) {
      expect(await run({} as HTMLCanvasElement, input, options)).toMatchObject({
        ok: false,
        code: 'source-owner-unavailable',
      });
      expect(project(input)).toBeNull();
      expect(lifetime(input)).toBeNull();
      expect(dispose(input)).toBe(false);
      expect(canonicalProject(input)).toBeNull();
      expect(canonicalDispose(input)).toBe(false);
    }
    expect(touches).toBe(0);
  });
  it('rejects invalid or already-aborted caller signals before allocating GPU resources', async () => {
    let touches = 0;
    const gpu = {
      getPreferredCanvasFormat() {
        touches++;
        throw new Error('never');
      },
      async requestAdapter() {
        touches++;
        throw new Error('never');
      },
    };
    const controller = new AbortController();
    controller.abort();
    expect(
      await run({} as HTMLCanvasElement, {}, { signal: controller.signal, gpu: gpu as never }),
    ).toMatchObject({ ok: false, code: 'aborted' });
    expect(
      await run(
        {} as HTMLCanvasElement,
        {},
        { signal: { aborted: false } as AbortSignal, gpu: gpu as never },
      ),
    ).toMatchObject({ ok: false, code: 'source-owner-unavailable' });
    expect(touches).toBe(0);
  });
});
