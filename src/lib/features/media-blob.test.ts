import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMediaBlob } from './media-blob';

const PROXY = 'https://api.example.com/api/files/proxy';
const OBJECT = 'https://files.example.com/b/t/0123/main.dxf';

describe('fetchMediaBlob', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('localStorage', {
      getItem: () => 'tok',
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_MEDIA_PROXY_URL', PROXY);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('a private object (403 on the bare url) is read through the proxy', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('denied', { status: 403 }))
      .mockResolvedValueOnce(new Response('bytes', { status: 200 }));

    const blob = await fetchMediaBlob(OBJECT);

    expect(await blob.text()).toBe('bytes');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${PROXY}?url=${encodeURIComponent(OBJECT)}`);
    expect(fetchMock.mock.calls[1][1].headers['Grpc-Metadata-Authorization']).toBe('Bearer tok');
  });

  it('a proxy url that answers 403 is not retried', async () => {
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));

    await expect(fetchMediaBlob(`${PROXY}?url=${encodeURIComponent(OBJECT)}`)).rejects.toThrow(
      '403',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('other statuses fail without the proxy', async () => {
    fetchMock.mockResolvedValueOnce(new Response('gone', { status: 404 }));

    await expect(fetchMediaBlob(OBJECT)).rejects.toThrow('404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an abort is not retried through the proxy', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await expect(fetchMediaBlob(OBJECT, controller.signal)).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
