import type {
  GetTechCardConstructionAuditResponse,
  TechCardAnalysisFinding,
} from 'api/proto-http/admin';
import {
  assignFindingKeys,
  findingFingerprint,
  isClientFindingCode,
  isValidFindingKey,
} from './finding-key.ts';

// «SEEN» MARKS ON MACHINE FINDINGS (SetTechCardFindingSeen). Not every finding has to be fixed; a
// seen one leaves the count and the list until its text changes — the server decides that by the
// fingerprint and sends `seen` already resolved. This module is the client's whole share of the
// rule: split, count, and say who saw it. Pure, so scripts/finding-seen-check.ts can run it.

const FINGERPRINT = /^[0-9a-f]{16}$/;

/**
 * Whether a finding can carry a mark at all: a machine finding from a server that mints keys. A
 * model finding, or one from a server older than the marks, has no key and keeps no control.
 */
export function canMarkSeen(f: TechCardAnalysisFinding): boolean {
  return !!(f.key ?? '').trim() && FINGERPRINT.test(f.fingerprint ?? '');
}

/** True only for a mark the server matched against the CURRENT text. */
export function isSeen(f: TechCardAnalysisFinding): boolean {
  return f.seen === true && canMarkSeen(f);
}

export type SeenSplit = {
  /** Unseen findings, in the server's order — what the list, the header and the PDF count. */
  open: TechCardAnalysisFinding[];
  /** Seen findings, in the server's order — hidden until the reader asks for them. */
  seen: TechCardAnalysisFinding[];
};

export function splitBySeen(findings: readonly TechCardAnalysisFinding[] | undefined): SeenSplit {
  const open: TechCardAnalysisFinding[] = [];
  const seen: TechCardAnalysisFinding[] = [];
  for (const f of findings ?? []) (isSeen(f) ? seen : open).push(f);
  return { open, seen };
}

/**
 * The number every badge shows. The server's `unseen_count` when it sent one (it counts after the
 * costing redaction, on the same pass as `seen`); counted here for a server that predates it. Plus
 * the unseen CLIENT findings (resolveClientFindings), which the server never counts.
 */
export function openFindingCount(
  res: Pick<GetTechCardConstructionAuditResponse, 'findings' | 'unseenCount'> | undefined,
  clientFindings: readonly TechCardAnalysisFinding[] = [],
): number {
  const client = splitBySeen(clientFindings).open.length;
  if (!res) return client;
  if (typeof res.unseenCount === 'number') return res.unseenCount + client;
  return splitBySeen(res.findings).open.length + client;
}

// ─── CLIENT FINDINGS ───────────────────────────────────────────────────────────────────────────
//
// Findings the BROWSER computes — the PDF gaps (pdf_*), the assembly-schema checks — join the same
// list, the same «seen» marks and the same count. The server stores their marks without being able
// to recompute them and hands them back in `seenMarks`; the match (key AND fingerprint) is made here.

/** One finding computed in the browser. `code` is snake_case in a client namespace: pdf_*, asm_*. */
export type ClientFinding = {
  /** Stable kind, e.g. 'pdf_sa_missing', 'asm_edge_missing'. Renaming it un-sees its marks. */
  code: string;
  /** Sigils it points at: 'op:12', 'seam:<seam_key>', 'unit:<key>', 'piece:<name>', 'card'. */
  refs?: string[];
  /** Tells apart two findings of one code on the same refs. */
  subject?: string;
  title: string;
  detail?: string;
  /** Default 'warning'. */
  severity?: string;
  /** Rendered as a chip, e.g. 'pdf_gaps'. */
  category?: string;
  suggestion?: string;
};

type AuditMarks = Pick<GetTechCardConstructionAuditResponse, 'seenMarks' | 'operationFingerprints'>;

/**
 * Client findings as audit findings: key and fingerprint minted like the server's, `seen` / who /
 * when from the stored mark when key and fingerprint both match. Without the audit (not loaded,
 * failed) every one is unseen. A code outside pdf_* / asm_* gets no key — shown, never markable
 * (the server refuses its mark).
 */
export function resolveClientFindings(
  findings: readonly ClientFinding[] | undefined,
  audit: AuditMarks | undefined,
): TechCardAnalysisFinding[] {
  const list = findings ?? [];
  if (list.length === 0) return [];
  const opFingerprints = audit?.operationFingerprints;
  const keys = assignFindingKeys(
    list.map((f) => (isClientFindingCode(f.code) ? f : { ...f, code: '' })),
    opFingerprints,
  );
  const marks = new Map((audit?.seenMarks ?? []).map((m) => [m.key ?? '', m]));
  return list.map((f, i) => {
    const key = isValidFindingKey(keys[i]) ? keys[i] : '';
    const fingerprint = key
      ? findingFingerprint(f.title, f.detail ?? '', f.refs, opFingerprints)
      : '';
    const mark = key ? marks.get(key) : undefined;
    const seen = !!mark && mark.fingerprint === fingerprint;
    return {
      source: 'client',
      severity: f.severity ?? 'warning',
      category: f.category ?? '',
      title: f.title,
      detail: f.detail ?? '',
      evidence: [],
      refs: f.refs ?? [],
      insertAfter: '',
      suggestion: f.suggestion ?? '',
      confidence: '',
      code: f.code,
      key,
      fingerprint,
      seen,
      seenBy: seen ? mark?.seenBy : undefined,
      seenAt: seen ? mark?.seenAt : undefined,
    };
  });
}

/** «anna · 26 Oct 2026, 09:30» — the title of a seen row. */
export function seenByLine(f: TechCardAnalysisFinding, locale = 'en-GB'): string {
  const who = (f.seenBy ?? '').trim() || 'unknown';
  const at = f.seenAt ? new Date(f.seenAt) : null;
  if (!at || Number.isNaN(at.getTime())) return `seen · ${who}`;
  const when = at.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `seen · ${who} · ${when}`;
}
