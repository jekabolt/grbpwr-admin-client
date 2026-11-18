import {
  PATIMPORT,
  type StageIO,
  type StageName,
  type PatternImportOpenFile,
} from 'lib/pattern-import/types';
import { Session } from 'lib/pattern-import/worker/session';
import { pinToScope } from 'lib/pattern-import/fabrics/scope';
import { cardBuildDraft } from './card-apply';
import type { CardContext, ImportClient } from './client';
import {
  captureDirectDxfAuthoringV1,
  directDxfAuthoringOpenFileV1,
  buildOrdinaryWizardReviewV1,
} from './direct-dxf-authoring-capture-v1';
import { cardPresegmentedIdentities } from './entry';

export class DirectClient implements ImportClient {
  readonly kind = 'worker' as const;
  private next = 1;
  private sessions = new Map<number, Session>();
  private cancelled = false;

  async open(files: PatternImportOpenFile[]) {
    const sessionId = this.next++;
    const session = new Session(sessionId, files);
    this.sessions.set(sessionId, session);
    return { sessionId, files: session.files };
  }

  async run<S extends StageName>(sessionId: number, stage: S, input: StageIO[S]['in']) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Missing in-process worker session.');
    return session.runStage(stage, input, {
      checkCancel: () => {
        if (this.cancelled) throw new DOMException('Cancelled', 'AbortError');
      },
      progress() {},
    });
  }

  cancel() {
    this.cancelled = true;
  }

  async close(sessionId: number) {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }

  dispose() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

export async function draftThroughWizardStages(
  file: File,
  card: CardContext,
  client: ImportClient = new DirectClient(),
  open?: PatternImportOpenFile,
  resolveDetails?: (initial: StageIO['semantics']['out']) => Partial<StageIO['semantics']['in']>,
) {
  const { sessionId } = await client.open([open ?? (await directDxfAuthoringOpenFileV1(file, 0))]);
  const run = <S extends StageName>(stage: S, input: StageIO[S]['in']) =>
    client.run(sessionId, stage, input);
  try {
    await run('extract', { opts: { sagittaMm: PATIMPORT.sagittaMm, keepFills: true } });
    await run('clean', { edits: [] });
    await run('scale', { decision: { factor: 1, method: 'manual', operatorConfirmed: true } });
    await run('assemble', { sheet: 0 });
    await run('chains', {
      opts: {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
    });
    const sizes = await run('sizes', { card: card.sizes });
    await run('pieces', {
      edits: [],
      sheetAnswers: {},
      opts: {
        cellMm: PATIMPORT.fillCellMm,
        snapMm: PATIMPORT.snapMm,
        variant: null,
        ...(sizes.expected ? { expectedSizes: sizes.expected } : {}),
      },
    });
    const semanticsInput: StageIO['semantics']['in'] = {
      fileAllowance: { meaning: 'cut', allowanceMm: 10, origin: 'operator', evidence: [] },
      pieceOverrides: {},
      presegmentedIdentities: cardPresegmentedIdentities(card, 'main'),
      operatorGrain: {},
    };
    const initial = await run('semantics', semanticsInput);
    const reviewedInput = { ...semanticsInput, ...resolveDetails?.(initial) };
    const reviewed = resolveDetails ? await run('semantics', reviewedInput) : initial;
    const assignment = pinToScope(
      await run('fabrics', { bom: card.scopes }),
      'main',
      reviewed.pieces.map(({ seed }) => seed),
      card.scopes,
    );
    const semantics = await run('semantics', reviewedInput);
    if (semantics.blocked.length) throw new Error(JSON.stringify(semantics.blocked));
    const capture = await captureDirectDxfAuthoringV1([file], run);
    if (!capture.dxfNativeSewingReplay?.replayReady)
      throw new Error(
        `The native sewing replay is unavailable. ${JSON.stringify(capture.dxfNativeSewingReplay?.blockers)}`,
      );
    const written = await run('write', {
      techCardId: card.techCardId,
      scopes: card.scopes,
      assignment,
      sizes: sizes.map.entries.flatMap(({ source, card }) =>
        card
          ? [
              {
                token: card.token,
                sizeId: card.sizeId,
                name: card.name,
                sourceLabel: source.label,
                rank: source.rank,
              },
            ]
          : [],
      ),
      dialect: 'r12',
      generator: 'grbpwr-admin pattern-import (worker)',
    });
    return buildOrdinaryWizardReviewV1([file], cardBuildDraft, written, {
      card,
      semantics,
      ...capture,
    }).draft;
  } finally {
    client.dispose?.();
  }
}
