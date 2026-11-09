import { describe, expect, it } from 'vitest';

import type { CardSize, ManifestSize, SizeRun } from '../types';
import {
  crossKindQuestion,
  needsConfirmation,
  proposeSizeMap,
  sizeRunForCard,
  storedSizeMap,
} from './map';

const card = (...tokens: string[]): CardSize[] =>
  tokens.map((token, rank) => ({ sizeId: rank + 10, name: token.toLowerCase(), token, rank }));

const run = (...labels: string[]): SizeRun => ({
  encoding: 'dxf-block',
  sizes: labels.map((label, rank) => ({ label, rank, classId: null, file: null })),
  evidence: [],
});

const stored = (sourceLabel: string, target: CardSize, rank: number): ManifestSize => ({
  sourceLabel,
  token: target.token,
  sizeId: target.sizeId,
  name: target.name,
  rank,
});

describe('one-size card mapping', () => {
  it('creates the sole source rank when a fast-path sheet names no size', () => {
    const os = card('OS');
    const empty = run();

    const resolved = sizeRunForCard(empty, os, 'file-0');
    const mapped = proposeSizeMap(resolved, os);

    expect(resolved.sizes).toEqual([{ label: '', rank: 0, classId: null, file: 'file-0' }]);
    expect(mapped.entries[0].card).toBe(os[0]);
    expect(needsConfirmation(mapped)).toEqual([]);
  });

  it("maps one foreign sheet size to the card's only size without asking", () => {
    const os = card('OS');
    const mapped = proposeSizeMap(run('M'), os);

    expect(mapped.entries[0]).toMatchObject({ card: os[0], confidence: 1, origin: 'auto' });
    expect(crossKindQuestion(mapped, os)).toBeNull();
    expect(needsConfirmation(mapped)).toEqual([]);
  });

  it('does not collapse several sheet sizes onto one card size', () => {
    const mapped = proposeSizeMap(run('S', 'M'), card('OS'));

    expect(mapped.entries.map((entry) => entry.card)).toEqual([null, null]);
  });

  it('leaves an empty run and a guessed one-size map unchanged on a multi-size card', () => {
    const sizes = card('S', 'M', 'L');
    const empty = run();

    expect(sizeRunForCard(empty, sizes)).toBe(empty);
    const guessed = proposeSizeMap(run('38'), sizes);
    expect(guessed.entries[0]).toMatchObject({ card: sizes[1], confidence: 0.5 });
    expect(needsConfirmation(guessed)).toHaveLength(1);
  });
});

describe('stored size mapping', () => {
  it('reuses every source-to-card decision from the existing same-scope sheet', () => {
    const sizes = card('S', 'M', 'L');
    const previous = [
      stored('36', sizes[2], 0),
      stored('38', sizes[1], 1),
      stored('40', sizes[0], 2),
    ];

    const mapped = storedSizeMap(run('36', '38', '40'), sizes, [previous]);

    expect(mapped?.entries.map((entry) => entry.card?.token)).toEqual(['L', 'M', 'S']);
    expect(mapped?.entries.every((entry) => entry.origin === 'operator')).toBe(true);
    expect(mapped?.unmapped).toEqual([]);
  });

  it('falls back to source rank when the current sheet has no labels', () => {
    const sizes = card('S', 'M');
    const previous = [stored('36', sizes[0], 0), stored('38', sizes[1], 1)];

    expect(
      storedSizeMap(run('', ''), sizes, [previous])?.entries.map((e) => e.card?.token),
    ).toEqual(['S', 'M']);
  });

  it('refuses conflicting equally good stored decisions', () => {
    const sizes = card('S', 'M');
    const forward = [stored('36', sizes[0], 0), stored('38', sizes[1], 1)];
    const reverse = [stored('36', sizes[1], 0), stored('38', sizes[0], 1)];

    expect(storedSizeMap(run('36', '38'), sizes, [forward, reverse])).toBeNull();
  });
});
