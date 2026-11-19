import type { AdminSectionInfo, TeamMember } from 'api/proto-http/admin';
import { SpecialtiesField } from 'components/managers/accounts/components/specialties-field';
import { cn } from 'lib/utility';
import { type KeyboardEvent, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { FoldCaret, Form, SegmentedField, Text } from 'ui';
import { type Level, LEVELS, levelsOf, lineCan, lineOpens, summary } from './model';
import { PersonCross, PersonIdentity, PersonRole } from './person-parts';

// One person of the people block (fix mockup v4 `inline`): the line is who · role · summary ·
// caret · cross. An editor changes the role in the line and removes with the cross; opened, a
// member shows one none / read / write strip per section and your own line your specialties.

const LEVEL_ITEMS = LEVELS.map((l) => ({ value: l, label: l }));

/** who · role · summary · caret (a reader's line). */
const LINE =
  'grid w-full min-h-9 grid-cols-[minmax(0,1fr)_2.75rem_3.625rem_0.625rem] items-center gap-2 py-1.5 text-left md:grid-cols-[minmax(0,1fr)_6rem_4.5rem_0.75rem] md:gap-3';

/** who · role select · summary · caret · cross (an editor's line); on a phone who takes a row. */
const LINE_EDIT =
  'grid w-full min-h-9 grid-cols-[minmax(0,1fr)_5rem_3.625rem_0.625rem_1rem] items-center gap-x-2 gap-y-1.5 py-1.5 text-left max-md:[&>*:first-child]:col-span-full max-md:[&>*:nth-child(2)]:col-start-2 md:grid-cols-[minmax(0,1fr)_6rem_4.5rem_0.75rem_1rem] md:gap-x-3';

export function PersonLine({
  member,
  members,
  sections,
  specialties,
  editor,
  paused,
  open,
  onToggle,
  onRole,
  onExit,
  onAccess,
}: {
  member: TeamMember;
  members: TeamMember[];
  sections: AdminSectionInfo[];
  specialties?: string[];
  editor: boolean;
  paused: boolean;
  open: boolean;
  onToggle: () => void;
  onRole: (m: TeamMember, role: string) => void;
  onExit: (m: TeamMember) => void;
  onAccess: (m: TeamMember, levels: Record<string, Level>) => void;
}) {
  const can = lineCan(member, members, editor, paused);
  const opens = lineOpens(can, sections);
  const shown = opens && open;
  const sum = summary(member, sections);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onToggle();
  };

  return (
    <div className='border-hairline [&+&]:border-t'>
      <div
        className={cn(editor ? LINE_EDIT : LINE, opens && 'group/line cursor-pointer')}
        {...(opens
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': shown,
              onClick: onToggle,
              onKeyDown: onKey,
            }
          : {})}
      >
        <PersonIdentity member={member} specialties={specialties} />
        <PersonRole member={member} canRole={can.role} onRole={(r) => onRole(member, r)} />
        <span className={cn('whitespace-nowrap text-right', sum === 'full' && 'text-labelColor')}>
          {sum}
        </span>
        {opens ? <FoldCaret open={shown} className='ml-0' /> : <span />}
        {editor &&
          (can.exit ? <PersonCross member={member} onExit={() => onExit(member)} /> : <span />)}
      </div>
      {shown && (
        <div className='pb-3.5'>
          {can.self && (
            <div className='grid min-h-[2.125rem] grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 border-t border-hairline py-1 [&_*]:normal-case'>
              <Text component='span' variant='label' size='micro' className='pt-1'>
                specialties
              </Text>
              <SpecialtiesField username={member.username} specialties={specialties} editable />
            </div>
          )}
          {can.secs && sections.length > 0 && (
            <SectionGrid
              member={member}
              sections={sections}
              editor={editor}
              onAccess={(levels) => onAccess(member, levels)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One cell per section; an editor's strip writes the full set on every pick. */
function SectionGrid({
  member,
  sections,
  editor,
  onAccess,
}: {
  member: TeamMember;
  sections: AdminSectionInfo[];
  editor: boolean;
  onAccess: (levels: Record<string, Level>) => void;
}) {
  const values = useMemo(() => levelsOf(member, sections), [member, sections]);
  const form = useForm<Record<string, Level>>({ values });

  useEffect(() => {
    if (!editor) return;
    const sub = form.watch((v, { type }) => {
      if (type !== 'change') return;
      onAccess(v as Record<string, Level>);
    });
    return () => sub.unsubscribe();
  }, [editor, form, onAccess]);

  return (
    <Form {...form}>
      <div className='grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-x-6 pt-0.5'>
        {sections.map((s) => {
          const key = s.key ?? '';
          const word = s.title || key;
          return (
            <div
              key={key}
              className='grid min-h-[2.125rem] grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 border-t border-hairline py-1'
            >
              <Text component='span' variant='label' size='micro'>
                {word}
              </Text>
              {editor ? (
                <SegmentedField name={key} items={LEVEL_ITEMS} lowercase />
              ) : (
                <span className={cn(values[key] === 'none' && 'text-labelColor')}>
                  {values[key]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Form>
  );
}
