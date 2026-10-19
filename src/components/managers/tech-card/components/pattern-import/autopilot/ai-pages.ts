// A9 · the pages the clean stage set aside on the AI (≥ 0.85, a non-pattern role) AND the page's
// geometry — with no question asked. Under D5 each is a STRONG assumption of an autopilot run (a
// page holding line work left out without a click), recorded with the autopilot's first answer
// (policy.ts) and, when it answered nothing, with the write (use-import-session.ts). Undone like
// any page role: "read as tile".
import type { ImportSession } from 'lib/pattern-import/types';
import { aiWords } from 'lib/pattern-import/clean/page-roles';
import type { Assumption } from './types';

export function aiAsideAssumptions(
  s: Pick<ImportSession, 'clean' | 'files'>,
  have: readonly Assumption[],
): Assumption[] {
  const known = new Set(have.filter((a) => a.kind === 'pages-as-read').map((a) => a.ref));
  return (s.clean?.dropped ?? []).flatMap((d): Assumption[] => {
    const ref = `${d.file}:${d.page}`;
    if (!d.aiAside || !d.ai || known.has(ref)) return [];
    const name = s.files.find((f) => f.id === d.file)?.name ?? `file ${d.file}`;
    return [
      {
        step: 'files',
        kind: 'pages-as-read',
        subject: `${name} · page ${d.page + 1}`,
        answer: `set aside (${d.cls})`,
        rule: 'the AI (≥ 0.85, not pattern) and an exclusionary geometric fact agree',
        evidence: [`AI: ${aiWords(d.ai)}`, ...d.ai.evidence.slice(0, 1), d.exclusion ?? '']
          .filter(Boolean)
          .map((e) => e.slice(0, 160)),
        confidence: Math.round(d.ai.confidence * 100) / 100,
        strong: true,
        value: { file: +d.file, page: d.page, as: `set aside (${d.cls})` },
        ref,
      },
    ];
  });
}
