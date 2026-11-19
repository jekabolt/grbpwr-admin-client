import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { signedArea } from 'lib/pattern-import/adapters/dxf/geometry';
import {
  PATIMPORT,
  type ImportSession,
  type StageIO,
  type StageName,
} from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { cardBuildDraft } from '../card-apply';
import { DirectClient, draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import { createSavedThreePanelFixtureV1 } from '../phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test-fixture';
import { useImportSession } from '../use-import-session';
import { DetailsStep } from './details';

class DetailsFixtureClient extends DirectClient {
  readonly question: Partial<ImportSession> = {};
  readonly initialOverrides: StageIO['semantics']['in']['pieceOverrides'] = {};
  private capturedQuestion = false;

  async run<S extends StageName>(id: number, stage: S, input: StageIO[S]['in']) {
    const firstSemantics = stage === 'semantics' && !this.capturedQuestion;
    if (firstSemantics) {
      const [family] = this.question.pieces!.families;
      this.initialOverrides[family.seed] = {
        allowance: {
          meaning: 'seam',
          allowanceMm: PATIMPORT.defaultAllowanceMm,
          origin: 'operator',
          evidence: [],
        },
      };
    }
    const result = await super.run(
      id,
      stage,
      firstSemantics
        ? {
            ...input,
            pieceOverrides: this.initialOverrides,
          }
        : input,
    );
    switch (stage) {
      case 'assemble':
        this.question.sheet = result as StageIO['assemble']['out'];
        break;
      case 'chains':
        this.question.chains = result as StageIO['chains']['out'];
        break;
      case 'sizes':
        this.question.sizes = result as StageIO['sizes']['out'];
        break;
      case 'pieces':
        this.question.pieces = result as StageIO['pieces']['out'];
        break;
      case 'semantics':
        if (firstSemantics) {
          this.question.semantics = result as StageIO['semantics']['out'];
          this.capturedQuestion = true;
        }
        break;
    }
    return result;
  }
}

it('offers the native cut answer in the active offset question and preserves the L1 hole', async () => {
  const { job, card } = await createSavedThreePanelFixtureV1(2);
  const [piece] = job.pieces;
  job.pieces = [piece];
  piece.allowance = { meaning: 'both', allowanceMm: 0, origin: 'operator', evidence: [] };
  const size = piece.sizes[0];
  size.cut = [
    { x: 0, y: 0 },
    { x: 160, y: 0 },
    { x: 160, y: 40 },
    { x: 105, y: 40 },
    { x: 105, y: 80 },
    { x: 160, y: 80 },
    { x: 160, y: 120 },
    { x: 0, y: 120 },
  ];
  size.seam = structuredClone(size.cut);
  const hole = [
    { x: 40, y: 44 },
    { x: 40, y: 72 },
    { x: 68, y: 72 },
    { x: 68, y: 44 },
  ];
  size.cutLoops = [hole];
  size.areaMm2 = signedArea(size.cut) + signedArea(hole);
  size.bbox = { minX: 0, minY: 0, maxX: 160, maxY: 120 };
  size.grain = { ...size.grain!, a: { x: 24, y: 12 }, b: { x: 24, y: 108 } };
  const source = new File([writeDxfDetailed(job).dxfText], 'native-offset-hole.dxf');
  const client = new DetailsFixtureClient();

  const draft = await draftThroughWizardStages(source, card, client, undefined, (initial) => {
    expect(initial.blocked).toHaveLength(1);
    const [{ seed, reason }] = initial.blocked;
    expect(reason).toBe('offset-topology');

    function ActiveOffset() {
      const api = useImportSession({
        client,
        card,
        namer: async () => [],
        buildDraft: cardBuildDraft,
        applyDraft: async () => {
          throw new Error('This test does not save a card.');
        },
      });
      return (
        <DetailsStep
          api={{
            ...api,
            inputs: { ...api.inputs, overrides: client.initialOverrides },
            session: { ...api.session, ...client.question, step: 'meaning' },
          }}
          card={card}
        />
      );
    }
    const html = renderToStaticMarkup(<ActiveOffset />);
    const question = html.slice(html.indexOf('data-testid="details-question"'));
    expect(question).toContain('offset broke the shape');
    expect(question).toContain('aria-label="line meaning of piece 1"');
    expect(question).toContain('<option value="cut">cut line</option>');
    expect(question).toContain('aria-label="allowance of piece 1"');
    expect(question).toContain('Apply line and allowance');
    expect(question).not.toContain('line meaning of piece 2');

    return {
      pieceOverrides: {
        [seed]: { allowance: { meaning: 'cut', allowanceMm: 0, origin: 'operator', evidence: [] } },
      },
    };
  });
  const manifest = draft.scopes[0].manifest;
  expect(manifest.gate?.passed).toBe(true);
  expect(manifest.blocks[0].grain).toEqual({ origin: 'detected', evidence: ['dxf-layer'] });
  expect(draft.scopes[0].writerReplay?.job.pieces[0].sizes[0].cutLoops).toEqual([hole]);
});
