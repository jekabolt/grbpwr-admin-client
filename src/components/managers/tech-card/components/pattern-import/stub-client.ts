// The STUB behind the three seams in client.ts. Returns the fixture (fixture.ts) with believable
// latency and progress so the shell can be driven end to end; writes nothing anywhere.
//
// Replace with: `new ImportWorkerClient()` (lib/pattern-import/worker/client.ts), F10's namer and
// F7's buildDraft/applyDraft. Nothing in the steps depends on this file.
import type {
  CardSize,
  DraftPiece,
  FabricAssignment,
  NameDecision,
  PieceFamily,
  ScaleDecision,
  Seed,
  SizeMap,
  SourceFileInfo,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import { ulid } from 'utils/ulid';
import type {
  ApplyDraftFn,
  CardContext,
  DraftBuilder,
  ImportClient,
  NameSuggester,
  StageProgress,
} from './client';
import {
  fixtureAssemble,
  fixtureChains,
  fixtureExtract,
  fixtureFabrics,
  fixtureFiles,
  fixtureMarks,
  fixtureNames,
  fixturePieces,
  fixtureScale,
  fixtureSemantics,
  fixtureSizes,
  fixtureWrite,
  interliningSeeds,
} from './fixture';

type Session = {
  files: SourceFileInfo[];
  scale: ScaleDecision | null;
  classes: StageIO['chains']['out']['classes'];
  card: CardSize[];
  map: SizeMap | null;
  seeds: Seed[];
  families: PieceFamily[];
  semantics: StageIO['semantics']['out'] | null;
  assignment: FabricAssignment | null;
};

const LATENCY: Record<StageName, number> = {
  extract: 900,
  scale: 250,
  assemble: 1100,
  chains: 700,
  sizes: 250,
  pieces: 800,
  semantics: 600,
  fabrics: 300,
  'render-som': 500,
  write: 1200,
};

const NOTES: Partial<Record<StageName, string[]>> = {
  extract: ['reading pages', 'flattening curves', 'collecting text'],
  assemble: ['classifying pages', 'registering tiles', 'closing loops'],
  chains: ['joining dashes', 'recovering motifs', 'bundling sizes'],
  pieces: ['filling regions', 'snapping to walls', 'grading families'],
  write: ['writing blocks', 'embedding manifest', 'running the gate'],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createStubClient(): ImportClient {
  const sessions = new Map<number, Session>();
  let nextId = 1;
  let cancelled = 0;

  const sizeTokensOf = (s: Session) => new Set((s.card ?? []).map((c) => c.token.toLowerCase()));

  async function tick(stage: StageName, onProgress?: (p: StageProgress) => void) {
    const epoch = cancelled;
    const notes = NOTES[stage] ?? [stage];
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      if (epoch !== cancelled) throw new Error('cancelled');
      onProgress?.({ done: i, total: steps, note: notes[Math.floor((i / steps) * notes.length)] });
      await sleep(LATENCY[stage] / steps);
    }
    onProgress?.({ done: steps, total: steps });
  }

  return {
    kind: 'stub',
    async open(files) {
      await sleep(200);
      const id = nextId++;
      const info = fixtureFiles(files);
      sessions.set(id, {
        files: info,
        scale: null,
        classes: [],
        card: [],
        map: null,
        seeds: [],
        families: [],
        semantics: null,
        assignment: null,
      });
      return { sessionId: id, files: info };
    },
    async run(sessionId, stage, input, onProgress) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`no session ${sessionId}`);
      await tick(stage, onProgress);
      // One switch, typed per stage through the contract's StageIO.
      const out = ((): StageIO[StageName]['out'] => {
        switch (stage) {
          case 'extract':
            return fixtureExtract(s.files);
          case 'scale': {
            const i = input as StageIO['scale']['in'];
            s.scale = i.decision;
            return fixtureScale(i.decision);
          }
          case 'assemble': {
            const i = input as StageIO['assemble']['in'];
            return fixtureAssemble(i.override);
          }
          case 'chains': {
            const i = input as StageIO['chains']['in'];
            const o = fixtureChains(i.legend);
            s.classes = o.classes;
            return o;
          }
          case 'sizes': {
            const i = input as StageIO['sizes']['in'];
            s.card = i.card;
            const o = fixtureSizes(i.card, i.operatorMap, s.classes);
            s.map = o.map;
            return o;
          }
          case 'pieces': {
            const i = input as StageIO['pieces']['in'];
            const n = s.map?.entries.length ?? 5;
            const o = fixturePieces(i, n);
            s.seeds = o.seeds;
            s.families = o.families;
            return { seeds: o.seeds, families: o.families };
          }
          case 'render-som': {
            return {
              sheetPng: new Blob([], { type: 'image/png' }),
              crops: [],
              marks: fixtureMarks(s.families),
            };
          }
          case 'semantics': {
            const i = input as StageIO['semantics']['in'];
            const o = fixtureSemantics({
              input: i,
              seeds: s.seeds,
              families: s.families,
              map: s.map ?? { entries: [], unmapped: [] },
              sizeTokens: sizeTokensOf(s),
            });
            s.semantics = o;
            return o;
          }
          case 'fabrics': {
            const i = input as StageIO['fabrics']['in'];
            const o = fixtureFabrics(i.bom, s.seeds, s.semantics?.pieces ?? []);
            s.assignment = o;
            return o;
          }
          case 'write': {
            const i = input as StageIO['write']['in'];
            return fixtureWrite({
              input: i,
              specs: s.semantics?.pieces ?? [],
              seeds: s.seeds,
              techCardId: 0,
              sizeTokens: sizeTokensOf(s),
              sources: s.files,
              scale: s.scale,
            });
          }
          default:
            throw new Error(`stub: unknown stage ${String(stage)}`);
        }
      })();
      return out as never;
    },
    cancel() {
      cancelled++;
    },
    async close(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

/** F10 stand-in: the fixture's names, with the same auto-accept flagging the real one returns. */
export function createStubNamer(
  seedsOf: () => Seed[],
  familiesOf: () => PieceFamily[],
): NameSuggester {
  return async () => {
    await sleep(700);
    return fixtureNames(familiesOf(), seedsOf());
  };
}

const IDENTICAL = 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL';

/** F7 `buildDraft` stand-in — the same shape, so the apply step shows what the real one will write. */
export const stubBuildDraft: DraftBuilder = (write, { card, semantics, names }) => {
  const nameOf = new Map<number, NameDecision>(names.map((n) => [n.seed, n]));
  const bySeed = new Map<number, typeof semantics.pieces>();
  for (const p of semantics.pieces) bySeed.set(p.seed, [...(bySeed.get(p.seed) ?? []), p]);
  const fusedSeeds = new Set<number>();
  for (const sc of write.scopes)
    for (const mp of sc.manifest.pieces)
      if (mp.fused)
        fusedSeeds.add(semantics.pieces.find((x) => x.identity === mp.identity)?.seed ?? -1);
  const pieces: DraftPiece[] = [];
  const lineKeyOfSeed = new Map<number, string>();
  const pieceUpdates: { lineKey: string; cutSymmetry: string; reason: string }[] = [];
  for (const [seed, specs] of bySeed) {
    const display = nameOf.get(seed)?.displayName || specs[0].displayName;
    // C10: reuse an existing piece only when the name came from TEXT on the sheet, never on an AI
    // guess alone.
    const existing =
      specs[0].nameOrigin === 'text'
        ? card.existingPieces.find(
            (e) => e.name.trim().toLowerCase() === display.trim().toLowerCase(),
          )
        : undefined;
    const lineKey = existing?.lineKey ?? ulid();
    lineKeyOfSeed.set(seed, lineKey);
    if (existing && existing.cutSymmetry && existing.cutSymmetry !== IDENTICAL)
      pieceUpdates.push({
        lineKey,
        cutSymmetry: IDENTICAL,
        reason: specs[0].pairHand
          ? 'the drawing carries both hands'
          : 'the drawing carries the unfolded piece',
      });
    pieces.push({
      lineKey,
      name: display,
      piecesPerGarment: specs.reduce((n, s) => n + s.piecesPerGarment, 0),
      cutSymmetry: IDENTICAL,
      grainline: 'lengthwise',
      fused: fusedSeeds.has(seed),
      existingLineKey: existing?.lineKey ?? null,
    });
  }
  const aliases = write.scopes.flatMap((sc) =>
    sc.identities.map((identity) => ({
      scopeKey: sc.target.scopeKey,
      fabricPurpose: sc.target.fabricPurpose,
      bomLineKey: sc.target.bomLineKey,
      blockName: identity,
      pieceLineKey:
        lineKeyOfSeed.get(semantics.pieces.find((p) => p.identity === identity)?.seed ?? -1) ?? '',
    })),
  );
  return {
    techCardId: card.techCardId,
    scopes: write.scopes,
    pieces,
    aliases,
    pieceUpdates,
    downloads: write.scopes.map((s) => ({ filename: s.filename, dxfText: s.dxfText })),
  };
};

/** F7 `applyDraft` stand-in: walks the uploads with progress and writes NOTHING to the card. */
export const stubApplyDraft: ApplyDraftFn = async (draft, onProgress) => {
  const uploaded: { scopeKey: string; url: string; filename: string; sizeBytes: number }[] = [];
  for (const s of draft.scopes) {
    onProgress?.({ scopeKey: s.target.scopeKey, state: 'uploading' });
    await sleep(700);
    onProgress?.({ scopeKey: s.target.scopeKey, state: 'uploaded' });
    uploaded.push({
      scopeKey: s.target.scopeKey,
      url: `stub://${s.filename}`,
      filename: s.filename,
      sizeBytes: new Blob([s.dxfText]).size,
    });
  }
  return { ok: true, uploaded };
};

export { interliningSeeds };
export type { CardContext };
