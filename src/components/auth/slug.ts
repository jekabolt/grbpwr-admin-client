// The team address as the sign-up sheet checks it before asking the server (design §5).

export type SlugStatus = 'empty' | 'free' | 'taken' | 'bad' | 'checking';

export interface SlugCheck {
  slug: string;
  status: SlugStatus;
  /** The word shown beside the address: free · taken · latin only · edge dash · 3+ letters · too long. */
  word: string;
}

export const SLUG_MAX = 30;

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/-+/g, '-');
}

/** The client-side verdict; `free` here only means «worth asking the server». */
export function checkSlug(slug: string): SlugCheck {
  if (!slug) return { slug, status: 'empty', word: '' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { slug, status: 'bad', word: 'latin only' };
  if (/^-|-$/.test(slug)) return { slug, status: 'bad', word: 'edge dash' };
  if (slug.length < 3) return { slug, status: 'bad', word: '3+ letters' };
  if (slug.length > SLUG_MAX) return { slug, status: 'bad', word: 'too long' };
  return { slug, status: 'free', word: 'free' };
}
