import { notify } from 'lib/stores/store';

/** A refused gesture of an editor (key, drag, toolbar): no field holds the answer, so it goes to the inbox. */
export function refuseGesture(subject: string, text: string, detail: string) {
  notify({ sev: 'error', subject, text, detail });
}
