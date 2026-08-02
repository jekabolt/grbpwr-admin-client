import { common_TechCardRevision } from 'api/proto-http/admin';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';

// Auto-journal (Q1/§2.1): who / what / when across the card's significant transitions. This is a
// READ-ONLY server-stamped log now — the old free-text "add revision" editor is gone. Entries are
// appended by the backend (create / update / approved / released / role_assigned / reverted …) and
// arrive on common_TechCard.revisions. This is NOT fit history — fitting verdicts live in fittings.
//
// Deliberately a FLAT newest-first list of rows: grouping by day and filtering with diffs were the
// two options this pick did not take. Do not add them here.

// action / section arrive as lower_snake enum strings; render them as readable chips.
function humanize(v?: string): string {
  return (v || '').replace(/_/g, ' ').trim();
}

// green = a gate was passed · red = something was undone · grey = a routine edit.
function actionTone(action?: string): 'ok' | 'warn' | 'mut' {
  const a = (action || '').toLowerCase();
  if (a.includes('approve') || a.includes('release')) return 'ok';
  if (a.includes('revert') || a.includes('reject') || a.includes('delete')) return 'warn';
  return 'mut';
}

export function RevisionsField({ revisions }: { revisions?: common_TechCardRevision[] }) {
  const rows = revisions ?? [];

  // Newest first — the server appends chronologically; a changelog reads best most-recent-on-top.
  const ordered = [...rows].reverse();

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor p-3'>
      <SectionHeader
        title='auto-journal'
        question='— server-stamped, newest first; the only record of who changed what'
      />
      {ordered.length === 0 ? (
        <Text size='micro' variant='label'>
          no revisions yet — the journal fills automatically as the card is created, edited,
          approved and released.
        </Text>
      ) : (
        ordered.map((r, i) => {
          const section = r.section && humanize(r.section) !== 'other' ? humanize(r.section) : '';
          return (
            <Row
              key={i}
              label={
                <span className='flex flex-col gap-0.5'>
                  <span className='flex flex-wrap items-center gap-1.5'>
                    <Pill tone={actionTone(r.action)}>{humanize(r.action) || 'updated'}</Pill>
                    <Text size='micro' component='span'>
                      {[section, r.author || '—'].filter(Boolean).join(' · ')}
                    </Text>
                  </span>
                  {r.changeNote ? (
                    <Text size='micro' variant='label' component='span'>
                      {r.changeNote}
                    </Text>
                  ) : null}
                </span>
              }
              value={
                <Text size='micro' variant='label' component='span'>
                  {formatTechCardDate(r.createdAt)}
                </Text>
              }
            />
          );
        })
      )}
    </div>
  );
}
