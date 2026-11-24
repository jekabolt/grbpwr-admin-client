import { describe, expect, it } from 'vitest';

import { isVideo } from './filterContentType';

const CLIP = 'https://lekalo-beta.fra1.digitaloceanspaces.com/b/t/abc/b/2026/november/x.mp4';
const PICTURE = 'https://lekalo-beta.fra1.digitaloceanspaces.com/b/t/abc/b/2026/november/x.webp';
const SIGNED =
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20261122%2Ffra1%2Fs3%2Faws4_request&X-Amz-Date=20261122T120000Z&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&X-Amz-Signature=ab.cd';

describe('isVideo', () => {
  it('reads the extension of the path', () => {
    expect(isVideo(CLIP)).toBe(true);
    expect(isVideo(PICTURE)).toBe(false);
  });

  it('ignores a signed query and an anchor', () => {
    expect(isVideo(CLIP + SIGNED)).toBe(true);
    expect(isVideo(PICTURE + SIGNED)).toBe(false);
    expect(isVideo(PICTURE + '?name=a.mp4')).toBe(false);
    expect(isVideo(CLIP + '#t=2')).toBe(true);
  });

  it('handles relative paths and empty values', () => {
    expect(isVideo('/media/clip.webm?v=1')).toBe(true);
    expect(isVideo('clip')).toBe(false);
    expect(isVideo('')).toBe(false);
    expect(isVideo(null)).toBe(false);
    expect(isVideo(undefined)).toBe(false);
  });
});
