import type { common_MediaFull, LibraryItem } from 'api/proto-http/admin';
import { describe, expect, it, vi } from 'vitest';
import { fileRef, mediaRef, splitRefs, visualKinds } from './refs';
import { resolveRefsToMedia } from './use-copy-to-media';

vi.mock('api/api', () => ({ adminService: {} }));

const media = (id: number): common_MediaFull =>
  ({ id, media: { thumbnail: { mediaUrl: `https://cdn/m${id}.jpg` } } }) as common_MediaFull;

const mediaItem = (id: number): LibraryItem =>
  ({ ref: { source: 'LIBRARY_SOURCE_MEDIA', id }, media: media(id) }) as unknown as LibraryItem;

const fileItem = (id: number, name = `f${id}.jpg`): LibraryItem =>
  ({ ref: { source: 'LIBRARY_SOURCE_FILE', id }, name }) as unknown as LibraryItem;

describe('visualKinds (MediaSelector props → kinds)', () => {
  it('defaults: pictures, vectors (a photo slot took an svg on beta), 3D and video', () => {
    expect(visualKinds({})).toEqual([
      'LIBRARY_KIND_IMAGE',
      'LIBRARY_KIND_VECTOR',
      'LIBRARY_KIND_MODEL',
      'LIBRARY_KIND_VIDEO',
    ]);
  });
  it('showVideos=false drops video', () => {
    expect(visualKinds({ showVideos: false })).toEqual([
      'LIBRARY_KIND_IMAGE',
      'LIBRARY_KIND_VECTOR',
      'LIBRARY_KIND_MODEL',
    ]);
  });
  it('allowSvg changes nothing in the list', () => {
    expect(visualKinds({ allowSvg: true, showVideos: false })).toEqual([
      'LIBRARY_KIND_IMAGE',
      'LIBRARY_KIND_VECTOR',
      'LIBRARY_KIND_MODEL',
    ]);
  });
  it('vectorOnly is vectors and nothing else', () => {
    expect(visualKinds({ vectorOnly: true, showVideos: true, allowSvg: false })).toEqual([
      'LIBRARY_KIND_VECTOR',
    ]);
  });
});

describe('splitRefs (task: MEDIA → media ids, FILE → fileIds)', () => {
  it('keeps the order within each side and the loaded media rows', () => {
    const refs = [fileRef(3), mediaRef(10), fileRef(1), mediaRef(11), fileRef(3)];
    const out = splitRefs(refs, [mediaItem(10), fileItem(3)]);
    expect(out.fileIds).toEqual([3, 1]);
    expect(out.mediaIds).toEqual([10, 11]);
    // 11 was held before the window opened: no row, still kept by id.
    expect(out.media.map((m) => m.id)).toEqual([10]);
  });
  it('empty selection', () => {
    expect(splitRefs([], [])).toEqual({ mediaIds: [], fileIds: [], media: [] });
  });
});

describe('resolveRefsToMedia', () => {
  it('copies FILE refs sequentially, keeps the order of selection', async () => {
    const calls: number[] = [];
    let running = 0;
    const copy = vi.fn(async (fileId: number) => {
      running += 1;
      expect(running).toBe(1);
      calls.push(fileId);
      await Promise.resolve();
      running -= 1;
      return { media: media(100 + fileId), existed: false };
    });
    const refs = [fileRef(2), mediaRef(5), fileRef(1)];
    const out = await resolveRefsToMedia(refs, [fileItem(2), mediaItem(5), fileItem(1)], {
      copy,
      cache: new Map(),
    });
    expect(calls).toEqual([2, 1]);
    expect(out.media.map((m) => m.id)).toEqual([102, 5, 101]);
    expect(out.origins).toEqual(refs);
    expect(out.copied).toBe(2);
    expect(out.failed).toEqual([]);
  });

  it('a failure drops only that ref and names it', async () => {
    const copy = vi.fn(async (fileId: number) => {
      if (fileId === 2) throw new Error('rpc error: not_copyable');
      return { media: media(100 + fileId), existed: false };
    });
    const out = await resolveRefsToMedia(
      [fileRef(1), fileRef(2), fileRef(3)],
      [fileItem(1), fileItem(2, 'scan.pdf'), fileItem(3)],
      { copy, cache: new Map() },
    );
    expect(out.media.map((m) => m.id)).toEqual([101, 103]);
    expect(out.failed).toEqual([{ ref: fileRef(2), name: 'scan.pdf', word: 'not a picture' }]);
  });

  it('an unknown failure says «not copied»', async () => {
    const copy = vi.fn(async () => {
      throw new Error('boom');
    });
    const out = await resolveRefsToMedia([fileRef(4)], [fileItem(4)], { copy, cache: new Map() });
    expect(out.failed[0].word).toBe('not copied');
    expect(out.media).toEqual([]);
  });

  it('never copies a file twice: cache and held rows answer first', async () => {
    const copy = vi.fn(async (fileId: number) => ({ media: media(100 + fileId), existed: true }));
    const cache = new Map<number, common_MediaFull>();
    await resolveRefsToMedia([fileRef(1)], [fileItem(1)], { copy, cache });
    const again = await resolveRefsToMedia([fileRef(1), fileRef(2)], [], {
      copy,
      cache,
      known: new Map([['f:2', media(202)]]),
    });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(again.media.map((m) => m.id)).toEqual([101, 202]);
    expect(again.copied).toBe(0);
  });

  it('a held MEDIA ref the browser has not loaded passes through from known', async () => {
    const copy = vi.fn();
    const out = await resolveRefsToMedia([mediaRef(7), mediaRef(8)], [], {
      copy,
      cache: new Map(),
      known: new Map([['m:7', media(7)]]),
    });
    expect(out.media.map((m) => m.id)).toEqual([7]);
    expect(copy).not.toHaveBeenCalled();
  });
});
