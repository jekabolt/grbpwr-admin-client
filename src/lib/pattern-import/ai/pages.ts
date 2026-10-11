// A9 · THE AI PAGE-ROLE CALL (main thread; the thumbnails come from the worker's `render-pages`).
// One call per FILE over its pages (≤ 40; the AI sees the neighbours), not per page: render each
// page → upload as media (the namer's path) → ClassifyPatternPages → `AiPageHint`s the clean stage
// reads as evidence №1 (clean/page-roles.ts holds the rule).
//
// Never blocks the wizard: one timeout over the whole file (uploads + call), any failure is an
// honest 'unavailable' / 'timeout' / 'error' with a note — the run goes on as before, without the
// AI. Answers are cached by the file's sha256 + the mask revision the thumbnails were drawn with.
//
// The outside effects are injected (`PageRoleDeps`): the wizard wires `adminService`
// (components/…/pattern-import/ai-page-roles.ts), the probes wire the recorded fixture — nothing
// here imports `api/api`, and no probe reaches the network.
import type { AiPageHint, FileId, PageIndex, PageStats } from '../types';
import { AI_PAGES, aiRoleOf } from '../clean/page-roles';
import { UploadTracker, type Discard } from './discard';

// ── wire (mirrors the generated client's shape: camelCase, every field `| undefined`) ─────────

export type PatternPageEvidenceWire = {
  pageNo: number | undefined;
  mediaId: number | undefined;
  widthMm: number | undefined;
  heightMm: number | undefined;
  textExcerpt: string | undefined;
  lineLengthM: number | undefined;
  pieceSizedOutlines: number | undefined;
  hasTileMarks: boolean | undefined;
  textChars: number | undefined;
};

export type ClassifyPatternPagesRequestWire = {
  techCardId: number | undefined;
  fileName: string | undefined;
  pages: PatternPageEvidenceWire[] | undefined;
  languageHint: string | undefined;
  force: boolean | undefined;
};

export type PatternPageRoleWire = {
  pageNo?: number;
  /** "pattern_tile" … or the generated enum's spelling ("PATTERN_PAGE_ROLE_PATTERN_TILE"). */
  role?: string;
  confidence?: number;
  evidence?: string[];
};

export type ClassifyPatternPagesResponseWire = {
  pages?: PatternPageRoleWire[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  /** decimal string as the server sends it ("" = not reported) */
  costUsd?: string;
  warnings?: string[];
  cached?: boolean;
};

export type PageRoleDeps = {
  /**
   * false = these deps never look at pictures (the probes' recorded answers): the worker draws
   * none, nothing is uploaded, the media ids go as 0. Default true.
   */
  pictures?: boolean;
  /** Upload one thumbnail as media; resolves to its media id (> 0). */
  upload: (picture: Blob, what: string) => Promise<number>;
  /**
   * POST /api/admin/pattern-import/pages:classify. 'unavailable' = this client has no such RPC
   * (the generated client predates it, the backend has not landed).
   */
  classify: (
    req: ClassifyPatternPagesRequestWire,
  ) => Promise<ClassifyPatternPagesResponseWire> | 'unavailable';
  /**
   * Codex #5: delete the uploaded thumbnails once the call is over (best effort, never awaited by
   * the result) — they are not kept in the media library.
   */
  discard?: Discard;
};

/** One file's pages as the worker drew them (render-pages). */
export type PageThumb = PageStats & { png: Blob | null };

export type PageRoleStatus = 'ok' | 'unavailable' | 'timeout' | 'error' | 'skipped';

export type PageRoleResult = {
  status: PageRoleStatus;
  hints: AiPageHint[];
  /** For the files step: what happened, in words (never a stop). */
  note: string | null;
  cached?: boolean;
  costUsd?: string;
  model?: string;
};

export const PAGE_ROLE_TIMEOUT_MS = 45_000;

/** Server rule: every picture of one call together ≤ 32 Mpx (a margin kept under it). */
export const CALL_MAX_PIXELS = 30_000_000;
/** Server rule: the file name ≤ 200 runes. */
const FILE_NAME_RUNES = 200;

/**
 * The thumbnail's long side for a call of `n` pages: ≤ 1024 px (the server's cap on each
 * original) and small enough that n square pages stay under the call's pixel budget.
 */
export const thumbPxFor = (n: number) =>
  Math.max(
    256,
    Math.min(AI_PAGES.thumbPx, Math.floor(Math.sqrt(CALL_MAX_PIXELS / Math.max(1, n)))),
  );

/** "ru" / "pl" / "de" / "" from the pages' words — a hint for the prompt, never a decision. */
export function languageOf(text: string): string {
  if (/[а-яё]/i.test(text)) return 'ru';
  if (/[ąćęłńóśźż]/i.test(text)) return 'pl';
  if (/[äöüß]/i.test(text)) return 'de';
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return 'fr';
  return '';
}

/**
 * The pages one call sends (Codex #5): ONLY the pages in question (set aside holding line work, at
 * most `maxPages − 1`) plus ONE tile page of the file as the reference of what its pattern looks
 * like — the tile nearest the first page in question. Sent in page order. `left` = pages in
 * question left out.
 */
export function pagesForCall<T extends { page: PageIndex; cls?: string }>(
  pages: readonly T[],
  asked: ReadonlySet<PageIndex>,
  maxPages = AI_PAGES.maxPages,
): { pages: T[]; left: number } {
  const q = pages.filter((p) => asked.has(p.page)).sort((a, b) => a.page - b.page);
  const take = q.slice(0, Math.max(1, maxPages - 1));
  const at = take[0]?.page ?? 0;
  const ref = pages
    .filter((p) => p.cls === 'tile' && !asked.has(p.page))
    .sort((a, b) => Math.abs(a.page - at) - Math.abs(b.page - at))[0];
  return {
    pages: [...take, ...(ref ? [ref] : [])].sort((a, b) => a.page - b.page),
    left: q.length - take.length,
  };
}

const clamp01 = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

/** The answer → hints of this file (page_no is 1-based within the file; unknown pages dropped). */
export function hintsOf(
  file: FileId,
  res: ClassifyPatternPagesResponseWire,
  sent: ReadonlySet<PageIndex>,
): AiPageHint[] {
  const out: AiPageHint[] = [];
  const seen = new Set<number>();
  for (const r of res.pages ?? []) {
    const page = Number(r.pageNo) - 1;
    const role = aiRoleOf(r.role);
    if (!Number.isInteger(page) || !sent.has(page) || seen.has(page) || !role) continue;
    seen.add(page);
    out.push({
      file,
      page,
      role,
      confidence: clamp01(r.confidence),
      evidence: (r.evidence ?? []).slice(0, 3).map((e) => [...String(e)].slice(0, 120).join('')),
    });
  }
  return out;
}

/**
 * Codex #3: what the cache keeps is FILE-NEUTRAL — the wire answer and the pages it was asked
 * about (page indices within the file), never hints bound to a file id: the same file read again
 * as the second of two files gets its answer remapped to its current index on every read.
 */
type CachedCall = {
  status: PageRoleStatus;
  res: ClassifyPatternPagesResponseWire | null;
  /** 0-based page indices actually sent. */
  sent: number[];
  note: string | null;
  more: string;
};

const cache = new Map<string, Promise<CachedCall>>();
/** Tests and the probes: forget every cached answer. */
export const clearPageRoleCache = () => cache.clear();

class Timeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new Timeout(`no answer in ${Math.round(ms / 1000)} s`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

async function inBatches<T, R>(xs: readonly T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n)
    out.push(...(await Promise.all(xs.slice(i, i + n).map(f))));
  return out;
}

/** The cache key: sha256 + mask revision (`args.key`) + the ORDERED page set asked about. */
export const pageRoleKey = (key: string, pages: readonly { page: PageIndex }[]) =>
  `${key}|${pages.map((p) => p.page).join(',')}`;

/**
 * One file's call. `key` = the file's sha256 + the mask revision the thumbnails were drawn with;
 * with the ordered page set it answers from the cache (one paid call per file, mask and pages).
 */
export function classifyFilePages(
  args: {
    key: string;
    file: FileId;
    fileName: string;
    techCardId?: number;
    thumbs: readonly PageThumb[];
    /** Pages of the file left out of the call (> 40): said in the note. */
    left?: number;
    timeoutMs?: number;
  },
  deps: PageRoleDeps,
): Promise<PageRoleResult> {
  const key = pageRoleKey(args.key, args.thumbs);
  let p = cache.get(key);
  const hit = !!p;
  if (!p) {
    p = run(args, deps);
    cache.set(key, p);
    // a failure is not cached: the next run asks again
    void p.then((r) => {
      if (r.status !== 'ok') cache.delete(key);
    });
  }
  return p.then((c) => resultOf(c, args.file, hit));
}

/** A cached call → this read's result, its hints bound to the file's CURRENT index. */
function resultOf(c: CachedCall, file: FileId, hit: boolean): PageRoleResult {
  if (c.status !== 'ok' || !c.res) return { status: c.status, hints: [], note: c.note };
  const hints = hintsOf(file, c.res, new Set(c.sent));
  return {
    status: 'ok',
    hints,
    note: `AI page roles: ${hints.length} of ${c.sent.length} pages read${c.more}${hit ? ' (cached)' : ''}`,
    cached: hit || !!c.res.cached,
    ...(c.res.costUsd ? { costUsd: c.res.costUsd } : {}),
    ...(c.res.model ? { model: c.res.model } : {}),
  };
}

async function run(
  args: Parameters<typeof classifyFilePages>[0],
  deps: PageRoleDeps,
): Promise<CachedCall> {
  const pics = deps.pictures !== false;
  const thumbs = pics ? args.thumbs.filter((t) => t.png) : [...args.thumbs];
  const more = args.left
    ? ` — ${args.left} more ${args.left === 1 ? 'page' : 'pages'} of the file went without the AI (${AI_PAGES.maxPages} per call)`
    : '';
  const none = (status: PageRoleStatus, note: string | null): CachedCall => ({
    status,
    res: null,
    sent: [],
    note,
    more,
  });
  if (!thumbs.length) return none('skipped', null);
  // Codex re-check #2: every upload tracked — deleted when the call is over, or when it settles
  // after a timeout; no new upload starts once the call is over
  const uploads = new UploadTracker(deps.discard, `AI page roles, ${args.fileName}`);
  try {
    return await withTimeout(
      (async (): Promise<CachedCall> => {
        const ids = await inBatches(thumbs, 4, async (t) => {
          const id =
            pics && !uploads.closed
              ? await uploads.track(deps.upload(t.png!, `${args.fileName} page ${t.page + 1}`))
              : 0;
          return { t, id };
        });
        // server rule: every page its own media id — an upload the store deduplicated to an id
        // already sent (two identical blank tiles) goes without the AI
        const used = new Set<number>();
        const pages = ids
          .filter((x) => {
            if (!pics) return true;
            if (!(x.id > 0) || used.has(x.id)) return false;
            used.add(x.id);
            return true;
          })
          .map(({ t, id }) => ({
            pageNo: t.page + 1,
            mediaId: id,
            widthMm: Math.round(t.widthMm * 10) / 10,
            heightMm: Math.round(t.heightMm * 10) / 10,
            textExcerpt: t.textExcerpt,
            // Codex #1: none of our geometry goes to the AI — its answer must stay independent of
            // the geometric evidence it is combined with (the server fields are optional)
            lineLengthM: undefined,
            pieceSizedOutlines: undefined,
            hasTileMarks: undefined,
            textChars: undefined,
          }));
        if (!pages.length) throw new Error('no page thumbnail went up');
        const call = deps.classify({
          techCardId: args.techCardId || undefined,
          fileName: [...args.fileName].slice(0, FILE_NAME_RUNES).join(''),
          pages,
          languageHint: languageOf(thumbs.map((t) => t.textExcerpt).join(' ')),
          force: false,
        });
        if (call === 'unavailable')
          return none(
            'unavailable',
            'AI page roles: not available on this server yet — pages judged by their geometry',
          );
        const res = await call;
        return { status: 'ok', res, sent: pages.map((p) => p.pageNo - 1), note: null, more };
      })(),
      args.timeoutMs ?? PAGE_ROLE_TIMEOUT_MS,
    );
  } catch (e) {
    const timeout = e instanceof Timeout;
    return none(
      timeout ? 'timeout' : 'error',
      `AI page roles: ${timeout ? (e as Error).message : `unavailable (${e instanceof Error ? e.message : String(e)})`} — pages judged by their geometry`,
    );
  } finally {
    uploads.close();
  }
}
