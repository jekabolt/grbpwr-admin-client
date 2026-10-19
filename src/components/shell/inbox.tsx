import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { useInboxOpen } from 'lib/stores/inbox-open';
import { useSnackBarStore } from 'lib/stores/store';
import { NotifyEntry, NotifySev } from 'lib/stores/store-types';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { Button, Drawer, GenericPopover, Progress } from 'ui';

const GLYPH: Record<Exclude<NotifySev, 'job'>, string> = { ok: '✓', warn: '⚠', error: '⊗' };
const SEV_WORD: Record<NotifySev, string> = {
  ok: 'done',
  warn: 'partly failed',
  error: 'failed',
  job: 'in progress',
};
const isBad = (sev: NotifySev) => sev === 'error' || sev === 'warn';

/** Short relative time: now · 5m · 3h · 2d. */
function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Header `inbox N`: desktop panel under the button, phone bottom sheet. */
export function Inbox() {
  const phone = useMediaQuery(PHONE_QUERY);
  const { open, setOpen } = useInboxOpen();
  const history = useSnackBarStore((s) => s.history);
  const unread = useSnackBarStore((s) => s.unread);
  const unreadError = useSnackBarStore((s) => s.unreadError);
  const markAllRead = useSnackBarStore((s) => s.markAllRead);
  const clearHistory = useSnackBarStore((s) => s.clearHistory);
  const dismissAllToasts = useSnackBarStore((s) => s.dismissAllToasts);
  /* Rows unread when the inbox opened (or arrived while open): marked read at once, still lit. */
  const [lit, setLit] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (open) dismissAllToasts();
    else setLit(new Set());
  }, [open, dismissAllToasts]);

  useEffect(() => {
    if (!open) return;
    const fresh = history.filter((h) => h.unread).map((h) => h.key);
    if (fresh.length === 0) return;
    setLit((prev) => new Set([...prev, ...fresh]));
    markAllRead();
  }, [open, history, markAllRead]);

  const name = unread > 0 ? `inbox, ${unread} unread` : 'inbox';
  const label = (
    <span
      data-inbox-button=''
      className={cn(
        'flex items-center gap-1 px-2 underline-offset-2 hover:underline hover:opacity-70',
        unreadError && 'text-error',
      )}
    >
      inbox
      {unread > 0 ? <span className='tabular-nums'>{unread}</span> : null}
    </span>
  );

  const clear =
    history.length > 0 ? (
      <Button variant='underline' size='xs' onClick={clearHistory} data-inbox-clear=''>
        clear
      </Button>
    ) : null;
  const list = <InboxList history={history} lit={lit} close={() => setOpen(false)} />;

  if (phone) {
    return (
      <>
        <Button onClick={() => setOpen(true)} aria-label={name} className='cursor-pointer'>
          {label}
        </Button>
        <Drawer
          side='bottom'
          open={open}
          onOpenChange={setOpen}
          title='inbox'
          footer={clear ?? undefined}
        >
          {list}
        </Drawer>
      </>
    );
  }

  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      openElement={label}
      triggerProps={{ 'aria-label': name }}
      title='inbox'
      noTail
      className='w-85 max-w-[calc(100vw-1rem)]'
      contentProps={{ align: 'end', sideOffset: 6 }}
    >
      <div data-inbox=''>
        {list}
        {clear ? <div className='flex justify-end pt-1.5'>{clear}</div> : null}
      </div>
    </GenericPopover>
  );
}

function InboxList({
  history,
  lit,
  close,
}: {
  history: NotifyEntry[];
  lit: ReadonlySet<string>;
  close: () => void;
}) {
  /* Re-read the clock while open so `now` turns into `1m`. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (history.length === 0) {
    return (
      <div className='py-6 text-center text-micro uppercase tracking-label text-labelColor'>
        nothing
      </div>
    );
  }
  return (
    <ul data-inbox-list=''>
      {history.map((h) => (
        <InboxRow key={h.key} entry={h} lit={lit.has(h.key)} now={now} close={close} />
      ))}
    </ul>
  );
}

function InboxRow({
  entry,
  lit,
  now,
  close,
}: {
  entry: NotifyEntry;
  lit: boolean;
  now: number;
  close: () => void;
}) {
  const { sev, subject, text, bad, detail, action, count, progress, at, message } = entry;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <li
      data-inbox-row=''
      data-inbox-sev={sev}
      className={cn(
        'flex items-start gap-2 border-b border-l-2 border-b-hairline border-l-transparent py-2 pr-0.5 pl-1.5 text-textBaseSize last:border-b-0',
        lit && (isBad(sev) ? 'border-l-error' : 'border-l-textColor'),
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'flex h-4 w-3.5 shrink-0 items-center justify-center font-bold',
          isBad(sev) && 'text-error',
        )}
      >
        {sev === 'job' ? (
          <span className='size-2.5 animate-spin border-2 border-current border-r-transparent motion-reduce:animate-none' />
        ) : (
          GLYPH[sev]
        )}
      </span>
      <span className='sr-only'>{SEV_WORD[sev]}</span>

      <div className='flex min-w-0 flex-1 flex-col gap-0.5 leading-4'>
        <div className='break-words'>
          {subject ? (
            <b className='mr-1.5 text-micro font-bold uppercase tracking-label'>{subject}</b>
          ) : null}
          {text}
          {count > 1 ? <span className='tabular-nums text-labelColor'>{` ×${count}`}</span> : null}
        </div>
        {bad ? <div className='break-words text-error'>{bad}</div> : null}
        {detail ? (
          <div className='select-text whitespace-pre-wrap break-words text-labelColor'>
            {detail}
          </div>
        ) : null}
        {sev === 'job' ? (
          progress === undefined ? (
            <div aria-hidden='true' className='relative mt-1 h-0.5 overflow-hidden bg-hairline'>
              <span className='absolute inset-y-0 left-0 w-1/3 animate-[toastShuttle_1.2s_linear_infinite] bg-textColor motion-reduce:animate-none' />
            </div>
          ) : (
            <Progress value={progress * 100} className='mt-1 h-0.5' />
          )
        ) : null}
        {isBad(sev) || action ? (
          <div className='flex gap-1 pt-0.5'>
            {action ? (
              <Button
                variant='underline'
                size='xs'
                data-inbox-action=''
                className='-ml-1.5 font-bold'
                onClick={() => {
                  close();
                  action.onClick();
                }}
              >
                {action.label}
              </Button>
            ) : null}
            {isBad(sev) ? (
              <Button
                variant='underline'
                size='xs'
                data-inbox-copy=''
                className={cn('text-labelColor', !action && '-ml-1.5')}
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(message)
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
              >
                {copied ? 'copied' : 'copy'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <time
        dateTime={new Date(at).toISOString()}
        className='shrink-0 text-micro tabular-nums text-labelColor'
      >
        {ago(at, now)}
      </time>
    </li>
  );
}
