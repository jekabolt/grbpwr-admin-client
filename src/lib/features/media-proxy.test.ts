import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMediaBlob } from './media-blob';
import { mediaProxyBase, mediaProxyHeaders } from './media-proxy';

const OBJECT = 'https://files.example.com/a b.dxf';
const store = new Map<string, string>();

describe('media proxy', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    store.clear();
    store.set('authToken', 'tok');
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    fetchMock.mockReset();
    // Direct read hits the CORS wall, the proxy answers.
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('bytes', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('variable unset → legacy same-origin /media-proxy, no auth headers', async () => {
    vi.stubEnv('VITE_MEDIA_PROXY_URL', '');
    expect(mediaProxyHeaders()).toEqual({});
    expect(mediaProxyBase()).toMatch(/\/media-proxy$/);

    await fetchMediaBlob(OBJECT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`${mediaProxyBase()}?url=${encodeURIComponent(OBJECT)}`);
    expect(init).toEqual({ signal: undefined });
  });

  it('variable set → backend proxy with the session token', async () => {
    vi.stubEnv('VITE_MEDIA_PROXY_URL', 'https://api.example.com/api/files/proxy');

    await fetchMediaBlob(OBJECT);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`https://api.example.com/api/files/proxy?url=${encodeURIComponent(OBJECT)}`);
    expect(init.headers['Grpc-Metadata-Authorization']).toBe('Bearer tok');
  });

  it('explicit headers (worker caller) win over localStorage', async () => {
    vi.stubEnv('VITE_MEDIA_PROXY_URL', 'https://api.example.com/api/files/proxy');

    await fetchMediaBlob(OBJECT, undefined, { 'Grpc-Metadata-Authorization': 'Bearer w' });

    expect(fetchMock.mock.calls[1][1].headers).toEqual({
      'Grpc-Metadata-Authorization': 'Bearer w',
    });
  });
});
