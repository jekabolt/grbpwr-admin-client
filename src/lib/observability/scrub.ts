// What leaves the tab. The admin API takes email=, q=, search= and name= as GET query parameters
// and admin pages keep their filters in the query string, so a URL can carry a customer's address
// or search text: every URL loses its query and fragment, and every email address is masked.
// It runs on the envelope at the transport, the one point every event, replay event and replay
// recording passes (event processors never see the recording's page URL or DOM snapshot).

import type { makeFetchTransport } from '@sentry/react';

type Envelope = Parameters<ReturnType<typeof makeFetchTransport>['send']>[0];

// Bounded parts: recordings hold long base64 and CSS strings, and an unbounded local part would
// backtrack quadratically over them.
const EMAIL = /[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
// A whole string that is one URL: absolute, or a path (not a "/*" CSS comment).
const WHOLE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/(?![*/]))\S*$/i;
// An absolute URL inside free text (an error message quoting a request).
const URL_IN_TEXT = /\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g;
const MAX_DEPTH = 200;

function scrubString(s: string, freeText: boolean): string {
  let out = WHOLE_URL.test(s) ? s.replace(/[?#].*$/, '') : s;
  if (freeText) out = out.replace(URL_IN_TEXT, '$1');
  return out.includes('@') || out.includes('%40') ? out.replace(EMAIL, '[email]') : out;
}

function walk(value: unknown, freeText: boolean, depth: number): unknown {
  if (typeof value === 'string') return scrubString(value, freeText);
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const before = obj[key];
    const after = walk(before, freeText, depth + 1);
    if (after !== before) obj[key] = after;
  }
  return value;
}

type Item = [Record<string, unknown>, unknown];

// A replay recording is `{"segment_id":n}\n` and a JSON array of rrweb events (uncompressed: see
// useCompression in ./sentry). DOM text is already masked; this reaches page URLs and attributes.
function scrubRecording(payload: string): string {
  const cut = payload.indexOf('\n');
  const events = walk(JSON.parse(payload.slice(cut + 1)), false, 0);
  return `${payload.slice(0, cut + 1)}${JSON.stringify(events)}`;
}

function scrubItem([headers, payload]: Item): Item | null {
  if (headers.type !== 'replay_recording') return [headers, walk(payload, true, 0)];
  // A compressed (binary) recording cannot be read, so it cannot leave.
  if (typeof payload !== 'string') return null;
  const scrubbed = scrubRecording(payload);
  return [{ ...headers, length: new TextEncoder().encode(scrubbed).length }, scrubbed];
}

/** Every item of an outgoing envelope; an item that cannot be scrubbed is dropped, not sent. */
export function scrubEnvelope(envelope: Envelope): Envelope {
  const [headers, items] = envelope as unknown as [unknown, Item[]];
  const kept: Item[] = [];
  for (const item of items) {
    try {
      const out = scrubItem(item);
      if (out) kept.push(out);
    } catch {
      /* dropped */
    }
  }
  return [headers, kept] as unknown as Envelope;
}
