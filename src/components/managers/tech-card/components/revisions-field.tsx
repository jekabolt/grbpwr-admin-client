import { common_TechCardRevision } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';

// Auto-journal (Q1/§2.1): who / what / when across the card's significant transitions. This is a
// READ-ONLY server-stamped log now — the old free-text "add revision" editor is gone. Entries are
// appended by the backend (create / update / approved / released / role_assigned / reverted …) and
// arrive on common_TechCard.revisions. This is NOT fit history — fitting verdicts live in fittings.

// action / section arrive as lower_snake enum strings; render them as readable chips.
function humanize(v?: string): string {
  return (v || '').replace(/_/g, ' ').trim();
}

export function RevisionsField({ revisions }: { revisions?: common_TechCardRevision[] }) {
  const rows = revisions ?? [];
  if (rows.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        no revisions yet — the journal fills automatically as the card is created, edited, approved
        and released.
      </Text>
    );
  }

  // Newest first — the server appends chronologically; a changelog reads best most-recent-on-top.
  const ordered = [...rows].reverse();

  return (
    <div className='flex flex-col gap-1'>
      {ordered.map((r, i) => (
        <div
          key={i}
          className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border border-textInactiveColor p-2'
        >
          <Text variant='uppercase' size='small'>
            {humanize(r.action) || 'updated'}
          </Text>
          {r.section && humanize(r.section) !== 'other' ? (
            <Text variant='inactive' size='small'>
              · {humanize(r.section)}
            </Text>
          ) : null}
          <Text variant='inactive' size='small' className='ml-auto'>
            {r.author || '—'} · {formatTechCardDate(r.createdAt || r.revisionDate)}
          </Text>
          {r.changeNote ? (
            <Text size='small' className='w-full'>
              {r.changeNote}
            </Text>
          ) : null}
        </div>
      ))}
    </div>
  );
}
