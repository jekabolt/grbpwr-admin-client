import type {
  GetTechCardConstructionAuditResponse,
  TechCardAnalysisFinding,
} from 'api/proto-http/admin';

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
 * costing redaction, on the same pass as `seen`); counted here for a server that predates it.
 */
export function openFindingCount(
  res: Pick<GetTechCardConstructionAuditResponse, 'findings' | 'unseenCount'> | undefined,
): number {
  if (!res) return 0;
  if (typeof res.unseenCount === 'number') return res.unseenCount;
  return splitBySeen(res.findings).open.length;
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
