/** One-shot action on a notification (RETRY, OPEN, UNDO). The toast runs it and closes. */
export interface NotifyAction {
  label: string;
  onClick: () => void;
}

/** The `showMessage` name for the same pair. */
export type AlertAction = NotifyAction;

/** done · partly failed · failed · in progress */
export type NotifySev = 'ok' | 'warn' | 'error' | 'job';

export interface NotifyInput {
  sev: NotifySev;
  /** UPPERCASE noun shown first: 'MEDIA', 'ORDER 1042'. Empty for `showMessage` calls. */
  subject: string;
  /** The result: 'uploaded 12', 'not saved'. */
  text: string;
  /** The problem, red: '3 of 12 failed'. */
  bad?: string;
  /** Long server sentence: toast line 2 when there is no `bad`; always kept in the inbox. */
  detail?: string;
  action?: NotifyAction;
  /** Same key = update in place (job progress → done). */
  key?: string;
  /** 0..1, job only; undefined = indeterminate. */
  progress?: number;
}

export interface NotifyOptions {
  /** false = inbox only, no toast. Default true. */
  toast?: boolean;
}

export type NotifyPatch = Partial<Omit<NotifyInput, 'key'>>;

/** A toast on screen. */
export interface Toast extends NotifyInput {
  key: string;
  /** Monotonic, never `Date.now()`: a burst inside one millisecond must not share a React key. */
  id: number;
  /** Identical repeats while this toast is up, shown as ×N. */
  count: number;
  /** Bumped on every repeat or update; restarts the timer. */
  nonce: number;
  /** Activity stamp, bumped on repeats too: eviction order is "least recently reported". */
  seq: number;
  /** One-line form for copying. */
  message: string;
}

/** Inbox entry: errors, partial failures and jobs. Receipts (`ok`) never land here. */
export interface NotifyEntry extends NotifyInput {
  key: string;
  count: number;
  /** Epoch ms of the last change. */
  at: number;
  unread: boolean;
  message: string;
}

export interface SnackBarStore {
  /** Live toasts, oldest first, at most 4. */
  toasts: Toast[];
  /** Session inbox, newest first, at most 50. */
  history: NotifyEntry[];
  unread: number;
  /** An unread error or partial failure. */
  unreadError: boolean;
  notify: (input: NotifyInput, opts?: NotifyOptions) => string;
  updateNotify: (key: string, patch: NotifyPatch, opts?: NotifyOptions) => void;
  dismissToast: (id: number) => void;
  dismissAllToasts: () => void;
  markAllRead: () => void;
  clearHistory: () => void;
  /** Adapter for the pre-`notify` call sites; signature frozen. */
  showMessage: (message: string, severity: 'success' | 'error', action?: AlertAction) => void;
}
