import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MEDIA_PROXY_ALLOWED_HOSTS,
  mediaProxyAllowedHosts,
  validateMediaUrl,
} from '../api/media-proxy.js';

test('accepts only the built-in CDN and Spaces origin over default-port HTTPS', () => {
  for (const host of DEFAULT_MEDIA_PROXY_ALLOWED_HOSTS) {
    const url = validateMediaUrl(`https://${host}:443/path/file.dxf?signature=a%2Fb`);
    assert.equal(url?.hostname, host);
    assert.equal(url?.port, '');
  }
});

test('rejects SSRF host tricks, credentials, non-HTTPS, and non-default ports', () => {
  const rejected = [
    'http://files.grbpwr.com/image.webp',
    'https://files.grbpwr.com.evil.example/image.webp',
    'https://sub.files.grbpwr.com/image.webp',
    'https://user:pass@files.grbpwr.com/image.webp',
    'https://@files.grbpwr.com/image.webp',
    'https://files.grbpwr.com:444/image.webp',
    'https://files.grbpwr.com./image.webp',
    'https://127.0.0.1/image.webp',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
  ];

  for (const rawUrl of rejected) assert.equal(validateMediaUrl(rawUrl), null, rawUrl);
});

test('environment allowlist replaces defaults and remains exact-host only', () => {
  const allowedHosts = mediaProxyAllowedHosts(' MEDIA.EXAMPLE.COM,patterns.example.com ');

  assert.ok(validateMediaUrl('https://media.example.com/a.webp', allowedHosts));
  assert.ok(validateMediaUrl('https://patterns.example.com/a.dxf', allowedHosts));
  assert.equal(validateMediaUrl('https://files.grbpwr.com/a.webp', allowedHosts), null);
  assert.equal(validateMediaUrl('https://sub.media.example.com/a.webp', allowedHosts), null);
});
