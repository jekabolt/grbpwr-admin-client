import { expect, it } from 'vitest';
import {
  armReuploadSnapshot,
  consumeReuploadSnapshot,
  peekReuploadSnapshot,
} from './reupload-session';

const oldUrl = 'mem://review/old-outline.dxf';
const newUrl = 'mem://review/new-outline.dxf';
const clock = 'asm:v1:0123456789abcdef0123456789abcdef:7';

it('pins the card lock and Assembly revision to the reviewed replacement until confirmation', () => {
  const cardId = 269;
  const guard = { expectedLockVersion: 4, expectedServerAssemblyRevision: clock };
  armReuploadSnapshot(cardId, newUrl, oldUrl, guard);
  guard.expectedLockVersion = 5;
  expect(peekReuploadSnapshot(cardId, [oldUrl])).toBeNull();
  const review = peekReuploadSnapshot(cardId, [newUrl]);
  expect(review?.assemblyGuard).toEqual({
    expectedLockVersion: 4,
    expectedServerAssemblyRevision: clock,
  });
  expect(peekReuploadSnapshot(cardId, [newUrl])).toEqual(review);
  consumeReuploadSnapshot(cardId, review);
  expect(peekReuploadSnapshot(cardId, [newUrl])).toBeNull();
});

it('refuses to combine replacements reviewed against different Assembly revisions', () => {
  const cardId = 270;
  const second = 'mem://review/second-outline.dxf';
  const guard = { expectedLockVersion: 4, expectedServerAssemblyRevision: clock };
  armReuploadSnapshot(cardId, newUrl, oldUrl, guard);
  armReuploadSnapshot(cardId, second, undefined, {
    ...guard,
    expectedServerAssemblyRevision: clock.replace(/7$/, '8'),
  });
  expect(() => peekReuploadSnapshot(cardId, [newUrl, second])).toThrow(
    /different Assembly revisions/,
  );
  const latest = peekReuploadSnapshot(cardId, [newUrl]);
  expect(latest?.assemblyGuard).toEqual(guard);
  consumeReuploadSnapshot(cardId, latest);
  consumeReuploadSnapshot(cardId, peekReuploadSnapshot(cardId, [second]));
});
