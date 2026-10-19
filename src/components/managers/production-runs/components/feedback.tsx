import {
  failureClassOfError,
  serverSentenceOf,
} from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { CalloutBox, Text } from 'ui';

/** A refusal of what was typed (400/412/404…) — it belongs in the form, not in the inbox. */
export const isRefusal = (e: unknown) => failureClassOfError(e) === 'refused';

/**
 * An error with no place on the page: inbox + toast. `detail` is the area's friendly sentence;
 * retry is offered only when the failure was transient.
 */
export function notifyFailure(
  subject: string,
  text: string,
  e: unknown,
  detail?: string,
  retry?: () => void,
) {
  notify({
    sev: 'error',
    subject,
    text,
    detail: detail ?? serverSentenceOf(e) ?? (e instanceof Error ? e.message : undefined),
    action:
      retry && failureClassOfError(e) === 'transient'
        ? { label: 'retry', onClick: retry }
        : undefined,
  });
}

/** The in-form line for a refusal or a failed check: `<verb> · <why>`, next to the control. */
export function FailNote({
  verb,
  text,
  className,
}: {
  verb: string;
  text: string | null;
  className?: string;
}) {
  if (!text) return null;
  return (
    <CalloutBox tone='error' className={className}>
      <Text size='micro' component='span' role='alert'>
        <b>{verb}</b> · {text}
      </Text>
    </CalloutBox>
  );
}
