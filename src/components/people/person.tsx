import { Avatar, PersonName } from 'ui';
import { swapMentions, usePeopleDirectory } from './directory';

// A person drawn from the directory by handle: the photo circle (initials without one) and the
// name with the quiet @username. Screens pass the handle the record holds and nothing else.

export function PersonAvatar({
  handle,
  size = 20,
  title,
  className,
}: {
  handle: string | undefined;
  size?: number;
  title?: string;
  className?: string;
}) {
  const { who } = usePeopleDirectory();
  const p = who(handle);
  if (!p.handle) return <Avatar name='' size={size} title={title} className={className} />;
  return (
    <Avatar
      name={p.label.replace(/^@/, '')}
      src={p.avatarUrl || undefined}
      size={size}
      title={title ?? p.label}
      className={className}
    />
  );
}

export function PersonLabel({
  handle,
  short,
  className,
}: {
  handle: string | undefined;
  short?: boolean;
  className?: string;
}) {
  const { who } = usePeopleDirectory();
  const p = who(handle);
  return (
    <PersonName
      name={p.name}
      username={p.username}
      fallback={p.handle}
      short={short}
      className={className}
    />
  );
}

/** Text with `@handle` mentions shown as the person's current `@username`. */
export function MentionText({ text }: { text: string }) {
  const { byHandle } = usePeopleDirectory();
  return <>{swapMentions(text, byHandle)}</>;
}
