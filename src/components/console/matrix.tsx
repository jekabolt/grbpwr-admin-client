import type { FeatureInfo, PlatformTeam } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment, useState } from 'react';
import { Button, ConfirmationModal, EmptyCell, FoldCaret } from 'ui';
import { FeatureSquare } from './feature-square';
import { featureGroups, isReadOnly, shortDate, STATUS, usd } from './model';
import { TeamDetail } from './team-detail';
import { addressOf, useConsoleActions, useRequestEmails } from './use-console';

// Matrix grammar: a raw table so both the header rows and the team column stay put while the box
// scrolls either way. Every cell is opaque, or the sticky ones would show what slides under them.
// The phone (below md) folds the feature columns away: a team's switches live in its opened row.
const CELL = 'bg-bgColor border-b border-hairline';
const HEAD = 'sticky top-0 z-20 bg-bgColor border-b border-borderColor text-micro text-labelColor';
const TEAM = cn(
  'px-1.5 py-1 text-left align-middle',
  'md:sticky md:left-0 md:z-10 md:w-60 md:min-w-60 md:max-w-60 md:border-r md:border-borderColor',
);
const NUM = 'w-px whitespace-nowrap px-2 py-1 text-right tabular-nums md:px-3.5';
const DESK = 'hidden md:table-cell';
const GROUP_ROW =
  'bg-bgColor border-b border-borderColor pt-3.5 pb-1 px-1.5 text-left text-micro font-bold tracking-group text-labelColor';
const SUB = 'truncate text-micro tracking-label text-labelColor';

function GroupRow({ span, label }: { span: number; label: string }) {
  return (
    <tr data-group>
      <td colSpan={span} className={GROUP_ROW}>
        <span className='sticky left-1.5'>{label}</span>
      </td>
    </tr>
  );
}

export function Matrix({
  teams,
  requests,
  withTeams,
  catalog,
  teamOne,
  open,
  onOpen,
}: {
  teams: PlatformTeam[];
  requests: PlatformTeam[];
  /** false on the `requests` tab: only the waiting sign-ups show */
  withTeams: boolean;
  catalog: FeatureInfo[];
  teamOne: string;
  open: string;
  onOpen: (slug: string) => void;
}) {
  const act = useConsoleActions();
  const emails = useRequestEmails(requests.map((r) => r.slug ?? ''));
  const [declining, setDeclining] = useState<PlatformTeam | null>(null);
  const groups = featureGroups(catalog);
  const span = 4 + catalog.length;
  const first = new Set(groups.map((g) => g.items[0]?.key));

  return (
    <div className='@container md:max-h-[calc(100vh-13rem)] md:min-h-80 md:overflow-auto'>
      <table className='w-full border-separate border-spacing-0 tabular-nums'>
        <thead>
          <tr>
            <th rowSpan={2} className={cn(HEAD, TEAM, 'z-30 align-bottom font-normal')}>
              team
            </th>
            {['people', 'since', 'ai spend'].map((h) => (
              <th
                key={h}
                rowSpan={2}
                className={cn(
                  HEAD,
                  NUM,
                  'align-bottom font-normal',
                  h === 'since' && DESK,
                )}
              >
                {h}
              </th>
            ))}
            {groups.map((g) => (
              <th
                key={g.group}
                colSpan={g.items.length}
                className={cn(HEAD, DESK, 'h-6 border-l px-1.5 py-1 text-left font-bold')}
              >
                {g.group}
              </th>
            ))}
          </tr>
          <tr className='max-md:hidden'>
            {catalog.map((f) => (
              <th
                key={f.key}
                className={cn(
                  HEAD,
                  'top-6 min-w-[1.875rem] px-0 py-1.5 text-center align-bottom font-normal',
                  first.has(f.key) && 'border-l',
                )}
              >
                <span className='inline-block rotate-180 whitespace-nowrap leading-7 [writing-mode:vertical-rl]'>
                  {f.title}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {requests.length > 0 && <GroupRow span={span} label='requests' />}
          {requests.map((r) => {
            const slug = r.slug ?? '';
            const busy = act.approving(slug) || act.declining(slug);
            const who = (
              <div>
                <div className='break-words'>{r.name || slug}</div>
                <div className={SUB}>{addressOf(slug)}</div>
                <div className={SUB}>
                  {emails[slug] ?? <EmptyCell />} · {shortDate(r.createdAt)}
                </div>
              </div>
            );
            const approve = (
              <Button
                variant='main'
                className='whitespace-nowrap px-3 py-0.5'
                disabled={busy}
                onClick={() => act.approve(slug)}
              >
                approve
              </Button>
            );
            const decline = (
              <Button
                variant='underline'
                className='ml-auto text-labelColor'
                disabled={busy}
                onClick={() => setDeclining(r)}
              >
                decline
              </Button>
            );
            return (
              <Fragment key={slug}>
                <tr className='max-md:hidden'>
                  <td className={cn(CELL, TEAM)}>{who}</td>
                  <td colSpan={3} className={CELL} />
                  <td colSpan={catalog.length} className={cn(CELL, 'px-3 align-middle')}>
                    <div className='flex items-center gap-3'>
                      {approve}
                      {decline}
                    </div>
                  </td>
                </tr>
                <tr className='md:hidden'>
                  <td colSpan={span} className={cn(CELL, 'px-3 pb-3.5 pt-2.5')}>
                    <div className='flex flex-col gap-2'>
                      {who}
                      <div className='flex items-center gap-3'>
                        <Button
                          variant='main'
                          className='whitespace-nowrap px-4 py-2'
                          disabled={busy}
                          onClick={() => act.approve(slug)}
                        >
                          approve
                        </Button>
                        {decline}
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
          {requests.length > 0 && withTeams && <GroupRow span={span} label='teams' />}

          {withTeams &&
            teams.map((t) => {
              const slug = t.slug ?? '';
              const name = t.name || slug;
              const on = new Set(t.features ?? []);
              const isOpen = open === slug;
              const ro = isReadOnly(t);
              const preparing = t.status === STATUS.provisioning;
              const schema = t.schemaOk === false;
              const marks = (
                <>
                  {ro && <span className='text-error'>read only · </span>}
                  {preparing && <span>preparing · </span>}
                  {schema && <span className='text-error'>schema · </span>}
                </>
              );
              return (
                <Fragment key={slug}>
                  <tr className={cn('hover:[&>td]:bg-pageBg', isOpen && '[&>td]:bg-pageBg')}>
                    <td className={cn(CELL, TEAM)}>
                      <div className='flex min-w-0 items-center gap-2'>
                        <Button
                          className='min-w-0 text-left'
                          aria-expanded={isOpen}
                          onClick={() => onOpen(slug)}
                        >
                          <span className={cn('break-words', ro && 'text-labelColor')}>
                            {name}
                            <FoldCaret open={isOpen} />
                          </span>
                        </Button>
                        <Button
                          variant='underline'
                          className='ml-auto shrink-0 text-micro text-labelColor'
                          aria-label={`enter ${name}`}
                          disabled={act.entering(slug)}
                          onClick={() => act.enter(slug)}
                        >
                          enter
                        </Button>
                      </div>
                      <div className={cn(SUB, 'max-md:hidden')}>
                        {marks}
                        {addressOf(slug)}
                      </div>
                      {(ro || preparing || schema) && (
                        <div className={cn(SUB, 'md:hidden')}>
                          {[
                            ro && <span key='ro' className='text-error'>read only</span>,
                            preparing && <span key='p'>preparing</span>,
                            schema && <span key='s' className='text-error'>schema</span>,
                          ]
                            .filter(Boolean)
                            .flatMap((el, i) => (i ? [' · ', el] : [el]))}
                        </div>
                      )}
                    </td>
                    <td className={cn(CELL, NUM)}>{t.people ?? 0}</td>
                    <td className={cn(CELL, NUM, DESK)}>{shortDate(t.createdAt)}</td>
                    <td className={cn(CELL, NUM)}>{usd(t.aiSpendMonthUsd)}</td>
                    {catalog.map((f) => {
                      const key = f.key ?? '';
                      return (
                        <td
                          key={key}
                          className={cn(
                            CELL,
                            DESK,
                            'min-w-[1.875rem] p-0 align-middle',
                            first.has(key) && 'border-l border-l-borderColor',
                          )}
                        >
                          <FeatureSquare
                            name={`f-${slug}-${key}`}
                            cell
                            checked={on.has(key)}
                            locked={!!f.teamOneOnly}
                            label={`${f.title} · ${name}`}
                            onChange={(v) => act.toggleFeature(slug, key, v)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={span} className={cn(CELL, 'p-0 text-left')}>
                        <TeamDetail
                          team={t}
                          catalog={catalog}
                          teamOne={teamOne === slug}
                          onFeature={(key, v) => act.toggleFeature(slug, key, v)}
                          onReadOnly={(v) => act.toggleReadOnly(slug, v)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
        </tbody>
      </table>
      {declining && (
        <ConfirmationModal
          open
          width='sm'
          title={`decline ${declining.name || declining.slug}`}
          confirmLabel='decline'
          cancelLabel='cancel'
          onConfirm={() => act.decline(declining.slug ?? '')}
          onOpenChange={(v) => {
            if (!v) setDeclining(null);
          }}
        >
          {null}
        </ConfirmationModal>
      )}
    </div>
  );
}
