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
  costUsd?: number;
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
  costUsd?: number;
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
 * The pages one call sends: the pages in question first (set aside holding line work), then the
 * rest in page order, at most `maxPages`; sent in page order.
 */
export function pagesForCall<T extends { page: PageIndex }>(
  pages: readonly T[],
  asked: ReadonlySet<PageIndex>,
  maxPages = AI_PAGES.maxPages,
): { pages: T[]; left: number } {
  const first = pages.filter((p) => asked.has(p.page));
  const rest = pages.filter((p) => !asked.has(p.page));
  const take = [...first, ...rest].slice(0, maxPages).sort((a, b) => a.page - b.page);
  return { pages: take, left: pages.length - take.length };
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

const cache = new Map<string, Promise<PageRoleResult>>();
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

/**
 * One file's call. `key` = the file's sha256 + the mask revision the thumbnails were drawn with:
 * the same key answers from the cache (one paid call per file and mask).
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
  const hit = cache.get(args.key);
  if (hit) return hit.then((r) => ({ ...r, cached: true }));
  const p = run(args, deps);
  cache.set(args.key, p);
  // a failure is not cached: the next run asks again
  void p.then((r) => {
    if (r.status !== 'ok') cache.delete(args.key);
  });
  return p;
}

async function run(
  args: Parameters<typeof classifyFilePages>[0],
  deps: PageRoleDeps,
): Promise<PageRoleResult> {
  const pics = deps.pictures !== false;
  const thumbs = pics ? args.thumbs.filter((t) => t.png) : [...args.thumbs];
  if (!thumbs.length) return { status: 'skipped', hints: [], note: null };
  const more = args.left
    ? ` — ${args.left} more ${args.left === 1 ? 'page' : 'pages'} of the file went without the AI (${AI_PAGES.maxPages} per call)`
    : '';
  try {
    return await withTimeout(
      (async (): Promise<PageRoleResult> => {
        const ids = await inBatches(thumbs, 4, async (t) => ({
          t,
          id: pics ? await deps.upload(t.png!, `${args.fileName} page ${t.page + 1}`) : 0,
        }));
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
          return {
            status: 'unavailable',
            hints: [],
            note: 'AI page roles: not available on this server yet — pages judged by their geometry',
          };
        const res = await call;
        const hints = hintsOf(args.file, res, new Set(pages.map((p) => p.pageNo - 1)));
        return {
          status: 'ok',
          hints,
          note: `AI page roles: ${hints.length} of ${pages.length} pages read${more}`,
          cached: !!res.cached,
          ...(res.costUsd != null ? { costUsd: res.costUsd } : {}),
          ...(res.model ? { model: res.model } : {}),
        };
      })(),
      args.timeoutMs ?? PAGE_ROLE_TIMEOUT_MS,
    );
  } catch (e) {
    const timeout = e instanceof Timeout;
    return {
      status: timeout ? 'timeout' : 'error',
      hints: [],
      note: `AI page roles: ${timeout ? (e as Error).message : `unavailable (${e instanceof Error ? e.message : String(e)})`} — pages judged by their geometry`,
    };
  }
}
