import { describe, expect, it } from 'vitest';

import type { TopstitchBomLine, TopstitchOperation } from './topstitch-lines';
import { threadPerMmToPrefill } from './topstitch-thread-fields';

const thread = (threadPerMm?: string) =>
  ({ lineKey: 'thread-a', threadPerMm }) as unknown as TopstitchBomLine;
const op = (...lineKeys: string[]) =>
  ({
    topstitchLines: lineKeys.map((lineKey) => ({ lineKey, bomLineKey: 'thread-a' })),
  }) as unknown as TopstitchOperation;

describe('threadPerMmToPrefill', () => {
  it('fills the workshop factor when the first line of a thread is picked', () => {
    expect(threadPerMmToPrefill([thread()], [op('new')], [op()])).toEqual([0]);
  });

  it('leaves a loaded card with no factor empty: opening must not write 2.5', () => {
    expect(threadPerMmToPrefill([thread()], [op('saved')], [op('saved')])).toEqual([]);
  });

  it('leaves a cleared factor empty when another line is added to the same thread', () => {
    expect(threadPerMmToPrefill([thread()], [op('saved', 'new')], [op('saved')])).toEqual([]);
    expect(threadPerMmToPrefill([thread('')], [op('new')], [op()])).toEqual([]);
  });
});
