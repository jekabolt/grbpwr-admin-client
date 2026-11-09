// T3 (09.11, card 6): two pattern imports in a row. The second apply's save heard a 409 because the
// card's version moved under the page by the page's OWN background write (the automatic piece-area
// measurement after the first import bumps tech_card.lock_version and touches no body field). The
// body write now re-reads on a 409 and, when only the version moved, sends the same body once more
// (index.tsx `versionOnlyMoved`); a moved body stays the conflict decision.
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import { applyDraft, type LiveCard } from 'lib/pattern-import/fabrics/apply';
import type { CardDraft } from 'lib/pattern-import/types';
import { describe, expect, it } from 'vitest';
import { onlyVersionMoved, type CardBase } from './useTechCardAutosave';

type Row = NonNullable<common_TechCardInsert['patterns']>[number];

const cardAt = (lockVersion: number, patterns: Row[], name = 'test shirt'): common_TechCard =>
  ({
    id: 38,
    lockVersion,
    techCard: { name, patterns } as unknown as common_TechCardInsert,
  }) as unknown as common_TechCard;

/** The server: one card, one optimistic lock. */
function fakeServer(start: common_TechCard) {
  let card = structuredClone(start);
  return {
    get: () => structuredClone(card),
    put(expected: number, patterns: Row[]): 'ok' | 409 {
      if (expected !== (card.lockVersion ?? 0)) return 409;
      card = cardAt((card.lockVersion ?? 0) + 1, patterns, card.techCard?.name ?? '');
      return 'ok';
    },
    /** A write that moves only the version (SaveTechCardPieceAreas, a panel). */
    bump() {
      card = { ...card, lockVersion: (card.lockVersion ?? 0) + 1 };
    },
    /** Another editor's body write. */
    edit(patterns: Row[]) {
      card = cardAt((card.lockVersion ?? 0) + 1, patterns, card.techCard?.name ?? '');
    },
  };
}

/**
 * The page's body write as index.tsx does it: claim the version it stands on; on a 409 read the card,
 * and when only the version moved stand on it and send the same body once more — else the conflict.
 */
function fakePage(server: ReturnType<typeof fakeServer>) {
  const first = server.get();
  let base: CardBase = { version: first.lockVersion ?? 0, card: first };
  const form: LiveCard = {
    patterns: (first.techCard?.patterns ?? []) as LiveCard['patterns'],
    pieces: [],
    aliases: [],
  };
  const save = async (): Promise<string> => {
    for (let retried = false; ; retried = true) {
      const r = server.put(base.version, form.patterns as Row[]);
      if (r === 'ok') {
        const fresh = server.get();
        base = { version: fresh.lockVersion ?? 0, card: fresh };
        return 'ok';
      }
      const fresh = server.get();
      if (retried || !onlyVersionMoved(base, fresh, true)) return 'conflict';
      base = { version: fresh.lockVersion ?? 0, card: fresh };
    }
  };
  return {
    form,
    read: () => structuredClone(form),
    write: (path: string, value: unknown) => {
      if (path === 'patterns') form.patterns = structuredClone(value) as LiveCard['patterns'];
      if (path === 'pieces') form.pieces = structuredClone(value) as LiveCard['pieces'];
      if (path === 'pieceDxfAliases') form.aliases = structuredClone(value) as LiveCard['aliases'];
    },
    save,
  };
}

const draftOf = (scopeKey: string, filename: string): CardDraft => ({
  techCardId: 38,
  scopes: [
    {
      target: {
        scopeKey,
        fabricPurpose: scopeKey,
        bomLineKey: '',
        label: scopeKey,
        isInterlining: false,
      },
      filename,
      name: filename,
      dxfText: `0\nEOF\n${filename}`,
      manifest: { pieces: [] } as unknown as CardDraft['scopes'][number]['manifest'],
      identities: [],
    },
  ],
  pieces: [],
  aliases: [],
  pieceUpdates: [],
  downloads: [],
});

async function importOnce(page: ReturnType<typeof fakePage>, scopeKey: string, filename: string) {
  let n = 0;
  return applyDraft(draftOf(scopeKey, filename), {
    upload: async (f) => ({
      url: `https://cdn.test/${f.filename}`,
      filename: f.filename,
      sizeBytes: f.text.length,
    }),
    read: page.read,
    write: page.write,
    storageSizeId: 501,
    scopeOf: (row) => row.fabricPurpose ?? '',
    save: page.save,
    mintKey: () => `K${++n}-${filename}`,
  });
}

describe('two pattern imports in a row (T3)', () => {
  it('a version-only bump between them: the second import saves on the first click', async () => {
    const server = fakeServer(cardAt(10, []));
    const page = fakePage(server);
    const a = await importOnce(page, 'main', 'all_sizes_men_shirt.dxf');
    expect(a).toMatchObject({ ok: true, save: 'ok' });
    // the page's own background write after import A: the piece-area measurement bumps the version
    server.bump();
    const b = await importOnce(page, 'pocketing', 'all_sizes_pockets_men_shirt.dxf');
    expect(b).toMatchObject({ ok: true, save: 'ok' });
    const urls = (server.get().techCard?.patterns ?? []).map((p) => p.url);
    expect(urls).toEqual([
      'https://cdn.test/all_sizes_men_shirt.dxf',
      'https://cdn.test/all_sizes_pockets_men_shirt.dxf',
    ]);
    expect(server.get().lockVersion).toBe(13);
  });

  it('the same file twice with a bump between: still one row, no conflict', async () => {
    const server = fakeServer(cardAt(4, []));
    const page = fakePage(server);
    expect(await importOnce(page, 'main', 'a.dxf')).toMatchObject({ ok: true, save: 'ok' });
    server.bump();
    expect(await importOnce(page, 'main', 'b.dxf')).toMatchObject({ ok: true, save: 'ok' });
    expect((server.get().techCard?.patterns ?? []).map((p) => p.url)).toEqual([
      'https://cdn.test/b.dxf',
    ]);
  });

  it('a real concurrent edit of the body between them: the conflict, nothing overwritten', async () => {
    const server = fakeServer(cardAt(10, []));
    const page = fakePage(server);
    expect(await importOnce(page, 'main', 'a.dxf')).toMatchObject({ ok: true, save: 'ok' });
    const theirs = [
      ...((server.get().techCard?.patterns ?? []) as Row[]),
      {
        url: 'https://cdn.test/theirs.dxf',
        lineKey: 'T1',
        fabricPurpose: 'lining',
      } as unknown as Row,
    ];
    server.edit(theirs);
    const b = await importOnce(page, 'pocketing', 'p.dxf');
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.failedScope).toBe('');
      expect(b.message).toBe(
        'the card did not save (conflict) — the rows are in the form; apply again to save them',
      );
    }
    expect((server.get().techCard?.patterns ?? []).map((p) => p.url)).toEqual([
      'https://cdn.test/a.dxf',
      'https://cdn.test/theirs.dxf',
    ]);
  });
});

describe('onlyVersionMoved', () => {
  const row = { url: 'u1', lineKey: 'L1', fabricPurpose: 'main' } as unknown as Row;
  it('true when the body is the same and the version is newer', () => {
    expect(onlyVersionMoved({ version: 5, card: cardAt(5, [row]) }, cardAt(6, [row]), true)).toBe(
      true,
    );
  });
  it('false when the body moved', () => {
    const moved = cardAt(6, [row, { url: 'u2', lineKey: 'L2' } as unknown as Row]);
    expect(onlyVersionMoved({ version: 5, card: cardAt(5, [row]) }, moved, true)).toBe(false);
  });
  it('false when the read is not newer', () => {
    expect(onlyVersionMoved({ version: 5, card: cardAt(5, [row]) }, cardAt(5, [row]), true)).toBe(
      false,
    );
  });
});
