import { describe, expect, it } from 'vitest';

import { seamRefresher } from './seam-refresh';

const deferred = () => {
  let done!: () => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    done = res;
    fail = rej;
  });
  return { promise, done, fail };
};

describe('seam list refresh, one per card (C5)', () => {
  it('a second card reads its own list instead of waiting on the first card read', async () => {
    const reads: number[] = [];
    const slow = deferred();
    const refresh = seamRefresher((cardId) => {
      reads.push(cardId);
      return cardId === 1 ? slow.promise : Promise.resolve();
    });
    const one = refresh(1);
    await expect(refresh(2)).resolves.toBe(true);
    expect(reads).toEqual([1, 2]);
    slow.done();
    await expect(one).resolves.toBe(true);
  });

  it('writes queued on one card share one read', async () => {
    let reads = 0;
    const slow = deferred();
    const refresh = seamRefresher(() => {
      reads += 1;
      return slow.promise;
    });
    const both = Promise.all([refresh(7), refresh(7)]);
    slow.done();
    await expect(both).resolves.toEqual([true, true]);
    expect(reads).toBe(1);
    await refresh(7);
    expect(reads).toBe(2);
  });

  it('a failed read says so, and the next write reads again', async () => {
    let calls = 0;
    const refresh = seamRefresher(() =>
      ++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(),
    );
    await expect(refresh(3)).resolves.toBe(false);
    await expect(refresh(3)).resolves.toBe(true);
  });
});
