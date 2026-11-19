import type { FeatureInfo, PlatformTeam } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment } from 'react';
import { Button, CheckboxCommon, EmptyCell, FoldCaret, Pill } from 'ui';
import { featureGroups, isReadOnly, onCount, shortDate, STATUS, usd } from './model';
import { TeamDetail } from './team-detail';
import { addressOf, useConsoleActions, useRequestEmails } from './use-console';

// Matrix grammar: a raw table so both the header rows and the team column stay put while the box
// scrolls either way. Every cell is opaque, or the sticky ones would show what slides under them.
const CELL = 'bg-bgColor border-b border-hairline';
const HEAD = 'sticky top-0 z-20 bg-bgColor border-b border-borderColor text-micro text-labelColor';
const STICKY = cn(
  'sticky left-0 z-10 border-r border-borderColor px-1.5 py-1 text-left align-middle',
  'min-w-[9.375rem] max-w-[9.375rem] md:min-w-[13.75rem] md:max-w-[21.25rem]',
);
const NUM = 'hidden w-px whitespace-nowrap px-3 py-1 text-right tabular-nums md:table-cell';
const GROUP_ROW =
  'bg-bgColor border-b border-borderColor pt-3.5 pb-1 px-1.5 text-left text-micro font-bold tracking-group text-labelColor';
const SUB = 'truncate text-micro tracking-label text-labelColor';

export function Matrix({
  teams,
  requests,
  deleted,
  catalog,
  teamOne,
  open,
  onOpen,
}: {
  teams: PlatformTeam[];
  requests: PlatformTeam[];
  /** deleted teams, last; they do not unfold */
  deleted: PlatformTeam[];
  catalog: FeatureInfo[];
  teamOne: string;
  open: string;
  onOpen: (slug: string) => void;
}) {
  const act = useConsoleActions();
  const emails = useRequestEmails(requests.map((r) => r.slug ?? ''));
  const groups = featureGroups(catalog);
  const span = 5 + catalog.length;
  const first = new Set(groups.map((g) => g.items[0]?.key));

  return (
    <div className='@container max-h-[calc(100vh-16.25rem)] min-h-80 overflow-auto md:max-h-[calc(100vh-14.375rem)]'>
      <table className='w-max min-w-full border-separate border-spacing-0 tabular-nums'>
        <thead>
          <tr>
            <th rowSpan={2} className={cn(HEAD, STICKY, 'z-30 align-bottom font-normal')}>
              team
            </th>
            {['people', 'since', 'on', 'ai spend'].map((h) => (
              <th key={h} rowSpan={2} className={cn(HEAD, NUM, 'align-bottom font-normal')}>
                {h}
              </th>
            ))}
            {groups.map((g) => (
              <th
                key={g.group}
                colSpan={g.items.length}
                className={cn(HEAD, 'h-6 border-l px-1.5 py-1 text-left font-bold')}
              >
                {g.group}
              </th>
            ))}
          </tr>
          <tr>
            {catalog.map((f) => (
              <th
                key={f.key}
                className={cn(
                  HEAD,
                  'top-6 w-7 min-w-7 px-0 py-1.5 text-center align-bottom font-normal',
                  first.has(f.key) && 'border-l',
                  f.defaultOn && 'text-textColor',
                )}
              >
                <span className='inline-block rotate-180 whitespace-nowrap leading-7 [writing-mode:vertical-rl]'>
                  {f.title}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        {requests.length > 0 && (
          <tbody>
            <tr data-group>
              <td colSpan={span} className={GROUP_ROW}>
                <span className='sticky left-1.5'>requests {requests.length}</span>
              </td>
            </tr>
            {requests.map((r) => {
              const slug = r.slug ?? '';
              return (
                <tr key={slug}>
                  <td className={cn(CELL, STICKY)}>
                    <div className='truncate'>{r.name}</div>
                    <div className={SUB}>{addressOf(slug)}</div>
                    <div className={SUB}>
                      {emails[slug] ?? <EmptyCell />} · {shortDate(r.createdAt)}
                    </div>
                  </td>
                  <td colSpan={4} className={cn(CELL, 'hidden md:table-cell')} />
                  <td colSpan={catalog.length} className={cn(CELL, 'px-1.5 align-middle')}>
                    <div className='flex items-center gap-3'>
                      <Button
                        variant='main'
                        className='whitespace-nowrap px-3 py-0.5'
                        disabled={act.approving(slug) || act.declining(slug)}
                        onClick={() => act.approve(slug)}
                      >
                        approve
                      </Button>
                      <Button
                        variant='underline'
                        disabled={act.approving(slug) || act.declining(slug)}
                        onClick={() => act.decline(slug)}
                      >
                        decline
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr data-group>
              <td colSpan={span} className={GROUP_ROW}>
                <span className='sticky left-1.5'>teams {teams.length}</span>
              </td>
            </tr>
          </tbody>
        )}

        <tbody>
          {teams.map((t) => {
            const slug = t.slug ?? '';
            const name = t.name || slug;
            const on = new Set(t.features ?? []);
            const isOpen = open === slug;
            const ro = isReadOnly(t);
            const n = onCount(t, catalog);
            const preparing = t.status === STATUS.provisioning;
            const tags =
              preparing || t.schemaOk === false ? (
                <>
                  {preparing && <Pill tone='attention'>preparing</Pill>}
                  {t.schemaOk === false && <Pill tone='warn'>schema</Pill>}
                </>
              ) : null;
            return (
              <Fragment key={slug}>
                <tr className='hover:[&>td]:bg-pageBg'>
                  <td className={cn(CELL, STICKY)}>
                    <div className='flex min-w-0 items-center gap-2'>
                      <Button
                        className='min-w-0 max-w-full text-left'
                        aria-expanded={isOpen}
                        onClick={() => onOpen(slug)}
                      >
                        <span className='flex min-w-0 items-center'>
                          <span className={cn('truncate', ro && 'text-labelColor')}>{name}</span>
                          <FoldCaret open={isOpen} />
                        </span>
                      </Button>
                      <span className='flex gap-1.5 max-md:hidden'>{tags}</span>
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
                    {tags && <div className='flex gap-1.5 md:hidden'>{tags}</div>}
                    <div className={SUB}>
                      {ro && <span className='text-error'>read only · </span>}
                      {addressOf(slug)}
                    </div>
                    <div className={cn(SUB, 'md:hidden')}>
                      {t.people ?? 0} · {shortDate(t.createdAt)} · {n} on · {usd(t.aiSpendMonthUsd)}
                    </div>
                  </td>
                  <td className={cn(CELL, NUM)}>{t.people ?? 0}</td>
                  <td className={cn(CELL, NUM)}>{shortDate(t.createdAt)}</td>
                  <td className={cn(CELL, NUM)}>{n}</td>
                  <td className={cn(CELL, NUM)}>{usd(t.aiSpendMonthUsd)}</td>
                  {catalog.map((f) => {
                    const key = f.key ?? '';
                    return (
                      <td
                        key={key}
                        className={cn(
                          CELL,
                          'w-7 min-w-7 px-0 py-2 align-middle',
                          first.has(key) && 'border-l border-l-borderColor',
                        )}
                      >
                        <div className='flex justify-center'>
                          <CheckboxCommon
                            name={`f-${slug}-${key}`}
                            role='switch'
                            checked={on.has(key)}
                            disabled={f.teamOneOnly}
                            aria-label={`${f.title} · ${name}`}
                            className='hover:border-textColor data-[state=checked]:border-textColor disabled:cursor-not-allowed'
                            onChange={(v: boolean) => act.toggleFeature(slug, key, v)}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={span} className={cn(CELL, 'p-0 text-left')}>
                      <TeamDetail
                        team={t}
                        teamOne={teamOne === slug}
                        onReadOnly={(v) => act.toggleReadOnly(slug, v)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {deleted.map((t) => {
            const slug = t.slug ?? '';
            return (
              <tr key={slug}>
                <td className={cn(CELL, STICKY)}>
                  <div className='flex min-w-0 items-baseline gap-2'>
                    <span className='truncate text-labelColor'>{t.name || slug}</span>
                    <span className='shrink-0 text-error'>deleted</span>
                    <span className='shrink-0 text-labelColor'>{shortDate(t.purgeAt)}</span>
                  </div>
                </td>
                <td className={cn(CELL, NUM, 'text-labelColor')}>{t.people ?? 0}</td>
                <td colSpan={3} className={cn(CELL, 'hidden md:table-cell')} />
                <td colSpan={catalog.length} className={cn(CELL, 'px-1.5 align-middle')}>
                  <Button
                    variant='underline'
                    aria-label={`restore ${t.name || slug}`}
                    disabled={act.restoring(slug)}
                    onClick={() => act.restore(slug)}
                  >
                    restore
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
