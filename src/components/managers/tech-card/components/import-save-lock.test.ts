// T3 (09.11, card 6): two pattern imports in a row. The second apply's save heard a 409 because the
// card's version moved under the page by the page's OWN background write (the automatic piece-area
// measurement after the first import bumps tech_card.lock_version and touches no body field). The
// body write now re-reads on a 409 and, when only the version moved, sends the same body once more
// (index.tsx `versionOnlyMoved`); a moved body stays the conflict decision.
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import { applyDraft, type LiveCard } from 'lib/pattern-import/fabrics/apply';
import type { CardDraft } from 'lib/pattern-import/types';
import { writeOverOnlyVersionMoved } from 'lib/fusing-dxf/regenerate';
import { describe, expect, it } from 'vitest';
import { rebuildReadOnlyVersionMoved } from './nesting/fusing-sheets-stage';
import { importRowsLanded } from './pattern-import/card-apply';
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

// T3 (09.11, beta card 124, build 2bf0f74e9): the body write is 200 (v4→5); the fusing rebuild reads
// the card at v5; the piece-area POST bumps v5→6; the sheets upload; the rebuild's write claims v5
// and hears 409. The rebuild now re-reads and, when only the version moved, writes once more.
describe('the fusing rebuild after an import (T3)', () => {
  const sheet = { url: 'https://cdn.test/fuse.dxf', lineKey: 'F1', fabricPurpose: 'interlining' };
  const rebuild = async (server: ReturnType<typeof fakeServer>, between: () => void) => {
    const read = server.get(); // regenerate.ts: GetTechCard
    between(); // while the sheets upload
    const put = async (expected: number) => {
      const r = server.put(expected, [
        ...((read.techCard?.patterns ?? []) as Row[]),
        sheet as unknown as Row,
      ]);
      if (r === 409) throw Object.assign(new Error('lock version mismatch'), { status: 409 });
    };
    return writeOverOnlyVersionMoved(read, put, rebuildReadOnlyVersionMoved, async () =>
      server.get(),
    );
  };

  it('body 200 → piece-area bump → rebuild 409 → re-sent → saved', async () => {
    const server = fakeServer(cardAt(4, []));
    const page = fakePage(server);
    const a = await importOnce(page, 'main', 'main.dxf');
    expect(a).toMatchObject({ ok: true, save: 'ok' });
    expect(server.get().lockVersion).toBe(5);
    const wroteOver = await rebuild(server, () => server.bump());
    expect(wroteOver).toBe(6);
    expect(server.get().lockVersion).toBe(7);
    expect((server.get().techCard?.patterns ?? []).map((p) => p.url)).toEqual([
      'https://cdn.test/main.dxf',
      'https://cdn.test/fuse.dxf',
    ]);
  });

  it('no bump: one write, no re-read', async () => {
    const server = fakeServer(cardAt(4, []));
    expect(await rebuild(server, () => {})).toBe(4);
    expect(server.get().lockVersion).toBe(5);
  });

  it('a real concurrent body edit while it runs: the 409 stands, their row kept', async () => {
    const server = fakeServer(cardAt(4, []));
    const page = fakePage(server);
    await importOnce(page, 'main', 'main.dxf');
    const theirs = [
      ...((server.get().techCard?.patterns ?? []) as Row[]),
      {
        url: 'https://cdn.test/theirs.dxf',
        lineKey: 'T1',
        fabricPurpose: 'lining',
      } as unknown as Row,
    ];
    await expect(rebuild(server, () => server.edit(theirs))).rejects.toMatchObject({ status: 409 });
    expect((server.get().techCard?.patterns ?? []).map((p) => p.url)).toEqual([
      'https://cdn.test/main.dxf',
      'https://cdn.test/theirs.dxf',
    ]);
  });

  it('a second 409 after the re-send is not retried again', async () => {
    const server = fakeServer(cardAt(4, []));
    const read = server.get();
    let puts = 0;
    const put = async () => {
      puts++;
      server.bump();
      throw Object.assign(new Error('lock version mismatch'), { status: 409 });
    };
    await expect(
      writeOverOnlyVersionMoved(read, put, rebuildReadOnlyVersionMoved, async () => server.get()),
    ).rejects.toMatchObject({ status: 409 });
    expect(puts).toBe(2);
  });
});

// T3: the body with the import saved, the fusing rebuild after it failed — the flush answers
// 'conflict', yet the wizard must say the card saved and the fusing sheet is owed, and never call
// the saved pattern file unused.
describe('import saved, a write after the body failed (T3)', () => {
  /** The page whose body write lands and whose fusing panel after it fails. */
  function pageWhoseRebuildFails(server: ReturnType<typeof fakeServer>, bodyLands: boolean) {
    const page = fakePage(server);
    let baseline: LiveCard = structuredClone(page.form);
    return {
      ...page,
      save: async () => {
        if (bodyLands) {
          await page.save();
          baseline = structuredClone(page.form); // settleAfterBodySave moves the baseline
        }
        return 'conflict';
      },
      landed: (urls: string[]) =>
        importRowsLanded(
          {
            patterns: page.form.patterns,
            pieces: page.form.pieces,
            pieceDxfAliases: page.form.aliases,
          },
          {
            patterns: baseline.patterns,
            pieces: baseline.pieces,
            pieceDxfAliases: baseline.aliases,
          },
          urls,
        )
          ? { owed: 'fusing' as const }
          : null,
    };
  }
  const apply = (p: ReturnType<typeof pageWhoseRebuildFails>, unsaved: { v: boolean }) =>
    applyDraft(draftOf('main', 'main.dxf'), {
      upload: async (f) => ({
        url: `https://cdn.test/${f.filename}`,
        filename: f.filename,
        sizeBytes: 1,
      }),
      read: p.read,
      write: p.write,
      storageSizeId: 501,
      scopeOf: (row) => row.fabricPurpose ?? '',
      save: p.save,
      landed: p.landed,
      unsaved: { get: () => unsaved.v, set: (v) => (unsaved.v = v) },
      mintKey: () => 'K1',
    });

  it('the body landed: card saved, fusing owed', async () => {
    const server = fakeServer(cardAt(4, []));
    const unsaved = { v: false };
    const r = await apply(pageWhoseRebuildFails(server, true), unsaved);
    expect(r).toMatchObject({ ok: true, save: 'ok', owed: 'fusing', writes: 1 });
    expect(unsaved.v).toBe(false);
    expect((server.get().techCard?.patterns ?? []).map((p) => p.url)).toEqual([
      'https://cdn.test/main.dxf',
    ]);
  });

  it('the body did not land: not saved, as before', async () => {
    const server = fakeServer(cardAt(4, []));
    const unsaved = { v: false };
    const r = await apply(pageWhoseRebuildFails(server, false), unsaved);
    expect(r.ok).toBe(false);
    expect(unsaved.v).toBe(true);
  });

  it('importRowsLanded: dirty rows or a url missing from the saved sheets → not landed', () => {
    const row = { url: 'u1', lineKey: 'L1' };
    expect(importRowsLanded({ patterns: [row] }, { patterns: [row] }, ['u1'])).toBe(true);
    expect(importRowsLanded({ patterns: [row] }, { patterns: [row] }, ['u2'])).toBe(false);
    expect(importRowsLanded({ patterns: [row] }, { patterns: [] }, ['u1'])).toBe(false);
  });
});
