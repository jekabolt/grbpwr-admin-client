// THIN LOCAL STAND-IN for `manifest/` (owned by lane F6b, being written in parallel).
//
// It exists only so write/ and gate/ can run end to end before the lanes merge, and it goes
// through the declared contract types (`EmbedManifestFn`, `ReadManifestFn`) so swapping it for
// `manifest/` is a one-line import change in `write/index.ts` + `gate/pipeline.ts`. Format per
// 08-CONTRACT §3: before the first `0 SECTION`, one `999` pair per chunk:
//     999
//     GRBPWR-MANIFEST v1 <i>/<n> <base64 chunk ≤ 200 chars>
// UTF-8 JSON → base64. `read` returns null without a tag and THROWS on a corrupt one.
//
// ORCHESTRATOR: on merge, delete this file and import { embedManifest, readManifest } from
// '../manifest' instead (if F6b's wire format differs, theirs wins — nothing else here depends
// on the bytes).

import type { ConversionManifest, EmbedManifestFn, ReadManifestFn } from '../types';
import { MANIFEST_TAG, MANIFEST_VERSION, PATIMPORT } from '../types';

const LINE_RE = /^GRBPWR-MANIFEST v(\d+) (\d+)\/(\d+) ([A-Za-z0-9+/=]*)$/;

function b64encodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64decodeUtf8(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Remove a leading manifest comment block, if any. */
function stripLeading(dxfText: string): string {
  const lines = dxfText.split(/\r?\n/);
  let i = 0;
  while (
    i + 1 < lines.length &&
    lines[i].trim() === '999' &&
    lines[i + 1].startsWith(MANIFEST_TAG)
  ) {
    i += 2;
  }
  return i === 0 ? dxfText : lines.slice(i).join('\r\n');
}

export const embedManifestLocal: EmbedManifestFn = (dxfText, manifest) => {
  const body = stripLeading(dxfText);
  const b64 = b64encodeUtf8(JSON.stringify(manifest));
  const max = PATIMPORT.manifestLineMax;
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += max) chunks.push(b64.slice(i, i + max));
  if (!chunks.length) chunks.push('');
  const head = chunks
    .map((c, i) => `999\r\n${MANIFEST_TAG} v${MANIFEST_VERSION} ${i + 1}/${chunks.length} ${c}\r\n`)
    .join('');
  return head + body;
};

export const readManifestLocal: ReadManifestFn = (dxfText) => {
  const lines = dxfText.split(/\r?\n/);
  const parts: string[] = [];
  let n = -1;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '999') break;
    const v = lines[i + 1];
    if (!v.startsWith(MANIFEST_TAG)) break;
    const m = LINE_RE.exec(v.trimEnd());
    if (!m) throw new Error('GRBPWR manifest: malformed comment line');
    if (Number(m[1]) !== MANIFEST_VERSION) throw new Error(`GRBPWR manifest: unsupported v${m[1]}`);
    const idx = Number(m[2]);
    const total = Number(m[3]);
    if (n < 0) n = total;
    if (total !== n || idx !== parts.length + 1)
      throw new Error('GRBPWR manifest: chunks out of order');
    parts.push(m[4]);
  }
  if (n < 0) return null;
  if (parts.length !== n) throw new Error(`GRBPWR manifest: ${parts.length} of ${n} chunks`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64decodeUtf8(parts.join('')));
  } catch (e) {
    throw new Error(`GRBPWR manifest: corrupt payload (${e instanceof Error ? e.message : e})`);
  }
  const m = parsed as ConversionManifest;
  if (!m || typeof m !== 'object' || m.v !== MANIFEST_VERSION) {
    throw new Error('GRBPWR manifest: wrong version');
  }
  return m;
};
