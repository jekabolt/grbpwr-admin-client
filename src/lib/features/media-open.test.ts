import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaInNewTab, typedMediaBlob } from './media-open';

const PROXY = 'https://api.example.com/api/files/proxy';
const PDF = 'https://files.example.com/b/t/0123/sheet.pdf';
const HERE = { hostname: 'admin.example.com', origin: 'https://admin.example.com' };

describe('media open', () => {
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
    vi.restoreAllMocks();
  });

  it('a private PDF opens as a typed blob url, never as its bare url', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('denied', { status: 403 }))
      .mockResolvedValueOnce(new Response('%PDF', { status: 200 }));
    const replace = vi.fn();
    const tab = { opener: {}, location: { replace }, close: vi.fn() };
    const open = vi.fn().mockReturnValue(tab);
    vi.stubGlobal('window', { open, location: HERE });
    const made: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      made.push(b as Blob);
      return 'blob:x';
    });

    await openMediaInNewTab(PDF);

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(fetchMock.mock.calls[1][0]).toBe(`${PROXY}?url=${encodeURIComponent(PDF)}`);
    expect(replace).toHaveBeenCalledWith('blob:x');
    expect(tab.opener).toBeNull();
    expect(made[0].type).toBe('application/pdf');
  });

  it('a failed read closes the tab it opened', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('denied', { status: 403 }))
      .mockResolvedValueOnce(new Response('denied', { status: 403 }));
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(tab), location: HERE });

    await expect(openMediaInNewTab(PDF)).rejects.toThrow('403');
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('types only PDFs', () => {
    const png = new Blob(['x'], { type: 'image/png' });
    expect(typedMediaBlob('https://f/x.png', png)).toBe(png);
    const pdf = new Blob(['x'], { type: 'application/pdf' });
    expect(typedMediaBlob(PDF, pdf)).toBe(pdf);
    const raw = new Blob(['x'], { type: 'application/octet-stream' });
    expect(typedMediaBlob('https://f/x.dxf', raw)).toBe(raw);
    expect(typedMediaBlob(`${PDF}?v=2`, raw).type).toBe('application/pdf');
  });
});
